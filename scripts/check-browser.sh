#!/usr/bin/env bash
# Chromium browser suite (T31). Requires a built public tree and pinned Playwright.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PUBLIC_DIR="${PUBLIC_DIR:-public}"
if [[ ! -d "${PUBLIC_DIR}" ]]; then
  echo "ERROR: missing ${PUBLIC_DIR}/ — run ./build.sh first." >&2
  exit 1
fi

if [[ ! -d node_modules/@playwright/test ]]; then
  echo "Installing pinned Playwright toolchain..."
  npm ci
  npx playwright install chromium
fi

export PUBLIC_DIR
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:4173}"

echo "Browser suite (Chromium) against ${PUBLIC_DIR}..."
npm run test:browser -- "$@"
