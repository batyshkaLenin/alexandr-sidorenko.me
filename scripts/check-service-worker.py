#!/usr/bin/env python3
"""Verify the built cleanup contract: no Service Worker layer remains (T227)."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


CLEANUP_SRC = re.compile(r"^/js/sw-cleanup\..+\.js$")


class RegistrationParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.matches: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        src = attributes.get("src") or ""
        if tag == "script" and CLEANUP_SRC.match(src):
            self.matches.append(attributes)


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def check_registration(errors: list[str], public_dir: Path) -> None:
    sources: set[str] = set()
    for html_path in sorted(public_dir.rglob("*.html")):
        parsed = RegistrationParser()
        parsed.feed(html_path.read_text(encoding="utf-8"))
        check(
            errors,
            len(parsed.matches) == 1,
            f"{html_path.relative_to(public_dir)} has {len(parsed.matches)} cleanup scripts",
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

    check(errors, len(sources) == 1, f"cleanup script sources differ: {sources}")
    if len(sources) == 1:
        check_cleanup_script(errors, public_dir, next(iter(sources)))


def check_worker(errors: list[str], root: Path, public_dir: Path) -> None:
    source_path = root / "assets" / "js" / "sw.js"
    built_path = public_dir / "sw.js"
    check(errors, source_path.is_file(), f"missing worker source {source_path}")
    check(errors, built_path.is_file(), f"missing {built_path}")
    if not source_path.is_file() or not built_path.is_file():
        return
    source = source_path.read_text(encoding="utf-8")
    built = built_path.read_text(encoding="utf-8")

    required = {
        "private cache namespace": 'const CACHE_PREFIX = "dc-sw:"',
        "removes its own caches": "caches.delete(name)",
        "unregisters itself": "self.registration.unregister()",
        "immediate update": "self.skipWaiting()",
        "immediate control": "self.clients.claim()",
    }
    for label, needle in required.items():
        check(errors, needle in source, f"assets/js/sw.js lacks {label}")

    banned = {
        "a fetch handler": 'addEventListener("fetch"',
        "a response of its own": "respondWith",
        "a cache write": "cache.put",
        "an import": "importScripts",
        "Workbox": "workbox",
    }
    for text, name in ((source, "assets/js/sw.js"), (built, "/sw.js")):
        for label, needle in banned.items():
            check(errors, needle not in text.lower(), f"{name} still carries {label}")
        root_urls = set(re.findall(r'["\'`](/[^"\'`]*)["\'`]', text))
        check(errors, not root_urls, f"{name} names site resources: {sorted(root_urls)}")

    check(errors, "dc-sw:" in built, "/sw.js lost its cache namespace in the build")
    check(
        errors,
        len(built.encode()) < len(source.encode()),
        "/sw.js is not minified from assets/js/sw.js",
    )


def check_cleanup_script(errors: list[str], public_dir: Path, src: str) -> None:
    script_path = public_dir / src.lstrip("/")
    check(errors, script_path.is_file(), f"missing fingerprinted cleanup asset {src}")
    if not script_path.is_file():
        return
    script = script_path.read_text(encoding="utf-8")
    for label, needle in {
        "reads every registration": "getRegistrations()",
        "unregisters": "unregister()",
        "removes retired caches": "dc-sw:",
    }.items():
        check(errors, needle in script, f"{src} never {label}")
    check(
        errors,
        re.search(r"\.register\(", script) is None,
        f"{src} still registers a Service Worker",
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
    check_worker(errors, root, public_dir)
    check_registration(errors, public_dir)

    if errors:
        print("Service Worker contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("OK: cleanup-only /sw.js, one fingerprinted cleanup asset, no offline layer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
