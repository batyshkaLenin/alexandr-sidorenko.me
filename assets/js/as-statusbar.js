/**
 * <as-statusbar> — bottom mode line: mode label and keyboard hints.
 *
 * Attrs: mode-search, keys-list, keys-search, keys-prompt, keys-help,
 * keys-palette. Events: dc-command-palette:open|close.
 * Hints only list components present on the page. Creates a hints-only bar
 * when the template omitted it and handlers exist (no NORMAL cosplay).
 */
"use strict";

class AsStatusbar extends HTMLElement {
  connectedCallback() {
    this.bar = this.querySelector(".dc-statusbar") || this.create();
    if (!this.bar) return;

    const part = name => this.bar.querySelector(`[data-statusbar-${name}]`);
    this.mode = part("mode");
    this.modeSep = part("mode-sep");
    this.state = part("state");
    this.keys = part("keys");

    this.staticMode ??= this.mode && !this.mode.hidden ? this.mode.textContent : "";
    this.measure = () => {
      if (this.isConnected) document.documentElement.style.setProperty(
        "--as-statusbar-height", `${Math.ceil(this.bar.getBoundingClientRect().height)}px`,
      );
    };
    this.onOpen = () => this.render(true);
    this.onClose = () => this.render(false);
    document.addEventListener("dc-command-palette:open", this.onOpen);
    document.addEventListener("dc-command-palette:close", this.onClose);
    window.addEventListener("resize", this.measure);
    document.fonts?.addEventListener("loadingdone", this.measure);
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(this.measure);
      this.observer.observe(this.bar);
    }
    this.render(!!document.querySelector("dc-command-palette dialog[open]"));
  }

  disconnectedCallback() {
    document.removeEventListener("dc-command-palette:open", this.onOpen);
    document.removeEventListener("dc-command-palette:close", this.onClose);
    window.removeEventListener("resize", this.measure);
    document.fonts?.removeEventListener("loadingdone", this.measure);
    this.observer?.disconnect();
    document.documentElement.style.removeProperty("--as-statusbar-height");
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
    return [
      ["listnav", "list"],
      ["command-palette", "search"],
      ["prompt", "prompt"],
      ["help", "help"],
    ].map(([tag, attr]) => document.querySelector(`dc-${tag}`) && this.getAttribute(`keys-${attr}`))
      .filter(Boolean).join(" · ");
  }

  render(search) {
    if (this.mode) {
      this.mode.hidden = !search && !this.staticMode;
      this.mode.textContent = search ? this.getAttribute("mode-search") || "SEARCH" : this.staticMode;
    }
    if (this.modeSep) this.modeSep.hidden = search || !this.staticMode;
    if (this.keys) this.keys.textContent = search ? this.getAttribute("keys-palette") || "" : this.hints();
    if (this.state) this.state.hidden = search;
    // Palette restores focus after its close event, before ResizeObserver.
    // Keep the native scroll safe area current for that immediate focus.
    this.measure();
  }
}

customElements.define("as-statusbar", AsStatusbar);
