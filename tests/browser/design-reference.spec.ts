import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// W0025 attempt 1: bounded implementation evidence, never canonical Review/QA.
const theme = JSON.parse(readFileSync("themes/declassified/exampleSite/data/design-states.json", "utf8"));
const site = JSON.parse(readFileSync("data/design-reference.json", "utf8"));
const widths = [320, 390, 768, 1024, 1440];
const themeURL = "http://127.0.0.1:4174/__design/theme/";

test.beforeEach(async ({ context }, info) => {
  test.skip(!process.env.DESIGN_REFERENCE_ROOT || info.project.name !== "chromium-desktop", "explicit local reference, exact canonical widths once");
  // Optional production refresh/providers must never reach live third parties.
  await context.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
});

async function noPageOverflow(page: Page, width: number) {
  const extent = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(extent.width).toBe(width);
  expect(extent.scroll, "page overflow; local scroll regions must contain wide content").toBeLessThanOrEqual(width + 1);
}

async function serviceBindings(page: Page, manifest: typeof site) {
  await contextBindings(page, manifest, manifest.examples.filter((x: { url: string }) => x.url.replace(/\/$/, "") === manifest.route.replace(/\/$/, "")));
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
}

// Service examples identify one element; composition selectors may identify
// several rows. A manifest can explicitly narrow cardinality or omit a selector.
async function contextBindings(page: Page, manifest: typeof site, examples: typeof site.examples) {
  for (const example of examples) {
    const selector = example.selector;
    if (selector == null && example.selector_required === false) continue;
    const prefix = `BINDING_RESOLUTION: ${example.id} ${example.url} ${String(selector)}`;
    if (typeof selector !== "string" || !selector.trim()) throw new Error(`${prefix}: missing selector`);
    const result = await page.evaluate((value: string) => {
      try { return { count: document.querySelectorAll(value).length, error: "" }; }
      catch (error) { return { count: 0, error: String(error) }; }
    }, selector);
    if (result.error) throw new Error(`${prefix}: invalid CSS selector: ${result.error}`);
    const output = example.url.replace(/^\//, "").replace(/\/$/, "") + "/index.html";
    const unique = example.selector_unique ?? manifest.service_outputs.includes(output);
    if (result.count === 0 || (unique && result.count !== 1)) {
      throw new Error(`${prefix}: expected ${unique ? "exactly one" : "at least one"} match, got ${result.count}`);
    }
  }
}

test.describe("reference.bindings", () => {
  for (const width of [390, 1440]) for (const js of [true, false]) test.describe(`${width} ${js ? "JS" : "no-JS"}`, () => {
    test.use({ viewport: { width, height: 900 }, javaScriptEnabled: js });
    test("all manifest selectors resolve in their declared contexts", async ({ page }) => {
      for (const [manifest, origin] of [[site, "http://127.0.0.1:4173"], [theme, "http://127.0.0.1:4174"]] as const) {
        const urls = new Set<string>(manifest.examples.map((example: { url: string }) => example.url));
        for (const url of urls) {
          await page.goto(origin + url);
          await contextBindings(page, manifest, manifest.examples.filter((example: { url: string }) => example.url === url));
        }
      }
    });
  });
  test("disposable binding copies reject selector drift and enforce declared cardinality", async ({ page }) => {
    for (const [manifest, origin, id] of [
      [site, "http://127.0.0.1:4173", "site-type-badge"],
      [site, "http://127.0.0.1:4173", "site-row-rich"],
      [site, "http://127.0.0.1:4173", "site-home"],
      [theme, "http://127.0.0.1:4174", "theme-block-code"],
    ] as const) {
      const example = structuredClone(manifest.examples.find((entry: { id: string }) => entry.id === id));
      await page.goto(origin + example.url);
      example.selector = "#I4B_ABSENT";
      await expect(contextBindings(page, manifest, [example])).rejects.toThrow(`BINDING_RESOLUTION: ${id}`);
    }
    await page.goto("http://127.0.0.1:4173/__design/site");
    const unique = structuredClone(site.examples[0]);
    unique.selector = "[data-i4b-unique]";
    unique.selector_unique = true;
    await page.evaluate(() => {
      const element = document.createElement("span"); element.setAttribute("data-i4b-unique", ""); document.body.append(element);
    });
    await contextBindings(page, site, [unique]);
    await page.evaluate(() => document.body.append(document.querySelector("[data-i4b-unique]")!.cloneNode(true)));
    await expect(contextBindings(page, site, [unique])).rejects.toThrow(/BINDING_RESOLUTION:.*expected exactly one match, got 2/);
    const optional = structuredClone(site.examples[0]);
    optional.selector_required = false; delete optional.selector;
    await contextBindings(page, site, [optional]);
    optional.selector = null;
    await contextBindings(page, site, [optional]);
    optional.selector = "#I4B_ABSENT";
    await expect(contextBindings(page, site, [optional])).rejects.toThrow("BINDING_RESOLUTION:");
  });
});

test.describe("reference.geometry", () => {
  for (const width of widths) for (const js of [true, false]) {
    test.describe(`${width} ${js ? "JS" : "no-JS"}`, () => {
      test.use({ viewport: { width, height: 900 }, javaScriptEnabled: js });
      test("native theme and site renderer geometry", async ({ page }) => {
        await page.goto(themeURL);
        await serviceBindings(page, theme);
        await page.locator("#theme-disclosure summary").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#theme-disclosure details")).toHaveAttribute("open", "");
        await page.locator("#theme-native input[type=checkbox]").check();
        await page.getByRole("radio", { name: "Second option" }).check();
        await page.locator("#theme-text").fill("Edited");
        await page.getByRole("button", { name: "Reset native controls" }).click();
        await expect(page.locator("#theme-text")).toHaveValue("Native baseline");
        await expect(page.locator("#theme-native input[type=checkbox]")).not.toBeChecked();
        if (!js) {
          await expect(page.locator("dc-command-palette button, dc-help button, dc-prompt input, dc-copy button, dc-image-toggle button")).toHaveCount(0);
          await expect(page.locator("#theme-clock dc-clock")).toHaveText("");
        }
        await noPageOverflow(page, width);
        await page.goto("/__design/site");
        await serviceBindings(page, site);
        await expect(page.locator("#site-type-unlinked span")).toHaveText("ARTICLE");
        await expect(page.locator(".dc-gallery figure")).toHaveCount(2);
        await expect(page.locator(".dc-figure--wide, .dc-figure--full")).toHaveCount(2);
        await expect(page.locator("math")).toHaveCount(2);
        await expect(page.locator(".as-parallel-source[lang=en]")).toHaveCount(2);
        await expect(page.locator(".as-parallel-translation[lang=ru]")).toHaveCount(2);
        await expect(page.locator(".dc-verse").last()).toContainText("Первая строка");
        for (const region of await page.locator(".dc-prose-table").all()) {
          await expect(region).toHaveAttribute("tabindex", "0");
          await expect(region).toHaveAttribute("role", "region");
          await region.focus(); await expect(region).toBeFocused();
        }
        await expect(page.locator(".footnote-ref")).toHaveCount(1);
        await expect(page.locator(".footnote-backref")).toHaveCount(1);
        await page.locator(".footnote-ref").click();
        await expect(page).toHaveURL(/#fn:/);
        await page.locator(".footnote-backref").click();
        await expect(page).toHaveURL(/#fnref:/);
        for (const cls of [".highlight", ".dc-prose-table", ".dc-math"]) {
          const overflow = await page.locator(cls).last().evaluate(el => getComputedStyle(el).overflowX);
          expect(["auto", "scroll"], cls).toContain(overflow);
        }
        if (!js) await expect(page.locator("dc-image-toggle button")).toHaveCount(0);
        await noPageOverflow(page, width);
      });
    });
  }
});

test.describe("theme.behavior", () => {
  for (const width of [390, 1440]) test.describe(`${width}`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: "UTC" });
    test("keyboard, native focus, nine registered components", async ({ page, context }, info) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
      await page.goto(themeURL);
      await expect.poll(() => page.evaluate(() => ["copy","listnav","clock","command-palette","help","prompt","keynav","image-toggle","modes"].every(name => !!customElements.get("dc-" + name)))).toBe(true);
      const links = page.locator("#theme-listnav a");
      await links.first().focus(); await page.keyboard.press("ArrowDown"); await expect(links.nth(1)).toBeFocused();
      await page.keyboard.press("k"); await expect(links.first()).toBeFocused();
      await page.keyboard.press("Tab"); await expect(links.nth(1)).toBeFocused();
      await expect(links.nth(1)).toHaveCSS("outline-style", "solid");
      // 4B-K3 records pink vs normative green; visible focus does not bless its color.
      await page.locator("#theme-copy button").click();
      await expect(page.locator("#theme-copy dc-copy")).toHaveAttribute("copied", "");
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(themeURL);
      await page.locator("#theme-text").focus(); await page.keyboard.type("/? :");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      const palette = page.locator("#theme-palette"); const search = palette.locator("input");
      await palette.locator("button").click(); await search.fill("post");
      await expect(palette.locator('[aria-selected="true"]')).toHaveCount(1);
      const selected = await palette.locator('[aria-selected="true"]').getAttribute("href");
      await search.press("ArrowDown"); await expect(palette.locator('[aria-selected="true"]')).toHaveCount(1);
      expect(await palette.locator('[aria-selected="true"]').getAttribute("href")).not.toBe(selected);
      await search.press("Escape"); await expect(palette.locator("dialog")).not.toHaveAttribute("open", "");
      await expect(palette.locator("button")).toBeFocused();
      await links.first().focus(); await page.keyboard.press("?");
      await expect(page.locator("#theme-help dialog")).toHaveAttribute("open", "");
      await page.keyboard.press("Escape"); await expect(links.first()).toBeFocused();
      await expect(page).toHaveURL(/\/__design\/theme\/?$/); // modal dismissal must not also navigate parent
      const prompt = page.locator("#theme-prompt input");
      if (width === 1440) {
        // Separate command entry from a previous dialog's asynchronous focus
        // restoration; each production component retains its own context.
        await page.goto(themeURL); await expect(prompt).toBeAttached();
        await page.locator(".dc-nav a").first().focus(); await page.keyboard.press(":");
        await expect(prompt).toBeVisible();
        await prompt.fill("he"); await prompt.press("Tab");
        await expect(prompt).toHaveValue("help "); await prompt.press("Escape"); await expect(prompt).toBeHidden();
      } // 4B-F2 preserves the narrow invocation failure in its own scenario.
      await expect(page).toHaveURL(/\/__design\/theme\/?$/);
      const image = page.locator("#theme-image"); await image.locator("button").click();
      await expect(image).toHaveAttribute("showing", "original"); await image.locator("button").click();
      await expect(image).toHaveAttribute("showing", "processed");
      const modes = page.locator("#theme-modes"); await modes.locator('[data-mode="table"]').click();
      await expect(modes.locator('[data-mode-panel="table"]')).toBeVisible();
      await expect(page).toHaveURL(/\/__design\/theme\/table\/$/);
      await page.goBack(); await expect(modes.locator('[data-mode-panel="list"]')).toBeVisible();
      await modes.locator('[data-mode="table"]').click(); await page.reload();
      await expect(page.locator('#theme-modes [data-mode-panel="table"]')).toBeVisible();
      await page.goto(themeURL);
      const clock = page.locator("#theme-clock dc-clock");
      if (width === 1440) { await expect(clock).toBeVisible(); await expect(clock).toHaveText(/2026-10-12T12:00:\d{2}\+00:00/); }
      else { await expect(clock).toBeHidden(); await expect(clock).toHaveText(""); }
      if (width === 1440) await page.locator("#theme-native").screenshot({ path: info.outputPath("native-controls.png") });
      const beforeEscape = page.url();
      await page.locator(".dc-nav a").first().focus(); await page.keyboard.press("Escape");
      await expect(page).toHaveURL(beforeEscape);
    });
  });
});

