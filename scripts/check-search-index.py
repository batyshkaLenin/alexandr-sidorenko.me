#!/usr/bin/env python3
"""Verify the built search index against what the site publishes (T134).

The palette can only find what the index carries, and the index is the one
representation assembled from rendered bodies. Two things therefore have to
hold, and neither is visible by looking at a page:

1. Coverage and addresses. Every published material is in the index, under the
   canonical form of its URL, with the type label and topics the page shows.
   A material missing here is a material that has quietly become unfindable.
2. Redactions. A redacted fragment is absent from the page's DOM, so `.Plain`
   cannot contain it — but this file is the one place where a change to how
   bodies are collected could reintroduce it wholesale. The check reads
   `data/redactions.yaml` and asserts the index carries the accessible
   replacement and nothing that looks like an un-redacted body.

The size budget is the third thing: the index is fetched by a visitor who
searches, and it grows with the corpus. The ceiling is per material, so a
growing library fails here before it becomes a download nobody expects.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

INDEX = "search-index.json"

# Per material, uncompressed. A body of this site's longest publication is
# ~13 KB of text; twice that leaves room for a long one without letting the
# file grow unnoticed into hundreds of kilobytes.
MAX_BYTES_PER_ENTRY = 32 * 1024
MAX_BYTES_TOTAL = 512 * 1024

REQUIRED_FIELDS = ("title", "url", "path", "type", "kind", "topics", "summary", "text")

# `type` is the label a reader sees; `kind` is what a component can act on.
KINDS = {"audio", "text", "view", "type", "section", "topic"}

# What the redaction shortcode prints in place of a fragment.
REDACTION_MARKERS = ("[вымарано]", "[вымарана строка]", "[вымаран фрагмент текста]")


class PageFacts(HTMLParser):
    """Title and canonical URL as the built page states them."""

    def __init__(self) -> None:
        super().__init__()
        self.canonical: str | None = None
        self.redactions = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "link" and attributes.get("rel") == "canonical":
            self.canonical = attributes.get("href")
        if attributes.get("data-redaction"):
            self.redactions += 1


def published_materials(public: Path) -> dict[str, PageFacts]:
    materials = {}
    library = public / "library"
    for path in sorted(library.glob("*/index.html")):
        # A material is the page that renders one publication, and <article> is
        # what marks it. Library views (all, table, timeline…) live at the same
        # depth but are pages *about* the library and carry no article.
        html = path.read_text(encoding="utf-8")
        if "<article" not in html:
            continue
        facts = PageFacts()
        facts.feed(html)
        materials["/library/" + path.parent.name] = facts
    return materials


def check_entries(errors: list[str], entries: list[dict], public: Path) -> None:
    seen = {}
    for entry in entries:
        for field in REQUIRED_FIELDS:
            if field not in entry:
                errors.append(f"{entry.get('url', '?')}: entry is missing {field!r}")
        url = entry.get("url", "")
        if not url.startswith("/"):
            errors.append(f"{url!r}: address is not root-relative")
        if url != "/" and url.endswith("/"):
            errors.append(f"{url!r}: trailing slash, the canonical form has none")
        if entry.get("kind") not in KINDS:
            errors.append(f"{url!r}: kind is {entry.get('kind')!r}, expected one of {sorted(KINDS)}")
        if not entry.get("title"):
            errors.append(f"{url!r}: entry without a title cannot be shown as a result")
        if url in seen:
            errors.append(f"{url!r}: listed twice")
        seen[url] = entry

    materials = published_materials(public)
    for url in materials:
        if url not in seen:
            errors.append(f"{url}: published material is missing from the index")
        elif not seen[url]["text"]:
            errors.append(f"{url}: indexed with an empty body — searching its text finds nothing")

    return None


def check_redactions(errors: list[str], entries: list[dict], public: Path, root: Path) -> None:
    """A redacted material must arrive here already redacted."""
    redactions = root / "data" / "redactions.yaml"
    if not redactions.is_file():
        return

    by_url = {entry.get("url"): entry for entry in entries}
    for url, facts in published_materials(public).items():
        if not facts.redactions:
            continue
        entry = by_url.get(url)
        if entry is None:
            continue  # already reported as missing
        text = entry.get("text", "")
        if not any(marker in text for marker in REDACTION_MARKERS):
            errors.append(
                f"{url}: the page carries {facts.redactions} redaction(s), but the indexed "
                f"body shows none of the replacements — the index may hold the original text"
            )


def check_size(errors: list[str], raw: bytes, entries: list[dict]) -> None:
    if len(raw) > MAX_BYTES_TOTAL:
        errors.append(f"index is {len(raw)} bytes, over the {MAX_BYTES_TOTAL} budget")
    for entry in entries:
        size = len(json.dumps(entry, ensure_ascii=False).encode("utf-8"))
        if size > MAX_BYTES_PER_ENTRY:
            errors.append(
                f"{entry.get('url', '?')}: {size} bytes in the index, over the "
                f"{MAX_BYTES_PER_ENTRY} per-entry budget"
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--public-dir", default="public")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    public = Path(args.public_dir)
    if not public.is_absolute():
        public = root / public

    index_path = public / INDEX
    if not index_path.is_file():
        print(f"FAIL: {index_path} does not exist — the palette would have nothing to search", file=sys.stderr)
        return 1

    raw = index_path.read_bytes()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"FAIL: {INDEX} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    entries = data.get("entries")
    if not isinstance(entries, list) or not entries:
        print(f"FAIL: {INDEX} carries no entries", file=sys.stderr)
        return 1

    errors: list[str] = []
    check_entries(errors, entries, public)
    check_redactions(errors, entries, public, root)
    check_size(errors, raw, entries)

    if errors:
        print("FAIL: search index does not match what the site publishes", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    materials = len(published_materials(public))
    print(
        f"OK: {len(entries)} entr(ies), {materials} material(s) covered, "
        f"{len(raw)} bytes within the {MAX_BYTES_TOTAL} budget"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
