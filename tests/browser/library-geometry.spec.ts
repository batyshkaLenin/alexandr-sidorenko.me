import { test, expect, type Page } from "@playwright/test";

type ViewsLabel = {
  text: string;
  current: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
};

type ViewsGeometry = {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
  overflowing: boolean;
  ready: boolean;
  overflowStart: boolean;
  overflowEnd: boolean;
  fadeStart: number;
  fadeEnd: number;
  fadeWidth: number;
  navLeft: number;
  navTop: number;
  navHeight: number;
  labels: ViewsLabel[];
};

async function viewsGeometry(page: Page): Promise<ViewsGeometry> {
  return page.evaluate(() => {
    const host = document.querySelector("as-viewsnav")!;
    const nav = host.querySelector<HTMLElement>(".dc-library__views")!;
    const navBox = nav.getBoundingClientRect();
    const before = getComputedStyle(host, "::before");
    const after = getComputedStyle(host, "::after");
    const fadeWidth = Number.parseFloat(before.width) || Number.parseFloat(after.width) || 0;
    return {
      clientWidth: nav.clientWidth,
      scrollWidth: nav.scrollWidth,
      scrollLeft: nav.scrollLeft,
      overflowing: nav.scrollWidth - nav.clientWidth > 2,
      ready: nav.hasAttribute("data-viewsnav-ready"),
      overflowStart: nav.hasAttribute("data-overflow-start"),
      overflowEnd: nav.hasAttribute("data-overflow-end"),
      fadeStart: before.content === "none" || before.content === ""
        ? 0
        : Number.parseFloat(before.opacity || "0"),
      fadeEnd: after.content === "none" || after.content === ""
        ? 0
        : Number.parseFloat(after.opacity || "0"),
      fadeWidth,
      navLeft: navBox.left,
      navTop: navBox.top,
      navHeight: navBox.height,
      labels: Array.from(nav.querySelectorAll("a"), (anchor) => {
        const box = anchor.getBoundingClientRect();
        return {
          text: (anchor.textContent || "").trim(),
          current: anchor.getAttribute("aria-current") === "page",
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          height: box.height,
        };
      }),
    };
  });
}

async function waitViewsReady(page: Page) {
  await expect.poll(async () => {
    const geometry = await viewsGeometry(page);
    return geometry.ready && geometry.labels.length === 6;
  }).toBe(true);
}

function expectOneRow(geometry: ViewsGeometry) {
  const tops = geometry.labels.map((label) => label.top);
  const spread = Math.max(...tops) - Math.min(...tops);
  expect(spread, "ViewsNav labels stay on one row").toBeLessThanOrEqual(4);
  for (const label of geometry.labels) {
    expect(label.height, label.text).toBeLessThanOrEqual(28);
  }
}

function tone(value: string) {
  if (value === "transparent") return "transparent";
  const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m) return value.toLowerCase();
  if (m[4] !== undefined && Number(m[4]) === 0) return "transparent";
  return (
    "#"
    + [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

async function expectCurrentViewUsesAccent(page: Page) {
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const current = document.querySelector<HTMLElement>(".dc-library__view--current a");
    if (!current) throw new Error("current view link missing");
    return {
      accent: root.getPropertyValue("--dc-accent").trim().toLowerCase(),
      primary: root.getPropertyValue("--dc-primary").trim().toLowerCase(),
      color: getComputedStyle(current).color,
    };
  });
  expect(tone(colors.color), "current View uses accent, not shell primary").toBe(
    tone(colors.accent),
  );
  expect(tone(colors.color)).not.toBe(tone(colors.primary));
}

function expectCurrentOutsideFade(geometry: ViewsGeometry) {
  const current = geometry.labels.find((label) => label.current);
  expect(current, "current view is present").toBeTruthy();
  if (geometry.fadeStart > 0 && geometry.fadeWidth > 0) {
    expect(current!.left, current!.text).toBeGreaterThanOrEqual(
      geometry.navLeft + geometry.fadeWidth - 1,
    );
  }
  if (geometry.fadeEnd > 0 && geometry.fadeWidth > 0) {
    expect(current!.right, current!.text).toBeLessThanOrEqual(
      geometry.navLeft + geometry.clientWidth - geometry.fadeWidth + 1,
    );
  }
}

