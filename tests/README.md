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
```

The checker normalizes front matter, HTML provenance comments, Markdown hard-break
syntax, whitespace, and the intentional absolute-to-root-relative asset URL change.
It then compares each current body with its committed SHA-256 snapshot. If the
read-only `tmp/old_project` checkout is present, it also performs a live normalized
old/current body comparison.

The rendered snapshot counts `<br>` boundaries independently in page HTML, RSS,
and JSON Feed. Warning-gated publications retain their boundaries in page HTML
but intentionally expose no body breaks in feeds. The snapshot covers poem,
poetry collection, lyrics, prose link list, bibliography, and ordinary prose
soft-wrap fixtures. Global Goldmark `hardWraps` must remain disabled.

Reviewed intentional differences:

- `creativity/23`: the old same-origin absolute image URL is root-relative now.
- `creativity/skver`: the source-only provenance comment is excluded from the body
  comparison; it records that the legacy English source remains read-only and its
  former URL is neither published nor redirected.

The feed contract check parses RSS and JSON Feed, verifies that warning-gated
bodies are absent while page HTML retains them, compares warning-safe card/feed
summaries, rejects root-relative embedded URLs, and checks audio MIME and byte
length against the referenced static file. Plain publications remain full-text.

The UID contract check (see ADR `redesign-stable-uid-contract`) verifies every
publication's front-matter `uid` is unique and correctly formatted, and that
HTML `u-uid`, RSS `<guid isPermaLink="false">`, JSON Feed `id`, and JSON-LD
`@id` all agree with it — independently of `canonical`/`u-url`/`.Permalink`,
which stay tied to the current location URL instead.

The 404 contract check (T39) verifies `public/404.html` is Russian-titled
(not Hugo's built-in English default), carries `robots: noindex`, and has
no canonical link, Open Graph/Twitter tags, or JSON-LD — a not-found
response must not claim publication identity for a URL that doesn't exist.
It doesn't check the HTTP status itself; that's a property of the static
host (Cloudflare Workers Static Assets `not_found_handling: "404-page"`,
verified manually with `wrangler dev` — an unmapped path returns a real
404, not 200).

The rel=me contract check (T40) parses `data/links.yaml` for the full
approved URL set and asserts it appears as `rel=me` — a head-only `<link>`
or a visible `<a>`, never both for the same URL — on every representative
page (home, section, detail), with no missing entries and no unapproved
extras beyond the home page's own documented self rel=me.
