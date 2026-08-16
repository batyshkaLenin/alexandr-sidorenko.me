#!/usr/bin/env python3
"""Verify that the dithered derivatives match their sources (T129, §30).

    python3 scripts/check-dither-contract.py [--public-dir public]

Dithering happens by hand, in `scripts/dither-images.py`, and its output is
committed. That is a deliberate trade — a build never needs Pillow — and it has
one failure mode: a photograph replaced without regenerating its derivatives,
so readers get the dithered version of a picture that is no longer there.

This is the gate against that, and it deliberately needs no image library: a
source hash, a file listing and the built HTML are enough.

Repair with `python3 scripts/dither-images.py`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

SUFFIXES = {".jpg", ".jpeg", ".png"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    assets = root / "assets"
    manifest_path = root / "data" / "dither.json"
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    if not manifest_path.exists():
        print(f"{manifest_path}: нет манифеста, выполните scripts/dither-images.py", file=sys.stderr)
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    listed = set()
    for key, entry in manifest.items():
        source = assets / key.lstrip("/")
        if not source.exists():
            errors.append(f"{key}: в манифесте есть, а исходника нет")
            continue
        if digest(source) != entry["source"]:
            errors.append(f"{key}: исходник изменился после дизеринга")
        for variant in entry["variants"]:
            derivative = assets / variant["path"]
            listed.add(derivative)
            if not derivative.exists():
                errors.append(f"{key}: нет деривата {variant['path']}")

    # Body images and the portrait: everything the pipeline claims to cover.
    published = list((assets / "assets").rglob("*")) + [assets / "avatar.jpg"]
    for source in sorted(published):
        if source.suffix.lower() not in SUFFIXES or ".dither-" in source.name:
            continue
        key = "/" + str(source.relative_to(assets))
        if key not in manifest:
            errors.append(f"{key}: изображение без записи в манифесте")

    for derivative in sorted(assets.rglob("*.dither-*.png")):
        if derivative not in listed:
            errors.append(f"{derivative.relative_to(root)}: дериват без исходника в манифесте")

    # And what actually shipped: a dithered address in the HTML that has no file
    # behind it is the same defect seen from the reader's side.
    if public_dir.is_dir():
        for page in public_dir.rglob("*.html"):
            for address in set(re.findall(r'/[^"\'\s]+\.dither-\d+\.[0-9a-f]+\.png', page.read_text(encoding="utf-8"))):
                if not (public_dir / address.lstrip("/")).exists():
                    errors.append(f"{page.relative_to(public_dir)}: ссылка на {address}, файла в сборке нет")

    if errors:
        print("дизеринг-контракт нарушен:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print("исправляется командой scripts/dither-images.py", file=sys.stderr)
        return 1

    variants = sum(len(entry["variants"]) for entry in manifest.values())
    print(f"OK: {len(manifest)} изображени(й) с дизерингом, {variants} дериват(ов) на месте")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
