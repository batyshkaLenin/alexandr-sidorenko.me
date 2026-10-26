import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ARTICLE = "/library/bluredu-new-teachers";
const FICTION = "/library/svidetel-v-bagazhnike";
type Fixture = { slug: string; type: string; toc: number; error: string | null; works: boolean };
let fixtureRoot: string;
let fixtures: { public: string; cases: Fixture[] };

test.beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "prose-toc-"));
  fixtures = JSON.parse(execFileSync("python3", [
    "scripts/check-a11y-contract.py", "--toc-fixtures", fixtureRoot,
  ], { encoding: "utf8" }));
});

test.afterAll(() => { if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true }); });

test.beforeEach(async ({ page, context }) => {
  await context.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.route("**/library/w0071-fixture-*", route => {
    const slug = new URL(route.request().url()).pathname.split("/").pop()!;
    expect(fixtures.cases.some(item => item.slug === slug)).toBe(true);
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: readFileSync(join(fixtures.public, "library", slug, "index.html")) });
  });
});

test.describe("article toc", () => {
  test("one #TableOfContents landmark; wide CSS only pulls it into the rail", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Viewport cases run once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE);

    expect(await page.locator("#TableOfContents").count()).toBe(1);
    expect(await page.locator(".dc-toc").count()).toBe(1);
    await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(1);
    await expect(page.locator(".dc-toc--column")).toHaveCount(0);
    await expect(page.locator(".dc-toc--folded")).toHaveCount(0);

    const atTop = await page.evaluate(() => {
      const rail = document.querySelector(".dc-toc__rail") || document.querySelector(".dc-toc");
      const pane = document.querySelector(".dc-panel--detail")!;
      const railBox = rail.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
      return {
        inRail: railBox.x + 24 < paneBox.x,
        alignedWithPaneTop: Math.abs(railBox.y - paneBox.y) <= 2,
      };
    });
    expect(atTop.inRail).toBe(true);
    expect(atTop.alignedWithPaneTop).toBe(true);

    const href = await page.locator(".dc-toc a[href^='#']").first().getAttribute("href");
    expect(href).toMatch(/^#./);
    const heading = page.locator(href!);
    await expect(heading).toHaveCount(1);
    await expect(page.locator(".dc-toc a[href^='#']").first()).toBeVisible();
    await page.locator(".dc-toc a[href^='#']").first().click();
    await expect(heading).toBeInViewport();

    const afterScroll = await page.evaluate(() => {
      const rail = document.querySelector(".dc-toc__rail")!;
      const r = rail.getBoundingClientRect();
      return {
        stuck: r.y <= 30,
        visible: r.bottom > 0 && r.top < window.innerHeight,
        sticky: getComputedStyle(rail).position === "sticky",
      };
    });
    expect(afterScroll.sticky).toBe(true);
    expect(afterScroll.stuck).toBe(true);
    expect(afterScroll.visible).toBe(true);
  });

  test("1100px keeps the same TOC node after type/date, under the title", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Viewport cases run once.");
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(ARTICLE);

    expect(await page.locator("#TableOfContents").count()).toBe(1);
    const order = await page.evaluate(() => {
      const pane = document.querySelector(".dc-panel--detail")!;
      const label = pane.querySelector(".dc-panel__label")!;
      const title = pane.querySelector(".dc-title")!;
      const meta = pane.querySelector(".dc-publication__meta")!;
      const toc = pane.querySelector(".dc-toc")!;
      const body = pane.querySelector(".dc-article__body")!;
      const header = document.querySelector(".dc-header")!;
      const labelBox = label.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const metaBox = meta.getBoundingClientRect();
      const tocBox = toc.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const overlaps = (a, b) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        labelBeforeTitle: label.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
        titleBeforeMeta: title.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING,
        metaBeforeToc: meta.compareDocumentPosition(toc) & Node.DOCUMENT_POSITION_FOLLOWING,
        tocBeforeBody: toc.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
        tocBelowTitle: tocBox.y > titleBox.bottom - 1,
        tocBelowMeta: tocBox.y > metaBox.bottom - 1,
        tocBelowLabel: tocBox.y > labelBox.bottom - 1,
        tocInsidePane: tocBox.x >= paneBox.x - 1,
        tocInsideHead: !!title.parentElement?.contains(toc),
        detailsOpen: toc.querySelector("details")?.open ?? null,
        labelOverlapsHeader: overlaps(labelBox, headerBox),
        labelOnPaneEdge: labelBox.top < paneBox.top && labelBox.bottom > paneBox.top,
      };
    });
    expect(order.labelBeforeTitle).toBeTruthy();
    expect(order.titleBeforeMeta).toBeTruthy();
    expect(order.metaBeforeToc).toBeTruthy();
    expect(order.tocBeforeBody).toBeTruthy();
    expect(order.tocBelowTitle).toBe(true);
    expect(order.tocBelowMeta).toBe(true);
    expect(order.tocBelowLabel).toBe(true);
    expect(order.tocInsidePane).toBe(true);
    expect(order.tocInsideHead).toBe(true);
    expect(order.detailsOpen).toBe(false);
    expect(order.labelOverlapsHeader).toBe(false);
    expect(order.labelOnPaneEdge).toBe(true);
    await expect(page.locator(".dc-toc__summary")).toBeVisible();
  });

  test("phone 390×844 uses the same node as closed details", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Viewport cases run once.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ARTICLE);

    expect(await page.locator("#TableOfContents").count()).toBe(1);
    await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(1);
    await expect(page.locator(".dc-toc__summary")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.locator(".dc-toc__summary").click();
    const href = await page.locator(".dc-toc a[href^='#']").first().getAttribute("href");
    expect(href).toMatch(/^#./);
    const heading = page.locator(href!);
    await expect(heading).toHaveCount(1);
    await page.locator(".dc-toc a[href^='#']").first().click();
    await expect(heading).toBeInViewport();
  });
});

