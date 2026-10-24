import { test, expect, type Page } from "@playwright/test";

async function expectPageEscape(page: Page) {
  const url = page.url();
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-test-escape");
    document.addEventListener("keydown", (event) => {
      document.documentElement.setAttribute("data-test-escape", String(event.defaultPrevented));
    }, { once: true });
  });
  await page.keyboard.press("Escape");
  // The removed navigation handler cancelled the event before assigning a URL.
  // Check that observable side effect too, rather than waiting for a timeout
  // to infer the absence of a pending navigation.
  await expect(page.locator("html")).toHaveAttribute("data-test-escape", "false");
  await expect(page).toHaveURL(url);
}

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
      await expect(otherLink.locator(".dc-nav__bracket")).toHaveCount(2);
      for (const bracket of await otherLink.locator(".dc-nav__bracket").all()) await expect(bracket).toBeHidden();
      const currentColor = await currentLink.evaluate((el) => getComputedStyle(el).color);
      expect(await brackets.first().evaluate((el) => getComputedStyle(el).color)).toBe(currentColor);
      expect(await otherLink.evaluate((el) => getComputedStyle(el).color)).not.toBe(currentColor);
    }
  });

  test("the command, search and help keys work; page Esc never navigates", async ({ page }) => {
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
    await expectPageEscape(page);
  });

  test("Home → Search → publication keeps its document and native navigation", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("/");
    const palette = page.locator("dc-command-palette dialog[open]");
    await palette.locator("input").fill("Сквер");
    await palette.locator('a[href="/library/skver"]').click();
    await expect(page).toHaveURL(/\/library\/skver$/);
    await page.locator(".dc-nav__link").first().focus();
    // Old embedded markup must not reactivate the removed page shortcut.
    await page.locator("dc-keynav").evaluate((el) => el.setAttribute("parent-url", "/"));
    await expectPageEscape(page);
    await expectPageEscape(page);
    await page.getByRole("link", { name: "library", exact: true }).first().click();
    await expect(page).toHaveURL(/\/library$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/library\/skver$/);
    await expectPageEscape(page);
  });

  test("Esc closes local interfaces, restores modal callers and the printed prompt", async ({ page }) => {
    await page.goto("/library");
    const search = page.locator("dc-command-palette > button");
    await search.click();
    await page.evaluate(() => {
      window["w0020PaletteClosed"] = new Promise((resolve) => {
        document.querySelector("dc-command-palette dialog")!.addEventListener("close", resolve, { once: true });
      });
    });
    await page.locator("dc-command-palette input").press("Escape");
    await page.evaluate(() => window["w0020PaletteClosed"]);
    await expect(search).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expectPageEscape(page);

    const help = page.locator("dc-help > button");
    await help.click();
    await page.evaluate(() => {
      window["w0020HelpClosed"] = new Promise((resolve) => {
        document.querySelector("dc-help dialog")!.addEventListener("close", resolve, { once: true });
      });
    });
    await page.keyboard.press("Escape");
    await page.evaluate(() => window["w0020HelpClosed"]);
    await expect(help).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expectPageEscape(page);

    const caller = page.locator(".dc-nav__link").first();
    const printed = page.locator("dc-prompt [data-prompt-command]");
    const command = await printed.textContent();
    await caller.focus();
    await page.keyboard.press(":");
    const prompt = page.locator("dc-prompt input");
    await expect(prompt).toBeFocused();
    await prompt.press("Escape");
    await expect(prompt).toBeHidden();
    await expect(printed).toBeVisible();
    await expect(printed).toHaveText(command!);
    await expect(prompt).not.toBeFocused();
    await expectPageEscape(page);
  });

  test("page Esc leaves input, media and unrelated native dialog handling intact", async ({ page }) => {
    await page.goto("/library/skver");
    await page.evaluate(() => {
      const fixture = document.createElement("section");
      fixture.id = "escape-fixture";
      fixture.innerHTML = '<input aria-label="fixture input"><textarea aria-label="fixture textarea"></textarea><select aria-label="fixture select"><option>one</option></select><div contenteditable="true" tabindex="0">editable</div><audio controls tabindex="0"></audio><video controls tabindex="0"></video><dialog><button>native dialog</button></dialog>';
      document.querySelector("main")!.append(fixture);
    });
    for (const selector of ["input", "textarea", "select", "[contenteditable]", "audio", "video"]) {
      await page.locator(`#escape-fixture ${selector}`).focus();
      await expectPageEscape(page);
    }
    const modified = await page.evaluate(() => {
      return ["ctrlKey", "altKey", "metaKey", "shiftKey"].map((modifier) => {
        const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, [modifier]: true });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      });
    });
    expect(modified).toEqual([false, false, false, false]);
    await page.evaluate(() => {
      const dialog = document.querySelector<HTMLDialogElement>("#escape-fixture dialog")!;
      window["w0020NativeClosed"] = new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
      dialog.showModal();
    });
    await page.keyboard.press("Escape");
    await page.evaluate(() => window["w0020NativeClosed"]);
    await expect(page.locator("#escape-fixture dialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/library\/skver$/);
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

  test("Esc leaves the document in place and ordinary links still navigate", async ({ page }) => {
    await page.goto("/library/skver");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/library\/skver$/);
    await page.getByRole("link", { name: "library", exact: true }).first().click();
    await expect(page).toHaveURL(/\/library$/);
  });
});
