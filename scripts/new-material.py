#!/usr/bin/env python3
"""Create a library material with its Material ID already filled in.

    scripts/new-material.py some-slug --type article --title "Название"

The ID is a UUIDv7 and it is the one field an author must never invent: it is
immutable, globally unique and permanent. Hugo has no template
function that can produce one, so the value is generated here and handed to
`hugo new` through the environment.

Hugo's security policy only exposes environment variables matching `^HUGO_` to
`os.Getenv`, which is why the variables are named the way they are.

`hugo new` cannot be made to refuse: an archetype that calls errorf still writes
the file and still exits 0. So the archetype writes visibly invalid placeholders
instead, this script verifies what landed on disk, and the build check
is what finally makes a material without a valid id impossible to ship.
"""

from __future__ import annotations

import argparse
import os
import re
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LIBRARY_DIR = REPO_ROOT / "content" / "library"

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Starting vocabulary of material types, stored kebab-case. `album`
# is deliberately absent: it is a future type with no material behind it.
TYPES = (
    "note",
    "article",
    "paper",
    "fiction",
    "poem",
    "poetry-collection",
    "track",
)


def uuid7() -> str:
    """A UUIDv7 (RFC 9562), lowercase canonical form.

    `uuid.uuid7` exists from Python 3.14; the fallback keeps the script
    runnable on older interpreters, since this is an authoring tool that runs
    on whatever the author has.
    """
    if hasattr(uuid, "uuid7"):
        return str(uuid.uuid7())

    unix_ts_ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    value = (
        (unix_ts_ms << 80)
        | (0x7 << 76)
        | (rand_a << 64)
        | (0b10 << 62)
        | rand_b
    )
    return str(uuid.UUID(int=value))


def existing_ids() -> set[str]:
    """Every id already written in content/, so a fresh one cannot collide.

    Uniqueness itself is a build invariant; this is only a cheap guard
    against reusing a value that is already spoken for.
    """
    found = set()
    id_line = re.compile(r'^id:\s*"?([0-9a-fA-F-]{36})"?\s*$')
    for path in (REPO_ROOT / "content").rglob("*.md"):
        for line in path.read_text(encoding="utf-8").splitlines()[1:]:
            if line.strip() == "---":
                break
            if match := id_line.match(line.strip()):
                found.add(match.group(1).lower())
    return found


def fresh_id() -> str:
    taken = existing_ids()
    for _ in range(8):
        candidate = uuid7()
        if candidate not in taken:
            return candidate
    raise SystemExit("new-material: could not generate an unused id")


def title_from_slug(slug: str) -> str:
    words = slug.split("-")
    return " ".join([words[0].capitalize(), *words[1:]])


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a library material with a generated Material ID."
    )
    parser.add_argument("slug", help="route of the material: /library/<slug>")
    parser.add_argument("--type", required=True, choices=TYPES)
    parser.add_argument("--title", help="defaults to the slug, spelled out")
    args = parser.parse_args()

    if not SLUG_PATTERN.match(args.slug):
        print(
            f"new-material: slug {args.slug!r} must be lowercase latin, "
            "digits and single hyphens",
            file=sys.stderr,
        )
        return 1

    target = LIBRARY_DIR / f"{args.slug}.md"
    if target.exists():
        print(f"new-material: {target.relative_to(REPO_ROOT)} already exists", file=sys.stderr)
        return 1

    material_id = fresh_id()
    env = os.environ | {
        "HUGO_MATERIAL_ID": material_id,
        "HUGO_MATERIAL_TYPE": args.type,
        "HUGO_MATERIAL_TITLE": args.title or title_from_slug(args.slug),
    }
    result = subprocess.run(
        ["hugo", "new", str(target.relative_to(REPO_ROOT))],
        cwd=REPO_ROOT,
        env=env,
    )
    if result.returncode != 0:
        return result.returncode

    written = target.read_text(encoding="utf-8")
    if f'id: "{material_id}"' not in written or f'type: "{args.type}"' not in written:
        target.unlink()
        print(
            "new-material: hugo did not write the id and type through; "
            "nothing was created",
            file=sys.stderr,
        )
        return 1

    print(f"id:   {material_id}")
    print(f"url:  /library/{args.slug}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
