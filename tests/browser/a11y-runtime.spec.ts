import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

test.describe("a11y-runtime", () => {
  test("home has no serious axe violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("track page has no serious axe violations", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Track is desktop-representative.");
    await page.goto("/library/regular-visitor");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("article page has no serious axe violations", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Article is desktop-representative.");
    await page.goto("/library/bluredu-new-teachers");
    await expect(page.locator("h1")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("controlled fixture fails axe (missing alt)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Fixture once is enough.");
    const fixture = pathToFileURL(
      path.resolve("tests/fixtures/browser-violations/missing-alt.html"),
    ).href;
    await page.goto(fixture);
    const results = await new AxeBuilder({ page }).analyze();
    const imageAlt = results.violations.filter((v) => v.id === "image-alt");
    expect(imageAlt.length).toBeGreaterThan(0);
  });
});
