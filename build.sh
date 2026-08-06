#!/usr/bin/env bash
set -euo pipefail

HUGO_VERSION=0.162.1

build_temp_dir=$(mktemp -d)
cleanup() { rm -rf "${build_temp_dir}"; }
trap cleanup EXIT SIGINT SIGTERM

main() {
  echo "Installing Hugo ${HUGO_VERSION}..."
  curl -sfL --output-dir "${build_temp_dir}" -O \
    "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  mkdir -p "${HOME}/.local/hugo"
  tar -C "${HOME}/.local/hugo" -xf "${build_temp_dir}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  export PATH="${HOME}/.local/hugo:${PATH}"

  echo "Hugo: $(hugo version)"

  git config --global core.quotepath false
  if [[ $(git rev-parse --is-shallow-repository) == true ]]; then
    echo "Fetching full Git history..."
    git fetch --unshallow
  fi

  # This pipeline currently deploys the *.workers.dev preview subdomain,
  # not the production custom domain (see .ai/adr/redesign-hosting-cloudflare.md) —
  # keep it out of search indexes until Фаза 7 cutover switches this to
  # an explicit production build.
  echo "Building the project (environment: preview)..."
  hugo build --gc --minify --environment preview
}

main "$@"
