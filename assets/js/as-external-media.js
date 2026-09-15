/**
 * <as-external-media> — load an allowlisted third-party player on demand.
 *
 * The useful baseline (provider, title, and canonical link) ships in HTML.
 * This local component adds the load control and creates no network surface
 * until the visitor explicitly activates it.
 */
"use strict";

const EXTERNAL_MEDIA_PROVIDERS = {
  youtube: {
    origin: "https://www.youtube-nocookie.com",
    path: /^\/embed\/[A-Za-z0-9_-]{11}$/,
  },
};

class AsExternalMedia extends HTMLElement {
  connectedCallback() {
    if (this._loadButton || this.hasAttribute("loaded")) return;

    const actions = this.querySelector("[data-external-media-actions]");
    if (!actions || !this._validatedEmbedURL()) return;

    const button = document.createElement("button");
    button.className = "as-external-media__load";
    button.type = "button";
    button.textContent = "LOAD PLAYER";
    button.addEventListener("click", () => this.loadPlayer(), { once: true });
    actions.prepend(button);
    this._loadButton = button;
  }

  _validatedEmbedURL() {
    const contract = EXTERNAL_MEDIA_PROVIDERS[this.dataset.provider];
    if (!contract || !this.dataset.embedUrl) return null;

    try {
      const url = new URL(this.dataset.embedUrl);
      if (url.origin !== contract.origin || !contract.path.test(url.pathname)) {
        return null;
      }
      if (url.search || url.hash || url.username || url.password) return null;
      return url;
    } catch {
      return null;
    }
  }

  loadPlayer() {
    if (this.hasAttribute("loaded")) return;
    const url = this._validatedEmbedURL();
    if (!url) return;

    const frame = document.createElement("div");
    frame.className = "as-external-media__frame";

    const iframe = document.createElement("iframe");
    iframe.className = "as-external-media__iframe";
    iframe.title = this.dataset.frameTitle || "External media player";
    iframe.width = "560";
    iframe.height = "315";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = this.dataset.frameAllow || "";
    iframe.allowFullscreen = true;
    iframe.src = url.href;

    frame.append(iframe);
    const title = this.querySelector(".as-external-media__title");
    (title || this.firstElementChild)?.after(frame);
    this._loadButton?.remove();
    this._loadButton = null;
    this.setAttribute("loaded", "");
    iframe.focus();
  }
}

customElements.define("as-external-media", AsExternalMedia);
