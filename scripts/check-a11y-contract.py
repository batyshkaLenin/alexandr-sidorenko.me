#!/usr/bin/env python3
"""Static accessibility checks for the built pages.

Not a replacement for using the site with a keyboard and a screen reader — it
checks the properties that are true of the markup itself, and that a template
change can silently break without anyone noticing:

- a skip link, first in tab order, pointing at a target that exists;
- no positive `tabindex`, which reorders the whole document's tab sequence for
  the sake of one element;
- nothing focusable inside `aria-hidden`, the classic way to hand the keyboard
  an element a screen reader will not announce;
- nothing focusable inside `.dc-visually-hidden` (machine-only chrome and
  identity values); skip-link uses its own class and stays first in tab order;
- every link and button carries an accessible name — text, `aria-label`, or an
  image with alt text — because "link" is not a destination;
- every `img` has an `alt` attribute, empty if decorative;
- `lang` on `<html>`, so a screen reader picks the right voice.

Interactive behaviour (arrow-key lists, the palette, the help sheet) is not
covered here: it exists only with JavaScript, and asserting it means driving a
browser, which the keyboard pass in the task does.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]

FOCUSABLE = {"a", "button", "input", "select", "textarea", "details", "iframe"}
VOID = {"img", "input", "br", "hr", "meta", "link", "source", "track", "wbr", "area", "base", "col", "embed", "param"}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.errors: list[str] = []
        self.headings: list[int] = []
        self.ids: set[str] = set()
        self.heading_ids: dict[str, int] = {}
        self.tocs: list[dict] = []
        self.first_link: dict | None = None
        self.skip_target: str | None = None
        self.lang: str | None = None
        self._hidden_depth = 0
        self._visually_hidden_depth = 0
        self._open: list[tuple[str, dict]] = []
        self._named: list[tuple[dict, str]] = []  # (attrs, accumulated text)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: (value or "") for key, value in attrs}

        if tag == "html":
            self.lang = attributes.get("lang")
        if "id" in attributes:
            ident = attributes["id"]
            if ident in self.ids:
                self.errors.append(f'duplicate id="{ident}"')
            self.ids.add(ident)
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append(int(tag[1]))
            if attributes.get("id"):
                self.heading_ids[attributes["id"]] = int(tag[1])
        if tag == "img" and "alt" not in attributes:
            self.errors.append(f"<img src={attributes.get('src', '?')!r}> has no alt attribute")

        tabindex = attributes.get("tabindex")
        if tabindex and tabindex.lstrip("+").isdigit() and int(tabindex) > 0:
            self.errors.append(f"<{tag} tabindex={tabindex}> reorders the whole document's tab sequence")

        classes = attributes.get("class", "").split()
        if tag == "nav" and "dc-toc" in classes:
            attributes["__toc__"] = str(len(self.tocs))
            self.tocs.append({"attrs": attributes, "links": []})
        if tag == "a":
            for _, parent in reversed(self._open):
                if "__toc__" in parent:
                    self.tocs[int(parent["__toc__"])]["links"].append(attributes.get("href", ""))
                    break
        focusable = tag in FOCUSABLE and attributes.get("tabindex") != "-1"
        if tag == "a" and not attributes.get("href"):
            focusable = False
        if self._hidden_depth and focusable:
            self.errors.append(
                f"<{tag}> is focusable inside aria-hidden: the keyboard reaches what a screen reader will not read"
            )
        # The carrier itself counts: `<a class="dc-visually-hidden">` was the
        # Home self-URL bug — depth alone only catches nested controls.
        if focusable and (
            self._visually_hidden_depth or "dc-visually-hidden" in classes
        ):
            self.errors.append(
                f"<{tag}> is focusable inside .dc-visually-hidden: machine-only chrome must stay out of tab order"
            )

        if attributes.get("aria-hidden") == "true" and tag not in VOID:
            self._hidden_depth += 1
            attributes["__hidden__"] = "1"

        if "dc-visually-hidden" in classes and tag not in VOID:
            self._visually_hidden_depth += 1
            attributes["__visually_hidden__"] = "1"

        if tag == "a" and self.first_link is None and attributes.get("href"):
            self.first_link = attributes
            if "dc-skip-link" in classes:
                self.skip_target = attributes["href"]

        if tag in ("a", "button"):
            self._named.append((attributes, ""))

        if tag not in VOID:
            self._open.append((tag, attributes))

    def handle_endtag(self, tag: str) -> None:
        if tag in ("a", "button") and self._named:
            attributes, text = self._named.pop()
            has_name = bool(
                text.strip()
                or attributes.get("aria-label")
                or attributes.get("aria-labelledby")
                or attributes.get("title")
            )
            if not has_name:
                self.errors.append(f"<{tag}> without an accessible name: {attributes}")

        while self._open:
            name, attributes = self._open.pop()
            if attributes.get("__hidden__"):
                self._hidden_depth -= 1
            if attributes.get("__visually_hidden__"):
                self._visually_hidden_depth -= 1
            if name == tag:
                break

    def handle_data(self, data: str) -> None:
        if self._named and data.strip():
            attributes, text = self._named[-1]
            self._named[-1] = (attributes, text + data)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    # An <img alt="…"> inside a link is that link's name.
    def unknown_decl(self, data: str) -> None:  # pragma: no cover - html5 has none
        pass


def check_page(path: Path, url: str) -> list[str]:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    errors = list(parser.errors)

    if not parser.lang:
        errors.append("<html> carries no lang")

    ones = parser.headings.count(1)
    if ones != 1:
        errors.append(f"{ones} <h1> on the page, expected exactly one")

    previous = None
    for level in parser.headings:
        if previous is not None and level > previous + 1:
            errors.append(f"heading level jumps from h{previous} to h{level}")
            break
        previous = level

    if parser.skip_target is None:
        errors.append("the first link is not the skip link")
    elif parser.skip_target.startswith("#") and parser.skip_target[1:] not in parser.ids:
        errors.append(f"skip link points at {parser.skip_target}, which is not on the page")

    if len(parser.tocs) > 1:
        errors.append("multiple Contents landmarks")
    for toc in parser.tocs:
        if toc["attrs"].get("id") != "TableOfContents" or toc["attrs"].get("aria-label") != "Contents":
            errors.append("TOC must be the named TableOfContents landmark")
        if len(toc["links"]) < 3:
            errors.append("TOC requires at least three section links")
        if len(set(toc["links"])) != len(toc["links"]):
            errors.append("TOC has repeated targets")
        for href in toc["links"]:
            target = unquote(href[1:]) if href.startswith("#") else ""
            if parser.heading_ids.get(target) not in (2, 3):
                errors.append(f"TOC target {href!r} is not an existing h2/h3 heading")

    return [f"{url}: {error}" for error in errors]


def toc_fixtures(directory: Path) -> dict:
    """Render real site templates in a disposable site, never into public/."""
    site = directory / "site"
    site.mkdir(parents=True)
    for folder in ("layouts", "data", "i18n", "config"):
        shutil.copytree(ROOT / folder, site / folder)
    for folder in ("assets", "static", "themes"):
        (site / folder).symlink_to(ROOT / folder, target_is_directory=True)
    shutil.copyfile(ROOT / "hugo.toml", site / "hugo.toml")
    content = site / "content/library"
    content.mkdir(parents=True)
    shutil.copyfile(ROOT / "content/library/_index.md", content / "_index.md")
    (site / "fixture.toml").write_text(
        'baseURL = "https://fixture.invalid/"\nenableGitInfo = false\n'
        'disableKinds = ["home", "section", "taxonomy", "term", "sitemap", "rss"]\n'
    )
    three = "## Первый раздел\n\nТекст.\n\n## Второй раздел\n\nТекст.\n\n## Третий раздел\n\nТекст.\n"
    cases = []

    def add(name, kind, body, expected, extra="", error=None, works=False):
        slug = "w0071-fixture-" + name
        ident = f"01a00000-0000-7000-8000-{len(cases):012x}"
        (content / f"{slug}.md").write_text(
            f'---\ntitle: "Fixture {name}"\ntype: "{kind}"\n'
            f'id: "{ident}"\nauthors: ["batyshkaLenin"]\ndate: 2026-01-01\n{extra}---\n\n{body}'
        )
        cases.append({"slug": slug, "type": kind, "toc": expected, "error": error, "works": works})

    for kind in ("article", "fiction", "paper"):
        for count in range(4):
            body = "\n\n".join(f"## Раздел {n}\n\nТекст." for n in range(count))
            add(f"{kind}-{count}", kind, body, 3 if count == 3 else 0)
    add("paper-chrome", "paper", "## Один\n\nТекст.\n\n## Два\n\nТекст.", 0,
        'abstract: "Аннотация не является разделом текста."\nkeywords: ["пример"]\n')
    add("paper-abstract", "paper", three, 3,
        'abstract: "Аннотация не является разделом текста."\nkeywords: ["пример"]\n')
    add("paper-nested", "paper", "## Один\n\nТекст.\n\n### Два\n\nТекст.\n\n### Три\n\nТекст.", 3)
    add("deep", "article", "## Один\n\nТекст.\n\n### Два\n\nТекст.\n\n#### Три\n\nТекст.", 0)
    add("unicode", "fiction", "## Повтор\n\nТекст.\n\n## Повтор\n\nТекст.\n\n### Ёж и чай\n\nТекст.\n\n## Явный {#stable-section}\n\nТекст.", 4)
    add("collision", "fiction", "## Один {#same}\n\nТекст.\n\n## Два {#same}\n\nТекст.\n\n## Три\n\nТекст.", 0,
        error='duplicate id="same"')
    for kind in ("note", "poem", "track", "talk"):
        extra = ('relations:\n  - rel: external-source\n    url: "https://youtu.be/sXq_ZKYl554"\n'
                 if kind == "talk" else "")
        add(kind, kind, three, 0, extra)
    add("collection", "poetry-collection", three, 0, works=True)
    add("custom", "fiction", three, 0, 'layout: "art-poem"\n')
    add("empty", "article", three, 0)

    def build(destination, extra=None):
        config = "hugo.toml,fixture.toml" + ("," + extra if extra else "")
        run = subprocess.run(
            [os.environ.get("HUGO", "hugo"), "--source", str(site), "--config", config,
             "--environment", "preview", "--destination", str(destination), "--panicOnWarning", "--noBuildLock"],
            capture_output=True, text=True,
        )
        if run.returncode:
            raise AssertionError(run.stdout + run.stderr)

    public = site / "public"
    build(public)
    # A real empty Hugo TOC despite three h2 fragments: no phantom shell.
    (site / "empty.toml").write_text('[markup.tableOfContents]\nstartLevel = 4\nendLevel = 6\n')
    empty = site / "empty-public"
    build(empty, "empty.toml")
    slug = "w0071-fixture-empty"
    shutil.copyfile(empty / f"library/{slug}/index.html", public / f"library/{slug}/index.html")
    for case in cases:
        path = public / f"library/{case['slug']}/index.html"
        errors = check_page(path, case["slug"])
        if case["error"]:
            assert any(case["error"] in error for error in errors), (case, errors)
            continue
        assert not errors, (case, errors)
        parsed = PageParser()
        parsed.feed(path.read_text())
        assert len(parsed.tocs) == bool(case["toc"]), case
        if case["toc"]:
            assert len(parsed.tocs[0]["links"]) == case["toc"], case
        if case["works"]:
            assert 'aria-label="Works in this collection"' in path.read_text(), case
    # Prove the target check itself rejects a broken rendered link.
    good = public / "library/w0071-fixture-article-3/index.html"
    bad = site / "broken-target.html"
    bad.write_text(good.read_text().replace('href="#раздел-0"', 'href="#missing"', 1))
    assert any("TOC target '#missing'" in error for error in check_page(bad, "negative-target"))
    return {"public": str(public), "cases": cases}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--toc-fixtures", type=Path, help="build and check disposable TOC boundary fixtures")
    args = parser.parse_args()

    if args.toc_fixtures:
        try:
            print(json.dumps(toc_fixtures(args.toc_fixtures), ensure_ascii=False))
        except (AssertionError, OSError) as error:
            print(f"FAIL: TOC fixtures: {error}", file=sys.stderr)
            return 1
        return 0

    public = Path(args.public_dir)
    if not public.is_dir():
        print(f"FAIL: {public} does not exist — build the site first", file=sys.stderr)
        return 1

    errors: list[str] = []
    pages = sorted(public.rglob("*.html"))
    for path in pages:
        url = "/" + path.relative_to(public).as_posix()
        errors.extend(check_page(path, url))

    if errors:
        print("FAIL: accessibility contract", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(pages)} page(s) — skip link, unique ids, headings, names, alt text, tab order, no hidden focusables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
