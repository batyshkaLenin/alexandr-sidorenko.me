/**
 * `<as-viewsnav>` — position-aware edge fades and current-view reveal
 * for the Library ViewsNav scroller.
 *
 * Without JS the nav stays ordinary links with native overflow scroll.
 * Fade and current-item reveal are enhancements.
 *
 * @example
 * <as-viewsnav>
 *   <nav class="dc-library__views">…</nav>
 * </as-viewsnav>
 */
"use strict";

class AsViewsnav extends HTMLElement {
  connectedCallback() {
    this.scroller = this.querySelector(".dc-library__views");
    if (!this.scroller) return;

    this.revealed = false;
    this.sync = () => this.update();
    this.scroller.addEventListener("scroll", this.sync, { passive: true });
    // Geometry is read only in observer callbacks, after layout. The lists
    // are observed too: a font swap widens them without resizing the scroller.
    this.resize = new ResizeObserver(() => {
      if (!this.revealed) {
        this.revealCurrent();
        this.revealed = true;
      }
      this.update();
    });
    this.resize.observe(this.scroller);
    for (const list of this.scroller.querySelectorAll(".dc-library__views-list")) {
      this.resize.observe(list);
    }
  }

  disconnectedCallback() {
    if (this.scroller && this.sync) {
      this.scroller.removeEventListener("scroll", this.sync);
    }
    if (this.resize) this.resize.disconnect();
  }

  fadePad() {
    const before = Number.parseFloat(getComputedStyle(this, "::before").width);
    const after = Number.parseFloat(getComputedStyle(this, "::after").width);
    if (Number.isFinite(before) && before > 0) return before;
    if (Number.isFinite(after) && after > 0) return after;
    return 0;
  }

  update() {
    const el = this.scroller;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const overflowing = max > 2;
    const start = overflowing && el.scrollLeft > 2;
    const end = overflowing && max - el.scrollLeft > 2;
    el.toggleAttribute("data-overflow-start", start);
    el.toggleAttribute("data-overflow-end", end);
    el.toggleAttribute("data-viewsnav-ready", true);
  }

  revealCurrent() {
    const current = this.querySelector("[aria-current='page']");
    const el = this.scroller;
    if (!current || !el) return;
    const item = (current.closest("li") || current).getBoundingClientRect();
    const scroller = el.getBoundingClientRect();
    const pad = this.fadePad();
    if (item.left < scroller.left + pad) {
      el.scrollLeft += item.left - scroller.left - pad;
    } else if (item.right > scroller.right - pad) {
      el.scrollLeft += item.right - scroller.right + pad;
    }
  }
}

customElements.define("as-viewsnav", AsViewsnav);
