import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let fixture = process.env.REDACTION_FIXTURE_HTML;
let ownDirectory: string | undefined;
test.beforeAll(() => {
  if (!fixture) {
    ownDirectory = mkdtempSync(join(tmpdir(), 'redaction-browser-'));
    fixture = join(ownDirectory, 'fixture.html');
    execFileSync('python3', ['scripts/check-redaction-contract.py', '--public-dir', process.env.PUBLIC_DIR || 'public', '--fixture-output', fixture]);
  }
});
test.afterAll(() => { if (ownDirectory) rmSync(ownDirectory, { recursive: true, force: true }); });
const csp = readFileSync('static/_headers', 'utf8').match(/^\s+Content-Security-Policy:\s*(.+)$/m)![1];

async function separatedBlockLines(page: import('@playwright/test').Page) {
  const metrics = await page.locator('.dc-redaction--block').evaluateAll(blocks => blocks.map(block => ({
    lineHeight: parseFloat(getComputedStyle(block).lineHeight),
    rows: [...block.querySelectorAll('.as-redaction__row')].map(row => ({
      height: row.getBoundingClientRect().height,
      words: [...row.querySelectorAll('.as-redaction__word')].map(word => {
        const box = word.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      }),
    })),
  })));
  for (const block of metrics) {
    let previousBottom = -Infinity;
    for (const row of block.rows) {
      expect(row.height).toBeGreaterThanOrEqual(block.lineHeight - 1);
      expect(Math.min(...row.words.map(word => word.top))).toBeGreaterThan(previousBottom + 1);
      const physicalLines: { top: number; bottom: number }[] = [];
      for (const word of row.words) {
        if (!physicalLines.some(line => Math.abs(line.top - word.top) < 1)) physicalLines.push(word);
      }
      for (let i = 1; i < physicalLines.length; i++) {
        expect(physicalLines[i].top).toBeGreaterThan(physicalLines[i-1].bottom + 1);
        expect(physicalLines[i].top - physicalLines[i-1].top).toBeCloseTo(block.lineHeight, 0);
      }
      previousBottom = Math.max(...row.words.map(word => word.bottom));
    }
  }
}

for (const width of [390, 1440]) for (const js of [true, false]) {
  test.describe(`redaction ${width} ${js ? 'JS' : 'no-JS'}`, () => {
    test.use({ viewport: { width, height: 900 }, javaScriptEnabled: js });
    test.beforeEach(async ({ context }) => {
      await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
      await context.route('**/__redaction-test', route => route.fulfill({
        status: 200, contentType: 'text/html; charset=utf-8',
        headers: { 'Content-Security-Policy': csp }, body: readFileSync(fixture!, 'utf8'),
      }));
    });

    test('CSP, words, AT, logical rows, punctuation and font scaling', async ({ page }) => {
      const violations: string[] = [];
      await page.exposeFunction('redactionViolation', (directive: string) => violations.push(directive));
      await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
        (window as any).redactionViolation(e.violatedDirective)));
      const response = await page.goto('/__redaction-test');
      expect(response!.headers()['content-security-policy']).toBe(csp);
      await page.evaluate(() => document.fonts.ready);
      const inline = page.locator('[data-redaction="test-inline"]');
      await expect(inline.locator('.as-redaction__word')).toHaveCount(5);
      await expect(inline.locator('[style], [title], a, button, [tabindex]')).toHaveCount(0);
      expect((await inline.ariaSnapshot()).match(/вымарано/g)?.length).toBe(1);
      await expect(inline.locator('.as-redaction__shape')).toHaveAttribute('aria-hidden', 'true');
      await expect(inline.locator('.as-redaction__replacement')).toHaveCSS('clip-path', 'inset(50%)');
      const sizes = await inline.locator('.as-redaction__word').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
      expect(sizes[1] / sizes[0]).toBeCloseTo(2, 1);
      expect(sizes[4] / sizes[0]).toBeCloseTo(6, 1);
      const block = page.locator('[data-redaction="test-block"]');
      await expect(block.locator('.as-redaction__paragraph')).toHaveCount(2);
      await expect(block.locator('.as-redaction__row')).toHaveCount(3);
      const rows = await block.locator('.as-redaction__row').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
      expect(rows[1] / rows[0]).toBeCloseTo(.8, 1);
      expect(rows[2] / rows[0]).toBeCloseTo(.6, 1);
      const gaps = await inline.locator('.as-redaction__row').evaluate(el => el.textContent);
      expect(gaps).toBe('    ');
      expect(await page.locator('#inline').textContent()).toBe('До     [вымарано], после.');
      const baseline = await page.locator('#baseline').evaluate(el => getComputedStyle(el).lineHeight);
      await expect(page.locator('#inline')).toHaveCSS('line-height', baseline);
      for (const scale of ['100%', '200%']) {
        // Simulate a reader's larger font; no application style/JS is added.
        await page.evaluate(value => document.documentElement.style.fontSize = value, scale);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        const metric = await page.locator('#long').evaluate(el => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) }));
        expect(Math.abs(metric.h / metric.lh - Math.round(metric.h / metric.lh))).toBeLessThan(.05);
        await separatedBlockLines(page);
      }
      expect(violations).toEqual([]);
      await page.goto('/library/skver');
      await expect(page.locator('[data-redaction="skver-01"] .as-redaction__word')).toHaveCount(8);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });

    test('one print replacement per fragment and forced-colors visibility', async ({ page }) => {
      await page.goto('/__redaction-test');
      await page.emulateMedia({ media: 'print' });
      const roots = page.locator('.as-redaction');
      await expect(roots).toHaveCount(5);
      for (const root of await roots.all()) {
        const label = root.locator('.as-redaction__replacement');
        await expect(label).toHaveCount(1);
        await expect(label).toBeVisible();
        await expect(label).toHaveCSS('position', 'static');
        await expect(label).toHaveCSS('clip-path', 'none');
        const box = await label.boundingBox();
        expect(box!.width).toBeGreaterThan(20);
        await expect(root.locator('.as-redaction__word').first()).toHaveCSS('background-image', 'none');
        await expect(root.locator('.as-redaction__word').first()).toHaveCSS('outline-style', 'solid');
      }
      await expect(page.locator('[data-redaction="test-block"] .as-redaction__paragraph')).toHaveCount(2);
      await separatedBlockLines(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.emulateMedia({ media: 'screen', forcedColors: 'active' });
      const word = page.locator('.as-redaction__word').first();
      await expect(word).toHaveCSS('background-image', 'none');
      await expect(word).toHaveCSS('forced-color-adjust', 'none');
      expect(await word.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await separatedBlockLines(page);
      const before = await word.evaluate(el => getComputedStyle(el).backgroundColor);
      await word.hover();
      await expect(word).toHaveCSS('background-color', before);
      await expect(page.locator('.as-redaction [title], .as-redaction [role="tooltip"]')).toHaveCount(0);
    });
  });
}
