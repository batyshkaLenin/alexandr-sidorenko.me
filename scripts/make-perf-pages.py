#!/usr/bin/env python3
"""Build three copies of one real page that differ only in how fonts arrive (T69).

The local measurement rig serves HTTP/1.1, and that quietly rigged the font
comparison: Google's files sit on a second origin and therefore get their own
connection pool, while self-hosted ones queue behind the page's own images on
a six-connection limit. Over HTTP/2 — which is what Cloudflare answers — every
same-origin resource shares one multiplexed connection with priorities, and the
result can go the other way.

So the arms have to be measured where the site actually lives. These pages are
deployed to the preview and measured there:

    /perf/google.html    the current arrangement, fonts from fonts.googleapis.com
    /perf/selfhost.html  the same faces served from this origin
    /perf/nofonts.html   no web fonts at all, the ADR's degradation path

Everything else is byte-identical: same body, same images, same stylesheets, one
real publication page copied three times. `selfhost.html` carries the @font-face
rules inside a copy of the site's own stylesheet rather than in a separate file,
because a separate file would reintroduce the very second hop self-hosting is
meant to remove.

This is measurement scaffolding, not part of the site. It runs deliberately
after `hugo build`, never from `build.sh`, and the pages it writes carry
`noindex` and no canonical, so they stay out of the URL contract and out of
search results. Delete `public/perf/` to be rid of them.

    hugo build --gc --minify --environment preview
    python3 scripts/make-perf-pages.py --fonts <dir with woff2 + faces.json>
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

SOURCE_PAGE = "creativity/skver/index.html"

PRECONNECTS = re.compile(r"<link rel=preconnect href=https://fonts\.(?:googleapis|gstatic)\.com[^>]*>")
GOOGLE_CSS = re.compile(r'<link rel=stylesheet href="https://fonts\.googleapis\.com/css2[^"]*">')
SITE_CSS = re.compile(r"(<link rel=stylesheet href=)(/css/site\.min\.[0-9a-f]+\.css)( integrity=\"[^\"]+\")(>)")
CANONICAL = re.compile(r"<link rel=canonical[^>]*>")
OG_URL = re.compile(r"<meta property=og:url[^>]*>")
JSON_LD = re.compile(r"<script type=application/ld\+json>.*?</script>", re.S)


def sri(data: bytes) -> str:
    return "sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


def neutralize(html: str) -> str:
    """A test page must not claim to be a real address.

    Without this the copies would carry the canonical URL of the page they were
    copied from, which `check-url-contract.py` reads as two pages declaring the
    same address — and a crawler would read as duplicate content.
    """
    html = CANONICAL.sub("", html)
    html = OG_URL.sub("", html)
    html = JSON_LD.sub("", html)
    return html.replace("<head>", "<head><meta name=robots content=noindex>", 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument(
        "--fonts",
        type=Path,
        required=True,
        help="directory holding the woff2 files and a faces.json describing them",
    )
    args = parser.parse_args()

    public = args.public_dir
    source = public / SOURCE_PAGE
    if not source.exists():
        print(f"{source}: build the site first", file=sys.stderr)
        return 1

    faces = json.loads((args.fonts / "faces.json").read_text(encoding="utf-8"))
    out = public / "perf"
    if out.exists():
        shutil.rmtree(out)
    (out / "fonts").mkdir(parents=True)

    for face in faces:
        shutil.copy2(args.fonts / face["name"], out / "fonts" / face["name"])

    html = neutralize(source.read_text(encoding="utf-8"))

    site_css = SITE_CSS.search(html)
    if not site_css:
        print("site stylesheet link not found — the head markup changed", file=sys.stderr)
        return 1

    # google: exactly what the site ships today.
    (out / "google.html").write_text(html, encoding="utf-8")

    # nofonts: the ADR's degradation path, no web fonts requested at all.
    stripped = GOOGLE_CSS.sub("", PRECONNECTS.sub("", html))
    (out / "nofonts.html").write_text(stripped, encoding="utf-8")

    # selfhost: the same faces, from this origin, declared inside a copy of the
    # site's own stylesheet so no extra request appears.
    rules = "".join(
        re.sub(r"\s+", " ", face["block"].replace(face["url"], f"/perf/fonts/{face['name']}")).strip()
        for face in faces
    )
    original = (public / site_css.group(2).lstrip("/")).read_bytes()
    combined = rules.encode("utf-8") + original
    digest = hashlib.sha256(combined).hexdigest()
    name = f"site-fonts.min.{digest}.css"
    (out / name).write_bytes(combined)
    selfhost = SITE_CSS.sub(
        lambda m: f'{m.group(1)}/perf/{name} integrity="{sri(combined)}"{m.group(4)}',
        stripped,
    )
    (out / "selfhost.html").write_text(selfhost, encoding="utf-8")

    total = sum((out / "fonts" / face["name"]).stat().st_size for face in faces)
    print(f"OK: /perf/{{google,selfhost,nofonts}}.html; {len(faces)} woff2, {total / 1024:.0f} KB; "
          f"self-host stylesheet {len(combined) / 1024:.1f} KB vs {len(original) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
