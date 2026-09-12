#!/usr/bin/env python3
"""Verify library material front matter against the content schema.

Hugo templates already `errorf` on several of these cases at render time. This
check runs before `hugo build`, stays standard-library-only, and gives
controlled negative fixtures that do not need a full site build.

    python3 scripts/check-content-schema.py
    python3 scripts/check-content-schema.py --self-test

`--public-dir` is accepted for the review gate and ignored: the contract lives
in `content/library`, not in `public/`.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "content" / "library"
AUTHORS_FILE = ROOT / "data" / "authors.yaml"
TYPES_FILE = ROOT / "data" / "creative_types.yaml"

ALLOWED_KEYS = frozenset(
    {
        "title",
        "description",
        "date",
        "created",
        "lastmod",
        "authors",
        "id",
        "type",
        "tags",
        "cover",
        "cover_alt",
        "audio",
        "relations",
        "historicalUrls",
        "draft",
        "slug",
    }
)
REQUIRED = frozenset({"title", "date", "authors", "id", "type"})
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
UUID7 = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
AUTHOR_KEY = re.compile(r"^([A-Za-z][A-Za-z0-9_]*):\s*$")
TYPE_KEY = re.compile(r"^([a-z][a-z0-9-]*)\s*:\s*$")
SCALAR = re.compile(r'^([A-Za-z0-9_]+):\s*(?:"([^"]*)"|([^\s#][^#]*?))?\s*(?:#.*)?$')
LIST_INLINE = re.compile(r'^([A-Za-z0-9_]+):\s*\[(.*)\]\s*$')
COVER_PATH = re.compile(r"^/assets/")


def front_matter_lines(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: нет открывающего ---")
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return lines[1:index]
    raise ValueError(f"{path}: нет закрывающего ---")


def author_keys(path: Path = AUTHORS_FILE) -> set[str]:
    keys: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if match := AUTHOR_KEY.match(line):
            keys.add(match.group(1))
    return keys


def type_keys(path: Path = TYPES_FILE) -> set[str]:
    keys: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        if match := TYPE_KEY.match(line):
            keys.add(match.group(1))
    return keys


def parse_front_matter(path: Path) -> dict:
    """Parse the constrained YAML subset materials actually use."""
    data: dict = {}
    lines = front_matter_lines(path)
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            index += 1
            continue
        if line.startswith((" ", "\t", "-")):
            raise ValueError(f"{path}: неожиданный отступ вне блока: {line!r}")

        if match := LIST_INLINE.match(line):
            key, raw = match.group(1), match.group(2).strip()
            if key not in ALLOWED_KEYS:
                raise ValueError(f"{path}: неизвестное поле {key!r}")
            if raw == "":
                data[key] = []
            else:
                items = []
                for part in raw.split(","):
                    item = part.strip().strip('"').strip("'")
                    if item:
                        items.append(item)
                data[key] = items
            index += 1
            continue

        if match := SCALAR.match(line):
            key = match.group(1)
            if key not in ALLOWED_KEYS:
                raise ValueError(f"{path}: неизвестное поле {key!r}")
            value = match.group(2) if match.group(2) is not None else (match.group(3) or "")
            value = value.strip()
            # Block forms: `audio:` / `tags:` / `relations:` with nested lines.
            if value == "":
                block: list | dict | bool | str | None = []
                if key == "draft":
                    raise ValueError(f"{path}: draft требует true/false")
                nested: list = []
                index += 1
                while index < len(lines) and (
                    lines[index].startswith((" ", "\t")) or not lines[index].strip()
                    or lines[index].lstrip().startswith("#")
                    or lines[index].startswith("-")
                ):
                    nested_line = lines[index]
                    index += 1
                    if not nested_line.strip() or nested_line.lstrip().startswith("#"):
                        continue
                    nested.append(nested_line)
                if key == "audio":
                    block = parse_audio_block(path, nested)
                elif key in {"tags", "authors", "relations", "historicalUrls"}:
                    block = parse_string_list(path, key, nested)
                else:
                    block = "" if not nested else nested
                data[key] = block
                continue

            if key == "draft":
                if value not in {"true", "false"}:
                    raise ValueError(f"{path}: draft {value!r} — только true/false")
                data[key] = value == "true"
            else:
                data[key] = value
            index += 1
            continue

        raise ValueError(f"{path}: не разбирается строка front matter: {line!r}")

    return data


def parse_string_list(path: Path, key: str, lines: list[str]) -> list[str]:
    items: list[str] = []
    for line in lines:
        match = re.match(r'^\s*-\s*"?([^"]*?)"?\s*$', line)
        if not match:
            # relations are objects; validate shape loosely here.
            if key == "relations" and re.match(r"^\s*-\s*\w", line):
                items.append(line.strip())
                continue
            if key == "relations" and re.match(r"^\s+\w", line):
                continue
            raise ValueError(f"{path}: {key} имеет недопустимый элемент {line!r}")
        items.append(match.group(1))
    return items


def parse_audio_block(path: Path, lines: list[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines:
        start = re.match(r'^\s*-\s*(\w+):\s*"?([^"]*)"?\s*$', line)
        cont = re.match(r'^\s+(\w+):\s*"?([^"]*)"?\s*$', line)
        if start:
            current = {start.group(1): start.group(2)}
            entries.append(current)
            continue
        if cont and current is not None:
            current[cont.group(1)] = cont.group(2)
            continue
        raise ValueError(f"{path}: audio имеет недопустимую форму {line!r}")
    return entries


def material_errors(
    path: Path, authors: set[str], types: set[str], seen_ids: dict[str, Path]
) -> list[str]:
    errors: list[str] = []
    rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    try:
        data = parse_front_matter(path)
    except ValueError as error:
        return [str(error)]

    missing = REQUIRED - data.keys()
    for key in sorted(missing):
        errors.append(f"{rel}: нет обязательного поля {key!r}")

    for key in ("date", "created", "lastmod"):
        if key in data and data[key] != "" and not DATE.match(str(data[key])):
            errors.append(f"{rel}: {key} {data[key]!r} не в форме YYYY-MM-DD")

    if "id" in data:
        material_id = str(data["id"])
        if not UUID7.match(material_id):
            errors.append(f"{rel}: id {material_id!r} не lowercase UUIDv7")
        elif material_id in seen_ids:
            errors.append(
                f"{rel}: id {material_id!r} уже у {seen_ids[material_id]}"
            )
        else:
            seen_ids[material_id] = rel

    if "type" in data and data["type"] not in types:
        errors.append(
            f"{rel}: type {data['type']!r} нет в data/creative_types.yaml "
            f"(известно: {sorted(types)})"
        )

    if "authors" in data:
        if not isinstance(data["authors"], list) or not data["authors"]:
            errors.append(f"{rel}: authors должен быть непустым списком ключей")
        else:
            for author in data["authors"]:
                if author not in authors:
                    errors.append(
                        f"{rel}: unknown author {author!r} (see data/authors.yaml)"
                    )

    if "cover" in data and data["cover"] not in ("", None):
        cover = str(data["cover"])
        if not COVER_PATH.match(cover):
            errors.append(f"{rel}: cover {cover!r} должен начинаться с /assets/")
        if not data.get("cover_alt"):
            errors.append(f"{rel}: cover задан без cover_alt")

    if "audio" in data and data["audio"] not in ("", None):
        if not isinstance(data["audio"], list):
            errors.append(f"{rel}: audio должен быть списком {{src, type}}, не скаляром")
        else:
            for index, entry in enumerate(data["audio"]):
                if not isinstance(entry, dict):
                    errors.append(f"{rel}: audio[{index}] не объект {{src, type}}")
                    continue
                if set(entry) - {"src", "type"}:
                    errors.append(
                        f"{rel}: audio[{index}] неизвестные поля {sorted(set(entry) - {'src', 'type'})}"
                    )
                if not entry.get("src"):
                    errors.append(f"{rel}: audio[{index}] без src")
                elif not str(entry["src"]).startswith("/"):
                    errors.append(f"{rel}: audio[{index}].src должен быть site-absolute")
                if not entry.get("type"):
                    errors.append(f"{rel}: audio[{index}] без type")
                elif "/" not in str(entry["type"]):
                    errors.append(f"{rel}: audio[{index}].type {entry['type']!r} не MIME")

    if "historicalUrls" in data:
        historical = data["historicalUrls"]
        if not isinstance(historical, list):
            errors.append(f"{rel}: historicalUrls должен быть списком URL")
        else:
            for index, address in enumerate(historical):
                if not re.match(
                    r"^https://alexandr-sidorenko\.me/[^?#]+$", str(address)
                ):
                    errors.append(
                        f"{rel}: historicalUrls[{index}] должен быть plain absolute URL "
                        "на https://alexandr-sidorenko.me"
                    )

    if "warning" in data or "content_warnings" in data:
        errors.append(
            f"{rel}: поле warning/content_warnings снято с модели — удалите его"
        )

    return errors


def collect_errors(library: Path, authors: set[str], types: set[str]) -> list[str]:
    errors: list[str] = []
    seen_ids: dict[str, Path] = {}
    materials = sorted(
        path for path in library.glob("*.md") if path.name != "_index.md"
    )
    if not materials:
        return [f"{library}: нет материалов для проверки"]
    for path in materials:
        errors += material_errors(path, authors, types, seen_ids)
    return errors


def self_test(root: Path) -> None:
    authors = author_keys(root / "data" / "authors.yaml")
    types = type_keys(root / "data" / "creative_types.yaml")
    real = collect_errors(root / "content" / "library", authors, types)
    assert not real, "self-test: рабочий контент красный:\n" + "\n".join(real)

    broken = '''---
title: "Сломанный материал"
description: "Фикстура"
date: 2026-13-40
created: not-a-date
lastmod: 2026-08-01
authors: ["no-such-author"]
id: "not-a-uuid"
type: "album"
cover: "relative/path.jpg"
audio: "/assets/x.mp3"
draft: false
unknown_field: true
---

тело
'''
    with tempfile.TemporaryDirectory(prefix="content-schema-") as tmp:
        path = Path(tmp) / "broken.md"
        path.write_text(broken, encoding="utf-8")
        # unknown_field is rejected at parse time; keep a second fixture for enums.
        errors = material_errors(path, authors, types, {})
    assert any("неизвестное поле" in error or "unknown_field" in error for error in errors), errors

    broken_enums = '''---
title: "Сломанные enum"
description: "Фикстура"
date: 2026-08-01
created: 2026-08-01
lastmod: 2026-08-01
authors: ["no-such-author"]
id: "12345678-1234-1234-1234-1234567890ab"
type: "album"
cover: "/assets/library/x.jpg"
cover_alt: "alt"
audio:
  - src: "assets/x.mp3"
    type: "mpeg"
historicalUrls:
  - https://foreign.example/old
draft: false
---

тело
'''
    with tempfile.TemporaryDirectory(prefix="content-schema-") as tmp:
        path = Path(tmp) / "broken-enums.md"
        path.write_text(broken_enums, encoding="utf-8")
        errors = material_errors(path, authors, types, {})
    joined = "\n".join(errors)
    assert "no-such-author" in joined, errors
    assert "album" in joined, errors
    assert "UUIDv7" in joined or "uuid" in joined.lower(), errors
    assert "MIME" in joined or "site-absolute" in joined, errors
    assert "historicalUrls" in joined, errors
    print("content-schema self-test: broken fixtures отклонены, рабочий контент зелёный")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--public-dir", default="public", help="игнорируется; для гейта review")
    parser.add_argument(
        "--library",
        type=Path,
        help="каталог материалов (по умолчанию content/library)",
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    if args.self_test:
        self_test(root)
        return 0

    authors = author_keys(root / "data" / "authors.yaml")
    types = type_keys(root / "data" / "creative_types.yaml")
    if not authors:
        print("data/authors.yaml: авторы не найдены", file=sys.stderr)
        return 2
    if not types:
        print("data/creative_types.yaml: типы не найдены", file=sys.stderr)
        return 2

    library = args.library.resolve() if args.library else root / "content" / "library"
    errors = collect_errors(library, authors, types)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"\ncontent-schema: {len(errors)} ошибок", file=sys.stderr)
        return 1

    count = len([p for p in library.glob("*.md") if p.name != "_index.md"])
    print(f"content-schema: {count} материалов, схема соблюдена")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
