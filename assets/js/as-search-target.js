/** Browser navigation hints are distinct from the palette's source match. */
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
    if (!detail?.entry || detail.match?.kind !== "body"
      || !("fragmentDirective" in document) || typeof Intl.Segmenter !== "function") return;

    const text = detail.entry.text || "";
    const { start, end, exact } = detail.match;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start
      || text.slice(start, end) !== exact || typeof text.isWellFormed !== "function" || !text.isWellFormed()) return;

    // Expand only the navigation range. Source match, snippet and marks stay
    // untouched. Segment boundaries come from the browser's Unicode breaker.
    const breaker = new Intl.Segmenter("ru", { granularity: "word" });
    const segments = [...breaker.segment(text)];
    const first = segments.find((part) => part.index <= start && part.index + part.segment.length > start);
    const last = segments.find((part) => part.index < end && part.index + part.segment.length >= end);
    if (!first || !last) return;
    const navStart = first.index;
    const navEnd = last.index + last.segment.length;
    const target = text.slice(navStart, navEnd);
    if (!target.trim()) return;

    const collator = new Intl.Collator("ru", { usage: "search", sensitivity: "base" });
    if (collator.compare(target, "") === 0) return;
    const ranges = AsSearchTarget.ranges(text, target, segments, collator);
    if (!ranges || !ranges.some(([a, b]) => a === navStart && b === navEnd)) return;
    let directive;
    if (ranges.length === 1) {
      directive = AsSearchTarget.encode(target);
    } else {
      // Neighbouring tokens, never arbitrary slices inside words/surrogates.
      const before = text.slice(0, navStart).trimEnd();
      const after = text.slice(navEnd).trimStart();
      const prefix = before.match(/\S+$/u)?.[0] || "";
      const suffix = after.match(/^\S+/u)?.[0] || "";
      if (!prefix && !suffix) return;
      if ((prefix && collator.compare(prefix, "") === 0)
        || (suffix && collator.compare(suffix, "") === 0)) return;
      const confirmed = ranges.filter(([a, b]) =>
        (!prefix || AsSearchTarget.contextMatches(text.slice(0, a).trimEnd().match(/\S+$/u)?.[0] || "", prefix, true, collator))
        && (!suffix || AsSearchTarget.contextMatches(text.slice(b).trimStart().match(/^\S+/u)?.[0] || "", suffix, false, collator)));
      if (confirmed.length !== 1 || confirmed[0][0] !== navStart) return;
      directive = (prefix ? `${AsSearchTarget.encode(prefix)}-,` : "")
        + AsSearchTarget.encode(target) + (suffix ? `,-${AsSearchTarget.encode(suffix)}` : "");
    }
    detail.url = `${detail.entry.url}#:~:text=${directive}`;
  }

  static contextMatches(token, expected, prefix, collator) {
    // Native prefix/suffix match only their OUTER word boundary. Thus "tail."
    // can be a suffix context in "tail...", and "(red" a prefix in "((red".
    // Word-break details differ between engines. All code-point boundaries
    // conservatively include every possible native context match.
    let edge = 0;
    let examined = 0;
    for (const point of token) {
      const candidate = prefix ? token.slice(edge) : token.slice(0, edge + point.length);
      if (collator.compare(candidate, expected) === 0) return true;
      edge += point.length;
      // Unknown matches must count as possible, never prove uniqueness.
      if (++examined === 64 && edge < token.length) return true;
    }
    return false;
  }

  static ranges(text, exact, segments, collator) {
    // Enumerate original spans: primary collation also equates ligatures such
    // as œ/oe, which lowercase + accent stripping cannot represent safely.
    // Search terms have no whitespace; their expanded targets remain within
    // one token. Include punctuation boundaries within each token as well.
    const boundaries = new Set([text.length, ...segments.map((part) => part.index)]);
    const ranges = [];
    for (const token of text.matchAll(/\S+/gu)) {
      const start = token.index;
      const end = start + token[0].length;
      const points = [start];
      for (let at = start + 1; at < end; at++) if (boundaries.has(at)) points.push(at);
      points.push(end);
      // A pathological token must not make a query quadratic or be silently
      // skipped in the ambiguity check. Fall back for the entire target.
      if (points.length > 64) return null;
      for (let i = 0; i < points.length - 1; i++) {
        for (let j = i + 1; j < points.length; j++) {
          if (collator.compare(text.slice(points[i], points[j]), exact) === 0) {
            ranges.push([points[i], points[j]]);
          }
        }
      }
    }
    return ranges;
  }

  static encode(value) {
    return encodeURIComponent(value).replaceAll("-", "%2D");
  }
}

customElements.define("as-search-target", AsSearchTarget);
