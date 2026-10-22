import { expect, test } from "@playwright/test";

for (const [width, height] of [[320, 900], [390, 900], [740, 900], [741, 900], [768, 900], [1440, 900], [900, 400]]) {
  test.describe(`W0027 prompt ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const path of ["/", "/library/all"]) {
      test(`${path} invocation, editing, completion and local dismissal`, async ({ page, context }) => {
        await context.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
        await page.route("**/search-index.json", route => route.fulfill({
          json: { entries: [
            { title: "First text", url: "/library/first", kind: "text" },
            { title: "Second text", url: "/library/second", kind: "text" },
          ] },
        }));
        await page.goto(path);
        const prompt = page.locator("dc-prompt");
        const input = prompt.locator("input");
        const command = prompt.locator("[data-prompt-command]");
        const printed = (await command.textContent())!.trim();
        const nav = page.locator(".dc-nav a").first();
        await nav.focus();
        await expect(input).toBeHidden();
        await page.keyboard.press(":");
        await expect(input).toBeVisible();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(printed);
        expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, printed.length]);
        await page.keyboard.type("lib");
        await expect(input).toHaveValue("lib");
        await input.press("Tab");
        await expect(input).toHaveValue("library ");
        await expect(input).toBeFocused();
        await input.fill("read ");
        const suggestions = prompt.locator(".dc-prompt__suggestions");
        await expect(suggestions).toBeVisible();
        await input.press("ArrowDown");
        await expect(input).toHaveAttribute("aria-activedescendant", /opt-1$/);
        for (const control of [input, suggestions]) {
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.width).toBeGreaterThan(40);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        const url = page.url();
        await input.press("Escape");
        await expect(prompt).not.toHaveAttribute("open", "");
        await expect(input).toBeHidden();
        await expect(command).toHaveText(printed);
        await expect(nav).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page).toHaveURL(url);
        // A new invocation must work after the hidden field loses focus.
        await nav.focus();
        await page.keyboard.press(":");
        await expect(input).toBeFocused();
        await nav.focus();
        await expect(input).toBeHidden();
      });
    }
  });
}

for (const width of [320, 390, 1440]) test.describe(`W0027 no-JS ${width}`, () => {
  test.use({ viewport: { width, height: 900 }, javaScriptEnabled: false });
  test("content and navigation stay usable without a prompt input", async ({ page }) => {
    await page.goto("/library/all");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("dc-prompt input")).toHaveCount(0);
    const home = page.locator('.dc-nav a[href="/"]');
    await expect(home).toBeVisible();
    await home.click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
});
