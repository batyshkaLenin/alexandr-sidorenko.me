/**
 * <as-dev> — refresh weekly Code::Stats bars in the activity pane.
 *
 * Bars ship in HTML from the build snapshot. Fetches public Code::Stats
 * once (no token) and redraws relative intensity levels. Hours stay static.
 * Failures leave the snapshot unchanged. Requires [data-dev-bars],
 * [data-dev-levels], and data-src.
 */
"use strict";

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const DAYS = 7;
const MAX_LEVEL = 7;

class AsDev extends HTMLElement {
  connectedCallback() {
    this.bars = this.querySelector("[data-dev-bars]");
    this.holder = this.querySelector("[data-dev-levels]");
    const src = this.dataset.src;
    if (!this.bars || !this.holder || !src) return;

    fetch(src, { credentials: "omit" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => this.redraw(payload))
      .catch(() => {});
  }

  redraw(payload) {
    const dates = payload && payload.dates;
    if (!dates) return;

    const today = new Date();
    const counts = [];
    for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
      counts.push(Number(dates[day.toISOString().slice(0, 10)]) || 0);
    }

    const peak = Math.max(...counts);
    const levels = peak > 0 ? counts.map((value) => Math.round((value / peak) * MAX_LEVEL)) : counts.map(() => 0);
    const drawn = levels.map((level) => BARS[level] || BARS[0]).join("");

    if (drawn === this.bars.textContent) return;
    this.bars.textContent = drawn;
    this.holder.dataset.devLevels = levels.join(",");
    this.dataset.live = "";
  }
}

customElements.define("as-dev", AsDev);
