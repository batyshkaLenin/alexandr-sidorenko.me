/*
<as-statusbar> — the mode line at the bottom of the shell (§13).

Site-owned: the theme's components announce themselves with bubbling events and
know nothing about this bar, and the bar is this site's composition. Hence
`as-`, not `dc-`.

Two jobs.

1. Keyboard hints. §13.4 draws the line: what is true without JavaScript is
   printed by the template, and what exists only with it — the shortcut list —
   is added here and disappears with it. Only the keys that actually work on
   this page are listed, so the bar advertises what the page has rather than
   what the design system can do: the hints are assembled from the components
   the page actually printed.

2. The mode. While the palette is open the mode reads SEARCH, with the keys the
   palette itself offers; closing restores what the page shipped with. When a
   view switches in place (`dc-modes:change`), the mode the page "shipped with"
   changes too — otherwise the bar would keep announcing the view the reader
   just left.

On a page whose template printed no bar — Home, where nothing static is worth a
row — the bar is created here, because with a keyboard attached `NORMAL` plus
its hints is no longer decoration. It is fixed to the bottom and the page
reserves its height at the end of the document, so nothing above it moves.
*/
"use strict";

class AsStatusbar extends HTMLElement {
  connectedCallback() {
    this.bar = this.querySelector(".dc-statusbar") || this.create();
    if (!this.bar) return;

    this.mode = this.bar.querySelector("[data-statusbar-mode]");
    this.state = this.bar.querySelector("[data-statusbar-state]");
    this.keys = this.bar.querySelector("[data-statusbar-keys]");
    if (!this.mode) return;

    this.staticMode = this.mode.textContent;
    if (this.keys) this.keys.textContent = this.hints();

    try {
      this.modes = JSON.parse(this.getAttribute("modes") || "{}");
    } catch (error) {
      this.modes = {};
    }

    this.onOpen = () => this.enter();
    this.onClose = () => this.leave();
    this.onMode = (event) => this.rename(event.detail && event.detail.mode);
    document.addEventListener("dc-command-palette:open", this.onOpen);
    document.addEventListener("dc-command-palette:close", this.onClose);
    document.addEventListener("dc-modes:change", this.onMode);
  }

  disconnectedCallback() {
    document.removeEventListener("dc-command-palette:open", this.onOpen);
    document.removeEventListener("dc-command-palette:close", this.onClose);
    document.removeEventListener("dc-modes:change", this.onMode);
  }

  rename(mode) {
    const name = this.modes[mode];
    if (!name) return;
    this.staticMode = name;
    if (this.mode.textContent !== this.getAttribute("mode-search")) this.mode.textContent = name;
  }

  /* Only for a page the template left without a bar: `mode-default` is the
     word for "nothing particular is happening", which is exactly the state
     that says nothing at all until a keyboard is present. */
  create() {
    const mode = this.getAttribute("mode-default");
    if (!mode) return null;
    const bar = document.createElement("p");
    bar.className = "dc-statusbar";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span class="dc-statusbar__mode" data-statusbar-mode></span>' +
      '<span class="dc-statusbar__keys" data-statusbar-keys></span>';
    bar.querySelector("[data-statusbar-mode]").textContent = mode;
    this.append(bar);
    return bar;
  }

  /* What the page can actually do, asked of the page rather than assumed. */
  hints() {
    const parts = [
      document.querySelector("dc-listnav") && this.getAttribute("keys-list"),
      document.querySelector("dc-command-palette") && this.getAttribute("keys-search"),
      document.querySelector("dc-prompt") && this.getAttribute("keys-prompt"),
      document.querySelector("dc-image-toggle") && this.getAttribute("keys-image"),
      document.querySelector("dc-help") && this.getAttribute("keys-help"),
    ];
    return parts.filter(Boolean).join(" · ");
  }

  enter() {
    this.mode.textContent = this.getAttribute("mode-search") || "SEARCH";
    if (this.keys) this.keys.textContent = this.getAttribute("keys-palette") || "";
    if (this.state) this.state.hidden = true;
  }

  leave() {
    this.mode.textContent = this.staticMode;
    if (this.keys) this.keys.textContent = this.hints();
    if (this.state) this.state.hidden = false;
  }
}

customElements.define("as-statusbar", AsStatusbar);
