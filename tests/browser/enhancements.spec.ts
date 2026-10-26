import { test, expect, type Page, type Route } from "@playwright/test";
import { readFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

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

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`primary media metadata uses whole minutes ${viewport.width}`, async ({ page }) => {
    await rangedAudio(page);
    await page.setViewportSize(viewport);
    const media = [
      ['regular-visitor', '3 minutes'],
      ['itchatter-hakatony', '40 minutes'],
      ['itchatter-parni-hakatonschiki', '30 minutes'],
    ];
    for (const url of ['/library', '/library/all', '/library/table', '/library/timeline', '/library/music', '/library/types']) {
      await page.goto(url);
      for (const [slug, duration] of media) {
        if (url.endsWith('music') && slug !== 'regular-visitor') continue;
        const link = page.locator(`main a[href='/library/${slug}']:visible`).first();
        const row = link.locator('xpath=ancestor::*[self::li or self::tr][1]');
        if (url.endsWith('/table') || url.endsWith('/timeline')) {
          await expect(row.locator('[data-duration-kind="media"]')).toHaveText(duration);
        } else {
          await expect(row.locator('[data-duration-kind]')).toHaveCount(0);
        }
      }
      await expect(page.locator('.dc-material__marker')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    for (const [slug, duration] of media) {
      await page.goto('/library/' + slug);
      const metadata = slug === 'regular-visitor'
        ? page.locator('.dc-track__file [data-duration-kind="media"]')
        : page.locator('.dc-publication__meta [data-duration-kind="media"]');
      await expect(metadata).toHaveText(duration);
      if (slug === 'regular-visitor') {
        const audio = page.locator('dc-audio audio');
        await audio.evaluate((el: HTMLAudioElement) => { el.preload = 'metadata'; el.load(); });
        await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeCloseTo(138, 0);
        await expect(page.locator('.dc-audio-player__time > :last-child')).toHaveText('02:18');
      }
    }
  });
}

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
  test('character scales cover fractional progress and volume boundaries',async({page})=>{
    await page.goto('/library/regular-visitor');
    await expect(page.locator('dc-audio')).toHaveAttribute('enhanced','');
    const actual=await page.evaluate(()=>{
      const audio=customElements.get('dc-audio') as CustomElementConstructor & {cells:(value:number,count:number,partial:boolean)=>string};
      return {
        progress:[0,1,.34375,-1,2,NaN,Infinity].map(value=>audio.cells(value,4,true)),
        eighths:Array.from({length:7},(_,i)=>audio.cells((i+1)/8,1,true)),
        volume:[0,.5,1,.54321].map(value=>audio.cells(value,10,false)),
      };
    });
    expect(actual.progress).toEqual(['░░░░','████','█▍░░','░░░░','████','░░░░','░░░░']);
    expect(actual.eighths).toEqual(['▏','▎','▍','▌','▋','▊','▉']);
    expect(actual.volume).toEqual(['□□□□□□□□□□','■■■■■□□□□□','■■■■■■■■■■','■■■■■□□□□□']);
  });

  test('progress keeps a complete background under fractional foreground cells',async({page},info)=>{
    await page.goto('/library/regular-visitor');await page.evaluate(()=>document.fonts.ready);
    const host=page.locator('dc-audio'),audio=host.locator('audio'),cells=host.locator('.dc-audio-timeline .dc-audio-glyphs > span');
    await expect(host.getByRole('slider',{name:'Seek audio'})).toBeEnabled();
    await expect.poll(()=>cells.count()).toBeGreaterThan(1);
    const count=await cells.count();
    await cells.first().evaluate(el=>el.setAttribute('data-stable-cell','yes'));
    for(const ratio of [0,(4.5+.025)/count,1]){
      await audio.evaluate((a:HTMLAudioElement,value)=>{a.currentTime=a.duration*value;},ratio);
      await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.seeking)).toBe(false);
      if(ratio===1){
        if(!await audio.evaluate((a:HTMLAudioElement)=>a.ended))await host.getByRole('button',{name:'Play audio',exact:true}).click();
        await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.ended)).toBe(true);
      }
      const read=()=>cells.evaluateAll(nodes=>nodes.map(cell=>({base:cell.firstElementChild!.textContent,fill:cell.lastElementChild!.textContent})));
      if(ratio===0)await expect.poll(async()=>(await read()).every(x=>x.fill==='')).toBe(true);
      else if(ratio===1)await expect.poll(async()=>(await read()).every(x=>x.fill==='█')).toBe(true);
      else await expect.poll(async()=>(await read()).some(x=>/[▏▎▍▌▋▊▉]/.test(x.fill!))).toBe(true);
      expect((await read()).every(x=>x.base==='░')).toBe(true);
      expect(await cells.first().getAttribute('data-stable-cell')).toBe('yes');
      const boxes=await cells.evaluateAll(nodes=>nodes.map(cell=>{
        const b=cell.firstElementChild!.getBoundingClientRect(),f=cell.lastElementChild!.getBoundingClientRect();
        return [b.x-f.x,b.y-f.y,b.width-f.width,b.height-f.height];
      }));
      expect(boxes.flat().every(delta=>Math.abs(delta)<.05)).toBe(true);
      await host.screenshot({path:info.outputPath(`progress-layers-${ratio===0?'zero':ratio===1?'full':'fractional'}.png`)});
    }
  });

  test('desktop control centres align and times have no hanging separator',async({page})=>{
    for(const width of [768,1024,1440]){
      await page.setViewportSize({width,height:900});await page.goto('/library/regular-visitor');
      await expect(page.locator('dc-audio')).toHaveAttribute('enhanced','');
      const geometry=await page.locator('dc-audio').evaluate(el=>({
        wide:el.clientWidth>=36*parseFloat(getComputedStyle(document.documentElement).fontSize),
        centres:Array.from(el.querySelectorAll('button,input,.dc-audio-player__volume-label'),node=>{const r=node.getBoundingClientRect();return r.y+r.height/2;}),
        time:el.querySelector('.dc-audio-player__time')!.textContent,
      }));
      expect(geometry.time).not.toContain('/');
      if(geometry.wide)expect(Math.max(...geometry.centres)-Math.min(...geometry.centres)).toBeLessThan(.1);
    }
  });

  test('Play stays beside progress across compact and wide container boundaries', async ({ page }) => {
    for (const width of [320,375,390,676,677,678,768,1440]) {
      await page.setViewportSize({width,height:900});
      await page.goto('/library/regular-visitor');
      const host=page.locator('dc-audio');
      await expect(host).toHaveAttribute('enhanced','');
      const read=()=>host.evaluate(el=>{
        const box=(selector:string)=>{const r=el.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
        return {play:box('.dc-audio-primary'),seek:box('.dc-audio-player__seek'),overflow:el.scrollWidth-el.clientWidth};
      });
      const before=await read();
      expect(Math.abs(before.play.y+before.play.h/2-before.seek.y-before.seek.h/2)).toBeLessThanOrEqual(1);
      expect(before.seek.x).toBeGreaterThan(before.play.x+before.play.w);
      expect(before.overflow).toBeLessThanOrEqual(1);
      await host.locator('audio').evaluate((audio:HTMLAudioElement)=>audio.dispatchEvent(new Event('waiting')));
      await expect(host.getByRole('status')).toHaveText('Buffering');
      expect(await read()).toEqual(before);
    }
  });

  test('transparent native ranges handle pointer, drag, keyboard and muted volume',async({page})=>{
    await page.goto('/library/regular-visitor');
    const host=page.locator('dc-audio'),audio=host.locator('audio');
    const seek=host.getByRole('slider',{name:'Seek audio'}),volume=host.getByRole('slider',{name:'Audio volume'});
    await expect(seek).toBeEnabled();
    for(const input of [seek,volume]){
      await expect(input).toHaveCSS('opacity','0');
      await input.focus();
      await expect(input.locator('..')).toHaveCSS('outline-width','2px');
      expect(await input.evaluate(el=>document.elementFromPoint(el.getBoundingClientRect().x+el.clientWidth/2,el.getBoundingClientRect().y+el.clientHeight/2)===el)).toBe(true);
    }
    const box=(await seek.boundingBox())!;
    await page.mouse.click(box.x+box.width*.25,box.y+box.height/2);
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeGreaterThan(.15);
    await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.72,box.y+box.height/2,{steps:8});await page.mouse.up();
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeGreaterThan(.6);
    await audio.evaluate((a:HTMLAudioElement)=>{a.volume=.54321;});
    await expect(volume).toHaveValue('0.54321');
    const scale=volume.locator('..').locator('.dc-audio-glyphs');
    const cells=await scale.locator('span').count();
    await expect(scale).toHaveText(/^[■□]+$/);
    const original=(await scale.textContent())!;
    expect(Math.abs(Array.from(original).filter(char=>char==='■').length/cells-.54321)).toBeLessThanOrEqual(.5/cells);
    await host.getByRole('button',{name:'Mute audio',exact:true}).click();
    await expect(scale).toHaveText('□'.repeat(cells));
    expect(await audio.evaluate((a:HTMLAudioElement)=>a.volume)).toBeCloseTo(.54321,5);
    await host.getByRole('button',{name:'Unmute audio',exact:true}).click();
    await expect(scale).toHaveText(original);
    await volume.focus();await volume.press('Home');await expect(scale).toHaveText('□'.repeat(cells));
    await volume.press('End');await expect(scale).toHaveText('■'.repeat(cells));
    await volume.press('ArrowLeft');
    expect(await audio.evaluate((a:HTMLAudioElement)=>a.volume)).toBeLessThan(1);
  });

  test('resizing character scales preserves native media state and status geometry',async({page})=>{
    await page.goto('/library/regular-visitor');
    const host=page.locator('dc-audio'),audio=host.locator('audio');
    await expect(host.getByRole('slider',{name:'Seek audio'})).toBeEnabled();
    await audio.evaluate((a:HTMLAudioElement)=>{a.currentTime=47.123;a.volume=.54321;});
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.seeking)).toBe(false);
    const before=await audio.evaluate((a:HTMLAudioElement)=>({current:a.currentTime,volume:a.volume,muted:a.muted}));
    const counts:number[]=[];
    for(const width of [280,320,375,390,430,640,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      await expect.poll(()=>host.locator('.dc-audio-glyphs').first().locator(':scope > span').count()).toBeGreaterThan(1);
      const geometry=await host.evaluate(el=>({
        width:el.querySelector('input')!.clientWidth,
        count:el.querySelector('.dc-audio-glyphs')!.children.length,
        advance:Math.max(...Array.from(el.querySelector('.dc-audio-probe')!.children,x=>x.getBoundingClientRect().width)),
        overflow:document.documentElement.scrollWidth-innerWidth,
        cells:Array.from(el.querySelectorAll('.dc-audio-glyphs'),x=>({hidden:x.getAttribute('aria-hidden'),events:getComputedStyle(x).pointerEvents})),
      }));
      // ResizeObserver updates after layout; compare the measured width/count once settled.
      await expect.poll(()=>host.locator('.dc-audio-glyphs').first().locator(':scope > span').count()).toBe(Math.floor(geometry.width/geometry.advance));
      counts.push(geometry.count);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.cells.every(x=>x.hidden==='true'&&x.events==='none')).toBe(true);
      expect(await audio.evaluate((a:HTMLAudioElement)=>({current:a.currentTime,volume:a.volume,muted:a.muted}))).toEqual(before);
    }
    expect(new Set(counts).size).toBeGreaterThan(3);
    for(const width of [280,375,1440]){
      await page.setViewportSize({width,height:900});
      const measure=()=>host.locator('.dc-audio-timeline').boundingBox();
      const baseline=await measure();
      await audio.evaluate((a:HTMLAudioElement)=>a.dispatchEvent(new Event('waiting')));
      await expect(host.getByRole('status')).toHaveText('Buffering');
      await expect(host.locator('.dc-audio-notice')).toContainText('Buffering');
      expect(await measure()).toEqual(baseline);
      await audio.evaluate((a:HTMLAudioElement)=>a.dispatchEvent(new Event('canplay')));
      await expect(host.locator('.dc-audio-notice > span')).toHaveText('');
      expect(await measure()).toEqual(baseline);
    }
  });

  test('character metrics follow fallback fonts and zoom without clipping cells',async({page})=>{
    await page.route('**/fonts/*.woff2',route=>route.abort());
    await page.goto('/library/regular-visitor');
    await page.evaluate(()=>document.fonts.ready);
    const host=page.locator('dc-audio');
    for(const zoom of ['1','1.25','2']){
      await host.evaluate((el,value)=>{el.style.zoom=value;},zoom);
      for(const width of [320,430,1440]){
        await page.setViewportSize({width,height:900});
        await expect.poll(()=>host.evaluate(el=>{
          const advance=Math.max(...Array.from(el.querySelector('.dc-audio-probe')!.children,x=>x.getBoundingClientRect().width));
          const scale=el.querySelector('.dc-audio-scale')!,input=scale.querySelector('input')!;
          return scale.querySelector('.dc-audio-glyphs')!.children.length===Math.max(1,Math.floor(input.getBoundingClientRect().width/advance));
        })).toBe(true);
        const geometry=await host.evaluate(el=>Array.from(el.querySelectorAll('.dc-audio-glyphs'),glyphs=>{
          const box=glyphs.getBoundingClientRect(),input=glyphs.parentElement!.querySelector('input')!.getBoundingClientRect();
          return {width:box.width,inputWidth:input.width,cells:Array.from(glyphs.children,x=>x.getBoundingClientRect().width),overflow:getComputedStyle(glyphs).overflowX};
        }));
        for(const scale of geometry){
          expect(scale.width).toBeCloseTo(scale.inputWidth,1);
          expect(scale.overflow).toBe('visible');
          expect(Math.max(...scale.cells)-Math.min(...scale.cells)).toBeLessThan(.1);
        }
      }
    }
  });

  test('native media clock, play/pause, keyboard seek, volume, end and reconnect',async({page})=>{
    await page.goto('/library/regular-visitor');
    const host=page.locator('dc-audio'); const audio=host.locator('audio');
    await expect(host).toHaveAttribute('enhanced','');
    await expect(audio).toHaveAttribute('preload','auto');
    await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.duration)).toBeCloseTo(138,0);
    await expect(host.locator('.dc-audio-player__time')).toHaveText('00:00 02:18');
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
    await expect(host.getByRole('status')).toHaveText(/Loading…|Buffering/);
    await expect(host.locator('.dc-audio-player__time')).toHaveText('00:00 --:--');
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
  test('touch targets and playback fit the publication column',async({page,context},info)=>{
    await page.goto('/library/regular-visitor');const host=page.locator('dc-audio');
    for(const control of await host.locator('button,input').all())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const geometry=async()=>host.evaluate(el=>({
      row:el.querySelector('.dc-audio-timeline')!.getBoundingClientRect().toJSON(),
      seek:el.querySelector('.dc-audio-player__seek')!.getBoundingClientRect().toJSON(),
      buttons:Array.from(el.querySelectorAll('button'),button=>({
        width:Math.round(button.getBoundingClientRect().width*100)/100,height:button.getBoundingClientRect().height,font:getComputedStyle(button).fontSize,
      })),
    }));
    const initial=await geometry();
    expect(initial.seek.width).toBeCloseTo(initial.row.width,0);
    const playBox=(await host.locator('button').first().boundingBox())!;
    expect(Math.abs(initial.seek.y+initial.seek.height/2-playBox.y-playBox.height/2)).toBeLessThanOrEqual(1);
    expect(initial.buttons[0].width).toBe(initial.buttons[0].height);
    await host.getByRole('button',{name:'Play audio',exact:true}).tap();
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.1);
    await expect(host.getByRole('status')).toHaveText('Playing');
    await host.getByRole('button',{name:'Mute audio',exact:true}).tap();
    expect((await geometry()).buttons).toEqual(initial.buttons);
    await host.getByRole('button',{name:'Unmute audio',exact:true}).tap();
    await host.getByRole('slider',{name:'Seek audio'}).tap();
    await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(20);
    if(info.project.name!=='firefox-desktop'){
      const client=await context.newCDPSession(page),box=(await host.getByRole('slider',{name:'Seek audio'}).boundingBox())!;
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
      for(let i=1;i<=6;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.5+i*.05),y:box.y+box.height/2}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await expect.poll(()=>host.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime/a.duration)).toBeGreaterThan(.65);
      await client.detach();
    }
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
    await expect(host.getByRole('status')).toHaveText('Playing');
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
    await expect(enhanced.locator('dc-audio').getByRole('status')).toHaveText('Paused');
    const beforeKey = await nativeAudio.evaluate((a: HTMLAudioElement) => a.currentTime);
    await nativeAudio.focus();
    await native.keyboard.press('ArrowRight');
    await expect.poll(async () => Math.abs(await nativeAudio.evaluate((a: HTMLAudioElement) => a.currentTime) - beforeKey)).toBeLessThan(.1);
  }
  await Promise.all([native.close(), enhanced.close()]);
});

