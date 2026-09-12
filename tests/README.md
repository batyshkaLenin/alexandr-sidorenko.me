# Contract checks

PR / Workers Builds entry (T1):

```sh
./scripts/ci.sh
# equivalent: ./build.sh && ./scripts/validate.sh
# alongside a live hugo server (it rewrites ./public with localhost):
# HUGO_DESTINATION=tmp/ci-public PUBLIC_DIR=tmp/ci-public ./scripts/ci.sh
```

`ci.sh` is fail-fast between BUILD and POST-BUILD; `validate.sh` aggregates
independent groups and exits non-zero if any failed. Wrangler’s
`build.command` in `wrangler.jsonc` calls this wrapper — the dashboard must
not redefine a different build pipeline.

### Workers Builds activation (dashboard, owner)

After Wrangler is pinned in `package.json` / lockfile:

1. Connect **only** this GitHub repository (Cloudflare Git integration).
2. Production branch = `main`; enable **non-production branch builds**.
3. Leave dashboard **build command empty** (source of truth: `wrangler.jsonc` →
   `scripts/ci.sh`).
4. Production deploy: `npx wrangler deploy` (or default).
5. Preview / PR deploy: `npx wrangler versions upload` — never `wrangler deploy`
   on a PR branch (no production promotion).
6. Confirm `preview_urls: true` in `wrangler.jsonc` so the PR gets native
   preview evidence; build logs must show `BUILD CONTEXT: site=… theme=…` and
   `[PASS]`/`[FAIL]` per validate group.

Browser tooling and Lighthouse stay **out** of this gate (local
`release-local.sh` only).

Offline semantic suite alone (same as post-build half of `ci.sh`):

```sh
./build.sh && ./scripts/validate.sh
```

`validate.sh` prints `[PASS]` / `[FAIL]` per group (manifest, url, feeds, schema,
uid, 404, rel-me, webmention, headers) and exits non-zero on any failure. It
does **not** run `check-http-matrix` (runtime), `check-content-parity`
(migration carve-out), artifact budgets, browser, or Lighthouse (T31).
Config/content schema already run inside `build.sh`.

### Local release (T31)

Full local release path after a clean build destination (defaults to
`tmp/release-public` so a live `hugo server` cannot poison `./public` with
localhost baseURLs):

```sh
./scripts/release-local.sh
# or skip the slow steps:
RUN_LIGHTHOUSE=0 ./scripts/release-local.sh
RUN_BROWSER=0 RUN_LIGHTHOUSE=0 ./scripts/release-local.sh
```

Order: build → `validate.sh` → `check-budgets.py` → Chromium suite → Lighthouse.
Browser tooling and Lighthouse stay **out** of Workers Builds / the PR gate.

Individual checkers (same contracts, without the orchestrator):

```sh
# Or: ./build.sh  (pins Hugo from .tool-versions, runs config/content schema first)
hugo build --gc --minify --panicOnWarning --environment preview
python3 scripts/check-semantic-manifest.py
python3 scripts/check-config-contract.py
python3 scripts/check-content-schema.py
python3 scripts/check-content-parity.py
python3 scripts/check-feed-contract.py
python3 scripts/check-uid-contract.py
python3 scripts/check-404-contract.py
python3 scripts/check-rel-me-contract.py
python3 scripts/check-url-contract.py
python3 scripts/check-schema-contract.py
python3 scripts/check-webmention-contract.py
python3 scripts/check-pgp-key.py
python3 scripts/check-security-txt.py
python3 scripts/check-headers-contract.py
python3 scripts/check-budgets.py
./scripts/check-browser.sh
```

Controlled failures for the T30 suite (mutates a temp copy of `public/` only):

```sh
./scripts/prove-semantic-controlled-failures.sh
```

Budget / axe controlled failures:

```sh
python3 scripts/check-budgets.py --self-test
# axe: tests/fixtures/browser-violations/missing-alt.html (asserted red in suite)
```

## Config and content schema (T29)

