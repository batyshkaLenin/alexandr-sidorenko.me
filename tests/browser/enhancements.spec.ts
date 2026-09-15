import { test, expect, type Page, type Route } from "@playwright/test";

const controlScript = /\/js\/dc-(?:clock|command-palette|help)\.min\./;

type GeometryBox = { x: number; y: number; width: number; height: number };

async function topbarGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };

    const topbar = document.querySelector<HTMLElement>(".dc-topbar")!;
    return {
      tools: rect(".dc-topbar__tools"),
      header: rect(".dc-header"),
      main: rect("#main"),
      overflows: topbar.scrollWidth > topbar.clientWidth
        || document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

function expectStableBox(before: GeometryBox, after: GeometryBox) {
  for (const edge of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(after[edge] - before[edge]), edge).toBeLessThanOrEqual(0.5);
  }
}

test.describe("enhancements", () => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`topbar keeps its geometry while controls upgrade at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);

      const heldRoutes: Route[] = [];
      await page.route(controlScript, async (route) => {
        heldRoutes.push(route);
      });
      await page.route("**/*.woff2", async (route) => route.abort());

      await page.goto("/", { waitUntil: "commit" });
      await page.locator(".dc-topbar__tools").waitFor();
      await expect.poll(() => heldRoutes.length).toBe(3);
      const before = await topbarGeometry(page);

      await Promise.all(heldRoutes.map((route) => route.continue()));
      await page.waitForLoadState("load");
      await expect.poll(() => page.evaluate(() => [
        "dc-command-palette",
        "dc-help",
        "dc-clock",
      ].every((selector) => document.querySelector(selector)!.matches(":defined"))))
        .toBe(true);
      await expect(page.locator(".dc-palette__trigger")).toBeVisible();
      const after = await topbarGeometry(page);

      expectStableBox(before.tools, after.tools);
      expectStableBox(before.header, after.header);
      expectStableBox(before.main, after.main);
      expect(before.overflows).toBe(false);
      expect(after.overflows).toBe(false);
    });
  }

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

  test("search adds a Text Fragment only for a reliable body match", async ({ page }) => {
    await page.route("**/search-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              title: "Только в тексте",
              url: "/library/body-result",
              path: "~/library/body-result",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: "До unique-needle после.",
            },
            {
              title: "Needle в заголовке",
              url: "/library/title-result",
              path: "~/library/title-result",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: "Needle встречается и в теле.",
            },
            {
              title: "Неоднозначное",
              url: "/library/ambiguous-result",
              path: "~/library/ambiguous-result",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: `${"а".repeat(40)}same${"б".repeat(40)} разрыв ${"а".repeat(40)}same${"б".repeat(40)}`,
            },
            {
              title: "Контекст различает",
              url: "/library/context-result",
              path: "~/library/context-result",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: "Первое окружение перед same после первого. Второе окружение перед same после второго.",
            },
          ],
        }),
      });
    });

    await page.goto("/");
    await page.keyboard.press("/");
    const input = page.locator("dc-command-palette .dc-palette__input");

    await input.fill("unique-needle");
    await expect(page.locator(".dc-palette__link", { hasText: "Только в тексте" }))
      .toHaveAttribute("href", "/library/body-result#:~:text=unique%2Dneedle");

    await input.fill("needle");
    await expect(page.locator(".dc-palette__link", { hasText: "Needle в заголовке" }))
      .toHaveAttribute("href", "/library/title-result");

    await input.fill("same");
    await expect(page.locator(".dc-palette__link", { hasText: "Неоднозначное" }))
      .toHaveAttribute("href", "/library/ambiguous-result");
    await expect(page.locator(".dc-palette__link", { hasText: "Контекст различает" }))
      .toHaveAttribute("href", /\/library\/context-result#:~:text=.+same/);
  });

  test("search selection uses listbox semantics, not aria-current", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Palette selection covered on desktop.");
    await page.route("**/search-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              title: "Alpha Needle",
              url: "/library/alpha",
              path: "~/library/alpha",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: "alpha needle",
            },
            {
              title: "Beta Needle",
              url: "/library/beta",
              path: "~/library/beta",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: "beta needle",
            },
            {
              title: "Gamma Needle",
              url: "/library/gamma",
              path: "~/library/gamma",
              type: "Текст",
              kind: "text",
              topics: [],
              summary: "",
              text: "gamma needle",
            },
          ],
        }),
      });
    });

    await page.goto("/");
    await expect(page.locator(".dc-nav__link[aria-current='page']")).toHaveCount(1);

    await page.keyboard.press("/");
    const input = page.locator("dc-command-palette .dc-palette__input");
    await expect(input).toBeFocused();
    await input.fill("needle");

    const links = page.locator(".dc-palette__link");
    await expect(links).toHaveCount(3);
    await expect(links.first()).toHaveAttribute("role", "option");
    await expect(page.locator(".dc-palette__link[aria-current]")).toHaveCount(0);
    await expect(links.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(links.nth(1)).toHaveAttribute("aria-selected", "false");
    await expect(links.nth(2)).toHaveAttribute("aria-selected", "false");

    const firstId = await links.nth(0).getAttribute("id");
    expect(firstId).toBeTruthy();
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveAttribute("aria-activedescendant", firstId!);
    await expect
      .poll(() => links.nth(0).evaluate((el) => getComputedStyle(el, "::before").content))
      .toMatch(/>/);

    await page.keyboard.press("ArrowDown");
    await expect(links.nth(0)).toHaveAttribute("aria-selected", "false");
    await expect(links.nth(1)).toHaveAttribute("aria-selected", "true");
    const secondId = await links.nth(1).getAttribute("id");
    await expect(input).toHaveAttribute("aria-activedescendant", secondId!);
    await expect(input).toBeFocused();

    await links.nth(2).hover();
    await expect(links.nth(1)).toHaveAttribute("aria-selected", "false");
    await expect(links.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".dc-palette__link[aria-selected='true']")).toHaveCount(1);
    await expect(page.locator(".dc-nav__link[aria-current='page']")).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/gamma\/?$/);
  });

  test("prompt suggestion selection uses listbox semantics, not aria-current", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Prompt selection covered on desktop.");
    await page.route("**/search-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              title: "First Text",
              url: "/library/first-text",
              kind: "text",
            },
            {
              title: "Second Text",
              url: "/library/second-text",
              kind: "text",
            },
            {
              title: "Third Text",
              url: "/library/third-text",
              kind: "text",
            },
          ],
        }),
      });
    });

    await page.goto("/");
    await page.keyboard.press(":");
    const prompt = page.locator("dc-prompt");
    const input = prompt.locator("input.dc-prompt__input");
    await expect(input).toBeVisible();
    await input.fill("read ");
    const rows = prompt.locator(".dc-prompt__suggestion");
    await expect(rows).toHaveCount(3);
    await page.keyboard.press("ArrowDown");

    await expect(rows.first()).toHaveAttribute("role", "option");
    await expect(prompt.locator(".dc-prompt__suggestion[aria-current]")).toHaveCount(0);
    await expect(prompt.locator(".dc-prompt__suggestion[aria-selected='true']")).toHaveCount(1);
    await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");

    const selectedId = await rows.nth(1).getAttribute("id");
    expect(selectedId).toBeTruthy();
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveAttribute("aria-activedescendant", selectedId!);
    await expect(input).toBeFocused();
    await expect
      .poll(() => rows.nth(1).evaluate((el) => getComputedStyle(el, "::before").content))
      .toMatch(/>/);

    await rows.nth(2).dispatchEvent("mousedown");
    await expect(input).toHaveValue(/Third Text$/);
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
    // Playwright Firefox does not expose clipboard-read/write permissions.
    test.skip(
      testInfo.project.name === "firefox-desktop",
      "Clipboard read permission is Chromium-only in Playwright.",
    );
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

  test("status chrome uses unambiguous hints without NORMAL or LIBRARY · VIEW", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Status bar is desktop-only.");
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/");
    await expect(page.locator(".dc-nav__hint")).toHaveText("[1] [2] · apps");
    const homeBar = page.locator(".dc-statusbar");
    await expect(homeBar).toBeVisible();
    await expect(homeBar.locator("[data-statusbar-mode]")).toBeHidden();
    await expect(homeBar).not.toContainText("NORMAL");
    await expect(homeBar.locator("[data-statusbar-keys]")).toContainText("[↑↓] [j k] · list");
    await expect(homeBar.locator("[data-statusbar-keys]")).toContainText("[/] · search");
    await expect(homeBar.locator("[data-statusbar-keys]")).toContainText("[?] · help");

    await page.keyboard.press("?");
    const help = page.locator("dialog.dc-help[open]");
    await expect(help).toBeVisible();
    const keyColumn = help.locator(".dc-help__column").filter({ has: page.locator(".dc-help__column-title", { hasText: "keys" }) });
    const helpKeys = keyColumn.locator("dt.dc-help__keys");
    await expect(helpKeys.filter({ hasText: /^\[\/\]$/ })).toHaveCount(1);
    await expect(helpKeys.filter({ hasText: /^\[\?\]$/ })).toHaveCount(1);
    await expect(helpKeys.filter({ hasText: /^\[↑↓\] \[j k\]$/ })).toHaveCount(1);
    await expect(helpKeys.filter({ hasText: /^\[Esc\]$/ })).toHaveCount(1);
    const helpMeanings = keyColumn.locator("dd.dc-help__meaning");
    await expect(helpMeanings.filter({ hasText: /^search$/ })).toHaveCount(1);
    await expect(helpMeanings.filter({ hasText: /^list$/ })).toHaveCount(1);
    await expect(helpMeanings.filter({ hasText: /^apps$/ })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.dc-help[open]")).toHaveCount(0);

    await page.goto("/library");
    const libraryBar = page.locator(".dc-statusbar");
    await expect(libraryBar).toBeVisible();
    await expect(libraryBar.locator("[data-statusbar-mode]")).toBeHidden();
    await expect(libraryBar).not.toContainText("LIBRARY");
    await expect(libraryBar).not.toContainText("RECENT");
    await expect(libraryBar.locator("[data-statusbar-state]")).toBeVisible();
    await expect(page.locator(".dc-library > .dc-panel > .dc-panel__label")).toHaveCount(0);
    await expect(page.locator("h1.dc-section-title")).toBeVisible();

    await page.goto("/library/timeline");
    await expect(page.locator(".dc-statusbar")).not.toContainText("TIMELINE");
    await expect(page.locator(".dc-library > .dc-panel > .dc-panel__label")).toHaveCount(0);

    await page.goto("/library/bluredu-new-teachers");
    const readBar = page.locator(".dc-statusbar");
    await expect(readBar.locator("[data-statusbar-mode]")).toHaveText("READ");
    await expect(readBar.locator("[data-statusbar-state]")).toHaveText("ARTICLE");
  });
});
