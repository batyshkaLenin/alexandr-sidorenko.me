#!/usr/bin/env python3
"""Run Lighthouse over the site's representative pages and summarize the result.

Unlike the `check-*.py` contract checks, this one needs the network and a
Chrome binary, takes minutes rather than seconds, and is therefore not part of
the review gate. Run it deliberately.

Three things it fixes compared with clicking "Analyze" in DevTools, each of
which silently invalidated the 8 August 2026 baseline (see
`.ai/research/lighthouse-preview-baseline.md`):

- mode is always `navigation` — `snapshot` collects no load metrics at all and
  reports a meaningless `performance: 0`;
- the mobile form factor comes with real screen emulation and CPU throttling,
  not just a changed label;
- Chrome runs in a throwaway profile with extensions off, so injected content
  scripts stop showing up as the page's own blocking time.

Runs are sequential on purpose: parallel Lighthouse processes compete for CPU
and skew every timing they produce.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

LIGHTHOUSE_VERSION = "13.4.1"

PREVIEW_ORIGIN = "https://alexandr-sidorenko-me.auroragamesproject.workers.dev"
PRODUCTION_ORIGIN = "https://alexandr-sidorenko.me"

# One page per template that renders differently: home, section list,
# post detail, creativity list, creativity detail with audio.
DEFAULT_PATHS = (
    "/",
    "/posts",
    "/posts/bluredu-new-teachers",
    "/creativity",
    "/creativity/regular-visitor",
)

CATEGORIES = ("performance", "accessibility", "best-practices", "seo", "agentic-browsing")

FONT_HOSTS = ("https://fonts.googleapis.com/*", "https://fonts.gstatic.com/*")

# Budgets are per form factor because the mobile run is throttled to a slow
# 4x-CPU device and cannot be held to the desktop numbers.
BUDGETS = {
    "desktop": {"lcp_ms": 1500, "tbt_ms": 150, "cls": 0.10, "performance": 0.95},
    "mobile": {"lcp_ms": 2500, "tbt_ms": 200, "cls": 0.10, "performance": 0.85},
}

# A preview build serves `Disallow: /` on purpose, so this audit fails by
# design there and says nothing about the site's SEO.
PREVIEW_EXPECTED_FAILURES = frozenset({"is-crawlable"})


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


def check_budget(run: Run, report: dict) -> list[str]:
    budget = BUDGETS[run.form_factor]
    violations = []

    performance = category_scores(report).get("performance")
    if performance is not None and performance < budget["performance"]:
        violations.append(f"performance {performance:.2f} < {budget['performance']:.2f}")

    for audit_id, key, unit in (
        ("largest-contentful-paint", "lcp_ms", "ms"),
        ("total-blocking-time", "tbt_ms", "ms"),
        ("cumulative-layout-shift", "cls", ""),
    ):
        value = numeric(report, audit_id)
        if value is not None and value > budget[key]:
            violations.append(f"{audit_id} {value:.0f}{unit} > {budget[key]}{unit}")

    return violations


def format_score(scores: dict[str, float | None], key: str) -> str:
    value = scores.get(key)
    return "  —  " if value is None else f"{value:5.2f}"


def format_metric(report: dict, audit_id: str, fmt: str) -> str:
    value = numeric(report, audit_id)
    return "     —" if value is None else format(value, fmt)


def summarize(rows: list[tuple[Run, dict]], allowed: frozenset[str]) -> tuple[str, list[str]]:
    header = f"{'page':<34} {'form':<8} {'perf':>5} {'a11y':>5} {'bp':>5} {'seo':>5} {'LCP':>7} {'TBT':>6} {'CLS':>6}"
    lines = [header, "-" * len(header)]
    problems: list[str] = []

    for run, report in rows:
        scores = category_scores(report)
        lines.append(
            f"{run.slug:<34} {run.form_factor:<8} "
            f"{format_score(scores, 'performance')} {format_score(scores, 'accessibility')} "
            f"{format_score(scores, 'best-practices')} {format_score(scores, 'seo')} "
            f"{format_metric(report, 'largest-contentful-paint', '7.0f')} "
            f"{format_metric(report, 'total-blocking-time', '6.0f')} "
            f"{format_metric(report, 'cumulative-layout-shift', '6.3f')}"
        )

        for problem in methodology_problems(run, report):
            problems.append(f"{run.slug}: {problem}")
        for failure in failed_audits(report, allowed):
            problems.append(f"{run.slug}: failed audit {failure}")
        for violation in check_budget(run, report):
            problems.append(f"{run.slug}: {violation}")

    return "\n".join(lines), problems


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
    run = Run("/posts", "mobile", False)
    assert any("largest-contentful-paint" in v for v in check_budget(run, report)), "self-test: budget not enforced"
    assert Run("/", "desktop", True).slug == "home-desktop-nofonts", "self-test: slug"

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
        f"use {PRODUCTION_ORIGIN} for production or http://localhost:1313 for `hugo server`",
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
        "the degradation ADR redesign-external-resources-contract requires to be measured",
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

    print(f"Lighthouse: {' '.join(command)}")
    print(f"Origin:     {base_url}")
    print(f"Reports:    {out_dir}")
    print(f"Runs:       {len(runs)} (sequential)\n")

    rows: list[tuple[Run, dict]] = []
    with tempfile.TemporaryDirectory(prefix="lighthouse-profile-") as profile:
        for index, run in enumerate(runs, start=1):
            url = base_url + run.path
            out_path = out_dir / f"{run.slug}.json"
            print(f"[{index}/{len(runs)}] {run.form_factor:<7} {url}", flush=True)

            completed = subprocess.run(
                command + build_args(run, url, out_path, Path(profile), not args.no_headless),
                check=False,
            )
            if completed.returncode != 0:
                print(f"  lighthouse exited with {completed.returncode}", file=sys.stderr)
                print(
                    f"  if it rejected a category, this build expects Lighthouse {LIGHTHOUSE_VERSION} "
                    f"({', '.join(CATEGORIES)})",
                    file=sys.stderr,
                )
                return 1
            if not out_path.exists():
                print(f"  no report written to {out_path}", file=sys.stderr)
                return 1

            rows.append((run, json.loads(out_path.read_text(encoding="utf-8"))))

    table, problems = summarize(rows, allowed)
    print("\n" + table)

    if not args.indexable:
        print("\nis-crawlable failures ignored (preview serves Disallow: / by design)")

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nall runs within budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
