import { test, expect, type Page } from "@playwright/test";

// A reader who raises the browser font size raises the root font size; every
// text role must follow it instead of staying at a fixed pixel size.
const ROLES: Record<string, string[]> = {
  "/": [".dc-nav__link", ".dc-hero-name", ".dc-home .p-note", ".dc-home .dc-material__title", ".dc-statusbar"],
  "/library/bluredu-new-teachers": [".dc-panel--detail .dc-prose", ".dc-panel__label", ".dc-toc__summary"],
};

async function sizes(page: Page, selectors: string[]) {
  return page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => {
    const el = document.querySelector(selector);
    return [selector, el ? Number.parseFloat(getComputedStyle(el).fontSize) : null];
  })), selectors);
}

test.describe("font scaling", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Computed type scale is engine-independent.");
  });

  for (const [path, selectors] of Object.entries(ROLES)) {
    test(`${path}: text follows the reader's root font size`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const base = await sizes(page, selectors);
      await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
      const scaled = await sizes(page, selectors);
      for (const selector of selectors) {
        expect(base[selector], `${selector} exists`).not.toBeNull();
        expect(scaled[selector]! / base[selector]!, selector).toBeCloseTo(1.25, 2);
      }
    });
  }
});
