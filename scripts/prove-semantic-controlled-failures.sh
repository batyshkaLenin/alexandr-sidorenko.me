#!/usr/bin/env bash
# Prove the three controlled-failure classes required by T30.
# Mutates a temporary copy of public/ (and optionally a temp feed fixture);
# never writes back to the real tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -d public ]]; then
  echo "ERROR: missing public/ — run ./build.sh first." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

cp -a public "${tmpdir}/public"
failures_expected=0
failures_missed=0

expect_fail() {
  local class="$1"
  shift
  local log
  log="$(mktemp)"
  if "$@" >"${log}" 2>&1; then
    echo "[MISS] ${class}: checker unexpectedly passed"
    sed 's/^/       /' "${log}" | tail -n 5
    failures_missed=$((failures_missed + 1))
  else
    echo "[OK]   ${class}: checker failed as expected"
    # Show the first diagnostic line for evidence.
    grep -E '^- |failed' "${log}" | head -n 3 | sed 's/^/       /' || true
    failures_expected=$((failures_expected + 1))
  fi
  rm -f "${log}"
}

# 1) Broken internal target → URL checker
python3 - <<'PY' "${tmpdir}/public"
from pathlib import Path
import sys
root = Path(sys.argv[1])
page = root / "index.html"
text = page.read_text()
needle = "</body>"
if needle not in text:
    raise SystemExit("index.html missing </body>")
page.write_text(text.replace(needle, '<a href="/library/does-not-exist-t30">broken</a>\n' + needle, 1))
PY
expect_fail "broken-internal-target" \
  python3 scripts/check-url-contract.py --public-dir "${tmpdir}/public"

# Restore public copy for the next mutation class.
rm -rf "${tmpdir}/public"
cp -a public "${tmpdir}/public"

# 2) Identity / feed drift → UID checker (corrupt a publication u-uid in HTML)
python3 - <<'PY' "${tmpdir}/public"
from pathlib import Path
import sys
root = Path(sys.argv[1])
page = root / "library" / "skver" / "index.html"
text = page.read_text()
old = "https://alexandr-sidorenko.me/id/01a00aea-44dc-74e0-8834-8960ccf9d4e8"
new_id = "https://alexandr-sidorenko.me/id/00000000-0000-7000-8000-000000000000"
# Only rewrite the visible MF2 u-uid marker once; leave JSON-LD/@id alone so
# the checker surfaces an HTML/feed disagreement rather than a total wipe.
marker = f"class=u-uid value={old}"
if marker not in text:
    marker = f'class="u-uid" value="{old}"'
if marker not in text:
    raise SystemExit("could not locate u-uid marker in skver page")
page.write_text(text.replace(marker, marker.replace(old, new_id), 1))
PY
expect_fail "identity-drift" \
  python3 scripts/check-uid-contract.py --public-dir "${tmpdir}/public"

rm -rf "${tmpdir}/public"
cp -a public "${tmpdir}/public"

# 3) Wrong discoverability → URL checker (table noindex page listed in sitemap)
python3 - <<'PY' "${tmpdir}/public"
from pathlib import Path
import sys
root = Path(sys.argv[1])
sitemap = root / "sitemap.xml"
text = sitemap.read_text()
if "library/table" in text:
    raise SystemExit("sitemap already lists table — cannot prove controlled failure")
injection = """  <url>
    <loc>https://alexandr-sidorenko.me/library/table</loc>
  </url>
"""
if "</urlset>" not in text:
    raise SystemExit("sitemap.xml missing </urlset>")
sitemap.write_text(text.replace("</urlset>", injection + "</urlset>", 1))
PY
expect_fail "table-in-sitemap" \
  python3 scripts/check-url-contract.py --public-dir "${tmpdir}/public"

echo
if (( failures_missed > 0 )) || (( failures_expected < 3 )); then
  echo "controlled-failure proof incomplete: ok=${failures_expected} missed=${failures_missed}" >&2
  exit 1
fi
echo "controlled-failure proof: ${failures_expected}/3 classes failed as required"
