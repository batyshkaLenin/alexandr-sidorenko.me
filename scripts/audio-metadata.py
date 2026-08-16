#!/usr/bin/env python3
"""Record how long every attached recording runs (T131, §27.4).

    python3 scripts/audio-metadata.py [--check]

A player states its duration in text, before anyone presses play — §27.4 asks
for `▶ Author reading · 01:42`, not a symbol and a surprise. Hugo cannot read
an audio file's header, so the duration is measured here and committed to
`data/audio.json`, the same trade `scripts/dither-images.py` makes: the build
depends on the manifest, never on a media library.

Each entry also records a digest of the file it was measured from, so
`scripts/check-audio-contract.py` can catch a recording replaced without a
re-run while needing no media tooling of its own. `--check` here re-measures
instead, which is the stricter check and the reason ffprobe stays a hand tool.

Durations come from the container header, which is exact for the constant
bitrate MP3 this site publishes and, thanks to the Xing/VBRI frame, for a
variable one too.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
MANIFEST = ROOT / "data" / "audio.json"
SUFFIXES = {".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac"}


def duration_seconds(path: Path) -> int:
    """Length of the recording, rounded to the second it is displayed at."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True)
    return round(float(result.stdout.strip()))


def clock(seconds: int) -> str:
    """`01:42`, and `1:02:18` once an hour is on the clock."""
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def measure() -> dict[str, dict[str, object]]:
    manifest: dict[str, dict[str, object]] = {}
    for path in sorted(STATIC.rglob("*")):
        if path.suffix.lower() not in SUFFIXES or not path.is_file():
            continue
        seconds = duration_seconds(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        # The key is the address the front matter uses, so a template can look
        # a recording up by the same string it publishes.
        key = "/" + path.relative_to(STATIC).as_posix()
        manifest[key] = {"duration_seconds": seconds, "duration": clock(seconds),
                         "source": digest}
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify the manifest instead of writing it")
    args = parser.parse_args()

    measured = measure()

    if args.check:
        if not MANIFEST.exists():
            print("FAIL: data/audio.json is missing — run scripts/audio-metadata.py")
            return 1
        recorded = json.loads(MANIFEST.read_text())
        if recorded != measured:
            for key in sorted(set(recorded) | set(measured)):
                if recorded.get(key) != measured.get(key):
                    print(f"- {key}: manifest {recorded.get(key)}, file {measured.get(key)}")
            print("FAIL: data/audio.json is stale — run scripts/audio-metadata.py")
            return 1
        print(f"OK: {len(measured)} recording(s), durations match the files")
        return 0

    MANIFEST.write_text(json.dumps(measured, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {MANIFEST.relative_to(ROOT)}: {len(measured)} recording(s)")
    for key, entry in measured.items():
        print(f"  {key} — {entry['duration']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
