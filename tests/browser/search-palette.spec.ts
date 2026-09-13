import { test, expect, type Page } from "@playwright/test";

const PHONES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const;

async function mockIndex(page: Page) {
  await page.route("**/search-index.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            title: `${"alpha-".repeat(20)} unique-needle ${"-omega".repeat(20)}`,
            url: "/library/match-end",
            path: `~/library/${"very-long-path-segment/".repeat(6)}match-end`,
            type: "Текст",
            text: `${"alpha-".repeat(20)} unique-needle ${"-omega".repeat(20)}`,
          },
        ],
      }),
    });
  });
}

test.describe("search palette", () => {
  for (const viewport of PHONES) {
    test(`phone ${viewport.width}×${viewport.height} uses 16px input and does not clip a mark`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await mockIndex(page);
      await page.goto("/");
      await page.locator(".dc-palette__trigger").click();
      const dialog = page.locator("dc-command-palette dialog[open]");
      await expect(dialog).toBeVisible();

      const metrics = await page.evaluate(() => {
        const input = document.querySelector<HTMLElement>(".dc-palette__input")!;
        const open = document.querySelector<HTMLElement>("dc-command-palette dialog[open]")!;
        const box = open.getBoundingClientRect();
        return {
          fontSize: parseFloat(getComputedStyle(input).fontSize),
          dialogHeight: Math.round(box.height),
          innerHeight: window.innerHeight,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          maximumScale: document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "",
        };
      });
      expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.dialogHeight).toBeLessThan(metrics.innerHeight);
      expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
      expect(metrics.maximumScale).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);

      await page.locator("dc-command-palette .dc-palette__input").fill("unique-needle");
      const mark = page.locator(".dc-palette__title mark, .dc-palette__context mark").first();
      await expect(mark).toHaveText("unique-needle");
      const boxes = await mark.evaluate((el) => {
        const field = el.parentElement!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return {
          left: box.left - field.left,
          right: field.right - box.right,
          width: box.width,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(boxes.left).toBeGreaterThanOrEqual(-1);
      expect(boxes.right).toBeGreaterThanOrEqual(-1);
      expect(boxes.width).toBeGreaterThan(8);
      expect(boxes.overflow).toBeLessThanOrEqual(1);
    });
  }

  test("desktop Search keeps the inherited field size and a compact panel", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Desktop Search once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.keyboard.press("/");
    const desktop = await page.evaluate(() => {
      const open = document.querySelector<HTMLElement>("dc-command-palette dialog[open]")!;
      const box = open.getBoundingClientRect();
      return {
        fontSize: parseFloat(getComputedStyle(document.querySelector(".dc-palette__input")!).fontSize),
        width: box.width,
        height: box.height,
        innerHeight: window.innerHeight,
      };
    });
    expect(desktop.fontSize).toBeLessThan(16);
    expect(desktop.width).toBeLessThanOrEqual(680);
    expect(desktop.height).toBeLessThan(desktop.innerHeight * 0.9);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });
});
