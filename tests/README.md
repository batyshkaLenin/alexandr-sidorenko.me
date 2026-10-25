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
python3 scripts/check-webmention-resolver.py
python3 scripts/check-pgp-key.py
python3 scripts/check-security-txt.py
python3 scripts/check-headers-contract.py
python3 scripts/check-service-worker.py
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

## Scrollbar layout regression (W0077)

After building a preview, run:

```sh
hugo build --gc --minify --panicOnWarning --environment preview --destination tmp/scrollbar-public
PUBLIC_DIR=tmp/scrollbar-public npx playwright test tests/browser/scrollbar-layout.spec.ts --project=chromium-desktop --project=firefox-desktop --workers=2
```

The spec launches Chromium with native scrollbars enabled and explicitly selects
classic/overlay modes. Firefox runs **headed**: Playwright's headless Firefox
installs a UA `scrollbar-width: none !important` sheet, so it cannot demonstrate
native scrollbar geometry. Firefox's `ui.useOverlayScrollbars` and GTK overlay
preference select its modes. Linux needs a display; use an existing Xvfb display
on CI. The navigation test checks actual reserved width in each mode, rather
than trusting flags or assuming a 15px/17px scrollbar.

The standard QA profile registers this spec as `browser.scrollbar-layout`
(Chromium desktop; its explicit phone width matrix runs there too). The command
above adds Firefox native modes.

Coverage includes overflowing and fitting pages, clicks and history, Reader/404,
shell and container breakpoints, short Home's internal scrolling, dialogs,
prompt, no-JS and print. Compare real element rectangles: on some engines a
reserved gutter on a fitting page is not reflected by `innerWidth - clientWidth`.
Native macOS Always/automatic settings and iOS still require device acceptance;
desktop browser preferences do not prove behavior on those operating systems.

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

`check-feed-contract.py` parses RSS and JSON Feed: every **pinned** body in
the fixture reaches both feeds and the page, each card summary matches the
publication description, embedded URLs are absolute, and audio MIME/byte
length match the static file. The fixture is a representative sample; the
catalog may grow. RSS and JSON Feed must stay the same length as each other.

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

## Web app manifest and installation UI

