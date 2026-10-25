import { test as base, expect, type Page } from "@playwright/test";

type ScrollbarMode = "classic" | "overlay";

// Playwright normally hides scrollbars. Exercise actual native gutters instead;
// verify the resulting mode below, since launch flags alone prove nothing.
const test = base.extend<{ scrollbarMode: ScrollbarMode }>({
  scrollbarMode: ["classic", { option: true }],
  page: async ({ playwright, browserName, scrollbarMode, baseURL, javaScriptEnabled, viewport }, use) => {
    const overlay = scrollbarMode === "overlay";
    const browser = await playwright[browserName].launch({
      // Firefox's headless Juggler installs a UA !important rule hiding ALL
      // scrollbars, regardless of prefs. Use a display (Xvfb on Linux CI).
      headless: browserName !== "firefox",
      ...(browserName === "chromium" ? {
        ignoreDefaultArgs: ["--hide-scrollbars"],
        args: [`--${overlay ? "enable" : "disable"}-features=OverlayScrollbar,OverlayScrollbars,FluentOverlayScrollbar`],
      } : browserName === "firefox" ? {
        firefoxUserPrefs: {
          "layout.testing.scrollbars.always-hidden": false,
          "widget.gtk.overlay-scrollbars.enabled": overlay,
          "ui.useOverlayScrollbars": overlay ? 1 : 0,
        },
      } : {}),
    });
    const context = await browser.newContext({ baseURL, javaScriptEnabled, viewport, serviceWorkers: "block" });
    try {
      await use(await context.newPage());
    } finally {
      await browser.close();
    }
  },
});

test.skip(({ isMobile }) => !!isMobile, "Native desktop scrollbar modes; phone widths are exercised explicitly.");

async function geometry(page: Page) {
  // Stylesheets must be applied; optional activity/prefetch/media requests need
  // not finish. The shared frame's horizontal edges do not depend on font swap.
  await page.waitForLoadState("load");
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element || !element.getClientRects().length) return null;
      const { x, right, width } = element.getBoundingClientRect();
      return { x, right, width };
    };
    const root = document.documentElement;
    const main = document.querySelector("main")!;
    return {
      header: box(".dc-header"), main: box("main"),
      status: box(".dc-statusbar"), tools: box(".dc-topbar__tools"),
      hints: box(".dc-statusbar__keys"),
      reserve: innerWidth - root.getBoundingClientRect().width,
      documentScroll: root.scrollHeight > root.clientHeight + 1,
      mainScroll: main.scrollHeight > main.clientHeight + 1,
      overflow: root.scrollWidth - root.clientWidth,
    };
  });
}

type Geometry = Awaited<ReturnType<typeof geometry>>;

function expectSameShell(before: Geometry, after: Geometry) {
  for (const name of ["header", "main", "status"] as const) {
    const a = before[name], b = after[name];
    // Home has no status bar without JS; compact layouts hide it entirely.
    if (!a || !b) continue;
    for (const edge of ["x", "right", "width"] as const) {
      expect(Math.abs(a[edge] - b[edge]), `${name}.${edge}`).toBeLessThanOrEqual(1);
    }
  }
  // Hints and prompt labels legitimately differ between document types.
  for (const name of ["tools", "hints"] as const) {
    if (before[name] && after[name]) {
      expect(Math.abs(before[name]!.right - after[name]!.right), `${name}.right`).toBeLessThanOrEqual(1);
    }
  }
  expect(after.overflow, "no horizontal document scrollbar").toBeLessThanOrEqual(1);
}

async function clickLink(page: Page, href: string) {
  await page.locator(`a[href="${href}"]:visible`).first().click();
  await expect(page).toHaveURL(new RegExp(`${href === "/" ? "/" : href}$`));
}

for (const mode of ["classic", "overlay"] as const) {
  test.describe(mode, () => {
    test.use({ scrollbarMode: mode });
    test.beforeEach(async ({ page }) => {
      // Keep optional external activity snapshots out of navigation evidence.
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
      });
    });

    test("native gutter stays constant across navigation and history", async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await expect(page.locator(".dc-help__trigger")).toBeVisible();
      const home = await geometry(page);
      await clickLink(page, "/library");
      const long = await geometry(page);
      expect(long.documentScroll).toBe(true);
      if (mode === "classic") expect(long.reserve, "classic mode must consume native space").toBeGreaterThan(0);
      else expect(long.reserve, "overlay mode must not reserve space").toBe(0);
      expectSameShell(home, long);
      await clickLink(page, "/library/music");
      const short = await geometry(page);
      expect(short.documentScroll, "fixture must fit without scrolling").toBe(false);
      expectSameShell(home, short);
      await clickLink(page, "/");
      expectSameShell(home, await geometry(page));
      await page.goBack();
      expectSameShell(home, await geometry(page));
      await page.goForward();
      expectSameShell(home, await geometry(page));
      await clickLink(page, "/library");
      await clickLink(page, "/library/regular-visitor");
      expectSameShell(home, await geometry(page));
      await page.goto("/404.html");
      expectSameShell(home, await geometry(page));
      await info.attach("native-gutter", { body: JSON.stringify({ mode, home, long, short }), contentType: "application/json" });
    });

    test("responsive widths preserve the shared frame", async ({ page }) => {
      // Includes both sides of shell/workspace breakpoints and the Home 60rem
      // container threshold (main padding + native gutter affect its boundary).
      for (const width of [320, 390, 739, 740, 741, 768, 859, 860, 861, 1023, 1024, 1038, 1039, 1040, 1100, 1101, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        const home = await geometry(page);
        await clickLink(page, "/library");
        expectSameShell(home, await geometry(page));
      }
      for (const viewport of [{ width: 1440, height: 400 }, { width: 844, height: 390 }, { width: 720, height: 450 }]) {
        await page.setViewportSize(viewport);
        await page.goto("/");
        const home = await geometry(page);
        if (viewport.width === 1440) {
          expect(home.documentScroll).toBe(false);
          expect(home.mainScroll, "short wide Home must remain internally scrollable").toBe(true);
        }
        await clickLink(page, "/library");
        expectSameShell(home, await geometry(page));
      }
    });

    test("dialogs and prompt preserve the background frame; print has no gutter", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const url of ["/", "/library"]) {
        await page.goto(url);
        const original = await geometry(page);
        for (const selector of [".dc-help__trigger", ".dc-palette__trigger"]) {
          const trigger = page.locator(selector);
          await trigger.click();
          await expect(page.locator("dialog[open]")).toBeVisible();
          expectSameShell(original, await geometry(page));
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          expectSameShell(original, await geometry(page));
        }
        await page.keyboard.press(":");
        await expect(page.locator("dc-prompt[open]")).toBeVisible();
        expectSameShell(original, await geometry(page));
        await page.keyboard.press("Escape");
      }
      await page.emulateMedia({ media: "print" });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toBe("auto");
    });

    test.describe("no JS", () => {
      test.use({ javaScriptEnabled: false });
      test("native navigation keeps the same frame", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/");
        const home = await geometry(page);
        await clickLink(page, "/library");
        expectSameShell(home, await geometry(page));
        await clickLink(page, "/");
        expectSameShell(home, await geometry(page));
      });
    });
  });
}
