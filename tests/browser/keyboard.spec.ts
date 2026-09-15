import { test, expect, type Locator, type Page } from "@playwright/test";

async function focusByTabFromPrevious(page: Page, target: Locator) {
  await target.evaluate((el) => {
    const focusables = Array.from(
      document.querySelectorAll<HTMLElement>("a[href], button, [tabindex]:not([tabindex='-1'])"),
    ).filter((node) => !node.hasAttribute("disabled") && node.getClientRects().length > 0);
    const index = focusables.indexOf(el as HTMLElement);
    if (index <= 0) throw new Error("target has no previous tab stop");
    focusables[index - 1].focus();
  });
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  await expect.poll(() => target.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
}

async function paneFocusChrome(locator: Locator) {
  return locator.evaluate((el) => {
    const localTone = (value: string) => {
      if (value === "transparent") return "transparent";
      const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return value.toLowerCase();
      if (m[4] !== undefined && Number(m[4]) === 0) return "transparent";
      return (
        "#"
        + [m[1], m[2], m[3]]
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
      );
    };
    const panel = el.closest(".dc-panel");
    if (!panel) throw new Error("control is not inside a pane");
    const label = panel.querySelector(".dc-panel__label");
    const root = getComputedStyle(document.documentElement);
    const panelCs = getComputedStyle(panel);
    const labelBefore = label ? getComputedStyle(label, "::before").content : "none";
    return {
      focusVisible: el.matches(":focus-visible"),
      panelHasFocusVisible: panel.matches(":has(:focus-visible)"),
      borderTopColor: localTone(panelCs.borderTopColor),
      backgroundColor: localTone(panelCs.backgroundColor),
      labelBefore,
      primary: root.getPropertyValue("--dc-primary").trim().toLowerCase(),
      faint: root.getPropertyValue("--dc-faint").trim().toLowerCase(),
      panelBg: root.getPropertyValue("--dc-panel-bg").trim().toLowerCase(),
      outlineStyle: getComputedStyle(el).outlineStyle,
      outlineWidth: getComputedStyle(el).outlineWidth,
    };
  });
}

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
    const skip = page.locator("a.dc-skip-link[href='#main']");
    await expect(skip).toBeFocused();
    const focusVisible = await skip.evaluate((el) => el.matches(":focus-visible"));
    expect(focusVisible).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    // Theme main is a landmark, not a focus target (no tabindex="-1"); the
    // runtime contract is that the skip link moves the reader to #main.
    await expect(page.locator("#main")).toBeVisible();
  });

  test("Home tab order skips machine-only h-card identity URL", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Machine-only tab order is asserted on desktop.",
    );
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(page.locator("a.dc-skip-link[href='#main']")).toBeFocused();

    await page.keyboard.press("Tab");
    const second = page.locator(":focus");
    await expect(second).not.toHaveClass(/u-url/);
    await expect(second).toBeVisible();
    const tagName = await second.evaluate((el) => el.tagName);
    expect(tagName).not.toBe("DATA");

    const selfInTabOrder = await page.evaluate(() => {
      const self = document.querySelector(".h-card .u-url");
      if (!self) return "missing";
      const focusables = Array.from(
        document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((node) => !node.hasAttribute("disabled") && node.getClientRects().length > 0);
      return focusables.includes(self as HTMLElement);
    });
    expect(selfInTabOrder).toBe(false);
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

  test("help command rows share one hit target for marker and label", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Help overlay is desktop-representative.");
    await page.goto("/");

    // Capture run requests before <dc-prompt> acts (avoids navigation).
    await page.evaluate(() => {
      const runs = [];
      window["__helpRuns"] = runs;
      document.addEventListener(
        "dc-prompt:run-request",
        (event) => {
          const detail = event["detail"];
          runs.push(String(detail && detail.command != null ? detail.command : ""));
          event.stopImmediatePropagation();
        },
        true,
      );
    });

    await page.keyboard.press("?");
    const help = page.locator("dialog.dc-help[open]");
    await expect(help).toBeVisible();

    const commandColumn = help
      .locator(".dc-help__column")
      .filter({ has: page.locator(".dc-help__column-title", { hasText: /^cli$/i }) });
    const homeRow = commandColumn.locator("dt.dc-help__command").filter({ hasText: /^home$/ });
    const homeRun = homeRow.locator("button.dc-help__run");
    await expect(homeRun).toHaveCount(1);
    await expect(homeRun.locator(".dc-help__term")).toHaveText("home");
    await expect(homeRun).toHaveCSS("cursor", "pointer");
    // Marker is hover/focus confirmation only; the label itself is the control.
    await expect
      .poll(() => homeRun.locator(".dc-help__run-icon").evaluate((el) => getComputedStyle(el).opacity))
      .toBe("0");
    await homeRun.hover();
    await expect
      .poll(() => homeRun.locator(".dc-help__run-icon").evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");
    await expect(homeRun).toHaveAttribute("aria-label", /(?:^|\s)home(?:\s|$)/i);

    // Exactly one tab stop per command row: the unified button.
    await expect(homeRow.locator("button")).toHaveCount(1);
    await expect(homeRow.locator(".dc-help__term")).toHaveCount(1);

    // Click the command label (not only the marker).
    await homeRun.locator(".dc-help__term").click();
    await expect(page.locator("dialog.dc-help[open]")).toHaveCount(0);
    expect(await page.evaluate(() => window["__helpRuns"])).toEqual(["home"]);

    await page.keyboard.press("?");
    await expect(help).toBeVisible();

    const libraryRow = commandColumn
      .locator("dt.dc-help__command")
      .filter({ hasText: /^library --music$/ });
    const libraryRun = libraryRow.locator("button.dc-help__run");
    await expect(libraryRun).toHaveAttribute("aria-label", /library --music/i);

    // Placeholder rows keep trailing-space semantics for target completion.
    const readRow = commandColumn
      .locator("dt.dc-help__command")
      .filter({ hasText: /^read <material>$/ });
    const readRun = readRow.locator("button.dc-help__run");
    await expect(readRun).toHaveAttribute("aria-label", /(?:^|\s)read(?:\s|$)/i);

    await libraryRun.focus();
    await expect(libraryRun).toBeFocused();
    await expect.poll(() => libraryRun.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await expect
      .poll(() => libraryRun.locator(".dc-help__run-icon").evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");
    const focusBox = await libraryRun.boundingBox();
    const termBox = await libraryRun.locator(".dc-help__term").boundingBox();
    const iconBox = await libraryRun.locator(".dc-help__run-icon").boundingBox();
    expect(focusBox).toBeTruthy();
    expect(termBox).toBeTruthy();
    expect(iconBox).toBeTruthy();
    // Visible focus box covers marker + label, not a tiny icon-only control.
    expect(focusBox!.width).toBeGreaterThan(iconBox!.width + termBox!.width * 0.5);
    expect(focusBox!.x).toBeLessThanOrEqual(iconBox!.x + 1);
    expect(focusBox!.x + focusBox!.width).toBeGreaterThanOrEqual(termBox!.x + termBox!.width - 1);

    await page.evaluate(() => {
      window["__helpRuns"].length = 0;
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.dc-help[open]")).toHaveCount(0);
    expect(await page.evaluate(() => window["__helpRuns"])).toEqual(["library --music"]);

    // Re-open via pointer trigger and activate a placeholder row with Space.
    const trigger = page.locator("dc-help .dc-help__trigger").first();
    await trigger.click();
    await expect(help).toBeVisible();
    await page.evaluate(() => {
      window["__helpRuns"].length = 0;
    });
    await readRun.focus();
    await page.keyboard.press("Space");
    await expect(page.locator("dialog.dc-help[open]")).toHaveCount(0);
    expect(await page.evaluate(() => window["__helpRuns"])).toEqual(["read "]);
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

  test("pointer focus keeps the control, not a primary pane frame", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Pane focus grammar is asserted on desktop browsers.",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const feed = page.locator(".dc-home a.dc-badge", { hasText: "rss" }).first();
    await expect(feed).toBeVisible();
    await feed.evaluate((el) => {
      el.addEventListener("click", (event) => event.preventDefault(), {
        capture: true,
        once: true,
      });
    });
    await feed.click();
    await expect(feed).toBeFocused();

    const pointerState = await paneFocusChrome(feed);
    expect(pointerState.focusVisible).toBe(false);
    expect(pointerState.panelHasFocusVisible).toBe(false);
    expect(pointerState.labelBefore === "none" || pointerState.labelBefore === '""').toBe(true);
    expect(pointerState.borderTopColor).toBe("transparent");
    expect(pointerState.borderTopColor).not.toBe(pointerState.primary);
    expect(pointerState.borderTopColor).not.toBe(pointerState.faint);
    expect(pointerState.backgroundColor).toBe(pointerState.panelBg);
  });

  test("keyboard focus marks the control and only a secondary pane border", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Pane focus grammar is asserted on desktop browsers.",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const feed = page.locator(".dc-home a.dc-badge", { hasText: "rss" }).first();
    await focusByTabFromPrevious(page, feed);

    const keyboardState = await paneFocusChrome(feed);
    expect(keyboardState.panelHasFocusVisible).toBe(true);
    expect(keyboardState.labelBefore === "none" || keyboardState.labelBefore === '""').toBe(true);
    expect(keyboardState.borderTopColor).toBe(keyboardState.faint);
    expect(keyboardState.borderTopColor).not.toBe(keyboardState.primary);
    expect(keyboardState.backgroundColor).toBe(keyboardState.panelBg);
    expect(Number.parseFloat(keyboardState.outlineWidth)).toBeGreaterThan(0);
    expect(keyboardState.outlineStyle).not.toBe("none");

    // Move keyboard focus into another pane; the previous pane must clear.
    const portraitOriginal = page.locator(".dc-home .dc-image-toggle__button").first();
    await focusByTabFromPrevious(page, portraitOriginal);

    const cleared = await feed.evaluate((el) => {
      const panel = el.closest(".dc-panel")!;
      return {
        stillHasFocusVisible: panel.matches(":has(:focus-visible)"),
        labelBefore: getComputedStyle(panel.querySelector(".dc-panel__label")!, "::before")
          .content,
      };
    });
    expect(cleared.stillHasFocusVisible).toBe(false);
    expect(cleared.labelBefore === "none" || cleared.labelBefore === '""').toBe(true);
  });

  test("Library internal link follows the same pane focus grammar", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Pane focus grammar is asserted on desktop browsers.",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/library");

    const material = page.locator(".dc-library .dc-material__title a").first();
    await expect(material).toBeVisible();

    await material.evaluate((el) => {
      el.addEventListener("click", (event) => event.preventDefault(), {
        capture: true,
        once: true,
      });
    });
    await material.click();
    await expect(material).toBeFocused();
    const pointerState = await paneFocusChrome(material);
    expect(pointerState.focusVisible).toBe(false);
    expect(pointerState.panelHasFocusVisible).toBe(false);
    expect(pointerState.labelBefore === "none" || pointerState.labelBefore === '""').toBe(true);
    expect(pointerState.borderTopColor).not.toBe(pointerState.primary);
    expect(pointerState.borderTopColor).not.toBe(pointerState.faint);

    await focusByTabFromPrevious(page, material);
    const keyboardState = await paneFocusChrome(material);
    expect(keyboardState.panelHasFocusVisible).toBe(true);
    expect(keyboardState.borderTopColor).toBe(keyboardState.faint);
    expect(keyboardState.borderTopColor).not.toBe(keyboardState.primary);
    expect(keyboardState.backgroundColor).toBe(keyboardState.panelBg);
    expect(keyboardState.labelBefore === "none" || keyboardState.labelBefore === '""').toBe(true);
  });

  test("forced-colors keeps a visible focus indicator on controls", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Forced-colors focus is asserted on desktop browsers.",
    );
    await page.emulateMedia({ forcedColors: "active" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skip = page.locator("a.dc-skip-link[href='#main']");
    await expect(skip).toBeFocused();
    await expect.poll(() => skip.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

    const outline = await skip.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        style: cs.outlineStyle,
        width: cs.outlineWidth,
        color: cs.outlineColor,
      };
    });
    expect(outline.style).not.toBe("none");
    expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
  });

  test("search and prompt keyboard selection stay in the combobox", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Composite selection is asserted on desktop browsers.",
    );
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
          ],
        }),
      });
    });

    await page.goto("/");
    await page.keyboard.press("/");
    const searchInput = page.locator("dc-command-palette .dc-palette__input");
    await searchInput.fill("needle");
    await expect(page.locator(".dc-palette__link")).toHaveCount(2);
    await page.keyboard.press("ArrowDown");
    await expect(searchInput).toBeFocused();
    await expect(page.locator(".dc-palette__link[aria-selected='true']")).toHaveCount(1);
    await expect(page.locator(".dc-palette__link[aria-current]")).toHaveCount(0);
    await expect(page.locator(".dc-nav__link[aria-current='page']")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await page.goto("/");
    const prompt = page.locator("dc-prompt");
    await expect(prompt).toHaveAttribute("ready", "");
    await prompt.locator("[data-prompt-command]").click();
    const promptInput = prompt.locator("input.dc-prompt__input");
    await expect(prompt).toHaveAttribute("open", "");
    await expect(promptInput).toBeVisible();
    await promptInput.fill("read ");
    await expect(prompt.locator(".dc-prompt__suggestion")).toHaveCount(2);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(promptInput).toBeFocused();
    await expect(prompt.locator(".dc-prompt__suggestion[aria-selected='true']")).toHaveCount(1);
    await expect(prompt.locator(".dc-prompt__suggestion[aria-current]")).toHaveCount(0);
    await expect(page.locator(".dc-nav__link[aria-current='page']")).toHaveCount(1);
  });
});
