import { test, expect } from "@playwright/test";

const LIBRARY = "/library";
const SKVER = "/library/skver";
const ARTICLE = "/library/bluredu-new-teachers";
const NOTE = "/library/cool-kids-of-death-a-moze-tak";

type Box = { x: number; w: number; y: number; h: number };

async function paneBox(page: import("@playwright/test").Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).toBeTruthy();
  return {
    x: Math.round(box!.x),
    w: Math.round(box!.width),
    y: Math.round(box!.y),
    h: Math.round(box!.height),
  };
}

test.describe("publication workspace", () => {
  test("Library and publication panes share 1440 and 1100 geometry", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Viewport cases run once.");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIBRARY);
    const libraryWide = await paneBox(page, ".dc-library > .dc-panel");
    await page.goto(SKVER);
    const skverWide = await paneBox(page, ".dc-panel--detail");
    await page.goto(ARTICLE);
    const articleWide = await paneBox(page, ".dc-panel--detail");
    expect(skverWide.x).toBe(libraryWide.x);
    expect(skverWide.w).toBe(libraryWide.w);
    expect(articleWide.x).toBe(libraryWide.x);
    expect(articleWide.w).toBe(libraryWide.w);

    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(LIBRARY);
    const libraryNarrow = await paneBox(page, ".dc-library > .dc-panel");
    await page.goto(ARTICLE);
    const articleNarrow = await paneBox(page, ".dc-panel--detail");
    expect(articleNarrow.x).toBe(libraryNarrow.x);
    expect(articleNarrow.w).toBe(libraryNarrow.w);
    const collapsed = await page.evaluate(
      () => getComputedStyle(document.querySelector("main.dc-main")!).gridTemplateColumns.split(" ").length,
    );
    expect(collapsed).toBe(1);
  });

  test("visual byline is gone; machine attribution stays", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Attribution once is enough.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SKVER);

    const byline = page.locator("article .byline.p-author.h-card");
    await expect(byline).toHaveCount(1);
    await expect(byline).toHaveClass(/dc-visually-hidden/);
    const visible = await byline.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8 && r.y < window.innerHeight && r.y + r.height > 0;
    });
    expect(visible).toBe(false);
    await expect(byline.locator(".p-name")).toHaveCount(1);
    await expect(byline.locator(".u-photo")).toHaveCount(1);
    await expect(byline.locator("img, picture")).toHaveCount(0);
    for (const part of [".p-name", ".username"]) {
      const visible = await byline.locator(part).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8;
      });
      expect(visible).toBe(false);
    }

    const jsonLd = await page.evaluate(() => {
      const raw = document.querySelector("script[type='application/ld+json']")?.textContent;
      return raw ? JSON.parse(raw) : null;
    });
    expect(jsonLd?.author).toBeTruthy();
    expect(jsonLd.author.name || jsonLd.author[0]?.name).toBeTruthy();
  });

  test("aftermatter follows the reading measure, not a second pane", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Aftermatter geometry once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE);
    await expect(page.locator(".dc-identity__back")).toHaveCount(0);
    const article = await paneBox(page, ".dc-panel--detail");
    const title = await paneBox(page, ".dc-title");
    const after = await paneBox(page, ".dc-aftermatter");
    expect(after.x).toBeGreaterThanOrEqual(article.x - 1);
    expect(after.x + after.w).toBeLessThanOrEqual(article.x + article.w + 1);
    expect(Math.abs(after.x - title.x)).toBeLessThan(8);
    expect(Math.abs(after.w - title.w)).toBeLessThan(24);
  });

  test("publication chrome: type, date, tags", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Chrome links once.");
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(ARTICLE);
    const type = page.locator(".dc-publication__meta a.dc-list__type");
    await expect(type).toHaveAttribute("href", /\/library\/types\/article\/?$/);
    await expect(page.locator(".dc-publication__meta time.dt-published")).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);

    await page.goto(NOTE);
    const tag = page.locator(".tags a[rel='tag']").first();
    await expect(tag).toHaveAttribute("href", /\/library\/topics\/.+/);
    const emptyGroup = await page.evaluate(
      () =>
        [...document.querySelectorAll(".dc-relations__group")].some(
          (group) => group.querySelectorAll("li").length === 0,
        ),
    );
    expect(emptyGroup).toBe(false);
    await expect(page.locator(".dc-relations")).toContainText("Hej chłopcze");
    await expect(page.locator("div.dc-verse")).toHaveCount(1);
    await expect(page.locator("blockquote.as-parallel-text.dc-verse").first()).toBeVisible();
  });
});
