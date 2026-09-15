# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).
The Hugo rewrite has no public release yet, so everything below sits under
`Unreleased` until the first one ships.

`Unreleased` is a delta against the Next.js site this one replaces — that is the
version a visitor still sees — and not a log of the rewrite's own development.
A defect introduced and fixed inside this same cycle never reached anyone, so it
is folded into the entry describing the finished behaviour rather than listed as
`Fixed`.

## [Unreleased]

### Changed

- Machine-only identity URLs on Home, author bylines and publications without
  a visual meta line are no longer keyboard tab stops; `u-url`, document-level
  `rel=me` and microformats parsing stay intact.
- Printing a publication yields a paper document: site chrome, TOC, tags,
  responses and relations are omitted; dithered figures use the original
  photograph without an empty caption box; type is black (and a quiet gray
  for interlinear translation); `@page` margins and a block flow keep later
  pages from clipping.
- The Home name is the page `<h1>`. The duplicate visually-hidden site-title
  heading is gone.
- The compact shell holds through 740px, so the two-row header does not appear
  in the band where prompt, help and indices do not yet fit.
- Home location and socials share a line when they fit, then wrap as
  location / socials, then each on its own line.
- Library view tabs keep a reserved caret column, so switching the current
  view does not shift the row.
- Publication relations, responses and adjacent hang as workspace chrome
  after the article, in the reading measure, not as a second pane. The
  publication header no longer repeats a `library` back link — the nav
  already has it. A material with a table of contents keeps its pane label
  on the article at 1100px, instead of sliding it over the site header.
- Publication tags are links to `/library/topics/…`. The type badge on a
  material is the type page, the same destination as on `/library/types`.
- Interface dates are `DD.MM.YYYY`.
- Poems, lyrics, parallel translation and `{.dc-verse}` share one verse
  measure.
- Home has no neofetch pane: after GitHub and ROLE left, the leftover
  block was empty. Home has three layouts: a phone stacks portrait,
  `about.md`, `library/` and `activity/`; a tablet keeps portrait beside
  `about.md` at the same height and puts `library/` beside `activity/`
  stacked as a column; a wide screen is portrait beside `about.md` at
  the same height, then `library/` across the full width, `activity/`
  under both. The photo pane hugs the square and stays modest.
  `about.md` uses the shell type size on every stage — filling the pane
  is layout, not a larger tablet size. Recent stays three scan lines;
  the tablet `library/` pane hugs those lines instead of stretching to
  `activity/`. The description sits in the gap between title and TYPE,
  marked off with the same `·` as TYPE · DATE, and hides as soon as the
  title would lose the scan line. The socials line is a comment, like
  location.
- A relation group with no resolved targets is omitted; incoming links
  still show as backlinks.

- Library list and publication pages share one workspace: a 150px rail track
  and a wide document pane, collapsing together below 1101px. Article contents
  stay a single `#TableOfContents` in the document; wide CSS only draws that
  node into the Library sidebar slot, and a phone keeps the same node as a
  closed `toc/` disclosure under the title.
- Ordinary publications no longer show an author card. The byline h-card,
  JSON-LD author and feeds stay in the document for machines.
- Markdown images use a default figure slightly wider than the reading
  measure. `{.wide}` and `{.full}` are explicit authoring choices, not a
  guess from file size.
- Publication metadata follows TYPE · published date; a duplicate created
  date is not shown on the visual line.
- The app chrome is English: status bar, type badges (`READ · FICTION`),
  counts (`1 material` / `N materials`), keys, help, search, 404 and the
  other shell strings. Publication titles, bodies, dates, type-page headings
  (`Статьи`) and responses stay Russian. English chrome islands carry
  `lang="en"`; the document stays `ru-RU`.
- Workers Builds / PR gate entry is now `scripts/ci.sh` (`build.sh` then
  `validate.sh`), wired from `wrangler.jsonc` with `preview_urls` enabled and
  Wrangler pinned in `package.json` for Git integration. Hugo is pinned as
  `hugo` in `.tool-versions` so the Builds asdf installer accepts the file;
  `build.sh` still downloads that version's extended binary.

### Added

- A stable `/key.pub` endpoint with HTML discovery and an RFC 9116
  `/.well-known/security.txt` that publishes the monitored security contact,
  preferred languages, encryption key and a manually maintained expiry date.
- Hugo-based site (Russian only, canonical URLs without a `/ru` prefix, no
  required JavaScript), replacing the removed Next.js codebase.