test('audio controls reflow at 200% browser font size', async ({ page, context }, info) => {
  test.skip(info.project.name === 'firefox-desktop', 'Browser font preferences use Chromium CDP here.');
  const client = await context.newCDPSession(page);
  await client.send('Page.enable');
  for (const fontSize of [16, 32]) {
    await client.send('Page.setFontSizes' as never, { fontSizes: { standard: fontSize, fixed: fontSize } } as never);
    for (const width of [280, 320, 375, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/library/regular-visitor');
      await page.evaluate(() => document.fonts.ready);
      const host = page.locator('dc-audio');
      await expect(host).toHaveAttribute('enhanced', '');
      const geometry = await host.evaluate(el => {
        const box = el.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          playerOverflow: el.scrollWidth-el.clientWidth,
          coarse: matchMedia('(pointer: coarse)').matches,
          clockFont: parseFloat(getComputedStyle(el.querySelector('.dc-audio-player__time')!).fontSize),
          controls: Array.from(el.querySelectorAll('button,input'), node => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, right: rect.right, width: rect.width, height: rect.height };
          }),
          x: box.x, right: box.right,
        };
      });
      const [playBox, seekBox] = geometry.controls;
      expect(Math.abs(playBox.y + playBox.height / 2 - seekBox.y - seekBox.height / 2)).toBeLessThanOrEqual(1);
      expect(geometry.playerOverflow, `${width}px / ${fontSize}px player`).toBeLessThanOrEqual(1);
      // The unchanged header navigation exceeds 280px at a 32px browser font.
      // Audio controls must still fit; the header correction is outside W0059.
      if(width!==280||fontSize!==32)expect(geometry.overflow, `${width}px / ${fontSize}px`).toBeLessThanOrEqual(1);
      expect(geometry.clockFont).toBeCloseTo(13 * fontSize / 16, 1);
      for (const control of geometry.controls) {
        expect(control.x).toBeGreaterThanOrEqual(geometry.x);
        expect(control.right).toBeLessThanOrEqual(geometry.right);
        expect(control.width).toBeGreaterThanOrEqual(geometry.coarse ? 44 : 24);
        expect(control.height).toBeGreaterThanOrEqual(geometry.coarse ? 44 : 24);
      }
      const play = host.getByRole('button', { name: 'Play audio', exact: true });
      await play.focus();
      await expect(play).toHaveCSS('outline-width', '2px');
    }
  }
});

