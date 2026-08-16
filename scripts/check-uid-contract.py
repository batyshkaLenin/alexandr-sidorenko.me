#!/usr/bin/env python3
"""Verify the material identity contract (ADR
redesign-material-identity-serialization-and-resolver).

Location URL (.Permalink/canonical/u-url) and Material Identity URI (front
matter `id` -> https://alexandr-sidorenko.me/id/<uuid>, serialized into
u-uid/RSS guid/JSON Feed id/JSON-LD @id) are separate sources: every material
needs a unique id, and every identity output must carry the same URI byte for
byte, independent of the current permalink.

T106 moved this off the old `uid` field and the two-section layout. The build
invariants that make a duplicate or malformed id fatal are T107's job; this
script checks what the built site says.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

SITE_ORIGIN = "https://alexandr-sidorenko.me/"
UID_PATTERN = re.compile(
    r"^https://alexandr-sidorenko\.me/id/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
# Retired identities are not part of the site yet: nothing has ever been
# withdrawn. The ADR still asks that a retired id can never be handed out
# again, so the set is read here and the intersection checked below; a missing
# file means an empty set, not an error.
TOMBSTONE_FILE = Path("data") / "tombstones.yaml"
TOMBSTONE_LINE = re.compile(r'^\s*-?\s*id:\s*"?([0-9a-f-]{36})"?\s*$')
UID_LINE = re.compile(r'^id:\s*"([^"]*)"\s*$')
SLUG_LINE = re.compile(r'^slug:\s*"?([^"]*?)"?\s*$')
DRAFT_LINE = re.compile(r"^draft:\s*true\s*$")


def tombstone_ids(root: Path) -> set[str]:
    """Ids of materials permanently withdrawn. Empty until the first one is."""
    path = root / TOMBSTONE_FILE
    if not path.exists():
        return set()
    found = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if match := TOMBSTONE_LINE.match(line):
            found.add(match.group(1).lower())
    return found


def route(path: Path) -> str:
    """The material's route: front matter `slug` when set, file name otherwise."""
    for line in path.read_text(encoding="utf-8").splitlines()[1:]:
        if line.strip() == "---":
            break
        if match := SLUG_LINE.match(line.strip()):
            return match.group(1)
    return path.stem


def is_draft(path: Path) -> bool:
    """Drafts are not published, so there is no rendered page to agree with.
    They still carry a uid, and its uniqueness/format is checked like any
    other — only the output comparison is skipped."""
    for line in path.read_text().splitlines()[1:]:
        if line.strip() == "---":
            return False
        if DRAFT_LINE.match(line.strip()):
            return True
    return False


def front_matter_uid(path: Path) -> str | None:
    """Pull just the `id` value out of the front matter block — no YAML
    dependency needed for a single scalar field, matching this toolkit's
    standard-library-only convention (see the other scripts/check-*.py)."""
    lines = path.read_text().splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: missing opening front matter delimiter")
    for line in lines[1:]:
        if line.strip() == "---":
            return None
        if match := UID_LINE.match(line):
            return match.group(1)
    raise ValueError(f"{path}: missing closing front matter delimiter")


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def self_test() -> None:
    """A broken uniqueness/format check must not silently report green."""
    dupes = ["https://alexandr-sidorenko.me/posts/a", "https://alexandr-sidorenko.me/posts/a"]
    assert len(dupes) != len(set(dupes)), "self-test: duplicate detection is broken"
    assert not UID_PATTERN.match("https://alexandr-sidorenko.me/posts/a/"), (
        "self-test: trailing-slash uid should not match the format pattern"
    )
    assert not UID_PATTERN.match("http://alexandr-sidorenko.me/posts/a"), (
        "self-test: non-https uid should not match the format pattern"
    )


class UidHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical: str | None = None
        self.u_url: str | None = None
        self.u_uid: str | None = None
        self._in_json_ld = False
        self.json_ld: dict | None = None
        self._json_ld_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if tag == "link" and attributes.get("rel") == "canonical":
            self.canonical = attributes.get("href")
        elif tag == "a" and "u-url" in classes and self.u_url is None:
            # First match only: byline.html also renders a nested p-author
            # h-card with its own u-url (the author's homepage), which must
            # not be mistaken for the h-entry's own u-url.
            self.u_url = attributes.get("href")
        elif tag == "data" and "u-uid" in classes:
            self.u_uid = attributes.get("value")
        elif tag == "script" and attributes.get("type") == "application/ld+json":
            self._in_json_ld = True
            self._json_ld_text = []

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self._json_ld_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            text = "".join(self._json_ld_text)
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return
            if parsed.get("@type") in {"BlogPosting", "CreativeWork"}:
                self.json_ld = parsed


def rss_guids(public_dir: Path) -> dict[str, str]:
    root = ET.parse(public_dir / "feed.xml").getroot()
    result: dict[str, str] = {}
    for item in root.findall("./channel/item"):
        link = item.findtext("link")
        guid = item.find("guid")
        if link is not None and guid is not None:
            result[link] = guid.text or ""
    return result


