import { test, expect } from "@playwright/test";

test.describe("keyboard", () => {
  test("skip link is first Tab stop, :focus-visible, and reaches main", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Skip-link tab order is asserted on desktop.",
    );
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.locator("a.dc-skip-link");
    await expect(skip).toBeFocused();
    const focusVisible = await skip.evaluate((el) => el.matches(":focus-visible"));
    expect(focusVisible).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    // Theme main is a landmark, not a focus target (no tabindex="-1"); the
    // runtime contract is that the skip link moves the reader to #main.
    await expect(page.locator("#main")).toBeVisible();
  });

  test("help dialog opens, traps nothing forever, and restores focus", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Help overlay is desktop-representative.");
    await page.goto("/");
    const trigger = page.locator("dc-help .dc-help__trigger, button.dc-help__trigger").first();
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.click();
    const dialog = page.locator("dialog[open]").first();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("external media hands keyboard focus to the loaded player", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "External media focus handoff is asserted on desktop.",
    );
    await page.goto("/library/itchatter-hakatony");
    const load = page.getByRole("button", { name: "LOAD PLAYER" });
    await expect(load).toBeVisible();
    await load.focus();
    await load.press("Enter");

    const player = page.locator("as-external-media iframe");
    await expect(player).toHaveCount(1);
    await expect(player).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/sXq_ZKYl554",
    );
    await expect(player).toBeFocused();
  });
});
