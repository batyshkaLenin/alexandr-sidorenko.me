#!/usr/bin/env python3
"""Verify Webmention snapshot v2, material ownership and rendered responses."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from webmention_targets import (
    AddressRegistry,
    RegistryError,
    build_registry,
    material_page,
    normalize_registry_key,
    normalize_source,
)

REQUIRED_FIELDS = {
    "id",
    "type",
    "targetReceived",
    "target",
    "source",
    "author_name",
    "author_url",
    "published",
    "content_text",
}
OPTIONAL_FIELDS = {"targetSnapshot"}
ALLOWED_TYPES = {"reply", "like", "repost", "bookmark", "mention"}
CONTENT_LIMIT = 640
MARKUP = re.compile(r"<[a-zA-Z/!]")
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}")
CAPTURED_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
MATERIAL_VERSION = re.compile(r"^sha256:[0-9a-f]{64}$")
UPDATED = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MISSING = object()


class SectionParser(HTMLParser):
    """Collect the responses block's hrefs, entries and any image inside."""

    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.sources: list[str] = []
        self.images: list[str] = []
        self.sections = 0
        self.responses: list[str] = []
        self.targets: list[dict[str, str]] = []
        self._target: dict[str, str] | None = None
        self._quote_parts: list[str] = []
        self._in_quote = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if attributes.get("data-response"):
            self.responses.append(attributes["data-response"])
        if tag == "section" and "dc-responses" in classes:
            self.depth = 1
            self.sections += 1
            return
        if not self.depth:
            return
        if tag == "section":
            self.depth += 1
        if tag == "figure" and "dc-responses__target" in classes:
            self._target = {
                "reattached": attributes.get("data-reattached") or "",
                "href": "",
                "datetime": "",
                "text": "",
            }
            self._quote_parts = []
        if self._target is not None:
            if tag == "blockquote" and "dc-responses__quote" in classes:
                self._in_quote = True
            elif tag == "a" and "dc-responses__target-link" in classes:
                self._target["href"] = attributes.get("href") or ""
            elif tag == "time" and "dc-responses__target-date" in classes:
                self._target["datetime"] = attributes.get("datetime") or ""
        if tag == "a" and "dc-responses__source" in classes and attributes.get("href"):
            self.sources.append(attributes["href"])
        if tag in ("img", "picture", "source"):
            self.images.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == "blockquote" and self._target is not None:
            self._in_quote = False
        if tag == "figure" and self._target is not None:
            self._target["text"] = "".join(self._quote_parts).strip()
            self.targets.append(self._target)
            self._target = None
            self._quote_parts = []
        if tag == "section" and self.depth:
            self.depth -= 1

    def handle_data(self, data: str) -> None:
        if self._target is not None and self._in_quote:
            self._quote_parts.append(data)


