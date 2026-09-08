/**
 * <as-activity> — mark the activity pane stale after seven days.
 *
 * Reads data-built-at; if older than 7 days, sets data-stale and prepends
 * "снимок · " to [data-activity-freshness]. No network; works without JS
 * via the build timestamp already in the HTML.
 */
"use strict";

class AsActivity extends HTMLElement {
  connectedCallback() {
    const builtAt = Date.parse(this.dataset.builtAt || "");
    if (!Number.isFinite(builtAt)) return;

    const staleAfter = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - builtAt < staleAfter) return;

    this.dataset.stale = "";
    const freshness = this.querySelector("[data-activity-freshness]");
    if (freshness) freshness.prepend("снимок · ");
  }
}

customElements.define("as-activity", AsActivity);