`check-config-contract.py` pins `baseURL` / theme / locale / `github_repo`,
checks that `build.sh` installs Hugo Extended from `.tool-versions` with
`--panicOnWarning`, and that Workers Builds entry points stay in-repo:
`scripts/ci.sh`, `wrangler.jsonc` → that wrapper, `preview_urls: true`, and an
exact `wrangler` pin in `package.json` + lockfile.
`check-content-schema.py` validates library front matter
(authors, type, UUIDv7 `id`, dates, cover/audio shapes) before Hugo runs.

Controlled failures:

```sh
python3 scripts/check-config-contract.py --config tests/fixtures/config-schema/broken-hugo.toml
python3 scripts/check-content-schema.py --library tests/fixtures/content-schema
python3 scripts/check-config-contract.py --self-test
python3 scripts/check-content-schema.py --self-test
```

Each script prints what it verified and exits non-zero on the first failure.
They need a built `public/` directory; none of them needs the network unless
noted below.

## Content parity

`check-content-parity.py` compares each migrated publication body with its
committed SHA-256 snapshot (front matter, hard-break
syntax, whitespace, and absolute→root-relative asset URLs normalized away).
If `tmp/old_project` is present, it also compares the normalized old and
current bodies live.

It counts `<br>` boundaries independently in page HTML, RSS, and JSON Feed —
those three views of one publication must agree. Global Goldmark `hardWraps`
must stay disabled.

Intentional differences from the legacy site are listed in the fixture, not
here. A body marked `redacted_from_legacy` skips the live old/current
comparison; the committed snapshot still pins what readers see.
`data/redactions.yaml` is the public ledger of those decisions.

## Feeds

`check-feed-contract.py` parses RSS and JSON Feed: every body reaches both
feeds and the page, each card summary matches the publication description,
embedded URLs are absolute, and audio MIME/byte length match the static file.

## Stable identity

`check-uid-contract.py` checks that every publication `uid` is unique and
well-formed, and that HTML `u-uid`, RSS `<guid isPermaLink="false">`, JSON
Feed `id`, and JSON-LD `@id` all agree with it. Location URLs
(`canonical` / `u-url` / `.Permalink`) stay separate — they follow the page
address, not the durable id.

## Canonical URLs

`check-url-contract.py` collects every internal address the build emits
(HTML `href`/`src`, URL-bearing `<meta>`, `canonical`, `og:url`, MF2
`u-url`, sitemap, RSS, JSON Feed, JSON-LD, `site.webmanifest`) and fails on
any trailing slash outside the root. All representations of one page must be
the same byte string. Templates get that form from
`layouts/_partials/canonical-url.html`.

It also fails when an internal HTML navigational `href`/`src` does not resolve
inside `public/`, when `robots.txt` is missing a User-agent stanza, and when a
`noindex` page (e.g. `/library/table`) appears in `sitemap.xml` or `llms.txt`.

## Semantic manifest

`tests/fixtures/semantic-manifest.json` is the single representative
publication + surface map. `check-semantic-manifest.py` only aligns
`feed-contract.json` and `schema-contract.json` with that list (no second
pass over `public/`). Negative discoverability expectations for Table live
there; enforcement stays in `check-url-contract.py`.

## 404 page

`check-404-contract.py` verifies `public/404.html` is Russian-titled, carries
`robots: noindex`, and has no canonical, Open Graph/Twitter, or JSON-LD —
a not-found page must not claim publication identity. HTTP status itself is
a host property (`not_found_handling: "404-page"` on Workers Static Assets).

## schema.org

`check-schema-contract.py` asserts each page carries exactly the nodes listed
in `tests/fixtures/schema-contract.json` (types, list members, breadcrumbs,
required properties), and that the embedded list matches the visible one.
Validity is checked against the committed schema.org vocabulary
(`tests/fixtures/schema-org-vocabulary.json`); refresh with
`scripts/fetch-schema-vocabulary.py` (network).

## rel=me

