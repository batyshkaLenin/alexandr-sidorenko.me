#!/usr/bin/env python3
"""Verify document-level rel=me discovery (see audit R9 / T40).

The approved identity set in data/links.yaml must appear as rel=me exactly
once each (as a head-only <link> or a visible <a>, never both for the same
URL) on every page, with no missing or unapproved extra beyond the site's
own documented self-reference, and as the sameAs of the home page's author.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

URL_LINE = re.compile(r'^\s*url:\s*"([^"]+)"\s*$', re.MULTILINE)
# The home about panel asserts "this URL is also me" (indieweb self
# rel=me) — not from data/links.yaml, a pre-existing, intentional exception.
SELF_URL = "https://alexandr-sidorenko.me/"


def approved_urls(root: Path) -> set[str]:
    text = (root / "data" / "links.yaml").read_text()
    return set(URL_LINE.findall(text))


class RelMeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        rel = (attributes.get("rel") or "").split()
        if tag in ("link", "a") and "me" in rel and attributes.get("href"):
            self.urls.append(attributes["href"])


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def check_page(errors: list[str], approved: set[str], public_dir: Path, path: str) -> None:
    html_path = public_dir / path
    if not html_path.exists():
        errors.append(f"{path}: page missing, can't check rel=me")
        return
    parser = RelMeParser()
    parser.feed(html_path.read_text())

    found = parser.urls
    check(
        errors,
        len(found) == len(set(found)),
        f"{path}: duplicate rel=me URL(s): {[u for u in found if found.count(u) > 1]}",
    )
    found_set = set(found)
    missing = approved - found_set
    check(errors, not missing, f"{path}: approved link(s) missing from rel=me: {sorted(missing)}")
    unexpected = found_set - approved - {SELF_URL}
    check(errors, not unexpected, f"{path}: unapproved/unexpected rel=me URL(s): {sorted(unexpected)}")


def check_same_as(errors: list[str], approved: set[str], public_dir: Path) -> None:
    """The home Person node claims the same identity set as rel=me (T13).

    rel=me and schema.org sameAs are read by different consumers — IndieAuth
    against the first, search engines against the second — so an identity added
    to data/links.yaml has to reach both or the site says two different things
    about who its author is.
    """
    html = (public_dir / "index.html").read_text()
    blocks = re.findall(
        r'<script type=["\']?application/ld\+json["\']?>(.*?)</script>', html, re.S
    )
    for block in blocks:
        try:
            node = json.loads(block)
        except json.JSONDecodeError as error:
            errors.append(f"index.html: JSON-LD block does not parse ({error})")
            return
        person = node.get("mainEntity")
        if not isinstance(person, dict):
            continue
        same_as = set(person.get("sameAs") or [])
        check(
            errors,
            same_as == approved,
            f"index.html: JSON-LD sameAs differs from data/links.yaml; "
            f"missing {sorted(approved - same_as)}, extra {sorted(same_as - approved)}",
        )
        return
    errors.append("index.html: no JSON-LD node with mainEntity, can't check sameAs")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    approved = approved_urls(root)
    errors: list[str] = []
    check(errors, len(approved) > 0, "no approved URLs parsed from data/links.yaml")
    check_same_as(errors, approved, public_dir)

    # Document-level: check home and a representative section/detail page,
    # not just home.
    for path in ("index.html", "library/index.html", "library/philosophy-of-freedom/index.html"):
        check_page(errors, approved, public_dir, path)

    if errors:
        print("rel=me contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(approved)} approved rel=me link(s), consistent document-level discovery, no dupes/gaps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
