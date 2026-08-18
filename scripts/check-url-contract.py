#!/usr/bin/env python3
"""Verify the single canonical URL form (see ADR redesign-canonical-url-policy).

Every internal address the site emits — HTML links, canonical/og:url, MF2
u-url, sitemap, RSS, JSON Feed, JSON-LD, web app manifest — must use one and
the same form: no trailing slash, except the site root. A second form is a
real defect once Cloudflare answers `drop-trailing-slash` (T4): the page would
declare a canonical URL that itself redirects.

Works offline over the built `public/` directory; no network access.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlsplit

SITE_ORIGIN = "https://alexandr-sidorenko.me"
PUBLICATION_SECTIONS = ("library",)
# meta tags whose content is a URL; other meta content is prose and must not
# be mistaken for an address.
URL_META = {"og:url", "og:image", "twitter:image"}
ATOM_LINK = "{http://www.w3.org/2005/Atom}link"


def is_internal(url: str) -> bool:
    if url.startswith("//"):
        return False
    if url.startswith("/"):
        return True
    return url == SITE_ORIGIN or url.startswith(SITE_ORIGIN + "/")


def has_trailing_slash(url: str) -> bool:
    """True when an internal URL carries the forbidden trailing slash: the
    root `/` is the one documented exception."""
    if not is_internal(url):
        return False
    path = urlsplit(url).path
    return path != "/" and path.endswith("/")


def canonical_form(url: str) -> str:
    return url if urlsplit(url).path == "/" else url.rstrip("/")


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def self_test() -> None:
    """A broken detector must not silently report green."""
    assert has_trailing_slash("/library/"), "self-test: relative form not detected"
    assert has_trailing_slash(f"{SITE_ORIGIN}/library/philosophy-of-freedom/"), (
        "self-test: absolute form not detected"
    )
    assert not has_trailing_slash("/"), "self-test: root must stay allowed"
    assert not has_trailing_slash(f"{SITE_ORIGIN}/"), (
        "self-test: absolute root must stay allowed"
    )
    assert not has_trailing_slash("/feed.xml"), "self-test: file address flagged"
    assert not has_trailing_slash("https://example.com/other/"), (
        "self-test: external URL is none of this contract's business"
    )
    assert not has_trailing_slash("https://alexandr-sidorenko.me.evil.test/x/"), (
        "self-test: origin prefix must not match a different host"
    )


class UrlHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[tuple[str, str]] = []
        self.canonical: str | None = None
        self.og_url: str | None = None
        self.u_url: str | None = None
        # Identity marker: only a publication carries one (T117).
        self.u_uid: str | None = None
        self.json_ld: list[dict] = []
        self._in_json_ld = False
        self._json_ld_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        rel = (attributes.get("rel") or "").split()

        for attribute in ("href", "src"):
            if value := attributes.get(attribute):
                self.urls.append((f"<{tag} {attribute}>", value))
        if tag == "meta":
            key = attributes.get("property") or attributes.get("name")
            value = attributes.get("content")
            if key in URL_META and value:
                self.urls.append((f"<meta {key}>", value))
                if key == "og:url":
                    self.og_url = value
        if tag == "link" and "canonical" in rel:
            self.canonical = attributes.get("href")
        # First u-url only: byline.html renders a nested p-author h-card with
        # its own u-url (the author's homepage), not the entry's location.
        if tag == "a" and "u-url" in classes and self.u_url is None:
            self.u_url = attributes.get("href")
        if tag == "data" and "u-uid" in classes and self.u_uid is None:
            self.u_uid = attributes.get("value")
        if tag == "script" and attributes.get("type") == "application/ld+json":
            self._in_json_ld = True
            self._json_ld_text = []

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self._json_ld_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            try:
                parsed = json.loads("".join(self._json_ld_text))
            except json.JSONDecodeError:
                return
            if isinstance(parsed, dict):
                self.json_ld.append(parsed)


def walk_json(value: object, path: str = "") -> list[tuple[str, str]]:
    """Every string leaf with its dotted location, so a URL found anywhere in
    a JSON document can be reported by name."""
    if isinstance(value, dict):
        found: list[tuple[str, str]] = []
        for key, item in value.items():
            found += walk_json(item, f"{path}.{key}" if path else str(key))
        return found
    if isinstance(value, list):
        found = []
        for index, item in enumerate(value):
            found += walk_json(item, f"{path}[{index}]")
        return found
    if isinstance(value, str):
        return [(path, value)]
    return []


def page_url(public_dir: Path, html_path: Path) -> str:
    relative = html_path.relative_to(public_dir).parent.as_posix()
    if relative == ".":
        return f"{SITE_ORIGIN}/"
    # Non-ASCII path segments (tag terms) are percent-encoded in the output.
    return f"{SITE_ORIGIN}/{quote(relative, safe='/')}"


def manifest_target_exists(public_dir: Path, url: str) -> bool:
    """True when an internal manifest address resolves to a built file."""
    if not is_internal(url):
        return True
    path = urlsplit(url).path
    if path == "/":
        return (public_dir / "index.html").is_file()
    relative = path.lstrip("/")
    direct = public_dir / relative
    if direct.is_file():
        return True
    return (public_dir / relative / "index.html").is_file()


def rss_urls(feed_path: Path) -> tuple[list[tuple[str, str]], dict[str, str]]:
    """(location, url) pairs for form checking, plus item link by guid-free
    key so the cross-representation comparison can find a publication."""
    root = ET.parse(feed_path).getroot()
    found: list[tuple[str, str]] = []
    items: dict[str, str] = {}
    channel = root.find("channel")
    if channel is None:
        return found, items
    if (link := channel.findtext("link")) is not None:
        found.append(("channel/link", link))
    for atom in channel.findall(ATOM_LINK):
        if href := atom.get("href"):
            found.append(("channel/atom:link", href))
    for index, item in enumerate(channel.findall("item")):
        link = item.findtext("link")
        if link is not None:
            found.append((f"item[{index}]/link", link))
            items[link] = link
    return found, items


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir

    self_test()

    errors: list[str] = []
    checked_urls = 0

    # 1. Form: no internal address anywhere in the build may carry a trailing
    #    slash, whatever representation it lives in.
    html_pages = sorted(public_dir.rglob("*.html"))
    check(errors, bool(html_pages), f"no HTML pages under {public_dir}")
    parsed_pages: dict[Path, UrlHtmlParser] = {}

    for html_path in html_pages:
        parsed = UrlHtmlParser()
        parsed.feed(html_path.read_text())
        parsed_pages[html_path] = parsed
        name = html_path.relative_to(public_dir)
        for location, url in parsed.urls:
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"{name}: {location} {url!r} has a trailing slash")
        for block in parsed.json_ld:
            for location, url in walk_json(block):
                if not is_internal(url):
                    continue
                checked_urls += 1
                check(errors, not has_trailing_slash(url), f"{name}: JSON-LD {location} {url!r} has a trailing slash")

    # /llms.txt is Markdown, so its addresses live in link syntax rather than in
    # markup a parser would find above (T67). Without this the map would be the
    # one representation free to publish a trailing slash.
    llms_path = public_dir / "llms.txt"
    llms_urls: set[str] = set()
    if llms_path.exists():
        for url in re.findall(r"\]\((https?://[^)]+)\)", llms_path.read_text()):
            if not is_internal(url):
                continue
            llms_urls.add(url)
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"llms.txt: {url!r} has a trailing slash")

    sitemap_locs: set[str] = set()
    sitemap_path = public_dir / "sitemap.xml"
    check(errors, sitemap_path.exists(), "missing sitemap.xml")
    if sitemap_path.exists():
        namespace = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        for url_node in ET.parse(sitemap_path).getroot().findall(f"{namespace}url"):
            loc = url_node.findtext(f"{namespace}loc")
            if loc is None:
                continue
            sitemap_locs.add(loc)
            checked_urls += 1
            check(errors, not has_trailing_slash(loc), f"sitemap.xml: <loc> {loc!r} has a trailing slash")

    rss_items: dict[str, set[str]] = {}
    for feed_path in sorted(public_dir.rglob("feed.xml")):
        name = feed_path.relative_to(public_dir)
        found, items = rss_urls(feed_path)
        rss_items[str(name)] = set(items)
        for location, url in found:
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"{name}: {location} {url!r} has a trailing slash")

    json_feed_items: dict[str, set[str]] = {}
    for feed_path in sorted(public_dir.rglob("feed.json")):
        name = feed_path.relative_to(public_dir)
        feed = json.loads(feed_path.read_text())
        json_feed_items[str(name)] = {item["url"] for item in feed.get("items", []) if "url" in item}
        for location, url in walk_json(feed):
            if not is_internal(url):
                continue
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"{name}: {location} {url!r} has a trailing slash")

    manifest_path = public_dir / "site.webmanifest"
    if manifest_path.exists():
        for location, url in walk_json(json.loads(manifest_path.read_text())):
            if not is_internal(url):
                continue
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"site.webmanifest: {location} {url!r} has a trailing slash")
            check(
                errors,
                manifest_target_exists(public_dir, url),
                f"site.webmanifest: {location} {url!r} does not resolve in the build",
            )

    # 2. Agreement: every representation of one page must be the same byte
    #    string, not merely slash-free.
    all_rss_links = set().union(*rss_items.values()) if rss_items else set()
    all_json_feed_urls = set().union(*json_feed_items.values()) if json_feed_items else set()

    for html_path, parsed in parsed_pages.items():
        name = html_path.relative_to(public_dir)
        expected = page_url(public_dir, html_path)
        if parsed.canonical is None:
            # 404 has no canonical by contract (T39); check-404-contract.py owns that.
            continue

        check(errors, parsed.canonical == expected, f"{name}: canonical {parsed.canonical!r} != {expected!r}")
        check(errors, parsed.og_url == expected, f"{name}: og:url {parsed.og_url!r} != {expected!r}")
        for block in parsed.json_ld:
            for field in ("url", "mainEntityOfPage"):
                if field in block:
                    check(errors, block[field] == expected, f"{name}: JSON-LD {field} {block[field]!r} != {expected!r}")
        check(errors, expected in sitemap_locs, f"{name}: {expected!r} missing from sitemap.xml")

        section = name.parts[0] if len(name.parts) > 1 else ""
        # Identity, not location, says what a publication is: /library/all and
        # /library/types are views of the library and carry no u-uid (T117).
        is_publication = (
            section in PUBLICATION_SECTIONS
            and len(name.parts) == 3
            and parsed.u_uid is not None
        )
        if is_publication:
            check(errors, parsed.u_url == expected, f"{name}: u-url {parsed.u_url!r} != {expected!r}")
            check(errors, expected in all_rss_links, f"{name}: {expected!r} missing from RSS <link>")
            check(errors, expected in all_json_feed_urls, f"{name}: {expected!r} missing from JSON Feed url")
            if llms_path.exists():
                check(errors, expected in llms_urls, f"{name}: {expected!r} missing from llms.txt")

    if errors:
        print("URL contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(parsed_pages)} page(s), {checked_urls} internal address(es) — one canonical form, all representations agree")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