- Migrated publications from the previous site (posts and creativity works),
  the latter with audio players where applicable. Authored line breaks are
  preserved in page HTML and in feeds alike, and a body image declares its real
  dimensions so the text below it does not jump while it loads — one pointing
  at a file that isn't there fails the build instead of shipping without them.
- A `talk` type for guest appearances, interviews and later talks: chrome
  `TALK`, the collection «Выступления», and a source link in the header
  around a link-first media facade. Two ITChatter episodes with Sergey
  Grechishnikov are in the library; their privacy-enhanced YouTube players
  load only after an explicit click, while no-JS, feeds and print keep links.
  The same facade lets four music notes play their subject from YouTube; the
  Zelda note links the full playlist and embeds its first track.
- Publications that were not on the previous site: music notes, two poems, and
  a Vienna gonzo piece, plus a type page for notes.
- Attached recordings state how long they run before anyone presses play, and
  an author reading inside a publication now looks like what it is — one quiet
  line, `▶ Author reading · 02:18`, and a control that stops short of the
  text column instead of spanning it. Nothing preloads and nothing autoplays.
- Video as a block inside a publication: a dithered poster, the browser's own
  controls, optional captions and a caption line. It needs no JavaScript and
  loads nothing until the reader asks for it.
- A picture can now carry a credit as well as a caption, and several pictures
  can stand together as a gallery — an editorial sequence of two or three
  columns that becomes one on a phone, where every image keeps its own
  alternative text, its own caption and its own link to the original.
- A table inside a publication reads as part of the text: the body type, quiet
  rules and nothing to click. The column alignment written in Markdown now
  actually applies — it used to ship as an inline style that the site's own
  Content-Security-Policy discarded — every header cell says which column it
  heads, and a table too wide for a phone scrolls inside its own box, which
  the keyboard can reach and a screen reader announces, instead of dragging
  the page sideways.
- A quoted song can carry a synchronous translation as two languages, not as
  `//` on the page: the original sits directly above its translation, each
  line marked with its own `lang`, the same order on a phone as on a wide
  screen, and no JavaScript.
- Mathematics. A publication can set formulas — inline between `\(` and `\)`,
  display between `$$` and `$$` — and they are rendered to MathML while the site
  is built: inline and display, numbered equations, matrices, multi-line
  alignments, nested fractions and expressions too wide for a phone, which
  scroll inside their own block instead of stretching the page. No client-side
  renderer, no external script and not one new font file: the formulas are set
  in the reader's own maths font, and where there is none they keep their
  structure in the body serif.
- Footnotes read in both directions: the mark in the text and the way back are
  both links, both reachable by keyboard, and whichever end the reader lands
  on is marked so the line is findable.
- Footer social links and an environment-aware `robots.txt` that disallows
  crawling outside production builds.
- Cloudflare Workers Static Assets preview deployment.
- A reproducible preview build (`./build.sh`) that installs Hugo Extended from
  `.tool-versions` (`0.165.0`), verifies the theme gitlink, and rejects invalid
  site config or library front matter before the pages are written.
- An offline semantic validation suite (`./scripts/validate.sh`) that reuses the
  existing contract checkers after a build, aligns feed and schema fixtures
  through one representative manifest, and fails on broken internal targets or
  a noindex page that leaks into the sitemap.
- A local release command (`./scripts/release-local.sh`) that chains semantic
  validate, filesystem artifact budgets (S15/T69), a pinned Chromium Playwright
  suite (JS on/off, keyboard, runtime axe), and Lighthouse — with LCP/TBT/CLS as
  the pass/fail gates and the performance score kept diagnostic. Browser tooling
  stays off Workers Builds.
- RSS and JSON Feed 1.1, site-wide and per section, with full publication
  text, absolute media URLs and complete audio attachment metadata.
- Sitemap driven by real per-page `lastmod`, not build time. A publication
  shows `# updated: …` when its `lastmod` differs from its publication date,
  and stays silent when it doesn't.
- Open Graph and Twitter Card metadata, schema.org JSON-LD
  (ProfilePage/BlogPosting/CreativeWork), and microformats2 markup
  (h-card, h-entry, h-feed). Preview images carry alternative text, and a
  publication that sets a cover without describing it fails the build instead
  of shipping an unreadable preview.
- Structured data for every indexable page kind, not just the home page and
  the publications: the sections, the topic list and each topic describe
  themselves (`Blog`/`CollectionPage`) and embed the same publications, in the
  same order, that their visible list shows. Everything below the home page
  also carries a `BreadcrumbList` with absolute URLs. The music project "ППН"
  is a `MusicGroup` with no address of its own, not a person living at the
  site owner's address.
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
- Web app manifest, favicon and touch icons, and Webmention discovery.
- Sign-in by domain name is announced again (`authorization_endpoint`,
  `token_endpoint`), alongside a `rel=sitemap` link, `application-name` and
  `apple-mobile-web-app-title`.
