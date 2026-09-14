import { test, expect } from "@playwright/test";

const LIBRARY = "/library";
const SKVER = "/library/skver";
const ARTICLE = "/library/bluredu-new-teachers";

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
});