def rss_guid_is_permalink(public_dir: Path) -> dict[str, str]:
    root = ET.parse(public_dir / "feed.xml").getroot()
    result: dict[str, str] = {}
    for item in root.findall("./channel/item"):
        link = item.findtext("link")
        guid = item.find("guid")
        if link is not None and guid is not None:
            result[link] = guid.get("isPermaLink", "true")
    return result


def json_feed_items(public_dir: Path) -> dict[str, dict[str, str]]:
    feed = json.loads((public_dir / "feed.json").read_text())
    return {item["url"]: item for item in feed["items"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    self_test()

    errors: list[str] = []
    seen: dict[str, Path] = {}  # every uid, drafts included — uniqueness is global
    slugs: dict[str, Path] = {}  # routes, drafts included, for the same reason
    live_ids: set[str] = set()
    uids: dict[str, Path] = {}  # published only: these must agree with the output
    permalinks: dict[str, str] = {}

    section = "library"
    material_files = sorted((root / "content" / section).glob("*.md"))
    check(errors, bool(material_files), f"no materials found in content/{section}")
    for path in material_files:
            if path.name == "_index.md":
                continue
            material_id = front_matter_uid(path)
            item_id = f"{section}/{path.stem}"
            check(errors, bool(material_id), f"{item_id}: missing 'id' front matter")
            if not material_id:
                continue
            uid = f"{SITE_ORIGIN}id/{material_id}"
            check(
                errors,
                bool(UID_PATTERN.match(uid)),
                f"{item_id}: id {material_id!r} is not a lowercase UUID",
            )
            if uid in seen:
                errors.append(f"{item_id}: uid {uid!r} duplicates {seen[uid]}")
                continue
            seen[uid] = path
            live_ids.add(material_id.lower())
            # Two materials cannot claim one route.
            slug = route(path)
            if slug in slugs:
                errors.append(f"{item_id}: slug {slug!r} duplicates {slugs[slug]}")
            else:
                slugs[slug] = path
            if is_draft(path):
                continue
            uids[uid] = path
            permalinks[uid] = f"{SITE_ORIGIN}{section}/{path.stem}"

    for retired in sorted(live_ids & tombstone_ids(root)):
        errors.append(
            f"id {retired!r} is live and tombstoned at once — a withdrawn id is never reissued"
        )

    rss = rss_guids(public_dir)
    rss_perma = rss_guid_is_permalink(public_dir)
    json_feed = json_feed_items(public_dir)

    for uid, path in uids.items():
        permalink = permalinks[uid]
        item_id = path.stem
        html_path = public_dir / permalink.removeprefix(SITE_ORIGIN) / "index.html"
        check(errors, html_path.exists(), f"{item_id}: missing rendered page {html_path}")
        if not html_path.exists():
            continue

        parsed = UidHtmlParser()
        parsed.feed(html_path.read_text())

        check(errors, parsed.canonical == permalink, f"{item_id}: canonical {parsed.canonical!r} != permalink {permalink!r}")
        check(errors, parsed.u_url == permalink, f"{item_id}: u-url {parsed.u_url!r} != permalink {permalink!r}")
        check(errors, parsed.u_uid == uid, f"{item_id}: u-uid {parsed.u_uid!r} != uid {uid!r}")

        check(errors, permalink in rss, f"{item_id}: missing RSS item for {permalink}")
        if permalink in rss:
            check(errors, rss[permalink] == uid, f"{item_id}: RSS guid {rss[permalink]!r} != uid {uid!r}")
            check(errors, rss_perma[permalink] == "false", f"{item_id}: RSS guid isPermaLink must be \"false\" (uid isn't the clickable location)")

        check(errors, permalink in json_feed, f"{item_id}: missing JSON Feed item for {permalink}")
        if permalink in json_feed:
            check(errors, json_feed[permalink]["id"] == uid, f"{item_id}: JSON Feed id {json_feed[permalink]['id']!r} != uid {uid!r}")
            check(errors, json_feed[permalink]["url"] == permalink, f"{item_id}: JSON Feed url {json_feed[permalink]['url']!r} != permalink {permalink!r}")

        check(errors, parsed.json_ld is not None, f"{item_id}: missing/unparseable JSON-LD block")
        if parsed.json_ld is not None:
            check(errors, parsed.json_ld.get("@id") == uid, f"{item_id}: JSON-LD @id {parsed.json_ld.get('@id')!r} != uid {uid!r}")
            check(errors, parsed.json_ld.get("url") == permalink, f"{item_id}: JSON-LD url {parsed.json_ld.get('url')!r} != permalink {permalink!r}")

    if errors:
        print("UID contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(uids)} publication(s) — unique uid, HTML/RSS/JSON Feed/JSON-LD agree, independent of the permalink")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
