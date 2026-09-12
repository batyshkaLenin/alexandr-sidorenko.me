#!/usr/bin/env python3
"""Serve a built tree with the site's canonical URL shape (no trailing slash)."""

from __future__ import annotations

import argparse
import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from canonical_static import CanonicalHandler


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument(
        "--enable-sw-test-network-failures",
        action="store_true",
        help="close requests carrying the Service Worker browser-test header",
    )
    args = parser.parse_args()

    root = args.public_dir.resolve()
    if not (root / "index.html").is_file():
        print(f"{root}: no index.html — run ./build.sh first", file=sys.stderr)
        return 1

    handler = partial(
        CanonicalHandler,
        directory=str(root),
        sw_test_network_failures=args.enable_sw_test_network_failures,
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"serving {root} at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
