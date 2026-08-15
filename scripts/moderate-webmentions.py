#!/usr/bin/env python3
"""Approve, remove or block incoming Webmentions (T8).

Approving moves an entry from the gitignored inbox into
`data/webmentions.json`, the snapshot Hugo reads: what is in that file is
exactly what the site publishes, so a removal request is served by taking the
entry back out and rebuilding. Nothing here needs the network.

See ADR `redesign-webmention-moderation-contract`.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

CONTRACT = 1
FIELDS = (
    "id",
    "type",
    "target",
    "source",
    "author_name",
    "author_url",
    "published",
    "content_text",
)


def load(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_snapshot(path: Path, mentions: list[dict[str, str]]) -> None:
    payload = {
        "contract": CONTRACT,
        "updated": date.today().isoformat(),
        "mentions": sorted(mentions, key=lambda entry: (entry["published"], entry["id"])),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def append_denylist(path: Path, domains: list[str]) -> None:
    """Keep the file readable by hand; it is short and edited rarely."""
    existing = path.read_text() if path.exists() else "domains:\nauthors:\n"
    lines = existing.splitlines()
    if "domains:" not in lines:
        lines.insert(0, "domains:")
    index = lines.index("domains:")
    for domain in domains:
        entry = f"  - {domain.lower()}"
        if entry not in lines:
            lines.insert(index + 1, entry)
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--inbox", type=Path, default=Path("tmp/webmentions-inbox.json"))
    parser.add_argument("--approve", nargs="+", metavar="ID", help="publish these inbox entries")
    parser.add_argument("--remove", nargs="+", metavar="ID", help="unpublish these approved entries")
    parser.add_argument("--deny-domain", nargs="+", metavar="DOMAIN", help="never offer these again")
    parser.add_argument("--list", action="store_true", help="show what is published now")
    args = parser.parse_args()

    root = args.root.resolve()
    inbox_path = args.inbox if args.inbox.is_absolute() else root / args.inbox
    snapshot_path = root / "data" / "webmentions.json"
    denylist_path = root / "data" / "webmention-denylist.yaml"

    snapshot = load(snapshot_path, {"contract": CONTRACT, "mentions": []})
    published: dict[str, dict[str, str]] = {entry["id"]: entry for entry in snapshot.get("mentions", [])}

    if args.list:
        if not published:
            print("Опубликованных упоминаний нет.")
        for entry in published.values():
            print(f"{entry['id']}  {entry['type']:8}  {entry['author_name'] or entry['author_url']}")
            print(f"  {entry['source']} → {entry['target']}")
        return 0

    changed = False

    if args.approve:
        inbox = {entry["id"]: entry for entry in load(inbox_path, {"mentions": []}).get("mentions", [])}
        missing = [identifier for identifier in args.approve if identifier not in inbox]
        if missing:
            print(f"нет во входящих: {', '.join(missing)}", file=sys.stderr)
            return 1
        for identifier in args.approve:
            entry = inbox[identifier]
            published[identifier] = {field: entry.get(field, "") for field in FIELDS}
            print(f"одобрено: {identifier}")
        changed = True

    if args.remove:
        for identifier in args.remove:
            if published.pop(identifier, None) is None:
                print(f"не опубликовано: {identifier}", file=sys.stderr)
                return 1
            print(f"снято с публикации: {identifier}")
        changed = True

    if args.deny_domain:
        append_denylist(denylist_path, args.deny_domain)
        print(f"в deny-list: {', '.join(args.deny_domain)}")

    if changed:
        write_snapshot(snapshot_path, list(published.values()))
        print(f"{snapshot_path}: {len(published)} упоминани(й) — пересоберите сайт и закоммитьте")
    elif not args.deny_domain:
        parser.print_help()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