test.describe("production.geometry", () => {
  for (const width of widths) test.describe(`${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("real Home Library rows and TOC composition", async ({ page }) => {
      for (const url of ["/", "/library", "/library/all", "/library/bluredu-new-teachers"]) {
        await page.goto(url); await expect(page.locator("h1")).toHaveCount(1); await noPageOverflow(page, width);
        if (url === "/library" || url === "/library/all") {
          const density = url === "/library" ? "rich" : "dense";
          expect(await page.locator(`.dc-material--${density}`).count()).toBeGreaterThan(0);
          const title = page.locator(`.dc-material--${density} .dc-material__title`).filter({ hasText: "Мы поступили" });
          await expect(title).toBeVisible(); await expect(title).not.toHaveCSS("text-overflow", "ellipsis");
          // W0017 is retained: this proves current rows/wrapping, not row/type-link conformance.
          expect(await page.locator(".dc-material__marker").count()).toBeGreaterThan(0);
        }
        if (url.includes("bluredu")) {
          const toc = page.locator(".dc-toc");
          await expect(toc.locator(".dc-toc__rail")).toBeVisible();
          if (width <= 1024) await expect(toc.locator("summary")).toBeVisible();
        }
      }
    });
  });
});

test.describe("production.reading", () => {
  for (const width of [320, 1440]) for (const js of [true, false]) test.describe(`${width} ${js ? "JS" : "no-JS"}`, () => {
    test.use({ viewport: { width, height: 900 }, javaScriptEnabled: js });
    test("real poetry long prose audio translation and native mode URLs", async ({ page }) => {
      for (const item of site.composition.filter((x: {url: string}) => !["/", "/library", "/library/all", "/library/bluredu-new-teachers"].includes(x.url))) {
        await page.goto(item.url); await expect(page.locator("h1")).toHaveCount(1); await noPageOverflow(page, width);
        const example = site.examples.find((x: {url: string}) => x.url === item.url);
        expect(await page.locator(example.selector).count(), example.id).toBeGreaterThan(0);
        if (item.url.endsWith("/table")) await expect(page.locator('dc-modes [data-mode-panel="table"]')).toBeVisible();
        if (!js) await expect(page.locator("dc-command-palette button, dc-help button, as-external-media button")).toHaveCount(0);
      }
      await page.goto("http://127.0.0.1:4174/__design/theme/table/");
      await expect(page.locator('#theme-modes [data-mode-panel="table"]')).toBeVisible();
      if (!js) { await page.locator('#theme-modes [data-mode="list"]').click(); await expect(page).toHaveURL(/\/__design\/theme\/?$/); }
    });
  });
});

test.describe("site.behavior", () => {
  for (const width of [390, 1440]) test.describe(`${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("real modes image action links and native media keys", async ({ page }) => {
      await page.goto("/__design/site");
      await page.locator("#site-type-badge a").focus(); await expect(page.locator("#site-type-badge a")).toBeFocused();
      const image = page.locator("dc-image-toggle").first(); await image.locator("button").click();
      await expect(image).toHaveAttribute("showing", "original");
      await page.goto("/library/all");
      if (width === 1440) {
        await page.locator('dc-modes [data-mode="table"]').click();
        await expect(page).toHaveURL(/\/library\/table$/); await expect(page.locator('dc-modes [data-mode-panel="table"]')).toBeVisible();
        await page.goBack(); await expect(page.locator('dc-modes [data-mode-panel="list"]')).toBeVisible();
      } else {
        // Current phone CSS hides the switch; direct native URLs are covered above.
        await expect(page.locator('dc-modes [data-mode="table"]')).toBeHidden();
      }
      await page.goto("/library/regular-visitor"); const audio = page.locator("audio").first();
      await audio.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Space");
      await expect(page).toHaveURL(/\/library\/regular-visitor$/); await expect(page.locator("dialog[open]")).toHaveCount(0);
    });
  });
});

