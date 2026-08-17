/*
<as-activity> — progressive freshness annotation for the static activity pane.

The HTML is the complete class-B baseline. This element makes one claim only:
after seven days the build is an old snapshot. It neither fetches data nor
turns the pane into live telemetry; without JavaScript the explicit build time
still tells the whole truth.
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