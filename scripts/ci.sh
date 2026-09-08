#!/usr/bin/env bash
# Workers Builds / PR pipeline entry (T1).
# Fail-fast between phases: build (T29 PRE-BUILD+BUILD) then validate (T30).
# Does not copy build logic — only orchestrates existing scripts.
# Browser / budgets / Lighthouse stay local (T31); they are not invoked here.
#
# Local note: a live `hugo server` rewrites ./public with localhost baseURLs.
# On Workers Builds leave defaults (public/). Alongside a local server:
#   HUGO_DESTINATION=tmp/ci-public PUBLIC_DIR=tmp/ci-public ./scripts/ci.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Keep build destination and validate root aligned when overridden locally.
if [[ -n "${HUGO_DESTINATION:-}" && -z "${PUBLIC_DIR:-}" ]]; then
  export PUBLIC_DIR="${HUGO_DESTINATION}"
elif [[ -n "${PUBLIC_DIR:-}" && -z "${HUGO_DESTINATION:-}" ]]; then
  export HUGO_DESTINATION="${PUBLIC_DIR}"
fi

echo "=== CI phase: BUILD (fail-fast) ==="
chmod a+x build.sh
./build.sh

echo "=== CI phase: POST-BUILD validate (aggregate) ==="
chmod a+x scripts/validate.sh
./scripts/validate.sh

echo "ci.sh: BUILD + POST-BUILD passed"
