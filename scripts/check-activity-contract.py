#!/usr/bin/env python3
"""Verify the built Home activity pane contract (T138)."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class ActivityFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.activity_panes = 0
        self.modules: list[str] = []
        self.external_scripts: list[str] = []
        self._activity_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "script":
            source = attributes.get("src", "") or ""
            if source.startswith(("http://", "https://", "//")):
                self.external_scripts.append(source)

        if tag == "as-activity":
            self.activity_panes += 1
            self._activity_depth += 1
            return

        if self._activity_depth and tag == "section":
            module = attributes.get("data-activity-module")
            if module:
                self.modules.append(module)

    def handle_endtag(self, tag: str) -> None:
        if tag == "as-activity" and self._activity_depth:
            self._activity_depth -= 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--expect-modules", default="music,site")
    args = parser.parse_args()

    public = Path(args.public_dir).resolve()
    home = public / "index.html"
    if not home.is_file():
        print(f"FAIL: {home} does not exist", file=sys.stderr)
        return 1

    html = home.read_text(encoding="utf-8")
    facts = ActivityFacts()
    facts.feed(html)

    errors: list[str] = []
    expected_modules = [module for module in args.expect_modules.split(",") if module]
    if facts.activity_panes != 1:
        errors.append(f"Home has {facts.activity_panes} <as-activity> panes, expected 1")
    if facts.modules != expected_modules:
        errors.append(f"activity modules are {facts.modules!r}, expected {expected_modules!r}")
    required_text = ["activity/"]
    if "site" in expected_modules:
        required_text += ["main@", "собрано"]
    for text in required_text:
        if text not in html:
            errors.append(f"activity pane is missing {text!r}")
    if "site" in expected_modules and not re.search(r"main@[0-9a-f]{7}(?![0-9a-f])", html):
        errors.append("site module does not carry a seven-character Git commit")
    if "сейчас играет" in html.lower() or "now playing" in html.lower():
        errors.append("music module claims the snapshot is live")
    if facts.external_scripts:
        errors.append(f"external scripts found: {facts.external_scripts}")

    if errors:
        print("FAIL: Home activity pane violates its contract", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"OK: Home has one static activity pane with modules {expected_modules!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
