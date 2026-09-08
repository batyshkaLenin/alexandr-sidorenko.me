import { test, expect } from "@playwright/test";

test.describe("enhancements", () => {
  test("search palette opens from the home toolbar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Palette covered on desktop.");
    await page.goto("/");
    const palette = page.locator("dc-command-palette");
    await expect(palette).toHaveCount(1);
    await page.keyboard.press("/");
    const dialog = page.locator("dc-command-palette dialog[open], dialog[open]").first();
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("prompt accepts : and shows an input when open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Prompt covered on desktop.");
    await page.goto("/");
    await page.keyboard.press(":");
    const prompt = page.locator("dc-prompt");
    await expect(prompt).toHaveAttribute("open", /.*/);
    await expect(prompt.locator("input.dc-prompt__input")).toBeVisible();
  });

  test("copy control on an article copies the wrapped link", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Copy is desktop-representative.");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/library/bluredu-new-teachers");
    const copy = page.locator("dc-copy").first();
    await expect(copy).toHaveCount(1);
    const href = await copy.locator("a[href]").first().getAttribute("href");
    expect(href).toBeTruthy();
    const button = copy.locator("button.dc-copy__button");
    await expect(button).toBeVisible();
    await button.click();
    await expect(copy).toHaveAttribute("copied", "");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("bluredu-new-teachers");
  });
});
