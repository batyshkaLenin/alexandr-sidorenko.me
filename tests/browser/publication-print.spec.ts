import { test, expect } from "@playwright/test";

const ARTICLE = "/library/bluredu-new-teachers";
const PAPER = "/library/philosophy-of-freedom";
const SONG = "/library/cool-kids-of-death-hej-chlopcze";

function rgb(color: string): string {
  return color.replace(/\s+/g, " ");
}

test.describe("publication print", () => {
  test("article print drops chrome, uses original photo, black type", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Print contract runs once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE);

    const figure = page.locator(".dc-figure--dithered").first();
    const originalHref = await page.locator("dc-image-toggle").first().getAttribute("data-original");
    expect(originalHref).toBeTruthy();
    await expect(figure.locator("source[media='print']")).toHaveAttribute("srcset", originalHref!);
    await expect.poll(async () => figure.locator("img.dc-image").evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/dither-/);

    await page.emulateMedia({ media: "print" });
    await expect.poll(async () => figure.locator("img.dc-image").evaluate((el: HTMLImageElement) => el.currentSrc)).toBe(
      new URL(originalHref!, page.url()).href,
    );

    await expect(page.locator(".dc-header")).toBeHidden();
    await expect(page.locator(".dc-toc")).toBeHidden();
    await expect(page.locator(".dc-responses")).toBeHidden();
    await expect(page.locator(".dc-adjacent")).toBeHidden();
    await expect(figure.locator("figcaption")).toBeHidden();
    for (const control of await page.locator(".dc-image-toggle__button, .dc-image-toggle__overlay").all()) {
      await expect(control).toBeHidden();
    }

    const titleColor = await page.locator(".dc-title").evaluate((el) => getComputedStyle(el).color);
    expect(rgb(titleColor)).toBe("rgb(0, 0, 0)");
    expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe("block");
    expect(await page.locator(".dc-main").evaluate((el) => getComputedStyle(el).paddingTop)).toBe("0px");
    expect(await page.locator(".dc-main").evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");

    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
    const pageCount = [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page(?!s)/g)].length;
    expect(pageCount).toBeGreaterThan(1);
  });

  test("paper print hides tags; interlinear is black then gray", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Print contract runs once.");
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(PAPER);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".tags")).toBeHidden();

    await page.emulateMedia({ media: "screen" });
    await page.goto(SONG);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".dc-relations")).toHaveCount(1);
    await expect(page.locator(".dc-relations")).toBeHidden();
    await expect(page.locator(".tags")).toBeHidden();

    const source = await page.locator(".as-parallel-source").first().evaluate((el) => getComputedStyle(el).color);
    const translation = await page.locator(".as-parallel-translation").first().evaluate((el) => getComputedStyle(el).color);
    expect(rgb(source)).toBe("rgb(0, 0, 0)");
    expect(rgb(translation)).toBe("rgb(85, 85, 85)");
  });

  test("screen home still has one visible name heading", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Home heading once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1.dc-hero-name")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

test.describe("publication print without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("article original photo and song translation colours hold without JS", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "No-JS print once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ media: "print" });

    await page.goto(ARTICLE);
    const figure = page.locator(".dc-figure--dithered").first();
    const originalHref = await page.locator("dc-image-toggle").first().getAttribute("data-original");
    expect(originalHref).toBeTruthy();
    await expect(figure.locator("source[media='print']")).toHaveAttribute("srcset", originalHref!);
    await expect.poll(async () => figure.locator("img.dc-image").evaluate((el: HTMLImageElement) => el.currentSrc)).toBe(
      new URL(originalHref!, page.url()).href,
    );
    await expect(figure.locator("figcaption")).toBeHidden();

    await page.goto(SONG);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".dc-relations")).toBeHidden();
    const source = await page.locator(".as-parallel-source").first().evaluate((el) => getComputedStyle(el).color);
    const translation = await page.locator(".as-parallel-translation").first().evaluate((el) => getComputedStyle(el).color);
    expect(rgb(source)).toBe("rgb(0, 0, 0)");
    expect(rgb(translation)).toBe("rgb(85, 85, 85)");
  });
});
