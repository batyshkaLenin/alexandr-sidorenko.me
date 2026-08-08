# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).
This project has no public releases yet, so entries are tracked under
`Unreleased` until the first Hugo-based release ships.

## [Unreleased]

### Added

- Hugo-based site (Russian only, canonical URLs without a `/ru` prefix, no
  required JavaScript), replacing the removed Next.js codebase.
- All six original publications: two posts and four creativity works, the
  latter with audio players and collapsible content-warning sections where
  applicable.
- Footer social links and an environment-aware `robots.txt` that disallows
  crawling outside production builds.
- Cloudflare Workers Static Assets preview deployment.
- RSS and JSON Feed 1.1, site-wide and per section, with full publication text
  where the content-warning policy permits it.
- Sitemap driven by real per-page `lastmod`, not build time.
- Open Graph and Twitter Card metadata, schema.org JSON-LD
  (ProfilePage/BlogPosting/CreativeWork), and microformats2 markup
  (h-card, h-entry, h-feed).
- Web app manifest, favicon and touch icons, and Webmention discovery.
- A cleanup service worker (`/sw.js`) that unregisters the old Workbox
  worker for returning visitors without touching Cache Storage.

### Added

- Server-side syntax highlighting for code blocks (Hugo's own Chroma, no client
  JavaScript and no external script), colored with the mockup's token palette.
- Heading anchors in publication bodies: reachable by keyboard, named for a
  screen reader, revealed on hover or focus.
- Structured data for every indexable page kind, not just the home page and
  the publications: the sections, the tag list and each tag now describe
  themselves (`Blog`/`CollectionPage`) and embed the same publications, in the
  same order, that their visible list shows. Everything below the home page
  also carries a `BreadcrumbList` with absolute URLs.
- A schema.org contract check that verifies the built site against a fixture of
  the expected nodes and against a committed copy of the schema.org vocabulary,
  so a page losing — or silently growing — structured data fails a test rather
  than a search engine's crawl.
- Sign-in by domain name is announced again (`authorization_endpoint`,
  `token_endpoint`), alongside a `rel=sitemap` link, `application-name` and
  `apple-mobile-web-app-title`.
- Preview images now carry alternative text (`og:image:alt`,
  `twitter:image:alt`), and a publication that sets a cover without describing
  it fails the build instead of shipping an unreadable preview.

### Changed

- A content warning now reads as one framed block: the short categories on the
  first line, the full disclaimers below them, and the reveal control inside
  the same frame — the way the mockup draws it. Feeds are unaffected: they keep
  the plain list of disclaimers.
- A page announces the wide preview card (`summary_large_image`) only when it
  actually has a cover; everything else asks for `summary` rather than framing
  a square avatar in a wide card.
- The manifest's `theme_color` and `background_color` now match the colour the
  page itself declares (`#05080a`) instead of the previous theme's `#070707`.
- Content warnings no longer gate the publication behind a disclosure the
  reader must open. The body renders open and the gate is laid over it, so
  without JavaScript the publication simply reads — the way the old site
  behaved. With JavaScript the body is blurred until "показать текст" is
  pressed, and the warnings themselves always show either way.
- Printing a publication now yields the publication: no shell header with its
  live clock, no navigation, no footer, no command labels. A page with audio
  prints the track name and its address in place of the dead player control,
  and a content warning left closed keeps its body off the paper — opening the
  disclosure before printing includes it.
- The 404 response speaks the site's own language: `$ cd ./unknown`,
  `404: bash: cd: no such file or directory`, and a `$ ls /` list of the root
  sections built from the main menu.
- A publication shows `# updated: …` when its `lastmod` differs from its
  publication date, and stays silent when it doesn't.
- Section pages carry a visible heading with links to their own RSS and JSON
  Feed, and list cards name the content warning's category ("18+", "религия")
  instead of an unlabeled `cw` badge. Blog cards gained a `read →` affordance
  that adds no second link to the same address.
- Typography is now the site's own rather than whatever monospace the visitor
  happens to have: Fira Code for the interface, PT Serif for publication
  bodies, both from Google Fonts with `display=swap` and a full system
  fallback. With the fonts blocked the layout stays put — panel heights move
  by at most 0.7%.
- Every internal address the site publishes — links, `canonical`, `og:url`,
  microformats `u-url`, sitemap, RSS, JSON Feed, and JSON-LD — now uses a
  single form without a trailing slash (the root stays `/`), so a page no
  longer declares a canonical URL that the host answers with a redirect.
- Prose now measures `65ch` (character-width aware, so Cyrillic gets a
  comfortable line length the way a fixed pixel width didn't), base font
  size raised for long-form reading, `prefers-reduced-motion` respected,
  and the print stylesheet no longer hides collapsed content-warning text.

### Fixed

- The home page biography lost its closing paragraph in the migration and now
  carries the original text again. Its outgoing link does not come back:
  `blur.tech` is no longer a registered domain, so Blurred Technologies is
  named in plain text rather than linked to whoever registers it next.
- Migrated poetry, lyrics, link lists, and bibliography entries now preserve
  their authored line breaks consistently in page HTML and in feeds where the
  publication body is permitted.
- RSS, JSON Feed, and publication cards now honor content warnings without
  leaking gated excerpts; feed media uses absolute URLs and complete audio
  attachment metadata when available.
- Byline username text failed WCAG AA contrast in light mode (~4:1) due
  to two stacked `opacity` values multiplying; now a single flat value
  with contrast well above 4.5:1 in both themes.

### Removed

- Legacy Next.js site source (components, pages, styles, build tooling and
  config) ahead of the Hugo rewrite.
