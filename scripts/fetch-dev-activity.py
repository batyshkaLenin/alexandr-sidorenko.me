#!/usr/bin/env python3
"""Fetch the `dev` module's snapshot: weekly hours and the shape of the week (T149).

Runs during the build (and by hand), never in a visitor's browser. Two sources,
two very different roles (ADR redesign-activity-dev-module):

- WakaTime, with an API key, answers "how long did I code this week". Its public
  API cannot: it publishes yearly totals only, and its responses carry no CORS
  header, so a page could not read them even if the CSP allowed it.
- Code::Stats, publicly and without a token, gives XP per day. That XP is never
  published as a number — the page shows seven relative levels, the shape of the
  week and nothing more. The absolute values exist here, to compute those levels,
  and stop here.

What lands in `data/dev.json` is therefore a deliberate allowlist: total seconds
for the week, seven levels 0–7, and the moment this ran. No projects, no
editors, no operating systems, no AI-vs-manual split, no machines, no filenames.

Neither service being reachable is a build failure: the previous snapshot stays
and the build carries on, exactly like the Last.fm and Webmention imports. A
build with no keys at all works too — it publishes the committed snapshot.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

WAKATIME_API = "https://wakatime.com/api/v1/users/current/summaries"
CODESTATS_API = "https://codestats.net/api/users/"
CONTRACT = 1
TIMEOUT = 20
DAYS = 7
# Bars are drawn from these levels; 0 means "nothing that day", not "no data".
MAX_LEVEL = 7
USER_AGENT = "alexandr-sidorenko.me dev activity import"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(url: str, headers: dict[str, str]) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.load(response)


def weekly_seconds(key: str) -> int | None:
    """Total coding seconds over the last seven days, from daily summaries."""
    url = f"{WAKATIME_API}?{urllib.parse.urlencode({'range': 'last_7_days'})}"
    auth = base64.b64encode(key.encode()).decode()
    payload = read_json(url, {"Authorization": f"Basic {auth}"})
    days = payload.get("data")
    if not isinstance(days, list) or not days:
        return None
    total = 0.0
    for day in days:
        total += float((day.get("grand_total") or {}).get("total_seconds") or 0)
    return int(total)


def daily_levels(user: str) -> list[int] | None:
    """Seven relative levels for the last seven days, newest last.

    The XP behind them is not returned: the module shows intensity, not counts,
    and a level says only how the day compares with the busiest day of the week.
    """
    payload = read_json(f"{CODESTATS_API}{urllib.parse.quote(user)}", {})
    dates = payload.get("dates")
    if not isinstance(dates, dict):
        return None

    today = datetime.now(timezone.utc).date()
    window = [today - timedelta(days=offset) for offset in range(DAYS - 1, -1, -1)]
    counts = [float(dates.get(day.isoformat()) or 0) for day in window]

    peak = max(counts)
    if peak <= 0:
        # A week with no activity is a real answer: seven empty bars, not "no data".
        return [0] * DAYS
    return [round(value / peak * MAX_LEVEL) for value in counts]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--codestats-user", default="batyshkaLenin")
    args = parser.parse_args()

    snapshot_path = args.root.resolve() / "data" / "dev.json"
    previous = {}
    if snapshot_path.is_file():
        try:
            previous = json.loads(snapshot_path.read_text())
        except json.JSONDecodeError:
            previous = {}

    seconds = previous.get("weekly_seconds")
    levels = previous.get("levels")

    key = os.environ.get("WAKATIME_API_KEY", "").strip()
    if key:
        try:
            fetched = weekly_seconds(key)
            if fetched is None:
                print("WakaTime вернул пустые сводки — прежние часы сохранены", file=sys.stderr)
            else:
                seconds = fetched
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
            print(f"WakaTime недоступен ({error}) — прежние часы сохранены", file=sys.stderr)
    else:
        print("WAKATIME_API_KEY не задан — часы оставлены без изменений", file=sys.stderr)

    try:
        fetched_levels = daily_levels(args.codestats_user)
        if fetched_levels is None:
            print("Code::Stats не отдал даты — прежняя форма недели сохранена", file=sys.stderr)
        else:
            levels = fetched_levels
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
        print(f"Code::Stats недоступен ({error}) — прежняя форма недели сохранена", file=sys.stderr)

    if seconds is None and levels is None:
        print("Данных нет ни в одном источнике — снимок не создан", file=sys.stderr)
        return 0

    snapshot = {"contract": CONTRACT, "fetched_at": utc_now()}
    if seconds is not None:
        snapshot["weekly_seconds"] = seconds
    if levels is not None:
        snapshot["levels"] = levels

    snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    hours = f"{seconds / 3600:.1f} ч" if seconds is not None else "часы неизвестны"
    print(f"{hours}, форма недели {levels} → {snapshot_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
