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

### Added

- Hugo-based site (Russian only, canonical URLs without a `/ru` prefix, no
  required JavaScript), replacing the removed Next.js codebase.
- All six original publications: two posts and four creativity works, the
  latter with audio players where applicable. Authored line breaks are
  preserved in page HTML and in feeds alike, and a body image declares its real
  dimensions so the text below it does not jump while it loads — one pointing
  at a file that isn't there fails the build instead of shipping without them.
- Attached recordings state how long they run before anyone presses play, and
  an author reading inside a publication now looks like what it is — one quiet
  line, `▶ Авторское чтение · 02:18`, and a control that stops short of the
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
- A cleanup service worker (`/sw.js`) that unregisters the old Workbox
  worker for returning visitors without touching Cache Storage.
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
  protocol before.
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
  No counts are published beyond the hours — the bars show shape, not scores.
- The command line in the top bar works. `:` opens it, and it takes the small
  vocabulary it has always displayed — `library`, `read`, `play`, `open`,
  `find`, `help` — completing material names as you type and going where it
  says. `find` opens the search palette with what you typed, `help` shows the
  keys. An unknown command is answered in one quiet line. Without JavaScript
  there is no input at all: the line stays what it was, a statement of where
  you are, and every destination remains a link away.
- The keyboard reaches the whole shell. Arrows and `j`/`k` walk a list of
  materials once focus is in it, Enter opens what is focused, `1`/`2` go to the
  sections, Esc goes back up, and `?` opens a sheet listing exactly the keys
  that work on the page in front of you. Every one of them has something to
  click instead. The status bar names the mode and the keys — and prints
  neither without JavaScript, where none of them exist.
- Search. A `/ search` button sits in the top bar and `/` opens the same
  palette from the keyboard: it looks through titles, bodies, types, topics and
  addresses, and shows the line around the match with the searched words
  highlighted in it and in the title, so a hit inside a long text says why it
  is a hit. Arrows and Enter work, Esc closes it, and focus returns
  to where it was. With JavaScript off there is no button, no field and no
  broken promise — the library, its views and the topic pages remain the way to
  everything, as they were. A redacted fragment is as absent from the search
  index as it is from the page.
- A clock in the top bar, reading as a machine timestamp: ISO 8601 with the
  visitor's own offset, counting the seconds it shows. It is absent below the
  top bar's breakpoint, where it would cost a whole row on a phone before any
  content is visible, and it stops counting whenever it is not on screen.
- One `activity/` pane on Home combines the last played track with the exact
  site revision and build time. Missing data removes its module rather than
  leaving an empty card, and an old build is labelled as a quiet snapshot,
  never live telemetry. The complete pane remains useful without JavaScript
  and makes no browser request outside the site.
- `/llms.txt`: the site as one Markdown map — a heading, a short description
  and a linked list of every publication with its summary — so a language model
  can read the structure in a single request instead of walking the sections.
  It is a map, not a second feed: bodies stay out. The URL contract check reads
  the file too, so the map cannot become the one place that publishes an
  address in the wrong form.
- Redaction. A publication can black out a fragment that carries a legal risk:
  the text is replaced by U+2588 blocks in the page, in both feeds and in
  `/llms.txt`. It is not hidden behind a control and not present in the markup
  — it is gone from the published source. A screen reader announces one word,
  «вымарано», instead of a run of blocks. Three fragments are redacted so far;
  every decision, including the ones to leave a fragment alone, is recorded in
  `data/redactions.yaml` with its ground, its date and the edition of the rules
  it was made under.

- Window labels speak one resource vocabulary: `site/`, `about.md`,
  `library/`, `activity/`. The command line still names actions and views.
  They agree in meaning and are not copies of each other.

- Home no longer pretends the missing footer is an open question. `neofetch`
  shows how long the site has been up and links to the repository; the
  activity `site` module links the deployed commit and still says when it was
  built; Recent carries the primary RSS; Library collections keep RSS and JSON
  Feed. Copyright stays machine-readable in the feeds and is not drawn on the
  shell — a human colophon is later work.

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
  reads title, then type, then date, then markers. Feed links in a section
  heading no longer sit against each other.

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
