import { test, expect } from "@playwright/test";

const ARTICLE = "/library/bluredu-new-teachers";

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
      const labelBox = label.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const metaBox = meta.getBoundingClientRect();
      const tocBox = toc.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
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