`static/site.webmanifest` intentionally omits `screenshots`: W0024 records the
decision not to promise or implement extended installation UI (Richer Install
UI). Window Controls Overlay is outside scope. The current contract is
[`INV-ARCH-INSTALLATION-UI`](../.ai/v2/docs/architecture/delivery-and-security.md#inv-arch-installation-ui).
Icons and identity have their own work item, W0023.

On a fresh preview build, run `site.url-contract`, `site.headers-contract`,
`site.image-metadata` and `site.budgets` through the Harness review runner. The
URL check resolves internal manifest addresses, including icons and shortcuts;
the other checks cover headers, image derivatives and artifact budgets. They
do not replace Chromium manifest acceptance or validate every manifest field.

For Chromium acceptance, serve the build on localhost and record the browser
version, `Page.getAppManifest` diagnostics and `Page.getInstallabilityErrors`.
Confirm the manifest link loads, parsed metadata matches the source, local
icons decode at their declared sizes/MIME types, and shortcuts resolve. Confirm
`screenshots` is absent and `display_override` does not request
`window-controls-overlay`. DevTools warnings about richer installation UI being
unavailable on desktop/mobile without screenshots are expected under W0024;
report other diagnostics separately. A warning-free manifest parser is not
proof of a complete device installation or offline support.

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

`check-webmention-contract.py` reads snapshot contract v2 from
`data/webmentions.json` and checks stored fields, material ownership, selector
shape and rendering. Quote targets must render their stored text and capture
date; a reattached quote must use a Text Fragment link, while a stale or
ambiguous snapshot must expose no deep link. `check-webmention-resolver.py` pins registry collisions,
domain pagination, Text Fragment ambiguity and quote capture against a fixed
material version. Matching approximates the Text Fragments primary-level
comparison (case and combining diacritics do not distinguish a match), while
publication remains conservative: only one resolved range becomes a quote
selector. Multiple text directives in one URL are quarantined because one
Webmention record has one stored target selector.

Fetch and moderation are manual, not part of the build:

```sh
WEBMENTION_IO_TOKEN=… python3 scripts/fetch-webmentions.py
# → tmp/webmentions-inbox.json (mentions + unresolved)
python3 scripts/moderate-webmentions.py --approve wm-123
python3 scripts/moderate-webmentions.py --remove wm-123
python3 scripts/moderate-webmentions.py --deny-domain spam.example
python3 scripts/send-webmentions.py --dry-run
```

`fetch` needs the network, a built site and `WEBMENTION_IO_TOKEN` in its offline
environment. It reads the domain-wide API with pagination, then resolves base
URLs through the material registry; the token is never used by Hugo or the
deploy build. Unreviewed and unresolved entries stay in the gitignored inbox.
`send` journals delivered pairs in `data/webmentions-sent.json`.

The browser enhancement fixture also checks search navigation: a body-only
match gets a Text Fragment, a title match keeps its canonical URL, contextual
duplicates can be distinguished, and indistinguishable duplicates fall back to
the canonical page. `check-search-index.py` rejects fragments stored in the
index and verifies that its body text is exactly the normalized stream used by
the Webmention selector resolver, including poetry line breaks.

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

`browser.article-toc` covers the shared Article/Fiction/Paper TOC (W0071),
including the real eleven-section fiction page, native Cyrillic anchors and
history, JS on/off, and 320/390/768/1100/1101/1440 px reading geometry.
Its workers call `check-a11y-contract.py --toc-fixtures <temporary-directory>`:
25 disposable pages use the real site templates, partials, heading hook and
configuration. They cover 0–3 headings, nested h3, h4 exclusion, Paper chrome,
Unicode/repeated/explicit anchors, excluded types, collection/custom layouts,
and an empty Hugo TOC. Duplicate explicit IDs and a broken target are negative
checker cases; IDs are never rewritten to make the check pass. Fixture output
is temporary and cannot enter the normal build or deployment.

The static a11y check also validates any emitted Contents landmark: at least
three unique links, each pointing to an existing h2/h3 ID. Eligibility counts
Hugo Markdown fragments, not template headings, reading time or a new flag.

Pinned Playwright Chromium (`package.json` + lockfile). Specs under
`tests/browser/` cover JS-off, keyboard/focus, enhancement widgets, and runtime
axe. Home runs on desktop + mobile; track/article fixtures stay
desktop-representative. Does not replace `check-a11y-contract.py`.

```sh
./scripts/check-browser.sh
```

## Artifact budgets (T31)

CSS delivery uses one base bundle and a separate fingerprinted, SRI-protected
`media="print"` bundle. Base remains applicable in print; theme print rules keep
their cascade layer and precede site print overrides. `publication-print.spec.ts`
checks the split and holds the print response while no-JS screen content paints,
then releases it and verifies native print styling. CSS unit/isolation checkers
read all four Site/Theme source stylesheets. The CSS budget still counts every
built CSS file, including print; the split does not change the ceiling.

`scripts/check-budgets.py` holds filesystem ceilings from S15/T69 (CSS/JS/image
totals and per-HTML-page size). Not part of `validate.sh`.

## Local executable design reference (Phase 4)

The reference is executable evidence, subordinate to `.ai/v2/docs` canonical
contracts. It is not an editorial publication or a second design system. The
representative 4B set is in `data/design-reference.json` and the theme's
`exampleSite/data/design-states.json`. Conformance remains pending independent
inspection; known production deviations are not approved baselines.

```sh
python3 scripts/build-design-reference.py --output /tmp/design-reference
PUBLIC_DIR=/tmp/design-reference/site DESIGN_REFERENCE_ROOT=/tmp/design-reference \
  ./node_modules/.bin/playwright test tests/browser/design-reference.spec.ts \
  --project=chromium-desktop --workers=2 --output=/tmp/design-reference-browser
```

Use a fresh output directory. The builder checks the pinned Hugo Extended
version, uses a fixed clock and checked-in data, and builds normal preview,
production, local site reference and theme control/reference. It does not run
`build.sh`, refresh external snapshots, install tools, modify global settings,
change hosting, or deploy. The profile is explicitly selected with
`--config hugo.toml,config/design-reference.toml --environment design-reference`.
Normal preview and production ignore reference content completely. Templates
reject reference rendering in any other environment. Do not deploy the opt-in
output; no public exposure is authorized.

For manual inspection serve `site` and `theme` output directories on loopback
(for example with `scripts/serve-public.py`, ports 4173 and 4174). Open
`/__design/site` and `/__design/theme`. Both are service routes: noindex/nofollow,
no publication identity/discovery. Normal navigation, feeds, sitemap, search,
taxonomies, related/backlinks, `/id/`, redirects and llms.txt remain unchanged.
The existing production CSP/headers apply; no new origin or inline script/style
is needed. Existing fingerprinted assets are reused without reference CSS/JS.

`check-design-reference.py --build-root DIR --self-test` is the primary checker.
It binds manifest entries to source and rules, validates fixture constraints and
rendered HTML, invokes the theme check, and compares *all* ordinary output bytes
between enabled/disabled builds. The only allowed additions are one site service HTML file and three theme
service HTML files (main, native table context, isolated generic code context). Its negative case injects a reference
artifact into a disposable production copy and requires the ordinary CLI to fail.
`--control-root DIR` additionally compares `control-preview`,
`control-production` and `theme-control` pre-change outputs built with the same
clock/Hugo/data/build-commit. Neither checker rewrites sources or baselines.

Agent workflow: read canonical rule → inspect its matching example → inspect the
production entrypoint → implement → run relevant checks. Synthetic site fixtures
use real type-badge and Markdown figure/code/table rendering; composition links
use actual Home, Library catalog and a TOC article. There is no fake reader: the
production reader heading requires material identity. W0017 (MaterialRow/type
link) and primary/green versus accent/pink focus remain explicit deviations;
4A does not repair them. W0001 now omits the responses section when no approved
responses exist; `check-webmention-contract.py` enforces that absence.
DR-2026-001/002 are out of
scope. The 4B matrix below expands coverage without repairing these production deviations.

The Chromium matrix covers all five canonical widths for geometry, representative
390/1440 interactions and 320/1440 reading with JS on/off, plus selected media modes.
Region screenshots are temporary inspection evidence, not golden snapshots.
These implementation checks and any later bounded inspection create no canonical
Review/QA receipts. W0025 remains in Implementation until full Phase-4 acceptance
is implemented and the 4C lifecycle gates are satisfied.

### Slice 4B representative coverage plan (W0025, attempt 1)

This matrix is implementation evidence below the canonical catalog, not a new
design authority. It was derived before adding the examples. The viewport set
is exactly 320, 390, 768, 1024, 1440; behavioral scenarios use 390 and 1440.
Manifest `states` bind the implemented `STATE-*` vocabulary; descriptive `state`
text explains native/component-specific transitions without inventing catalog IDs.

| Canonical rule/state | Production entrypoint / reference context | Coverage / evidence | Conformance boundary |
|---|---|---|---|
| DS-LAYOUTS, idle/long-title/no-JS | Theme generic page, native links/inputs/disclosure, UI/prose typography | Five widths, JS on/off, local geometry and Tab | Focus color remains a known deviation |
| No-JS baseline, focus-visible | dc-copy, dc-listnav | 390/1440 clipboard and local keys; no-JS links; refused clipboard | Behavior covered; focus color not blessed |
| DS-STATES selected/loading/error/zero-matches | Existing exampleSite dc-command-palette / dc-help / dc-prompt | 390/1440 open/select/close/focus return/completion; intercepted local index | Enhancement-only hosts absent without JS |
| JS component lifecycle, idle/current | dc-modes / dc-image-toggle / dc-clock / dc-keynav | Existing theme contexts; real Library list/table history; frozen clock; blocked original | No duplicate global shortcut hosts or new APIs |
| Semantic HTML, wide-code/table/math | Markdown headings/links/quote, plain/rich code, footnotes, table, MathML | Site service content; five widths JS on/off; focusable local scrolling | Production render hooks only |
| DS-COMPONENTS figure/gallery | Existing figure/gallery pipeline, caption/credit, default/wide/full, dither/original | Site service content; five widths; original failure; selected print | Existing published image resources, no new media assets |
| Semantic content | parallel / verse shortcodes | Site service content and real translation/poem pages; narrow/wide | No copied renderer markup |
| DS-COMPONENTS MaterialRow rich/dense/long-title/metadata | Real /library, type lists and Home | Five-width representative compositions; real row APIs and counts/order | W0017 remains a production defect; rows are not embedded in identity-free service pages |
| DS-LAYOUTS reader/TOC/poetry/track | Real TOC article, long fiction, short/long poem, track and translation URLs | Five-width shell/TOC geometry; 320/1440 no-JS reading; native audio keys | W0001 and reader identity limitation remain explicit |
| No-JS / enhancement-unavailable | Home activity/dev snapshot and existing external-media facade | Block optional script/refresh/embed; local interception, no live provider requests | Existing snapshots and outbound links remain usable |
| Reduced-motion / forced-colors / print | Affected focus, overlays, renderer scroll regions and media | Selected 390/1440 scenarios; temporary region screenshots | No full-page prose golden baselines |

The manifests distinguish `covered-conformant`, `covered-known-deviation`,
`not-applicable`, and `deferred`. Conformant means only the declared bounded
implementation checks; formal conformance/owner acceptance belongs to 4C.
Visited color is not asserted because browser privacy prevents honest observation.
There is no STATE-DISABLED; no generic disabled placeholder is added. Native
video has only a draft asset fixture, so published track audio and existing
user-activated external media represent media here without new output assets.
Specified table sorting, bibliography and unpublished track/poem variants are
deferred, not invented defects. Theme has no site type-badge or audio-renderer API.


The implemented manifests bind 14 theme examples (4 in 4A) and 25 site examples
(4 in 4A), including 11 real production compositions. The browser suite contains
44 scenarios: 37 ordinary assertions and seven explicit expected failures. The
latter preserve canonical expectations rather than asserting incorrect production
behavior as a success. An unexpected pass requires re-inspection of the finding.

| Finding | Classification | Evidence / disposition |
|---|---|---|
| 4B-F1 | implementation defect, MAJOR | Generic theme fenced code expands 320/390 pages to 543px. Reproduced on an ordinary generic-post in a disposable baseline theme build. Four JS/no-JS expected failures retain the no-page-overflow assertion; isolated reference context prevents distorting other examples. No CSS fix. |
| 4B-F2 | implementation defect, MAJOR | At 390, `:` opens dc-prompt logically but production CSS hides even `[open]`; input is unusable. One expected failure retains the prompt usability assertion. Narrow prompt branch stops at evidence; no replacement interaction/design decision. |
| 4B-K6 / W0021 | implementation defect, MAJOR | Real native track audio has focus, yet `/` opens palette and `?` opens help. Two expected failures retain the media-focus guard assertion. Existing W lifecycle unchanged. |

These findings require disposition before 4C; coverage implementation does not
approve the production behavior. W0017, W0001, focus color, reader identity and
W0020 future keyboard alignment remain explicitly linked in manifests, with no
production repair or new design choice. Phone Library mode-switch is hidden by
existing CSS; native list/table URLs remain usable and are tested independently.
Prompt completion is verified at 1440; its unusable 390 path is the recorded finding.

All screenshots/attachments remain in disposable test outputs. Native-control,
forced-colors table and print table regions are useful geometry/state evidence,
but no retained visual baseline is introduced: frozen fonts/data alone do not make
browser/platform rendering a canonical golden. Full-page prose is not snapshotted.

## Redaction (W0009)

`site.redaction-contract` checks real HTML/feed fragments and builds disposable
Hugo fixtures against the production shortcode. It rejects bodies, originals
in parameters, legacy exact-length inputs, unknown keys, invalid word buckets
and row percentages. Only geometry is stored: `words="2 6 4"`, with `;` for
block rows and `|` for paragraphs; optional `lines="100,80"` assigns row widths.
No original or encoded text belongs in these parameters.

`browser.redaction` runs the same fixtures with the real built stylesheet and
unchanged CSP header, plus `/library/skver`. The Chromium matrix covers 390 and
1440 px, JS/no-JS, 200% font size, screen, print and forced-colors. It verifies
open word gaps, row/paragraph structure, punctuation, line-height, no page
overflow, one accessible replacement and one visible print label per fragment.
Synthetic fixtures stay outside the repository and deployment output.

Run both through the Harness registry. The browser spec builds its own
disposable fixture through the static checker; it also runs in the ordinary
browser suite against that suite's built public directory.

W0062: `/library` is the full annotated catalog; List/Table share membership.
`/library/all` and `/library/all/` are exact HTTP 301 compatibility redirects
in generated `_redirects`, ahead of slash normalization. The local static
handler reads exact rules for browser parity; this does not verify deployment.
`library`, `--all`, and compatibility `--recent` open the catalog; `--music`
continues to open the Tracks page at the unchanged `/library/music` address.
List previews use real Description only and omit empty values; topics are
independent native links. Poetry descriptions retain the author's wording;
we do not parse RawContent/shortcodes or synthesize missing excerpts.
Native Table remains self-canonical, noindex and absent from the sitemap.
In-place mode changes preserve the original document h1/head (including
canonical/robots/schema), as before; panels, URL, prompt, mode current state,
Back/Forward and the visible skip target follow the selected mode. Refresh
loads that mode's server document. Browser cases assert both arrival paths.

Library metadata (W0081): `browser.library-geometry` checks the visible text gap
between type and date, topics after real previews, native type/topic targets,
capability data and the absence of List durations with JS on/off. The media
metadata cases in `browser.enhancements` expect whole minutes in Table/Timeline
and publication metadata; the audio player retains exact seconds.
`site.capability-markers` rejects visual badges globally and missing/invalid
computed `data-capabilities` on material rows, including positive/negative
parser fixtures. Production geometry reference cases use this same policy.