test.describe("theme.degraded", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("loading and zero matches from controlled local index", async ({ page }) => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/search-index.json", async route => { await gate; await route.fulfill({ json: { entries: [] } }); });
    await page.goto(themeURL); await page.locator("#theme-palette button").click();
    await page.locator("#theme-palette input").fill("absent"); await expect(page.locator("#theme-palette [role=status]")).toHaveText("…");
    release(); await expect(page.locator("#theme-palette [role=status]")).toHaveText(/nothing|match/i);
    await page.keyboard.press("Escape"); await expect(page.locator("#theme-palette button")).toBeFocused();
  });
  test("failed index and refused clipboard keep native navigation", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } } }));
    await page.route("**/search-index.json", route => route.abort());
    await page.goto(themeURL); await page.locator("#theme-copy button").click();
    await expect(page.locator("#theme-copy a")).toHaveAttribute("href", "/__design/theme/");
    await expect(page.locator("#theme-copy dc-copy")).not.toHaveAttribute("copied", "");
    await page.locator("#theme-palette button").click(); await expect(page.locator("#theme-palette [role=status]")).toHaveText("index unavailable");
  });
});

test.describe("site.degraded", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("failed original decode keeps processed image", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true } }));
    await page.goto("/__design/site"); const host = page.locator("dc-image-toggle").first(); const original = await host.getAttribute("data-original");
    await page.route(url => url.pathname === new URL(original!, "http://127.0.0.1:4173").pathname, route => route.abort());
    await host.locator("button").click(); await expect(host).not.toHaveAttribute("showing", "original");
    await expect(host.locator("figure img").first()).toBeVisible();
  });
  test("Home snapshot survives blocked optional enhancement and refresh", async ({ page }) => {
    await page.route("**/*as-dev*.js", route => route.abort()); await page.goto("/");
    const bars = page.locator("[data-dev-bars]"); const snapshot = await bars.textContent(); expect(snapshot!.length).toBeGreaterThan(0);
    await page.unroute("**/*as-dev*.js"); await page.reload();
    await expect(bars).toHaveText(snapshot!); await expect(page.locator("as-dev")).not.toHaveAttribute("data-live", "");
  });
  test("external media before activation and blocked embed preserve outbound link", async ({ page }) => {
    let attempts = 0; await page.route("https://www.youtube-nocookie.com/**", route => { attempts++; return route.abort(); });
    await page.goto("/library/itchatter-parni-hakatonschiki"); const host = page.locator("as-external-media").first();
    await expect(host.locator("iframe")).toHaveCount(0); expect(attempts).toBe(0);
    await host.locator("button").click(); await expect(host.locator("iframe")).toHaveCount(1);
    await expect(host.locator("a").first()).toBeVisible(); await expect.poll(() => attempts).toBeGreaterThan(0);
  });
});

