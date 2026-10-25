#!/usr/bin/env python3
"""Verify capability data survives without visual capability badges (W0078)."""

from __future__ import annotations

import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

CAPABILITIES = {
    'text', 'image', 'gallery', 'audio', 'video', 'code', 'math',
    'notation', 'footnotes', 'bibliography', 'download',
}


class MarkerParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.errors: list[str] = []
        self.rows = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get('class') or '').split()
        if {'dc-material__marker', 'dc-material__markers'}.intersection(classes):
            self.errors.append('visual capability badge is still rendered')
        if tag != 'li' or 'dc-material' not in classes:
            return
        self.rows += 1
        value = attributes.get('data-capabilities') or ''
        if 'data-capabilities' not in attributes:
            self.errors.append('material row lost its computed data-capabilities')
            return
        capabilities = value.split()
        if len(set(capabilities)) != len(capabilities):
            self.errors.append('duplicate computed capabilities')
        unknown = set(capabilities) - CAPABILITIES
        if unknown:
            self.errors.append(f'unknown computed capabilities: {sorted(unknown)}')


def self_test() -> None:
    cases = [
        ('<li class="dc-material" data-capabilities="audio text"></li>', True),
        ('<li class="dc-material" data-capabilities=""></li>', True),
        ('<li class="dc-material" data-capabilities></li>', True),
        ('<p>An explanation of has:audio.</p>', True),
        ('<li class="dc-material"></li>', False),
        ('<li class="dc-material" data-capabilities="audio audio"></li>', False),
        ('<li class="dc-material" data-capabilities="imaginary"></li>', False),
        ('<span class="dc-material__marker">♫</span>', False),
        ('<div class="dc-material__markers"></div>', False),
    ]
    for markup, expected in cases:
        parsed = MarkerParser()
        parsed.feed(markup)
        assert (not parsed.errors) == expected, markup


def main() -> int:
    self_test()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public-dir', default='public')
    args = parser.parse_args()
    public = Path(args.public_dir)
    if not public.is_dir():
        print(f'FAIL: {public} does not exist — build the site first', file=sys.stderr)
        return 1

    errors: list[str] = []
    pages = 0
    rows = 0
    for path in sorted(public.rglob('*.html')):
        parsed = MarkerParser()
        parsed.feed(path.read_text(encoding='utf-8'))
        pages += 1
        rows += parsed.rows
        errors.extend(f'{path.relative_to(public)}: {error}' for error in parsed.errors)
    if not pages or not rows:
        errors.append('build must contain HTML pages and material rows')
    if errors:
        print('capability marker check failed:', file=sys.stderr)
        for error in errors:
            print(f'- {error}', file=sys.stderr)
        return 1
    print(f'OK: {pages} pages, {rows} rows retain capability data; no visual badges')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
