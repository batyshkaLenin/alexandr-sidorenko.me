import { test, expect, type Page } from "@playwright/test";

const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
] as const;

const NARROW_LIBRARY_ROWS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
] as const;

const WIDE_LIBRARY_ROWS = [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
] as const;

const TABLET_STACKS = [
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
] as const;

const WIDES = [
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
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

function boxesOverlap(a: Box, b: Box) {
  return !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5
    || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
}

async function homeLibraryRows(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    return Array.from(document.querySelectorAll(".dc-home .dc-material--dense"), (row) => {
      const title = row.querySelector(".dc-material__title");
      const type = row.querySelector(".dc-list__type");
      const date = row.querySelector(".dc-material__date");
      const titleCs = title ? getComputedStyle(title) : null;
      return {
        title: title?.textContent?.trim() || "",
        titleBox: box(title),
        typeBox: box(type),
        dateBox: box(date),
        titleOverflow: title ? title.scrollWidth - title.clientWidth > 1 : false,
        titleEllipsis: titleCs?.textOverflow || "",
        titleWrap: titleCs?.whiteSpace || "",
      };
    });
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
      await expect(page.locator(".dc-home .dc-filetree")).toHaveCount(0);
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
      await expect(page.locator(".dc-portrait-quote")).toHaveCount(0);
      await expect(page.locator(".dc-portrait-original")).toBeVisible();

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
      expect(type.name).toBe(type.library);
      expect(type.note).toBeGreaterThan(type.name);
      expect(type.activity).toBeLessThanOrEqual(type.name);
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

  for (const viewport of NARROW_LIBRARY_ROWS) {
    test(`phone ${viewport.width}×${viewport.height} stacks Home library titles above type and date`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const rows = await homeLibraryRows(page);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.title, "library row has a title").toBeTruthy();
        expect(row.titleBox).toBeTruthy();
        expect(row.typeBox).toBeTruthy();
        expect(row.dateBox).toBeTruthy();
        expect(boxesOverlap(row.titleBox!, row.typeBox!), row.title).toBe(false);
        expect(boxesOverlap(row.titleBox!, row.dateBox!), row.title).toBe(false);
        expect(row.typeBox!.top, row.title).toBeGreaterThanOrEqual(row.titleBox!.bottom - 1);
        expect(row.dateBox!.top, row.title).toBeGreaterThanOrEqual(row.titleBox!.bottom - 1);
        expect(row.titleWrap, row.title).not.toBe("nowrap");
        expect(row.titleEllipsis, row.title).not.toBe("ellipsis");
      }
    });
  }

  for (const viewport of WIDE_LIBRARY_ROWS) {
    test(`phone ${viewport.width}×${viewport.height} keeps Home library rows without overlap`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const rows = await homeLibraryRows(page);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.titleBox).toBeTruthy();
        expect(row.typeBox).toBeTruthy();
        expect(row.dateBox).toBeTruthy();
        expect(boxesOverlap(row.titleBox!, row.typeBox!), row.title).toBe(false);
        expect(boxesOverlap(row.titleBox!, row.dateBox!), row.title).toBe(false);
      }
    });
  }

  async function homeGeometry(page: Page) {
    return page.evaluate(() => {
      const panel = (label) => {
        const el = Array.from(document.querySelectorAll(".dc-home .dc-panel")).find(
          (node) => node.querySelector(".dc-panel__label")?.textContent?.trim() === label,
        );
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const img = document.querySelector("img.dc-portrait");
      const imgBox = img?.getBoundingClientRect();
      const imgCs = img ? getComputedStyle(img) : null;
      const orig = document.querySelector(".dc-portrait-original")?.getBoundingClientRect();
      const cols = getComputedStyle(document.querySelector(".dc-home")!).gridTemplateColumns;
      return {
        cols: cols === "none" ? 0 : cols.split(" ").filter(Boolean).length,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        avatar: panel("avatar.jpg"),
        about: panel("about.md"),
        neofetch: panel("neofetch"),
        library: panel("library/"),
        activity: panel("activity/"),
        portrait: imgBox && imgCs && img
          ? {
              w: imgBox.width,
              h: imgBox.height,
              fit: imgCs.objectFit,
              naturalRatio: img.naturalWidth / img.naturalHeight,
              boxRatio: imgBox.width / imgBox.height,
              originalGap: orig ? orig.top - imgBox.bottom : null,
            }
          : null,
      };
    });
  }

  for (const viewport of TABLET_STACKS) {
    test(`tablet ${viewport.width}×${viewport.height} stacks Home and keeps the full shell`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect.poll(async () =>
        page.locator("img.dc-portrait").evaluate((img: HTMLImageElement) => img.naturalWidth),
      ).toBeGreaterThan(0);
      await expect(page.locator(".dc-palette__trigger")).toContainText("search");
      await expect(page.locator(".dc-identity")).toBeVisible();
      await expect(page.locator(".dc-neofetch")).toBeHidden();
      const labels = await visiblePanelLabels(page);
      expect(labels).toEqual(["avatar.jpg", "about.md", "library/", "activity/"]);
      const geo = await homeGeometry(page);
      expect(geo.cols).toBe(0);
      expect(geo.overflow).toBeLessThanOrEqual(1);
      expect(geo.about).toBeTruthy();
      expect(geo.about!.w).toBeGreaterThan(viewport.width * 0.7);
      expect(geo.about!.y).toBeGreaterThan(geo.avatar!.y + geo.avatar!.h - 1);
      await expect(page.locator(".dc-portrait-quote")).toHaveCount(0);
    });
  }

  for (const viewport of WIDES) {
    test(`wide ${viewport.width}×${viewport.height} uses the two-column Home`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect.poll(async () =>
        page.locator("img.dc-portrait").evaluate((img: HTMLImageElement) => img.naturalWidth),
      ).toBeGreaterThan(0);
      await expect(page.locator(".dc-home .dc-filetree")).toHaveCount(0);
      await expect(page.locator(".dc-neofetch")).toBeVisible();
      await expect(page.locator(".dc-identity")).toBeVisible();
      await expect(page.locator(".dc-palette__trigger")).toContainText("search");
      const labels = await visiblePanelLabels(page);
      expect(labels).toEqual(expect.arrayContaining([
        "neofetch",
        "about.md",
        "avatar.jpg",
        "library/",
        "activity/",
      ]));
      expect(labels).not.toContain("site/");
      const geo = await homeGeometry(page);
      expect(geo.cols).toBe(2);
      expect(geo.overflow).toBeLessThanOrEqual(1);
      expect(geo.avatar).toBeTruthy();
      expect(geo.about).toBeTruthy();
      expect(geo.neofetch).toBeTruthy();
      expect(geo.library).toBeTruthy();
      expect(Math.abs(geo.avatar!.y - geo.about!.y)).toBeLessThan(8);
      expect(geo.about!.x).toBeGreaterThan(geo.avatar!.x + geo.avatar!.w - 1);
      expect(Math.abs(geo.neofetch!.y - geo.library!.y)).toBeLessThan(8);
      expect(geo.library!.x).toBeGreaterThan(geo.neofetch!.x + geo.neofetch!.w - 1);
      expect(geo.neofetch!.y).toBeGreaterThanOrEqual(geo.avatar!.y + geo.avatar!.h - 1);
      const rows = await homeLibraryRows(page);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(boxesOverlap(row.titleBox!, row.typeBox!), row.title).toBe(false);
        expect(boxesOverlap(row.titleBox!, row.dateBox!), row.title).toBe(false);
      }
      const packed = await page.evaluate(() => {
        const panel = (label) =>
          Array.from(document.querySelectorAll(".dc-home .dc-panel")).find(
            (node) => node.querySelector(".dc-panel__label")?.textContent?.trim() === label,
          );
        const inside = (child, parent) => {
          if (!child || !parent) return false;
          const c = child.getBoundingClientRect();
          const p = parent.getBoundingClientRect();
          return c.top >= p.top - 1 && c.bottom <= p.bottom + 1;
        };
        return {
          moreInLibrary: inside(
            document.querySelector(".dc-home-recent__more"),
            panel("library/"),
          ),
          originalInAvatar: inside(
            document.querySelector(".dc-portrait-original"),
            panel("avatar.jpg"),
          ),
          socialsInAbout: inside(
            document.querySelector(".dc-identity-links"),
            panel("about.md"),
          ),
        };
      });
      expect(packed.moreInLibrary).toBe(true);
      expect(packed.originalInAvatar).toBe(true);
      expect(packed.socialsInAbout).toBe(true);
      expect(geo.avatar!.w).toBeLessThanOrEqual(25 * 16 + 2);
      expect(geo.portrait).toBeTruthy();
      expect(geo.portrait!.w).toBeLessThanOrEqual(25 * 16);
      expect(geo.portrait!.fit).toBe("contain");
      expect(Math.abs(geo.portrait!.boxRatio - geo.portrait!.naturalRatio)).toBeLessThan(0.03);
      expect(geo.portrait!.originalGap).not.toBeNull();
      expect(geo.portrait!.originalGap!).toBeGreaterThanOrEqual(-1);
      expect(geo.portrait!.originalGap!).toBeLessThan(16);
      await expect(page.locator(".dc-portrait-quote")).toHaveCount(0);
      await expect(page.locator(".dc-portrait-original")).toBeVisible();

      if (viewport.width >= 1024) {
        const activityAligned = await page.evaluate(() => {
          const mods = Array.from(document.querySelectorAll(".as-activity__module"))
            .map((el) => el.getBoundingClientRect());
          if (mods.length < 2) return true;
          return Math.abs(mods[0].y - mods[1].y) < 12;
        });
        expect(activityAligned).toBe(true);

        const chrome = await page.evaluate(() => {
          const look = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const cs = getComputedStyle(el);
            const label = el.querySelector(".dc-panel__label");
            const labelCs = label ? getComputedStyle(label) : null;
            return {
              borderLeft: cs.borderLeftWidth,
              borderTop: cs.borderTopWidth,
              labelBottom: labelCs ? labelCs.borderBottomWidth : "0px",
            };
          };
          return {
            utility: look(".dc-home-row--identity > .dc-panel--utility"),
            structural: look(".dc-home .dc-panel--structural"),
            activity: look(".dc-home > .as-activity"),
          };
        });
        expect(chrome.structural.borderLeft).toBe("0px");
        expect(chrome.structural.borderTop).not.toBe("0px");
        expect(chrome.structural.labelBottom).not.toBe("0px");
        expect(chrome.utility.borderTop).not.toBe("0px");
        expect(chrome.activity.borderTop).not.toBe("0px");
        expect(chrome.utility.labelBottom).not.toBe("0px");
      }

      await page.locator("[data-image-original]").click();
      await expect(page.locator("dc-image-toggle")).toHaveAttribute("showing", "original");
      const after = await homeGeometry(page);
      expect(Math.abs(after.portrait!.w - geo.portrait!.w)).toBeLessThan(1);
      expect(Math.abs(after.portrait!.h - geo.portrait!.h)).toBeLessThan(1);

      const labelColors = await page.evaluate(() => {
        const colors = Array.from(document.querySelectorAll(".dc-home .dc-panel"))
          .filter((el) => getComputedStyle(el).display !== "none")
          .map((el) => getComputedStyle(el.querySelector(".dc-panel__label")!).color);
        return [...new Set(colors)];
      });
      expect(labelColors).toHaveLength(1);
    });
  }
});
