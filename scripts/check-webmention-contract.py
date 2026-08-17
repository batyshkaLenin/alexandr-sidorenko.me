#!/usr/bin/env python3
"""Verify the published Webmention snapshot and its rendering (T8, T141).

The snapshot in `data/webmentions.json` is the only thing that reaches readers,
so this checks both halves of the contract (ADR
`redesign-webmention-moderation-contract`): the stored fields carry no foreign
HTML, no avatar and no contact data, and every stored mention actually appears
on its own page.

Since T141 the `responses/` block is printed on every publication, because the
invitation to answer is useful before anyone has. What must not appear on a page
without approved mentions is a *response* — an entry, a count, a heading — and
that is what the emptiness check looks for now, rather than the block itself.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

BASE_URL = "https://alexandr-sidorenko.me"
REQUIRED_FIELDS = {
    "id",
    "type",
    "target",
    "source",
    "author_name",
    "author_url",
    "published",
    "content_text",
}
ALLOWED_TYPES = {"reply", "like", "repost", "bookmark", "mention"}
CONTENT_LIMIT = 640
MARKUP = re.compile(r"<[a-zA-Z/!]")
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}")


class SectionParser(HTMLParser):
    """Collects the responses block's hrefs, its entries and any image inside."""

    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.sources: list[str] = []
        self.images: list[str] = []
        self.sections = 0
        self.responses: list[str] = []

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
        if tag == "a" and attributes.get("href"):
            self.sources.append(attributes["href"])
        if tag in ("img", "picture", "source"):
            self.images.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == "section" and self.depth:
            self.depth -= 1


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def check_entry(errors: list[str], entry: dict, index: int) -> None:
    where = entry.get("id") or f"mentions[{index}]"
    extra = set(entry) - REQUIRED_FIELDS
    check(errors, not extra, f"{where}: fields outside the contract: {sorted(extra)}")
    missing = REQUIRED_FIELDS - set(entry)
    check(errors, not missing, f"{where}: missing field(s): {sorted(missing)}")
    if missing:
        return

    check(errors, entry["type"] in ALLOWED_TYPES, f"{where}: unknown type {entry['type']!r}")
    check(
        errors,
        entry["target"].startswith(f"{BASE_URL}/") and not entry["target"].endswith("/"),
        f"{where}: target is not a canonical site URL: {entry['target']!r}",
    )
    for field in ("source", "author_url"):
        value = entry[field]
        check(
            errors,
            value == "" or value.startswith("http://") or value.startswith("https://"),
            f"{where}: {field} is not an absolute URL: {value!r}",
        )
    for field in ("author_name", "content_text"):
        check(errors, not MARKUP.search(entry[field]), f"{where}: {field} contains markup")
    check(
        errors,
        len(entry["content_text"]) <= CONTENT_LIMIT + 1,
        f"{where}: content_text longer than the {CONTENT_LIMIT}-character limit",
    )
    for field in ("author_name", "content_text", "author_url"):
        check(errors, not EMAIL.search(entry[field]), f"{where}: {field} looks like it holds an e-mail")


def page_for(public_dir: Path, target: str) -> Path:
    return public_dir / target[len(BASE_URL) :].lstrip("/") / "index.html"


def check_rendering(errors: list[str], public_dir: Path, mentions: list[dict]) -> None:
    by_target: dict[str, list[dict]] = {}
    for entry in mentions:
        by_target.setdefault(entry["target"], []).append(entry)

    for target, entries in by_target.items():
        page = page_for(public_dir, target)
        if not page.exists():
            errors.append(f"{target}: approved mention(s) point at a page that is not published")
            continue
        parser = SectionParser()
        parser.feed(page.read_text())
        check(errors, parser.sections == 1, f"{target}: expected one responses block, found {parser.sections}")
        check(errors, not parser.images, f"{target}: responses block renders an image — avatars are not published")
        check(
            errors,
            len(parser.responses) > 0,
            f"{target}: approved mentions exist, but the block shows no response entries",
        )
        collapsed = "reactions" in parser.responses
        for entry in entries:
            # Likes, reposts and bookmarks may collapse into a count once there
            # are enough of them (§37.3), and then their sources are
            # deliberately not printed. Replies and mentions always are: they
            # carry someone's words, and a count would hide them.
            if entry["type"] in {"like", "repost", "bookmark"} and collapsed:
                continue
            check(
                errors,
                entry["source"] in parser.sources,
                f"{target}: approved mention {entry['id']} is not rendered on the page",
            )

    for page in public_dir.rglob("index.html"):
        relative = page.relative_to(public_dir).parent.as_posix()
        target = BASE_URL if relative == "." else f"{BASE_URL}/{relative}"
        if target in by_target:
            continue
        parser = SectionParser()
        parser.feed(page.read_text())
        if parser.responses:
            errors.append(
                f"{target}: shows {len(parser.responses)} response(s) without any approved mention"
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    snapshot_path = root / "data" / "webmentions.json"
    errors: list[str] = []
    if not snapshot_path.exists():
        print(f"{snapshot_path}: missing snapshot", file=sys.stderr)
        return 1

    snapshot = json.loads(snapshot_path.read_text())
    check(errors, snapshot.get("contract") == 1, "snapshot: unknown contract version")
    mentions = snapshot.get("mentions")
    check(errors, isinstance(mentions, list), "snapshot: mentions is not a list")
    if not isinstance(mentions, list):
        mentions = []

    identifiers = [entry.get("id") for entry in mentions]
    check(
        errors,
        len(identifiers) == len(set(identifiers)),
        f"snapshot: duplicate id(s): {[i for i in identifiers if identifiers.count(i) > 1]}",
    )
    for index, entry in enumerate(mentions):
        check_entry(errors, entry, index)

    if not errors:
        check_rendering(errors, public_dir, mentions)

    if errors:
        print("webmention contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(mentions)} approved mention(s), no foreign markup, no avatars, rendering matches the snapshot")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