`check-rel-me-contract.py` reads the approved URL set from `data/links.yaml`
and asserts each appears as `rel=me` — a head `<link>` or a visible `<a>`,
never both for the same URL — on representative pages, with no extras beyond
the home page's own self link.

## Webmentions

`check-webmention-contract.py` reads `data/webmentions.json` (what readers
see) and checks stored fields and rendering: no avatar, no e-mail, no foreign
markup, canonical targets, absolute sources; every approved mention appears
on its page and nowhere else invents a section.

Fetch and moderation are manual, not part of the build:

```sh
python3 scripts/fetch-webmentions.py     # → tmp/webmentions-inbox.json
python3 scripts/moderate-webmentions.py --approve wm-123
python3 scripts/moderate-webmentions.py --remove wm-123
python3 scripts/moderate-webmentions.py --deny-domain spam.example
python3 scripts/send-webmentions.py --dry-run
```

`fetch` needs the network and built `sitemap.xml`; no credentials. Unreviewed
entries stay in the gitignored inbox. `send` journals delivered pairs in
`data/webmentions-sent.json`.

## Headers and cache

`check-pgp-key.py` imports `key.pub` into an empty temporary `GNUPGHOME`,
requires fingerprint `742587A7940BC99F2F5AC7CD0D7EC386CBEF33F6`, rejects
revoked/expired keys, UID or encryption-subkey drift and secret-key packets,
and checks that every built HTML head discovers the stable site-relative URI
with `<link rel="pgpkey" href="/key.pub">`.

`check-security-txt.py` requires the approved RFC 9116 fields and order,
unsigned UTF-8 content, the production `Canonical` and `/key.pub` Encryption
URI. It fails when `Expires` is expired or 30 days away, warns from 60 days,
and never changes the manually reviewed date. Controlled fixtures cover an
expired document and the 30/45-day boundaries. Runtime mode also rejects both
direct and automatically followed redirects from the canonical path.

`check-headers-contract.py` reads `_headers` from the build and compares
security headers, `Cache-Control` classes, and coverage (every built file
falls into a class; HTML keeps the platform default; `immutable` only on
content-addressed URLs). HSTS is not expected yet.

With `--base-url` it also probes a running origin:

```sh
npx wrangler dev --port 8791
python3 scripts/check-headers-contract.py --base-url http://127.0.0.1:8791
python3 scripts/check-security-txt.py --base-url http://127.0.0.1:8791
```

## HTTP matrix

`check-http-matrix.py` probes a *running* origin — URL form, redirects, media
types, and real 404s exist only there. Without `--base-url` it skips and
exits 0 so the review gate can still invoke it.

```sh
python3 scripts/check-http-matrix.py --base-url https://<preview-host>
```

## Lighthouse

`scripts/run-lighthouse.py` is separate: it needs the network and Chrome, and
takes minutes. Run it deliberately against a built tree (prefer
`./scripts/release-local.sh`, which serves `--public-dir` rather than
`hugo server`):

```sh
python3 scripts/run-lighthouse.py --public-dir public --runs 3
python3 scripts/run-lighthouse.py --fonts blocked
python3 scripts/run-lighthouse.py --base-url https://alexandr-sidorenko.me --indexable
```

Pass/fail is the S15 metric set (LCP / TBT / CLS). The composite performance
score is printed as a diagnostic only. Reports land in
`tmp/lighthouse/<UTC timestamp>/`.

## Browser suite (T31)

Pinned Playwright Chromium (`package.json` + lockfile). Specs under
`tests/browser/` cover JS-off, keyboard/focus, enhancement widgets, and runtime
axe. Home runs on desktop + mobile; track/article fixtures stay
desktop-representative. Does not replace `check-a11y-contract.py`.

```sh
./scripts/check-browser.sh
```

## Artifact budgets (T31)

`scripts/check-budgets.py` holds filesystem ceilings from S15/T69 (CSS/JS/image
totals and per-HTML-page size). Not part of `validate.sh`.
