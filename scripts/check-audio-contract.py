#!/usr/bin/env python3
"""Verify that stated durations belong to the recordings on disk (T131, §27.4).

    python3 scripts/check-audio-contract.py [--public-dir public]

Durations are measured by hand, in `scripts/audio-metadata.py`, and committed
to `data/audio.json`. That keeps ffprobe out of the build and leaves one
failure mode: a recording replaced without a re-run, so a page announces the
length of a file nobody can hear any more.

This is the gate against that, and it deliberately needs no media tooling —
the digest recorded next to each duration is enough. It also holds the two
ends together: every recording a material attaches has an entry, and every
entry has a file.

Repair with `python3 scripts/audio-metadata.py`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

SUFFIXES = {".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    static = root / "static"
    manifest_path = root / "data" / "audio.json"
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    if not manifest_path.exists():
        print(f"{manifest_path}: нет манифеста, выполните scripts/audio-metadata.py", file=sys.stderr)
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    for key, entry in manifest.items():
        source = static / key.lstrip("/")
        if not source.exists():
            errors.append(f"{key}: в манифесте есть, а файла нет")
            continue
        if digest(source) != entry["source"]:
            errors.append(f"{key}: запись сделана до того, как файл изменился")

    for source in sorted(static.rglob("*")):
        if source.suffix.lower() not in SUFFIXES or not source.is_file():
            continue
        key = "/" + source.relative_to(static).as_posix()
        if key not in manifest:
            errors.append(f"{key}: запись без длительности в манифесте")

    # And what actually shipped: a duration on the page that no entry states is
    # the same defect seen from the reader's side.
    if public_dir.is_dir():
        durations = {entry["duration"] for entry in manifest.values()}
        for page in public_dir.rglob("*.html"):
            html = page.read_text(encoding="utf-8")
            for shown in set(re.findall(r'class="dc-audio__duration">([^<]+)<', html)):
                if shown not in durations:
                    errors.append(f"{page.relative_to(public_dir)}: показывает {shown}, такой длительности в манифесте нет")

    if errors:
        print("аудио-контракт нарушен:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print("исправляется командой scripts/audio-metadata.py", file=sys.stderr)
        return 1

    print(f"OK: {len(manifest)} записи(ей) с длительностью, файлы совпадают с манифестом")
    return 0


if __name__ == "__main__":
    sys.exit(main())
