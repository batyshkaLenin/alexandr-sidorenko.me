/*
<as-prefetch> — hover/focus prefetch for internal links (§45.2, §30.5).

Wraps the page body and listens for pointerenter/focusin on internal <a> tags.
On the first qualifying event for a given href, injects a <link rel="prefetch">
into <head>. The prefetch fires once per URL per page load — repeating a hover
does not repeat the request.

Respects the visitor's data budget: does nothing when `navigator.connection
.saveData` is true or when the `prefers-reduced-data` media query matches.
Without JavaScript the element is inert markup and the page works unchanged.
*/
"use strict";

class AsPrefetch extends HTMLElement {
  connectedCallback() {
    if (this._bound) return;
    if (navigator.connection?.saveData) return;
    if (matchMedia("(prefers-reduced-data: reduce)").matches) return;

    this._seen = new Set();
    this._onHover = this._handle.bind(this);
    document.addEventListener("pointerenter", this._onHover, true);
    document.addEventListener("focusin", this._onHover, true);
    this._bound = true;
  }

  _handle(e) {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    const href = a.href;
    if (!href) return;

    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return;

      const key = url.pathname + url.search;
      if (this._seen.has(key)) return;
      this._seen.add(key);

      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = href;
      document.head.appendChild(link);
    } catch { /* malformed URL — skip */ }
  }
}

customElements.define("as-prefetch", AsPrefetch);
