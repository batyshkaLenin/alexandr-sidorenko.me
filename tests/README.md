# Content parity checks

Build the site and verify the six migrated publication bodies and their semantic
line breaks:

```sh
hugo build --gc --minify --panicOnWarning --environment preview
python3 scripts/check-content-parity.py
python3 scripts/check-feed-contract.py
python3 scripts/check-uid-contract.py
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
- `posts/bluredu-new-teachers`, `creativity/skver` (T34): both used to open their
  body with a Markdown image identical to their front-matter `cover`, so the same
  photo rendered twice on the page. The cover now renders once, from front matter,
  with real intrinsic `width`/`height` (not a guessed fixed ratio) and an approved
  `cover_alt` — the now-redundant leading body image was removed from the content.
  A leading standalone image line is normalized away on both sides of the
  legacy/current comparison (a no-op for every other publication, which never had
  one), so the comparison still covers the actual prose. The cover no longer
  appears inside RSS/JSON Feed content either — consistent with every other
  publication, whose cover was already front-matter-only and never part of
  `.Content`.

The feed contract check parses RSS and JSON Feed, verifies that warning-gated
bodies are absent while page HTML retains them, compares warning-safe card/feed
summaries, rejects root-relative embedded URLs, and checks audio MIME and byte
length against the referenced static file. Plain publications remain full-text.

The UID contract check (see ADR `redesign-stable-uid-contract`) verifies every
publication's front-matter `uid` is unique and correctly formatted, and that
HTML `u-uid`, RSS `<guid isPermaLink="false">`, JSON Feed `id`, and JSON-LD
`@id` all agree with it — independently of `canonical`/`u-url`/`.Permalink`,
which stay tied to the current location URL instead.
