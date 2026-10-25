import { test, expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

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
              text: Array(3).fill(`${"а".repeat(40)}same${"б".repeat(40)}`).join(" разрыв "),
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
    const fragments = await page.evaluate(() => "fragmentDirective" in document);

    await input.fill("unique-needle");
    await expect(page.locator(".dc-palette__link", { hasText: "Только в тексте" }))
      .toHaveAttribute("href", fragments ? "/library/body-result#:~:text=unique%2Dneedle" : "/library/body-result");

    await input.fill("needle");
    await expect(page.locator(".dc-palette__link", { hasText: "Needle в заголовке" }))
      .toHaveAttribute("href", "/library/title-result");

    await input.fill("same");
    await expect(page.locator(".dc-palette__link", { hasText: "Неоднозначное" }))
      .toHaveAttribute("href", "/library/ambiguous-result");
    await expect(page.locator(".dc-palette__link", { hasText: "Контекст различает" }))
      // The nearest single-token contexts are identical. Longer flattened
      // contexts may cross HTML blocks, so keep the conservative fallback.
      .toHaveAttribute("href", "/library/context-result");
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
    await expect(page.locator(".dc-nav__hint")).toHaveCount(0);
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
    await expect(helpMeanings.filter({ hasText: /^apps$/ })).toHaveCount(0);
    await expect(helpMeanings.filter({ hasText: /^close overlay$/ })).toHaveCount(1);
    await expect(helpMeanings.filter({ hasText: /^back$/ })).toHaveCount(0);
    await expect(helpKeys.filter({ hasText: /\[[123o]\]/ })).toHaveCount(0);
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

for(const viewport of [{width:1440,height:900},{width:375,height:812}]) test(`primary media duration agrees across views ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  const media=[['regular-visitor','02:18'],['itchatter-hakatony','39:21'],['itchatter-parni-hakatonschiki','29:13']];
  for(const url of ['/library','/library/all','/library/table','/library/timeline','/library/music','/library/types']){
    await page.goto(url);
    for(const [slug,duration] of media){
      if(url.endsWith('music') && slug!=='regular-visitor') continue;
      const link=page.locator(`main a[href='/library/${slug}']:visible`).first();
      const row=link.locator('xpath=ancestor::*[self::li or self::tr][1]');
      await expect(row.locator('[data-duration-kind="media"]')).toHaveText(duration);
      await expect(row).not.toContainText('1 minute');
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  for(const [slug,duration] of media){
    await page.goto('/library/'+slug);
    if(slug==='regular-visitor') await expect(page.locator('.dc-track__file')).toContainText(duration);
    else await expect(page.locator('.dc-publication__meta [data-duration-kind="media"]')).toHaveText(duration);
  }
});

// The repository's Python static server ignores Range, as does the current
// deployed MP3 endpoint. Real bytes + a Range-capable transport fixture exercise
// the native seek capability; a separate case verifies truthful no-seek UI.
async function rangedAudio(page: Page) {
  const body=readFileSync('static/assets/library/regular-visitor/Постоянщик.mp3');
  await page.route('**/assets/library/regular-visitor/*.mp3',async route=>{
    const range=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range||'');
    const start=range?Number(range[1]):0;const end=range&&range[2]?Math.min(Number(range[2]),body.length-1):body.length-1;
    if(start>=body.length){await route.fulfill({status:416,headers:{'Content-Range':`bytes */${body.length}`}});return;}
    await route.fulfill({status:range?206:200,body:body.subarray(start,end+1),headers:{'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(range?{'Content-Range':`bytes ${start}-${end}/${body.length}`}:{})}});
  });
}

test.describe('terminal audio player',()=>{
  test.beforeEach(async({page})=>{await rangedAudio(page);});
  test('native media clock, play/pause, keyboard seek, volume, end and reconnect',async({page})=>{
    await page.goto('/library/regular-visitor');
    const host=page.locator('dc-audio'); const audio=host.locator('audio');
    await expect(host).toHaveAttribute('enhanced','');
    await expect(audio).toHaveAttribute('preload','auto');
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.duration)).toBeCloseTo(138,0);
    await expect(host.locator('.dc-audio-player__time')).toHaveText('00:00 / 02:18');
    await expect(host.getByRole('status')).toHaveText('Ready');
    expect(await audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
    expect(await audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBe(0);
    const seek=host.getByRole('slider',{name:'Seek audio'});
    await expect(seek).toBeEnabled();
    await host.getByRole('button',{name:'Play audio',exact:true}).click();
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.duration)).toBeCloseTo(138,0);
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.1);
    await host.getByRole('button',{name:'Pause audio',exact:true}).click();
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
    await seek.focus(); await seek.press('Home'); await seek.press('ArrowRight');
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeCloseTo(0.1,1);
    const volume=host.getByRole('slider',{name:'Audio volume'});
    await volume.focus(); await volume.press('Home');
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.volume)).toBe(0);
    await volume.press('End');
    await host.getByRole('button',{name:'Mute audio',exact:true}).click();
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.muted)).toBe(true);
    await host.getByRole('button',{name:'Unmute audio',exact:true}).click();
    await host.getByRole('button',{name:'Play audio',exact:true}).focus();
    await page.keyboard.press('Space');
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
    await seek.focus(); await seek.press('End');
    await expect(host.getByRole('status')).toHaveText('Ended');
    await host.getByRole('button',{name:'Replay audio',exact:true}).click();
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeLessThan(2);
    await host.getByRole('button',{name:'Pause audio',exact:true}).click();
    const restored=await host.evaluate(el=>{const parent=el.parentElement!;el.remove();const a=el.querySelector('audio')!;const baseline=a.controls&&!a.hidden;parent.append(el);return baseline;});
    expect(restored).toBe(true);
    await expect(host.locator('.dc-audio-player')).toHaveCount(1);
    await expect(host.getByRole('button')).toHaveCount(2);
    // Reader pages intentionally have no command input. An unrelated text
    // field must retain native Space while an audio component is present.
    await page.evaluate(()=>{const input=document.createElement('input');input.setAttribute('aria-label','Text entry fixture');document.body.append(input);input.focus();});
    const input=page.getByRole('textbox',{name:'Text entry fixture'});await input.fill('text');await page.keyboard.type(' ');
    await expect(input).toHaveValue('text ');
    expect(await audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
  });

  test('loading, unavailable source and retry expose real media states',async({page})=>{
    let release:()=>void=()=>{};
    const waiting=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/*.mp3',async route=>{await waiting;await route.abort('failed');});
    await page.goto('/library/regular-visitor',{waitUntil:'domcontentloaded'});
    const host=page.locator('dc-audio');
    await expect(host).toHaveAttribute('enhanced','');
    await host.getByRole('button',{name:'Play audio',exact:true}).click();
    await expect(host.getByRole('status')).toHaveText('Loading…');
    await expect(host.locator('.dc-audio-player__time')).toHaveText('00:00 / --:--');
    release();
    await expect(host.getByRole('status')).toHaveText('Audio unavailable');
    await expect(host.getByRole('link',{name:'Download audio'})).toHaveAttribute('href',/\.mp3$/);
    await expect(host.getByRole('slider',{name:'Seek audio'})).toBeDisabled();
    await page.unroute('**/*.mp3');
    await host.getByRole('button',{name:'Retry audio',exact:true}).click();
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.1);
    await expect(host.getByRole('status')).toContainText('Playing');
  });

  test('seek respects partial available ranges and gaps',async({page})=>{
    await page.goto('/library/regular-visitor');const host=page.locator('dc-audio');
    await host.getByRole('button',{name:'Play audio',exact:true}).click();
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.readyState)).toBeGreaterThan(1);
    await host.getByRole('button',{name:'Pause audio',exact:true}).click();
    await host.locator('audio').evaluate((a:HTMLAudioElement)=>{
      Object.defineProperty(a,'seekable',{configurable:true,get:()=>({length:1,start:()=>10,end:()=>20})});
      a.dispatchEvent(new Event('progress'));
    });
    const seek=host.getByRole('slider',{name:'Seek audio'});
    await expect(seek).toHaveAttribute('min','10');await expect(seek).toHaveAttribute('max','20');
    await host.locator('audio').evaluate((a:HTMLAudioElement)=>{
      Object.defineProperty(a,'seekable',{configurable:true,get:()=>({length:2,start:(i:number)=>i?20:0,end:(i:number)=>i?30:10})});
      a.dispatchEvent(new Event('progress'));
    });
    await seek.evaluate((el:HTMLInputElement)=>{el.value='15';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeCloseTo(10,1);
  });

  test('module failure preserves visible native controls',async({page})=>{
    await page.route('**/dc-audio.min.*.js',route=>route.abort());
    await page.goto('/library/regular-visitor');
    const audio=page.locator('dc-audio audio');
    await expect(audio).toBeVisible();
    expect(await audio.evaluate((a:HTMLAudioElement)=>a.controls)).toBe(true);
    await expect(page.locator('.dc-audio-player')).toHaveCount(0);
  });
});

test.describe('touch audio',()=>{
  test.beforeEach(async({page})=>{await rangedAudio(page);});
  test.use({hasTouch:true,viewport:{width:375,height:812}});
  test('touch targets and playback fit the publication column',async({page})=>{
    await page.goto('/library/regular-visitor');const host=page.locator('dc-audio');
    for(const control of await host.locator('button,input').all())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await host.getByRole('button',{name:'Play audio',exact:true}).tap();
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.1);
    await host.getByRole('slider',{name:'Seek audio'}).tap();
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(20);
    await host.getByRole('button',{name:'Pause audio',exact:true}).tap();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
});


test('current transport plays, exposes native seekability and replays',async({page})=>{
  await page.goto('/library/regular-visitor');const host=page.locator('dc-audio');
  await host.getByRole('button',{name:'Play audio',exact:true}).click();
  await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.1);
  const canSeek=await host.locator('audio').evaluate((a:HTMLAudioElement)=>
    Array.from({length:a.seekable.length},(_,i)=>a.seekable.end(i)>a.seekable.start(i)).some(Boolean));
  if(canSeek) await expect(host.getByRole('slider',{name:'Seek audio'})).toBeEnabled();
  else {
    await expect(host.getByRole('slider',{name:'Seek audio'})).toBeDisabled();
    await expect(host.getByRole('status')).toContainText('seek unavailable');
  }
  await host.locator('audio').evaluate((a:HTMLAudioElement)=>{a.playbackRate=16;});
  await expect(host.getByRole('status')).toContainText('Ended',{timeout:15000});
  await host.getByRole('button',{name:'Replay audio',exact:true}).click();
  await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeLessThan(5);
});

// The accepted transport boundary is native HTML5 parity (DR-2026-043).
// Both pages use the same real MP3 served as HTTP200, without a Range fixture.
test('custom seeking preserves native HTML5 source capability', async ({ context }) => {
  const native = await context.newPage();
  const enhanced = await context.newPage();
  await native.route('**/dc-audio.min.*.js', route => route.abort());
  await Promise.all([native.goto('/library/regular-visitor'), enhanced.goto('/library/regular-visitor')]);
  const nativeAudio = native.locator('audio');
  const customAudio = enhanced.locator('audio');
  await expect(nativeAudio).toBeVisible();
  await expect(nativeAudio).toHaveJSProperty('controls', true);
  await expect(enhanced.locator('dc-audio')).toHaveAttribute('enhanced', '');
  await nativeAudio.focus();
  await native.keyboard.press('Space');
  await enhanced.getByRole('button', { name: 'Play audio', exact: true }).click();
  for (const audio of [nativeAudio, customAudio]) {
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(.1);
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) =>
      a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0)).toBeGreaterThan(60);
    await audio.evaluate((a: HTMLAudioElement) => a.pause());
  }
  const nativeRanges = await nativeAudio.evaluate((a: HTMLAudioElement) =>
    Array.from({ length: a.seekable.length }, (_, i) => [a.seekable.start(i), a.seekable.end(i)]));
  const customRanges = await customAudio.evaluate((a: HTMLAudioElement) =>
    Array.from({ length: a.seekable.length }, (_, i) => [a.seekable.start(i), a.seekable.end(i)]));
  const canSeek = nativeRanges.some(([start, end]) => end > start);
  expect(customRanges.some(([start, end]) => end > start)).toBe(canSeek);
  const slider = enhanced.getByRole('slider', { name: 'Seek audio' });
  if (canSeek) {
    await expect(slider).toBeEnabled();
    await nativeAudio.evaluate((a: HTMLAudioElement) => new Promise<void>(resolve => {
      a.addEventListener('seeked', () => resolve(), { once: true });
      a.currentTime = 59;
    }));
    await slider.evaluate((el: HTMLInputElement) => new Promise<void>(resolve => {
      const audio = el.closest('dc-audio')!.querySelector('audio')!;
      audio.addEventListener('seeked', () => resolve(), { once: true });
      el.value = '59';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    const nativeTime = await nativeAudio.evaluate((a: HTMLAudioElement) => a.currentTime);
    const customTime = await customAudio.evaluate((a: HTMLAudioElement) => a.currentTime);
    expect(nativeTime).toBeGreaterThan(1);
    expect(Math.abs(nativeTime - customTime)).toBeLessThan(.1);
  } else {
    await expect(slider).toBeDisabled();
    await expect(enhanced.locator('dc-audio').getByRole('status')).toContainText('seek unavailable');
    const beforeKey = await nativeAudio.evaluate((a: HTMLAudioElement) => a.currentTime);
    await nativeAudio.focus();
    await native.keyboard.press('ArrowRight');
    await expect.poll(async () => Math.abs(await nativeAudio.evaluate((a: HTMLAudioElement) => a.currentTime) - beforeKey)).toBeLessThan(.1);
  }
  await Promise.all([native.close(), enhanced.close()]);
});
