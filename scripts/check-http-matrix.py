#!/usr/bin/env python3
"""Verify the HTTP contract of a deployed origin.

Everything here is a property of the running host, not of the build: the URL
form the platform serves, the redirect it issues for the other form, the media
types it puts on feeds and assets, and what a missing page returns. The build
directory can only say what Hugo generated — `check-url-contract.py` does that.

Canonical URLs carry no trailing slash, and
Workers Static Assets is told so with `html_handling: drop-trailing-slash`.

Usage:

    python3 scripts/check-http-matrix.py --base-url https://<preview-host>
"""

from __future__ import annotations

import argparse
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "alexandr-sidorenko.me http matrix check"}
CANONICAL_HOST = "https://alexandr-sidorenko.me"

# HTML routes: the no-slash form is canonical, the slash form redirects to it.
HTML_ROUTES = [
    "/",
    "/library",
    "/library/philosophy-of-freedom",
    "/library/skver",
    "/library/topics",
]

# path -> expected media type prefix
MEDIA_TYPES = {
    "/feed.xml": "application/rss+xml",
    "/feed.json": "application/feed+json",
    "/library/feed.xml": "application/rss+xml",
    "/library/feed.json": "application/feed+json",
    "/sitemap.xml": "application/xml",
    "/robots.txt": "text/plain",
    "/llms.txt": "text/plain",
    "/key.pub": "application/pgp-keys",
    "/.well-known/security.txt": "text/plain",
    "/sw.js": "text/javascript",
    "/site.webmanifest": "application/manifest+json",
    "/assets/library/regular-visitor/Постоянщик.mp3": "audio/mpeg",
}

# Material Identity URIs resolve with 303 to the material's current address
# Material identity redirects. The pairs are
# read from the generated _redirects, so this checks what the site actually
# ships rather than a second hand-kept list.
IDENTITY_RULE = re.compile(r"^(/id/[0-9a-f-]{36})\s+(\S+)\s+303$")
# An identity that no material carries must not resolve anywhere.
UNKNOWN_IDENTITY = "/id/00000000-0000-7000-8000-000000000000"

# Nothing here may resurrect: the site ships no legacy redirects.
MUST_BE_404 = [
    "/nonexistent-page",
    "/ru/library/philosophy-of-freedom",
    "/en",
    "/library/philosophy-of-freedom.amp",
    "/posts/philosophy-of-freedom",
    "/creativity/skver",
    "/tags",
    "/tags/example-topic",
    "/library/humility-and-open-mindedness",
    "/library/types/poetry-collection",
    "/id/01a00aea-44dc-74e0-8834-895ef7a6c708",
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(url: str) -> tuple[int, dict[str, str]]:
    """One request, no redirect following: the hop itself is what we check."""
    bust = f"cb={random.randint(1, 10**9)}"
    url = f"{url}{'&' if '?' in url else '?'}{bust}"
    quoted = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%")
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(
            urllib.request.Request(quoted, headers=UA, method="HEAD"), timeout=20
        ) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}


def body(url: str) -> str:
    quoted = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%")
    with urllib.request.urlopen(
        urllib.request.Request(quoted, headers=UA), timeout=20
    ) as response:
        return response.read().decode("utf-8", "replace")


def check(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="deployed origin to probe")
    # Accepted and ignored: the review gate runs every scripts/check-*.py with a
    # build directory, and this one has nothing to say about a directory — the
    # contract it checks exists only on a running host. The flag has to stay
    # visible in --help, which is where the gate looks for it.
    parser.add_argument("--public-dir", help="accepted for the review gate and ignored")
    args = parser.parse_args()

    if not args.base_url:
        print("HTTP matrix: пропущено — нужен работающий origin (--base-url)")
        return 0

    base = args.base_url.rstrip("/")
    errors: list[str] = []

    for route in HTML_ROUTES:
        status, headers = request(base + route)
        check(errors, status == 200, f"{route}: expected 200, got {status}")
        check(
            errors,
            headers.get("content-type", "").startswith("text/html"),
            f"{route}: expected text/html, got {headers.get('content-type')!r}",
        )

        if route == "/":
            continue

        slashed = route + "/"
        status, headers = request(base + slashed)
        # Permanent, not temporary: `html_handling` alone answers 307, which
        # tells a client the old form may come back. `_redirects` states the
        # move is permanent, and losing that rule would silently downgrade it.
        check(
            errors,
            status in (301, 308),
            f"{slashed}: expected a permanent redirect, got {status}",
        )
        location = headers.get("location", "")
        target = urllib.parse.urlsplit(location).path or location
        check(
            errors,
            target.rstrip("?") == route or target.startswith(route + "?"),
            f"{slashed}: redirects to {location!r}, expected {route}",
        )
        if location:
            hop_status, _ = request(urllib.parse.urljoin(base + slashed, location))
            check(
                errors,
                hop_status == 200,
                f"{slashed}: redirect target answers {hop_status}, not 200 — a chain",
            )

        # What the page calls itself must be what the host serves.
        page = body(base + route)
        match = re.search(r"rel=[\"']?canonical[\"']?\s+href=[\"']?([^\"'> ]+)", page)
        if match is None:
            errors.append(f"{route}: no canonical link found")
            continue
        canonical = match.group(1)
        check(
            errors,
            canonical.startswith(CANONICAL_HOST),
            f"{route}: canonical points elsewhere: {canonical}",
        )
        canonical_path = canonical[len(CANONICAL_HOST) :] or "/"
        status, _ = request(base + canonical_path)
        check(
            errors,
            status == 200,
            f"{route}: its own canonical {canonical_path} answers {status}, not 200",
        )

    for path, expected in MEDIA_TYPES.items():
        status, headers = request(base + path)
        check(errors, status == 200, f"{path}: expected 200, got {status}")
        actual = headers.get("content-type", "")
        check(
            errors,
            actual.startswith(expected),
            f"{path}: expected {expected}, got {actual!r}",
        )

    identity_rules = []
    redirects = Path(args.public_dir or "public") / "_redirects"
    if redirects.exists():
        for line in redirects.read_text(encoding="utf-8").splitlines():
            if match := IDENTITY_RULE.match(line.strip()):
                identity_rules.append((match.group(1), match.group(2)))
    check(errors, bool(identity_rules), "_redirects carries no /id/ rules")

    for identity, target in identity_rules:
        status, headers = request(base + identity)
        check(errors, status == 303, f"{identity}: expected 303, got {status}")
        # The cache-bust query rides along into Location; the address is the
        # part being checked.
        location = headers.get("location", "").split("?", 1)[0].rstrip("/")
        check(
            errors,
            location in (target, f"{CANONICAL_HOST}{target}"),
            f"{identity}: Location {location!r} is not {target!r}",
        )

    status, _ = request(base + UNKNOWN_IDENTITY)
    check(
        errors,
        status == 404,
        f"{UNKNOWN_IDENTITY}: an identity nothing carries must 404, got {status}",
    )

    for path in MUST_BE_404:
        status, headers = request(base + path)
        check(errors, status == 404, f"{path}: expected 404, got {status}")
        check(
            errors,
            headers.get("content-type", "").startswith("text/html"),
            f"{path}: 404 should still be an HTML page, got {headers.get('content-type')!r}",
        )

    if errors:
        print("HTTP matrix check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: {len(HTML_ROUTES)} HTML routes canonical without a trailing slash, "
        f"{len(MEDIA_TYPES)} media types, {len(identity_rules)} identity URIs "
        f"resolving 303, {len(MUST_BE_404)} absent URLs answering 404"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
