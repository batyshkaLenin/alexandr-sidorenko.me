#!/usr/bin/env python3
"""Fetch incoming Webmentions from webmention.io into the local inbox (T8).

Reads the public JF2 API once per published target URL, normalizes what comes
back to the small field set the site publishes, drops anything already approved
or denied, and writes the rest to `tmp/webmentions-inbox.json` — a gitignored
staging file, so an unreviewed stranger's text never lands in a public
repository.

Nothing here touches `data/webmentions.json`: approving is a separate,
offline step (`moderate-webmentions.py`), and the build never runs either
script. See ADR `redesign-webmention-moderation-contract`.

The domain-wide endpoint would need an API token; per-target queries are public,
so this script needs no credentials at all.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

API = "https://webmention.io/api/mentions.jf2"
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
# webmention.io reports the kind of mention as the JF2 property that held the
# target URL. Anything outside this map is an unadorned mention.
WM_PROPERTIES = {
    "in-reply-to": "reply",
    "like-of": "like",
    "repost-of": "repost",
    "bookmark-of": "bookmark",
    "mention-of": "mention",
}
CONTENT_LIMIT = 640
TIMEOUT = 30


class TagStripper(HTMLParser):
    """Last-resort plain-text guard for a field that should already be plain.

    Text inside script/style is dropped rather than kept: it is not prose, and
    a stray `alert(1)` reading like a sentence in someone's reply is worse than
    nothing, even though the value is escaped as text either way.
    """

    SKIPPED = ("script", "style")

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skipping = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIPPED:
            self.skipping += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIPPED and self.skipping:
            self.skipping -= 1

    def handle_data(self, data: str) -> None:
        if not self.skipping:
            self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


def plain_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    stripper = TagStripper()
    stripper.feed(value)
    text = stripper.text()
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > CONTENT_LIMIT:
        text = text[:CONTENT_LIMIT].rstrip() + "…"
    return text


def targets_from_sitemap(sitemap: Path) -> list[str]:
    root = ElementTree.fromstring(sitemap.read_text())
    return [node.text.strip() for node in root.findall(".//sm:loc", SITEMAP_NS) if node.text]


def denied(entry: dict[str, str], denylist: dict[str, set[str]]) -> bool:
    for field in ("source", "author_url"):
        url = entry.get(field) or ""
        host = urllib.parse.urlparse(url).hostname or ""
        if host.lower().lstrip("www.") in denylist["domains"] or host.lower() in denylist["domains"]:
            return True
    return entry.get("author_url", "") in denylist["authors"]


def load_denylist(root: Path) -> dict[str, set[str]]:
    path = root / "data" / "webmention-denylist.yaml"
    domains: set[str] = set()
    authors: set[str] = set()
    if not path.exists():
        return {"domains": domains, "authors": authors}
    bucket = None
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped in ("domains:", "authors:"):
            bucket = domains if stripped == "domains:" else authors
            continue
        if stripped.startswith("- ") and bucket is not None:
            bucket.add(stripped[2:].strip().strip("\"'").lower())
    return {"domains": domains, "authors": authors}


def normalize(item: dict[str, Any]) -> dict[str, str] | None:
    """Keep only the contract's fields; drop the rest, including author photo."""
    identifier = item.get("wm-id")
    target = item.get("wm-target")
    source = item.get("wm-source") or item.get("url")
    if identifier is None or not target or not source:
        return None

    author = item.get("author") or {}
    content = item.get("content") or {}
    # `content.html` is deliberately ignored: the contract stores no foreign
    # HTML at all, so there is nothing to sanitize later.
    text = plain_text(content.get("text") if isinstance(content, dict) else "")

    return {
        "id": f"wm-{identifier}",
        "type": WM_PROPERTIES.get(item.get("wm-property", ""), "mention"),
        "target": str(target),
        "source": str(source),
        "author_name": plain_text(author.get("name") if isinstance(author, dict) else ""),
        "author_url": str(author.get("url") or "") if isinstance(author, dict) else "",
        "published": str(item.get("published") or item.get("wm-received") or ""),
        "content_text": text,
    }


def fetch_target(target: str) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"target": target, "per-page": 100})
    request = urllib.request.Request(
        f"{API}?{query}", headers={"User-Agent": "alexandr-sidorenko.me webmention import"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        payload = json.load(response)
    children = payload.get("children")
    return children if isinstance(children, list) else []


def approved_ids(root: Path) -> set[str]:
    path = root / "data" / "webmentions.json"
    if not path.exists():
        return set()
    snapshot = json.loads(path.read_text())
    return {entry["id"] for entry in snapshot.get("mentions", []) if "id" in entry}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--sitemap",
        type=Path,
        default=Path("public/sitemap.xml"),
        help="built sitemap the target list is read from",
    )
    parser.add_argument(
        "--inbox", type=Path, default=Path("tmp/webmentions-inbox.json"), help="gitignored staging file"
    )
    args = parser.parse_args()

    root = args.root.resolve()
    sitemap = args.sitemap if args.sitemap.is_absolute() else root / args.sitemap
    inbox_path = args.inbox if args.inbox.is_absolute() else root / args.inbox

    if not sitemap.exists():
        print(f"{sitemap}: no sitemap — build the site first", file=sys.stderr)
        return 1

    denylist = load_denylist(root)
    already = approved_ids(root)
    pending: dict[str, dict[str, str]] = {}
    failures: list[str] = []

    for target in targets_from_sitemap(sitemap):
        try:
            children = fetch_target(target)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            failures.append(f"{target}: {error}")
            continue
        for item in children:
            entry = normalize(item)
            if entry is None or entry["id"] in already or denied(entry, denylist):
                continue
            pending[entry["id"]] = entry

    if failures:
        print("webmention.io unreachable for some targets:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        # The inbox is staging, not the published snapshot: a partial fetch is
        # written anyway so the reachable half can still be reviewed, and the
        # non-zero exit says the run was incomplete.

    inbox_path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(pending.values(), key=lambda entry: (entry["published"], entry["id"]))
    inbox_path.write_text(json.dumps({"mentions": ordered}, ensure_ascii=False, indent=2) + "\n")

    if not ordered:
        print("Ничего нового: одобрять нечего.")
    else:
        print(f"Новых упоминаний: {len(ordered)} → {inbox_path}")
        for entry in ordered:
            author = entry["author_name"] or entry["author_url"] or "без имени"
            print(f"  {entry['id']}  {entry['type']:8}  {author}")
            print(f"    {entry['source']} → {entry['target']}")
            if entry["content_text"]:
                print(f"    {entry['content_text']}")
        print("\nОдобрить: scripts/moderate-webmentions.py --approve <id> [<id>...]")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
