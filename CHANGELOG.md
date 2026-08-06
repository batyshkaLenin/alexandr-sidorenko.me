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
- Full-text RSS and JSON Feed 1.1, site-wide and per section.
- Sitemap driven by real per-page `lastmod`, not build time.
- Open Graph and Twitter Card metadata, schema.org JSON-LD
  (ProfilePage/BlogPosting/CreativeWork), and microformats2 markup
  (h-card, h-entry, h-feed).
- Web app manifest, favicon and touch icons, and Webmention discovery.
- A cleanup service worker (`/sw.js`) that unregisters the old Workbox
  worker and clears its caches for returning visitors.

### Removed

- Legacy Next.js site source (components, pages, styles, build tooling and
  config) ahead of the Hugo rewrite.
