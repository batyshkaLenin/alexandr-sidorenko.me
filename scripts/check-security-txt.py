#!/usr/bin/env python3
"""Verify the RFC 9116 security.txt document and its expiry policy."""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path

SECURITY_TXT_PATH = "/.well-known/security.txt"
EXPECTED_FIELDS = [
    ("Contact", "mailto:security@alexandr-sidorenko.me"),
    ("Encryption", "https://alexandr-sidorenko.me/key.pub"),
    ("Preferred-Languages", "ru, en"),
    ("Canonical", "https://alexandr-sidorenko.me/.well-known/security.txt"),
]
FAIL_WINDOW = timedelta(days=30)
WARNING_WINDOW = timedelta(days=60)
MAX_LIFETIME = timedelta(days=365)
UA = {"User-Agent": "alexandr-sidorenko.me security.txt contract check"}
RFC3339 = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


def parse_rfc3339(value: str) -> datetime | None:
    """Parse an RFC 3339 timestamp and normalize it to UTC."""
    if RFC3339.fullmatch(value) is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(UTC)


def validate_document(
    text: str, now: datetime
) -> tuple[list[str], list[str], datetime | None]:
    errors: list[str] = []
    warnings: list[str] = []

    if text.startswith("\ufeff"):
        errors.append("UTF-8 BOM is not allowed")
    if "\r" in text:
        errors.append("use LF line endings")
    if not text.endswith("\n"):
        errors.append("file must end with a newline")
    if "-----BEGIN PGP" in text:
        errors.append("document must remain unsigned")

    fields: list[tuple[str, str]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        name, separator, value = line.partition(":")
        if not separator or not name or not value.startswith(" "):
            errors.append(f"line {number}: expected 'Field: value'")
            continue
        fields.append((name, value.lstrip()))

    expected_names = [name for name, _ in EXPECTED_FIELDS] + ["Expires"]
    actual_names = [name for name, _ in fields]
    if actual_names != expected_names:
        errors.append(f"fields/order are {actual_names!r}, expected {expected_names!r}")

    values: dict[str, list[str]] = {}
    for name, value in fields:
        values.setdefault(name, []).append(value)

    for name, expected in EXPECTED_FIELDS:
        actual = values.get(name, [])
        if actual != [expected]:
            errors.append(f"{name} is {actual!r}, expected [{expected!r}]")

    for name in ("Contact", "Encryption", "Canonical"):
        for value in values.get(name, []):
            parsed = urllib.parse.urlsplit(value)
            if not parsed.scheme:
                errors.append(f"{name} is not an absolute URI: {value!r}")

    expires_values = values.get("Expires", [])
    expires: datetime | None = None
    if len(expires_values) != 1:
        errors.append(f"expected exactly one Expires, found {len(expires_values)}")
    else:
        expires = parse_rfc3339(expires_values[0])
        if expires is None:
            errors.append(f"Expires is not an RFC 3339 datetime: {expires_values[0]!r}")
        else:
            remaining = expires - now.astimezone(UTC)
            if remaining <= timedelta(0):
                errors.append("Expires is in the past")
            elif remaining <= FAIL_WINDOW:
                errors.append(
                    f"Expires is only {remaining.days} day(s) away; more than 30 required"
                )
            elif remaining <= WARNING_WINDOW:
                warnings.append(
                    f"Expires is {remaining.days} day(s) away; renew the manually reviewed date"
                )
            elif remaining >= MAX_LIFETIME:
                errors.append("Expires must be less than one year in the future")

    return errors, warnings, expires


def fixture(expires: datetime) -> str:
    lines = [f"{name}: {value}" for name, value in EXPECTED_FIELDS]
    lines.append(
        f"Expires: {expires.astimezone(UTC).isoformat().replace('+00:00', 'Z')}"
    )
    return "\n".join(lines) + "\n"


def self_test() -> int:
    """Exercise the expiry boundaries independently from the committed date."""
    now = datetime(2026, 9, 11, tzinfo=UTC)
    cases = [
        ("expired", now - timedelta(seconds=1), False, False),
        ("30 days", now + FAIL_WINDOW, False, False),
        ("45 days", now + timedelta(days=45), True, True),
    ]
    for name, expires, should_pass, should_warn in cases:
        errors, warnings, _ = validate_document(fixture(expires), now)
        if bool(errors) == should_pass:
            raise AssertionError(f"self-test: {name} pass/fail boundary is wrong")
        if bool(warnings) != should_warn:
            raise AssertionError(f"self-test: {name} warning boundary is wrong")
    return len(cases)


def fetch(url: str) -> tuple[int, str, bytes, str]:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=20) as response:
        return (
            response.status,
            response.geturl(),
            response.read(),
            response.headers.get("Content-Type", ""),
        )


