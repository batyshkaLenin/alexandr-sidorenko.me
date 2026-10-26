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

  // A reader at 200% text must not have to scroll sideways (WCAG 1.4.4/1.4.10).
  // The browser's own font size is what media queries read, so emulate that
  // setting instead of styling the root element.
  for (const javaScriptEnabled of [true, false]) {
    test.describe(`shell JS ${javaScriptEnabled ? "on" : "off"}`, () => {
      test.use({ javaScriptEnabled });
      for (const viewport of [
        { width: 320, height: 844 }, { width: 390, height: 844 },
        { width: 741, height: 768 }, { width: 768, height: 768 },
        { width: 1440, height: 900 },
      ] as const) {
        test(`${viewport.width}px with a 32px browser font keeps every page in one column`, async ({ page, context }) => {
          const client = await context.newCDPSession(page);
          await client.send("Page.enable");
          await client.send("Page.setFontSizes" as never, { fontSizes: { standard: 32, fixed: 32 } } as never);
          await page.setViewportSize(viewport);
          for (const path of ["/", "/library", "/library/table", "/library/timeline", "/library/topics", "/library/types", "/library/types/fiction", "/library/skver", "/library/bluredu-new-teachers"]) {
            await page.goto(path);
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            const measured = await page.evaluate(() => ({
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              root: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
            }));
            expect(measured.root, "the browser font size is emulated").toBe(32);
            expect(measured.overflow, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(1);
          }
        });
      }

      for (const viewport of [
        { width: 741, height: 768 }, { width: 768, height: 768 },
        { width: 1440, height: 1200 },
      ]) {
        test(`${viewport.width}px: enlarged text keeps focused links above the status bar`, async ({ page, context }) => {
          const client = await context.newCDPSession(page);
          await client.send("Page.enable");
          await client.send("Page.setFontSizes" as never, { fontSizes: { standard: 32, fixed: 32 } } as never);
          await page.setViewportSize(viewport);
          const visibleFocus = () => page.evaluate(() => {
            const active = document.activeElement!;
            const box = active.getBoundingClientRect();
            const line = Array.from(active.getClientRects()).filter(r => r.width && r.height).at(-1)!;
            const hit = line && document.elementFromPoint(line.x + line.width / 2, line.y + line.height / 2);
            const bar = document.querySelector(".dc-statusbar")?.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight
              && !!hit && (hit === active || active.contains(hit))
              && (!bar?.height || box.bottom + 4 <= bar.top);
          });
          for (const path of ["/", "/library", "/library/bluredu-new-teachers"]) {
            await page.goto(path);
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            const link = page.locator(".dc-main a[href]:visible").last();
            await link.scrollIntoViewIfNeeded();
            await link.focus();
            await expect.poll(visibleFocus, path).toBe(true);
            if (javaScriptEnabled) {
              await page.keyboard.press("/");
              await expect(page.locator("dc-command-palette dialog[open]")).toBeVisible();
              await page.keyboard.press("Escape");
              await expect(link).toBeFocused();
              await expect.poll(visibleFocus, `${path}: palette return`).toBe(true);
            }
            if (path === "/" && viewport.width === 1440) {
              await page.evaluate(() => {
                window["__shellEndEvents"] = [];
                document.addEventListener("keydown", e => {
                  if (e.key === "End") queueMicrotask(() => window["__shellEndEvents"].push(e.defaultPrevented));
                });
              });
              await page.keyboard.press("Control+End");
              await expect.poll(() => page.evaluate(() =>
                Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight))
              )).toBeLessThanOrEqual(1);
              if (javaScriptEnabled) {
                expect(await page.evaluate(() => window["__shellEndEvents"])).toEqual([false]);
              }
              await expect.poll(visibleFocus).toBe(true);
            }
          }
        });
      }
    });
  }

  test("the copy control keeps a 24px target on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/library/bluredu-new-teachers");
    const button = page.locator(".dc-copy__button").first();
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
    expect(box.width).toBeGreaterThanOrEqual(24);
  });
});
