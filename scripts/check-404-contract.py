#!/usr/bin/env python3
"""Verify the 404 page's metadata contract (see audit R8 / T39).

A not-found response is not a real, indexable resource: it must be
Russian-titled, carry robots noindex, and skip the canonical/Open Graph/
Twitter/JSON-LD identity a real publication or section page gets — showing
that identity would misleadingly claim a URL that doesn't exist is a real,
canonical piece of content.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class NotFoundParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title: str | None = None
        self.robots: str | None = None
        self.canonical_present = False
        self.og_properties: list[str] = []
        self.json_ld_present = False
        self.home_link_present = False
        self._in_title = False
        self._title_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "title":
            self._in_title = True
            self._title_parts = []
        elif tag == "meta" and attributes.get("name") == "robots":
            self.robots = attributes.get("content")
        elif tag == "link" and attributes.get("rel") == "canonical":
            self.canonical_present = True
        elif tag == "meta" and (attributes.get("property") or "").startswith("og:"):
            self.og_properties.append(attributes["property"])
        elif tag == "script" and attributes.get("type") == "application/ld+json":
            self.json_ld_present = True
        elif tag == "a" and attributes.get("href") in ("/", "https://alexandr-sidorenko.me/"):
            self.home_link_present = True

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._in_title:
            self.title = "".join(self._title_parts)
            self._in_title = False


ENGLISH_DEFAULT_TITLE = re.compile(r"404 Page not found", re.IGNORECASE)


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    html_path = public_dir / "404.html"
    errors: list[str] = []
    check(errors, html_path.exists(), f"missing {html_path}")
    if errors:
        print("404 contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    html = html_path.read_text()
    parsed = NotFoundParser()
    parsed.feed(html)

    check(errors, parsed.title is not None, "missing <title>")
    if parsed.title is not None:
        check(
            errors,
            not ENGLISH_DEFAULT_TITLE.search(parsed.title),
            f"title still leaks Hugo's English default: {parsed.title!r}",
        )
        check(errors, "Страница не найдена" in parsed.title, f"title not Russian: {parsed.title!r}")

    check(errors, parsed.robots == "noindex", f"robots meta is {parsed.robots!r}, expected 'noindex'")
    check(errors, not parsed.canonical_present, "canonical link present on 404 (there is no canonical URL for a page that doesn't exist)")
    check(errors, not parsed.og_properties, f"Open Graph tags present on 404: {parsed.og_properties}")
    check(errors, not parsed.json_ld_present, "JSON-LD present on 404 (would claim structured-data identity for a nonexistent resource)")
    check(errors, parsed.home_link_present, "no working link back to the home page")

    if errors:
        print("404 contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("OK: 404 page is Russian-titled, noindex, no canonical/OG/JSON-LD, has a home link")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
