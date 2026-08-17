/*
<as-dev> — refreshes the shape of the week in the activity pane.

Site-owned: it knows this site's data source and the shape of its own markup,
which is exactly what a theme component must not know. Hence `as-`, not `dc-`.

Class B: the bars ship in the HTML, drawn from the snapshot the build took, and
are complete without JavaScript. This element asks Code::Stats once — the one
public endpoint of the pane, without a token, allowed by `connect-src` since
ADR redesign-activity-dev-module — and redraws the bars if the week has moved
on since the build.

XP never reaches the page as a number. It arrives here, becomes seven levels
relative to the busiest day, and is discarded: the module shows intensity, not
counts. The weekly hours beside it are not touched — WakaTime has no public
endpoint for them and no CORS header, so they stay as the build left them.

Failure is silence: a rejected fetch, a blocked domain or a browser without
JavaScript all leave the snapshot on screen, and its tooltip already says when
it was taken.
*/
"use strict";

// The eight block heights of §16: an empty day is the lowest bar, not a gap —
// the row is a graph, and a graph keeps its baseline.
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
    // A week with nothing in it is an answer, not an error: seven empty bars.
    const levels = peak > 0 ? counts.map((value) => Math.round((value / peak) * MAX_LEVEL)) : counts.map(() => 0);
    const drawn = levels.map((level) => BARS[level] || BARS[0]).join("");

    if (drawn === this.bars.textContent) return;
    this.bars.textContent = drawn;
    this.holder.dataset.devLevels = levels.join(",");
    this.dataset.live = "";
  }
}

customElements.define("as-dev", AsDev);
