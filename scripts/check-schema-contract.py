#!/usr/bin/env python3
"""Verify the schema.org contract of the built site (T46).

Three things have to hold at once, and a green validator only covers the first:

1. every JSON-LD node is valid against the schema.org vocabulary — the types
   and properties exist, each property is allowed on the type it sits on, and
   each value matches the property's range;
2. every page carries exactly the nodes it is supposed to carry — the fixture
   `tests/fixtures/schema-contract.json` states them page by page, so a
   publication silently losing its BlogPosting, or a page growing a node
   nobody asked for, fails here;
3. the machine-readable list agrees with the visible one: the publications
   embedded in a section/tag node are the same links, in the same order, that
   the HTML list shows.

The vocabulary lives in `tests/fixtures/schema-org-vocabulary.json` (refresh it
with scripts/fetch-schema-vocabulary.py), so this check needs no network.

    hugo build --gc --minify --panicOnWarning --environment preview
    python3 scripts/check-schema-contract.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://alexandr-sidorenko.me"
JSON_LD_KEYS = {"@context", "@type", "@id"}
DATE_TYPES = {"Date", "DateTime"}
LITERAL_TYPES = {"Text", "URL", "Number", "Integer", "Float", "Boolean"} | DATE_TYPES
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$")


class PageParser(HTMLParser):
    """Collects the page's JSON-LD blocks and the links of its visible list."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self.list_links: list[str] = []
        self._in_ld = False
        self._list_title_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "script" and attributes.get("type") == "application/ld+json":
            self._in_ld = True
            self.blocks.append("")
        elif tag == "h2" and "dc-list__title" in (attributes.get("class") or ""):
            self._list_title_depth = 1
        elif tag == "a" and self._list_title_depth:
            self.list_links.append(attributes.get("href") or "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._in_ld = False
        elif tag == "h2":
            self._list_title_depth = 0

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self.blocks[-1] += data


class Vocabulary:
    def __init__(self, data: dict) -> None:
        self.classes: dict[str, list[str]] = data["classes"]
        self.properties: dict[str, dict[str, list[str]]] = data["properties"]

    def ancestors(self, type_name: str) -> set[str]:
        seen: set[str] = set()
        queue = [type_name]
        while queue:
            current = queue.pop()
            if current in seen or current not in self.classes:
                continue
            seen.add(current)
            queue.extend(self.classes[current])
        return seen

    def is_a(self, type_name: str, expected: str) -> bool:
        return expected in self.ancestors(type_name)


def canonical(url: str) -> bool:
    """The site publishes one URL form: absolute, no trailing slash except the
    root (ADR redesign-canonical-url-policy, T56)."""
    if not url.startswith(f"{ORIGIN}/"):
        return False
    path = urlsplit(url).path
    return path == "/" or not path.endswith("/")


def value_errors(vocab: Vocabulary, where: str, prop: str, value, node_types: list[str]) -> list[str]:
    ranges = set(vocab.properties[prop]["range"])
    errors: list[str] = []

    if isinstance(value, list):
        for index, item in enumerate(value):
            errors += value_errors(vocab, f"{where}[{index}]", prop, item, node_types)
        return errors

    if isinstance(value, dict):
        nested = value.get("@type")
        if not nested:
            return [f"{where}: вложенный объект без @type"]
        if nested not in vocab.classes:
            return [f"{where}: неизвестный тип {nested!r}"]
        if not any(vocab.is_a(nested, allowed) for allowed in ranges):
            errors.append(
                f"{where}: тип {nested!r} не входит в range свойства {prop!r} ({sorted(ranges)})"
            )
        errors += node_errors(vocab, where, value, nested=True)
        return errors

    if isinstance(value, str):
        entity_ranges = ranges - LITERAL_TYPES
        if value.startswith("http://") or value.startswith("https://"):
            if not ("URL" in ranges or "Text" in ranges or entity_ranges):
                errors.append(f"{where}: URL недопустим для свойства {prop!r} ({sorted(ranges)})")
            elif value.startswith(ORIGIN) and not canonical(value):
                errors.append(f"{where}: неканоническая форма URL {value!r}")
            return errors
        if ranges & DATE_TYPES and ISO_DATE.match(value):
            return errors
        if ranges & DATE_TYPES and not ranges & {"Text"} and not ISO_DATE.match(value):
            errors.append(f"{where}: значение {value!r} не является датой ISO 8601")
        elif not ranges & {"Text", "URL"} and not entity_ranges:
            errors.append(f"{where}: текст недопустим для свойства {prop!r} ({sorted(ranges)})")
        return errors

    if isinstance(value, bool):
        if "Boolean" not in ranges:
            errors.append(f"{where}: булево значение недопустимо для {prop!r}")
    elif isinstance(value, (int, float)):
        if not ranges & {"Number", "Integer", "Float"}:
            errors.append(f"{where}: число недопустимо для {prop!r} ({sorted(ranges)})")
    else:
        errors.append(f"{where}: значение типа {type(value).__name__} не поддерживается")
    return errors


def node_errors(vocab: Vocabulary, where: str, node: dict, nested: bool = False) -> list[str]:
    errors: list[str] = []
    node_type = node.get("@type")
    if not node_type:
        return [f"{where}: узел без @type"]
    if node_type not in vocab.classes:
        return [f"{where}: неизвестный тип {node_type!r}"]

    context = node.get("@context")
    if nested and context is not None:
        errors.append(f"{where}: вложенный узел не должен нести @context")
    if not nested and context != "https://schema.org":
        errors.append(f"{where}: @context должен быть https://schema.org, а не {context!r}")

    node_id = node.get("@id")
    if node_id is not None and node_id.startswith(ORIGIN) and not canonical(node_id):
        errors.append(f"{where}: неканоническая форма @id {node_id!r}")

    types = sorted(vocab.ancestors(node_type))
    for prop, value in node.items():
        if prop in JSON_LD_KEYS:
            continue
        if prop not in vocab.properties:
            errors.append(f"{where}: свойство {prop!r} отсутствует в словаре schema.org")
            continue
        domain = set(vocab.properties[prop]["domain"])
        if not domain & set(types):
            errors.append(
                f"{where}: свойство {prop!r} не применимо к типу {node_type!r} "
                f"(domain {sorted(domain)})"
            )
            continue
        errors += value_errors(vocab, f"{where}.{prop}", prop, value, types)
    return errors


def breadcrumb_errors(where: str, node: dict, expected: list[list[str]]) -> list[str]:
    errors: list[str] = []
    items = node.get("itemListElement") or []
    actual = [[item.get("name"), item.get("item")] for item in items]
    if actual != expected:
        return [f"{where}: цепочка {actual} не совпадает с ожидаемой {expected}"]
    for index, item in enumerate(items, start=1):
        if item.get("position") != index:
            errors.append(f"{where}: position {item.get('position')!r} вместо {index}")
    return errors


def check_page(vocab: Vocabulary, public: Path, page: dict) -> list[str]:
    path = public / page["html"]
    if not path.exists():
        return [f"{page['html']}: страница отсутствует в сборке"]

    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    errors: list[str] = []

    try:
        nodes = [json.loads(block) for block in parser.blocks]
    except json.JSONDecodeError as error:
        return [f"{page['html']}: JSON-LD не разбирается ({error})"]

    expected_types = page["blocks"]
    actual_types = [node.get("@type") for node in nodes]
    if actual_types != expected_types:
        return [f"{page['html']}: блоки {actual_types} вместо ожидаемых {expected_types}"]

    for index, node in enumerate(nodes):
        errors += node_errors(vocab, f"{page['html']}[{index}] {actual_types[index]}", node)

    by_type = {node.get("@type"): node for node in nodes}

    main = by_type.get(expected_types[0])
    if "url" in page and main.get("url") != page["url"]:
        errors.append(f"{page['html']}: url {main.get('url')!r} вместо {page['url']!r}")
    if "name" in page and main.get("name") != page["name"]:
        errors.append(f"{page['html']}: name {main.get('name')!r} вместо {page['name']!r}")
    if "id" in page and main.get("@id") != page["id"]:
        errors.append(f"{page['html']}: @id {main.get('@id')!r} вместо {page['id']!r}")

    for prop in page.get("required_properties", []):
        if prop not in main:
            errors.append(f"{page['html']}: у {expected_types[0]} нет обязательного {prop!r}")

    if expected_author := page.get("author"):
        actual_author = main.get("author") or main.get("mainEntity") or {}
        stated = {key: actual_author.get(key) for key in expected_author}
        if stated != expected_author:
            errors.append(f"{page['html']}: автор {stated} вместо ожидаемого {expected_author}")

    if "list" in page:
        spec = page["list"]
        items = main.get(spec["property"]) or []
        item_types = sorted({item.get("@type") for item in items})
        if item_types != [spec["item_type"]]:
            errors.append(
                f"{page['html']}: элементы {spec['property']!r} имеют типы {item_types} "
                f"вместо [{spec['item_type']!r}]"
            )
        urls = [item.get("url") for item in items]
        if urls != spec["urls"]:
            errors.append(f"{page['html']}: список {urls} не совпадает с ожидаемым {spec['urls']}")
        visible = [f"{ORIGIN}{href}" for href in parser.list_links]
        if urls != visible:
            errors.append(
                f"{page['html']}: список structured data {urls} расходится с видимым списком {visible}"
            )

    if "breadcrumb" in page:
        crumb = by_type.get("BreadcrumbList")
        errors += breadcrumb_errors(f"{page['html']} BreadcrumbList", crumb, page["breadcrumb"])

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", default=str(ROOT / "public"), help="каталог сборки")
    parser.add_argument(
        "--fixture", default=str(ROOT / "tests" / "fixtures" / "schema-contract.json")
    )
    parser.add_argument(
        "--vocabulary",
        default=str(ROOT / "tests" / "fixtures" / "schema-org-vocabulary.json"),
    )
    args = parser.parse_args()

    public = Path(args.public)
    if not public.is_dir():
        print(f"{public}: сборки нет, сначала выполните hugo build", file=sys.stderr)
        return 2

    contract = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    vocab = Vocabulary(json.loads(Path(args.vocabulary).read_text(encoding="utf-8")))

    errors: list[str] = []
    described = {page["html"] for page in contract["pages"]}
    described |= set(contract["pages_without_structured_data"])
    # `perf/` holds copies of one page that differ only in how fonts arrive
    # (scripts/make-perf-pages.py, T69). They are measurement scaffolding, not
    # pages of the site: each carries `noindex` and no canonical, and none is
    # linked from anywhere. Describing them in the fixture would state that the
    # site has three more publications than it does.
    built = {
        str(path.relative_to(public))
        for path in public.rglob("*.html")
        if not str(path.relative_to(public)).startswith("perf/")
    }
    for missing in sorted(built - described):
        errors.append(f"{missing}: страница собрана, но её нет в фикстуре")
    for extra in sorted(described - built):
        errors.append(f"{extra}: фикстура описывает страницу, которой нет в сборке")

    for page in contract["pages"]:
        errors += check_page(vocab, public, page)

    for name in contract["pages_without_structured_data"]:
        path = public / name
        if not path.exists():
            errors.append(f"{name}: страница отсутствует в сборке")
            continue
        empty = PageParser()
        empty.feed(path.read_text(encoding="utf-8"))
        if empty.blocks:
            errors.append(f"{name}: structured data не ожидается, а найдено {len(empty.blocks)} блоков")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"\nschema-контракт: {len(errors)} ошибок", file=sys.stderr)
        return 1

    print(
        f"schema-контракт: {len(contract['pages'])} страниц со structured data, "
        f"{len(contract['pages_without_structured_data'])} без неё — расхождений нет"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
