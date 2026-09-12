#!/usr/bin/env python3
"""Verify the built navigation-only Service Worker contract."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


REGISTER_SRC = re.compile(r"^/js/sw-register\..+\.js$")


class OfflineParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = False
        self.h1 = False
        self.main = False
        self.robots: str | None = None
        self.description: str | None = None
        self.home_link = False
        self.style_count = 0
        self.script_count = 0
        self.canonical = False
        self.og = False
        self.json_ld = False
        self.fetching_dependencies: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        rel = (attributes.get("rel") or "").split()
        if tag == "title":
            self.title = True
        elif tag == "h1":
            self.h1 = True
        elif tag == "main":
            self.main = True
        elif tag == "style":
            self.style_count += 1
        elif tag == "script":
            self.script_count += 1
            if attributes.get("type") == "application/ld+json":
                self.json_ld = True
        elif tag == "meta":
            if attributes.get("name") == "robots":
                self.robots = attributes.get("content")
            elif attributes.get("name") == "description":
                self.description = attributes.get("content")
            elif (attributes.get("property") or "").startswith("og:"):
                self.og = True
        elif tag == "link" and "canonical" in rel:
            self.canonical = True
        elif tag == "a" and attributes.get("href") == "/":
            self.home_link = True

        fetches = False
        if tag in {"img", "source", "audio", "video", "iframe", "object", "embed"}:
            fetches = any(name in attributes for name in ("src", "srcset", "data"))
        elif tag == "script":
            fetches = "src" in attributes
        elif tag == "link":
            fetches = bool(
                set(rel)
                & {"stylesheet", "preload", "modulepreload", "icon", "manifest"}
            )
        if fetches:
            self.fetching_dependencies.append(tag)


class RegistrationParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.matches: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        src = attributes.get("src") or ""
        if tag == "script" and REGISTER_SRC.match(src):
            self.matches.append(attributes)


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def check_offline(errors: list[str], public_dir: Path) -> None:
    path = public_dir / "offline" / "index.html"
    check(errors, path.is_file(), f"missing {path}")
    if not path.is_file():
        return

    body = path.read_bytes()
    check(
        errors,
        len(body) <= 32 * 1024,
        f"/offline is {len(body)} bytes, exceeds 32 KiB",
    )
    parsed = OfflineParser()
    parsed.feed(body.decode("utf-8"))
    check(errors, parsed.title, "/offline has no title")
    check(errors, parsed.description is not None, "/offline has no description")
    check(errors, parsed.robots == "noindex", "/offline is not robots noindex")
    check(errors, parsed.main and parsed.h1, "/offline lacks main/h1 landmarks")
    check(errors, parsed.home_link, "/offline has no link to the home page")
    check(errors, parsed.style_count == 1, "/offline must carry one inline style")
    check(errors, parsed.script_count == 0, "/offline must not carry JavaScript")
    check(errors, not parsed.canonical, "/offline must not claim publication identity")
    check(errors, not parsed.og, "/offline must not carry Open Graph metadata")
    check(errors, not parsed.json_ld, "/offline must not carry JSON-LD")
    check(
        errors,
        not parsed.fetching_dependencies,
        f"/offline fetches external dependencies: {parsed.fetching_dependencies}",
    )

    for relative in ("sitemap.xml", "llms.txt", "search-index.json"):
        candidate = public_dir / relative
        if candidate.is_file():
            check(
                errors,
                "/offline" not in candidate.read_text(encoding="utf-8"),
                f"/{relative} advertises /offline",
            )
    for feed in public_dir.rglob("feed.*"):
        check(
            errors,
            "/offline" not in feed.read_text(encoding="utf-8"),
            f"{feed.relative_to(public_dir)} advertises /offline",
        )


def check_registration(errors: list[str], public_dir: Path) -> None:
    offline_path = public_dir / "offline" / "index.html"
    sources: set[str] = set()
    for html_path in sorted(public_dir.rglob("*.html")):
        parsed = RegistrationParser()
        parsed.feed(html_path.read_text(encoding="utf-8"))
        if html_path == offline_path:
            check(errors, not parsed.matches, "/offline must stay JavaScript-free")
            continue
        check(
            errors,
            len(parsed.matches) == 1,
            f"{html_path.relative_to(public_dir)} has {len(parsed.matches)} Service Worker registration scripts",
        )
        if len(parsed.matches) != 1:
            continue
        attributes = parsed.matches[0]
        src = attributes.get("src") or ""
        sources.add(src)
        check(errors, "defer" in attributes, f"{src} is not deferred")
        check(
            errors,
            (attributes.get("integrity") or "").startswith("sha"),
            f"{src} has no fingerprint integrity",
        )

    check(errors, len(sources) == 1, f"registration script sources differ: {sources}")
    if len(sources) != 1:
        return
    src = next(iter(sources))
    script_path = public_dir / src.lstrip("/")
    check(errors, script_path.is_file(), f"missing fingerprinted registration asset {src}")
    if script_path.is_file():
        script = script_path.read_text(encoding="utf-8")
        check(
            errors,
            re.search(r"register\([\"']/sw\.js[\"']\)", script) is not None,
            f"{src} does not register /sw.js",
        )


def check_worker(errors: list[str], public_dir: Path) -> None:
    path = public_dir / "sw.js"
    check(errors, path.is_file(), f"missing {path}")
    if not path.is_file():
        return
    source = path.read_text(encoding="utf-8")

    required = {
        "private cache namespace": 'const CACHE_PREFIX = "dc-sw:"',
        "offline precache": 'const OFFLINE_URL = "/offline"',
        "cache timestamp": 'const CACHED_AT_HEADER = "X-DC-SW-Cached-At"',
        "12-document limit": "const MAX_DOCUMENTS = 12",
        "512 KiB limit": "const MAX_DOCUMENT_BYTES = 512 * 1024",
        "7-day TTL": "const DOCUMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000",
        "navigation-only guard": 'request.mode !== "navigate"',
        "same-origin guard": "url.origin !== self.location.origin",
        "404 revocation": "response.status === 404",
        "410 revocation": "response.status === 410",
        "5xx pass-through": "response.status >= 500",
        "redirect guard": "!response.redirected",
        "query guard": 'url.search === ""',
        "fetch response": "event.respondWith",
        "immediate update": "self.skipWaiting()",
        "immediate control": "self.clients.claim()",
    }
    for label, needle in required.items():
        check(errors, needle in source, f"/sw.js lacks {label}")

    check(errors, "importScripts" not in source, "/sw.js must stay vanilla")
    check(errors, "workbox" not in source.lower(), "/sw.js must not use Workbox")
    root_urls = set(re.findall(r'["\'](/[^"\']*)["\']', source))
    check(
        errors,
        root_urls == {"/offline"},
        f"/sw.js names resources other than the offline document: {sorted(root_urls)}",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    errors: list[str] = []
    check_worker(errors, public_dir)
    check_offline(errors, public_dir)
    check_registration(errors, public_dir)

    if errors:
        print("Service Worker contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    size = (public_dir / "offline" / "index.html").stat().st_size
    print(
        "OK: navigation-only /sw.js, one fingerprinted registration asset, "
        f"self-contained /offline ({size} bytes)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