test('multi-recording tracks retain each file duration while aggregate time stays unknown', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'Server-rendered fixture shape runs once.');
  const root = mkdtempSync(join(tmpdir(), 'track-multiple-audio-'));
  try {
    const content = join(root, 'content');
    const output = join(root, 'public');
    cpSync('content', content, { recursive: true });
    const track = join(content, 'library', 'regular-visitor.md');
    const original = readFileSync(track, 'utf8');
    // Two valid entries reuse a real recording; source metadata and MP3 bytes
    // stay unchanged. The model permits a list of recordings on one track.
    const entry = original.match(/^audio:\n((?:[ \t].*\n)+)/m)![1];
    writeFileSync(track, original.replace('audio:\n' + entry, 'audio:\n' + entry + entry));
    execFileSync('hugo', ['build', '--environment', 'preview', '--panicOnWarning',
      '--contentDir', content, '--destination', output, '--cacheDir', join(root, 'cache')],
      { stdio: 'pipe' });
    await page.route('**/library/regular-visitor', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: readFileSync(join(output, 'library', 'regular-visitor', 'index.html')),
    }));
    await page.goto('/library/regular-visitor');
    await expect(page.locator('dc-audio')).toHaveCount(2);
    await expect(page.locator('.dc-track__file [data-duration-kind="media"]'))
      .toHaveText(['3 minutes', '3 minutes']);
    await page.route('**/library/table', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: readFileSync(join(output, 'library', 'table', 'index.html')),
    }));
    await page.goto('/library/table');
    const row = page.locator('tr').filter({ has: page.locator('a[href="/library/regular-visitor"]') });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-duration-kind]')).toHaveCount(0);
    await expect(row).not.toContainText('1 minute');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('reading audio keeps Play beside progress in its narrow column', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'Disposable server-rendered reading fixture runs once.');
  const root=mkdtempSync(join(tmpdir(),'reading-audio-layout-'));
  try {
    const content=join(root,'content'),output=join(root,'public');
    cpSync('content',content,{recursive:true});
    const fixture=join(content,'library','typography-playground.md');
    writeFileSync(fixture,readFileSync(fixture,'utf8').replace('draft: true','draft: false'));
    execFileSync('hugo',['build','--environment','preview','--panicOnWarning','--contentDir',content,'--destination',output,'--cacheDir',join(root,'cache')],{stdio:'pipe'});
    await page.route('**/library/typography-playground',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(output,'library','typography-playground','index.html'))}));
    await rangedAudio(page);
    for(const width of [320,390,677,1440]) {
      await page.setViewportSize({width,height:900});
      await page.goto('/library/typography-playground');
      const host=page.locator('.dc-audio--reading dc-audio');
      await expect(host).toHaveAttribute('enhanced','');
      for(const fontSize of ['100%','200%']) {
        await page.evaluate(value=>{document.documentElement.style.fontSize=value;},fontSize);
        const geometry=await host.evaluate(el=>{
          const boxes=Array.from(el.querySelectorAll('.dc-audio-primary,.dc-audio-player__seek'),node=>{const r=node.getBoundingClientRect();return r.y+r.height/2;});
          return {boxes,overflow:el.scrollWidth-el.clientWidth};
        });
        expect(Math.abs(geometry.boxes[0]-geometry.boxes[1])).toBeLessThanOrEqual(1);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
      }
    }
  } finally { rmSync(root,{recursive:true,force:true}); }
});

