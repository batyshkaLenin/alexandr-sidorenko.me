import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const PAGES = ["/", "/library", "/library/all", "/library/bluredu-new-teachers"];

type PanelReport = { label: string; outside: string[]; slack: number };

// In-flow content of each visible pane: positioned layers (overlays, the TOC
// rail, visually hidden text) and anything inside its own scroller are not
// part of the pane's box.
async function panels(page: Page, selector: string): Promise<PanelReport[]> {
  return page.evaluate((selector) => {
    const detached = (el: Element, panel: Element) => {
      for (let node: Element | null = el; node && node !== panel; node = node.parentElement) {
        const cs = getComputedStyle(node);
        if (cs.position === "absolute" || cs.position === "fixed") return true;
        if (node !== el && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) return true;
      }
      return false;
    };
    return Array.from(document.querySelectorAll(selector))
      .filter((panel) => (panel as HTMLElement).offsetHeight > 0)
      .map((panel) => {
        const box = panel.getBoundingClientRect();
        const outside: string[] = [];
        let bottom = box.top;
        for (const el of Array.from(panel.querySelectorAll("*"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || detached(el, panel)) continue;
          bottom = Math.max(bottom, r.bottom);
          if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) {
            outside.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
          }
        }
        const label = panel.querySelector(".dc-panel__label")?.textContent?.trim() || String(panel.className).split(" ")[0];
        return { label, outside: outside.slice(0, 5), slack: Math.round(box.bottom - bottom) };
      });
  }, selector);
}

test.describe("CSS isolation", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Explicit viewport matrix runs once.");
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}×${viewport.height}: no sideways pan, nothing outside its pane`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of PAGES) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, path).toBeLessThanOrEqual(1);
        for (const panel of await panels(page, ".dc-main .dc-panel")) {
          expect(panel.outside, `${path} ${panel.label}`).toEqual([]);
        }
      }
    });
  }

  for (const viewport of VIEWPORTS.filter((v) => v.width >= 768)) {
    test(`${viewport.width}×${viewport.height}: Home panes are as tall as their content`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const reports = await panels(page, ".dc-home .dc-panel, .dc-home > .as-activity");
      expect(reports.length).toBeGreaterThanOrEqual(3);
      for (const panel of reports) {
        expect(panel.slack, panel.label).toBeLessThan(40);
      }
      const clipped = await page.evaluate(() => {
        const home = document.querySelector(".dc-home")!.getBoundingClientRect();
        const last = Array.from(document.querySelectorAll(".dc-home .dc-panel, .dc-home > .as-activity"))
          .reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), home.top);
        return getComputedStyle(document.body).overflow === "hidden" && last > window.innerHeight + 1;
      });
      expect(clipped).toBe(false);
    });
  }

  for (const viewport of [{ width: 1024, height: 600 }, { width: 1100, height: 500 }] as const) {
    test(`${viewport.width}×${viewport.height}: a short wide Home keeps every pane reachable`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const reach = await page.evaluate(() => {
        const main = document.querySelector(".dc-main") as HTMLElement;
        const box = main.getBoundingClientRect();
        const last = Array.from(document.querySelectorAll(".dc-home .dc-panel, .dc-home > .as-activity"))
          .reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), box.top);
        const overflowY = getComputedStyle(main).overflowY;
        const scrollable = overflowY === "auto" || overflowY === "scroll";
        main.scrollTop = main.scrollHeight;
        const after = Array.from(document.querySelectorAll(".dc-home .dc-panel, .dc-home > .as-activity"))
          .reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), box.top);
        const portrait = document.querySelector(".dc-portrait")!.getBoundingClientRect().width;
        return { hidden: getComputedStyle(document.body).overflow === "hidden", beyond: last > box.bottom + 1, scrollable, reached: after <= box.bottom + 1, portrait };
      });
      expect(reach.hidden).toBe(true);
      expect(reach.portrait, "the portrait is not sized away by a short window").toBeGreaterThanOrEqual(64);
      if (reach.beyond) {
        expect(reach.scrollable).toBe(true);
        expect(reach.reached).toBe(true);
      }
    });
  }
});
