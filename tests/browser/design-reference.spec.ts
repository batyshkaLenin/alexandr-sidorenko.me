import { expect, test } from "@playwright/test";

// Explicit local reference build only. These are implementation checks, not a
// canonical QA receipt or a visual-conformance approval of known deviations.
for (const width of [1440, 390, 320]) {
  for (const javaScriptEnabled of [true, false]) {
    test.describe(`${width} ${javaScriptEnabled ? "JS" : "no-JS"}`, () => {
      test.use({ viewport: { width, height: 900 }, javaScriptEnabled });
      test.skip(!process.env.DESIGN_REFERENCE_ROOT, "requires explicit local reference build");

      test("theme production APIs and native baseline", async ({ page, context }, info) => {
        test.skip(info.project.name !== "chromium-desktop", "bounded Chromium matrix sets exact widths");
        if (javaScriptEnabled) await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto("http://127.0.0.1:4174/__design/theme");
        await expect(page.locator("h1")).toHaveText("Theme reference");
        await expect(page.locator("article.dc-panel--detail")).toBeVisible();
        await expect(page.locator(".dc-back")).toHaveAttribute("href", "/");
        const summary = page.locator("#theme-disclosure summary");
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#theme-disclosure details")).toHaveAttribute("open", "");
        await page.locator("#theme-disclosure input").check();
        await expect(page.locator("#theme-disclosure input")).toBeChecked();
        const links = page.locator("#theme-listnav a");
        await links.first().focus();
        if (javaScriptEnabled) {
          await page.keyboard.press("ArrowDown");
          await expect(links.nth(1)).toBeFocused();
          await page.keyboard.press("k");
          await expect(links.first()).toBeFocused();
          await page.locator("#theme-copy button").click();
          await expect(page.locator("#theme-copy dc-copy")).toHaveAttribute("copied", "");
          await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("http://127.0.0.1:4174/__design/theme/");
        } else {
          await page.keyboard.press("Tab");
          await expect(links.nth(1)).toBeFocused();
          await expect(page.locator("#theme-copy button")).toHaveCount(0);
        }
        await links.first().focus();
        await page.keyboard.press("Tab");
        await expect(links.nth(1)).toBeFocused();
        await expect(links.nth(1)).toHaveCSS("outline-style", "solid");
        // Colour is a recorded deviation; this test does not bless pink as normative.
        await expect(page.locator("#theme-copy a")).toHaveAttribute("href", "/__design/theme/");
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        if (javaScriptEnabled && width !== 320) await page.screenshot({ path: info.outputPath("theme.png"), fullPage: true });
      });

      test("site production renderers and composition links", async ({ page }, info) => {
        test.skip(info.project.name !== "chromium-desktop", "bounded Chromium matrix sets exact widths");
        const failures: string[] = [];
        page.on("pageerror", error => failures.push(error.message));
        page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
        await page.goto("/__design/site");
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("[data-design-reference] .dc-prose")).toHaveCSS("padding", "0px");
        const badge = page.locator("#site-type-badge a");
        await expect(badge).toHaveAttribute("href", "/library/types/article");
        await badge.focus();
        await expect(badge).toBeFocused();
        await expect(page.locator(".dc-figure img").first()).toBeVisible();
        await expect.poll(() => page.locator(".dc-figure img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(page.locator(".dc-code")).toContainText("Native content remains readable");
        const table = page.locator(".dc-prose-table");
        await expect(table).toHaveAttribute("role", "region");
        await table.focus();
        await expect(table).toBeFocused();
        await expect(page.locator("th[scope=col]")).toHaveCount(2);
        for (const url of ["/", "/library/all", "/library/bluredu-new-teachers"]) {
          await expect(page.locator(`#site-composition a[href="${url}"]`)).toBeVisible();
        }
        if (javaScriptEnabled) {
          const toggle = page.locator("dc-image-toggle button");
          await toggle.click();
          await expect(page.locator("dc-image-toggle")).toHaveAttribute("showing", "original");
        } else {
          await expect(page.locator("dc-image-toggle button")).toHaveCount(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        expect(failures).toEqual([]);
        if (javaScriptEnabled && width !== 320) await page.screenshot({ path: info.outputPath("site.png"), fullPage: true });
      });
    });
  }
}
