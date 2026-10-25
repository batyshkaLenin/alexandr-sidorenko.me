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

  test("brackets and current names are server-rendered in both navigation pairs", async ({ page }) => {
    await expectBracketedNavigation(page);
    await page.goto("/");
    await page.getByRole("link", { name: "library", exact: true }).first().click();
    await expect(page).toHaveURL(/\/library$/);
    await page.locator('.dc-mode-switch a[data-mode="table"]').click();
    await expect(page).toHaveURL(/\/library\/table$/);
    await expect(page.locator('.dc-mode-switch [aria-current="true"]')).toHaveAccessibleName("table");
  });

  test("Esc leaves the document in place and ordinary links still navigate", async ({ page }) => {
    await page.goto("/library/skver");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/library\/skver$/);
    await page.getByRole("link", { name: "library", exact: true }).first().click();
    await expect(page).toHaveURL(/\/library$/);
  });
});

test("every navigation link has compact brackets and a name-only current underline", async ({ page }) => {
  await expectBracketedNavigation(page);
});

async function expectBracketedNavigation(page: Page) {
  for (const [path, current] of [["/", "home"], ["/library", "library"], ["/library/table", null]]) {
    await page.goto(path);
    const links = page.locator('.dc-nav__link');
    for (const link of await links.all()) {
      const label = link.locator('span:not([aria-hidden])');
      const name = await label.textContent();
      await expect(link).toHaveAccessibleName(name!);
      expect(await link.evaluate(el => el.textContent!.trim())).toBe(`[${name}]`);
      const brackets = link.locator('[aria-hidden="true"]');
      await expect(brackets).toHaveCount(2);
      for (const bracket of await brackets.all()) await expect(bracket).toBeVisible();
      await expect(link).toHaveCSS("text-decoration-line", "none");
      await expect(label).toHaveCSS("text-decoration-line", await link.getAttribute("aria-current") ? "underline" : "none");
      const gaps = await link.evaluate(el => {
        const spans = Array.from(el.children, child => child.getBoundingClientRect());
        return [spans[1].left - spans[0].right, spans[2].left - spans[1].right];
      });
      for (const gap of gaps) expect(Math.abs(gap)).toBeLessThan(0.5);
    }
    const currentSection = page.locator('.dc-nav__link[aria-current="page"]');
    if (current) await expect(currentSection).toHaveAccessibleName(current);
    else await expect(currentSection).toHaveCount(0); // Exact-page semantics stay unchanged on child documents.
    if (path !== "/") await expect(page.locator('.dc-mode-switch [aria-current="true"]')).toHaveAccessibleName(path.endsWith("table") ? "table" : "list");
  }
}

for (const forcedColors of ["none", "active"] as const) {
  test(`navigation states preserve the label cue and geometry (forced colors ${forcedColors})`, async ({ page }) => {
    await page.emulateMedia({ forcedColors });
    await page.goto("/library");
    await page.mouse.move(0, 0);
    const links = page.locator('.dc-nav__link');
    await page.evaluate(() => document.fonts.ready);
    for (const link of await links.all()) {
      await page.mouse.move(0, 0);
      const label = link.locator('span:not([aria-hidden])');
      const current = !!await link.getAttribute("aria-current");
      const underline = current ? "underline" : "none";
      if (forcedColors === "none") await expect(link).toHaveCSS("color", current ? "rgb(255, 47, 110)" : "rgb(143, 168, 154)");
      const before = await link.boundingBox();
      await link.hover();
      if (forcedColors === "none") await expect(link).toHaveCSS("color", "rgb(255, 111, 158)");
      await expect(label).toHaveCSS("text-decoration-line", underline);
      await page.keyboard.press("Tab");
      await link.focus();
      await expect(link).toHaveCSS("outline-style", "solid");
      await expect(link).toHaveCSS("outline-width", "2px");
      await expect(link).toHaveCSS("outline-offset", "2px");
      if (forcedColors === "none") await expect(link).toHaveCSS("outline-color", "rgb(57, 255, 136)");
      await expect(label).toHaveCSS("text-decoration-line", underline);
      await link.evaluate(el => el.addEventListener("click", event => event.preventDefault(), { once: true }));
      await link.hover();
      await page.mouse.down();
      expect(await link.evaluate(el => el.matches(":active"))).toBe(true);
      if (forcedColors === "none") await expect(link).toHaveCSS("background-color", "rgb(22, 35, 26)");
      await expect(label).toHaveCSS("text-decoration-line", underline);
      await expect(link).toHaveCSS("text-decoration-line", "none");
      expect(await link.boundingBox()).toEqual(before);
      await page.mouse.up();
    }
  });
}

for (const width of [1440, 1024, 375, 320]) {
  test(`bracket links keep coarse targets and fit at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const path of ["/", "/library", "/library/table"]) {
      await page.goto(path);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      for (const box of await page.locator('.dc-nav__link').evaluateAll(links => links.map(link => link.getBoundingClientRect().toJSON()))) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await context.close();
  });
}

test("modified clicks retain native document navigation", async ({ page, context }) => {
  await page.goto("/library");
  for (const selector of ['.dc-nav__link[href="/"]', '.dc-mode-switch a[data-mode="table"]']) {
    const popupPromise = context.waitForEvent("page");
    await page.locator(selector).click({ modifiers: ["ControlOrMeta"] });
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(selector.includes("table") ? /\/library\/table$/ : /\/$/);
    await expect(page).toHaveURL(/\/library$/);
    await popup.close();
  }
});
