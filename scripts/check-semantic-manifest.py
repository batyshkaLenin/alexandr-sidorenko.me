#!/usr/bin/env python3
"""Align feed-contract and schema-contract with the semantic manifest.

Does not re-check public/ — that stays in check-url / check-feed / check-schema /
check-uid. This script only prevents the representative URL lists from drifting
apart across fixtures.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def fail(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("tests/fixtures/semantic-manifest.json"),
    )
    parser.add_argument(
        "--public-dir",
        default="public",
        help="принято review-гейтом и игнорируется: проверка только fixtures",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    manifest_path = args.manifest if args.manifest.is_absolute() else root / args.manifest
    errors: list[str] = []

    fail(errors, manifest_path.is_file(), f"missing manifest {manifest_path}")
    if errors:
        print("Semantic manifest check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text())
    fail(errors, manifest.get("schema") == "semantic-manifest/v1", "unexpected schema id")

    publications = manifest.get("publications") or []
    fail(errors, len(publications) >= 3, "manifest needs a representative publication set")

    by_id = {item["id"]: item for item in publications}
    fail(errors, len(by_id) == len(publications), "duplicate publication id in manifest")

    surfaces = manifest.get("surfaces") or {}
    for key in ("html", "rss", "json_feed", "sitemap", "robots", "llms", "webmanifest"):
        fail(errors, key in surfaces, f"surfaces.{key} missing")

    aligned = manifest.get("aligned_fixtures") or {}
    feed_rel = aligned.get("feed")
    schema_rel = aligned.get("schema")
    fail(errors, bool(feed_rel), "aligned_fixtures.feed missing")
    fail(errors, bool(schema_rel), "aligned_fixtures.schema missing")
    if not feed_rel or not schema_rel:
        print("Semantic manifest check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    feed = json.loads((root / feed_rel).read_text())
    schema = json.loads((root / schema_rel).read_text())

    feed_ids = {item["id"] for item in feed.get("items") or []}
    feed_paths = {item["url_path"] for item in feed.get("items") or []}
    feed_html = {item["html"] for item in feed.get("items") or []}

    for item in publications:
        pid = item["id"]
        fail(errors, pid in feed_ids, f"feed-contract missing publication {pid!r}")
        fail(
            errors,
            item["url_path"] in feed_paths,
            f"feed-contract missing url_path {item['url_path']!r}",
        )
        fail(
            errors,
            item["html"] in feed_html,
            f"feed-contract missing html {item['html']!r}",
        )

    fail(
        errors,
        feed_ids == set(by_id),
        f"feed-contract ids {sorted(feed_ids)} != manifest {sorted(by_id)}",
    )

    origin = manifest.get("origin") or "https://alexandr-sidorenko.me"
    library_page = next(
        (page for page in schema.get("pages") or [] if page.get("html") == "library/index.html"),
        None,
    )
    fail(errors, library_page is not None, "schema-contract missing library/index.html")
    if library_page is not None:
        list_urls = set((library_page.get("list") or {}).get("urls") or [])
        expected_urls = {f"{origin}{item['url_path']}" for item in publications}
        fail(
            errors,
            list_urls == expected_urls,
            "schema library hasPart urls != manifest publications",
        )

    for item in publications:
        html = item["html"]
        page = next((p for p in schema.get("pages") or [] if p.get("html") == html), None)
        fail(errors, page is not None, f"schema-contract missing page {html!r}")
        if page is not None:
            fail(
                errors,
                page.get("url") == f"{origin}{item['url_path']}",
                f"schema {html}: url drift vs manifest",
            )

    for entry in manifest.get("negative_discoverability") or []:
        path = entry.get("path")
        html = entry.get("html")
        expect = entry.get("expect") or {}
        fail(errors, bool(path) and bool(html), "negative_discoverability entry incomplete")
        fail(errors, expect.get("noindex") is True, f"{path}: expect.noindex must be true")
        fail(errors, expect.get("in_sitemap") is False, f"{path}: expect.in_sitemap must be false")
        fail(errors, expect.get("in_llms") is False, f"{path}: expect.in_llms must be false")
        page = next((p for p in schema.get("pages") or [] if p.get("html") == html), None)
        fail(errors, page is not None, f"schema-contract missing negative page {html!r}")
        if page is not None:
            # Utility views stay in schema for BreadcrumbList shape, but must
            # not claim a public collection URL in the same way publications do.
            fail(
                errors,
                page.get("url") in (None, f"{origin}{path}"),
                f"schema {html}: unexpected url for negative page",
            )

    if errors:
        print("Semantic manifest check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: semantic manifest — {len(publications)} publication(s), "
        f"{len(manifest.get('negative_discoverability') or [])} negative discoverability case(s); "
        f"feed + schema fixtures aligned"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