test.describe("reference.media", () => {
  test("reduced motion retains modal behavior and focus return", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 }); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(themeURL); const caller = page.locator("#theme-copy a"); await caller.focus(); await page.keyboard.press("?");
    await expect(page.locator("#theme-help dialog")).toHaveAttribute("open", "");
    await page.keyboard.press("Escape"); await expect(caller).toBeFocused();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  });
  test("forced colors retains focus and local renderer regions", async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ forcedColors: "active" });
    await page.goto(themeURL); await page.locator("#theme-native button").focus(); await expect(page.locator("#theme-native button")).toHaveCSS("outline-style", "solid");
    await expect(page.locator("#theme-typography")).toBeVisible();
    await page.goto("/__design/site"); const table = page.locator(".dc-prose-table").last(); await table.focus(); await expect(table).toBeFocused();
    await table.screenshot({ path: info.outputPath("forced-colors-table.png") }); await noPageOverflow(page, 1440);
  });
  test("print leaves content captions and external link evidence", async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ media: "print" });
    await page.goto(themeURL); await expect(page.locator("#theme-typography")).toBeVisible(); await expect(page.locator("blockquote").first()).toBeVisible();
    await page.goto("/__design/site");
    await expect(page.locator("h1")).toBeVisible(); await expect(page.locator(".dc-header")).toBeHidden();
    await expect(page.locator("dc-image-toggle button").first()).toBeHidden();
    await expect(page.locator(".dc-figure__source").first()).toContainText("Production material");
    await page.locator(".dc-prose-table").first().screenshot({ path: info.outputPath("print-table.png") });
    await page.goto("/library/itchatter-parni-hakatonschiki"); await expect(page.locator(".as-external-media__print").first()).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });
});

