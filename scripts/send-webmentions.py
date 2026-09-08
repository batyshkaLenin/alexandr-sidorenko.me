#!/usr/bin/env python3
"""Send outgoing Webmentions for links this site publishes.

Runs after a successful deploy, never as part of it: notifying other sites is
not a condition of publishing, and a receiver that is down must not be able to
touch a deploy that already succeeded. Reads the built site, finds external
links, discovers each target's endpoint and posts source/target pairs.

`data/webmentions-sent.json` is the journal that makes reruns cheap — a pair
already delivered is skipped. It lives in `data/` because that is the one
committed place for the site's own data; Hugo reads it and no template uses it.

Outbound send after deploy.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

BASE_URL = "https://alexandr-sidorenko.me"
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
LINK_HEADER = re.compile(r'<([^>]+)>\s*;\s*rel\s*=\s*"?([^",]+)"?', re.I)
TIMEOUT = 20
RETRIES = 3
RETRY_PAUSE = 5
USER_AGENT = "alexandr-sidorenko.me webmention sender"


class LinkCollector(HTMLParser):
    """Absolute external hrefs of one published page.

    `rel=nofollow` links are skipped, which is what excludes the sources of
    incoming mentions: the site renders them with `nofollow ugc` because it
    does not vouch for them, and notifying someone that you linked to them —
    when the "link" is their own mention of you — is noise.
    """

    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag != "a":
            return
        if "nofollow" in (attributes.get("rel") or "").lower().split():
            return
        href = attributes.get("href") or ""
        if href.startswith("http://") or href.startswith("https://"):
            if not href.startswith(BASE_URL):
                self.hrefs.append(href)


class EndpointFinder(HTMLParser):
    """First rel=webmention in the document, link or anchor, per the spec order."""

    def __init__(self) -> None:
        super().__init__()
        self.endpoint: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.endpoint is not None or tag not in ("link", "a"):
            return
        attributes = dict(attrs)
        rel = (attributes.get("rel") or "").lower().split()
        if "webmention" in rel and attributes.get("href") is not None:
            self.endpoint = attributes["href"]


def published_pages(public_dir: Path) -> list[tuple[str, Path]]:
    sitemap = public_dir / "sitemap.xml"
    if not sitemap.exists():
        return []
    root = ElementTree.fromstring(sitemap.read_text())
    pages: list[tuple[str, Path]] = []
    for node in root.findall(".//sm:loc", SITEMAP_NS):
        url = (node.text or "").strip()
        if not url.startswith(BASE_URL):
            continue
        path = public_dir / url[len(BASE_URL) :].lstrip("/") / "index.html"
        if path.exists():
            pages.append((url, path))
    return pages


def discover_endpoint(target: str) -> str | None:
    request = urllib.request.Request(target, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            for value in response.headers.get_all("Link") or []:
                for href, rel in LINK_HEADER.findall(value):
                    if "webmention" in rel.lower().split():
                        return urllib.parse.urljoin(response.url, href)
            content_type = response.headers.get("Content-Type", "")
            if "html" not in content_type:
                return None
            body = response.read(512_000).decode("utf-8", errors="replace")
            final_url = response.url
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None

    finder = EndpointFinder()
    finder.feed(body)
    if finder.endpoint is None:
        return None
    return urllib.parse.urljoin(final_url, finder.endpoint)


def send(endpoint: str, source: str, target: str) -> tuple[bool, str]:
    payload = urllib.parse.urlencode({"source": source, "target": target}).encode()
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
    )
    last = ""
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return True, f"{response.status}"
        except urllib.error.HTTPError as error:
            last = f"HTTP {error.code}"
            if error.code < 500:
                # 4xx is the receiver's verdict, not a hiccup: retrying repeats it.
                return False, last
        except (urllib.error.URLError, TimeoutError) as error:
            last = str(error)
        if attempt < RETRIES:
            time.sleep(RETRY_PAUSE)
    return False, last


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument("--dry-run", action="store_true", help="discover endpoints, send nothing")
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    journal_path = root / "data" / "webmentions-sent.json"

    pages = published_pages(public_dir)
    if not pages:
        print(f"{public_dir}: no built site to read — build first", file=sys.stderr)
        return 1

    journal = json.loads(journal_path.read_text()) if journal_path.exists() else {"sent": []}
    delivered = {(entry["source"], entry["target"]) for entry in journal["sent"]}

    pending: list[tuple[str, str]] = []
    for source, path in pages:
        collector = LinkCollector()
        collector.feed(path.read_text())
        for target in dict.fromkeys(collector.hrefs):
            if (source, target) not in delivered:
                pending.append((source, target))

    if not pending:
        print("Все ссылки уже отправлены.")
        return 0

    failures = 0
    for source, target in pending:
        endpoint = discover_endpoint(target)
        if endpoint is None:
            print(f"— {target}: endpoint не объявлен, пропуск")
            continue
        if args.dry_run:
            print(f"= {target}: {endpoint} (dry-run)")
            continue
        ok, detail = send(endpoint, source, target)
        print(f"{'✓' if ok else '✗'} {target}: {detail}")
        if ok:
            journal["sent"].append(
                {
                    "source": source,
                    "target": target,
                    "endpoint": endpoint,
                    "sent": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
        else:
            failures += 1

    if not args.dry_run:
        journal_path.write_text(json.dumps(journal, ensure_ascii=False, indent=2) + "\n")

    # A failed notification is not a failed publication: the exit code reports
    # it, and nothing here can undo a deploy.
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
