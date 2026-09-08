#!/usr/bin/env bash
# Local release command (T31 Phase A).
# Order: semantic validate → artifact budgets → Chromium suite → Lighthouse.
# Browser/Lighthouse never enter Workers Builds / the PR gate (see T1).
#
# Builds into tmp/release-public by default so a concurrent `hugo server`
# (which rewrites ./public with localhost baseURLs) cannot poison the suite.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

RUN_BROWSER="${RUN_BROWSER:-1}"
RUN_LIGHTHOUSE="${RUN_LIGHTHOUSE:-1}"
LIGHTHOUSE_RUNS="${LIGHTHOUSE_RUNS:-3}"
export HUGO_DESTINATION="${HUGO_DESTINATION:-tmp/release-public}"
export PUBLIC_DIR="${PUBLIC_DIR:-${HUGO_DESTINATION}}"

echo "==> build → ${HUGO_DESTINATION}"
./build.sh

echo "==> semantic validate (T30)"
PUBLIC_DIR="${PUBLIC_DIR}" ./scripts/validate.sh

echo "==> artifact budgets (T31)"
python3 scripts/check-budgets.py --public-dir "${PUBLIC_DIR}"

if [[ "${RUN_BROWSER}" == "1" ]]; then
  echo "==> browser suite (T31)"
  PUBLIC_DIR="${PUBLIC_DIR}" ./scripts/check-browser.sh
else
  echo "==> browser suite skipped (RUN_BROWSER=0)"
fi

if [[ "${RUN_LIGHTHOUSE}" == "1" ]]; then
  echo "==> lighthouse (T31; pass/fail = S15 LCP/TBT/CLS)"
  python3 scripts/run-lighthouse.py --public-dir "${PUBLIC_DIR}" --runs "${LIGHTHOUSE_RUNS}"
else
  echo "==> lighthouse skipped (RUN_LIGHTHOUSE=0)"
fi

echo "release-local: ok"
