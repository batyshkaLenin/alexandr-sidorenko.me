import { test, expect, type Page } from "@playwright/test";

const LIST_PAGES = ["/", "/library", "/library/all", "/library/table", "/library/timeline", "/library/music", "/library/types"];
const NO_LIST_PAGES = ["/library/topics", "/library/skver"];

async function tabUntil(page: Page, text: string, limit = 20) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const current = await page.evaluate(() => (document.activeElement?.textContent || "").trim());
    if (current === text) return;
  }
  throw new Error(`no Tab stop "${text}" within ${limit}`);
}

test.describe("keyboard bootstrap", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Keyboard bootstrap is asserted on desktop.");
  });

  test("list pages offer Skip to list right after Skip to content", async ({ page }) => {
    for (const path of LIST_PAGES) {
      await page.goto(path);
      await page.keyboard.press("Tab");
      await expect(page.locator("a.dc-skip-link[href='#main']"), path).toBeFocused();
      await page.keyboard.press("Tab");
      const skip = page.locator("a.dc-skip-link[href='#list-start']");
      await expect(skip, path).toBeFocused();
      await expect(skip).toBeVisible();
      await expect(skip).toHaveText("Skip to list");
      await expect(page.locator("a#list-start[href]"), path).toHaveCount(1);
    }
  });

  test("pages without a material list have no Skip to list", async ({ page }) => {
    for (const path of NO_LIST_PAGES) {
      await page.goto(path);
      await expect(page.locator("a.dc-skip-link[href='#list-start']"), path).toHaveCount(0);
      await expect(page.locator("#list-start"), path).toHaveCount(0);
    }
  });

  test("Skip to list focuses the first material and j/k walk the list", async ({ page }) => {
    for (const path of ["/library", "/"]) {
      await page.goto(path);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      const first = page.locator("#list-start");
      await expect(first, path).toBeFocused();
      const firstHref = await first.getAttribute("href");
      await page.keyboard.press("j");
      const second = await page.evaluate(() => document.activeElement?.getAttribute("href"));
      expect(second, path).toBeTruthy();
      expect(second, path).not.toBe(firstHref);
      await page.keyboard.press("k");
      await expect(first, path).toBeFocused();
    }
  });

  test("Skip to list follows an in-place list/table switch", async ({ page }) => {
    await page.goto("/library/all");
    const skipAndEnter = async () => {
      await page.locator("a.dc-skip-link[href='#main']").focus();
      await page.keyboard.press("Tab");
      await expect(page.locator("a.dc-skip-link[href='#list-start']")).toBeFocused();
      await page.keyboard.press("Enter");
    };
    await page.locator("dc-modes [data-mode='table']").click();
    await expect(page.locator("#list-start")).toHaveCount(1);
    await skipAndEnter();
    await expect(page.locator("#list-start")).toBeFocused();
    await expect(page.locator("#list-start")).toBeVisible();
    expect(await page.locator("#list-start").evaluate((el) => !!el.closest("[data-mode-panel='table']"))).toBe(true);

    await page.locator("dc-modes [data-mode='list']").click();
    await expect(page.locator("#list-start")).toHaveCount(1);
    await skipAndEnter();
    await expect(page.locator("#list-start")).toBeFocused();
    expect(await page.locator("#list-start").evaluate((el) => !!el.closest("[data-mode-panel='list']"))).toBe(true);
  });

  test("document arrows still scroll the page before entering the list", async ({ page }) => {
    await page.goto("/library");
    const before = await page.evaluate(() => scrollY);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    await expect(page.locator("body")).toBeFocused();
  });

  test("ViewsNav is not a Tab stop and a focused view scrolls into sight", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/library");
    const nav = page.locator(".dc-library__views");
    await expect(nav).not.toHaveAttribute("tabindex", /.*/);
    await tabUntil(page, "topics");
    const fit = await page.evaluate(() => {
      const scroller = document.querySelector(".dc-library__views")!.getBoundingClientRect();
      const link = (document.activeElement as HTMLElement).getBoundingClientRect();
      return link.left >= scroller.left - 1 && link.right <= scroller.right + 1;
    });
    expect(fit).toBe(true);
  });

  test("native ViewsNav path reaches Music from a fresh page", async ({ page }) => {
    await page.goto("/library");
    await tabUntil(page, "music");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/music$/);
  });

  test("command mode replaces the printed command with the first keys", async ({ page }) => {
    await page.goto("/library");
    await page.keyboard.press(":");
    const input = page.locator("dc-prompt input.dc-prompt__input");
    await expect(input).toBeFocused();
    const selection = await input.evaluate((el: HTMLInputElement) => [el.value, el.selectionStart, el.selectionEnd]);
    expect(selection[1]).toBe(0);
    expect(selection[2]).toBe((selection[0] as string).length);
    expect((selection[0] as string).length).toBeGreaterThan(0);
    await page.keyboard.type("library --music");
    await expect(input).toHaveValue("library --music");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/music$/);
  });

  test("a click opens the prompt with the command selected; Escape restores it", async ({ page }) => {
    await page.goto("/library");
    const printed = page.locator("dc-prompt [data-prompt-command]");
    const text = (await printed.textContent())!.replace(/\s+/g, " ").trim();
    await printed.click();
    const input = page.locator("dc-prompt input.dc-prompt__input");
    await expect(input).toBeFocused();
    expect(await input.evaluate((el: HTMLInputElement) => [el.value, el.selectionStart, el.selectionEnd]))
      .toEqual([text, 0, text.length]);
    await page.keyboard.press("ArrowLeft");
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart === el.selectionEnd)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(input).toBeHidden();
    await expect(printed).toBeVisible();
    await expect(printed).toHaveText(text);
  });
});

test.describe("keyboard bootstrap without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("Skip to list is plain fragment navigation onto the first material", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Keyboard bootstrap is asserted on desktop.");
    await page.goto("/library");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator("a.dc-skip-link[href='#list-start']")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#list-start$/);
    await expect(page.locator("#list-start")).toBeFocused();
  });
});
