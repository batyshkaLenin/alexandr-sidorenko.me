# Content parity checks

Build the site and verify the six migrated publication bodies and their semantic
line breaks:

```sh
hugo build --gc --minify --panicOnWarning --environment preview
python3 scripts/check-content-parity.py
```

The checker normalizes front matter, HTML provenance comments, Markdown hard-break
syntax, whitespace, and the intentional absolute-to-root-relative asset URL change.
It then compares each current body with its committed SHA-256 snapshot. If the
read-only `tmp/old_project` checkout is present, it also performs a live normalized
old/current body comparison.

The rendered snapshot counts `<br>` boundaries independently in page HTML, RSS,
and JSON Feed. It covers poem, poetry collection, lyrics, prose link list,
bibliography, and ordinary prose soft-wrap fixtures. Global Goldmark `hardWraps`
must remain disabled.

Reviewed intentional differences:

- `creativity/23`: the old same-origin absolute image URL is root-relative now.
- `creativity/skver`: the source-only provenance comment is excluded from the body
  comparison; it records that the legacy English source remains read-only and its
  former URL is neither published nor redirected.
