#!/usr/bin/env python3
"""Verify body, embedded URL, audio and author contracts in generated feeds.

The author part is deliberately cross-surface (T13): one publication is named
by its byline h-card, by the hidden p-author of its section card, by RSS
dc:creator and by the JSON Feed author object, and all four are built from
data/authors.yaml. Checking them against one fixture value is what stops the
four from drifting apart again.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin

SITE_ORIGIN = "https://alexandr-sidorenko.me/"
CONTENT_NS = "{http://purl.org/rss/1.0/modules/content/}encoded"
CREATOR_NS = "{http://purl.org/dc/elements/1.1/}creator"
EMBEDDED_URL = re.compile(r"(?:href|src)=[\"']([^\"']+)", re.IGNORECASE)


class CardParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.cards: dict[str, str] = {}
        self.authors: dict[str, str] = {}
        self._card: dict[str, str] | None = None
        self._summary: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if tag == "li" and "h-entry" in classes:
            self._card = {}
        elif self._card is not None and tag == "a" and "p-name" in classes:
            self._card["href"] = attributes.get("href") or ""
        elif self._card is not None and tag == "data" and "p-author" in classes:
            self._card["author"] = attributes.get("value") or ""
        elif self._card is not None and tag == "p" and "p-summary" in classes:
            self._summary = []

    def handle_data(self, data: str) -> None:
        if self._summary is not None:
            self._summary.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self._summary is not None and self._card is not None:
            self._card["summary"] = " ".join("".join(self._summary).split())
            self._summary = None
        elif tag == "li" and self._card is not None:
            href = self._card.get("href")
            if href:
                url = urljoin(SITE_ORIGIN, href)
                self.cards[url] = self._card.get("summary", "")
                self.authors[url] = self._card.get("author", "")
            self._card = None


class BylineParser(HTMLParser):
    """Reads the author name(s) from a publication page's byline h-card."""

    def __init__(self) -> None:
        super().__init__()
        self.names: list[str] = []
        self._in_byline = False
        self._name: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = (dict(attrs).get("class") or "").split()
        if "byline" in classes:
            self._in_byline = True
        elif self._in_byline and "p-name" in classes:
            self._name = []

    def handle_data(self, data: str) -> None:
        if self._name is not None:
            self._name.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._name is not None and tag in ("a", "span"):
            self.names.append(" ".join("".join(self._name).split()))
            self._name = None
        elif self._in_byline and tag == "p":
            self._in_byline = False


def normalized(value: str) -> str:
    return " ".join(value.split())


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def rss_items(public_dir: Path) -> dict[str, dict[str, object]]:
    root = ET.parse(public_dir / "feed.xml").getroot()
    result: dict[str, dict[str, object]] = {}
    for item in root.findall("./channel/item"):
        url = item.findtext("link")
        if url:
            result[url] = {
                "summary": item.findtext("description") or "",
                "content": item.findtext(CONTENT_NS) or "",
                "author": item.findtext(CREATOR_NS) or "",
                "enclosures": [element.attrib for element in item.findall("enclosure")],
            }
    return result


def json_items(public_dir: Path) -> dict[str, dict[str, object]]:
    feed = json.loads((public_dir / "feed.json").read_text())
    return {item["url"]: item for item in feed["items"]}


def section_cards(public_dir: Path) -> CardParser:
    parser = CardParser()
    for section in ("posts", "creativity"):
        parser.feed((public_dir / section / "index.html").read_text())
    return parser