for (const resizeObserver of [true, false]) {
  test(`statusbar reserves its real height across modes, resize and reconnect (RO ${resizeObserver})`, async ({page}) => {
    if (!resizeObserver) await page.addInitScript(() => { window.ResizeObserver = undefined as never; });
    await page.setViewportSize({width:768,height:900});
    await page.goto('/');
    const bar = page.locator('.dc-statusbar');
    await expect(bar).toBeVisible();
    const reserve = () => page.evaluate(() => {
      const height = document.querySelector('.dc-statusbar')!.getBoundingClientRect().height;
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        measured:parseFloat(document.documentElement.style.getPropertyValue('--as-statusbar-height')),
        actual:Math.ceil(height),
        scroll:parseFloat(root.scrollPaddingBottom),
        body:parseFloat(body.paddingBottom),
      };
    });
    const expectReserve = async () => {
      await expect.poll(async () => { const r=await reserve(); return r.measured===r.actual; }).toBe(true);
      const r=await reserve();
      expect(r.scroll).toBe(r.actual ? r.actual+8 : 0);
      expect(r.body).toBe(r.scroll);
    };
    await expectReserve();
    if (resizeObserver) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
      await expectReserve();
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await expectReserve();
    }
    // Exercise wrapped hints, rather than a synthetic fixed-height bar.
    await page.locator('as-statusbar').evaluate(el => {
      el.setAttribute('keys-help', 'help '.repeat(30));
      document.dispatchEvent(new CustomEvent('dc-command-palette:close'));
    });
    const wrapped = (await bar.boundingBox())!.height;
    await expectReserve();
    await page.keyboard.press('/');
    await expect(page.locator('dc-command-palette dialog[open]')).toBeVisible();
    await expectReserve();
    expect((await bar.boundingBox())!.height).toBeLessThan(wrapped);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expectReserve();
    await expect.poll(async () => (await bar.boundingBox())!.height).toBe(wrapped);
    for (const width of [390, 1440, 768]) {
      await page.setViewportSize({width,height:900});
      await expectReserve();
    }
    await page.locator('as-statusbar').evaluate(el => {
      window['__detachedStatusbar'] = el;
      el.remove();
      document.dispatchEvent(new CustomEvent('dc-command-palette:open'));
    });
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--as-statusbar-height'))).toBe('');
    // A disconnected component must not react to the document mode event.
    expect(await page.evaluate(() => window['__detachedStatusbar'].querySelector('[data-statusbar-mode]').hidden)).toBe(true);
    await page.evaluate(() => document.body.append(window['__detachedStatusbar']));
    await expect(bar).toBeVisible();
    await expectReserve();
    await page.keyboard.press('/');
    await expect(page.locator('dc-command-palette dialog[open]')).toBeVisible();
    await expectReserve();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expectReserve();
  });
}

