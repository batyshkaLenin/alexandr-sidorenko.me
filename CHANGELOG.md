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

### Changed

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
