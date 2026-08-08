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
- A repeatable Lighthouse run (`scripts/run-lighthouse.py`) over the
  representative pages in both form factors, with per-form-factor budgets and
  an option to blackhole the font CDN. It refuses to report a run that was
  collected wrong — snapshot mode, a mobile label without screen emulation, or
  a browser profile that let extensions in — because each of those produces
  numbers that look like the site and are not.
- Sign-in by domain name is announced again (`authorization_endpoint`,
  `token_endpoint`), alongside a `rel=sitemap` link, `application-name` and
  `apple-mobile-web-app-title`.
- Preview images now carry alternative text (`og:image:alt`,
  `twitter:image:alt`), and a publication that sets a cover without describing
  it fails the build instead of shipping an unreadable preview.

### Added

- `/llms.txt`: the site as one Markdown map — a heading, a short description
  and a linked list of every publication with its summary — so a language model
  can read the structure in a single request instead of walking the sections.
  It is a map, not a second feed: bodies stay out, and a publication behind a
  content warning is listed by title, warning and categories exactly as the
  feeds list it. The URL contract check reads the file too, so the map cannot
  become the one place that publishes an address in the wrong form.

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
- The top bar's clock reads as a machine timestamp — ISO 8601 with the
  visitor's own offset — and counts the seconds it shows, rather than printing
  a human date that refreshed every thirty seconds. It is gone entirely below
  the top bar's breakpoint, where it had cost a whole row on a phone before any
  content was visible, and it stops counting whenever it is not on screen.
- A list card names its content warnings in one caption — `cw: 18+, религия,
  зависимости` — instead of a separate badge per category, each repeating the
  `cw` prefix. This is how the publication page has framed them since the
  warning block was drawn to the mockup.
- Both author identities now have one approved public form, and every surface
  reads it from the same place: the byline and its h-card, the section card,
  RSS (which named no author at all before, and now carries `dc:creator`),
  JSON Feed (now with the author's address and avatar) and JSON-LD. The home
  page's Person node carries the full `rel=me` set as `sameAs`; publications
  point at that same node by `@id` instead of repeating twelve profile links
  on every page and in every section list.

### Removed

- Camera metadata from the published photographs. One of them announced the
  device its author owned, the camera application and the minute the shutter
  was pressed — `OPPO A54`, `MediaTek Camera Application`,
  `2021:11:20 16:44:59` — in 41KB that rode along with every request for a
  2.9MB file. The visible pixels are bit-identical: nothing is re-encoded, only
  the metadata segments are dropped. `scripts/check-image-metadata.py` now
  fails a build that carries Exif, XMP or IPTC, and refuses to pass an image
  format it cannot parse rather than skipping it quietly.

### Fixed

- Images in publication bodies now declare their real dimensions, so the text
  below them no longer jumps while they load. A body image pointing at a file
  that isn't there fails the build instead of shipping without them.
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
- A page now loads its avatar, audio and internal links from the address the
  reader actually opened. They were pinned to the production domain, so any
  other deployment — a preview build, a local server — fetched them across
  origins, down to a multi-megabyte audio file. Feed enclosures, preview
  images and structured data keep the absolute form they require.
- The music project "ППН" was described to machines as a person living at the
  site owner's own address: its structured data said `Person` and its byline
  linked to the personal home page. It is a `MusicGroup` now, with no address
  of its own — an approved absence rather than a default.
- The home page's h-card never carried the portrait. The photo sits in a
  neighbouring panel, outside the card, so a microformats parser saw a card
  with no photo at all.
- The content-warning control is a toggle again: pressing it once revealed the
  text and then hid the control itself, so a reader who opened a publication
  could not put it back under the blur — and, since the blur also decides what
  prints, could not keep it off the paper either.
- The main menu no longer wraps onto a second row on a phone, which had doubled
  the height of the header before any content was visible. A menu item is also
  a full-height tap target there now, rather than a 19px line of text.
- A visitor on a timezone that is not a whole number of hours from UTC saw it
  written as a decimal: Kathmandu read `UTC+5.75`. The clock now prints the
  offset the way the rest of the world writes it, `+05:45`.

### Removed

- Legacy Next.js site source (components, pages, styles, build tooling and
  config) ahead of the Hugo rewrite.
