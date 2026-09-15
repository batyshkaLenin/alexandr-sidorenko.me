#!/usr/bin/env python3
"""Pages with a material list offer "Skip to list", and only they do.

    python3 scripts/check-skip-list-contract.py [--public-dir public]

The second skip link points at #list-start, the first material link, so the
browser moves focus onto the list and dc-listnav's j/k work from there. The
link and its target are decided by different templates (baseof and the list
templates); this check keeps them in step: a page with material rows has both,
a page without has neither, and the target is a single focusable link.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROWS = re.compile(r"""class=["']?[^"'>]*\b(?:dc-material dc-material--|dc-timeline__item)""")
TABLE_ROW_LINK = re.compile(r"""<table class=["']?dc-table[\s\S]*?<tbody>\s*<tr>\s*<td>\s*<a""")
SKIP_CLASS = re.compile(r"""\bclass=["']?[^"'>]*\bdc-skip-link\b""")
SKIP_HREF = re.compile(r"""\bhref=["']?#list-start(?=["'\s>])""")
ANCHOR_TAG = re.compile(r"""<a\b[^>]*>""")
ID = re.compile(r"""\bid=["']?list-start(?=["'\s>])""")
HREF = re.compile(r"""\bhref=""")
ANY_TARGET = re.compile(r"""\bid=["']?list-start(?=["'\s>])""")


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

    errors = []
    with_list = 0
    for html in sorted(public.rglob("*.html")):
        text = html.read_text(encoding="utf-8", errors="replace")
        name = html.relative_to(public)
        has_rows = bool(ROWS.search(text) or TABLE_ROW_LINK.search(text))
        anchors = ANCHOR_TAG.findall(text)
        skips = sum(1 for tag in anchors if SKIP_CLASS.search(tag) and SKIP_HREF.search(tag))
        targets = len(ANY_TARGET.findall(text))
        link_targets = sum(1 for tag in anchors if ID.search(tag) and HREF.search(tag))
        if has_rows:
            with_list += 1
            if skips != 1:
                errors.append(f"{name}: material list without exactly one Skip to list link ({skips})")
            if targets != 1 or link_targets != 1:
                errors.append(f"{name}: #list-start must be one material link (ids {targets}, links {link_targets})")
        elif skips or targets:
            errors.append(f"{name}: Skip to list or #list-start without a material list")

    if errors:
        print("Skip-to-list contract failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"OK: {with_list} page(s) with a material list offer Skip to list to its first link")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
