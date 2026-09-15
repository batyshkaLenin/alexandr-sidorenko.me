#!/usr/bin/env python3
"""Every custom element a page contains has its script on that page.

    python3 scripts/check-components-contract.py [--public-dir public]

A component is registered with `declassified/component.html`, and the script
prints once near </body>. Registering from inside rendered content (a render
hook or a shortcode) writes into whichever page first renders that content —
on a build with few workers that is a feed or the search index, not the
article — so the article ships the element without its script and the
enhancement silently never arrives. Local builds with many workers hide it.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

TAG = re.compile(r"<((?:dc|as)-[a-z0-9-]+)[\s>]")
SCRIPT = re.compile(r"""<script[^>]+src=["']?/js/((?:dc|as)-[a-z0-9-]+)\.""")


def component_names(root: Path) -> set[str]:
    names = set()
    for directory in (root / "assets" / "js", root / "themes" / "declassified" / "assets" / "js"):
        names.update(path.stem for path in directory.glob("*.js") if "-" in path.stem)
    return names


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    if not (public / "index.html").is_file():
        print(f"{public}: no built site — run the build first", file=sys.stderr)
        return 1

    components = component_names(root)
    errors = []
    pages = 0
    for html in sorted(public.rglob("*.html")):
        text = html.read_text(encoding="utf-8", errors="replace")
        used = {name for name in TAG.findall(text) if name in components}
        if not used:
            continue
        pages += 1
        loaded = set(SCRIPT.findall(text))
        for name in sorted(used - loaded):
            errors.append(f"{html.relative_to(public)}: <{name}> without its script")

    if errors:
        print("Component contract failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"OK: {pages} page(s) with components, every element has its script")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