def self_test_section_parser() -> None:
    parser = SectionParser()
    parser.feed(
        '<section class="dc-responses">'
        '<li data-response="reply"><a class="dc-responses__source" href="https://source.example/">source</a>'
        '<figure class="dc-responses__target" data-response-target="quote" data-reattached="true">'
        '<blockquote class="dc-responses__quote"><p>stored quote</p></blockquote>'
        '<figcaption><time class="dc-responses__target-date" datetime="2026-09-12T12:00:00Z">date</time>'
        '<a class="dc-responses__target-link" href="https://example.test/page#:~:text=stored">current</a>'
        "</figcaption></figure></li>"
        '<li data-response="reply"><figure class="dc-responses__target" data-reattached="false">'
        '<blockquote class="dc-responses__quote"><p>old quote</p></blockquote>'
        '<time class="dc-responses__target-date" datetime="2026-09-11T12:00:00Z">date</time>'
        "</figure></li></section>"
    )
    assert parser.sources == ["https://source.example/"]
    assert parser.targets == [
        {
            "reattached": "true",
            "href": "https://example.test/page#:~:text=stored",
            "datetime": "2026-09-12T12:00:00Z",
            "text": "stored quote",
        },
        {
            "reattached": "false",
            "href": "",
            "datetime": "2026-09-11T12:00:00Z",
            "text": "old quote",
        },
    ]


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def absolute_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urllib.parse.urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def check_selector(
    errors: list[str],
    where: str,
    selector: Any,
    snapshot: Any,
) -> None:
    if not isinstance(selector, dict):
        errors.append(f"{where}: target.selector is not an object")
        return
    selector_type = selector.get("type")
    if selector_type == "document":
        check(
            errors,
            set(selector) == {"type"},
            f"{where}: document selector has extra fields",
        )
        check(
            errors,
            snapshot is MISSING,
            f"{where}: document selector must not have targetSnapshot",
        )
        return
    if selector_type != "quote":
        errors.append(f"{where}: unknown selector type {selector_type!r}")
        return

    expected = {"type", "exact", "prefix", "suffix", "position"}
    check(errors, set(selector) == expected, f"{where}: invalid quote selector fields")
    for field in ("exact", "prefix", "suffix"):
        check(
            errors,
            isinstance(selector.get(field), str),
            f"{where}: selector.{field} is not a string",
        )
    check(errors, bool(selector.get("exact")), f"{where}: selector.exact is empty")

    position = selector.get("position")
    if not isinstance(position, dict):
        errors.append(f"{where}: selector.position is not an object")
    else:
        check(
            errors,
            set(position) == {"start", "end"},
            f"{where}: invalid position fields",
        )
        start = position.get("start")
        end = position.get("end")
        check(
            errors,
            isinstance(start, int) and isinstance(end, int) and 0 <= start < end,
            f"{where}: invalid text position {position!r}",
        )
        exact = selector.get("exact")
        if isinstance(start, int) and isinstance(end, int) and isinstance(exact, str):
            check(
                errors,
                end - start == len(exact),
                f"{where}: text position length differs from selector.exact",
            )

    if not isinstance(snapshot, dict):
        errors.append(f"{where}: quote selector has no targetSnapshot")
        return
    check(
        errors,
        set(snapshot) == {"text", "capturedAt", "materialVersion"},
        f"{where}: invalid targetSnapshot fields",
    )
    check(
        errors,
        snapshot.get("text") == selector.get("exact"),
        f"{where}: snapshot text differs from selector.exact",
    )
    check(
        errors,
        isinstance(snapshot.get("capturedAt"), str)
        and bool(CAPTURED_AT.match(snapshot["capturedAt"])),
        f"{where}: invalid targetSnapshot.capturedAt",
    )
    check(
        errors,
        isinstance(snapshot.get("materialVersion"), str)
        and bool(MATERIAL_VERSION.match(snapshot["materialVersion"])),
        f"{where}: invalid targetSnapshot.materialVersion",
    )