async function timelineAlignment(page: Page) {
  return page.evaluate(() => {
    const axis = document.querySelector<HTMLElement>(".dc-timeline__axis")!;
    const axisBox = axis.getBoundingClientRect();
    const axisCenter = axisBox.left + axisBox.width / 2;
    const rows = Array.from(document.querySelectorAll(".dc-timeline__item"), (item) => {
      const marker = item.querySelector<HTMLElement>(".dc-timeline__marker")!;
      const title = item.querySelector(".dc-timeline__title")!;
      const markerBox = marker.getBoundingClientRect();
      const markerCenter = markerBox.left + markerBox.width / 2;
      return {
        title: (title.textContent || "").trim(),
        markerCenter,
        delta: Math.abs(markerCenter - axisCenter),
      };
    });
    return {
      axisCenter,
      rows,
      maxDelta: rows.reduce((max, row) => Math.max(max, row.delta), 0),
    };
  });
}

const phoneViewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const;

const wideViewports = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

test.describe("library geometry", () => {
  for (const viewport of phoneViewports) {
    test(`ViewsNav is a one-line scroller at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/library/topics");
      await waitViewsReady(page);

      const start = await viewsGeometry(page);
      expectOneRow(start);
      expectCurrentOutsideFade(start);
      expect(start.labels.every((label) => label.text.length > 0)).toBe(true);
      const current = start.labels.find((label) => label.current);
      expect(current?.text).toBe("topics");
      expect(current!.left).toBeGreaterThanOrEqual(start.labels[0].left - 1);
      expect(current!.right).toBeLessThanOrEqual(
        (await page.locator(".dc-library__views").boundingBox())!.x
          + start.clientWidth
          + 1,
      );

      if (start.overflowing) {
        expect(start.fadeStart + start.fadeEnd).toBeGreaterThan(0);
        const maxScroll = start.scrollWidth - start.clientWidth;
        if (maxScroll > 8) {
          const middleLeft = Math.round(maxScroll / 2);
          await page.locator(".dc-library__views").evaluate((nav, left) => {
            nav.scrollLeft = left;
          }, middleLeft);
          await expect.poll(async () => (await viewsGeometry(page)).fadeStart).toBeGreaterThan(0);
          await expect.poll(async () => (await viewsGeometry(page)).fadeEnd).toBeGreaterThan(0);
          await testInfo.attach(`viewsnav-${viewport.width}-middle.png`, {
            body: await page.locator("as-viewsnav").screenshot(),
            contentType: "image/png",
          });
        }

        await page.locator(".dc-library__views").evaluate((nav) => {
          nav.scrollLeft = nav.scrollWidth;
        });
        await expect.poll(async () => (await viewsGeometry(page)).fadeStart).toBeGreaterThan(0);
        await expect.poll(async () => (await viewsGeometry(page)).fadeEnd).toBe(0);
        const end = await viewsGeometry(page);
        const topics = end.labels.find((label) => label.text === "topics")!;
        expect(topics.right).toBeLessThanOrEqual(
          (await page.locator(".dc-library__views").boundingBox())!.x
            + end.clientWidth
            + 1,
        );
        await testInfo.attach(`viewsnav-${viewport.width}-end.png`, {
          body: await page.locator("as-viewsnav").screenshot(),
          contentType: "image/png",
        });
      } else {
        expect(start.fadeStart).toBe(0);
        expect(start.fadeEnd).toBe(0);
      }

      await page.locator(".dc-library__views").evaluate((nav) => {
        nav.scrollLeft = 0;
      });
      await testInfo.attach(`viewsnav-${viewport.width}-start.png`, {
        body: await page.locator("as-viewsnav").screenshot(),
        contentType: "image/png",
      });
    });
  }

  for (const viewport of wideViewports) {
    test(`ViewsNav has no spare fade or overflow at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/library");
      await waitViewsReady(page);
      const geometry = await viewsGeometry(page);
      expect(geometry.overflowing).toBe(false);
      expect(geometry.fadeStart).toBe(0);
      expect(geometry.fadeEnd).toBe(0);
      expect(geometry.labels.some((label) => label.current && label.text === "recent")).toBe(true);
    });
  }

  test("Library current chrome uses accent, not shell primary green", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Colour contract once on desktop.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/library");
    await waitViewsReady(page);
    await expectCurrentViewUsesAccent(page);

    await page.goto("/library/all");
    await waitViewsReady(page);
    const modeCurrent = page.locator(".dc-mode-switch [aria-current='true']");
    await expect(modeCurrent).toBeVisible();
    const modeColors = await modeCurrent.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      return {
        accent: root.getPropertyValue("--dc-accent").trim().toLowerCase(),
        primary: root.getPropertyValue("--dc-primary").trim().toLowerCase(),
        color: getComputedStyle(el).color,
      };
    });
    expect(tone(modeColors.color), "mode-switch current uses accent").toBe(
      tone(modeColors.accent),
    );
    expect(tone(modeColors.color)).not.toBe(tone(modeColors.primary));
  });

  test("horizontal ViewsNav caret does not shift sibling labels", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Caret reservation once is enough.");
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/library");
    await waitViewsReady(page);
    const recent = await viewsGeometry(page);
    expectOneRow(recent);
    await page.goto("/library/all");
    await waitViewsReady(page);
    const all = await viewsGeometry(page);
    expectOneRow(all);
    expect(recent.labels.map((label) => label.text)).toEqual(all.labels.map((label) => label.text));
    for (let i = 0; i < recent.labels.length; i += 1) {
      expect(
        Math.abs(recent.labels[i].left - all.labels[i].left),
        recent.labels[i].text,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("ViewsNav current item is keyboard-reachable at 320px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/library");
    await waitViewsReady(page);
    expectCurrentOutsideFade(await viewsGeometry(page));

    const nav = page.locator(".dc-library__views");
    const topics = page.locator(".dc-library__views a", { hasText: "topics" });
    await topics.focus();
    await expect(topics).toBeFocused();
    const focused = await viewsGeometry(page);
    const topicsBox = focused.labels.find((label) => label.text === "topics")!;
    const navBox = (await nav.boundingBox())!;
    expect(topicsBox.left).toBeGreaterThanOrEqual(navBox.x - 1);
    expect(topicsBox.right).toBeLessThanOrEqual(navBox.x + navBox.width + 1);

    await nav.evaluate((el) => {
      el.focus();
      el.scrollLeft = Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + 80);
    });
    const afterScroll = await viewsGeometry(page);
    if (afterScroll.overflowing) {
      expect(afterScroll.scrollLeft).toBeGreaterThan(0);
    }
  });

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`Timeline markers sit on the axis at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await page.goto("/library/timeline");
      const itemCount = await page.locator(".dc-timeline__item").count();
      expect(itemCount).toBeGreaterThan(0);
      await expect(page.locator(".dc-timeline__marker")).toHaveCount(itemCount);

      const alignment = await timelineAlignment(page);
      expect(alignment.rows.length).toBe(itemCount);
      expect(alignment.maxDelta, JSON.stringify(alignment.rows, null, 2)).toBeLessThanOrEqual(1);

      const first = page.locator(".dc-timeline__item").first();
      const last = page.locator(".dc-timeline__item").last();
      const longTitle = page.locator(".dc-timeline__item", {
        hasText: "Мы поступили в универ",
      });
      await testInfo.attach(`timeline-${viewport.width}-first.png`, {
        body: await first.screenshot(),
        contentType: "image/png",
      });
      await testInfo.attach(`timeline-${viewport.width}-last.png`, {
        body: await last.screenshot(),
        contentType: "image/png",
      });
      await testInfo.attach(`timeline-${viewport.width}-long-title.png`, {
        body: await longTitle.screenshot(),
        contentType: "image/png",
      });
      await testInfo.attach(`timeline-${viewport.width}-years.png`, {
        body: await page.locator(".dc-timeline").screenshot(),
        contentType: "image/png",
      });
    });
  }

  test("listnav caret does not cover a Timeline marker", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Caret clearance once is enough.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/library/timeline");
    const titles = page.locator(".dc-timeline__title a");
    const title = page.getByRole("link", { name: "Философия свободы" });
    const titleCount = await titles.count();
    const philosophyIndex = await titles.evaluateAll(
      (nodes) => nodes.findIndex((node) => (node.textContent || "").trim() === "Философия свободы"),
    );
    expect(philosophyIndex).toBeGreaterThan(0);
    expect(philosophyIndex).toBeLessThan(titleCount);
    await titles.nth(philosophyIndex - 1).focus();
    await page.keyboard.press("Tab");
    await expect(title).toBeFocused();
    await expect.poll(() => title.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

    const clearance = await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(".dc-timeline__title a:focus-visible")!;
      const marker = link.closest(".dc-timeline__item")!.querySelector<HTMLElement>(".dc-timeline__marker")!;
      const caret = getComputedStyle(link, "::before");
      const linkBox = link.getBoundingClientRect();
      const markerBox = marker.getBoundingClientRect();
      const caretLeft = linkBox.left + Number.parseFloat(caret.left || "0");
      const caretWidth = Number.parseFloat(caret.fontSize) * 0.7;
      return {
        content: caret.content,
        caretLeft,
        caretRight: caretLeft + caretWidth,
        markerLeft: markerBox.left,
        markerRight: markerBox.right,
      };
    });

    expect(clearance.content).toContain(">");
    expect(clearance.caretLeft).toBeGreaterThanOrEqual(clearance.markerRight + 2);
    await testInfo.attach("timeline-caret-focus.png", {
      body: await page.locator(".dc-timeline__item").last().screenshot(),
      contentType: "image/png",
    });
  });

  test("Timeline and ViewsNav stay readable in forced-colors", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Forced-colors once is enough.");
    await page.emulateMedia({ forcedColors: "active" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/library/timeline");
    const marker = page.locator(".dc-timeline__marker").first();
    await expect(marker).toBeVisible();
    const alignment = await timelineAlignment(page);
    expect(alignment.maxDelta).toBeLessThanOrEqual(1);
    await expect(page.locator(".dc-library__views a", { hasText: "timeline" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("Timeline and ViewsNav stay readable with reduced motion", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "reduced-motion once is enough.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/library/timeline");
    await waitViewsReady(page);
    const geometry = await viewsGeometry(page);
    expectOneRow(geometry);
    expectCurrentOutsideFade(geometry);
    const alignment = await timelineAlignment(page);
    expect(alignment.maxDelta).toBeLessThanOrEqual(1);
    await expect(page.locator(".dc-library__views a", { hasText: "timeline" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("library geometry no-js", () => {
  test.use({ javaScriptEnabled: false });

  test("ViewsNav and Timeline keep their CSS geometry without JS", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "no-JS geometry once is enough.");
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/library/timeline");

    const nav = page.locator(".dc-library__views");
    await expect(nav).toBeVisible();
    const geometry = await viewsGeometry(page);
    expect(geometry.ready).toBe(false);
    expectOneRow(geometry);
    expect(geometry.labels.find((label) => label.current)?.text).toBe("timeline");
    if (geometry.overflowing) {
      expect(geometry.fadeEnd).toBeGreaterThan(0);
      await nav.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      const topics = page.locator(".dc-library__views a", { hasText: "topics" });
      await expect(topics).toBeVisible();
    }

    const alignment = await timelineAlignment(page);
    expect(alignment.maxDelta).toBeLessThanOrEqual(1);
    await page.locator(".dc-library__views a", { hasText: "recent" }).click();
    await expect(page).toHaveURL(/\/library$/);
  });
});
