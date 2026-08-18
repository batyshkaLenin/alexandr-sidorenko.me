#!/usr/bin/env python3
"""Verify visible capability markers follow PRIM-CAPABILITY-MARKER order (T173).

The computed set may include `text` and `footnotes`, which have no glyph and
must not appear. What does appear — at most three markers — is a subsequence
of `audio → code → math → image → gallery → video`, not the alphabet of keys.
"""

from __future__ import annotations

import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

DISPLAY_ORDER = ("audio", "code", "math", "image", "gallery", "video")
ORDER_INDEX = {name: index for index, name in enumerate(DISPLAY_ORDER)}
CEILING = 3


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def self_test() -> None:
    assert subsequence(["audio", "math", "video"])
    assert subsequence(["code", "image"])
    assert not subsequence(["image", "math"])
    assert not subsequence(["audio", "audio"])


def subsequence(names: list[str]) -> bool:
    last = -1
    for name in names:
        index = ORDER_INDEX.get(name)
        if index is None or index <= last:
            return False
        last = index
    return True


class MarkerParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._in_marker_hidden = False
        self._hidden: list[str] = []
        self._in_material = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: (value or "") for key, value in attrs}
        classes = attributes.get("class", "").split()
        if tag == "li" and any(item.startswith("dc-material") for item in classes):
            self._in_material += 1
            if self._in_material == 1:
                self._row = []
        if self._row is None:
            return
        if tag == "span" and "dc-material__marker" in classes:
            self._hidden = []
        if tag == "span" and "dc-visually-hidden" in classes and self._in_material:
            self._in_marker_hidden = True
            self._hidden = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "span" and self._in_marker_hidden:
            self._in_marker_hidden = False
            text = "".join(self._hidden).strip()
            if text.startswith("has:") and self._row is not None:
                self._row.append(text.removeprefix("has:"))
        if tag == "li" and self._in_material:
            self._in_material -= 1
            if self._in_material == 0 and self._row is not None:
                self.rows.append(self._row)
                self._row = None

    def handle_data(self, data: str) -> None:
        if self._in_marker_hidden:
            self._hidden.append(data)


def main() -> int:
    self_test()
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    args = parser.parse_args()
    public = Path(args.public_dir)
    if not public.is_dir():
        print(f"FAIL: {public} does not exist — build the site first", file=sys.stderr)
        return 1

    errors: list[str] = []
    pages = 0
    marked = 0
    for path in sorted(public.rglob("*.html")):
        parsed = MarkerParser()
        parsed.feed(path.read_text(encoding="utf-8"))
        pages += 1
        name = path.relative_to(public).as_posix()
        for row in parsed.rows:
            if not row:
                continue
            marked += 1
            check(
                errors,
                len(row) <= CEILING,
                f"{name}: {len(row)} markers {row!r}, ceiling is {CEILING}",
            )
            unknown = [item for item in row if item not in ORDER_INDEX]
            check(
                errors,
                not unknown,
                f"{name}: marker(s) without a display slot {unknown!r}",
            )
            check(
                errors,
                subsequence(row),
                f"{name}: markers {row!r} are not {DISPLAY_ORDER} order",
            )

    if errors:
        print("capability marker check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: {pages} page(s), {marked} marked row(s) — "
        f"audio → code → math → image → gallery → video, ceiling {CEILING}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
