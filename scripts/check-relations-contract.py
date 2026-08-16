#!/usr/bin/env python3
"""Verify the relations model of library materials (T109).

Relations are optional and incomplete by design — the content-model ADR says so
outright. What is not optional is that a declared relation means something: an
unknown key, a link to a material that does not exist, or an internal relation
pointing at a URL are all mistakes that would otherwise sit in front matter
looking correct.

    scripts/check-relations-contract.py [--public-dir public]

The built site is not read today: relations live in front matter and nothing
renders them yet (T143 does). The argument is accepted so the checker fits the
review gate's contract, which hands every check the directory it just built.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "content" / "library"
TYPES_FILE = ROOT / "data" / "relation_types.yaml"

# Anchored at column zero on purpose: an `id:` indented under `relations:` is a
# target, not the material's own identity.
ID_LINE = re.compile(r'^id:\s*"?([0-9a-fA-F-]{36})"?\s*$')
TYPE_KEY = re.compile(r"^([a-z][a-z-]*):\s*$")
TARGETS_LINE = re.compile(r"^\s+targets:\s*(internal|external|both)\s*$")


def front_matter(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: missing opening front matter delimiter")
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return lines[1:index]
    raise ValueError(f"{path}: missing closing front matter delimiter")


def relation_types() -> dict[str, str]:
    """Key -> allowed target kind, read without a YAML dependency, matching the
    standard-library-only convention of the other checks."""
    types: dict[str, str] = {}
    current: str | None = None
    for line in TYPES_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        if match := TYPE_KEY.match(line):
            current = match.group(1)
            continue
        if current and (match := TARGETS_LINE.match(line)):
            types[current] = match.group(1)
            current = None
    return types


def material_ids() -> dict[str, Path]:
    ids: dict[str, Path] = {}
    for path in sorted(LIBRARY.glob("*.md")):
        if path.name == "_index.md":
            continue
        for line in front_matter(path):
            if match := ID_LINE.match(line):
                ids[match.group(1).lower()] = path
    return ids


def relations(path: Path) -> list[dict[str, str]]:
    """Entries of the `relations:` block: a flat list of rel/id/url/title."""
    entries: list[dict[str, str]] = []
    inside = False
    for line in front_matter(path):
        if re.match(r"^relations:\s*$", line):
            inside = True
            continue
        if inside:
            if line and not line.startswith((" ", "\t", "-")):
                break
            if match := re.match(r"^\s*-\s*(\w[\w-]*):\s*\"?([^\"]*)\"?\s*$", line):
                entries.append({match.group(1): match.group(2).strip()})
            elif match := re.match(r"^\s+(\w[\w-]*):\s*\"?([^\"]*)\"?\s*$", line):
                if entries:
                    entries[-1][match.group(1)] = match.group(2).strip()
    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-dir", default="public")
    parser.parse_args()

    errors: list[str] = []
    types = relation_types()
    if not types:
        errors.append(f"{TYPES_FILE.name}: no relation types found")
    ids = material_ids()

    declared = 0
    for path in sorted(LIBRARY.glob("*.md")):
        if path.name == "_index.md":
            continue
        own_id = next(
            (m.group(1).lower() for line in front_matter(path) if (m := ID_LINE.match(line))),
            None,
        )
        for entry in relations(path):
            declared += 1
            where = f"{path.relative_to(ROOT)}"
            rel = entry.get("rel")
            if not rel:
                errors.append(f"{where}: relation without 'rel'")
                continue
            if rel not in types:
                errors.append(
                    f"{where}: unknown relation {rel!r} (see data/relation_types.yaml)"
                )
                continue

            target_id = entry.get("id", "").lower()
            url = entry.get("url", "")
            allowed = types[rel]

            if target_id and url:
                errors.append(f"{where}: relation {rel!r} carries both id and url")
                continue
            if not target_id and not url:
                errors.append(f"{where}: relation {rel!r} points at nothing")
                continue
            if target_id and allowed == "external":
                errors.append(f"{where}: relation {rel!r} takes a url, not a material id")
                continue
            if url and allowed == "internal":
                errors.append(f"{where}: relation {rel!r} takes a material id, not a url")
                continue
            if target_id:
                if target_id == own_id:
                    errors.append(f"{where}: relation {rel!r} points at the material itself")
                elif target_id not in ids:
                    errors.append(
                        f"{where}: relation {rel!r} points at id {target_id!r}, "
                        "which no material carries"
                    )
            elif not url.startswith(("https://", "http://")):
                errors.append(f"{where}: relation {rel!r} url {url!r} is not absolute")

    if errors:
        print("relations contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: {len(types)} relation type(s), {declared} declared relation(s) "
        f"across {len(ids)} material(s) — keys known, targets resolve"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
