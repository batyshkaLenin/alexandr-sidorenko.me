# Content parity checks

Build the site and verify the six migrated publication bodies and their semantic
line breaks:

```sh
hugo build --gc --minify --panicOnWarning --environment preview
python3 scripts/check-content-parity.py
python3 scripts/check-feed-contract.py
python3 scripts/check-uid-contract.py
python3 scripts/check-404-contract.py
python3 scripts/check-rel-me-contract.py
python3 scripts/check-url-contract.py
python3 scripts/check-schema-contract.py
```

The checker normalizes front matter, HTML provenance comments, Markdown hard-break
syntax, whitespace, and the intentional absolute-to-root-relative asset URL change.
It then compares each current body with its committed SHA-256 snapshot. If the
read-only `tmp/old_project` checkout is present, it also performs a live normalized
old/current body comparison.

The rendered snapshot counts `<br>` boundaries independently in page HTML, RSS,
and JSON Feed. Since T92 removed content warnings, every publication carries the
same count in all three: nothing is held back from a feed any more. The snapshot
covers poem, poetry collection, lyrics, prose link list, bibliography, and
ordinary prose soft-wrap fixtures. Global Goldmark `hardWraps` must remain disabled.

Reviewed intentional differences:

- `creativity/23`: the old same-origin absolute image URL is root-relative now.
- `creativity/skver`: the source-only provenance comment is excluded from the body
  comparison; it records that the legacy English source remains read-only and its
  former URL is neither published nor redirected.
- `creativity/skver` and `creativity/humility-and-open-mindedness`: their bodies
  are no longer the old site's bodies. S17 redacted the carrier of a legal risk
  out of each — the instrument of use in one, the combination of conditions in
  the other — and the redaction is what the reader now sees, as U+2588 blocks.
  Both carry `redacted_from_legacy` in the fixture with the reason and the
  ledger id, which waives the live old/current comparison for them and nothing
  else: the committed body snapshot still pins each body, so an unintended edit
  still fails the check. What was removed is recorded in the private vault
  (`.ai/redactions/originals.md`) and never in this repository; the decisions
  themselves are in `data/redactions.yaml`.

The feed contract check parses RSS and JSON Feed, verifies that every body
reaches both feeds and the page, compares each card summary against the
publication's own description, rejects root-relative embedded URLs, and checks
audio MIME and byte length against the referenced static file.

The UID contract check (see ADR `redesign-stable-uid-contract`) verifies every
publication's front-matter `uid` is unique and correctly formatted, and that
HTML `u-uid`, RSS `<guid isPermaLink="false">`, JSON Feed `id`, and JSON-LD
`@id` all agree with it — independently of `canonical`/`u-url`/`.Permalink`,
which stay tied to the current location URL instead. Since T56 both use the
no-trailing-slash form, their current values match byte for byte; the uid is
still authored front matter that survives a move, not a derived value.

The URL contract check (T56, ADR `redesign-canonical-url-policy`) collects
every internal address the build emits — HTML `href`/`src`, URL-bearing
`<meta>`, `canonical`, `og:url`, MF2 `u-url`, `sitemap.xml`, RSS, JSON Feed,
JSON-LD, and `site.webmanifest` — and fails on any trailing slash outside the
root. It then requires all representations of one page (`canonical`, `og:url`,
`u-url`, sitemap `<loc>`, RSS `<link>`, JSON Feed `url`, JSON-LD
`url`/`mainEntityOfPage`) to be the same byte string. Templates get that form
from the `canonical-url.html` partial; the theme's own menu, taxonomy and term
templates are overridden in `layouts/` for the same reason, since the policy
belongs to this site, not to the theme. Verified by reverting a template to
bare `.Permalink`/`$item.URL`: the check fails and names the file and place.

The 404 contract check (T39) verifies `public/404.html` is Russian-titled
(not Hugo's built-in English default), carries `robots: noindex`, and has
no canonical link, Open Graph/Twitter tags, or JSON-LD — a not-found
response must not claim publication identity for a URL that doesn't exist.
It doesn't check the HTTP status itself; that's a property of the static
host (Cloudflare Workers Static Assets `not_found_handling: "404-page"`,
verified manually with `wrangler dev` — an unmapped path returns a real
404, not 200).

The schema.org contract check (T46) covers what a green validator does not:
that each page carries *exactly* the nodes it should. `schema-contract.json`
states them page by page — the expected block types in order, the section/tag
list property and its member URLs, the breadcrumb trail, and the properties
that must be present — so a publication quietly losing its `BlogPosting`, or a
page growing a node nobody asked for, fails the check. The embedded list is
also compared with the visible one: same links, same order.

Validity itself is checked against a committed copy of the schema.org
vocabulary (`schema-org-vocabulary.json`, refreshed by
`scripts/fetch-schema-vocabulary.py`, which is the only part that needs
network access): every type and property must exist, every property must be
allowed on the type it sits on, and every value must match the property's
range, with site URLs additionally required in the canonical no-trailing-slash
form. Verified by breaking each rule in turn — a dropped `headline`, an
invented property name, `blogPost` on a `CollectionPage`, a list sorted the
other way, a missing `BreadcrumbList`, an undescribed page, a trailing slash —
each one fails and names the page and place.

The rel=me contract check (T40) parses `data/links.yaml` for the full
approved URL set and asserts it appears as `rel=me` — a head-only `<link>`
or a visible `<a>`, never both for the same URL — on every representative
page (home, section, detail), with no missing entries and no unapproved
extras beyond the home page's own documented self rel=me.

## Lighthouse

`scripts/run-lighthouse.py` is not part of the list above: it needs the
network and a Chrome binary, and takes minutes. Run it deliberately, against
a deployed origin:

```sh
python3 scripts/run-lighthouse.py                      # preview, 5 pages × 2 form factors
python3 scripts/run-lighthouse.py --fonts blocked      # with the font CDN blackholed
python3 scripts/run-lighthouse.py --base-url https://alexandr-sidorenko.me --indexable
```

Reports land in `tmp/lighthouse/<UTC timestamp>/`, and the script prints a
table plus every budget violation. It also fails when the run itself was
collected wrong — snapshot mode, a mobile form factor without screen
emulation, or a browser profile that let extensions in — because each of
those silently invalidated the 8 August 2026 baseline. Findings and the
reference numbers: `.ai/research/lighthouse-preview-baseline.md`.
