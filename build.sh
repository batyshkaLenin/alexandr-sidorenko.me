#!/usr/bin/env bash
set -euo pipefail

HUGO_VERSION=0.162.1

build_temp_dir=$(mktemp -d)
cleanup() { rm -rf "${build_temp_dir}"; }
trap cleanup EXIT SIGINT SIGTERM

# Deterministically bring every submodule (currently just
# themes/declassified) to exactly the commit recorded in the superproject's
# index — never the remote's current branch tip. Fails fast, before any
# Hugo work starts, with a diagnostic that names the submodule and the
# commit it was supposed to reach, rather than letting Hugo run against a
# missing/wrong theme checkout and fail with a confusing template error.
#
# Not shallow: `git submodule update --init` defaults to a full clone of
# the submodule, and this intentionally does not add --depth. A shallow
# fetch only reliably resolves a commit that is the remote's current branch
# tip; the recorded gitlink can lag behind main (e.g. right after a site
# commit pins an older theme release), so a shallow fetch is not safe here.
# The theme repo is small enough that this costs a negligible amount of time.
ensure_submodules() {
  if [[ ! -f .gitmodules ]]; then
    return 0
  fi

  echo "Syncing submodule remotes..."
  git submodule sync --recursive

  local path recorded actual
  while read -r path; do
    [[ -n "${path}" ]] || continue

    if ! recorded=$(git rev-parse "HEAD:${path}" 2>/dev/null); then
      echo "ERROR: no gitlink recorded for submodule '${path}' at the current commit." >&2
      echo "       Run 'git add ${path}' after pinning it to a real commit." >&2
      exit 1
    fi

    actual=""
    if git -C "${path}" rev-parse --git-dir >/dev/null 2>&1; then
      actual=$(git -C "${path}" rev-parse HEAD 2>/dev/null || echo "")
    fi

    if [[ "${actual}" == "${recorded}" ]]; then
      echo "Submodule '${path}' already at recorded commit ${recorded}."
      continue
    fi

    echo "Initializing submodule '${path}' at recorded commit ${recorded}..."
    if ! git submodule update --init --recursive -- "${path}"; then
      echo "ERROR: failed to initialize submodule '${path}' at ${recorded}." >&2
      echo "       Check network access to its remote and that this commit is actually pushed there." >&2
      echo "       (--remote / branch-floating updates are intentionally not used — see T27.)" >&2
      exit 1
    fi

    actual=$(git -C "${path}" rev-parse HEAD)
    if [[ "${actual}" != "${recorded}" ]]; then
      echo "ERROR: submodule '${path}' checked out ${actual}, but the recorded gitlink is ${recorded}." >&2
      echo "       Refusing to build against an unexpected theme commit." >&2
      exit 1
    fi

    echo "Submodule '${path}' verified at ${actual}."
  done < <(git config --file .gitmodules --get-regexp '\.path$' | awk '{print $2}')
}

main() {
  git config --global core.quotepath false
  if [[ $(git rev-parse --is-shallow-repository) == true ]]; then
    echo "Fetching full Git history..."
    git fetch --unshallow
  fi

  echo "Site commit: $(git rev-parse HEAD)"
  ensure_submodules

  echo "Installing Hugo ${HUGO_VERSION}..."
  curl -sfL --output-dir "${build_temp_dir}" -O \
    "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  mkdir -p "${HOME}/.local/hugo"
  tar -C "${HOME}/.local/hugo" -xf "${build_temp_dir}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  export PATH="${HOME}/.local/hugo:${PATH}"

  echo "Hugo: $(hugo version)"

  # This pipeline currently deploys the *.workers.dev preview subdomain,
  # not the production custom domain (see .ai/adr/redesign-hosting-cloudflare.md) —
  # keep it out of search indexes until Фаза 7 cutover switches this to
  # an explicit production build.
  # Last scrobbled track (T96). Opt-in: without the key nothing runs and the
  # committed snapshot is used as it is, so a fork or a local build needs no
  # credentials. The script never fails the build either — Last.fm being down
  # leaves the previous snapshot in place, exactly like the Webmention import.
  if [[ -n "${LASTFM_API_KEY:-}" ]]; then
    echo "Refreshing the last played track..."
    python3 scripts/fetch-lastfm.py
  fi

  echo "Building the project (environment: preview)..."
  hugo build --gc --minify --cleanDestinationDir --environment preview

  # Opt-in measurement scaffolding (T69). `wrangler deploy` runs this script
  # itself and rebuilds public/ from scratch, so anything generated beforehand
  # is thrown away — which is why this hook exists here rather than as a step
  # someone remembers to run first.
  #
  # PERF_PAGES holds the directory with the woff2 files and their faces.json.
  # Unset — the default, and what production does — nothing is generated.
  if [[ -n "${PERF_PAGES:-}" ]]; then
    echo "Generating font-arm pages from ${PERF_PAGES}..."
    python3 scripts/make-perf-pages.py --fonts "${PERF_PAGES}"
  fi
}

main "$@"
