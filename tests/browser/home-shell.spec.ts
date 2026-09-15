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

function circleHitsRect(cx: number, cy: number, diameter: number, box: Box) {
  const radius = diameter / 2;
  const closestX = Math.max(box.left, Math.min(cx, box.right));
  const closestY = Math.max(box.top, Math.min(cy, box.bottom));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius - 0.01;
}

function targetSizePairOk(a: Box, b: Box, min = 24) {
  const sized = (box: Box) =>
    box.right - box.left + 0.5 >= min && box.bottom - box.top + 0.5 >= min;
  const hits = (from: Box, into: Box) =>
    circleHitsRect((from.left + from.right) / 2, (from.top + from.bottom) / 2, min, into);
  if (!sized(a) && hits(a, b)) return false;
  if (!sized(b) && hits(b, a)) return false;
  return true;
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

async function aboutTypeSize(page: Page) {
  return page.evaluate(
    () => getComputedStyle(document.querySelector(".dc-home .h-card > .dc-prose")!).fontSize,
  );
}

async function activityModuleLayout(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".as-activity__module")).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: r.x,
        y: r.y,
        borderLeft: Number.parseFloat(cs.borderLeftWidth),
        paddingLeft: Number.parseFloat(cs.paddingLeft),
      };
    }),
  );
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

    test(`phone ${viewport.width}×${viewport.height} does not advertise keyboard chrome`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const trigger = page.locator(".dc-palette__trigger");
      await expect(trigger).toBeVisible();
      await expect(trigger.locator(".dc-palette__key")).toBeHidden();
      await expect(trigger.locator(".dc-palette__label")).toBeVisible();
      expect((await trigger.innerText()).trim()).toBe("search");
      await expect(page.locator(".dc-help__trigger")).toBeHidden();
      const indices = page.locator(".dc-nav__index");
      await expect(indices).toHaveCount(2);
      for (const index of await indices.all()) {
        await expect(index).toBeHidden();
      }

      const activity = await page.evaluate(() => {
        const box = (el: Element | null) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
        };
        const module = document.querySelector('.as-activity__module[data-activity-module="dev"]');
        return {
          waka: box(module?.querySelector(".as-activity__value a") ?? null),
          stats: box(module?.querySelector(".as-activity__spark a") ?? null),
        };
      });
      expect(activity.waka, "WakaTime link is present").toBeTruthy();
      expect(activity.stats, "Code::Stats link is present").toBeTruthy();
      expect(targetSizePairOk(activity.waka!, activity.stats!)).toBe(true);
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
      await expect(page.locator(".dc-neofetch")).toHaveCount(0);
      await expect(page.locator(".dc-identity")).toBeHidden();
      const selfUrl = page.locator(".h-card .u-url");
      await expect(selfUrl).toHaveCount(1);
      await expect(selfUrl).toHaveJSProperty("tagName", "DATA");
      await expect(selfUrl).toHaveAttribute("value", "https://alexandr-sidorenko.me/");
      await expect(selfUrl).toHaveAttribute("hidden", "");
      await expect(page.locator('link[rel~="me"][href="https://alexandr-sidorenko.me/"]')).toHaveCount(1);
      await expect(page.locator('a[rel~="me"][href="https://alexandr-sidorenko.me/"]')).toHaveCount(0);
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
      await expect(page.locator("h1.dc-hero-name")).toHaveCount(1);
      await expect(page.locator("h1.dc-visually-hidden")).toHaveCount(0);
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
      expect(type.note).toBe(type.name);
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
    await expect(trigger.locator(".dc-palette__key")).toBeHidden();
    await expect(trigger.locator(".dc-palette__label")).toBeVisible();
    expect((await trigger.innerText()).trim()).toBe("search");
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

  test("700px keeps the compact one-row shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Band between phone and tablet once.");
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto("/");
    await expect(page.locator(".dc-identity")).toBeHidden();
    await expect(page.locator(".dc-help__trigger")).toBeHidden();
    await expect(page.locator(".dc-palette__key")).toBeHidden();
    await expect(page.locator(".dc-nav__index").first()).toBeHidden();
    const boxes = await shellBoxes(page);
    expect(boxes.home).toBeTruthy();
    expect(boxes.library).toBeTruthy();
    expect(boxes.search).toBeTruthy();
    expectOneRow(boxes.home!, boxes.library!, boxes.search!);
    expect(boxes.pageOverflow).toBe(false);
    expect(boxes.headerOverflow).toBe(false);
  });

  test("Home has no neofetch pane; socials is a comment", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Home provenance once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".dc-neofetch")).toHaveCount(0);
    await expect(page.getByText("neofetch", { exact: true })).toHaveCount(0);
    await expect(page.locator(".dc-roles")).toBeVisible();
    await expect(page.locator(".dc-region-label")).toHaveText("# socials:");
    const commentColors = await page.evaluate(() => {
      const location = getComputedStyle(document.querySelector(".dc-hero-meta")!).color;
      const socials = getComputedStyle(document.querySelector(".dc-region-label")!).color;
      return { location, socials };
    });
    expect(commentColors.socials).toBe(commentColors.location);
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
      const excerptHidden = await page.evaluate(() => {
        const hidden = (el: Element | null) => {
          if (!el) return true;
          const cs = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return cs.display === "none" || box.height < 1;
        };
        return Array.from(document.querySelectorAll(".dc-home .dc-material--dense")).every((row) => {
          return hidden(row.querySelector(".dc-material__excerpt"))
            && hidden(row.querySelector(".dc-material__sep--excerpt"));
        });
      });
      expect(excerptHidden).toBe(true);
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
        overflowY: document.documentElement.scrollHeight - window.innerHeight,
        avatar: panel("avatar.jpg"),
        about: panel("about.md"),
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
    test(`tablet ${viewport.width}×${viewport.height} uses identity then library|activity`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect.poll(async () =>
        page.locator("img.dc-portrait").evaluate((img: HTMLImageElement) => img.naturalWidth),
      ).toBeGreaterThan(0);
      await expect(page.locator(".dc-palette__trigger")).toContainText("search");
      await expect(page.locator(".dc-palette__key")).toBeVisible();
      await expect(page.locator(".dc-nav__index").first()).toBeVisible();
      await expect(page.locator(".dc-help__trigger")).toBeVisible();
      await expect(page.locator(".dc-identity")).toBeVisible();
      await expect(page.locator(".dc-neofetch")).toHaveCount(0);
      const labels = await visiblePanelLabels(page);
      expect(labels).toEqual(["avatar.jpg", "about.md", "library/", "activity/"]);
      const geo = await homeGeometry(page);
      expect(geo.cols).toBe(2);
      expect(geo.overflow).toBeLessThanOrEqual(1);
      expect(Math.abs(geo.avatar!.y - geo.about!.y)).toBeLessThan(8);
      expect(geo.about!.x).toBeGreaterThan(geo.avatar!.x + geo.avatar!.w - 1);
      expect(Math.abs(geo.library!.y - geo.activity!.y)).toBeLessThan(8);
      expect(geo.activity!.x).toBeGreaterThan(geo.library!.x + geo.library!.w - 1);
      expect(geo.library!.w).toBeGreaterThan(geo.activity!.w);
      expect(geo.library!.y).toBeGreaterThanOrEqual(
        Math.max(geo.avatar!.y + geo.avatar!.h, geo.about!.y + geo.about!.h) - 1,
      );
      expect(Math.abs(geo.avatar!.h - geo.about!.h)).toBeLessThan(4);
      expect(geo.avatar!.w).toBeLessThanOrEqual(16 * 16 + 48);
      expect(await aboutTypeSize(page)).toBe("14px");
      const mods = await activityModuleLayout(page);
      expect(mods.length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(mods[0].x - mods[1].x)).toBeLessThan(4);
      expect(mods[1].y).toBeGreaterThan(mods[0].y + 8);
      for (const mod of mods) {
        expect(mod.borderLeft, "tablet activity stacks without a left rail").toBeLessThan(1);
        expect(mod.paddingLeft).toBeLessThan(4);
      }
      await expect(page.locator(".dc-portrait-quote")).toHaveCount(0);
    });
  }

  test("974×768 uses the tablet Home without a giant portrait", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Narrow-desktop regression once.");
    await page.setViewportSize({ width: 974, height: 768 });
    await page.goto("/");
    await expect.poll(async () =>
      page.locator("img.dc-portrait").evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
    const geo = await homeGeometry(page);
    expect(geo.cols).toBe(2);
    expect(geo.overflow).toBeLessThanOrEqual(1);
    expect(Math.abs(geo.avatar!.y - geo.about!.y)).toBeLessThan(8);
    expect(geo.about!.x).toBeGreaterThan(geo.avatar!.x + geo.avatar!.w - 1);
    expect(geo.activity!.x).toBeGreaterThan(geo.library!.x + geo.library!.w - 1);
    expect(geo.library!.w).toBeGreaterThan(geo.activity!.w);
    expect(Math.abs(geo.avatar!.h - geo.about!.h)).toBeLessThan(4);
    expect(geo.avatar!.w).toBeLessThan(974 * 0.35);
    expect(geo.portrait!.w).toBeLessThanOrEqual(16 * 16 + 2);
    expect(await aboutTypeSize(page)).toBe("14px");
    const rows = await homeLibraryRows(page);
    for (const row of rows) {
      expect(row.titleOverflow, row.title).toBe(false);
    }
  });

  for (const viewport of [
    { width: 925, height: 768 },
    { width: 980, height: 768 },
  ] as const) {
    test(`${viewport.width}×${viewport.height} keeps the library pane tight`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Tablet library slack once.");
      await page.setViewportSize(viewport);
      await page.goto("/");
      const slack = await page.evaluate(() => {
        const panel = Array.from(document.querySelectorAll(".dc-home .dc-panel")).find(
          (node) => node.querySelector(".dc-panel__label")?.textContent?.trim() === "library/",
        );
        const more = document.querySelector(".dc-home-recent__more");
        if (!panel || !more) return null;
        const p = panel.getBoundingClientRect();
        const m = more.getBoundingClientRect();
        const excerpts = Array.from(
          document.querySelectorAll(".dc-home .dc-material--dense .dc-material__excerpt"),
        );
        return {
          slack: p.bottom - m.bottom,
          excerptVisible: excerpts.some((el) => {
            const cs = getComputedStyle(el);
            return cs.display !== "none" && el.getBoundingClientRect().width > 8;
          }),
        };
      });
      expect(slack).toBeTruthy();
      expect(slack!.slack).toBeLessThan(48);
      expect(slack!.excerptVisible).toBe(true);
      const rows = await homeLibraryRows(page);
      for (const row of rows) {
        expect(row.titleOverflow, row.title).toBe(false);
      }
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
      await expect(page.locator(".dc-neofetch")).toHaveCount(0);
      await expect(page.locator(".dc-identity")).toBeVisible();
      await expect(page.locator(".dc-palette__trigger")).toContainText("search");
      await expect(page.locator(".dc-palette__key")).toBeVisible();
      await expect(page.locator(".dc-nav__index").first()).toBeVisible();
      await expect(page.locator(".dc-help__trigger")).toBeVisible();
      const labels = await visiblePanelLabels(page);
      expect(labels).toEqual(["avatar.jpg", "about.md", "library/", "activity/"]);
      expect(labels).not.toContain("site/");
      const geo = await homeGeometry(page);
      expect(geo.cols).toBe(2);
      expect(geo.overflow).toBeLessThanOrEqual(1);
      expect(geo.overflowY).toBeLessThanOrEqual(1);
      expect(geo.avatar).toBeTruthy();
      expect(geo.about).toBeTruthy();
      expect(geo.library).toBeTruthy();
      expect(geo.activity).toBeTruthy();
      expect(Math.abs(geo.avatar!.y - geo.about!.y)).toBeLessThan(8);
      expect(Math.abs(geo.avatar!.h - geo.about!.h)).toBeLessThan(4);
      expect(geo.about!.x).toBeGreaterThan(geo.avatar!.x + geo.avatar!.w - 1);
      expect(geo.library!.y).toBeGreaterThanOrEqual(
        Math.max(geo.avatar!.y + geo.avatar!.h, geo.about!.y + geo.about!.h) - 1,
      );
      expect(geo.library!.w).toBeGreaterThan(geo.about!.w);
      expect(Math.abs(geo.library!.x - geo.avatar!.x)).toBeLessThan(8);
      for (const pane of [geo.avatar, geo.about, geo.library, geo.activity]) {
        expect(pane!.y).toBeGreaterThanOrEqual(-1);
        expect(pane!.y + pane!.h).toBeLessThanOrEqual(viewport.height + 1);
      }
      const rows = await homeLibraryRows(page);
      expect(rows.length).toBe(3);
      expect(await aboutTypeSize(page)).toBe("14px");
      for (const row of rows) {
        expect(boxesOverlap(row.titleBox!, row.typeBox!), row.title).toBe(false);
        expect(boxesOverlap(row.titleBox!, row.dateBox!), row.title).toBe(false);
        expect(row.titleOverflow, row.title).toBe(false);
      }
      const excerpts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".dc-home .dc-material--dense")).map((row) => {
          const excerpt = row.querySelector(".dc-material__excerpt");
          const sep = row.querySelector(".dc-material__sep--excerpt");
          const title = row.querySelector(".dc-material__title");
          const type = row.querySelector(".dc-list__type");
          if (!excerpt || !sep || !title || !type) return { present: false };
          const excerptBox = excerpt.getBoundingClientRect();
          const sepBox = sep.getBoundingClientRect();
          const titleBox = title.getBoundingClientRect();
          const typeBox = type.getBoundingClientRect();
          const cs = getComputedStyle(excerpt);
          return {
            present: true,
            text: (excerpt.textContent || "").trim(),
            visible: cs.display !== "none" && excerptBox.width > 8,
            afterTitle: excerptBox.left >= titleBox.right - 1,
            sepBetween: sepBox.left >= titleBox.right - 1 && sepBox.right <= excerptBox.left + 1,
            sepMark: (sep.textContent || "").trim() === "·",
            beforeType: excerptBox.right <= typeBox.left + 1,
            sameRow: Math.abs(excerptBox.top - titleBox.top) < 8,
          };
        });
      });
      expect(excerpts).toHaveLength(3);
      for (const excerpt of excerpts) {
        expect(excerpt.present).toBe(true);
        expect(excerpt.text.length).toBeGreaterThan(0);
        expect(excerpt.visible).toBe(true);
        expect(excerpt.afterTitle).toBe(true);
        expect(excerpt.sepBetween).toBe(true);
        expect(excerpt.sepMark).toBe(true);
        expect(excerpt.beforeType).toBe(true);
        expect(excerpt.sameRow).toBe(true);
      }
      const titleVsExcerpt = await page.evaluate(() => {
        const title = document.querySelector(".dc-home .dc-material--dense .dc-material__title a");
        const excerpt = document.querySelector(".dc-home .dc-material--dense .dc-material__excerpt");
        const date = document.querySelector(".dc-home .dc-material--dense .dc-material__date");
        if (!title || !excerpt || !date) return null;
        return {
          title: getComputedStyle(title).color,
          excerpt: getComputedStyle(excerpt).color,
          date: getComputedStyle(date).color,
          underline: getComputedStyle(title).textDecorationLine,
        };
      });
      expect(titleVsExcerpt).toBeTruthy();
      expect(titleVsExcerpt!.title).not.toBe(titleVsExcerpt!.excerpt);
      expect(titleVsExcerpt!.excerpt).toBe(titleVsExcerpt!.date);
      expect(titleVsExcerpt!.underline).not.toContain("underline");
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
      const aboutFill = await page.evaluate(() => {
        const about = Array.from(document.querySelectorAll(".dc-home .dc-panel")).find(
          (node) => node.querySelector(".dc-panel__label")?.textContent?.trim() === "about.md",
        );
        const foot = document.querySelector(".dc-hero-foot");
        if (!about || !foot) return null;
        return about.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom;
      });
      expect(aboutFill).toBeTruthy();
      expect(aboutFill!).toBeGreaterThanOrEqual(-1);
      expect(aboutFill!).toBeLessThan(56);
      expect(geo.avatar!.w).toBeLessThanOrEqual(20 * 16 + 48);
      expect(geo.portrait).toBeTruthy();
      expect(geo.portrait!.w).toBeLessThanOrEqual(20 * 16 + 2);
      expect(geo.avatar!.w - geo.portrait!.w).toBeLessThan(48);
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
            activity: look(".dc-home > .as-activity"),
          };
        });
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

  test("wide Home portrait and its pane scale with the viewport", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Scale contract is desktop.");
    const measure = async (viewport: { width: number; height: number }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect.poll(async () =>
        page.locator("img.dc-portrait").evaluate((img: HTMLImageElement) => img.naturalWidth),
      ).toBeGreaterThan(0);
      return homeGeometry(page);
    };
    const short = await measure({ width: 1024, height: 768 });
    const tall = await measure({ width: 1440, height: 900 });
    expect(short.portrait).toBeTruthy();
    expect(tall.portrait).toBeTruthy();
    expect(short.portrait!.w).toBeLessThan(tall.portrait!.w - 8);
    expect(short.portrait!.h).toBeLessThan(tall.portrait!.h - 8);
    expect(short.avatar!.w).toBeLessThan(tall.avatar!.w - 8);
    expect(short.avatar!.w - short.portrait!.w).toBeLessThan(48);
    expect(tall.avatar!.w - tall.portrait!.w).toBeLessThan(48);
  });
});
