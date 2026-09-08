# Contract checks

Build the site, then run the checkers against `public/`:

```sh
hugo build --gc --minify --panicOnWarning --environment preview
python3 scripts/check-content-parity.py
python3 scripts/check-feed-contract.py
python3 scripts/check-uid-contract.py
python3 scripts/check-404-contract.py
python3 scripts/check-rel-me-contract.py
python3 scripts/check-url-contract.py
python3 scripts/check-schema-contract.py
python3 scripts/check-webmention-contract.py
python3 scripts/check-headers-contract.py
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

`check-headers-contract.py` reads `_headers` from the build and compares
security headers, `Cache-Control` classes, and coverage (every built file
falls into a class; HTML keeps the platform default; `immutable` only on
content-addressed URLs). HSTS is not expected yet.

With `--base-url` it also probes a running origin:

```sh
npx wrangler dev --port 8791
python3 scripts/check-headers-contract.py --base-url http://127.0.0.1:8791
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
takes minutes. Run it deliberately against a deployed origin:

```sh
python3 scripts/run-lighthouse.py
python3 scripts/run-lighthouse.py --fonts blocked
python3 scripts/run-lighthouse.py --base-url https://alexandr-sidorenko.me --indexable
```

Reports land in `tmp/lighthouse/<UTC timestamp>/`.
