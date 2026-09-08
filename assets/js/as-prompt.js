/**
 * <as-prompt> — sync the top-bar command when modes change in place.
 *
 * Listens for bubbling `dc-modes:change`. Attribute `modes` is JSON
 * { modeName → command }. Updates [data-prompt-command]; unknown modes
 * leave the prompt alone.
 */
"use strict";

class AsPrompt extends HTMLElement {
  connectedCallback() {
    this.command = this.querySelector("[data-prompt-command]");
    if (!this.command) return;

    try {
      this.modes = JSON.parse(this.getAttribute("modes") || "{}");
    } catch (error) {
      this.modes = {};
    }

    this.onChange = (event) => {
      const command = this.modes[event.detail && event.detail.mode];
      if (command) this.command.textContent = command;
    };
    document.addEventListener("dc-modes:change", this.onChange);
  }

  disconnectedCallback() {
    document.removeEventListener("dc-modes:change", this.onChange);
  }
}

customElements.define("as-prompt", AsPrompt);