test.describe("theme.code-geometry", () => {
  for (const width of widths) for (const js of [true, false]) test.describe(`${width} ${js ? "JS" : "no-JS"}`, () => {
    test.use({ viewport: { width, height: 900 }, javaScriptEnabled: js });
    test("W0026 generic code stays local in reference and ordinary pages", async ({ page }, info) => {
      for (const path of ["/__design/theme/code", "/posts/generic-post"]) {
        await page.goto("http://127.0.0.1:4174" + path);
        const code = page.locator(".dc-prose > pre").first();
        await expect(code).toBeVisible();
        const original = await code.textContent();
        expect(original).toContain("Generic theme code, without site renderer chrome.");
        if (path === "/posts/generic-post") {
          expect(original).toContain("  whitespace and the end of a wide line remain readable:");
          expect(original).toContain(" END");
        }
        const extent = await code.evaluate(el => {
          const pre = el as HTMLElement;
          const box = pre.getBoundingClientRect();
          const panel = pre.closest(".dc-panel")!.getBoundingClientRect();
          const before = pre.scrollLeft;
          pre.scrollLeft = pre.scrollWidth;
          return {
            viewport: innerWidth, page: document.documentElement.scrollWidth,
            left: box.left, right: box.right, panelLeft: panel.left, panelRight: panel.right,
            client: pre.clientWidth, scroll: pre.scrollWidth, before, after: pre.scrollLeft,
            overflow: getComputedStyle(pre).overflowX, whitespace: getComputedStyle(pre).whiteSpace,
          };
        });
        await info.attach("W0026-" + path.split("/").pop(), { body: JSON.stringify(extent), contentType: "application/json" });
        expect(extent.viewport).toBe(width);
        expect(extent.page, "code must not widen the document").toBeLessThanOrEqual(width + 1);
        expect(extent.left).toBeGreaterThanOrEqual(0);
        expect(extent.right).toBeLessThanOrEqual(width + 1);
        expect(extent.panelLeft).toBeGreaterThanOrEqual(0);
        expect(extent.panelRight).toBeLessThanOrEqual(width + 1);
        expect(extent.overflow).toBe("auto");
        expect(extent.whitespace).toBe("pre");
        if (width <= 390 || path === "/posts/generic-post") {
          expect(extent.scroll).toBeGreaterThan(extent.client);
          expect(extent.after).toBeGreaterThan(extent.before);
          expect(extent.after).toBeGreaterThanOrEqual(extent.scroll - extent.client - 1);
        }
        expect(await code.textContent()).toBe(original);
        await noPageOverflow(page, width);
      }
    });
  });
});

