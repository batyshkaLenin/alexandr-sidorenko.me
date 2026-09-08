#!/usr/bin/env python3
"""Run Lighthouse over the site's representative pages and summarize the result.

Unlike the `check-*.py` contract checks, this one needs the network and a
Chrome binary, takes minutes rather than seconds, and is therefore not part of
the review gate. Run it deliberately.

Three things it fixes compared with clicking "Analyze" in DevTools, each of
which silently invalidated the 8 August 2026 baseline (see
the preview baseline notes):

- mode is always `navigation` — `snapshot` collects no load metrics at all and
  reports a meaningless `performance: 0`;
- the mobile form factor comes with real screen emulation and CPU throttling,
  not just a changed label;
- Chrome runs in a throwaway profile with extensions off, so injected content
  scripts stop showing up as the page's own blocking time.

Runs are sequential on purpose: parallel Lighthouse processes compete for CPU
and skew every timing they produce.

A single run proves nothing about a timing. Three consecutive runs of one page
have produced 2323, 4217 and 4348 ms — a spread wider than any change this site
has ever made to itself, and wider than the distance to the budget. So `--runs`
takes several measurements, reports the median with its spread, and holds the
budget against the median; every raw report is kept next to the aggregate.

Measure the built site with `--public-dir public`, which serves it here rather
than pointing at somebody else's server. `hugo server` is deliberately not the
answer: it renders to disk by default and serves *unminified* HTML, so it
measures an artifact the site never ships, and it overwrites `public/` with its
own baseURL, after which the contract checks fail on canonical addresses.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

# Shared with serve-public.py / the browser suite.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from canonical_static import serve_directory

LIGHTHOUSE_VERSION = "13.4.1"

PREVIEW_ORIGIN = "https://alexandr-sidorenko-me.auroragamesproject.workers.dev"
PRODUCTION_ORIGIN = "https://alexandr-sidorenko.me"

# One page per template that renders differently: home, the library list, an
# article with images, a track with audio. Renderer families (S21) will need
# one entry each once they exist.
DEFAULT_PATHS = (
    "/",
    "/library",
    "/library/bluredu-new-teachers",
    "/library/regular-visitor",
)

CATEGORIES = ("performance", "accessibility", "best-practices", "seo", "agentic-browsing")

FONT_HOSTS = ("https://fonts.googleapis.com/*", "https://fonts.gstatic.com/*")

# Budgets are per form factor because the mobile run is throttled to a slow
# 4x-CPU device and cannot be held to the desktop numbers.
BUDGETS = {
    "desktop": {"lcp_ms": 1500, "tbt_ms": 150, "cls": 0.10},
    "mobile": {"lcp_ms": 2500, "tbt_ms": 200, "cls": 0.10},
}

# Lighthouse category scores stay in the report table as diagnostics. Pass/fail
# is the S15 metric set above (LCP/TBT/CLS), not the composite performance score.
DIAGNOSTIC_SCORE_FLOOR = {
    "desktop": {"performance": 0.95},
    "mobile": {"performance": 0.85},
}

# A preview build serves `Disallow: /` on purpose, so this audit fails by
# design there and says nothing about the site's SEO.
PREVIEW_EXPECTED_FAILURES = frozenset({"is-crawlable"})


@contextmanager
def serve(directory: Path):
    """Serve `directory` on a free port for as long as the block runs."""
    try:
        with serve_directory(directory) as origin:
            yield origin
    except FileNotFoundError as exc:
        sys.exit(str(exc))


@contextmanager
def contextlib_serve(directory: Path | None):
    """`serve(directory)` when there is one, otherwise a no-op yielding None."""
    if directory is None:
        yield None
        return
    with serve(directory) as origin:
        yield origin


@dataclass(frozen=True)
class Run:
    path: str
    form_factor: str
    fonts_blocked: bool

    @property
    def slug(self) -> str:
        page = self.path.strip("/").replace("/", "-") or "home"
        parts = [page, self.form_factor]
        if self.fonts_blocked:
            parts.append("nofonts")
        return "-".join(parts)


def lighthouse_command(base: list[str] | None) -> list[str]:
    if base:
        return base
    if shutil.which("lighthouse"):
        return ["lighthouse"]
    if shutil.which("npx"):
        return ["npx", "--yes", f"lighthouse@{LIGHTHOUSE_VERSION}"]
    sys.exit(
        "no lighthouse binary and no npx to fetch one; install it with\n"
        f"  npm install -g lighthouse@{LIGHTHOUSE_VERSION}\n"
        "or pass --lighthouse-cmd"
    )


def build_args(run: Run, url: str, out_path: Path, profile_dir: Path, headless: bool) -> list[str]:
    chrome_flags = [
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--no-first-run",
        "--no-default-browser-check",
        f"--user-data-dir={profile_dir}",
    ]
    if headless:
        chrome_flags.append("--headless=new")

    # The CLI only ever performs a navigation run — `timespan` and `snapshot`
    # exist in DevTools and the Node API, not here — so the mode needs no flag
    # and cannot be inherited from a previous DevTools session.
    args = [
        url,
        "--output=json",
        f"--output-path={out_path}",
        "--only-categories=" + ",".join(CATEGORIES),
        "--quiet",
        "--chrome-flags=" + " ".join(chrome_flags),
    ]

    if run.form_factor == "desktop":
        args.append("--preset=desktop")
    else:
        args += [
            "--form-factor=mobile",
            "--screenEmulation.mobile=true",
            "--screenEmulation.disabled=false",
            "--screenEmulation.width=412",
            "--screenEmulation.height=823",
            "--screenEmulation.deviceScaleFactor=1.75",
            "--throttling.cpuSlowdownMultiplier=4",
        ]

    if run.fonts_blocked:
        for pattern in FONT_HOSTS:
            args.append(f"--blocked-url-patterns={pattern}")

    return args


def numeric(report: dict, audit_id: str) -> float | None:
    audit = report.get("audits", {}).get(audit_id) or {}
    value = audit.get("numericValue")
    return float(value) if isinstance(value, (int, float)) else None


def category_scores(report: dict) -> dict[str, float | None]:
    return {key: value.get("score") for key, value in report.get("categories", {}).items()}


def aggregate(values: list[float | None]) -> tuple[float | None, float | None]:
    """(median, spread) over the runs that produced a number.

    The median rather than the mean: one run that hit a garbage-collection
    pause should not drag the reported figure, and with an even number of runs
    the two middle values are what the machine actually managed twice.

    Spread is max minus min — the honest width of the measurement, not a
    standard deviation that would imply more runs than anyone does here. A
    single run has no spread, which is exactly the thing it fails to tell you.
    """
    present = [value for value in values if value is not None]
    if not present:
        return None, None
    return statistics.median(present), (max(present) - min(present) if len(present) > 1 else None)


def metric_series(reports: list[dict], audit_id: str) -> list[float | None]:
    return [numeric(report, audit_id) for report in reports]


def score_series(reports: list[dict], key: str) -> list[float | None]:
    return [category_scores(report).get(key) for report in reports]


def failed_audits(report: dict, allowed: frozenset[str]) -> list[str]:
    """Binary audits that failed, minus the ones this environment expects.

    Composite category scores are deliberately not used for pass/fail: a single
    heavyweight audit such as `is-crawlable` drags SEO to 0.69 on preview and
    tells nothing about the other ten.
    """
    scored_ids = {
        ref["id"]
        for key, category in report.get("categories", {}).items()
        if key != "performance"
        for ref in category.get("auditRefs", [])
    }
    failures = []
    for audit_id in sorted(scored_ids):
        audit = report.get("audits", {}).get(audit_id) or {}
        if audit.get("scoreDisplayMode") != "binary":
            continue
        if audit.get("score") == 0 and audit_id not in allowed:
            failures.append(audit_id)
    return failures


def extension_noise(report: dict) -> int:
    items = (report.get("audits", {}).get("network-requests", {}).get("details") or {}).get("items", [])
    return sum(1 for item in items if str(item.get("url", "")).startswith("chrome-extension://"))


def methodology_problems(run: Run, report: dict) -> list[str]:
    """Catch the ways a run can look successful while measuring the wrong thing."""
    problems = []

    mode = report.get("gatherMode")
    if mode != "navigation":
        problems.append(f"gatherMode is {mode!r}, not 'navigation' — load metrics are not comparable")

    settings = report.get("configSettings", {})
    if settings.get("formFactor") != run.form_factor:
        problems.append(f"formFactor is {settings.get('formFactor')!r}, expected {run.form_factor!r}")

    emulation = settings.get("screenEmulation", {})
    if run.form_factor == "mobile" and emulation.get("disabled"):
        problems.append("screen emulation was disabled — the mobile run used a desktop viewport")

    noise = extension_noise(report)
    if noise:
        problems.append(
            f"{noise} chrome-extension:// requests — the profile was not clean, timings are not comparable"
        )

    return problems


BUDGET_METRICS = (
    ("largest-contentful-paint", "lcp_ms", "ms", ".0f"),
    ("total-blocking-time", "tbt_ms", "ms", ".0f"),
    ("cumulative-layout-shift", "cls", "", ".3f"),
)


def check_budget(run: Run, reports: list[dict]) -> list[str]:
    """Budgets are held against the median, never against one run.

    A single unlucky run must not fail the build, and a single lucky one must
    not pass it. Where the spread is wide enough that the answer depends on
    which run you look at, that is said out loud rather than hidden behind a
    verdict.

    The composite performance score is intentionally not a gate (T31 / S15): it
    is reported as a diagnostic beside the metric budgets.
    """
    budget = BUDGETS[run.form_factor]
    violations = []

    for audit_id, key, unit, fmt in BUDGET_METRICS:
        series = metric_series(reports, audit_id)
        value, width = aggregate(series)
        if value is None:
            continue
        limit = budget[key]
        if value > limit:
            violations.append(
                f"{audit_id} median {format(value, fmt)}{unit} > {format(limit, fmt)}{unit}"
            )
        elif width is not None and max(v for v in series if v is not None) > limit:
            violations.append(
                f"{audit_id} median {format(value, fmt)}{unit} is within {format(limit, fmt)}{unit}, but the runs "
                f"spread {format(width, fmt)}{unit} and at least one crossed it — the budget is not "
                f"settled by this measurement"
            )

    return violations


def diagnostic_notes(run: Run, reports: list[dict]) -> list[str]:
    """Informational score floors — never fail the run by themselves."""
    floors = DIAGNOSTIC_SCORE_FLOOR[run.form_factor]
    notes: list[str] = []
    performance, _ = aggregate(score_series(reports, "performance"))
    floor = floors.get("performance")
    if performance is not None and floor is not None and performance < floor:
        notes.append(
            f"performance score {performance:.2f} < diagnostic floor {floor:.2f} "
            f"(informational; S15 gates are LCP/TBT/CLS)"
        )
    return notes


def format_aggregate(value: float | None, fmt: str, width: int) -> str:
    return "—".rjust(width) if value is None else format(value, fmt)


def summarize(
    rows: list[tuple[Run, list[dict]]], allowed: frozenset[str]
) -> tuple[str, list[str], list[str], list[dict]]:
    header = (
        f"{'page':<34} {'form':<8} {'perf':>5} {'a11y':>5} {'bp':>5} {'seo':>5} "
        f"{'LCP':>7} {'±':>6} {'TBT':>6} {'CLS':>6} {'n':>3}"
    )
    lines = [header, "-" * len(header)]
    problems: list[str] = []
    records: list[dict] = []

    for run, reports in rows:
        lcp, lcp_spread = aggregate(metric_series(reports, "largest-contentful-paint"))
        tbt, _ = aggregate(metric_series(reports, "total-blocking-time"))
        cls, _ = aggregate(metric_series(reports, "cumulative-layout-shift"))
        scores = {key: aggregate(score_series(reports, key))[0] for key in
                  ("performance", "accessibility", "best-practices", "seo")}

        lines.append(
            f"{run.slug:<34} {run.form_factor:<8} "
            f"{format_aggregate(scores['performance'], '5.2f', 5)} "
            f"{format_aggregate(scores['accessibility'], '5.2f', 5)} "
            f"{format_aggregate(scores['best-practices'], '5.2f', 5)} "
            f"{format_aggregate(scores['seo'], '5.2f', 5)} "
            f"{format_aggregate(lcp, '7.0f', 7)} "
            f"{format_aggregate(lcp_spread, '6.0f', 6)} "
            f"{format_aggregate(tbt, '6.0f', 6)} "
            f"{format_aggregate(cls, '6.3f', 6)} "
            f"{len(reports):>3}"
        )

        records.append(
            {
                "page": run.path,
                "slug": run.slug,
                "form_factor": run.form_factor,
                "fonts_blocked": run.fonts_blocked,
                "runs": len(reports),
                "scores": {key: {"median": value} for key, value in scores.items()},
                "metrics": {
                    audit_id: {
                        "values": metric_series(reports, audit_id),
                        "median": aggregate(metric_series(reports, audit_id))[0],
                        "spread": aggregate(metric_series(reports, audit_id))[1],
                    }
                    for audit_id, _, _, _ in BUDGET_METRICS
                },
            }
        )

        # Methodology and binary audits are per-run facts: one bad run means one
        # bad measurement, whatever the others did. Deduplicated so a five-run
        # measurement does not print the same sentence five times.
        seen: list[str] = []
        for index, report in enumerate(reports, start=1):
            for problem in methodology_problems(run, report):
                if problem not in seen:
                    seen.append(problem)
                    problems.append(f"{run.slug}: {problem} (run {index})")
            for failure in failed_audits(report, allowed):
                marker = f"failed audit {failure}"
                if marker not in seen:
                    seen.append(marker)
                    problems.append(f"{run.slug}: {marker}")
        for violation in check_budget(run, reports):
            problems.append(f"{run.slug}: {violation}")
        for note in diagnostic_notes(run, reports):
            problems.append(f"{run.slug}: diagnostic: {note}")

    # Diagnostics do not fail the process — split them out for the caller.
    hard = [p for p in problems if ": diagnostic: " not in p]
    soft = [p.replace(": diagnostic: ", ": ", 1) for p in problems if ": diagnostic: " in p]
    return "\n".join(lines), hard, soft, records


def self_test() -> None:
    """A broken detector must not silently report green."""
    report = {
        "categories": {
            "seo": {"auditRefs": [{"id": "is-crawlable"}, {"id": "canonical"}]},
            "performance": {"auditRefs": [{"id": "largest-contentful-paint"}]},
        },
        "audits": {
            "is-crawlable": {"score": 0, "scoreDisplayMode": "binary"},
            "canonical": {"score": 0, "scoreDisplayMode": "binary"},
            "largest-contentful-paint": {"numericValue": 9000, "scoreDisplayMode": "numeric"},
            "network-requests": {"details": {"items": [{"url": "chrome-extension://x/y.js"}]}},
        },
    }
    assert failed_audits(report, frozenset()) == ["canonical", "is-crawlable"], "self-test: failures missed"
    assert failed_audits(report, PREVIEW_EXPECTED_FAILURES) == ["canonical"], "self-test: allowance ignored"
    assert extension_noise(report) == 1, "self-test: extension requests not counted"
    run = Run("/library", "mobile", False)
    assert any("largest-contentful-paint" in v for v in check_budget(run, [report])), "self-test: budget not enforced"
    # Performance score is diagnostic only — a low score alone must not violate.
    low_score = {
        "categories": {"performance": {"score": 0.4}},
        "audits": {
            "largest-contentful-paint": {"numericValue": 1000},
            "total-blocking-time": {"numericValue": 10},
            "cumulative-layout-shift": {"numericValue": 0.01},
        },
    }
    assert check_budget(run, [low_score]) == [], "self-test: performance score gated the run"
    assert any("diagnostic floor" in n for n in diagnostic_notes(run, [low_score])), (
        "self-test: low score not reported as diagnostic"
    )
    assert Run("/", "desktop", True).slug == "home-desktop-nofonts", "self-test: slug"

    # Aggregation: the median must survive an outlier, and the spread must be
    # the real width rather than a comforting average.
    assert aggregate([2323.0, 4217.0, 4348.0]) == (4217.0, 2025.0), "self-test: median/spread"
    assert aggregate([1500.0]) == (1500.0, None), "self-test: one run has no spread"
    assert aggregate([None, 2.0, None]) == (2.0, None), "self-test: missing values not counted"
    assert aggregate([None, None]) == (None, None), "self-test: no values at all"

    def timed(lcp: float) -> dict:
        return {"audits": {"largest-contentful-paint": {"numericValue": lcp}}, "categories": {}}

    # A median inside the budget while a run crossed it is not a pass: that is
    # the exact shape of the noise this runner exists to expose.
    unsettled = check_budget(run, [timed(1000), timed(2400), timed(4000)])
    assert any("not settled" in v for v in unsettled), "self-test: straddling budget reported as clean"
    assert not check_budget(run, [timed(1000), timed(1100), timed(1200)]), "self-test: quiet runs flagged"
    over = check_budget(run, [timed(3000), timed(3100), timed(3200)])
    assert any("median" in v and ">" in v for v in over), "self-test: median over budget missed"

    # The server must answer the site's own URL shape, not the one
    # SimpleHTTPRequestHandler prefers.
    with tempfile.TemporaryDirectory(prefix="lighthouse-serve-") as raw:
        root = Path(raw)
        (root / "index.html").write_text("<!doctype html>root", encoding="utf-8")
        (root / "library" / "skver").mkdir(parents=True)
        (root / "library" / "skver" / "index.html").write_text("<!doctype html>page", encoding="utf-8")
        (root / "feed.xml").write_text("<rss/>", encoding="utf-8")
        with serve(root) as origin:
            host = urlsplit(origin).netloc

            def status(path: str) -> tuple[int, str | None]:
                connection = http.client.HTTPConnection(host, timeout=5)
                try:
                    connection.request("GET", path)
                    response = connection.getresponse()
                    response.read()
                    return response.status, response.getheader("Location")
                finally:
                    connection.close()

            assert status("/")[0] == 200, "self-test: root not served"
            assert status("/library/skver")[0] == 200, "self-test: canonical form not served directly"
            assert status("/library/skver/") == (301, "/library/skver"), "self-test: slash form not redirected"
            assert status("/feed.xml")[0] == 200, "self-test: plain file not served"
            assert status("/nothing-here")[0] == 404, "self-test: missing path not 404"

    # The three ways the 8 August 2026 baseline went wrong must each be caught.
    broken = {
        "gatherMode": "snapshot",
        "configSettings": {"formFactor": "desktop", "screenEmulation": {"disabled": True}},
        "audits": {},
    }
    found = " ".join(methodology_problems(run, broken))
    assert "gatherMode" in found, "self-test: snapshot mode not caught"
    assert "formFactor" in found, "self-test: form factor mismatch not caught"
    assert "emulation" in found, "self-test: disabled emulation not caught"

    clean = {
        "gatherMode": "navigation",
        "configSettings": {"formFactor": "mobile", "screenEmulation": {"disabled": False}},
        "audits": {},
    }
    assert methodology_problems(run, clean) == [], "self-test: clean run flagged"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--base-url",
        default=PREVIEW_ORIGIN,
        help=f"origin to measure (default: preview, {PREVIEW_ORIGIN}); "
        f"use {PRODUCTION_ORIGIN} for production. To measure a local build use "
        f"--public-dir, not `hugo server` — see its help",
    )
    parser.add_argument(
        "--public-dir",
        type=Path,
        help="serve this build directory here and measure it instead of --base-url. "
        "This is how a local measurement is done: `hugo server` renders unminified HTML "
        "and overwrites public/ with its own baseURL, so it measures an artifact the site "
        "never ships",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=1,
        help="repeat every measurement N times and report the median with its spread; "
        "one run cannot tell a real change from noise (default: 1)",
    )
    parser.add_argument("--path", action="append", dest="paths", help="page path to measure; repeatable")
    parser.add_argument(
        "--form-factor",
        choices=("desktop", "mobile", "both"),
        default="both",
    )
    parser.add_argument(
        "--fonts",
        choices=("allowed", "blocked", "both"),
        default="allowed",
        help="`blocked` blackholes fonts.googleapis.com and fonts.gstatic.com, "
        "the font/CSS degradation path required to be measured",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="where reports go (default: tmp/lighthouse/<UTC timestamp>)",
    )
    parser.add_argument(
        "--indexable",
        action="store_true",
        help="require the pages to be indexable; off by default because a preview build serves "
        "Disallow: / on purpose",
    )
    parser.add_argument("--no-headless", action="store_true", help="show the browser window")
    parser.add_argument(
        "--lighthouse-cmd",
        nargs="+",
        help=f"how to invoke Lighthouse (default: `lighthouse`, else `npx lighthouse@{LIGHTHOUSE_VERSION}`)",
    )
    parser.add_argument("--self-test", action="store_true", help="run the internal checks and exit")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("self-test ok")
        return 0

    self_test()

    if args.runs < 1:
        sys.exit("--runs must be at least 1")

    base_url = args.base_url.rstrip("/")
    paths = args.paths or list(DEFAULT_PATHS)
    form_factors = ("desktop", "mobile") if args.form_factor == "both" else (args.form_factor,)
    font_modes = (False, True) if args.fonts == "both" else (args.fonts == "blocked",)

    allowed = frozenset() if args.indexable else PREVIEW_EXPECTED_FAILURES
    if not args.indexable and base_url == PRODUCTION_ORIGIN:
        print(
            "note: measuring production without --indexable, so an is-crawlable failure "
            "would be tolerated — pass --indexable to catch a real noindex regression",
            file=sys.stderr,
        )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = args.out_dir or Path("tmp/lighthouse") / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    command = lighthouse_command(args.lighthouse_cmd)
    runs = [
        Run(path, form_factor, blocked)
        for path in paths
        for form_factor in form_factors
        for blocked in font_modes
    ]

    with contextlib_serve(args.public_dir) as served_origin:
        if served_origin:
            base_url = served_origin
        print(f"Lighthouse: {' '.join(command)}")
        print(f"Origin:     {base_url}" + (f"  (serving {args.public_dir})" if served_origin else ""))
        print(f"Reports:    {out_dir}")
        print(f"Runs:       {len(runs)} page(s) x {args.runs} (sequential)\n")

        rows: list[tuple[Run, list[dict]]] = []
        total = len(runs) * args.runs
        step = 0
        with tempfile.TemporaryDirectory(prefix="lighthouse-profile-") as profile:
            for run in runs:
                url = base_url + run.path
                reports: list[dict] = []
                for repeat in range(1, args.runs + 1):
                    step += 1
                    out_path = out_dir / f"{run.slug}-run{repeat}.json"
                    print(f"[{step}/{total}] {run.form_factor:<7} {url}", flush=True)

                    completed = subprocess.run(
                        command + build_args(run, url, out_path, Path(profile), not args.no_headless),
                        check=False,
                    )
                    if completed.returncode != 0:
                        print(f"  lighthouse exited with {completed.returncode}", file=sys.stderr)
                        print(
                            f"  if it rejected a category, this build expects Lighthouse "
                            f"{LIGHTHOUSE_VERSION} ({', '.join(CATEGORIES)})",
                            file=sys.stderr,
                        )
                        return 1
                    if not out_path.exists():
                        print(f"  no report written to {out_path}", file=sys.stderr)
                        return 1

                    reports.append(json.loads(out_path.read_text(encoding="utf-8")))
                rows.append((run, reports))

    table, problems, diagnostics, records = summarize(rows, allowed)

    # The aggregate is written next to the raw reports so a measurement can be
    # quoted without re-reading every file — and so a note citing it can point
    # at one artifact instead of a directory listing.
    (out_dir / "summary.json").write_text(
        json.dumps(
            {
                "measured": datetime.now(timezone.utc).isoformat(),
                "origin": base_url if not args.public_dir else f"served:{args.public_dir}",
                "runs_per_page": args.runs,
                "lighthouse": " ".join(command),
                "budgets": BUDGETS,
                "diagnostic_score_floor": DIAGNOSTIC_SCORE_FLOOR,
                "pages": records,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print("\n" + table)
    if args.runs == 1:
        print(
            "\nsingle run: the ± column is empty because one measurement has no spread. "
            "Pass --runs 5 before believing a timing."
        )

    if not args.indexable:
        print("\nis-crawlable failures ignored (preview serves Disallow: / by design)")

    if diagnostics:
        print(f"\n{len(diagnostics)} diagnostic note(s) (informational):")
        for note in diagnostics:
            print(f"  - {note}")

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nall runs within budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
