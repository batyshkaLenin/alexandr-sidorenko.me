/*
<as-prompt> — the command line in the top bar, kept true when a mode changes
without a page load.

Site-owned: the prompt is this site's own way of saying where the reader is
(§11.3), and the theme's <dc-modes> knows nothing about it. It announces a
change with a bubbling `dc-modes:change`, and this element answers by printing
the command that belongs to the new mode.

Markup contract: wraps the command inside `[data-prompt-command]` and carries
`modes`, a JSON object of mode name → command. A mode that is not in the map
leaves the prompt alone.
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
