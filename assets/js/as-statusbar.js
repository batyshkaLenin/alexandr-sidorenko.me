/**
 * <as-statusbar> — bottom mode line: mode label and keyboard hints.
 *
 * Attrs: modes (JSON mode→label), mode-default, mode-search, keys-list,
 * keys-search, keys-prompt, keys-image, keys-help, keys-palette.
 * Events: dc-command-palette:open|close, dc-modes:change.
 * Hints only list components present on the page. Creates the bar when
 * the template omitted it and mode-default is set.
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
