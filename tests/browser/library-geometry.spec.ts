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
    return geometry.ready && geometry.labels.length === 5;
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

// Hit-test the effective native targets, including the type cut-out in the
// title link's row surface. Bounding boxes alone cannot verify that cut-out.
for (const javaScriptEnabled of [true, false]) {
  test.describe(`MaterialRow targets (JS ${javaScriptEnabled ? "on" : "off"})`, () => {
    test.use({ javaScriptEnabled });
    for (const viewport of [...phoneViewports, { width: 1440, height: 900 }]) {
      test(`row/type targets at ${viewport.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        for (const url of ["/", "/library", "/library/types"]) {
          await page.goto(url);
          await page.evaluate(() => document.fonts.ready);
          const rows = page.locator(".dc-material:visible");
          expect(await rows.count()).toBeGreaterThan(0);
          const order = await rows.locator(".u-url.p-name").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
          // Include every row so wrapped and minimal-metadata titles are covered.
          for (const row of await rows.all()) {
            await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
            const result = await row.evaluate((li) => {
              const title = li.querySelector<HTMLAnchorElement>("a.u-url.p-name")!;
              const type = li.querySelector<HTMLAnchorElement>("a.dc-list__type");
              const date = li.querySelector("time")!;
              const box = li.getBoundingClientRect();
              const target = (x: number, y: number) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href");
              const sample = (el: Element) => {
                const b = el.getBoundingClientRect();
                return target(b.left + b.width / 2, b.top + b.height / 2);
              };
              const typeBox = type?.getBoundingClientRect();
              const coarse = matchMedia("(pointer: coarse)").matches;
              return {
                href: title.getAttribute("href"), typeHref: type?.getAttribute("href"),
                dateTarget: sample(date),
                freeTarget: target(box.right - 2, box.top + 2),
                typeTarget: type ? sample(type) : null,
                typeCorners: typeBox ? [
                  target(typeBox.left + 1, typeBox.top + 1),
                  target(typeBox.right - 1, typeBox.bottom - 1),
                ] : [],
                typeWidth: typeBox?.width, typeHeight: typeBox?.height,
                rowHeight: box.height, coarse,
                titleColor: getComputedStyle(title).color,
                accent: getComputedStyle(document.documentElement).getPropertyValue("--dc-accent").trim(),
                typeDecoration: type && getComputedStyle(type).textDecorationLine,
                titleWhiteSpace: getComputedStyle(title).whiteSpace,
                titleCount: li.querySelectorAll("a.u-url.p-name").length,
                nested: li.querySelectorAll("a a").length,
                interactiveLi: li.hasAttribute("role") || li.hasAttribute("tabindex") || li.hasAttribute("onclick"),
                dateLink: !!date.closest("a"),
              };
            });
            expect(result.titleCount).toBe(1);
            expect(result.nested).toBe(0);
            expect(result.interactiveLi).toBe(false);
            expect(result.dateLink).toBe(false);
            expect(result.dateTarget, `${url}: date for ${result.href}`).toBe(result.href);
            expect(result.freeTarget).toBe(result.href);
            expect(result.rowHeight).toBeGreaterThanOrEqual(result.coarse ? 44 : 24);
            expect(tone(result.titleColor)).toBe(tone(result.accent));
            if (viewport.width <= 390) expect(result.titleWhiteSpace).toBe("normal");
            if (url === "/library/types") {
              expect(result.typeHref).toBeUndefined();
            } else {
              expect(result.typeHref).toMatch(/^\/library\/types\/[^/]+$/);
              expect(result.typeTarget).toBe(result.typeHref);
              expect(result.typeCorners).toEqual([result.typeHref, result.typeHref]);
              expect(result.typeWidth).toBeGreaterThanOrEqual(result.coarse ? 44 : 24);
              expect(result.typeHeight).toBeGreaterThanOrEqual(result.coarse ? 44 : 24);
              expect(result.typeDecoration).toContain("underline");
            }
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          // Native pointer/touch navigation, then return to the original order.
          const row = rows.first();
          await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
          const href = await row.locator(".u-url.p-name").getAttribute("href");
          const dateBox = (await row.locator("time").boundingBox())!;
          const x = dateBox.x + dateBox.width / 2;
          const y = dateBox.y + dateBox.height / 2;
          if (testInfo.project.name === "chromium-mobile") await page.touchscreen.tap(x, y);
          else await page.mouse.click(x, y);
          await expect(page).toHaveURL(new RegExp(`${href}$`));
          await page.goBack();
          await page.waitForLoadState();
          expect(await rows.locator(".u-url.p-name").evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(order);
          if (url !== "/library/types") {
            const type = rows.first().locator("a.dc-list__type");
            const typeHref = await type.getAttribute("href");
            await type.click();
            await expect(page).toHaveURL(new RegExp(`${typeHref}$`));
          }
        }
      });
    }
  });
}

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
      expect(geometry.labels.some((label) => label.current && label.text === "all")).toBe(true);
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

    await page.goto("/library");
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
    await page.goto("/library/timeline");
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

  test("listnav focus uses an outline without a decorative caret", async ({ page }, testInfo) => {
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

    expect(clearance.content).toBe("none");
    await expect(title).toHaveCSS("outline-style", "solid");
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
    await page.locator(".dc-library__views a", { hasText: "all" }).click();
    await expect(page).toHaveURL(/\/library$/);
  });
});

for (const viewport of [{width:1440,height:900},{width:1024,height:768},{width:375,height:812}]) {
  test(`corrective layout and stable controls ${viewport.width}px`, async ({page}, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Explicit viewport matrix.');
    await page.setViewportSize(viewport);
    let menu: number[] | undefined;
    for (const url of ['/', '/library', '/', '/library']) {
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      const positions = await page.locator('.dc-nav__link').evaluateAll(links => links.map(link => {
        const node = Array.from(link.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())!;
        const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().x;
      }));
      if (menu) positions.forEach((x,i) => expect(Math.abs(x-menu![i])).toBeLessThan(1));
      menu=positions;
    }
    const modes=page.locator('.dc-mode-switch a[data-mode]');
    const before=await modes.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));
    await modes.nth(1).click();
    await expect(modes.nth(1)).toHaveAttribute('aria-current','true');
    const after=await modes.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));
    after.forEach((box,i)=>{expect(box.x).toBe(before[i].x);expect(box.width).toBe(before[i].width);});
    await modes.first().click();
    for (const url of ['/library','/library/table','/library/timeline','/library/music','/library/types','/library/topics']) {
      await page.goto(url);
      const aligned=await page.locator('.dc-library > .dc-panel').evaluate(panel=>{
        const heading=panel.querySelector('h1')!.getBoundingClientRect();
        const body=panel.querySelector(':scope > .dc-panel__body:last-child')!.getBoundingClientRect();
        return Math.abs(heading.x-body.x);
      });
      expect(aligned,url).toBeLessThan(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url).toBe(true);
    }
  });
}

test('Topics counts match their public material lists; backlink labels are metadata', async ({page})=>{
  await page.goto('/library/topics');
  const topics=await page.locator('.dc-list__item').evaluateAll(items=>items.map(item=>({href:item.querySelector('a')!.getAttribute('href')!,count:Number(item.querySelector('.dc-library__count')!.textContent)})));
  expect(topics.length).toBeGreaterThan(0);
  for(const topic of topics){await page.goto(topic.href);expect(await page.locator('.dc-material').count()).toBe(topic.count);}
  await page.goto('/library/itchatter-hakatony');
  const labels=page.locator('.dc-relations__rel');
  expect(await labels.count()).toBeGreaterThan(0);
  for(const label of await labels.all()) await expect(label).toHaveText(/^\(.+\)$/);
});

test('type hover owns its feedback without moving the row or title',async({page})=>{
  for(const url of ['/','/library']){
    await page.goto(url);
    const type=page.locator('.dc-material a.dc-list__type').first();
    const title=type.locator('xpath=ancestor::li').locator('.dc-material__title a');
    await type.scrollIntoViewIfNeeded();
    const before=await type.boundingBox();
    await type.hover();
    await expect(type).toHaveCSS('outline-style','solid');
    await expect(title).toHaveCSS('text-decoration-line','none');
    expect(await type.boundingBox()).toEqual(before);
    await type.focus();
    await expect(type).toHaveCSS('outline-width','2px');
  }
});

const libraryCompositionViews = [
  { path: "/library", secondary: true },
  { path: "/library/table", secondary: true },
  { path: "/library/topics", secondary: true },
  { path: "/library/types/article", secondary: true },
  { path: "/library/topics/философия", secondary: true },
  { path: "/library/music", secondary: false },
  { path: "/library/timeline", secondary: false },
  { path: "/library/types", secondary: false },
];

for (const javaScriptEnabled of [true, false]) {
  test.describe(`Library composition (JS ${javaScriptEnabled ? "on" : "off"})`, () => {
    test.use({ javaScriptEnabled });

    for (const width of [375, 1024, 1440]) {
      test(`optional secondary row has a consistent rhythm at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const matrix = [];
        for (const view of libraryCompositionViews) {
          await page.goto(view.path);
          await page.evaluate(() => document.fonts.ready);
          const geometry = await page.locator(".dc-library > .dc-panel").evaluate((panel) => {
            const heading = panel.querySelector("h1")!.getBoundingClientRect();
            const secondary = panel.querySelector(".as-library-secondary");
            const row = secondary?.getBoundingClientRect();
            const body = panel.querySelector(":scope > .dc-panel__body:last-child")!;
            // The modes control belongs to dc-modes; measure the visible panel
            // rather than its outer body (which also contains the control).
            const content = body.querySelector("[data-mode-panel]:not([hidden])") || body;
            const contentBox = content.getBoundingClientRect();
            return {
              heading: heading.toJSON(),
              row: row?.toJSON(),
              content: contentBox.toJSON(),
              coarse: matchMedia("(pointer: coarse)").matches,
              secondaryCount: panel.querySelectorAll(".as-library-secondary").length,
              secondaryText: secondary?.textContent?.trim(),
              targets: Array.from(secondary?.querySelectorAll("a") || [], (link) => link.getBoundingClientRect().height),
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });
          matrix.push({ path: view.path, ...geometry });
          expect(geometry.overflow, view.path).toBeLessThanOrEqual(1);
          expect(geometry.content.x, view.path).toBeCloseTo(geometry.heading.x, 0);
          expect(geometry.secondaryCount, view.path).toBe(view.secondary ? 1 : 0);
          if (view.secondary) {
            expect(geometry.secondaryText, view.path).toBeTruthy();
            expect(geometry.row!.x, view.path).toBeCloseTo(geometry.heading.x, 0);
            expect(geometry.row!.y - geometry.heading.bottom, view.path).toBeCloseTo(12, 0);
            expect(geometry.content.y - geometry.row!.bottom, view.path).toBeCloseTo(12, 0);
            expect(geometry.row!.height, view.path).toBeCloseTo(geometry.coarse ? 44 : 24, 0);
            for (const height of geometry.targets) expect(height).toBeGreaterThanOrEqual(geometry.coarse ? 44 : 24);
            const link = page.locator(".as-library-secondary a").first();
            if (await link.count()) {
              const before = await link.boundingBox();
              if (!geometry.coarse) await link.hover();
              await link.focus();
              await expect(link).toBeFocused();
              expect(await link.boundingBox()).toEqual(before);
            }
          } else {
            expect(geometry.content.y - geometry.heading.bottom, view.path).toBeCloseTo(12, 0);
          }
        }
        await testInfo.attach(`library-composition-${width}.json`, {
          body: JSON.stringify(matrix, null, 2), contentType: "application/json",
        });
      });
    }

    test("list/table keep history, native links and the skip target", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/library");
      const modes = page.locator(".dc-mode-switch a[data-mode]");
      await modes.nth(1).click();
      await expect(page).toHaveURL(/\/library\/table$/);
      await expect(modes.nth(1)).toHaveAttribute("aria-current", "true");
      await expect(page.locator("#list-start")).toHaveCount(1);
      await expect(page.locator("#list-start")).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/library$/);
      await expect(modes.first()).toHaveAttribute("aria-current", "true");
      const skip = page.locator('a[href="#list-start"]');
      await skip.focus();
      await skip.press("Enter");
      await expect(page.locator("#list-start")).toBeInViewport();
    });

    test("compact Timeline gives titles room and preserves dates, years and axis at 200% text", async ({ page, context }) => {
      const client = await context.newCDPSession(page);
      await client.send("Page.enable");
      for (const fontSize of [16, 32]) {
        await client.send("Page.setFontSizes" as never, { fontSizes: { standard: fontSize, fixed: fontSize } } as never);
        // At 200% text the existing topbar overflows at 768px in the base
        // revision too; this task changes the narrow Timeline, not the shell.
        for (const width of fontSize === 16 ? [320, 375, 640, 768, 1440] : [320, 375, 640, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/library/timeline");
          await page.evaluate(() => document.fonts.ready);
          const geometry = await page.evaluate(() => {
            const timeline = document.querySelector(".dc-timeline")!.getBoundingClientRect();
            const rows = Array.from(document.querySelectorAll(".dc-timeline__item"), (item) => {
              const date = item.querySelector("time")!.getBoundingClientRect();
              const marker = item.querySelector(".dc-timeline__marker")!.getBoundingClientRect();
              const title = item.querySelector(".dc-timeline__title")!.getBoundingClientRect();
              return { date: date.toJSON(), marker: marker.toJSON(), title: title.toJSON() };
            });
            const years = Array.from(document.querySelectorAll(".dc-timeline__year"), (year) => {
              const range = document.createRange(); range.selectNodeContents(year);
              return range.getBoundingClientRect().x;
            });
            return { width: timeline.width, rows, years, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
          });
          expect(geometry.overflow, `${width}px / ${fontSize}px`).toBeLessThanOrEqual(1);
          expect(geometry.years.length).toBeGreaterThan(1);
          for (const row of geometry.rows) {
            expect(row.date.right).toBeLessThan(row.marker.x);
            expect(row.marker.right).toBeLessThan(row.title.x);
            expect(row.title.width).toBeGreaterThan(0);
            if (fontSize === 16 && width <= 640) expect(row.title.width / geometry.width).toBeGreaterThan(0.7);
          }
          if (fontSize === 16 && width <= 640) {
            for (const yearX of geometry.years) expect(yearX).toBeCloseTo(geometry.rows[0].title.x, 0);
          }
          expect((await timelineAlignment(page)).maxDelta).toBeLessThanOrEqual(1);
        }
      }
    });
  });
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(`W0062 catalog JS ${javaScriptEnabled}`, () => {
    test.use({ javaScriptEnabled });
    for (const width of [375, 1440]) {
      test(`catalog previews, topic targets and native compatibility at ${width}px`, async ({ page, request }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        for (const path of ['/library/all', '/library/all/']) {
          const response = await request.get(path, { maxRedirects: 0 });
          expect(response.status()).toBe(301);
          expect(response.headers().location).toBe('/library');
          await page.goto(path);
          await expect(page).toHaveURL(/\/library$/);
        }
        const entries = (await (await request.get('/search-index.json')).json()).entries;
        expect(entries.some((entry: { url: string }) => entry.url === '/library/all')).toBe(false);
        expect(entries.find((entry: { url: string }) => entry.url === '/library/music').title).toBe('Треки');
        const materials = entries.filter((entry: { kind: string }) => ['text', 'audio'].includes(entry.kind));
        const rows = page.locator('[data-mode-panel="list"] .dc-material');
        await expect(rows).toHaveCount(materials.length);
        const tableURLs = await page.locator('[data-mode-panel="table"] tbody tr td:first-child a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
        expect(tableURLs).toEqual(materials.map((entry: { url: string }) => entry.url));
        for (const row of await rows.all()) {
          const href = await row.locator('.u-url.p-name').getAttribute('href');
          const entry = materials.find((item: { url: string }) => item.url === href);
          const summary = row.locator('.p-summary');
          if (entry.summary) {
            const text = await page.evaluate((value) => { const el = document.createElement('textarea'); el.innerHTML = value; return el.value; }, entry.summary);
            await expect(summary).toHaveText(text);
          }
          else await expect(summary).toHaveCount(0);
          expect(await row.locator('a a').count()).toBe(0);
        }
        const topic = page.locator('[data-mode-panel="list"] a[rel="tag"]').first();
        await topic.scrollIntoViewIfNeeded();
        const href = await topic.getAttribute('href');
        const box = (await topic.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(testInfo.project.name === 'chromium-mobile' ? 44 : 24);
        const hit = await topic.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('a')?.getAttribute('href');
        });
        expect(hit).toBe(href);
        await topic.focus();
        expect(await topic.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
        await topic.press('Enter');
        expect(decodeURI(new URL(page.url()).pathname)).toBe(decodeURI(href!));
        await page.goto('/library');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await testInfo.attach(`catalog-${width}-js-${javaScriptEnabled}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        await page.goto('/library/music');
        await expect(page.locator('h1')).toHaveText('Треки');
        await expect(page.locator('.dc-library__views [aria-current="page"]')).toHaveText('tracks');
        await expect(page.locator('.dc-material .u-url')).toHaveCount(1);
      });
    }
    test('direct and in-place mode arrival preserve explicit document metadata policy', async ({ page }) => {
      for (const initial of ['/library', '/library/table']) {
        await page.goto(initial);
        const snapshot = () => page.evaluate(() => ({
          title: document.title, h1: document.querySelector('h1')?.textContent,
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
          robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
          og: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
          schema: Array.from(document.querySelectorAll('script[type="application/ld+json"]'), (el) => el.textContent),
        }));
        const direct = await snapshot();
        expect(direct.canonical).toBe(`https://alexandr-sidorenko.me${initial}`);
        expect(direct.og).toBe(direct.canonical);
        expect(direct.h1).toBe(initial.endsWith('table') ? 'Таблица' : 'Библиотека');
        expect(direct.robots).toBe(initial.endsWith('table') ? 'noindex' : undefined);
        const target = initial.endsWith('table') ? 'list' : 'table';
        const targetURL = target === 'list' ? '/library' : '/library/table';
        await page.locator(`a[data-mode="${target}"]`).click();
        await expect(page).toHaveURL(new RegExp(`${targetURL}$`));
        await expect(page.locator(`a[data-mode="${target}"]`)).toHaveAttribute('aria-current', 'true');
        await expect(page.locator('#list-start')).toHaveCount(1);
        await expect(page.locator('#list-start')).toBeVisible();
        await expect(page.locator('[data-mode-panel="table"] .p-summary')).toHaveCount(0);
        await expect(page.locator('.dc-library__views [aria-current="page"]')).toHaveText('all');
        if (javaScriptEnabled) {
          expect(await snapshot()).toEqual(direct);
          await expect(page.locator('[data-prompt-command]')).toHaveText(target === 'list' ? 'library' : 'library --table');
        } else {
          expect((await snapshot()).canonical).toBe(`https://alexandr-sidorenko.me${targetURL}`);
        }
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${initial}$`));
        await page.goForward();
        await expect(page).toHaveURL(new RegExp(`${targetURL}$`));
        await page.reload();
        expect((await snapshot()).canonical).toBe(`https://alexandr-sidorenko.me${targetURL}`);
      }
    });
  });
}