for (const javaScriptEnabled of [true, false]) test.describe(`prose TOC JS ${javaScriptEnabled}`, () => {
  test.use({ javaScriptEnabled });

  test("real renderers obey the threshold and preserve exclusions", async ({ page }) => {
    for (const item of fixtures.cases) {
      await page.goto(`/library/${item.slug}`);
      const toc = page.getByRole("navigation", { name: "Contents", exact: true });
      await expect(toc).toHaveCount(item.toc ? 1 : 0);
      await expect(toc.locator("a")).toHaveCount(item.toc);
      if (item.works) await expect(page.getByRole("navigation", { name: "Works in this collection" })).toHaveCount(1);
      if (item.error) await expect(page.locator('[id="same"]')).toHaveCount(2);
      if (item.slug.endsWith("unicode")) {
        expect(await page.locator(".e-content h2, .e-content h3").evaluateAll(nodes => nodes.map(node => node.id)))
          .toEqual(["повтор", "повтор-1", "ёж-и-чай", "stable-section"]);
      }
      if (item.slug.endsWith("paper-abstract")) {
        await expect(page.locator(".dc-paper__abstract")).toHaveText(/Аннотация не является разделом/);
        await expect(toc.locator('a[href="#dc-abstract-title"]')).toHaveCount(0);
      }
    }
    for (const path of ["/library/skver", "/library/philosophy-of-freedom", "/library/trafaret", "/library/regular-visitor", "/library/itchatter-hakatony", "/library/cool-kids-of-death-a-moze-tak"]) {
      await page.goto(path);
      await expect(page.locator(".dc-toc, .dc-toc__disclosure")).toHaveCount(0);
    }
  });

  for (const width of [320, 390, 768, 1100, 1101, 1440]) {
    test(`existing rail does not reduce reading measure at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [ARTICLE, FICTION]) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const toc = page.getByRole("navigation", { name: "Contents", exact: true });
        await expect(toc).toHaveCount(1);
        await expect(page.locator("#TableOfContents")).toHaveCount(1);
        await expect(toc.locator("a")).toHaveCount(path === FICTION ? 11 : 3);
        if (path === FICTION) {
          await expect(page.locator(".as-reader__head .dc-publication__meta")).toHaveCount(0);
          await expect(page.locator(".dc-fiction__colophon time.dt-published")).toHaveCount(1);
        }
        const boxes = await page.evaluate(() => {
          const body = document.querySelector(".e-content")!.getBoundingClientRect();
          const pane = document.querySelector(".dc-panel--detail")!.getBoundingClientRect();
          const rail = document.querySelector(".dc-toc__rail")!.getBoundingClientRect();
          const toc = document.querySelector(".dc-toc")!;
          const order = !!(toc.compareDocumentPosition(document.querySelector(".e-content")!) & Node.DOCUMENT_POSITION_FOLLOWING);
          return { body: { x: body.x, width: body.width }, pane: { x: pane.x, y: pane.y }, rail: { right: rail.right, y: rail.y }, order, overflow: document.documentElement.scrollWidth - innerWidth };
        });
        expect(boxes.overflow).toBeLessThanOrEqual(1);
        expect(boxes.order).toBe(true);
        if (width > 1100) {
          expect(boxes.rail.right).toBeLessThan(boxes.pane.x);
          expect(Math.abs(boxes.rail.y - boxes.pane.y)).toBeLessThanOrEqual(2);
        } else {
          await expect(page.locator(".dc-toc__disclosure")).not.toHaveAttribute("open");
          await expect(page.locator(".dc-toc__summary")).toBeVisible();
          await expect(toc.locator("a").first()).toBeHidden();
          await page.locator(".dc-toc__summary").click();
          await expect(toc.locator("a").first()).toBeVisible();
        }
        const without = await page.evaluate(() => {
          document.querySelector(".dc-toc")!.remove();
          const rect = document.querySelector(".e-content")!.getBoundingClientRect();
          return { x: rect.x, width: rect.width };
        });
        expect(without.x).toBeCloseTo(boxes.body.x, 1);
        expect(without.width).toBeCloseTo(boxes.body.width, 1);
      }
    });
  }

  for (const width of [320, 390, 740, 1100]) test(`disclosure colour and native marker show its state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ARTICLE);
    const summary = page.locator(".dc-toc__summary");
    const details = page.locator(".dc-toc__disclosure");
    const first = page.locator(".dc-toc a").first();
    await expect(summary).toHaveText("toc/");
    await expect(details).not.toHaveAttribute("open");
    await expect(summary).toHaveCSS("list-style-type", "disclosure-closed");
    await expect(summary).toHaveCSS("list-style-position", "inside");
    const colour = await summary.evaluate(node => {
      const probe = document.createElement("span");
      probe.style.color = "var(--dc-primary)";
      node.append(probe);
      const result = { actual: getComputedStyle(node).color, expected: getComputedStyle(probe).color };
      probe.remove();
      return result;
    });
    expect(colour.actual).toBe(colour.expected);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(summary).toHaveCSS("list-style-type", "disclosure-open");
    await expect(first).toBeVisible();
    expect(await summary.evaluate(node => node.matches(":focus-visible")
      && getComputedStyle(node).outlineStyle !== "none")).toBe(true);
    await page.keyboard.press("Space");
    await expect(details).not.toHaveAttribute("open");
    await expect(first).toBeHidden();
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await expect(summary).toHaveCSS("list-style-type", "disclosure-closed");
    const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    if (touch) await summary.tap(); else await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(summary).toHaveCSS("list-style-type", "disclosure-open");
    await expect(first).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  for (const width of [390, 1440]) test(`native Cyrillic anchors, focus, reload and history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FICTION);
    const summary = page.locator(".dc-toc__summary");
    if (width <= 1100) {
      await summary.focus();
      await page.keyboard.press("Enter");
    }
    const links = page.locator(".dc-toc a");
    const first = decodeURIComponent((await links.first().getAttribute("href"))!.slice(1));
    await links.first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(links.first()).toBeFocused();
    expect(await links.first().evaluate(node => node.matches(":focus-visible") && getComputedStyle(node).outlineStyle !== "none")).toBe(true);
    await page.keyboard.press("Enter");
    const visible = (id: string) => page.evaluate(id => {
      const rect = document.getElementById(id)!.getBoundingClientRect();
      return rect.top >= -1 && rect.top < innerHeight;
    }, id);
    await expect.poll(() => visible(first)).toBe(true);
    await page.reload();
    await expect.poll(() => visible(first)).toBe(true);
    if (width <= 1100) await summary.click();
    const lastId = decodeURIComponent((await links.last().getAttribute("href"))!.slice(1));
    await links.last().focus();
    if (width > 1100) {
      const fits = await links.last().evaluate(node => {
        const link = node.getBoundingClientRect(), tree = node.closest(".dc-toc__tree")!.getBoundingClientRect();
        return link.top >= tree.top - 1 && link.bottom <= tree.bottom + 1;
      });
      expect(fits).toBe(true);
    }
    await page.keyboard.press("Enter");
    await expect.poll(() => visible(lastId)).toBe(true);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash.slice(1)))).toBe(first);
    await page.goForward();
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash.slice(1)))).toBe(lastId);
  });
});
