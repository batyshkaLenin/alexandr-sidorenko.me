import { test, expect } from "@playwright/test";

/**
 * JS-disabled context: progressive enhancement must not leave dead chrome, and
 * native links / audio must still work.
 */
test.describe("no-js", () => {
  test.use({ javaScriptEnabled: false });

  test("home keeps navigable links without enhancement UI claiming to work", async ({
    page,
  }) => {
    // Home runs on both desktop and mobile viewports (T31 fixture map).
    await page.goto("/");
    await expect(page.locator("a.dc-skip-link")).toBeVisible();
    await expect(page.locator("a[href='/library']").first()).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.locator("a[href='/library']").first().click();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("track page keeps a native audio element", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Track is desktop-representative.");
    await page.goto("/library/regular-visitor");
    const audio = page.locator("audio");
    await expect(audio).toHaveCount(1);
    const src = await audio.getAttribute("src");
    expect(src).toBeTruthy();
    // Fallback download link inside <audio> for agents without media support.
    await expect(audio.locator("a[href*='regular-visitor']")).toHaveCount(1);
  });
});
