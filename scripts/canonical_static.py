#!/usr/bin/env python3
"""Shared static file handler: Hugo URL shape (no trailing slash).

Used by `serve-public.py` (browser suite) and `run-lighthouse.py` so both
measure the same addresses Cloudflare will answer with `drop-trailing-slash`.
"""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class CanonicalHandler(SimpleHTTPRequestHandler):
    """Serve `route/index.html` at `/route` without redirecting to `/route/`."""

    def send_head(self):
        path = urlsplit(self.path).path
        if path != "/" and path.endswith("/"):
            target = path.rstrip("/")
            self.send_response(301)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        local = self.translate_path(path)
        if os.path.isdir(local) and os.path.exists(os.path.join(local, "index.html")):
            self.path = path.rstrip("/") + "/index.html"
        return super().send_head()

    def log_message(self, *_args) -> None:
        return


@contextmanager
def serve_directory(directory: Path, host: str = "127.0.0.1", port: int = 0):
    """Serve `directory` until the context exits. Port 0 = ephemeral."""
    root = directory.resolve()
    if not (root / "index.html").is_file():
        raise FileNotFoundError(f"{root}: no index.html — build the site first")
    handler = partial(CanonicalHandler, directory=str(root))
    server = ThreadingHTTPServer((host, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        bound = server.server_address[1]
        yield f"http://{host}:{bound}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
