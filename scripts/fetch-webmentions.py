#!/usr/bin/env python3
"""Fetch domain-wide Webmentions into the local moderation inbox.

The token is read only from ``WEBMENTION_IO_TOKEN``. The command is an offline
owner tool: it never runs during Hugo build and never writes the published
snapshot. Domain-wide discovery is what makes targets with fragments visible;
the local address registry decides which of those URLs belong to materials.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from webmention_targets import (
    BASE_URL,
    RegistryError,
    build_registry,
    fetch_domain_mentions,
    interaction_key,
    resolve_target,
)

WM_PROPERTIES = {
    "in-reply-to": "reply",
    "like-of": "like",
    "repost-of": "repost",
    "bookmark-of": "bookmark",
    "mention-of": "mention",
}
CONTENT_LIMIT = 640
MUTABLE_FIELDS = (
    "type",
    "source",
    "author_name",
    "author_url",
    "published",
    "content_text",
)


class TagStripper(HTMLParser):
    """Last-resort plain-text guard for fields that should already be plain."""

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
    text = re.sub(r"\s+", " ", stripper.text()).strip()
    if len(text) > CONTENT_LIMIT:
        text = text[:CONTENT_LIMIT].rstrip() + "…"
    return text


def denied(entry: dict[str, Any], denylist: dict[str, set[str]]) -> bool:
    for field in ("source", "author_url"):
        url = str(entry.get(field) or "")
        host = urllib.parse.urlparse(url).hostname or ""
        normalized = host.lower()
        if (
            normalized in denylist["domains"]
            or normalized.removeprefix("www.") in denylist["domains"]
        ):
            return True
    return str(entry.get("author_url") or "").lower() in denylist["authors"]


def load_denylist(root: Path) -> dict[str, set[str]]:
    path = root / "data" / "webmention-denylist.yaml"
    domains: set[str] = set()
    authors: set[str] = set()
    if not path.exists():
        return {"domains": domains, "authors": authors}
    bucket: set[str] | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped in ("domains:", "authors:"):
            bucket = domains if stripped == "domains:" else authors
            continue
        if stripped.startswith("- ") and bucket is not None:
            bucket.add(stripped[2:].strip().strip("\"'").lower())
    return {"domains": domains, "authors": authors}


def normalize(item: dict[str, Any]) -> dict[str, Any] | None:
    """Keep only reviewable fields and preserve the received target verbatim."""
    identifier = item.get("wm-id")
    target = item.get("wm-target")
    source = item.get("wm-source") or item.get("url")
    if identifier is None or not target or not source:
        return None

    author = item.get("author") or {}
    content = item.get("content") or {}
    text = plain_text(content.get("text") if isinstance(content, dict) else "")
    return {
        "id": f"wm-{identifier}",
        "type": WM_PROPERTIES.get(item.get("wm-property", ""), "mention"),
        "targetReceived": str(target),
        "source": str(source),
        "author_name": plain_text(
            author.get("name") if isinstance(author, dict) else ""
        ),
        "author_url": str(author.get("url") or "") if isinstance(author, dict) else "",
        "published": str(item.get("published") or item.get("wm-received") or ""),
        "content_text": text,
    }


def load_published(root: Path) -> dict[tuple[str, str], dict[str, Any]]:
    path = root / "data" / "webmentions.json"
    if not path.exists():
        return {}
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if snapshot.get("contract") != 2:
        return {}
    return {
        interaction_key(entry): entry
        for entry in snapshot.get("mentions", [])
        if isinstance(entry, dict) and isinstance(entry.get("target"), dict)
    }


def unchanged(entry: dict[str, Any], published: dict[str, Any]) -> bool:
    return all(
        entry.get(field, "") == published.get(field, "") for field in MUTABLE_FIELDS
    )


def prepare_inbox(
    raw_mentions: list[dict[str, Any]],
    registry: Any,
    public_dir: Path,
    denylist: dict[str, set[str]],
    published: dict[tuple[str, str], dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, str]], list[str]]:
    pending: dict[tuple[str, str], dict[str, Any]] = {}
    unresolved: list[dict[str, str]] = []
    diagnostics: list[str] = []

    for item in raw_mentions:
        entry = normalize(item)
        if entry is None or denied(entry, denylist):
            continue
        resolution = resolve_target(entry["targetReceived"], registry, public_dir)
        if resolution.status in {"foreign", "unsupported"}:
            diagnostics.append(f"{entry['id']}: {resolution.diagnostic}")
            continue
        if resolution.status == "unresolved" or resolution.target is None:
            unresolved.append(
                {
                    "id": entry["id"],
                    "source": entry["source"],
                    "targetReceived": entry["targetReceived"],
                    "reason": resolution.diagnostic or "unresolved",
                }
            )
            continue

        entry["target"] = resolution.target
        if resolution.target_snapshot:
            entry["targetSnapshot"] = resolution.target_snapshot
        if resolution.diagnostic:
            entry["targetDiagnostic"] = resolution.diagnostic
        key = interaction_key(entry)
        previous = published.get(key)
        if previous is not None and unchanged(entry, previous):
            continue
        current = pending.get(key)
        if current is None or (entry["published"], entry["id"]) > (
            current["published"],
            current["id"],
        ):
            pending[key] = entry

    ordered = sorted(
        pending.values(), key=lambda entry: (entry["published"], entry["id"])
    )
    unresolved.sort(key=lambda entry: entry["id"])
    return ordered, unresolved, diagnostics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument(
        "--inbox", type=Path, default=Path("tmp/webmentions-inbox.json")
    )
    parser.add_argument(
        "--since", help="optional webmention.io creation timestamp cursor"
    )
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    inbox_path = args.inbox if args.inbox.is_absolute() else root / args.inbox
    token = os.environ.get("WEBMENTION_IO_TOKEN", "")
    if not token:
        print("WEBMENTION_IO_TOKEN is required for domain-wide fetch", file=sys.stderr)
        return 2
    if not public_dir.is_dir():
        print(
            f"{public_dir}: no built site — build it before resolving targets",
            file=sys.stderr,
        )
        return 2

    try:
        registry = build_registry(root)
        raw_mentions = fetch_domain_mentions(
            token,
            urllib.parse.urlsplit(BASE_URL).hostname or "",
            args.since,
        )
    except (
        RegistryError,
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
        RuntimeError,
    ) as error:
        print(f"webmention fetch failed: {error}", file=sys.stderr)
        return 1

    denylist = load_denylist(root)
    published = load_published(root)
    ordered, unresolved, diagnostics = prepare_inbox(
        raw_mentions,
        registry,
        public_dir,
        denylist,
        published,
    )
    inbox_path.parent.mkdir(parents=True, exist_ok=True)
    inbox_path.write_text(
        json.dumps(
            {"mentions": ordered, "unresolved": unresolved},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    for diagnostic in diagnostics:
        print(f"пропущено: {diagnostic}", file=sys.stderr)
    for entry in unresolved:
        print(f"на разбор: {entry['id']}: {entry['reason']}", file=sys.stderr)

    if not ordered:
        print("Ничего нового: одобрять нечего.")
    else:
        print(f"Новых или изменённых упоминаний: {len(ordered)} → {inbox_path}")
        for entry in ordered:
            author = entry["author_name"] or entry["author_url"] or "без имени"
            print(f"  {entry['id']}  {entry['type']:8}  {author}")
            print(f"    {entry['source']} → {entry['targetReceived']}")
            if entry.get("targetDiagnostic"):
                print(f"    target: document ({entry['targetDiagnostic']})")
            if entry["content_text"]:
                print(f"    {entry['content_text']}")
        print("\nОдобрить: scripts/moderate-webmentions.py --approve <id> [<id>...]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