def check_entry(
    errors: list[str],
    entry: Any,
    index: int,
    registry: AddressRegistry,
) -> None:
    if not isinstance(entry, dict):
        errors.append(f"mentions[{index}] is not an object")
        return
    identifier = entry.get("id")
    where = (
        identifier
        if isinstance(identifier, str) and identifier
        else f"mentions[{index}]"
    )
    extra = set(entry) - REQUIRED_FIELDS - OPTIONAL_FIELDS
    check(errors, not extra, f"{where}: fields outside the contract: {sorted(extra)}")
    missing = REQUIRED_FIELDS - set(entry)
    check(errors, not missing, f"{where}: missing field(s): {sorted(missing)}")
    if missing:
        return

    for field in (
        "id",
        "type",
        "targetReceived",
        "source",
        "author_name",
        "author_url",
        "published",
        "content_text",
    ):
        check(
            errors, isinstance(entry[field], str), f"{where}: {field} is not a string"
        )
    check(
        errors,
        isinstance(entry["id"], str) and bool(entry["id"]),
        f"{where}: id is empty",
    )
    check(
        errors,
        isinstance(entry["type"], str) and entry["type"] in ALLOWED_TYPES,
        f"{where}: unknown type {entry['type']!r}",
    )
    check(
        errors,
        absolute_url(entry["targetReceived"]),
        f"{where}: targetReceived is not an absolute URL",
    )
    check(
        errors, absolute_url(entry["source"]), f"{where}: source is not an absolute URL"
    )
    check(
        errors,
        entry["author_url"] == "" or absolute_url(entry["author_url"]),
        f"{where}: author_url is not an absolute URL",
    )

    target = entry["target"]
    if not isinstance(target, dict):
        errors.append(f"{where}: target is not an object")
    else:
        check(
            errors,
            set(target) == {"materialId", "selector"},
            f"{where}: invalid target fields",
        )
        material_id = target.get("materialId")
        check(
            errors,
            isinstance(material_id, str) and bool(material_id),
            f"{where}: target.materialId is not a non-empty string",
        )
        material = (
            registry.by_id.get(material_id) if isinstance(material_id, str) else None
        )
        check(
            errors, material is not None, f"{where}: unknown materialId {material_id!r}"
        )
        if material is not None and isinstance(entry["targetReceived"], str):
            parsed = urllib.parse.urlsplit(entry["targetReceived"])
            base = urllib.parse.urlunsplit(
                (parsed.scheme, parsed.netloc, parsed.path, parsed.query, "")
            )
            try:
                received_material = registry.by_url.get(normalize_registry_key(base))
            except RegistryError:
                received_material = None
            check(
                errors,
                received_material is not None
                and received_material.material_id == material.material_id,
                f"{where}: targetReceived does not resolve to target.materialId",
            )
        check_selector(
            errors,
            where,
            target.get("selector"),
            entry.get("targetSnapshot", MISSING),
        )

    for field in ("author_name", "content_text"):
        value = entry[field]
        if isinstance(value, str):
            check(errors, not MARKUP.search(value), f"{where}: {field} contains markup")
    if isinstance(entry["content_text"], str):
        check(
            errors,
            len(entry["content_text"]) <= CONTENT_LIMIT + 1,
            f"{where}: content_text longer than the {CONTENT_LIMIT}-character limit",
        )
    for field in ("author_name", "content_text", "author_url"):
        value = entry[field]
        if isinstance(value, str):
            check(
                errors,
                not EMAIL.search(value),
                f"{where}: {field} looks like it holds an e-mail",
            )


