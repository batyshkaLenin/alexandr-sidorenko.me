#!/usr/bin/env python3
"""Verify that published images carry no metadata about their author.

The policy — which segments go and which stay, and why — lives in
`scripts/image_metadata.py` next to the stripper that enforces it, so the rule
is stated once and the two cannot drift apart.

This runs against a build directory rather than `static/`, because that is what
readers actually download: an image added through the asset pipeline, or copied
in by some future step, is caught here too.

    hugo build --gc --minify --panicOnWarning --environment preview
    python3 scripts/check-image-metadata.py --public-dir public

Repair with `python3 scripts/strip-image-metadata.py`, which rewrites the
sources in `static/` without touching a single compressed byte of the image.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from image_metadata import findings, images, unsupported  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    if not public_dir.is_dir():
        print(f"{public_dir}: сборки нет, сначала выполните hugo build", file=sys.stderr)
        return 2

    errors: list[str] = []
    checked = 0
    for path in images(public_dir):
        checked += 1
        for name, size in findings(path):
            errors.append(
                f"{path.relative_to(public_dir)}: {name}, {size} B — "
                f"запрещённые метаданные"
            )

    for path in unsupported(public_dir):
        errors.append(
            f"{path.relative_to(public_dir)}: формат не разбирается — расширьте "
            f"политику в scripts/image_metadata.py, а не пропускайте файл"
        )

    if not checked:
        print("no images found in the build — check the --public-dir", file=sys.stderr)
        return 1

    if errors:
        print("Image metadata check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print(
            "Repair: python3 scripts/strip-image-metadata.py, then rebuild.",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {checked} image(s) carry no author metadata")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
