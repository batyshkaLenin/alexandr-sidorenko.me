#!/usr/bin/env python3
"""Remove author metadata from the site's own image sources.

Rewrites files in place, copying every compressed byte unchanged — no decode,
no re-encode — so the visible pixels are bit-identical afterwards and only the
metadata segments are gone. The policy it enforces is documented in
`scripts/image_metadata.py`.

    python3 scripts/strip-image-metadata.py            # assets/ + static/, in place
    python3 scripts/strip-image-metadata.py --dry-run  # report, change nothing

Run it after adding an image; `scripts/check-image-metadata.py` is what fails
the build if you forget.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from image_metadata import findings, images, stripped  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="files or directories; defaults to assets/ and static/",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    # Photographs moved to assets/ so the resource pipeline can resize them;
    # static/ still holds the icons and the audio. Both are sources,
    # so both are swept.
    targets = args.paths or [root / "assets", root / "static"]

    candidates: list[Path] = []
    for target in targets:
        target = target if target.is_absolute() else root / target
        candidates.extend(images(target) if target.is_dir() else [target])

    changed = 0
    saved = 0
    for path in candidates:
        found = findings(path)
        if not found:
            continue
        data = path.read_bytes()
        new = stripped(path, data)
        delta = len(data) - len(new)
        detail = ", ".join(f"{name} {size} B" for name, size in found)
        print(f"{'would strip' if args.dry_run else 'stripped'} {path.relative_to(root)}: {detail}")
        if not args.dry_run:
            path.write_bytes(new)
        changed += 1
        saved += delta

    if not changed:
        print(f"OK: {len(candidates)} image(s), nothing to strip")
        return 0

    print(f"{changed} file(s), {saved} B of metadata")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