def check_rendering(
    errors: list[str],
    public_dir: Path,
    mentions: list[dict[str, Any]],
    registry: AddressRegistry,
) -> None:
    by_material: dict[str, list[dict[str, Any]]] = {}
    for entry in mentions:
        target = entry.get("target")
        if isinstance(target, dict) and isinstance(target.get("materialId"), str):
            by_material.setdefault(target["materialId"], []).append(entry)

    approved_pages: set[Path] = set()
    for material_id, entries in by_material.items():
        material = registry.by_id.get(material_id)
        if material is None:
            continue
        page = material_page(public_dir, material)
        approved_pages.add(page.resolve())
        if not page.exists():
            errors.append(
                f"{material.canonical}: approved mention(s) point at an unpublished page"
            )
            continue
        parser = SectionParser()
        parser.feed(page.read_text(encoding="utf-8"))
        check(
            errors,
            parser.sections == 1,
            f"{material.canonical}: expected one responses block, found {parser.sections}",
        )
        check(
            errors,
            not parser.images,
            f"{material.canonical}: responses block renders an image — avatars are not published",
        )
        check(
            errors,
            len(parser.responses) > 0,
            f"{material.canonical}: approved mentions exist, but no response is rendered",
        )
        collapsed = "reactions" in parser.responses
        for entry in entries:
            if entry["type"] in {"like", "repost", "bookmark"} and collapsed:
                continue
            check(
                errors,
                entry["source"] in parser.sources,
                f"{material.canonical}: approved mention {entry['id']} is not rendered",
            )

        expected_targets = [
            entry["targetSnapshot"]
            for entry in entries
            if entry["type"] in {"reply", "mention"}
            and isinstance(entry.get("targetSnapshot"), dict)
        ]
        check(
            errors,
            Counter(target["text"] for target in parser.targets)
            == Counter(target["text"] for target in expected_targets),
            f"{material.canonical}: rendered target quotes differ from the snapshot",
        )
        check(
            errors,
            Counter(target["datetime"] for target in parser.targets)
            == Counter(target["capturedAt"] for target in expected_targets),
            f"{material.canonical}: rendered target dates differ from the snapshot",
        )
        for target in parser.targets:
            state = target["reattached"]
            check(
                errors,
                state in {"true", "false"},
                f"{material.canonical}: quote has invalid reattach state {state!r}",
            )
            if state == "true":
                check(
                    errors,
                    target["href"].startswith(material.canonical + "#:~:text="),
                    f"{material.canonical}: reattached quote has no Text Fragment link",
                )
            else:
                check(
                    errors,
                    not target["href"],
                    f"{material.canonical}: unresolved quote exposes a false deep link",
                )

    for page in public_dir.rglob("index.html"):
        if page.resolve() in approved_pages:
            continue
        parser = SectionParser()
        parser.feed(page.read_text(encoding="utf-8"))
        if parser.responses:
            errors.append(
                f"{page}: shows {len(parser.responses)} response(s) without an approved mention"
            )


def main() -> int:
    self_test_section_parser()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    snapshot_path = root / "data" / "webmentions.json"
    errors: list[str] = []
    if not snapshot_path.exists():
        print(f"{snapshot_path}: missing snapshot", file=sys.stderr)
        return 1
    try:
        registry = build_registry(root)
    except RegistryError as error:
        print(f"webmention registry check failed: {error}", file=sys.stderr)
        return 1

    try:
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print(f"{snapshot_path}: invalid JSON: {error}", file=sys.stderr)
        return 1
    if not isinstance(snapshot, dict):
        print(f"{snapshot_path}: snapshot is not an object", file=sys.stderr)
        return 1
    check(
        errors,
        set(snapshot) == {"contract", "updated", "mentions"},
        "snapshot: invalid top-level fields",
    )
    check(errors, snapshot.get("contract") == 2, "snapshot: unknown contract version")
    check(
        errors,
        isinstance(snapshot.get("updated"), str)
        and bool(UPDATED.match(snapshot["updated"])),
        "snapshot: updated is not an ISO date",
    )
    mentions = snapshot.get("mentions")
    check(errors, isinstance(mentions, list), "snapshot: mentions is not a list")
    if not isinstance(mentions, list):
        mentions = []

    identifiers = [
        entry.get("id")
        for entry in mentions
        if isinstance(entry, dict) and isinstance(entry.get("id"), str)
    ]
    duplicate_ids = sorted(
        identifier for identifier, count in Counter(identifiers).items() if count > 1
    )
    check(
        errors,
        not duplicate_ids,
        f"snapshot: duplicate id(s): {duplicate_ids}",
    )
    interactions: list[tuple[str, str]] = []
    for index, entry in enumerate(mentions):
        check_entry(errors, entry, index, registry)
        if isinstance(entry, dict):
            target = entry.get("target")
            source = entry.get("source")
            material_id = target.get("materialId") if isinstance(target, dict) else None
            if isinstance(material_id, str) and material_id and isinstance(source, str):
                interactions.append((material_id, normalize_source(source)))
    check(
        errors,
        len(interactions) == len(set(interactions)),
        "snapshot: duplicate semantic interaction(s)",
    )

    if not errors:
        check_rendering(errors, public_dir, mentions, registry)

    if errors:
        print("webmention contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: contract v2, {len(registry.by_id)} material(s), "
        f"{len(mentions)} approved mention(s), rendering matches materialId ownership"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