def live_response_errors(
    requested_url: str,
    status: int,
    final_url: str,
    body: bytes,
    content_type: str,
    expected_bytes: bytes,
) -> list[str]:
    errors: list[str] = []
    if status != 200:
        errors.append(f"{requested_url}: expected 200, got {status}")
    if final_url != requested_url:
        errors.append(
            f"{requested_url}: redirected to {final_url!r}; canonical path must serve directly"
        )
    if body != expected_bytes:
        errors.append(
            f"{requested_url}: response bytes differ from the built security.txt"
        )
    if content_type != "text/plain; charset=utf-8":
        errors.append(
            f"{requested_url}: Content-Type is {content_type!r}, "
            "expected 'text/plain; charset=utf-8'"
        )
    return errors


def response_self_test() -> int:
    """Keep both direct and automatically followed redirects from passing."""
    url = "https://example.test/.well-known/security.txt"
    body = b"security.txt fixture\n"
    cases = [
        ("direct redirect", 302, url),
        ("followed redirect", 200, "https://other.example/security.txt"),
    ]
    for name, status, final_url in cases:
        errors = live_response_errors(
            url, status, final_url, body, "text/plain; charset=utf-8", body
        )
        if not errors:
            raise AssertionError(f"self-test: {name} was accepted")
    return len(cases)


def check_live(errors: list[str], base_url: str, expected_bytes: bytes) -> None:
    url = base_url.rstrip("/") + SECURITY_TXT_PATH
    try:
        status, final_url, body, content_type = fetch(url)
    except (urllib.error.URLError, TimeoutError) as error:
        errors.append(f"{url}: request failed ({error})")
        return
    errors.extend(
        live_response_errors(url, status, final_url, body, content_type, expected_bytes)
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument("--base-url", help="also verify a running origin")
    parser.add_argument(
        "--now",
        help="RFC 3339 clock override for controlled verification fixtures",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    path = public_dir / SECURITY_TXT_PATH.lstrip("/")
    errors: list[str] = []
    negative_cases = self_test()
    redirect_cases = response_self_test()

    if args.now:
        now = parse_rfc3339(args.now)
        if now is None:
            print(f"invalid --now RFC 3339 datetime: {args.now!r}", file=sys.stderr)
            return 2
    else:
        now = datetime.now(UTC)

    try:
        raw = path.read_bytes()
    except OSError as error:
        print(
            f"security.txt contract check failed:\n- {path}: {error}", file=sys.stderr
        )
        return 1
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        print(
            f"security.txt contract check failed:\n- {path}: invalid UTF-8 ({error})",
            file=sys.stderr,
        )
        return 1

    document_errors, warnings, expires = validate_document(text, now)
    errors.extend(f"{path}: {error}" for error in document_errors)

    if not (public_dir / "key.pub").is_file():
        errors.append(f"{public_dir / 'key.pub'}: Encryption target is missing")

    if args.base_url and not errors:
        check_live(errors, args.base_url, raw)

    if errors:
        print("security.txt contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    live = f", response matches {args.base_url}" if args.base_url else ""
    warning_summary = f"; WARNING: {warnings[0]}" if warnings else ""
    print(
        f"OK: unsigned RFC 9116 fields, Expires {expires.isoformat() if expires else '?'}"
        f", {negative_cases} expiry fixtures and {redirect_cases} redirect cases verified"
        f"{live}{warning_summary}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
