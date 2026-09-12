#!/usr/bin/env python3
"""Approve, update, remove or block incoming Webmentions.

Approval resolves the received target again against the current built material.
That moment creates the immutable quote snapshot; unreviewed inbox data never
becomes the authority for published target text.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from webmention_targets import (
    RegistryError,
    build_registry,
    interaction_key,
    resolve_target,
)

CONTRACT = 2
MUTABLE_FIELDS = (
    "type",
    "source",
    "author_name",
    "author_url",
    "published",
    "content_text",
)


def load(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_snapshot(path: Path, mentions: list[dict[str, Any]]) -> None:
    payload = {
        "contract": CONTRACT,
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "mentions": sorted(
            mentions, key=lambda entry: (entry["published"], entry["id"])
        ),
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def append_denylist(path: Path, domains: list[str]) -> None:
    """Keep the file readable by hand; it is short and edited rarely."""
    existing = (
        path.read_text(encoding="utf-8") if path.exists() else "domains:\nauthors:\n"
    )
    lines = existing.splitlines()
    if "domains:" not in lines:
        lines.insert(0, "domains:")
    index = lines.index("domains:")
    for domain in domains:
        entry = f"  - {domain.lower()}"
        if entry not in lines:
            lines.insert(index + 1, entry)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def capture_time() -> str:
    return (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def approved_entry(
    staged: dict[str, Any],
    target: dict[str, Any],
    target_snapshot: dict[str, str] | None,
) -> dict[str, Any]:
    entry = {
        "id": staged["id"],
        "type": staged.get("type", "mention"),
        "targetReceived": staged["targetReceived"],
        "target": target,
        "source": staged.get("source", ""),
        "author_name": staged.get("author_name", ""),
        "author_url": staged.get("author_url", ""),
        "published": staged.get("published", ""),
        "content_text": staged.get("content_text", ""),
    }
    if target_snapshot is not None:
        entry["targetSnapshot"] = target_snapshot
    return entry


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
        "--approve", nargs="+", metavar="ID", help="publish these inbox entries"
    )
    parser.add_argument(
        "--remove", nargs="+", metavar="ID", help="unpublish these approved entries"
    )
    parser.add_argument(
        "--deny-domain", nargs="+", metavar="DOMAIN", help="never offer these again"
    )
    parser.add_argument(
        "--list", action="store_true", help="show what is published now"
    )
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    inbox_path = args.inbox if args.inbox.is_absolute() else root / args.inbox
    snapshot_path = root / "data" / "webmentions.json"
    denylist_path = root / "data" / "webmention-denylist.yaml"

    snapshot = load(snapshot_path, {"contract": CONTRACT, "mentions": []})
    snapshot_contract = snapshot.get("contract")
    existing_mentions = snapshot.get("mentions", [])
    if snapshot_contract == 1 and not existing_mentions:
        existing_mentions = []
    elif snapshot_contract != CONTRACT:
        print(
            f"{snapshot_path}: contract {snapshot_contract!r} cannot be edited by v{CONTRACT} moderator",
            file=sys.stderr,
        )
        return 1
    if not isinstance(existing_mentions, list):
        print(f"{snapshot_path}: mentions is not a list", file=sys.stderr)
        return 1

    published: dict[str, dict[str, Any]] = {
        entry["id"]: entry for entry in existing_mentions
    }

    if args.list:
        if not published:
            print("Опубликованных упоминаний нет.")
        for entry in published.values():
            print(
                f"{entry['id']}  {entry['type']:8}  "
                f"{entry['author_name'] or entry['author_url']}"
            )
            print(f"  {entry['source']} → {entry['targetReceived']}")
        return 0

    changed = False

    if args.approve:
        if not public_dir.is_dir():
            print(
                f"{public_dir}: no built site — build it before capturing a target",
                file=sys.stderr,
            )
            return 1
        inbox_entries = load(inbox_path, {"mentions": []}).get("mentions", [])
        inbox = {entry["id"]: entry for entry in inbox_entries}
        missing = [identifier for identifier in args.approve if identifier not in inbox]
        if missing:
            print(f"нет во входящих: {', '.join(missing)}", file=sys.stderr)
            return 1
        try:
            registry = build_registry(root)
        except RegistryError as error:
            print(error, file=sys.stderr)
            return 1
        by_interaction = {interaction_key(entry): entry for entry in published.values()}

        for identifier in args.approve:
            staged = inbox[identifier]
            resolution = resolve_target(
                staged["targetReceived"],
                registry,
                public_dir,
                captured_at=capture_time(),
            )
            if resolution.status != "resolved" or resolution.target is None:
                print(
                    f"{identifier}: target unresolved at approval: {resolution.diagnostic}",
                    file=sys.stderr,
                )
                return 1
            candidate = approved_entry(
                staged,
                resolution.target,
                resolution.target_snapshot,
            )
            key = interaction_key(candidate)
            previous = by_interaction.get(key)
            if previous is None:
                if candidate["id"] in published:
                    print(
                        f"{identifier}: wm id already belongs to another interaction",
                        file=sys.stderr,
                    )
                    return 1
                published[candidate["id"]] = candidate
                by_interaction[key] = candidate
                print(f"одобрено: {identifier}")
            else:
                for field in MUTABLE_FIELDS:
                    previous[field] = candidate[field]
                print(f"обновлено: {previous['id']} (входящее {identifier})")
            if resolution.diagnostic:
                print(f"  target: document ({resolution.diagnostic})")
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
        print(
            f"{snapshot_path}: {len(published)} упоминани(й) — "
            "пересоберите сайт и закоммитьте"
        )
    elif not args.deny_domain:
        parser.print_help()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
