#!/usr/bin/env python3
"""Filesystem artifact budgets for the built public/ tree (T31).

Separate from scripts/validate.sh (semantics) and from run-lighthouse.py
(synthetic metrics). Fail when CSS/JS/image totals or a single HTML page grow
past the ceilings recorded from S15/T69.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def fail(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def total_bytes(paths: list[Path]) -> int:
    return sum(path.stat().st_size for path in paths)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument(
        "--fixture",
        type=Path,
        default=Path("tests/fixtures/budgets.json"),
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="prove a controlled oversize failure against a tiny CSS budget",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    public = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    fixture_path = args.fixture if args.fixture.is_absolute() else root / args.fixture

    if not public.is_dir():
        print(f"{public}: missing — run ./build.sh first", file=sys.stderr)
        return 1
    if not fixture_path.is_file():
        print(f"missing budget fixture {fixture_path}", file=sys.stderr)
        return 1

    fixture = json.loads(fixture_path.read_text())
    limits = dict(fixture["limits"])
    image_ext = {ext.lower() for ext in fixture.get("image_extensions") or []}

    if args.self_test:
        # Controlled violation: pretend CSS may not exceed 1 byte.
        limits["css_total_bytes"] = 1

    css = [p for p in public.rglob("*.css") if p.is_file()]
    js = [p for p in public.rglob("*.js") if p.is_file()]
    html = [p for p in public.rglob("*.html") if p.is_file()]
    images = [
        p
        for p in public.rglob("*")
        if p.is_file() and p.suffix.lower() in image_ext
    ]

    errors: list[str] = []
    css_total = total_bytes(css)
    js_total = total_bytes(js)
    image_total = total_bytes(images)

    fail(
        errors,
        css_total <= limits["css_total_bytes"],
        f"CSS total {css_total} bytes > {limits['css_total_bytes']}",
    )
    fail(
        errors,
        js_total <= limits["js_total_bytes"],
        f"JS total {js_total} bytes > {limits['js_total_bytes']}",
    )
    fail(
        errors,
        image_total <= limits["image_total_bytes"],
        f"image total {image_total} bytes > {limits['image_total_bytes']} (S15 baseline ~2077 KiB + headroom)",
    )

    page_limit = limits["html_page_max_bytes"]
    for page in html:
        size = page.stat().st_size
        fail(
            errors,
            size <= page_limit,
            f"{page.relative_to(public)} is {size} bytes > {page_limit}",
        )

    if errors:
        print("Artifact budget check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: budgets — CSS {css_total}/{limits['css_total_bytes']}, "
        f"JS {js_total}/{limits['js_total_bytes']}, "
        f"images {image_total}/{limits['image_total_bytes']}, "
        f"{len(html)} HTML page(s) ≤ {page_limit} bytes"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
