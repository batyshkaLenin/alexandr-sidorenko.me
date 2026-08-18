#!/usr/bin/env python3
"""Verify the built Home activity pane and site-provenance contract (T138, T149, T147).

The pane is three modules in a fixed order: what was listened to, what was
coded, what was deployed. Each disappears with its data (§16.2), so the check
takes the expected set as an argument rather than assuming all three.

The `dev` module has one rule of its own worth asserting: XP is never printed.
The page shows weekly hours and seven bars, and the numbers behind the bars stay
in the importer (ADR redesign-activity-dev-module).

T147 ownership on Home: neofetch carries `uptime` and `source` (repo URL, never
a commit hash); activity/site carries a linked `revision` and build metadata,
never the repo string as a field; Recent shows primary RSS; `# since:` and
`main@` stay off the page.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SOURCE_REPO = "https://github.com/batyshkaLenin/alexandr-sidorenko.me"
COMMIT_HREF = re.compile(
    rf"^{re.escape(SOURCE_REPO)}/commit/[0-9a-f]{{7,40}}$"
)
SHORT_HASH = re.compile(r"^[0-9a-f]{7}$")
UPTIME = re.compile(r"~[1-9]\d* years?")


class HomeFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.activity_panes = 0
        self.modules: list[str] = []
        self.external_scripts: list[str] = []
        self.neofetch_keys: list[str] = []
        self.source_href: str | None = None
        self.site_href: str | None = None
        self.site_text = ""
        self.rss_hrefs: list[str] = []
        self._activity_depth = 0
        self._neofetch_depth = 0
        self._in_dt = False
        self._dt_text: list[str] = []
        self._current_key = ""
        self._site_depth = 0
        self._site_value_depth = 0
        self._site_text: list[str] = []
        self._badge_text: list[str] | None = None
        self._badge_href = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()

        if tag == "script":
            source = attributes.get("src", "") or ""
            if source.startswith(("http://", "https://", "//")):
                self.external_scripts.append(source)

        if tag == "as-activity":
            self.activity_panes += 1
            self._activity_depth += 1
        if tag == "dl" and "dc-neofetch" in classes:
            self._neofetch_depth += 1

        if self._neofetch_depth:
            if tag == "dt":
                self._in_dt = True
                self._dt_text = []
            elif tag == "a" and self._current_key == "source":
                self.source_href = attributes.get("href") or ""

        if self._activity_depth and tag == "section":
            module = attributes.get("data-activity-module")
            if module:
                self.modules.append(module)
                if module == "site":
                    self._site_depth += 1

        if self._site_depth:
            if tag == "p" and "as-activity__value" in classes:
                self._site_value_depth += 1
                self._site_text = []
            elif tag == "a" and self._site_value_depth:
                self.site_href = attributes.get("href") or ""

        if tag == "a" and "dc-badge" in classes:
            self._badge_text = []
            self._badge_href = attributes.get("href") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "dt" and self._in_dt:
            self._in_dt = False
            key = "".join(self._dt_text).strip()
            self._current_key = key
            if key:
                self.neofetch_keys.append(key)
        elif tag == "p" and self._site_value_depth:
            self._site_value_depth -= 1
            self.site_text = "".join(self._site_text).strip()
        elif tag == "section" and self._site_depth:
            self._site_depth -= 1
        elif tag == "as-activity" and self._activity_depth:
            self._activity_depth -= 1
        elif tag == "dl" and self._neofetch_depth:
            self._neofetch_depth -= 1
            self._current_key = ""
        elif tag == "a" and self._badge_text is not None:
            if "".join(self._badge_text).strip().lower() == "rss":
                self.rss_hrefs.append(self._badge_href)
            self._badge_text = None

    def handle_data(self, data: str) -> None:
        if self._in_dt:
            self._dt_text.append(data)
        if self._site_value_depth:
            self._site_text.append(data)
        if self._badge_text is not None:
            self._badge_text.append(data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--expect-modules", default="music,dev,site")
    args = parser.parse_args()

    public = Path(args.public_dir).resolve()
    home = public / "index.html"
    if not home.is_file():
        print(f"FAIL: {home} does not exist", file=sys.stderr)
        return 1

    html = home.read_text(encoding="utf-8")
    facts = HomeFacts()
    facts.feed(html)

    errors: list[str] = []
    expected_modules = [module for module in args.expect_modules.split(",") if module]
    if facts.activity_panes != 1:
        errors.append(f"Home has {facts.activity_panes} <as-activity> panes, expected 1")
    if facts.modules != expected_modules:
        errors.append(f"activity modules are {facts.modules!r}, expected {expected_modules!r}")
    if "activity/" not in html:
        errors.append("activity pane is missing 'activity/'")
    if "dev" in expected_modules:
        if not re.search(r"data-dev-levels=[\"']?[0-7](,[0-7]){6}", html):
            errors.append("the dev module carries no seven-day shape")
        if re.search(r"\bXP\b", html):
            errors.append("XP appears on the page: the dev module publishes intensity, not counts")
    if "сейчас играет" in html.lower() or "now playing" in html.lower():
        errors.append("music module claims the snapshot is live")
    if facts.external_scripts:
        errors.append(f"external scripts found: {facts.external_scripts}")

    if "uptime" not in facts.neofetch_keys:
        errors.append("neofetch is missing uptime")
    elif not UPTIME.search(html):
        errors.append("neofetch uptime is not '~N years'")
    if "source" not in facts.neofetch_keys:
        errors.append("neofetch is missing source")
    elif facts.source_href != SOURCE_REPO:
        errors.append(f"neofetch source points at {facts.source_href!r}, expected {SOURCE_REPO}")
    if "# since:" in html:
        errors.append("visible '# since:' is still on Home")
    if "main@" in html:
        errors.append("site revision still uses the main@ label")
    if "© 2020" in html or "©2020" in html:
        errors.append("copyright mark is drawn on Home")

    if "site" in expected_modules:
        if "собрано" not in html:
            errors.append("activity pane is missing 'собрано'")
        if not facts.site_href or not COMMIT_HREF.match(facts.site_href):
            errors.append(f"site revision href is {facts.site_href!r}, expected a commit URL")
        if not SHORT_HASH.match(facts.site_text):
            errors.append(f"site revision text is {facts.site_text!r}, expected a 7-character hash")

    if "/feed.xml" not in facts.rss_hrefs:
        errors.append(f"Home Recent has no primary RSS badge, found {facts.rss_hrefs!r}")

    if errors:
        print("FAIL: Home activity pane violates its contract", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"OK: Home has one static activity pane with modules {expected_modules!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
