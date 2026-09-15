#!/usr/bin/env python3
"""Verify YouTube facades and their link-first feed representation."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


MEDIA = {
    "itchatter-hakatony": (
        "https://youtu.be/sXq_ZKYl554",
        "https://www.youtube-nocookie.com/embed/sXq_ZKYl554",
        "WATCH · YOUTUBE",
    ),
    "itchatter-parni-hakatonschiki": (
        "https://youtu.be/gOdKYeu5glE",
        "https://www.youtube-nocookie.com/embed/gOdKYeu5glE",
        "WATCH · YOUTUBE",
    ),
    "cool-kids-of-death-a-moze-tak": (
        "https://www.youtube.com/watch?v=gbaU0tY9nJ4",
        "https://www.youtube-nocookie.com/embed/gbaU0tY9nJ4",
        "LISTEN · YOUTUBE",
    ),
    "cool-kids-of-death-hej-chlopcze": (
        "https://www.youtube.com/watch?v=1Thy1DUPh44",
        "https://www.youtube-nocookie.com/embed/1Thy1DUPh44",
        "LISTEN · YOUTUBE",
    ),
    "kruh-dinosaur": (
        "https://www.youtube.com/watch?v=0W-H1hW-uno",
        "https://www.youtube-nocookie.com/embed/0W-H1hW-uno",
        "LISTEN · YOUTUBE",
    ),
    "breath-of-the-wild-ost": (
        "https://www.youtube.com/watch?v=VmpU9u3gJhU&list=OLAK5uy_lkNuFwh5JgrilwTUqIvyXqzBdxJ2Fd2zE",
        "https://www.youtube-nocookie.com/embed/VmpU9u3gJhU",
        "LISTEN · YOUTUBE",
    ),
}

TALKS = ("itchatter-hakatony", "itchatter-parni-hakatonschiki")
NOTES = (
    "cool-kids-of-death-a-moze-tak",
    "cool-kids-of-death-hej-chlopcze",
    "kruh-dinosaur",
    "breath-of-the-wild-ost",
)


class TalkHTML(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.media: list[dict[str, str]] = []
        self.iframes = 0
        self.load_buttons = 0
        self.links: list[str] = []
        self.prose_links: list[str] = []
        self.prose_div_depth = 0
        self.scripts: list[str] = []
        self.provider_resource_urls: list[str] = []
        self.text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name: value or "" for name, value in attrs}
        classes = values.get("class", "").split()
        if tag == "div":
            if self.prose_div_depth:
                self.prose_div_depth += 1
            elif "dc-prose" in classes:
                self.prose_div_depth = 1
        if tag == "as-external-media":
            self.media.append(values)
        if tag == "iframe":
            self.iframes += 1
        if tag == "button" and "as-external-media__load" in classes:
            self.load_buttons += 1
        if tag == "a" and values.get("href"):
            self.links.append(values["href"])
            if self.prose_div_depth:
                self.prose_links.append(values["href"])
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"])

        resource_attr = "href" if tag == "link" else "src"
        resource_url = values.get(resource_attr, "")
        if tag in {"iframe", "img", "link", "script", "source", "video", "audio"}:
            if "youtu" in resource_url or "youtube" in resource_url:
                self.provider_resource_urls.append(resource_url)

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self.prose_div_depth:
            self.prose_div_depth -= 1

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.text.append(data.strip())


def check_page(
    errors: list[str],
    public_dir: Path,
    slug: str,
    canonical: str,
    embed: str,
    label: str,
) -> None:
    path = public_dir / "library" / slug / "index.html"
    if not path.is_file():
        errors.append(f"missing talk page: {path}")
        return

    parser = TalkHTML()
    parser.feed(path.read_text(encoding="utf-8"))

    if parser.iframes:
        errors.append(f"/{slug}: initial HTML contains {parser.iframes} iframe(s)")
    if parser.load_buttons:
        errors.append(f"/{slug}: LOAD PLAYER must be added by JavaScript, not initial HTML")
    if parser.provider_resource_urls:
        errors.append(
            f"/{slug}: initial HTML loads provider resources: {parser.provider_resource_urls}"
        )
    if len(parser.media) != 1:
        errors.append(f"/{slug}: expected one as-external-media, got {len(parser.media)}")
    else:
        media = parser.media[0]
        expected = {
            "data-provider": "youtube",
            "data-embed-url": embed,
            "data-layout": "video",
        }
        for attr, value in expected.items():
            if media.get(attr) != value:
                errors.append(
                    f"/{slug}: {attr} differs; expected {value!r}, got {media.get(attr)!r}"
                )
        if not media.get("data-frame-title"):
            errors.append(f"/{slug}: player has no accessible frame title")

    if canonical not in parser.links:
        errors.append(f"/{slug}: canonical source link {canonical} is absent")
    if slug in NOTES and canonical in parser.prose_links:
        errors.append(f"/{slug}: canonical media link is duplicated in prose")
    if not any(re.fullmatch(r"/js/as-external-media\.min\.[a-f0-9]+\.js", src) for src in parser.scripts):
        errors.append(f"/{slug}: fingerprinted as-external-media component is absent")

    text = " ".join(parser.text)
    for expected_label in (label, "OPEN YOUTUBE"):
        if expected_label not in text:
            errors.append(f"/{slug}: missing baseline label {expected_label!r}")


def check_feed_group(errors: list[str], feeds: tuple[Path, ...], slugs: tuple[str, ...]) -> None:
    for path in feeds:
        if not path.is_file():
            errors.append(f"missing feed: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        if "<iframe" in text.lower() or "youtube-nocookie.com" in text:
            errors.append(f"{path}: feed contains an embed instead of link-only content")
        for slug in slugs:
            video_id = MEDIA[slug][1].rsplit("/", 1)[1]
            if video_id not in text:
                errors.append(f"{path}: missing canonical media link for {slug}")


def check_feeds(errors: list[str], public_dir: Path) -> None:
    check_feed_group(
        errors,
        (public_dir / "feed.xml", public_dir / "feed.json"),
        TALKS + NOTES,
    )
    check_feed_group(
        errors,
        (
            public_dir / "library" / "types" / "talk" / "feed.xml",
            public_dir / "library" / "types" / "talk" / "feed.json",
        ),
        TALKS,
    )
    check_feed_group(
        errors,
        (
            public_dir / "library" / "types" / "note" / "feed.xml",
            public_dir / "library" / "types" / "note" / "feed.json",
        ),
        NOTES,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    errors: list[str] = []
    for slug, (canonical, embed, label) in MEDIA.items():
        check_page(errors, args.public_dir, slug, canonical, embed, label)
    check_feeds(errors, args.public_dir)

    if errors:
        print("check-talk-contract: FAIL", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("check-talk-contract: OK (6 link-first media pages, feeds contain no embed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