- A navigation-only service worker (`/sw.js`) that keeps recently visited
  documents available offline and falls back to a self-contained `/offline`
  page, while leaving every subresource — including audio — to the network.
  Precache accepts Hugo's live-server hop from `/offline` to `/offline/` as
  the same document, so install no longer throws in local development.
- Server-side syntax highlighting for code blocks (Hugo's own Chroma, no client
  JavaScript and no external script), colored so that every kind of token is
  told apart without turning the block into a rainbow, and without borrowing
  the two colours the interface already spends on system state and links. Code
  comes in two forms: a plain snippet, and — when the fence names a file or
  carries a caption — a block that shows the file name, numbers its lines and
  signs itself with the language, with the numbers staying in place while a
  long line scrolls under them. Added and removed lines of a diff are readable
  in grayscale, by their own `+`/`-` and by a rule in the margin.
- Heading anchors in publication bodies: reachable by keyboard, named for a
  screen reader, revealed on hover or focus.
- A dithered photograph swaps to the original where it stands, and back —
  by the same link that used to open it as a page, or with `o`. The link still
  works with JavaScript off, and nothing moves when the picture changes: it is
  the same photograph at the same size.
- The library's list and table are two modes of one view rather than two
  destinations: switching is instant and the address follows, so a copied link
  opens what was on screen, Back returns to the previous mode, and the prompt
  and status line say which mode it is. Without JavaScript they stay two
  ordinary links to two pages. A phone is not offered the table at all — its
  columns only fit sideways there.
- Feeds for each material type and each topic, beside the site-wide one: a
  reader who only wants the poems, or only what touches one topic, can follow
  exactly that. All of them are full-text, and every page announces its own in
  the head, so a reader's client finds them without being told.
- Responses under a publication are sorted by what they are: answers with their
  text, mentions that only say someone linked here, and a count of likes and
  reposts once there are enough of them to crowd the page. A quote is trimmed to
  a couple of lines — enough to recognise a response, not to reprint it. Nothing
  is fetched from anyone else's server to show them, and no avatars are pulled.
  Under it, instead of a comment box that would go nowhere: answer on your own
  site and send a Webmention, with the publication's permanent address written
  out, copyable in one click, and two links for anyone who has not met the
  protocol before. Incoming responses attach to the material's identity rather
  than to one spelling of its address, so canonical, permanent and recorded
  historical URLs converge on the same publication. A response aimed at a text
  fragment records the uniquely resolved quote and the material snapshot seen
  during moderation; a missing or ambiguous fragment stays a document-level
  response instead of claiming the wrong passage. The stored quote and capture
  date are shown with the response; when the same passage is still uniquely
  identifiable, an ordinary link lets the browser highlight it in the current
  text, while stale or ambiguous quotes remain readable without a false link.
- A publication can show its own connections: what it is part of, what it
  cites, what it relates to — and, underneath, which other materials on this
  site point back at it. Both directions are ordinary links, grouped by the
  kind of relation, and resolved by the material's identity rather than its
  current address, so renaming a page does not break them. A material with
  nothing to show prints nothing. These are not Webmentions: replies from
  other sites stay in their own block.
- The activity panel gained a third module: how many hours went into code this
  week, and a small graph of how the days compared. The hours come from the
  build's own snapshot; the graph refreshes itself from a public endpoint when
  JavaScript is available and otherwise stays as the build left it. Hovering
  any line says which service the numbers came from and when they were taken.
  The hours link and the graph are spaced so a finger can hit one without the
  other. No counts are published beyond the hours — the bars show shape, not
  scores.
- The command line in the top bar works. Until it is opened the line keeps a
  blinking `_`, so it looks like a place to type; once the real caret is in,
  that mark is gone. `:` opens it, and it takes the small vocabulary it has
  always displayed — `library`, `read`, `play`, `open`, `find`, `help` —
  completing material names as you type and going where it says. `find` opens
  the search palette with what you typed, `help` shows the keys. An unknown
  command is answered in one quiet line. Without JavaScript there is no input
  at all: the line stays what it was, a statement of where you are, and every
  destination remains a link away. The `_` still sits on that static line.