test.describe("theme.prompt-narrow", () => {
  test.use({ viewport: { width: 390, height: 900 } });
  test("4B-F2 prompt invocation must expose a usable input", async ({ page }, info) => {
    await page.goto(themeURL); await page.locator("#theme-native button").focus(); await page.keyboard.press(":");
    await expect(page.locator("#theme-prompt")).toHaveAttribute("open", "");
    await info.attach("4B-F2-state", { body: JSON.stringify(await page.locator("#theme-prompt").evaluate(el => ({ open: el.hasAttribute("open"), display: getComputedStyle(el).display }))), contentType: "application/json" });
    test.fail(true, "4B-F2: phone CSS hides even the invoked production prompt");
    await expect(page.locator("#theme-prompt input")).toBeVisible();
  });
});

test.describe("site.media-guard", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const key of ["/", "?"]) test(`W0021 ${key} must remain with native audio`, async ({ page }, info) => {
    await page.goto("/library/regular-visitor"); await page.locator("audio").first().focus();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("AUDIO");
    await page.keyboard.press(key);
    const opened = await page.locator("dialog[open]").count();
    await info.attach("W0021-media-state", { body: JSON.stringify({ key, opened }), contentType: "application/json" });
    test.fail(true, "4B-K6 / W0021: existing global media guard is missing");
    expect(opened, "canonical media-focus guard").toBe(0);
  });
});
