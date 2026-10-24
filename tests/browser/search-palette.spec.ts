import { test, expect, type Page } from "@playwright/test";

const PHONES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const;

async function mockIndex(page: Page) {
  await page.route("**/search-index.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            title: `${"alpha-".repeat(20)} unique-needle ${"-omega".repeat(20)}`,
            url: "/library/match-end",
            path: `~/library/${"very-long-path-segment/".repeat(6)}match-end`,
            type: "Текст",
            text: `${"alpha-".repeat(20)} unique-needle ${"-omega".repeat(20)}`,
          },
        ],
      }),
    });
  });
}

test.describe("search palette", () => {
  for (const viewport of PHONES) {
    test(`phone ${viewport.width}×${viewport.height} uses 16px input and does not clip a mark`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === "chromium-mobile", "Explicit viewport matrix runs once.");
      await page.setViewportSize(viewport);
      await mockIndex(page);
      await page.goto("/");
      await page.locator(".dc-palette__trigger").click();
      const dialog = page.locator("dc-command-palette dialog[open]");
      await expect(dialog).toBeVisible();

      const metrics = await page.evaluate(() => {
        const input = document.querySelector<HTMLElement>(".dc-palette__input")!;
        const open = document.querySelector<HTMLElement>("dc-command-palette dialog[open]")!;
        const box = open.getBoundingClientRect();
        return {
          fontSize: parseFloat(getComputedStyle(input).fontSize),
          dialogHeight: Math.round(box.height),
          innerHeight: window.innerHeight,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          maximumScale: document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "",
        };
      });
      expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.dialogHeight).toBeLessThan(metrics.innerHeight);
      expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
      expect(metrics.maximumScale).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);

      await page.locator("dc-command-palette .dc-palette__input").fill("unique-needle");
      const mark = page.locator(".dc-palette__title mark, .dc-palette__context mark").first();
      await expect(mark).toHaveText("unique-needle");
      const boxes = await mark.evaluate((el) => {
        const field = el.parentElement!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return {
          left: box.left - field.left,
          right: field.right - box.right,
          width: box.width,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(boxes.left).toBeGreaterThanOrEqual(-1);
      expect(boxes.right).toBeGreaterThanOrEqual(-1);
      expect(boxes.width).toBeGreaterThan(8);
      expect(boxes.overflow).toBeLessThanOrEqual(1);
    });
  }

  test("desktop Search keeps the inherited field size and a compact panel", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Desktop Search once.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.keyboard.press("/");
    const desktop = await page.evaluate(() => {
      const open = document.querySelector<HTMLElement>("dc-command-palette dialog[open]")!;
      const box = open.getBoundingClientRect();
      return {
        fontSize: parseFloat(getComputedStyle(document.querySelector(".dc-palette__input")!).fontSize),
        width: box.width,
        height: box.height,
        innerHeight: window.innerHeight,
      };
    });
    expect(desktop.fontSize).toBeLessThan(16);
    expect(desktop.width).toBeLessThanOrEqual(680);
    expect(desktop.height).toBeLessThan(desktop.innerHeight * 0.9);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });
});

// Inline disposable documents exercise native navigation, not merely href syntax.
const FIXTURE_URL = "/__search-fixture";
const fixtureEntry = (text: string, extra = {}) => ({
  title: "Fixture", url: FIXTURE_URL, path: "~/fixture", type: "Текст",
  topics: [], summary: "", text, ...extra,
});