- The keyboard reaches the whole shell. Arrows and `j`/`k` walk a list of
  materials once focus is in it, Enter opens what is focused, `1`/`2` go to the
  sections, Esc goes back up, and `?` opens a sheet listing exactly the keys
  that work on the page in front of you. Every one of them has something to
  click instead — except on a phone, where those keys are not advertised:
  there is no command line to type into, so Help and the digit prefixes stay
  off the chrome. The status bar names the mode and the keys — and prints
  neither without JavaScript, where none of them exist.
- Search. On a wide screen a `/ search` button sits in the top bar; on a phone
  a compact bordered `search` control shares one row with `home` and
  `library`, named `Search the site` for assistive tech. `/` opens the
  same palette from
  the keyboard: it looks through titles, bodies, types, topics and
  addresses, and shows the line around the match with the searched words
  highlighted in it and in the title, so a hit inside a long text says why it
  is a hit. On a phone the field is 16px so Safari does not auto-zoom, and a
  match wraps instead of being clipped as a broken token. Arrows and Enter
  work, Esc closes it, and focus returns
  to where it was. With JavaScript off there is no button, no field and no
  broken promise — the library, its views and the topic pages remain the way to
  everything, as they were. A redacted fragment is as absent from the search
  index as it is from the page. A result found specifically in a material's body
  now opens the matching passage through an ephemeral Text Fragment when the
  match is unique or its context disambiguates it; titles, paths and uncertain
  body matches keep the canonical page address.
- A clock in the top bar, reading as a machine timestamp: ISO 8601 with the
  visitor's own offset, counting the seconds it shows. It is absent below the
  top bar's breakpoint, where it would cost a whole row on a phone before any
  content is visible, and it stops counting whenever it is not on screen.
- One `activity/` pane on Home combines the last played track with the exact
  site revision and build time. Missing data removes its module rather than
  leaving an empty card, and an old build is labelled as a quiet snapshot,
  never live telemetry. The complete pane remains useful without JavaScript
  and makes no browser request outside the site.
- `/llms.txt`: a Markdown map of the site — a heading, a short description
  and the library entry points a language model should start from, plus
  the feeds and protocol files where the rest lives. It is not an inventory
  of publications and not a second feed: bodies stay in HTML, RSS and JSON
  Feed. The URL contract check reads the file too, so the map cannot become
  the one place that publishes an address in the wrong form.
- Redaction. A publication can black out a fragment that carries a legal risk:
  the text is replaced by U+2588 blocks in the page and in both feeds. It is
  not hidden behind a control and not present in the markup — it is gone from
  the published source. A screen reader announces one word, «вымарано»,
  instead of a run of blocks. Three fragments are redacted so far; every
  decision, including the ones to leave a fragment alone, is recorded in
  `data/redactions.yaml` with its ground, its date and the edition of the
  rules it was made under.

- Window labels speak one resource vocabulary: `about.md`, `library/`,
  `activity/`. The command line still names actions and views.
  They agree in meaning and are not copies of each other.

- Home no longer pretends the missing footer is an open question. Wide Home
  is two columns for identity: portrait beside `about.md`, then `library/`
  across the full width, `activity/` under both. The portrait keeps its full
  square frame in a capped left column. The file tree `site/` is gone —
  `about.md` and `library/` already have panes and `[1] home` / `[2] library`
  on a keyboard-capable shell. On a
  phone the first screen is the portrait, then
  `about.md`, `library/` and `activity/`; the same stack holds on a short
  landscape phone and on a portrait tablet, because Home follows its own
  inline width rather than a device class. Two columns begin around `56rem`
  of that width: portrait beside `about.md`, `library/` full-width below,
  `activity/` under both. Compact header chrome (`search` without the slash,
  no digit prefixes, no Help, no prompt) is
  a separate contract for phone portrait and short landscape; an iPad
  portrait keeps `/ search` / help. Neighbouring Home panes size themselves;
  the grid only places them. `about.md` keeps a reading measure on a very
  wide pane. A narrow `library/` pane gives each title its own line, with
  type and date underneath, instead of clipping the title under the
  metadata. The visible self URL stays out of the way, while canonical,
  microformat and JSON-LD identity are unchanged. The activity
  `site` module links the deployed commit and still says when it was built;
  Recent carries the primary RSS; Library collections keep RSS and JSON
  Feed. Copyright stays machine-readable in the feeds and is not drawn on
  the shell — a human colophon is later work.

- Every internal address the site publishes — links, `canonical`, `og:url`,
  microformats `u-url`, sitemap, RSS, JSON Feed, and JSON-LD — now uses a
  single form without a trailing slash (the root stays `/`), so a page no
  longer declares a canonical URL that the host answers with a redirect.
