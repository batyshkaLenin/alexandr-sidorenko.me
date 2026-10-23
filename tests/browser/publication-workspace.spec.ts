import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const LIBRARY = "/library";
const SKVER = "/library/skver";
const ARTICLE = "/library/bluredu-new-teachers";
const NOTE = "/library/cool-kids-of-death-a-moze-tak";

const DATE_CASES = [
  ["bluredu-new-teachers", "article", ".dc-publication__meta"],
  ["svidetel-v-bagazhnike", "fiction", ".dc-fiction__colophon"],
  ["trafaret", "poem", ".dc-poem__colophon"],
  ["regular-visitor", "track", ".dc-track__meta"],
  ["cool-kids-of-death-a-moze-tak", "note", ".dc-publication__meta"],
  ["philosophy-of-freedom", "paper", ".dc-publication__meta"],
  ["itchatter-hakatony", "talk", ".dc-publication__meta"],
];

for (const javaScriptEnabled of [true, false]) {
  test.describe(`publication date metadata (JS ${javaScriptEnabled ? "on" : "off"})`, () => {
    test.use({ javaScriptEnabled });
    for (const width of [390, 1100, 1440]) {
      test(`date has no navigation or Tab stop at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        for (const [slug, type, selector] of DATE_CASES) {
          await page.goto(`/library/${slug}`);
          const line = page.locator(selector).first();
          const date = line.locator("time.dt-published");
          await expect(date).toBeVisible();
          const text = await date.textContent();
          const datetime = await date.getAttribute("datetime");
          expect(text).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
          expect(datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
          expect(await date.evaluate((el) => !!el.closest("a, button, [tabindex]"))).toBe(false);
          await expect(line.locator("a.u-url")).toHaveCount(0);
          await expect(line.locator("a[href]")).toHaveCount(1);

          const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
          const entryUrl = page.locator("article.h-entry .u-url").first();
          expect(await entryUrl.evaluate((el) => el.tagName)).toBe("DATA");
          await expect(entryUrl).toHaveAttribute("value", canonical!);
          await expect(entryUrl).toBeHidden();
          const title = page.locator("h1");
          const sizes = await Promise.all([date, title].map((node) => node.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))));
          expect(sizes[0]).toBeLessThan(sizes[1]);
          // Measure the opaque date colours in both modes. Axe's recursive
          // frame analysis needs page scripts, so run it in JS-on cases only.
          const contrast = await date.evaluate((el) => {
            const channels = (color: string) => color.match(/[\d.]+/g)!.map(Number);
            const foreground = channels(getComputedStyle(el).color);
            let background: number[] | undefined;
            for (let node: Element | null = el; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              const candidate = channels(style.backgroundColor);
              if (style.backgroundImage !== "none" || (candidate[3] !== undefined && ![0, 1].includes(candidate[3]))) {
                throw new Error("Date contrast measurement needs a solid opaque surface");
              }
              if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
            }
            if (!background || (foreground[3] !== undefined && foreground[3] !== 1)) throw new Error("Missing opaque date colours");
            const luminance = (rgb: number[]) => rgb.slice(0, 3).map((value) => {
              const s = value / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
            const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
            return { foreground, background, ratio: (values[1] + 0.05) / (values[0] + 0.05) };
          });
          expect(contrast.ratio, `${type}: ${JSON.stringify(contrast)}`).toBeGreaterThanOrEqual(4.5);
          await info.attach(`date-${type}-contrast`, { body: JSON.stringify(contrast), contentType: "application/json" });
          if (javaScriptEnabled) {
            const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).include(selector).analyze();
            expect(axe.violations, `${type}: ${JSON.stringify(axe.violations)}`).toEqual([]);
          }

          await line.evaluate((el) => el.scrollIntoView({ block: "center" }));
          const screen = info.outputPath(`date-${type}.png`);
          await line.screenshot({ path: screen });
          await info.attach(`date-${type}-${width}`, { path: screen, contentType: "image/png" });
          const typeLink = line.locator("a.dc-list__type");
          await expect(typeLink).toHaveAttribute("lang", "en");
          await expect(typeLink).toHaveAttribute("href", new RegExp(`/library/types/${type}/?$`));
          await typeLink.focus();
          await page.keyboard.press("Tab");
          expect(await line.evaluate((el) => el.contains(document.activeElement))).toBe(false);

          await page.emulateMedia({ media: "print" });
          await expect(date).toBeVisible();
          await expect(date).toHaveText(text!);
          await expect(date).toHaveAttribute("datetime", datetime!);
          await expect(entryUrl).toHaveAttribute("value", canonical!);
          await page.emulateMedia({ media: "screen" });
          await typeLink.focus();
          await page.keyboard.press("Enter");
          await expect(page).toHaveURL(new RegExp(`/library/types/${type}/?$`));
        }
      });
    }
  });
}

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
  for (const width of [390, 1440]) {
    for (const [slug, family, type] of [
      ["svidetel-v-bagazhnike", "fiction", "fiction"],
      ["trafaret", "poem", "poem"],
    ]) {
      test(`colophon ${family} type link stays distinguishable at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.goto(`/library/${slug}`);
        const colophon = page.locator(`.dc-${family}__colophon`);
        const link = colophon.locator("a.dc-list__type");
        await link.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await expect(link).not.toBeFocused();
        await expect(link).toHaveAttribute("href", new RegExp(`/library/types/${type}/?$`));
        await expect(link).toHaveAttribute("lang", "en");
        await expect(link).toHaveText(type.toUpperCase());
        await expect(link).toHaveCSS("text-decoration-line", "underline");
        // Resolve the inherited tokens before comparing computed values.
        const tokens = await link.evaluate((el) => {
          const probe = document.createElement("span");
          probe.style.color = getComputedStyle(el).getPropertyValue("--dc-type-literary");
          probe.style.fontSize = getComputedStyle(el).getPropertyValue("--dc-fs-meta");
          el.append(probe);
          const { color, fontSize } = getComputedStyle(probe);
          probe.remove();
          return { color, fontSize };
        });
        await expect(link).toHaveCSS("color", tokens.color);
        await expect(link).toHaveCSS("font-size", tokens.fontSize);
        const audits = await new AxeBuilder({ page })
          .withRules(["link-in-text-block", "color-contrast"])
          .include(`.dc-${family}__colophon`)
          .analyze();
        expect(audits.violations, JSON.stringify(audits.violations)).toEqual([]);
        const grayscale = testInfo.outputPath("colophon-grayscale.png");
        await colophon.screenshot({ path: grayscale, style: "html { filter: grayscale(1); }" });
        await testInfo.attach(`colophon-${family}-${width}-grayscale`, { path: grayscale, contentType: "image/png" });
        await link.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(link).toBeFocused();
        expect(await link.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
        expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
        const focus = testInfo.outputPath("colophon-focus.png");
        await colophon.screenshot({ path: focus });
        await testInfo.attach(`colophon-${family}-${width}-focus`, { path: focus, contentType: "image/png" });
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`/library/types/${type}/?$`));
      });
    }
  }

  test("colophon fix preserves non-link type labels and representative accessibility", async ({ page }) => {
    for (const path of [
      "/", "/library", "/library/all", "/library/svidetel-v-bagazhnike", "/library/trafaret",
      "/library/cool-kids-of-death-hej-chlopcze", "/library/regular-visitor",
      "/library/bluredu-new-teachers", "/library/itchatter-hakatony", "/library/philosophy-of-freedom",
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
      expect(serious, `${path}: ${JSON.stringify(serious)}`).toEqual([]);
      if (path === "/library/all") {
        const labels = page.locator("span.dc-list__type");
        expect(await labels.count()).toBeGreaterThan(0);
        for (const label of await labels.all()) {
          await expect(label).not.toHaveAttribute("tabindex");
          await expect(label).toHaveCSS("text-decoration-line", "none");
          expect(await label.evaluate((el) => el.closest("a, button"))).toBeNull();
        }
      }
    }
  });

  test("colophon type links retain their affordance without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      for (const [slug, family] of [["svidetel-v-bagazhnike", "fiction"], ["trafaret", "poem"]]) {
        await page.goto(`/library/${slug}`);
        const link = page.locator(`.dc-${family}__colophon a.dc-list__type`);
        await expect(link).toHaveCSS("text-decoration-line", "underline");
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/library/types/${family}/?$`));
      }
    } finally {
      await context.close();
    }
  });

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
    await expect(byline.locator(".u-url")).toHaveCount(1);
    await expect(byline.locator(".u-url")).toHaveJSProperty("tagName", "DATA");
    await expect(byline.locator("a")).toHaveCount(0);
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

  test("aftermatter follows the reading measure, not a second pane", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Aftermatter geometry once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE);
    await expect(page.locator(".dc-identity__back")).toHaveCount(0);
    const article = await paneBox(page, ".dc-panel--detail");
    const title = await paneBox(page, ".dc-title");
    const after = await paneBox(page, ".dc-aftermatter");
    expect(after.x).toBeGreaterThanOrEqual(article.x - 1);
    expect(after.x + after.w).toBeLessThanOrEqual(article.x + article.w + 1);
    expect(Math.abs(after.x - title.x)).toBeLessThan(8);
    expect(Math.abs(after.w - title.w)).toBeLessThan(24);
  });

  test("publication chrome: type, date, tags", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Chrome links once.");
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(ARTICLE);
    const type = page.locator(".dc-publication__meta a.dc-list__type");
    await expect(type).toHaveAttribute("href", /\/library\/types\/article\/?$/);
    await expect(page.locator(".dc-publication__meta time.dt-published")).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);

    await page.goto(NOTE);
    const tag = page.locator(".tags a[rel='tag']").first();
    await expect(tag).toHaveAttribute("href", /\/library\/topics\/.+/);
    const emptyGroup = await page.evaluate(
      () =>
        [...document.querySelectorAll(".dc-relations__group")].some(
          (group) => group.querySelectorAll("li").length === 0,
        ),
    );
    expect(emptyGroup).toBe(false);
    await expect(page.locator(".dc-relations")).toContainText("Hej chłopcze");
    await expect(page.locator("div.dc-verse")).toHaveCount(1);
    await expect(page.locator("blockquote.as-parallel-text.dc-verse").first()).toBeVisible();
  });
});
