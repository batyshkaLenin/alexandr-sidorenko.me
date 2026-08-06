#!/usr/bin/env python3
"""Verify migrated publication bodies and semantic line breaks.

The committed snapshot makes the check usable in a clean clone. When the
read-only legacy checkout is available, the same run also compares each current
body with its original source after applying the documented normalizations.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

SITE_ORIGIN = "https://alexandr-sidorenko.me/"
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
HARD_BREAK = re.compile(r"(?: {2,}|\\)\n")
BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
HARD_WRAPS_ENABLED = re.compile(r"^\s*hardWraps\s*=\s*true\s*(?:#.*)?$", re.MULTILINE)
CONTENT_NS = "{http://purl.org/rss/1.0/modules/content/}encoded"


class ContentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._content_depth = 0
        self.breaks = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._content_depth:
            if tag == "br":
                self.breaks += 1
            if tag not in {
                "area",
                "base",
                "br",
                "col",
                "embed",
                "hr",
                "img",
                "input",
                "link",
                "meta",
                "param",
                "source",
                "track",
                "wbr",
            }:
                self._content_depth += 1
            return

        classes = dict(attrs).get("class", "") or ""
        if "e-content" in classes.split():
            self._content_depth = 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._content_depth and tag == "br":
            self.breaks += 1

    def handle_endtag(self, tag: str) -> None:
        if self._content_depth:
            self._content_depth -= 1


def body(markdown: str) -> str:
    lines = markdown.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise ValueError("missing opening front matter delimiter")
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "".join(lines[index + 1 :])
    raise ValueError("missing closing front matter delimiter")


def normalized_body(markdown: str) -> str:
    value = HTML_COMMENT.sub("", body(markdown))
    value = value.replace(SITE_ORIGIN, "/")
    value = HARD_BREAK.sub("\n", value)
    return " ".join(value.split())


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def source_break_count(markdown: str) -> int:
    return sum(
        line.endswith("\\") and not line.endswith("\\\\")
        for line in body(markdown).splitlines()
    )


def page_break_count(path: Path) -> int:
    parser = ContentParser()
    parser.feed(path.read_text())
    return parser.breaks


def feed_contents(public_dir: Path) -> tuple[dict[str, str], dict[str, str]]:
    rss: dict[str, str] = {}
    root = ET.parse(public_dir / "feed.xml").getroot()
    for item in root.findall("./channel/item"):
        link = item.findtext("link")
        encoded = item.findtext(CONTENT_NS)
        if link and encoded is not None:
            rss[link] = encoded

    data = json.loads((public_dir / "feed.json").read_text())
    json_feed = {item["url"]: item["content_html"] for item in data["items"]}
    return rss, json_feed


def check_equal(
    errors: list[str], label: str, actual: object, expected: object
) -> None:
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument(
        "--fixture", type=Path, default=Path("tests/fixtures/content-parity.json")
    )
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    fixture_path = args.fixture if args.fixture.is_absolute() else root / args.fixture
    fixture = json.loads(fixture_path.read_text())
    errors: list[str] = []

    hugo_config = (root / "hugo.toml").read_text()
    check_equal(
        errors,
        "global Goldmark hardWraps",
        HARD_WRAPS_ENABLED.search(hugo_config) is not None,
        False,
    )

    rss, json_feed = feed_contents(public_dir)
    legacy_checked = 0
    classes: set[str] = set()

    for publication in fixture["publications"]:
        publication_id = publication["id"]
        classes.add(publication["fixture_class"])
        current_path = root / publication["current_source"]
        current_markdown = current_path.read_text()
        current_normalized = normalized_body(current_markdown)

        check_equal(
            errors,
            f"{publication_id} normalized body snapshot",
            digest(current_normalized),
            publication["normalized_sha256"],
        )
        check_equal(
            errors,
            f"{publication_id} source hard breaks",
            source_break_count(current_markdown),
            publication["source_hard_breaks"],
        )

        legacy_path = root / publication["legacy_source"]
        if legacy_path.exists():
            legacy_checked += 1
            check_equal(
                errors,
                f"{publication_id} normalized legacy/current body",
                current_normalized,
                normalized_body(legacy_path.read_text()),
            )

        html_path = public_dir / publication["html"]
        check_equal(
            errors,
            f"{publication_id} HTML breaks",
            page_break_count(html_path),
            publication["rendered_breaks"],
        )

        url = SITE_ORIGIN + publication["url_path"].lstrip("/")
        check_equal(
            errors,
            f"{publication_id} RSS breaks",
            len(BR.findall(rss.get(url, ""))),
            publication["rendered_breaks"],
        )
        check_equal(
            errors,
            f"{publication_id} JSON Feed breaks",
            len(BR.findall(json_feed.get(url, ""))),
            publication["rendered_breaks"],
        )

    skver = (root / "content/creativity/skver.md").read_text()
    for statement in fixture["required_skver_provenance"]:
        if statement not in skver:
            errors.append(f"skver provenance is missing {statement!r}")

    check_equal(
        errors, "line-break fixture classes", classes, set(fixture["fixture_classes"])
    )

    if errors:
        print("Content parity check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: {len(fixture['publications'])} body snapshots; "
        f"{legacy_checked} legacy comparisons; HTML, RSS and JSON Feed line breaks"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