- Typography is now the site's own rather than whatever monospace the visitor
  happens to have: Fira Code for the interface, PT Serif for publication
  bodies, both from Google Fonts with `display=swap` and a full system
  fallback. With the fonts blocked the layout stays put — panel heights move
  by at most 0.7%.
- Prose measures `65ch` (character-width aware, so Cyrillic gets a comfortable
  line length the way a fixed pixel width didn't), base font size is raised for
  long-form reading, and `prefers-reduced-motion` is respected.
- Section pages carry a visible heading with links to their own RSS and JSON
  Feed. Blog cards gained a `read →` affordance that adds no second link to the
  same address.
- Printing a publication now yields the publication: no shell header with its
  live clock, no navigation, no footer, no command labels. A page with audio
  prints the recording's name, its length and its address in place of the dead
  player control, and a video prints its poster and address instead of the
  empty rectangle a `<video>` leaves on paper.
- The 404 response speaks the site's own language: `$ cd ./unknown`,
  `404: bash: cd: no such file or directory`, and a `$ ls /` list of the root
  sections built from the main menu.
- Both author identities have one approved public form, and every surface
  reads it from the same place: the byline and its h-card, the section card,
  RSS (which named no author at all before, and now carries `dc:creator`),
  JSON Feed (now with the author's address and avatar) and JSON-LD. The home
  page's Person node carries the full `rel=me` set as `sameAs`; publications
  point at that same node by `@id` instead of repeating twelve profile links
  on every page and in every section list.
- The home page biography carries its original closing paragraph again. Its
  outgoing link does not come back: `blur.tech` is no longer a registered
  domain, so Blurred Technologies is named in plain text rather than linked to
  whoever registers it next.
- Topics live inside the library, at `/library/topics` and
  `/library/topics/<topic>`, the way Types already live under `/library/types`.
  A type's own page and the Types grouping name the type in the plural —
  «Статьи», «Стихи», «Треки» — from a second vocabulary entry, because Russian
  plurals are not a suffix and «Проза» is a mass noun. On a type page the
  per-row type mark is omitted: the heading already said what the list is. A
  topic keeps it, because one topic spans several types. Types and Topics use
  the same library chrome as the other views, including which item in the view
  list is current.
- A dense library row — Music, a Types group, a type page, a topic page —
  reads title, then type, then date, then markers. On a phone that becomes
  two zones, title with markers then type and date, instead of tearing the
  line. Library views on a narrow screen stay one row and scroll sideways,
  with an edge fade only while there is overflow to that side and the
  current view kept in sight. The chronology view places each event on one
  shared vertical axis on the phone as well as on the desktop.
  Feed links in a section heading no longer sit against each other.
- `/library/table` is a bookmark, not a search result: it carries
  `noindex` and is omitted from the sitemap, while the `[table]` switch
  stays an ordinary link.
- Capability markers on a library row follow a fixed order — audio, then
  code, math, image, gallery, video — instead of the alphabet of their
  keys, so mathematics sits with code rather than after a photograph.
- Home portrait replaced; dither derivatives regenerated under the ordinary
  adaptive hue ladder. Theme gitlink advanced to the Declassified packaging
  cleanup (English exampleSite, optional-JS positioning, dated theme
  changelog).
- Site sources, scripts and `tests/README.md` no longer cite task IDs, ADR
  filenames or design-system paragraph numbers in comments and docs.

### Removed

- Content warnings, in every form: the taxonomy, the block above a publication,
  the gate that blurred the body, the category caption on cards, and the
  withholding of a warned body from RSS, JSON Feed and `/llms.txt`. All four
  creativity publications deliver their full text on every surface. The site
  carries no age marking either. What used to be warned about is either
  redacted out of the text or left in it deliberately.
- Camera metadata from the published photographs. One of them announced the
  device its author owned, the camera application and the minute the shutter
  was pressed — `OPPO A54`, `MediaTek Camera Application`,
  `2021:11:20 16:44:59` — in 41KB that rode along with every request for a
  2.9MB file. The visible pixels are bit-identical: nothing is re-encoded, only
  the metadata segments are dropped. `scripts/check-image-metadata.py` now
  fails a build that carries Exif, XMP or IPTC, and refuses to pass an image
  format it cannot parse rather than skipping it quietly.
- Legacy Next.js site source (components, pages, styles, build tooling and
  config) ahead of the Hugo rewrite.
- The publication `humility-and-open-mindedness` and its attached images.
- HTML migration provenance comments from publication markdown; the content
  parity check no longer requires them.

### Security

- Pinned Wrangler is 4.131.2, so the Workers Builds toolchain uses sharp
  0.35.4 and is no longer on the libheif advisory.
