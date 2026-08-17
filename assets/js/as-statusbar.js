/*
<as-statusbar mode-search="SEARCH"> — the status bar says what mode the shell is
in right now (§13.1).

Site-owned: the theme's palette announces itself with bubbling
`dc-command-palette:open`/`:close` events and knows nothing about this bar, and
the bar is this site's composition. Hence `as-`, not `dc-`.

Markup contract: wraps a status bar whose mode sits in `[data-statusbar-mode]`.
While the palette is open that mode reads SEARCH, along with the keys the
palette actually offers; closing puts back the static mode the page shipped
with (§13.4 — what is true without JavaScript stays true when it fails).

The bar is not created here. A page that has no status bar keeps none: a row
appearing at the bottom of the viewport when a modal opens would move the
document under it.
*/
"use strict";

class AsStatusbar extends HTMLElement {
  connectedCallback() {
    this.mode = this.querySelector("[data-statusbar-mode]");
    this.state = this.querySelector("[data-statusbar-state]");
    if (!this.mode) return;

    this.staticMode = this.mode.textContent;
    this.staticState = this.state ? this.state.textContent : "";

    this.onOpen = () => this.enter();
    this.onClose = () => this.leave();
    document.addEventListener("dc-command-palette:open", this.onOpen);
    document.addEventListener("dc-command-palette:close", this.onClose);
  }

  disconnectedCallback() {
    document.removeEventListener("dc-command-palette:open", this.onOpen);
    document.removeEventListener("dc-command-palette:close", this.onClose);
  }

  enter() {
    this.mode.textContent = this.getAttribute("mode-search") || "SEARCH";
    if (this.state) this.state.textContent = this.getAttribute("keys-search") || "";
  }

  leave() {
    this.mode.textContent = this.staticMode;
    if (this.state) this.state.textContent = this.staticState;
  }
}

customElements.define("as-statusbar", AsStatusbar);
