#!/usr/bin/env bash
set -euo pipefail

# Single source of truth for the Hugo pin: .tool-versions. Workers Builds may
# cache package managers, but it must not be able to substitute a different
# Hugo — this script always installs the extended binary named here.
# Tool name is `hugo` (Workers Builds / asdf) or `hugo-extended` (mise/aqua);
# the version token is what matters for the download URL.
HUGO_VERSION="$(awk '/^(hugo-extended|hugo)[[:space:]]/ { print $2; exit }' .tool-versions)"
if [[ -z "${HUGO_VERSION}" ]]; then
  echo "ERROR: .tool-versions does not pin a hugo / hugo-extended version." >&2
  exit 1
fi

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
      echo "       (--remote / branch-floating updates are intentionally not used.)" >&2
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

require_hugo_extended() {
  local reported
  reported="$(hugo version)"
  echo "Hugo: ${reported}"
  # Upstream prints either `vX.Y.Z+extended` or `vX.Y.Z-<hash>+extended`.
  # Match the version as a whole token: after it must come `+`, `-`, or end of
  # the version word — so v0.165.10 cannot satisfy a pin of 0.165.0.
  if [[ ! "${reported}" =~ v${HUGO_VERSION}([+-]|$) ]] || [[ "${reported}" != *"+extended"* ]]; then
    echo "ERROR: need Hugo v${HUGO_VERSION}+extended, got: ${reported}" >&2
    echo "       Version comes from .tool-versions; build.sh installs that exact extended binary." >&2
    exit 1
  fi
}

pre_build_checks() {
  echo "PRE-BUILD: config and content schema..."
  python3 scripts/check-config-contract.py
  python3 scripts/check-content-schema.py
}

main() {
  git config --global core.quotepath false
  if [[ $(git rev-parse --is-shallow-repository) == true ]]; then
    echo "Fetching full Git history..."
    git fetch --unshallow
  fi

  echo "Site commit: $(git rev-parse HEAD)"
  export HUGO_BUILD_COMMIT="$(git rev-parse HEAD)"
  ensure_submodules

  # BUILD CONTEXT for preview evidence (T31 Phase B / T1): site SHA + theme SHA.
  # Workers Builds logs should carry both so a commit preview can be tied to the
  # exact theme gitlink, not only the site commit.
  THEME_SHA="missing"
  if git -C themes/declassified rev-parse HEAD >/dev/null 2>&1; then
    THEME_SHA="$(git -C themes/declassified rev-parse HEAD)"
  fi
  echo "BUILD CONTEXT: site=${HUGO_BUILD_COMMIT} theme=${THEME_SHA}"

  echo "Installing Hugo ${HUGO_VERSION} (extended)..."
  curl -sfL --output-dir "${build_temp_dir}" -O \
    "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  mkdir -p "${HOME}/.local/hugo"
  tar -C "${HOME}/.local/hugo" -xf "${build_temp_dir}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  export PATH="${HOME}/.local/hugo:${PATH}"
  require_hugo_extended

  pre_build_checks

  # This pipeline currently deploys the *.workers.dev preview subdomain,
  # not the production custom domain — keep it out of search indexes until
  # cutover switches this to an explicit production build.
  # Last scrobbled track. Opt-in: without the key nothing runs and the
  # committed snapshot is used as it is, so a fork or a local build needs no
  # credentials. The script never fails the build either — Last.fm being down
  # leaves the previous snapshot in place, exactly like the Webmention import.
  if [[ -n "${LASTFM_API_KEY:-}" ]]; then
    echo "Refreshing the last played track..."
    python3 scripts/fetch-lastfm.py
  fi

  # The dev module's snapshot: weekly hours need WAKATIME_API_KEY, the
  # shape of the week is public. Runs regardless — the script keeps whatever it
  # cannot refresh and never fails the build, like the Last.fm import above.
  echo "Refreshing the dev activity snapshot..."
  python3 scripts/fetch-dev-activity.py || true

  echo "Building the project (environment: preview)..."
  # HUGO_DESTINATION lets release-local write outside a live `hugo server`
  # destination (server rewrites ./public with localhost baseURLs).
  DESTINATION="${HUGO_DESTINATION:-public}"
  hugo build --gc --minify --cleanDestinationDir --panicOnWarning --environment preview \
    --destination "${DESTINATION}"

  # Opt-in measurement scaffolding. `wrangler deploy` runs this script
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
