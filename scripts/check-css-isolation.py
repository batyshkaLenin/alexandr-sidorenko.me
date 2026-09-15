#!/usr/bin/env python3
"""Blocks do not size themselves after their neighbours (LAYOUT-ISOLATION).

    python3 scripts/check-css-isolation.py

A parent sets tracks, gaps and order; each block is as tall as its content.
The declarations below are how one pane used to stretch to another's height,
so each needs a named reason in ALLOWED: parts of one component may share a
box, sibling panes may not.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SOURCES = ("assets/css/site.css", "themes/declassified/assets/css/declassified.css")

ALIGN = {"align-items", "align-self", "align-content", "place-items", "place-self", "place-content"}
FULL_HEIGHT = {"height", "min-height", "block-size", "min-block-size"}
PUSH_DOWN = {"margin-top", "margin-block-start"}

# (source, selector, property) -> why it is not neighbour alignment.
ALLOWED = {
    ("assets/css/site.css", ".dc-library__views", "align-items"):
        "links of one ViewsNav share its row as touch targets",
    ("assets/css/site.css", ".as-external-media__iframe", "height"):
        "iframe fills its own aspect-ratio frame",
}

COMMENT = re.compile(r"/\*.*?\*/", re.S)


def declarations(css: str):
    """Yield (selector, property, value) with the innermost style-rule selector."""
    css = COMMENT.sub("", css)
    stack: list[str] = []
    buffer = ""
    for char in css:
        if char == "{":
            stack.append(" ".join(buffer.split()))
            buffer = ""
        elif char == "}":
            yield from _flush(stack, buffer)
            buffer = ""
            if stack:
                stack.pop()
        elif char == ";":
            yield from _flush(stack, buffer)
            buffer = ""
        else:
            buffer += char


def _flush(stack: list[str], buffer: str):
    if ":" not in buffer or not stack or stack[-1].startswith("@"):
        return
    prop, value = buffer.split(":", 1)
    yield stack[-1], prop.strip().lower(), " ".join(value.split()).lower()


def violation(prop: str, value: str) -> str | None:
    if prop in ALIGN and "stretch" in value:
        return "stretches a block to its track"
    if prop in FULL_HEIGHT and value.startswith("100%"):
        return "takes its height from the parent"
    if prop == "grid-template-rows" and re.search(r"\dfr\b", value):
        return "hands leftover height to rows"
    if prop in PUSH_DOWN and value.startswith("auto"):
        return "pushes content to a height it did not set"
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    # Accepted for the site gate; this contract reads source stylesheets only.
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()
    root = args.root.resolve()

    errors = []
    used = set()
    for source in SOURCES:
        text = (root / source).read_text(encoding="utf-8")
        for selector, prop, value in declarations(text):
            reason = violation(prop, value)
            if not reason:
                continue
            key = (source, selector, prop)
            if key in ALLOWED:
                used.add(key)
                continue
            errors.append(f"{source}: `{selector}` {prop}: {value} — {reason}")
    for key in sorted(set(ALLOWED) - used):
        errors.append(f"{key[0]}: allowance for `{key[1]}` {key[2]} matches nothing; remove it")

    if errors:
        print("CSS isolation contract failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"OK: {len(SOURCES)} stylesheet(s), {len(used)} named allowance(s), no neighbour alignment")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
