#!/usr/bin/env bash
# Cloud Agent environment bootstrap (idempotent).
# Mirrors the repo's own pipeline: pinned Hugo (extended) + theme submodule +
# the local Chromium browser toolchain (T31), then the PR/Workers Builds gate
# (build.sh -> validate.sh via scripts/ci.sh) so public/ is ready to serve.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Pinned Hugo extended, installed to ~/.local/bin so it stays on PATH for the
# agent's own shells (login shells add ~/.local/bin via ~/.profile) — build.sh
# only exports it inside its own subshell.
HUGO_VERSION="$(awk '/^(hugo-extended|hugo)[[:space:]]/ { print $2; exit }' .tool-versions)"
if [[ -z "${HUGO_VERSION}" ]]; then
  echo "ERROR: .tool-versions does not pin a hugo / hugo-extended version." >&2
  exit 1
fi
mkdir -p "${HOME}/.local/bin"
if ! "${HOME}/.local/bin/hugo" version 2>/dev/null | grep -q "v${HUGO_VERSION}[+-].*+extended"; then
  echo "Installing Hugo ${HUGO_VERSION} (extended) to ~/.local/bin..."
  tmp="$(mktemp -d)"
  curl -sfL --output-dir "${tmp}" -O \
    "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  tar -C "${tmp}" -xf "${tmp}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz" hugo
  install -m 0755 "${tmp}/hugo" "${HOME}/.local/bin/hugo"
  rm -rf "${tmp}"
fi
export PATH="${HOME}/.local/bin:${PATH}"
hugo version

# Theme submodule at the exact recorded gitlink (build.sh re-verifies this and
# refuses to build against any other commit).
git submodule update --init --recursive

# Local Chromium browser suite toolchain (T31); not part of the Workers Builds
# gate, but part of the developer's local release flow (scripts/release-local.sh).
npm ci
npx playwright install --with-deps chromium

# Full PR / Workers Builds gate: build.sh (PRE-BUILD contracts + Hugo build)
# then validate.sh (offline semantic suite). Leaves the built site in public/.
./scripts/ci.sh
