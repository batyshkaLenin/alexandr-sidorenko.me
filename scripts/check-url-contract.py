#!/usr/bin/env python3
"""Verify the single canonical URL form (no trailing slash).

Every internal address the site emits — HTML links, canonical/og:url, MF2
u-url, sitemap, RSS, JSON Feed, JSON-LD, web app manifest — must use one and
the same form: no trailing slash, except the site root. A second form is a
real defect once Cloudflare answers `drop-trailing-slash`: the page would
declare a canonical URL that itself redirects.

Also fails when an internal HTML href/src does not resolve inside `public/`,
and when robots.txt is missing or lacks a User-agent stanza (offline shape
only; live Allow/Disallow policy is an environment concern).

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
from urllib.parse import quote, unquote, urljoin, urlsplit

SITE_ORIGIN = "https://alexandr-sidorenko.me"
SKIP_HREF_SCHEMES = ("mailto:", "tel:", "javascript:", "data:")
PUBLICATION_SECTIONS = ("library",)
# Surfaces listed in llms.txt. Table, type/topic pages and
# publications are addressable HTML and must not appear here.
LLMS_ENTRY_POINTS = (
    f"{SITE_ORIGIN}/",
    f"{SITE_ORIGIN}/library",
    f"{SITE_ORIGIN}/library/all",
    f"{SITE_ORIGIN}/library/timeline",
    f"{SITE_ORIGIN}/library/types",
    f"{SITE_ORIGIN}/library/topics",
    f"{SITE_ORIGIN}/library/music",
)
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
        self.robots: str | None = None
        self.og_url: str | None = None
        self.u_url: str | None = None
        # Identity marker: only a publication carries one.
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
            if key == "robots" and value:
                self.robots = value
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


def target_exists(public_dir: Path, url: str) -> bool:
    """True when an internal address resolves to a built file under public/."""
    if not is_internal(url):
        return True
    path = urlsplit(url).path
    if path == "/":
        return (public_dir / "index.html").is_file()
    relative = unquote(path.lstrip("/"))
    direct = public_dir / relative
    if direct.is_file():
        return True
    return (public_dir / relative / "index.html").is_file()


def manifest_target_exists(public_dir: Path, url: str) -> bool:
    """True when an internal manifest address resolves to a built file."""
    return target_exists(public_dir, url)


def should_resolve_href(url: str) -> bool:
    """Skip fragments-only and non-navigational schemes; keep internal targets."""
    if not url or url.startswith("#"):
        return False
    lowered = url.lower()
    if lowered.startswith(SKIP_HREF_SCHEMES):
        return False
    return is_internal(url) or not ("://" in url or url.startswith("//"))


def absolute_internal(page_url_base: str, href: str) -> str | None:
    """Resolve href against the page URL; return absolute internal URL or None."""
    if href.startswith(SKIP_HREF_SCHEMES) or href.startswith("#"):
        return None
    absolute = urljoin(page_url_base, href)
    if not is_internal(absolute):
        return None
    # Existence ignores fragment/query; form checks already saw the raw value.
    cleaned = absolute.split("#", 1)[0].split("?", 1)[0]
    return cleaned or None


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
        page_base = page_url(public_dir, html_path)
        if not page_base.endswith("/"):
            # urljoin treats .../slug as a file; page directories need a slash.
            page_base = page_base + "/"
        for location, url in parsed.urls:
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"{name}: {location} {url!r} has a trailing slash")
            if should_resolve_href(url) and location.startswith(("<a ", "<link ", "<img ", "<source ", "<audio ", "<video ")):
                absolute = absolute_internal(page_base, url)
                if absolute is not None:
                    check(
                        errors,
                        target_exists(public_dir, absolute),
                        f"{name}: {location} {url!r} does not resolve in the build",
                    )
        for block in parsed.json_ld:
            for location, url in walk_json(block):
                if not is_internal(url):
                    continue
                checked_urls += 1
                check(errors, not has_trailing_slash(url), f"{name}: JSON-LD {location} {url!r} has a trailing slash")

    # /llms.txt is Markdown, so its addresses live in link syntax rather than in
    # markup a parser would find above. Without this the map would
    # be the one representation free to publish a trailing slash.
    llms_path = public_dir / "llms.txt"
    llms_urls: set[str] = set()
    check(errors, llms_path.exists(), "missing llms.txt")
    if llms_path.exists():
        for url in re.findall(r"\]\((https?://[^)]+)\)", llms_path.read_text()):
            if not is_internal(url):
                continue
            llms_urls.add(url)
            checked_urls += 1
            check(errors, not has_trailing_slash(url), f"llms.txt: {url!r} has a trailing slash")
        for expected in LLMS_ENTRY_POINTS:
            check(errors, expected in llms_urls, f"llms.txt: entry point {expected!r} missing")
        for url in llms_urls:
            parts = [part for part in urlsplit(url).path.split("/") if part]
            if parts == ["library", "table"]:
                check(errors, False, f"llms.txt: table view {url!r} is not advertised")
            if len(parts) >= 3 and parts[0] == "library" and parts[1] in {"types", "topics"}:
                check(errors, False, f"llms.txt: facet page {url!r} is not advertised")

    robots_path = public_dir / "robots.txt"
    check(errors, robots_path.is_file(), "missing robots.txt")
    if robots_path.is_file():
        robots_body = robots_path.read_text()
        check(
            errors,
            re.search(r"(?im)^user-agent\s*:", robots_body) is not None,
            "robots.txt: missing User-agent stanza",
        )

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
            # System documents have no canonical. Their dedicated contract
            # checks own noindex and discoverability.
            continue

        check(errors, parsed.canonical == expected, f"{name}: canonical {parsed.canonical!r} != {expected!r}")
        check(errors, parsed.og_url == expected, f"{name}: og:url {parsed.og_url!r} != {expected!r}")
        for block in parsed.json_ld:
            for field in ("url", "mainEntityOfPage"):
                if field in block:
                    check(errors, block[field] == expected, f"{name}: JSON-LD {field} {block[field]!r} != {expected!r}")
        noindex = parsed.robots is not None and "noindex" in parsed.robots.lower()
        if noindex:
            # Bookmarkable noindex pages keep a canonical but
            # must not appear in the sitemap of indexable resources.
            check(
                errors,
                expected not in sitemap_locs,
                f"{name}: noindex page {expected!r} listed in sitemap.xml",
            )
        else:
            check(errors, expected in sitemap_locs, f"{name}: {expected!r} missing from sitemap.xml")

        section = name.parts[0] if len(name.parts) > 1 else ""
        # Identity, not location, says what a publication is: /library/all and
        # /library/types are views of the library and carry no u-uid.
        is_publication = (
            section in PUBLICATION_SECTIONS
            and len(name.parts) == 3
            and parsed.u_uid is not None
        )
        if is_publication:
            check(errors, parsed.u_url == expected, f"{name}: u-url {parsed.u_url!r} != {expected!r}")
            check(errors, expected in all_rss_links, f"{name}: {expected!r} missing from RSS <link>")
            check(errors, expected in all_json_feed_urls, f"{name}: {expected!r} missing from JSON Feed url")
            # MACHINE-LLMS is a map of entry points, not an inventory.
            if llms_path.exists():
                check(
                    errors,
                    expected not in llms_urls,
                    f"{name}: publication {expected!r} listed in llms.txt",
                )

    if errors:
        print("URL contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"OK: {len(parsed_pages)} page(s), {checked_urls} internal address(es) — one canonical form, all representations agree")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
