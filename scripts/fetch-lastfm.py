#!/usr/bin/env python3
"""Fetch the last scrobbled track into the site's data snapshot (T96).

Runs during the build (and by hand), never in a visitor's browser: the API key
comes from the environment and stays on the machine that builds. What ends up in
`data/lastfm.json` is the small set of fields the page shows — artist, title,
link and *when the track was played* — plus the moment this ran.

Time of play, not time of fetch: the owner's scrobbles arrive in batches when a
phone syncs by hand, so "playing now" cannot be told truthfully from this data
and is never claimed (ADR redesign-lastfm-last-played).

Last.fm being unreachable is not a build failure. The previous snapshot stays as
it is and the build carries on with it — the same contract the Webmention import
follows.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://ws.audioscrobbler.com/2.0/"
CONTRACT = 1
TIMEOUT = 20


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(user: str, key: str) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "method": "user.getrecenttracks",
            "user": user,
            "api_key": key,
            "format": "json",
            # Two, not one: the first entry may be a "now playing" record, which
            # carries no play time and is not what this publishes.
            "limit": 2,
        }
    )
    request = urllib.request.Request(
        f"{API}?{query}", headers={"User-Agent": "alexandr-sidorenko.me last-played import"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        payload = json.load(response)
    tracks = payload.get("recenttracks", {}).get("track")
    return tracks if isinstance(tracks, list) else []


def last_played(tracks: list[dict]) -> dict | None:
    for track in tracks:
        attributes = track.get("@attr") or {}
        if attributes.get("nowplaying") == "true":
            continue
        date = track.get("date") or {}
        played = date.get("uts")
        if not played:
            continue
        artist = (track.get("artist") or {}).get("#text") or ""
        name = track.get("name") or ""
        if not artist or not name:
            continue
        return {
            "artist": artist,
            "name": name,
            "url": track.get("url") or "",
            "played_at": datetime.fromtimestamp(int(played), timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
        }
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--user", default="batyshkaLenin", help="Last.fm account to read")
    args = parser.parse_args()

    root = args.root.resolve()
    snapshot_path = root / "data" / "lastfm.json"

    key = os.environ.get("LASTFM_API_KEY", "").strip()
    if not key:
        print("LASTFM_API_KEY не задан — снимок оставлен без изменений", file=sys.stderr)
        return 0

    try:
        tracks = fetch(args.user, key)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"Last.fm недоступен ({error}) — снимок оставлен без изменений", file=sys.stderr)
        return 0

    track = last_played(tracks)
    if track is None:
        print("В ответе нет прослушанного трека — снимок оставлен без изменений", file=sys.stderr)
        return 0

    snapshot_path.write_text(
        json.dumps(
            {"contract": CONTRACT, "fetched_at": utc_now(), "track": track},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(f"{track['artist']} — {track['name']} ({track['played_at']}) → {snapshot_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
