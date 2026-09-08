/**
 * <as-prefetch> — prefetch internal links on hover/focus.
 *
 * Listens for pointerenter/focusin on internal <a> tags and injects
 * <link rel="prefetch"> once per URL. Skips when saveData or
 * prefers-reduced-data is on. No-op without JS.
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
    } catch { /* skip */ }
  }
}

customElements.define("as-prefetch", AsPrefetch);
