import { test, expect, type Page } from "@playwright/test";

const PHONES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const;

const DESKTOPS = [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

type Box = { top: number; right: number; bottom: number; left: number };

async function shellBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    const home = document.querySelector('.dc-nav__list a[href="/"]');
    const library = document.querySelector('.dc-nav__list a[href="/library"]');
    const search = document.querySelector(".dc-palette__trigger");
    return {
      home: box(home),
      library: box(library),
      search: box(search),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth > 1,
      headerOverflow: (() => {
        const header = document.querySelector(".dc-header");
        return header ? header.scrollWidth - header.clientWidth > 1 : false;
      })(),
    };
  });
}

function expectOneRow(home: Box, library: Box, search: Box) {
  const mid = (box: Box) => (box.top + box.bottom) / 2;
  expect(Math.abs(mid(home) - mid(library))).toBeLessThan(8);
  expect(Math.abs(mid(library) - mid(search))).toBeLessThan(12);
  expect(search.left).toBeGreaterThan(library.right - 1);
}

async function visiblePanelLabels(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll(".dc-home .dc-panel"))
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return el.getBoundingClientRect().height > 0;
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((el) => el.querySelector(".dc-panel__label")?.textContent?.trim() || "");
  });
}

test.describe("home shell", () => {
  for (const viewport of PHONES) {
    test(`phone ${viewport.width}×${viewport.height} keeps Home/Library/Search on one row`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".dc-palette__trigger")).toBeVisible();
      const boxes = await shellBoxes(page);
      expect(boxes.home).toBeTruthy();
      expect(boxes.library).toBeTruthy();
      expect(boxes.search).toBeTruthy();
      expectOneRow(boxes.home!, boxes.library!, boxes.search!);
      expect(boxes.pageOverflow).toBe(false);
      expect(boxes.headerOverflow).toBe(false);
    });

    test(`phone ${viewport.width}×${viewport.height} Home content is portrait → about → library → activity`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const labels = await visiblePanelLabels(page);
      expect(labels).toEqual(["avatar.jpg", "about.md", "library/", "activity/"]);
      await expect(page.locator(".dc-filetree")).toBeHidden();
      await expect(page.locator(".dc-neofetch")).toBeHidden();
      await expect(page.locator(".dc-identity")).toBeHidden();
      const selfUrl = page.locator(".h-card .u-url");
      await expect(selfUrl).toHaveAttribute("href", "https://alexandr-sidorenko.me/");
      const selfBox = await selfUrl.boundingBox();
      expect(selfBox, "self URL stays in the h-card").toBeTruthy();
      expect(selfBox!.width).toBeLessThanOrEqual(1);
      expect(selfBox!.height).toBeLessThanOrEqual(1);
    });

    test(`phone ${viewport.width}×${viewport.height} shows the full portrait frame`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const portrait = page.locator("img.dc-portrait");
      await expect(portrait).toBeVisible();
      await expect.poll(async () => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);

      const portraitMetrics = async () => {
        await portrait.evaluate(async (img: HTMLImageElement) => {
          if (img.complete && img.naturalWidth > 0) return;
          await img.decode();
        });
        return portrait.evaluate((img: HTMLImageElement) => {
          const box = img.getBoundingClientRect();
          return {
            naturalRatio: img.naturalWidth / img.naturalHeight,
            boxRatio: box.width / box.height,
            width: box.width,
            height: box.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          };
        });
      };

      const before = await portraitMetrics();
      expect(before.naturalWidth).toBeGreaterThan(0);
      expect(Math.abs(before.boxRatio - before.naturalRatio)).toBeLessThan(0.03);

      await page.locator("[data-image-original]").click();
      await expect(page.locator("dc-image-toggle")).toHaveAttribute("showing", "original");
      const after = await portraitMetrics();
      expect(after.naturalWidth).toBeGreaterThan(0);
      expect(Math.abs(after.boxRatio - after.naturalRatio)).toBeLessThan(0.03);
      expect(Math.abs(after.width - before.width)).toBeLessThan(1);
      expect(Math.abs(after.height - before.height)).toBeLessThan(1);
    });

    test(`phone ${viewport.width}×${viewport.height} keeps the name on one line`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const parts = page.locator(".dc-hero-name__part");
      await expect(parts).toHaveCount(2);
      const tops = await parts.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().top),
      );
      expect(Math.abs(tops[0] - tops[1])).toBeLessThan(1);
      const overflow = await page.locator(".dc-hero-name").evaluate((el) =>
        el.scrollWidth - el.clientWidth > 1
      );
      expect(overflow).toBe(false);
      const type = await page.evaluate(() => {
        const size = (selector: string) =>
          Number.parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
        return {
          name: size(".dc-hero-name"),
          note: size(".p-note"),
          library: size(".dc-home .dc-material__title"),
          activity: size(".as-activity__value"),
        };
      });
      expect(type.name).toBe(type.note);
      expect(type.library).toBeLessThanOrEqual(type.note);
      expect(type.activity).toBeLessThanOrEqual(type.note);
      const labelColors = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll(".dc-home .dc-panel"))
          .filter((el) => getComputedStyle(el).display !== "none")
          .map((el) => getComputedStyle(el.querySelector(".dc-panel__label")!).color);
        return [...new Set(labels)];
      });
      expect(labelColors).toHaveLength(1);
    });
  }

  test("compact Search opens from click, keyboard and has an accessible name", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Search covered on the phone matrix.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const trigger = page.locator(".dc-palette__trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-label", /search/i);
    await expect(trigger.locator(".dc-palette__label")).toBeHidden();
    expect((await trigger.innerText()).trim()).toBe("/");
    const border = await trigger.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(border).not.toBe("0px");
    await trigger.focus();
    expect(await trigger.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

    await trigger.click();
    const dialog = page.locator("dc-command-palette dialog[open]");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press("/");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
  });

  for (const viewport of DESKTOPS) {
    test(`desktop ${viewport.width}×${viewport.height} keeps workstation Home chrome`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Desktop viewports run once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".dc-filetree")).toBeVisible();
      await expect(page.locator(".dc-neofetch")).toBeVisible();
      await expect(page.locator(".dc-identity")).toBeVisible();
      await expect(page.locator(".dc-palette__trigger")).toContainText("search");
      const labels = await visiblePanelLabels(page);
      expect(labels).toEqual(expect.arrayContaining([
        "site/",
        "about.md",
        "avatar.jpg",
        "library/",
        "activity/",
      ]));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth > 1,
      );
      expect(overflow).toBe(false);
      const labelColors = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll(".dc-home .dc-panel"))
          .filter((el) => getComputedStyle(el).display !== "none")
          .map((el) => getComputedStyle(el.querySelector(".dc-panel__label")!).color);
        return [...new Set(labels)];
      });
      expect(labelColors).toHaveLength(1);
    });
  }
});
