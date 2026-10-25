import { expect, test } from "@playwright/test";

test("prompt and search field identities survive multiple instances and reconnects", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("dc-prompt input")).toHaveCount(1);
  await expect(page.locator("dc-command-palette input")).toHaveCount(1);
  const identities = await page.evaluate(() => {
    const originals = [document.querySelector("dc-prompt")!, document.querySelector("dc-command-palette")!];
    const hosts = [...originals];
    // Build fresh hosts, rather than cloning the already enhanced DOM and IDs.
    for (const source of originals) {
      const host = document.createElement(source.localName);
      for (const { name, value } of source.attributes) {
        if (name !== "ready") host.setAttribute(name, value);
      }
      const command = source.querySelector("[data-prompt-command]");
      if (command) host.append(command.cloneNode(true));
      document.body.append(host);
      hosts.push(host);
    }
    const snapshot = () => hosts.map(host => {
      const input = host.querySelector("input")!;
      const controls = input.getAttribute("aria-controls")!;
      return {
        id: input.id,
        label: input.getAttribute("aria-label"),
        role: input.getAttribute("role"),
        autocomplete: input.autocomplete,
        name: input.getAttribute("name"),
        form: input.form,
        controls,
        ownsList: host.contains(document.getElementById(controls)),
        listRole: document.getElementById(controls)?.getAttribute("role"),
      };
    });
    const before = snapshot();
    for (const host of hosts) {
      host.remove();
      document.body.append(host);
    }
    const after = snapshot();
    const allIds = Array.from(document.querySelectorAll("[id]"), el => el.id);
    return { before, after, duplicates: allIds.filter((id, index) => allIds.indexOf(id) !== index) };
  });
  expect(identities.after).toEqual(identities.before);
  expect(identities.duplicates).toEqual([]);
  expect(new Set(identities.after.map(field => field.id)).size).toBe(4);
  for (const [index, field] of identities.after.entries()) {
    expect(field.id).not.toBe("");
    expect(field.label).toBe(index % 2 === 0 ? "Command line" : "Search the site");
    expect(field.role).toBe("combobox");
    expect(field.autocomplete).toBe("off");
    expect(field.name).toBeNull();
    expect(field.form).toBeNull();
    expect(field.ownsList).toBe(true);
    expect(field.listRole).toBe("listbox");
  }
});

for (const [width, height] of [[320, 900], [390, 900], [740, 900], [741, 900], [768, 900], [1440, 900], [900, 400]]) {
  test.describe(`W0027 prompt ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const path of ["/", "/library"]) {
      test(`${path} invocation, editing, completion and local dismissal`, async ({ page, context }) => {
        await context.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
        await page.route("**/search-index.json", route => route.fulfill({
          json: { entries: [
            { title: "First text", url: "/library/first", kind: "text" },
            { title: "Second text", url: "/library/second", kind: "text" },
          ] },
        }));
        await page.goto(path);
        const prompt = page.locator("dc-prompt");
        const input = prompt.locator("input");
        const command = prompt.locator("[data-prompt-command]");
        const printed = (await command.textContent())!.trim();
        const nav = page.locator(".dc-nav a").first();
        await nav.focus();
        await expect(input).toBeHidden();
        await page.keyboard.press(":");
        await expect(input).toBeVisible();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(printed);
        expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, printed.length]);
        await page.keyboard.type("lib");
        await expect(input).toHaveValue("lib");
        await input.press("Tab");
        await expect(input).toHaveValue("library ");
        await expect(input).toBeFocused();
        await input.fill("read ");
        const suggestions = prompt.locator(".dc-prompt__suggestions");
        await expect(suggestions).toBeVisible();
        await input.press("ArrowDown");
        await expect(input).toHaveAttribute("aria-activedescendant", /opt-1$/);
        for (const control of [input, suggestions]) {
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.width).toBeGreaterThan(40);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        const url = page.url();
        await input.press("Escape");
        await expect(prompt).not.toHaveAttribute("open", "");
        await expect(input).toBeHidden();
        await expect(command).toHaveText(printed);
        await expect(nav).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page).toHaveURL(url);
        // A new invocation must work after the hidden field loses focus.
        await nav.focus();
        await page.keyboard.press(":");
        await expect(input).toBeFocused();
        await nav.focus();
        await expect(input).toBeHidden();
      });
    }
  });
}

for (const width of [320, 390, 1440]) test.describe(`W0027 no-JS ${width}`, () => {
  test.use({ viewport: { width, height: 900 }, javaScriptEnabled: false });
  test("content and navigation stay usable without a prompt input", async ({ page }) => {
    await page.goto("/library");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("dc-prompt input")).toHaveCount(0);
    const home = page.locator('.dc-nav a[href="/"]');
    await expect(home).toBeVisible();
    await home.click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
});

for (const viewport of [{width:1440,height:900},{width:1024,height:768},{width:375,height:812}]) {
  test(`prompt visible field is its input hit area ${viewport.width}`, async ({page})=>{
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.keyboard.press(':');
    const field=page.locator('.dc-prompt__field');const input=field.locator('input');
    const box=(await field.boundingBox())!;
    await page.mouse.click(box.x+box.width-4,box.y+box.height/2);
    await expect(input).toBeFocused();
    await input.fill('home');
    await page.keyboard.press('End'); await page.keyboard.type(' ');
    await expect(input).toHaveValue('home ');
    await input.press('Escape');
    if (await page.locator('.dc-help__trigger').isVisible()) await page.locator('.dc-help__trigger').click();
    else { await page.locator('.dc-nav__link').first().focus(); await page.keyboard.press('?'); }
    await expect(page.locator('dc-help dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.dc-palette__trigger').click();
    await expect(page.locator('dc-command-palette dialog')).toBeVisible();
  });
}

test('W0062 catalog aliases and retained music command', async ({ page }) => {
  for (const command of ['library', 'library --all', 'library --recent', 'library --music']) {
    await page.goto('/');
    const commands = JSON.parse((await page.locator('dc-prompt').getAttribute('data-commands'))!);
    expect(commands.library.flags.recent.hint).toContain('compatibility');
    expect(commands.library.flags.all.url).toBe('/library');
    await page.keyboard.press(':');
    const input = page.locator('dc-prompt input');
    await input.fill(command);
    await input.press('Enter');
    await expect(page).toHaveURL(command.endsWith('--music') ? /\/library\/music$/ : /\/library$/);
  }
});