def expected_audio(root: Path, audio: dict[str, str]) -> dict[str, object]:
    source = audio["src"]
    static_file = root / "static" / source.lstrip("/")
    return {
        "url": SITE_ORIGIN.rstrip("/") + quote(source, safe="/"),
        "mime_type": audio["type"],
        "size_in_bytes": static_file.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument(
        "--fixture", type=Path, default=Path("tests/fixtures/feed-contract.json")
    )
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    fixture_path = args.fixture if args.fixture.is_absolute() else root / args.fixture
    fixture = json.loads(fixture_path.read_text())
    rss = rss_items(public_dir)
    json_feed = json_items(public_dir)
    card_parser = section_cards(public_dir)
    cards = card_parser.cards
    errors: list[str] = []

    check(errors, len(rss) == len(fixture["items"]), "RSS item count changed")
    check(
        errors, len(json_feed) == len(fixture["items"]), "JSON Feed item count changed"
    )

    for item in fixture["items"]:
        item_id = item["id"]
        url = urljoin(SITE_ORIGIN, item["url_path"].lstrip("/"))
        check(errors, url in rss, f"{item_id}: missing RSS item")
        check(errors, url in json_feed, f"{item_id}: missing JSON Feed item")
        check(errors, url in cards, f"{item_id}: missing section card")
        if url not in rss or url not in json_feed:
            continue

        rss_item = rss[url]
        json_item = json_feed[url]
        rss_content = str(rss_item["content"])
        json_content = str(json_item["content_html"])
        check(
            errors,
            normalized(rss_content) == normalized(json_content),
            f"{item_id}: RSS and JSON Feed content differ",
        )
        check(
            errors,
            str(rss_item["summary"]) == str(json_item["summary"]) == cards.get(url),
            f"{item_id}: feed and card summaries differ",
        )

        if expected_author := item.get("author"):
            byline = BylineParser()
            byline.feed((public_dir / item["html"]).read_text())
            surfaces = {
                "byline": byline.names,
                "section card": [card_parser.authors.get(url, "")],
                "RSS dc:creator": [str(rss_item["author"])],
                "JSON Feed": [a.get("name") for a in json_item.get("authors", [])],
            }
            for surface, names in surfaces.items():
                check(
                    errors,
                    names == [expected_author],
                    f"{item_id}: {surface} names {names} != [{expected_author!r}]",
                )

        check(
            errors,
            item["body_marker"] in rss_content,
            f"{item_id}: full RSS body missing",
        )
        check(
            errors,
            item["body_marker"] in json_content,
            f"{item_id}: full JSON Feed body missing",
        )
        check(
            errors,
            item["body_marker"] in (public_dir / item["html"]).read_text(),
            f"{item_id}: body missing from page HTML",
        )
        check(
            errors,
            cards.get(url) == item["card_summary"],
            f"{item_id}: card summary drifted from the publication description",
        )

        for content_name, content in (
            ("RSS", rss_content),
            ("JSON Feed", json_content),
        ):
            relative = [
                value
                for value in EMBEDDED_URL.findall(content)
                if value.startswith("/")
            ]
            check(
                errors,
                not relative,
                f"{item_id}: {content_name} has relative URLs {relative}",
            )
            # A substring, so an image expectation is pinned to the address up
            # to Hugo's content hash rather than to the whole filename (T66).
            # Re-encoding an image changes that hash by design; it must not
            # change which image the feed points at, and that is what is worth
            # failing on.
            for expected_url in item.get("expected_urls", []):
                check(
                    errors,
                    expected_url in content,
                    f"{item_id}: {content_name} lost {expected_url}",
                )

        enclosures = list(rss_item["enclosures"])
        attachments = list(json_item.get("attachments", []))
        if audio := item.get("audio"):
            expected = expected_audio(root, audio)
            check(
                errors,
                attachments == [expected],
                f"{item_id}: JSON attachment metadata differs",
            )
            expected_enclosure = {
                "url": expected["url"],
                "type": expected["mime_type"],
                "length": str(expected["size_in_bytes"]),
            }
            check(
                errors,
                enclosures == [expected_enclosure],
                f"{item_id}: RSS enclosure metadata differs",
            )
        else:
            check(errors, not attachments, f"{item_id}: unexpected JSON attachments")
            check(errors, not enclosures, f"{item_id}: unexpected RSS enclosures")

    if errors:
        print("Feed contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: {len(fixture['items'])} feed items; body, URL, audio, XML and JSON contracts"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