test('statusbar reconnect during Search preserves the original page mode', async ({page}) => {
  await page.setViewportSize({width:768,height:900});
  for (const path of ['/', '/library', '/library/bluredu-new-teachers']) {
    await page.goto(path);
    const host = page.locator('as-statusbar');
    const mode = host.locator('[data-statusbar-mode]');
    const state = host.locator('[data-statusbar-state]');
    const initial = {text:await mode.textContent(),hidden:await mode.isHidden()};
    await page.keyboard.press('/');
    await expect(page.locator('dc-command-palette dialog[open]')).toBeVisible();
    await host.evaluate(el => { const parent=el.parentElement!;el.remove();parent.append(el); });
    await expect(mode).toHaveText('SEARCH');
    await expect(mode).toBeVisible();
    if (await state.count()) await expect(state).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('dc-command-palette dialog[open]')).toHaveCount(0);
    await expect(mode).toHaveText(initial.text!);
    if (initial.hidden) await expect(mode).toBeHidden();
    else await expect(mode).toBeVisible();
    if (await state.count()) await expect(state).toBeVisible();
    await expect.poll(() => host.evaluate(el => {
      const height=el.querySelector('.dc-statusbar')!.getBoundingClientRect().height;
      return parseFloat(document.documentElement.style.getPropertyValue('--as-statusbar-height'))===Math.ceil(height);
    })).toBe(true);
  }
});
