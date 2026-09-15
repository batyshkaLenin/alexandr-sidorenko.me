import { test, expect } from "@playwright/test";

test.describe("nav shortcuts and current marker", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Keyboard shortcuts are asserted on desktop.");
  });

  test("digits and o do nothing on Home, Library and a publication", async ({ page }) => {
    for (const path of ["/", "/library", "/library/skver"]) {
      await page.goto(path);
      await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
      const images = await page.evaluate(() => Array.from(document.querySelectorAll("dc-image-toggle")).map((el) => el.getAttribute("showing")));
      for (const key of ["1", "2", "3", "o", "O"]) {
        await page.keyboard.press(key);
      }
      await page.waitForTimeout(300);
      await expect(page, path).toHaveURL(new RegExp(`${path === "/" ? "/$" : path + "$"}`));
      const after = await page.evaluate(() => Array.from(document.querySelectorAll("dc-image-toggle")).map((el) => el.getAttribute("showing")));
      expect(after, path).toEqual(images);
    }
  });

  test("the current section is marked by aria-hidden brackets, named by its text", async ({ page }) => {
    for (const [path, current, other] of [["/", "home", "library"], ["/library", "library", "home"]]) {
      await page.goto(path);
      const currentLink = page.locator(".dc-nav__link[aria-current='page']");
      await expect(currentLink).toHaveCount(1);
      await expect(currentLink).toHaveAccessibleName(current);
      await expect(currentLink).toHaveText(`[ ${current} ]`);
      const brackets = currentLink.locator(".dc-nav__bracket");
      await expect(brackets).toHaveCount(2);
      for (const bracket of await brackets.all()) await expect(bracket).toHaveAttribute("aria-hidden", "true");
      const otherLink = page.locator(".dc-nav__link:not([aria-current])");
      await expect(otherLink).toHaveCount(1);
      await expect(otherLink).toHaveAccessibleName(other);
      await expect(otherLink.locator(".dc-nav__bracket")).toHaveCount(0);
      const currentColor = await currentLink.evaluate((el) => getComputedStyle(el).color);
      expect(await brackets.first().evaluate((el) => getComputedStyle(el).color)).toBe(currentColor);
      expect(await otherLink.evaluate((el) => getComputedStyle(el).color)).not.toBe(currentColor);
    }
  });

  test("the command, search and help keys and Esc still work", async ({ page }) => {
    await page.goto("/library");
    await page.keyboard.press("/");
    await expect(page.locator("dialog[open]").first()).toBeVisible();
    await page.goto("/library");
    await page.keyboard.press("?");
    await expect(page.locator("dialog.dc-help[open]")).toBeVisible();
    await page.goto("/library");
    await page.keyboard.press(":");
    await expect(page.locator("dc-prompt input.dc-prompt__input")).toBeFocused();
    await page.goto("/library/skver");
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/library$/);
  });
});

test.describe("nav current marker without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("brackets are part of the markup, not an enhancement", async ({ page }) => {
    await page.goto("/library");
    const currentLink = page.locator(".dc-nav__link[aria-current='page']");
    await expect(currentLink).toHaveText("[ library ]");
    await expect(currentLink.locator(".dc-nav__bracket").first()).toBeVisible();
  });
});
