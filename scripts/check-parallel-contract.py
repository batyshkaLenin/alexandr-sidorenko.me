#!/usr/bin/env python3
"""Verify interlinear parallel quotations in the built pages (T194).

The shortcode owns authoring and fails the build on malformed input. This
check owns the published HTML: pairwise DOM order, BCP 47 `lang` on each
half, stanza/pair wrappers, no table, no leftover ` // `.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

LANG_TAG = re.compile(r"^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$")
DELIM = " // "


def split_pair(line: str) -> tuple[str, str] | None:
    """First exact ` // ` only — `https://` is not a delimiter."""
    index = line.find(DELIM)
    if index < 0:
        return None
    source = line[:index].strip()
    translation = line[index + len(DELIM) :].strip()
    if not source or not translation:
        return None
    return source, translation


class ParallelParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.errors: list[str] = []
        self.blocks = 0
        self.pairs = 0
        self._block = 0
        self._stanza = 0
        self._pair = 0
        self._expect: str | None = None
        self._text: list[str] = []
        self._lang: str | None = None
        self._role: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: (value or "") for key, value in attrs}
        classes = attributes.get("class", "").split()
        if tag == "table" and self._block:
            self.errors.append("parallel block uses a table")
        if tag == "blockquote" and "as-parallel-text" in classes:
            self.blocks += 1
            self._block += 1
            self._expect = "stanza"
            return
        if not self._block:
            return
        if tag == "div" and "as-parallel-stanza" in classes:
            if self._expect not in {"stanza", "stanza-or-end"}:
                self.errors.append("stanza outside expected position")
            self._stanza += 1
            self._expect = "pair"
            return
        if tag == "div" and "as-parallel-pair" in classes:
            if self._expect not in {"pair", "pair-or-stanza-end"}:
                self.errors.append("pair outside a stanza")
            self._pair += 1
            self.pairs += 1
            self._expect = "source"
            return
        if tag == "p" and "as-parallel-source" in classes:
            if self._expect != "source":
                self.errors.append("source is not the first child of a pair")
            self._role = "source"
            self._lang = attributes.get("lang")
            self._text = []
            return
        if tag == "p" and "as-parallel-translation" in classes:
            if self._expect != "translation":
                self.errors.append("translation is not after its source")
            self._role = "translation"
            self._lang = attributes.get("lang")
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._role:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self._role:
            text = "".join(self._text)
            if DELIM in text:
                self.errors.append(f"{self._role} still contains {DELIM!r}: {text!r}")
            if not self._lang or not LANG_TAG.fullmatch(self._lang):
                self.errors.append(f"{self._role} lang {self._lang!r} is not a BCP 47 tag")
            if self._role == "source":
                self._expect = "translation"
            else:
                self._expect = "pair-or-stanza-end"
            self._role = None
            self._text = []
            self._lang = None
            return
        if tag == "div" and self._pair:
            if self._expect != "pair-or-stanza-end":
                self.errors.append("pair closed before source+translation")
            self._pair -= 1
            self._expect = "pair-or-stanza-end"
            return
        if tag == "div" and self._stanza:
            self._stanza -= 1
            self._expect = "stanza-or-end"
            return
        if tag == "blockquote" and self._block:
            if self._stanza or self._pair:
                self.errors.append("blockquote closed with open stanza or pair")
            self._block -= 1
            self._expect = None


def check_html(html: str) -> tuple[list[str], int, int]:
    parser = ParallelParser()
    parser.feed(html)
    errors = list(parser.errors)
    if parser._block or parser._stanza or parser._pair:
        errors.append("unclosed parallel markup")
    return errors, parser.blocks, parser.pairs


def self_test() -> None:
    assert split_pair("Hej chłopcze // Эй, парень") == ("Hej chłopcze", "Эй, парень")
    assert split_pair("https://example.com") is None
    assert split_pair("left https://example.com // right") == (
        "left https://example.com",
        "right",
    )
    assert split_pair("a // b // c") == ("a", "b // c")
    assert split_pair(" // only-right") is None
    assert split_pair("only-left // ") is None

    good = (
        '<blockquote class=as-parallel-text>'
        '<div class=as-parallel-stanza>'
        '<div class=as-parallel-pair>'
        '<p class=as-parallel-source lang=pl>Hej</p>'
        '<p class=as-parallel-translation lang=ru>Эй</p>'
        "</div></div></blockquote>"
    )
    errors, blocks, pairs = check_html(good)
    assert errors == [], errors
    assert blocks == 1 and pairs == 1

    swapped = (
        '<blockquote class="as-parallel-text">'
        '<div class="as-parallel-stanza">'
        '<div class="as-parallel-pair">'
        '<p class="as-parallel-translation" lang="ru">Эй</p>'
        '<p class="as-parallel-source" lang="pl">Hej</p>'
        "</div></div></blockquote>"
    )
    errors, _, _ = check_html(swapped)
    assert errors, "swapped source/translation must fail"

    noslash = (
        '<blockquote class="as-parallel-text">'
        '<div class="as-parallel-stanza">'
        '<div class="as-parallel-pair">'
        '<p class="as-parallel-source" lang="pl">Hej // leftover</p>'
        '<p class="as-parallel-translation" lang="ru">Эй</p>'
        "</div></div></blockquote>"
    )
    errors, _, _ = check_html(noslash)
    assert any(" // " in item for item in errors)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", "--public", dest="public_dir", default="public")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    self_test()
    if args.self_test:
        print("parallel-contract: self-test passed")
        return 0

    public = Path(args.public_dir)
    if not public.is_dir():
        print(f"FAIL: {public} does not exist — build the site first", file=sys.stderr)
        return 1

    errors: list[str] = []
    pages = 0
    blocks = 0
    pairs = 0
    for path in sorted(public.rglob("*.html")):
        html = path.read_text(encoding="utf-8")
        if "as-parallel-text" not in html:
            continue
        pages += 1
        found, n_blocks, n_pairs = check_html(html)
        blocks += n_blocks
        pairs += n_pairs
        name = path.relative_to(public).as_posix()
        for item in found:
            errors.append(f"{name}: {item}")
        if n_blocks == 0:
            errors.append(f"{name}: mentioned as-parallel-text but parsed no blocks")

    if errors:
        for item in errors:
            print(f"FAIL: {item}", file=sys.stderr)
        return 1
    print(
        f"parallel-contract: {pages} pages, {blocks} blocks, {pairs} pairs"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
