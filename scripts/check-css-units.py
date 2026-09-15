#!/usr/bin/env python3
"""Text sizes follow the reader's font size; no dead or fixed-viewport units.

    python3 scripts/check-css-units.py

A `font-size` in px ignores the size a reader picked in the browser, so type
sizes and the `--dc-fs-*` scale are written in rem (or em/%/keywords, or
through a token). `-webkit-overflow-scrolling` has done nothing since iOS 13.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SOURCES = (
    "assets/css/site.css",
    "themes/declassified/assets/css/declassified.css",
    *(f"assets/css/art/{path.name}" for path in sorted(Path(__file__).resolve().parents[1].glob("assets/css/art/*.css"))),
)

COMMENT = re.compile(r"/\*.*?\*/", re.S)
DECLARATION = re.compile(r"(?P<prop>--dc-fs-[a-z-]+|font-size|font)\s*:\s*(?P<value>[^;{}]+)")
PX = re.compile(r"(?<![\w.-])\d*\.?\d+px\b")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    # Accepted for the site gate; this contract reads source stylesheets only.
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()
    root = args.root.resolve()

    errors = []
    for source in SOURCES:
        css = COMMENT.sub("", (root / source).read_text(encoding="utf-8"))
        for match in DECLARATION.finditer(css):
            if PX.search(match.group("value")):
                line = css.count("\n", 0, match.start()) + 1
                errors.append(f"{source}:{line}: {match.group('prop')}: {match.group('value').strip()} — text size in px")
        if "-webkit-overflow-scrolling" in css:
            errors.append(f"{source}: -webkit-overflow-scrolling has no effect since iOS 13")

    if errors:
        print("CSS units contract failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"OK: {len(SOURCES)} stylesheet(s), text sizes in relative units")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
