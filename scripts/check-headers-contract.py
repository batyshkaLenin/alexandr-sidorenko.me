#!/usr/bin/env python3
"""Verify the published `_headers` against the header contract (T72).

The contract is ADR `redesign-headers-and-cache-contract`; the expected values
below are that decision written out, so a drift in either direction fails here
instead of silently shipping.

Two modes. By default it reads `_headers` out of the build directory and checks
the rules themselves plus their coverage of the files actually produced. With
`--base-url` it additionally asks a running origin for one representative of
each class and compares the real response headers — that is the only way to see
what the platform ends up sending.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RULE_LIMIT = 100
LINE_LIMIT = 2000

IMMUTABLE = "public, max-age=31536000, immutable"
WEEK = "public, max-age=604800"
DAY = "public, max-age=86400"
HOUR = "public, max-age=3600"
REVALIDATE = "public, max-age=0, must-revalidate"

SECURITY = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; "
        "font-src 'self'; media-src 'self'; connect-src 'self'; form-action 'none'; "
        "frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
    ),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": (
        "geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()"
    ),
}

EXPECTED_CACHE = {
    "/css/*": IMMUTABLE,
    "/js/*": IMMUTABLE,
    "/avatar_hu_*": IMMUTABLE,
    "/assets/*.webp": IMMUTABLE,
    "/assets/*.jpg": IMMUTABLE,
    "/assets/*.png": IMMUTABLE,
    "/fonts/*": WEEK,
    "/assets/*.mp3": WEEK,
    "/favicon.ico": DAY,
    "/logo192.png": DAY,
    "/logo512.png": DAY,
    "/site.webmanifest": DAY,
    "/feed.xml": HOUR,
    "/feed.json": HOUR,
    "/library/feed.xml": HOUR,
    "/library/feed.json": HOUR,
    "/sitemap.xml": HOUR,
    "/robots.txt": HOUR,
    "/llms.txt": HOUR,
    "/sw.js": REVALIDATE,
}

# Feeds also carry a media type: the platform derives Content-Type from the file
# extension and lands on the generic application/xml and application/json, so the
# specific feed types are stated in _headers (T4).
EXPECTED_CONTENT_TYPE = {
    "/feed.xml": "application/rss+xml; charset=utf-8",
    "/feed.json": "application/feed+json; charset=utf-8",
    "/library/feed.xml": "application/rss+xml; charset=utf-8",
    "/library/feed.json": "application/feed+json; charset=utf-8",
}

# HTML deliberately has no rule: the platform default is already the contract's
# value, and a rule on /* would be joined with every other Cache-Control by
# comma instead of replacing it.
HTML_EXPECTED = REVALIDATE

# A URL may only claim immutable when its name carries a content hash.
CONTENT_ADDRESSED = ("/css/*", "/js/*", "/avatar_hu_*", "/assets/*.webp", "/assets/*.jpg", "/assets/*.png")


def parse_headers_file(text: str) -> tuple[dict[str, dict[str, str]], list[str]]:
    rules: dict[str, dict[str, str]] = {}
    order: list[str] = []
    current: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")):
            current = line.strip()
            rules.setdefault(current, {})
            order.append(current)
            continue
        if current is None:
            continue
        name, _, value = line.strip().partition(":")
        rules[current][name.strip()] = value.strip()
    return rules, order


def pattern_to_regex(pattern: str) -> re.Pattern[str]:
    return re.compile("^" + ".*".join(re.escape(part) for part in pattern.split("*")) + "$")


def matching_cache_rule(path: str, rules: dict[str, dict[str, str]]) -> str | None:
    for pattern, headers in rules.items():
        if pattern == "/*" or "Cache-Control" not in headers:
            continue
        if pattern_to_regex(pattern).match(path):
            return headers["Cache-Control"]
    return None


def check_rules(errors: list[str], rules: dict[str, dict[str, str]], order: list[str], text: str) -> None:
    if len(order) > RULE_LIMIT:
        errors.append(f"{len(order)} rules, platform limit is {RULE_LIMIT}")
    if len(order) != len(set(order)):
        errors.append("the same path appears twice; matching rules are merged, not replaced")
    for number, line in enumerate(text.splitlines(), start=1):
        if len(line) > LINE_LIMIT:
            errors.append(f"line {number} is longer than {LINE_LIMIT} characters")

    catch_all = rules.get("/*")
    if catch_all is None:
        errors.append("no /* rule: the security headers reach no response")
        return
    if "Cache-Control" in catch_all:
        errors.append("/* sets Cache-Control: it would be comma-joined with every other rule")
    for name, value in SECURITY.items():
        actual = catch_all.get(name)
        if actual is None:
            errors.append(f"/*: missing {name}")
        elif actual != value:
            errors.append(f"/*: {name} differs from the ADR\n    expected: {value}\n    actual:   {actual}")
    if "Strict-Transport-Security" in catch_all:
        errors.append("HSTS is present, but the ADR defers it until after cutover")

    for pattern, expected in EXPECTED_CACHE.items():
        headers = rules.get(pattern)
        if headers is None:
            errors.append(f"missing rule for {pattern}")
            continue
        actual = headers.get("Cache-Control")
        if actual != expected:
            errors.append(f"{pattern}: Cache-Control is {actual!r}, ADR says {expected!r}")

    for pattern, headers in rules.items():
        if "immutable" in headers.get("Cache-Control", "") and pattern not in CONTENT_ADDRESSED:
            errors.append(f"{pattern}: immutable on a URL that is not content-addressed")

    for path, expected in EXPECTED_CONTENT_TYPE.items():
        actual = rules.get(path, {}).get("Content-Type")
        if actual != expected:
            errors.append(f"{path}: Content-Type is {actual!r}, ADR says {expected!r}")


def check_coverage(errors: list[str], rules: dict[str, dict[str, str]], public_dir: Path) -> None:
    """Every built file should land in a class the contract knows about."""
    for path in sorted(public_dir.rglob("*")):
        # `_headers` and `_redirects` are consumed by the platform, not served:
        # both answer 404 on the deployed origin, so no cache class applies.
        if not path.is_file() or path.name in ("_headers", "_redirects"):
            continue
        url = "/" + path.relative_to(public_dir).as_posix()
        if url.endswith(".html"):
            if matching_cache_rule(url, rules) is not None:
                errors.append(f"{url}: HTML must keep the platform default, but a rule sets Cache-Control")
            continue
        if matching_cache_rule(url, rules) is None:
            errors.append(f"{url}: no Cache-Control rule covers this file")


def fetch_headers(url: str) -> dict[str, str]:
    # Some published assets have Cyrillic names ("Постоянщик.mp3"), which have
    # to be percent-encoded before they can go on a request line.
    #
    # The User-Agent is not decoration: Cloudflare answers 403 to the default
    # `Python-urllib/...`, so without it every live check fails as "Forbidden"
    # while the same URL is fine in a browser or curl.
    request = urllib.request.Request(
        urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;="),
        method="HEAD",
        headers={"User-Agent": "alexandr-sidorenko.me headers contract check"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return {key.lower(): value for key, value in response.headers.items()}


def check_live(errors: list[str], base_url: str, public_dir: Path) -> None:
    samples: list[tuple[str, str]] = [("/", HTML_EXPECTED)]
    for pattern, expected in EXPECTED_CACHE.items():
        regex = pattern_to_regex(pattern)
        for path in sorted(public_dir.rglob("*")):
            if not path.is_file():
                continue
            url = "/" + path.relative_to(public_dir).as_posix()
            if regex.match(url):
                samples.append((url, expected))
                break

    for url, expected in samples:
        try:
            headers = fetch_headers(base_url.rstrip("/") + url)
        except (urllib.error.URLError, TimeoutError) as error:
            errors.append(f"{url}: request failed ({error})")
            continue
        actual = headers.get("cache-control")
        if actual != expected:
            errors.append(f"{url}: served Cache-Control {actual!r}, ADR says {expected!r}")
        for name, value in SECURITY.items():
            served = headers.get(name.lower())
            if served != value:
                errors.append(f"{url}: served {name} {served!r} differs from the ADR")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument("--base-url", help="also verify the headers a running origin actually serves")
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    headers_file = public_dir / "_headers"

    if not headers_file.exists():
        print(f"{headers_file}: missing — the contract reaches no response", file=sys.stderr)
        return 1

    text = headers_file.read_text()
    rules, order = parse_headers_file(text)
    errors: list[str] = []
    check_rules(errors, rules, order, text)
    check_coverage(errors, rules, public_dir)
    if args.base_url and not errors:
        check_live(errors, args.base_url, public_dir)

    if errors:
        print("headers contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    scope = f", verified against {args.base_url}" if args.base_url else ""
    print(f"OK: {len(order)} rules within the {RULE_LIMIT} limit, values match the ADR{scope}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
