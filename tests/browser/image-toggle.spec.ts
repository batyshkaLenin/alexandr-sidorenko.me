import { test, expect, type Page } from "@playwright/test";

const HOME = "/";
const SINGLE = "/library/skver";
const ARTICLE = "/library/bluredu-new-teachers";

function trackImages(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image") urls.push(new URL(request.url()).pathname);
  });
  return urls;
}

async function settledImage(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const img = document.querySelector<HTMLImageElement>(sel);
    return !!img && img.complete && img.naturalWidth > 0;
  }, selector);
}

test.describe("image variant toggle", () => {
  test("switches the original over an untouched dithered image and back", async ({ page }) => {
    const requests = trackImages(page);
    await page.goto(HOME);
    const toggle = page.locator("dc-image-toggle").first();
    const base = toggle.locator("img.dc-portrait");
    const button = toggle.getByRole("button", { name: "show original" });
    await expect(button).toBeVisible();
    await settledImage(page, "dc-image-toggle img.dc-portrait");

    const original = await toggle.getAttribute("data-original");
    const beforeClick = requests.length;
    const before = await base.evaluate((img: HTMLImageElement) => ({
      src: img.getAttribute("src"),
      srcset: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes"),
      box: img.getBoundingClientRect().toJSON(),
    }));

    await button.click();
    await expect(toggle.getByRole("button", { name: "show dithered" })).toBeVisible();
    await expect(toggle).toHaveAttribute("showing", "original");
    const overlay = toggle.locator(".dc-image-toggle__overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("alt", "");
    await expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(await overlay.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await overlay.evaluate((img) => getComputedStyle(img).pointerEvents)).toBe("none");

    const after = await base.evaluate((img: HTMLImageElement) => ({
      src: img.getAttribute("src"),
      srcset: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes"),
      box: img.getBoundingClientRect().toJSON(),
    }));
    expect(after.src).toBe(before.src);
    expect(after.srcset).toBe(before.srcset);
    expect(after.sizes).toBe(before.sizes);
    expect(Math.abs(after.box.width - before.box.width)).toBeLessThan(1);
    expect(Math.abs(after.box.height - before.box.height)).toBeLessThan(1);
    const overlayBox = await overlay.boundingBox();
    expect(Math.abs(overlayBox!.x - before.box.x)).toBeLessThan(1);
    expect(Math.abs(overlayBox!.y - before.box.y)).toBeLessThan(1);
    expect(Math.abs(overlayBox!.width - before.box.width)).toBeLessThan(1);

    // One meaningful image: the overlay stays out of the accessibility tree.
    await expect(toggle.getByRole("img")).toHaveCount(1);
    await expect(page.locator(`a[href="${original}"]`)).toHaveCount(0);

    // Back and again: no network, and never a dithered candidate refetched.
    const afterFirst = requests.length;
    await toggle.getByRole("button", { name: "show dithered" }).click();
    await expect(toggle).toHaveAttribute("showing", "processed");
    await expect(overlay).toBeHidden();
    await toggle.getByRole("button", { name: "show original" }).click();
    await expect(toggle).toHaveAttribute("showing", "original");
    await page.waitForTimeout(300);
    expect(requests.slice(afterFirst)).toEqual([]);
    expect(requests.filter((path) => path === original)).toHaveLength(1);
    expect(requests.slice(beforeClick).filter((path) => path.includes(".dither-"))).toEqual([]);
  });

  test("keyboard activates the native button", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Keyboard runs on desktop projects.");
    await page.goto(SINGLE);
    const toggle = page.locator("dc-image-toggle").first();
    const button = toggle.locator(".dc-image-toggle__button");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("showing", "original");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("showing", "processed");
    await expect(button).toHaveText("show original");
  });

  test("warms only originals near the viewport after load", async ({ page }) => {
    const requests = trackImages(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const figures = await page.evaluate(() =>
      Array.from(document.querySelectorAll("dc-image-toggle")).map((el) => ({
        original: el.getAttribute("data-original"),
        top: el.querySelector("img")!.getBoundingClientRect().top + window.scrollY,
      })),
    );
    const viewport = await page.evaluate(() => window.innerHeight);
    for (const figure of figures) {
      const requested = requests.includes(figure.original!);
      if (figure.top > viewport * 2 + 50) expect(requested, figure.original!).toBe(false);
    }
    const far = figures.filter((figure) => figure.top > viewport * 2 + 50);
    test.skip(far.length === 0, "The article has no figure far from the first viewport at this size.");

    const target = far[0];
    await page.evaluate((top) => window.scrollTo(0, top - 200), target.top);
    await expect.poll(() => requests.includes(target.original!)).toBe(true);
  });

  test("saveData keeps originals for an explicit intent", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
    });
    const requests = trackImages(page);
    await page.goto(HOME, { waitUntil: "load" });
    const toggle = page.locator("dc-image-toggle").first();
    const original = await toggle.getAttribute("data-original");
    await page.waitForTimeout(1500);
    expect(requests).not.toContain(original);

    await toggle.locator(".dc-image-toggle__button").click();
    await expect(toggle).toHaveAttribute("showing", "original");
    expect(requests).toContain(original);
  });

  test("dithered stays responsive after the original was shown", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Resize runs on desktop projects.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SINGLE);
    const toggle = page.locator("dc-image-toggle").first();
    const base = toggle.locator("img.dc-image");
    await base.scrollIntoViewIfNeeded();
    await settledImage(page, "dc-image-toggle img.dc-image");
    const narrow = await base.evaluate((img: HTMLImageElement) => img.currentSrc);

    await toggle.locator(".dc-image-toggle__button").click();
    await expect(toggle).toHaveAttribute("showing", "original");
    await page.setViewportSize({ width: 1440, height: 900 });
    await toggle.locator(".dc-image-toggle__button").click();
    await expect(toggle).toHaveAttribute("showing", "processed");

    // The browser may re-select a candidate; it can only grow, and must grow
    // when the narrow one was not already the widest (e.g. at DPR 1).
    const rung = (url: string) => Number(/\.dither-(\d+)\./.exec(url)?.[1] ?? 0);
    const widest = await base.evaluate((img: HTMLImageElement) =>
      Math.max(...img.srcset.split(",").map((part) => Number(/(\d+)w\s*$/.exec(part.trim())?.[1] ?? 0))),
    );
    if (rung(narrow) < widest) {
      await expect.poll(async () => rung(await base.evaluate((img: HTMLImageElement) => img.currentSrc))).toBeGreaterThan(rung(narrow));
    } else {
      expect(rung(await base.evaluate((img: HTMLImageElement) => img.currentSrc))).toBe(widest);
    }
    const box = await base.boundingBox();
    const overlay = toggle.locator(".dc-image-toggle__overlay");
    await expect(overlay).toBeHidden();
    await toggle.locator(".dc-image-toggle__button").click();
    const overlayBox = await overlay.boundingBox();
    expect(Math.abs(overlayBox!.width - box!.width)).toBeLessThan(1);
  });

  test("a component that fails to load leaves the dithered image alone", async ({ page }) => {
    await page.route(/\/js\/dc-image-toggle\./, (route) => route.abort());
    await page.goto(SINGLE);
    const toggle = page.locator("dc-image-toggle").first();
    await expect(toggle.locator("img.dc-image")).toBeVisible();
    await expect(toggle.locator("button")).toHaveCount(0);
    await expect(toggle.locator("[data-image-toggle-slot]")).toBeHidden();
    await expect(toggle.locator("details")).toHaveCount(0);
  });
});

test.describe("image variant toggle without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the original opens from a native disclosure", async ({ page }) => {
    for (const path of [HOME, SINGLE]) {
      await page.goto(path);
      const toggle = page.locator("dc-image-toggle").first();
      const original = await toggle.getAttribute("data-original");
      await expect(toggle.locator("button")).toHaveCount(0);
      await expect(toggle.locator("[data-image-toggle-slot]")).toBeHidden();
      await expect(toggle.locator("img").first()).toBeVisible();

      const disclosure = toggle.locator("details.dc-image-original");
      await expect(disclosure).toHaveCount(1);
      const summary = disclosure.locator("summary");
      await expect(summary).toHaveText("show original");
      const image = disclosure.locator("img");
      await expect(image).toBeHidden();
      await expect(image).toHaveAttribute("alt", "");
      await expect(image).toHaveAttribute("src", original!);
      await summary.click();
      await expect(image).toBeVisible();
      await expect(page.locator(`a[href="${original}"]`)).toHaveCount(0);
    }
  });
});
