#!/usr/bin/env bash
# Offline semantic validation suite (T30).
# Requires a built public/ directory. Does not build the site and does not
# implement contracts — only orchestrates existing scripts/check-*.py groups.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PUBLIC_DIR="${PUBLIC_DIR:-public}"
if [[ ! -d "${PUBLIC_DIR}" ]]; then
  echo "ERROR: missing ${PUBLIC_DIR}/ — run ./build.sh first." >&2
  exit 1
fi

failures=0

run_group() {
  local name="$1"
  shift
  local log
  log="$(mktemp)"
  if "$@" >"${log}" 2>&1; then
    echo "[PASS] ${name}"
    # Keep the successful one-liner from the checker for greppability.
    if [[ -s "${log}" ]]; then
      sed 's/^/       /' "${log}" | tail -n 1
    fi
  else
    echo "[FAIL] ${name}"
    sed 's/^/       /' "${log}" >&2
    failures=$((failures + 1))
  fi
  rm -f "${log}"
}

# Groups intentionally exclude:
#   check-http-matrix.py     — runtime HTTP (out of T30)
#   check-content-parity.py  — migration body-hash carve-out
#   check-a11y-contract.py   — browser/a11y (T31)
#   check-config-contract.py / check-content-schema.py — PRE-BUILD (build.sh)

run_group "manifest" python3 scripts/check-semantic-manifest.py
run_group "url" python3 scripts/check-url-contract.py --public-dir "${PUBLIC_DIR}"
run_group "feeds" python3 scripts/check-feed-contract.py --public-dir "${PUBLIC_DIR}"
# check-schema-contract uses --public (historical flag name), not --public-dir.
run_group "schema" python3 scripts/check-schema-contract.py --public "${PUBLIC_DIR}"
run_group "uid" python3 scripts/check-uid-contract.py --public-dir "${PUBLIC_DIR}"
run_group "404" python3 scripts/check-404-contract.py --public-dir "${PUBLIC_DIR}"
run_group "rel-me" python3 scripts/check-rel-me-contract.py --public-dir "${PUBLIC_DIR}"
run_group "webmention" python3 scripts/check-webmention-contract.py --public-dir "${PUBLIC_DIR}"
run_group "pgp-key" python3 scripts/check-pgp-key.py --public-dir "${PUBLIC_DIR}"
run_group "security-txt" python3 scripts/check-security-txt.py --public-dir "${PUBLIC_DIR}"
run_group "headers" python3 scripts/check-headers-contract.py --public-dir "${PUBLIC_DIR}"

if (( failures > 0 )); then
  echo "validate.sh: ${failures} group(s) failed" >&2
  exit 1
fi

echo "validate.sh: all groups passed"