async function installSearchFixture(page: Page, text: string) {
  await page.route("**/search-index.json", route => route.fulfill({
    json: { entries: [fixtureEntry(text)] },
  }));
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  await page.route(`**${FIXTURE_URL}`, route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Search fixture</title><div style="height:2500px">Start</div><p>${escaped}</p><div style="height:1500px">End</div></html>`,
  }));
}

async function openSearch(page: Page, query: string) {
  await page.goto("/");
  await page.locator(".dc-palette__trigger").click();
  await page.locator(".dc-palette__input").fill(query);
  await expect(page.locator(".dc-palette__link").first()).toBeVisible();
}

async function matchVisible(page: Page, needle: string) {
  return page.evaluate(needle => {
    const root = document.querySelector("article .e-content") || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = (node.textContent || "").indexOf(needle);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + needle.length);
      const box = range.getBoundingClientRect();
      return box.height > 0 && box.top >= 0 && box.bottom <= innerHeight;
    }
    return false;
  }, needle);
}

for (const query of ["материализма", "териализма"]) {
  test(`search native navigation exposes ${query} after Enter`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "Native scroll coordinates use desktop fixture.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearch(page, query);
    const supported = await page.evaluate(() => "fragmentDirective" in document);
    const result = page.locator(".dc-palette__link").first();
    if (supported) await expect(result).toHaveAttribute("href", /#:~:text=/);
    else await expect(result).toHaveAttribute("href", "/library/philosophy-of-freedom");
    await expect(page.locator(".dc-palette__context mark").first()).toHaveText(query);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/philosophy-of-freedom/);
    if (supported) await expect.poll(() => matchVisible(page, query)).toBe(true);
    else await expect(page.locator("article")).toBeVisible();
  });
}

test("search maps lowercase positions to original UTF-16 without changing Unicode matching", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await openSearch(page, "поэт");
  const cases = [
    { text: "İ пример 😀 хвост", q: "пример", span: [2, 8], marks: ["пример"] },
    { text: "İ 😀 хвост", q: "😀", span: [2, 4], marks: ["😀"] },
    { text: "İ пример", q: "İ", span: [0, 1], marks: ["İ"] },
    { text: "İ пример", q: "\u0307", span: [0, 1], marks: ["İ"] },
    { text: "😀 пример 🧑‍💻 хвост", q: "🧑‍💻", span: [10, 15], marks: ["🧑‍💻"] },
    { text: "𐐀 пример", q: "𐐨", span: [0, 2], marks: ["𐐀"] },
    { text: "ẞ пример", q: "ß", span: [0, 1], marks: ["ẞ"] },
    { text: "ΟΣ пример", q: "ος", span: [0, 2], marks: ["ΟΣ"] },
    { text: "ΟΣ пример", q: "οσ", span: null, marks: [] },
    { text: "cafe\u0301 пример", q: "café", span: null, marks: [] },
    { text: "café пример", q: "cafe\u0301", span: null, marks: [] },
    { text: "cafe\u0301 пример", q: "cafe\u0301", span: [0, 5], marks: ["cafe\u0301"] },
    { text: "İ same red. İ same blue.", q: "same", span: [2, 6], marks: ["same", "same"] },
    { text: "😀" + "а".repeat(31) + "needle first. 😀" + "а".repeat(31) + "needle second.", q: "needle", span: [33, 39], marks: ["needle", "needle"] },
    { text: "needle" + "а".repeat(31) + "😀", q: "needle", span: [0, 6], marks: ["needle"] },
  ];
  for (const item of cases) {
    const actual = await page.evaluate(({ item, entry }) => {
      const palette = document.querySelector("dc-command-palette") as any;
      palette.entries = [entry]; palette.search(item.q);
      const r = palette.results[0];
      return { span: r ? [r.match.start, r.match.end] : null,
        exact: r?.match.exact, marks: [...palette.querySelectorAll(".dc-palette__context mark")].map((m: any) => m.textContent),
        wellFormed: !r || [r.context, r.match.exact, r.match.prefix, r.match.suffix].every(v => v.isWellFormed()) };
    }, { item, entry: fixtureEntry(item.text) });
    expect(actual.span, item.text + " / " + item.q).toEqual(item.span);
    expect(actual.marks).toEqual(item.marks);
    expect(actual.wellFormed).toBe(true);
    if (item.span) expect(actual.exact).toBe(item.text.slice(...item.span as [number, number]));
  }
  expect(errors).toEqual([]);
});

test("search Unicode exact fragment actually navigates", async ({ page }) => {
  await installSearchFixture(page, "İ пример 😀 хвост");
  await openSearch(page, "пример");
  const supported = await page.evaluate(() => "fragmentDirective" in document);
  await expect(page.locator(".dc-palette__context mark")).toHaveText("пример");
  const href = await page.locator(".dc-palette__link").getAttribute("href");
  expect(href).toBe(supported ? FIXTURE_URL + "#:~:text=" + encodeURIComponent("пример") : FIXTURE_URL);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/__search-fixture/);
  if (supported) await expect.poll(() => matchVisible(page, "пример")).toBe(true);
  else await expect(page.locator("p")).toHaveText("İ пример 😀 хвост");
});

test("search keeps AND, literal matching, six fields and stable ranking", async ({ page }) => {
  await openSearch(page, "поэт");
  const results = await page.evaluate(() => {
    const palette = document.querySelector("dc-command-palette") as any;
    const names = ["title", "topics", "type", "path", "summary", "text"];
    palette.entries = names.map((name, index) => ({ title: "Fixture", url: "/" + index, topics: [],
      type: "", path: "", summary: "", text: "", [name]: name === "topics" ? ["Needle"] : "Needle" }));
    palette.entries.push({ title: "Needle", url: "/tie", text: "a+b [x] café е" });
    return ["needle", "NEEDLE", "needle a+b", "a+b", "a.b", "[x]", "cafe\u0301", "ё", " "].map(q => {
      palette.search(q); return palette.results.map((r: any) => r.url.split("#")[0]);
    });
  });
  expect(results).toEqual([["/0", "/tie", "/1", "/2", "/3", "/4", "/5"],
    ["/0", "/tie", "/1", "/2", "/3", "/4", "/5"], ["/tie"], ["/tie"], [], ["/tie"], [], [], []]);
});

test("search navigation distinguishes context and falls back on ambiguity or unsupported capability", async ({ page }) => {
  const supported = await page.evaluate(() => "fragmentDirective" in document);
  await installSearchFixture(page, "a+b after.");
  await openSearch(page, "a+b");
  const cases = [
    { text: "first same red. second same blue.", q: "same", fragment: true },
    { text: "first same red. first same red.", q: "same", fragment: false },
    { text: "first café red. first cafe\u0301 red.", q: "café", fragment: false },
    { text: "a+b after.", q: "a+b", fragment: true },
  ];
  for (const item of cases) {
    const href = await page.evaluate(({ item, entry }) => {
      const palette = document.querySelector("dc-command-palette") as any;
      palette.entries = [entry]; palette.search(item.q); return palette.results[0].url;
    }, { item, entry: fixtureEntry(item.text) });
    expect(href.includes("#:~:text="), item.text).toBe(supported && item.fragment);
  }
  await page.evaluate(() => { delete (Document.prototype as any).fragmentDirective; });
  expect(await page.evaluate(() => "fragmentDirective" in document)).toBe(false);
  await page.locator(".dc-palette__input").fill("a+b");
  await expect(page.locator(".dc-palette__link")).toHaveAttribute("href", FIXTURE_URL);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(FIXTURE_URL + "$"));
  await expect(page.locator("p")).toHaveText("a+b after.");
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

for (const item of [
  { text: "first same red. second same blue.", query: "same", target: "same", fragment: true },
  { text: "a+b after.", query: "a+b", target: "a+b", fragment: true },
  // Chromium primary collation equates these spellings. Do not land on oe.
  { text: "red oe here red œ here", query: "œ", target: "œ", fragment: false },
  { text: "red ae here red æ here", query: "æ", target: "æ", fragment: false },
  { text: "red o here red ø here", query: "ø", target: "ø", fragment: false },
  { text: "red l here red ł here", query: "ł", target: "ł", fragment: false },
]) {
  test(`search native context or collation fallback: ${item.query} / ${item.text}`, async ({ page }) => {
    await installSearchFixture(page, item.text);
    await openSearch(page, item.query);
    const supported = await page.evaluate(() => "fragmentDirective" in document);
    const href = await page.locator(".dc-palette__link").getAttribute("href");
    expect(href!.includes("#:~:text=")).toBe(supported && item.fragment);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/__search-fixture/);
    if (supported && item.fragment) await expect.poll(() => matchVisible(page, item.target)).toBe(true);
    else {
      await expect(page.locator("p")).toHaveText(item.text);
      expect(await page.evaluate(() => scrollY)).toBe(0);
    }
  });
}

test("search rejects ignorable targets and incomplete ambiguity scans", async ({ page }) => {
  await openSearch(page, "поэт");
  for (const item of [
    { text: "start \u00ad end", q: "\u00ad" },
    { text: ".+".repeat(80) + " needle", q: "needle" },
    { text: "red ab here red a\u200bb here", q: "a\u200bb" },
    { text: "\u00ad same red. \u00ad same blue.", q: "same" },
  ]) {
    const href = await page.evaluate(({ item, entry }) => {
      const palette = document.querySelector("dc-command-palette") as any;
      palette.entries = [entry]; palette.search(item.q); return palette.results[0].url;
    }, { item, entry: fixtureEntry(item.text) });
    expect(href).toBe(FIXTURE_URL);
  }
  await page.evaluate(() => { (Intl as any).Segmenter = undefined; });
  await page.locator(".dc-palette__input").fill("same");
  await expect(page.locator(".dc-palette__link")).toHaveAttribute("href", FIXTURE_URL);
});

test("search single-token contexts can navigate across block boundaries", async ({ page }) => {
  await installSearchFixture(page, "first same red. second same blue.");
  await page.route(`**${FIXTURE_URL}`, route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: '<!doctype html><html lang="ru"><meta charset="utf-8"><div style="height:2500px">Start</div><p>first</p><p>same red.</p><p>second</p><p>same blue.</p><div style="height:1500px">End</div></html>',
  }));
  await openSearch(page, "same");
  const supported = await page.evaluate(() => "fragmentDirective" in document);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/__search-fixture/);
  if (supported) await expect.poll(() => matchVisible(page, "same")).toBe(true);
  else await expect(page.locator("p").first()).toHaveText("first");
});
