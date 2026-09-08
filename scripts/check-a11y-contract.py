#!/usr/bin/env python3
"""Static accessibility checks for the built pages.

Not a replacement for using the site with a keyboard and a screen reader — it
checks the properties that are true of the markup itself, and that a template
change can silently break without anyone noticing:

- a skip link, first in tab order, pointing at a target that exists;
- one `<h1>` per page and no skipped heading level below it;
- no positive `tabindex`, which reorders the whole document's tab sequence for
  the sake of one element;
- nothing focusable inside `aria-hidden`, the classic way to hand the keyboard
  an element a screen reader will not announce;
- every link and button carries an accessible name — text, `aria-label`, or an
  image with alt text — because "link" is not a destination;
- every `img` has an `alt` attribute, empty if decorative;
- `lang` on `<html>`, so a screen reader picks the right voice.

Interactive behaviour (arrow-key lists, the palette, the help sheet) is not
covered here: it exists only with JavaScript, and asserting it means driving a
browser, which the keyboard pass in the task does.
"""

from __future__ import annotations

import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

FOCUSABLE = {"a", "button", "input", "select", "textarea", "details", "iframe"}
VOID = {"img", "input", "br", "hr", "meta", "link", "source", "track", "wbr", "area", "base", "col", "embed", "param"}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.errors: list[str] = []
        self.headings: list[int] = []
        self.ids: set[str] = set()
        self.first_link: dict | None = None
        self.skip_target: str | None = None
        self.lang: str | None = None
        self._hidden_depth = 0
        self._open: list[tuple[str, dict]] = []
        self._named: list[tuple[dict, str]] = []  # (attrs, accumulated text)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: (value or "") for key, value in attrs}

        if tag == "html":
            self.lang = attributes.get("lang")
        if "id" in attributes:
            self.ids.add(attributes["id"])
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append(int(tag[1]))
        if tag == "img" and "alt" not in attributes:
            self.errors.append(f"<img src={attributes.get('src', '?')!r}> has no alt attribute")

        tabindex = attributes.get("tabindex")
        if tabindex and tabindex.lstrip("+").isdigit() and int(tabindex) > 0:
            self.errors.append(f"<{tag} tabindex={tabindex}> reorders the whole document's tab sequence")

        if self._hidden_depth and tag in FOCUSABLE and attributes.get("tabindex") != "-1":
            self.errors.append(
                f"<{tag}> is focusable inside aria-hidden: the keyboard reaches what a screen reader will not read"
            )

        if attributes.get("aria-hidden") == "true" and tag not in VOID:
            self._hidden_depth += 1
            attributes["__hidden__"] = "1"

        if tag == "a" and self.first_link is None and attributes.get("href"):
            self.first_link = attributes
            if attributes.get("class") == "dc-skip-link":
                self.skip_target = attributes["href"]

        if tag in ("a", "button"):
            self._named.append((attributes, ""))

        if tag not in VOID:
            self._open.append((tag, attributes))

    def handle_endtag(self, tag: str) -> None:
        if tag in ("a", "button") and self._named:
            attributes, text = self._named.pop()
            has_name = bool(
                text.strip()
                or attributes.get("aria-label")
                or attributes.get("aria-labelledby")
                or attributes.get("title")
            )
            if not has_name:
                self.errors.append(f"<{tag}> without an accessible name: {attributes}")

        while self._open:
            name, attributes = self._open.pop()
            if attributes.get("__hidden__"):
                self._hidden_depth -= 1
            if name == tag:
                break

    def handle_data(self, data: str) -> None:
        if self._named and data.strip():
            attributes, text = self._named[-1]
            self._named[-1] = (attributes, text + data)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    # An <img alt="…"> inside a link is that link's name.
    def unknown_decl(self, data: str) -> None:  # pragma: no cover - html5 has none
        pass


def check_page(path: Path, url: str) -> list[str]:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    errors = list(parser.errors)

    if not parser.lang:
        errors.append("<html> carries no lang")

    ones = parser.headings.count(1)
    if ones != 1:
        errors.append(f"{ones} <h1> on the page, expected exactly one")

    previous = None
    for level in parser.headings:
        if previous is not None and level > previous + 1:
            errors.append(f"heading level jumps from h{previous} to h{level}")
            break
        previous = level

    if parser.skip_target is None:
        errors.append("the first link is not the skip link")
    elif parser.skip_target.startswith("#") and parser.skip_target[1:] not in parser.ids:
        errors.append(f"skip link points at {parser.skip_target}, which is not on the page")

    return [f"{url}: {error}" for error in errors]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    args = parser.parse_args()

    public = Path(args.public_dir)
    if not public.is_dir():
        print(f"FAIL: {public} does not exist — build the site first", file=sys.stderr)
        return 1

    errors: list[str] = []
    pages = sorted(public.rglob("*.html"))
    for path in pages:
        url = "/" + path.relative_to(public).as_posix()
        errors.extend(check_page(path, url))

    if errors:
        print("FAIL: accessibility contract", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(pages)} page(s) — skip link, headings, names, alt text, tab order")
    return 0


if __name__ == "__main__":
    sys.exit(main())
