#!/usr/bin/env python3
"""Verify the built Home activity pane and site-provenance fields.

The pane is three modules in a fixed order: what was listened to, what was
coded, what was deployed. Each disappears with its data, so the check
takes the expected set as an argument rather than assuming all three.

The `dev` module has one rule of its own worth asserting: XP is never printed.
The page shows weekly hours and seven bars, and the numbers behind the bars stay
in the importer.

On Home there is no neofetch pane: GitHub already lives in socials, the
deployed commit lives in activity/site, and `# since:` / `main@` stay off
the page. Recent shows primary RSS.

--self-test builds ordinary Home with representative revision SHA inputs;
--hugo selects the pinned Extended binary for that disposable regression.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

SOURCE_REPO = "https://github.com/batyshkaLenin/alexandr-sidorenko.me"
COMMIT_HREF = re.compile(
    rf"^{re.escape(SOURCE_REPO)}/commit/[0-9a-f]{{7,40}}$"
)
SHORT_HASH = re.compile(r"^[0-9a-f]{7}$")


class HomeFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.activity_panes = 0
        self.modules: list[str] = []
        self.external_scripts: list[str] = []
        self.site_href: str | None = None
        self.site_label: str | None = None
        self.site_text = ""
        self.rss_hrefs: list[str] = []
        self._activity_depth = 0
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
                self.site_label = attributes.get("aria-label")

        if tag == "a" and "dc-badge" in classes:
            self._badge_text = []
            self._badge_href = attributes.get("href") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self._site_value_depth:
            self._site_value_depth -= 1
            self.site_text = "".join(self._site_text).strip()
        elif tag == "section" and self._site_depth:
            self._site_depth -= 1
        elif tag == "as-activity" and self._activity_depth:
            self._activity_depth -= 1
        elif tag == "a" and self._badge_text is not None:
            if "".join(self._badge_text).strip().lower() == "rss":
                self.rss_hrefs.append(self._badge_href)
            self._badge_text = None

    def handle_data(self, data: str) -> None:
        if self._site_value_depth:
            self._site_text.append(data)
        if self._badge_text is not None:
            self._badge_text.append(data)


def self_test_revision(hugo: str) -> int:
    """Exercise the real Home/i18n contract, including numeric-looking hex."""
    root = Path(__file__).resolve().parent.parent
    pinned = (root / ".tool-versions").read_text().split("hugo ")[1].split()[0]
    version = subprocess.check_output([hugo, "version"], text=True).strip()
    if f"v{pinned}-" not in version or "+extended" not in version:
        print(f"FAIL: expected Hugo Extended {pinned}, got {version}", file=sys.stderr)
        return 1
    revisions = [
        "14710e5857ca15cdab4004d2c6a9e057e36c2f3f",
        "8b0adcaa9b8c73026f402fe22828c5555f552720",
        *[prefix + "0" * (40 - len(prefix)) for prefix in ("deadbee", "abcdef0", "1234567")],
    ]
    with tempfile.TemporaryDirectory(prefix="home-revision-") as temporary:
        work = Path(temporary)
        for revision in revisions:
            short = revision[:7]
            if not SHORT_HASH.fullmatch(short):
                raise AssertionError(f"invalid regression short SHA: {short}")
            destination = work / short
            env = dict(os.environ, HUGO_BUILD_COMMIT=revision, HUGO_RESOURCEDIR=str(work / "resources"))
            result = subprocess.run(
                [hugo, "--environment", "preview", "--clock", "2026-10-13T00:00:00Z",
                 "--destination", str(destination), "--cacheDir", str(work / "cache"),
                 "--noBuildLock", "--minify", "--panicOnWarning"],
                cwd=root, env=env, capture_output=True, text=True,
            )
            if result.returncode:
                print(f"FAIL: Home revision {revision}\n{result.stdout}{result.stderr}", file=sys.stderr)
                return 1
            facts = HomeFacts()
            facts.feed((destination / "index.html").read_text(encoding="utf-8"))
            expected = (short, f"{SOURCE_REPO}/commit/{revision}", f"snapshot {short}")
            observed = (facts.site_text, facts.site_href, facts.site_label)
            if observed != expected:
                print(f"FAIL: revision {revision}: {observed!r}, expected {expected!r}", file=sys.stderr)
                return 1
            print(f"PASS: Home revision {short} is textual revision data")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", default="public")
    parser.add_argument("--expect-modules", default="music,dev,site")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--hugo", default=str(Path.home() / ".local/hugo/hugo"))
    args = parser.parse_args()
    if args.self_test:
        return self_test_revision(args.hugo)

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

    if "dc-neofetch" in html or ">neofetch<" in html:
        errors.append("Home still has a neofetch pane")
    if "# since:" in html:
        errors.append("visible '# since:' is still on Home")
    if "main@" in html:
        errors.append("site revision still uses the main@ label")
    if "© 2020" in html or "©2020" in html:
        errors.append("copyright mark is drawn on Home")

    if "site" in expected_modules:
        if "built" not in html:
            errors.append("activity pane is missing 'built'")
        if not facts.site_href or not COMMIT_HREF.match(facts.site_href):
            errors.append(f"site revision href is {facts.site_href!r}, expected a commit URL")
        if not SHORT_HASH.match(facts.site_text):
            errors.append(f"site revision text is {facts.site_text!r}, expected a 7-character hash")
        if facts.site_label != f"snapshot {facts.site_text}":
            errors.append(f"site revision aria-label is {facts.site_label!r}, expected textual snapshot label")

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
