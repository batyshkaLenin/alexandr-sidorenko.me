/**
 * <as-statusbar> — bottom mode line: mode label and keyboard hints.
 *
 * Attrs: mode-search, keys-list, keys-search, keys-prompt, keys-image,
 * keys-help, keys-palette. Events: dc-command-palette:open|close.
 * Hints only list components present on the page. Creates a hints-only bar
 * when the template omitted it and handlers exist (no NORMAL cosplay).
 */
"use strict";

class AsStatusbar extends HTMLElement {
  connectedCallback() {
    this.bar = this.querySelector(".dc-statusbar") || this.create();
    if (!this.bar) return;

    this.mode = this.bar.querySelector("[data-statusbar-mode]");
    this.modeSep = this.bar.querySelector("[data-statusbar-mode-sep]");
    this.state = this.bar.querySelector("[data-statusbar-state]");
    this.keys = this.bar.querySelector("[data-statusbar-keys]");

    this.staticMode = this.mode && !this.mode.hidden ? this.mode.textContent : "";
    if (this.keys) this.keys.textContent = this.hints();

    this.onOpen = () => this.enter();
    this.onClose = () => this.leave();
    document.addEventListener("dc-command-palette:open", this.onOpen);
    document.addEventListener("dc-command-palette:close", this.onClose);
  }

  disconnectedCallback() {
    document.removeEventListener("dc-command-palette:open", this.onOpen);
    document.removeEventListener("dc-command-palette:close", this.onClose);
  }

  create() {
    const hints = this.hints();
    if (!hints) return null;
    const bar = document.createElement("p");
    bar.className = "dc-statusbar";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span class="dc-statusbar__mode" data-statusbar-mode hidden></span>' +
      '<span class="dc-statusbar__keys" data-statusbar-keys></span>';
    this.append(bar);
    return bar;
  }

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
    if (!this.mode) return;
    this.mode.hidden = false;
    if (this.modeSep) this.modeSep.hidden = true;
    this.mode.textContent = this.getAttribute("mode-search") || "SEARCH";
    if (this.keys) this.keys.textContent = this.getAttribute("keys-palette") || "";
    if (this.state) this.state.hidden = true;
  }

  leave() {
    if (this.mode) {
      if (this.staticMode) {
        this.mode.hidden = false;
        this.mode.textContent = this.staticMode;
        if (this.modeSep) this.modeSep.hidden = false;
      } else {
        this.mode.textContent = "";
        this.mode.hidden = true;
        if (this.modeSep) this.modeSep.hidden = true;
      }
    }
    if (this.keys) this.keys.textContent = this.hints();
    if (this.state) this.state.hidden = false;
  }
}

customElements.define("as-statusbar", AsStatusbar);
