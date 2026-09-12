/**
 * Refine body search results with conservative, ephemeral Text Fragments.
 * The index keeps canonical URLs; ambiguous body matches keep them too.
 */
"use strict";

class AsSearchTarget extends HTMLElement {
  connectedCallback() {
    if (this.onTarget) return;
    this.onTarget = (event) => this.resolve(event);
    document.addEventListener("dc-command-palette:target", this.onTarget);
  }

  disconnectedCallback() {
    document.removeEventListener("dc-command-palette:target", this.onTarget);
  }

  resolve(event) {
    const detail = event.detail;
    if (!detail || !detail.entry || !detail.match || detail.match.kind !== "body") return;

    const text = detail.entry.text || "";
    const { exact, prefix = "", suffix = "" } = detail.match;
    if (!exact) return;

    const ranges = AsSearchTarget.ranges(text, exact);
    let directive = "";
    if (ranges.length === 1) {
      directive = AsSearchTarget.encode(exact);
    } else if (ranges.length > 1 && (prefix || suffix)) {
      const confirmed = ranges.filter(([start, end]) =>
        text.slice(0, start).endsWith(prefix) && text.slice(end).startsWith(suffix));
      if (confirmed.length === 1) {
        const exactTerm = AsSearchTarget.encode(exact);
        if (prefix && suffix) {
          directive = `${AsSearchTarget.encode(prefix)}-,${exactTerm},-${AsSearchTarget.encode(suffix)}`;
        } else if (prefix) {
          directive = `${AsSearchTarget.encode(prefix)}-,${exactTerm}`;
        } else {
          directive = `${exactTerm},-${AsSearchTarget.encode(suffix)}`;
        }
      }
    }

    if (directive) detail.url = `${detail.entry.url}#:~:text=${directive}`;
  }

  static ranges(text, exact) {
    const haystack = text.toLocaleLowerCase();
    const needle = exact.toLocaleLowerCase();
    const ranges = [];
    let cursor = 0;
    while (needle && cursor <= haystack.length - needle.length) {
      const start = haystack.indexOf(needle, cursor);
      if (start === -1) break;
      ranges.push([start, start + needle.length]);
      cursor = start + 1;
    }
    return ranges;
  }

  static encode(value) {
    return encodeURIComponent(value).replaceAll("-", "%2D");
  }
}

customElements.define("as-search-target", AsSearchTarget);
