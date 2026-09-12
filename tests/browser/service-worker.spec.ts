import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const PRECACHE_NAME = "dc-sw:precache:v1";
const DOCUMENTS_CACHE_NAME = "dc-sw:documents:v1";
const publicDir = path.resolve(process.env.PUBLIC_DIR || "public");
const generatedFixtures = ["__sw-large", "sw-broken.js", "sw-legacy.js", "sw-upgrade.js"];

async function waitForWorker(page: Page, script = "/sw.js") {
  await page.waitForFunction(async (expectedScript) => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (
      registration?.active?.state === "activated" &&
      registration.active.scriptURL.endsWith(expectedScript) &&
      navigator.serviceWorker.controller?.scriptURL.endsWith(expectedScript)
    );
  }, script);
}

async function waitForCached(page: Page, pathname: string) {
  await expect
    .poll(() =>
      page.evaluate(
        async ({ cacheName, pathToMatch }) => {
          const cache = await caches.open(cacheName);
          return Boolean(await cache.match(new URL(pathToMatch, location.origin)));
        },
        { cacheName: DOCUMENTS_CACHE_NAME, pathToMatch: pathname },
      ),
    )
    .toBe(true);
}

async function documentUrls(page: Page) {
  return page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  }, DOCUMENTS_CACHE_NAME);
}

test.describe("navigation-only Service Worker", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name === "chromium-mobile",
      "Service Worker behavior is origin-wide; one Chromium profile is representative.",
    );
  });

  test.afterEach(async () => {
    await Promise.all(
      generatedFixtures.map((fixture) =>
        rm(path.join(publicDir, fixture), { recursive: true, force: true }),
      ),
    );
  });

  test("registers at the root and precaches only the offline document", async ({ page }) => {
    await page.goto("/");
    await waitForWorker(page);

    const registrationScript = page.locator("script[src^='/js/sw-register.']");
    await expect(registrationScript).toHaveCount(1);
    await expect(registrationScript).toHaveAttribute("defer", "");
    await expect(registrationScript).toHaveAttribute("integrity", /^sha/);

    const state = await page.evaluate(async (precacheName) => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const precache = await caches.open(precacheName);
      return {
        scope: registration?.scope,
        script: registration?.active?.scriptURL,
        precache: (await precache.keys()).map((request) => new URL(request.url).pathname),
      };
    }, PRECACHE_NAME);
    expect(state.scope).toBe(new URL("/", page.url()).href);
    expect(state.script).toMatch(/\/sw\.js$/);
    expect(state.precache).toEqual(["/offline"]);
  });

  test("serves a visited document and the system fallback offline", async ({ page, context }) => {
    await page.goto("/");
    await waitForWorker(page);
    await page.goto("/library/philosophy-of-freedom");
    await waitForCached(page, "/library/philosophy-of-freedom");

    await context.setExtraHTTPHeaders({ "X-SW-Test-Network-Failure": "1" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).not.toHaveText("Нет сети");
    await expect(page.locator("article, .dc-panel--detail").first()).toBeVisible();

    await page.goto("/not-visited-by-service-worker", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText("Нет сети");
    await expect(page).toHaveURL(/\/not-visited-by-service-worker$/);
  });

  test("expires stale documents instead of serving them", async ({ page, context }) => {
    const pathname = "/library/skver";
    await page.goto("/");
    await waitForWorker(page);
    await page.goto(pathname);
    await waitForCached(page, pathname);

    await page.evaluate(
      async ({ cacheName, pathToExpire }) => {
        const cache = await caches.open(cacheName);
        const request = new Request(new URL(pathToExpire, location.origin));
        const response = await cache.match(request);
        if (!response) throw new Error("cached fixture missing");
        const headers = new Headers(response.headers);
        headers.set("X-DC-SW-Cached-At", new Date(Date.now() - 8 * 86400_000).toISOString());
        await cache.put(
          request,
          new Response(await response.arrayBuffer(), {
            status: response.status,
            statusText: response.statusText,
            headers,
          }),
        );
      },
      { cacheName: DOCUMENTS_CACHE_NAME, pathToExpire: pathname },
    );

    await context.setExtraHTTPHeaders({ "X-SW-Test-Network-Failure": "1" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText("Нет сети");
    await expect.poll(() => documentUrls(page)).not.toContain(pathname);
  });

  test("returns a 404 and revokes an old cached copy", async ({ page, context }) => {
    const pathname = "/removed-service-worker-fixture";
    await page.goto("/");
    await waitForWorker(page);
    await page.goto("/library/23");
    await waitForCached(page, "/library/23");
    await page.evaluate(
      async ({ cacheName, sourcePath, removedPath }) => {
        const cache = await caches.open(cacheName);
        const source = await cache.match(new URL(sourcePath, location.origin));
        if (!source) throw new Error("cached source missing");
        await cache.put(new URL(removedPath, location.origin), source.clone());
      },
      {
        cacheName: DOCUMENTS_CACHE_NAME,
        sourcePath: "/library/23",
        removedPath: pathname,
      },
    );

    const response = await page.goto(pathname);
    expect(response?.status()).toBe(404);
    await expect.poll(() => documentUrls(page)).not.toContain(pathname);

    await context.setExtraHTTPHeaders({ "X-SW-Test-Network-Failure": "1" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText("Нет сети");
  });

  test("returns a 410 and revokes the cached document", async ({ page, context }) => {
    const pathname = "/library/23";
    await page.goto("/");
    await waitForWorker(page);
    await page.goto(pathname);
    await waitForCached(page, pathname);

    await context.setExtraHTTPHeaders({ "X-SW-Test-Status": "410" });
    const response = await page.reload();
    expect(response?.status()).toBe(410);
    await expect(page.locator("h1")).toHaveText("Test 410");
    await expect.poll(() => documentUrls(page)).not.toContain(pathname);

    await context.setExtraHTTPHeaders({ "X-SW-Test-Network-Failure": "1" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText("Нет сети");
  });

  test("does not cache redirects, queries, or replace a 5xx", async ({ page, context }) => {
    await page.goto("/");
    await waitForWorker(page);

    await page.goto("/library/");
    await page.waitForTimeout(100);
    expect(await documentUrls(page)).not.toContain("/library/");

    await page.goto("/library/all?sw-test=1");
    await page.waitForTimeout(100);
    expect(await documentUrls(page)).not.toContain("/library/all");

    const cachedPath = "/library/skver";
    await page.goto(cachedPath);
    await waitForCached(page, cachedPath);
    await context.setExtraHTTPHeaders({ "X-SW-Test-Status": "503" });
    const failed = await page.reload();
    expect(failed?.status()).toBe(503);
    await expect(page.locator("h1")).toHaveText("Test 503");
    expect(await documentUrls(page)).toContain(cachedPath);

    await context.setExtraHTTPHeaders({ "X-SW-Test-Network-Failure": "1" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText("Сквер");
  });

  test("keeps audio and every subresource outside Cache Storage", async ({ page }) => {
    await page.goto("/");
    await waitForWorker(page);
    await page.goto("/library/regular-visitor");
    await waitForCached(page, "/library/regular-visitor");

    const audio = await page.locator("audio").getAttribute("src");
    expect(audio).toBeTruthy();
    await page.evaluate(async (src) => {
      const response = await fetch(src, { headers: { Range: "bytes=0-31" } });
      await response.arrayBuffer();
    }, audio as string);

    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        urls.push(...(await cache.keys()).map((request) => request.url));
      }
      return urls;
    });
    expect(cachedUrls).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.(?:css|js|woff2|png|jpe?g|webp|mp3)(?:\?|$)/),
      ]),
    );
  });

  test("evicts the oldest document after the twelfth entry", async ({ page }) => {
    const routes = [
      "/",
      "/library",
      "/library/23",
      "/library/all",
      "/library/bluredu-new-teachers",
      "/library/music",
      "/library/philosophy-of-freedom",
      "/library/regular-visitor",
      "/library/skver",
      "/library/table",
      "/library/timeline",
      "/library/types",
      "/library/types/article",
    ];
    await page.goto("/");
    await waitForWorker(page);
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await waitForCached(page, route);
    }

    await expect.poll(() => documentUrls(page)).toHaveLength(12);
    const urls = await documentUrls(page);
    expect(urls).not.toContain(routes[0]);
    expect(urls).toContain(routes.at(-1));
  });

  test("does not cache an HTML document larger than 512 KiB", async ({ page }) => {
    const fixtureDir = path.join(publicDir, "__sw-large");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(
      path.join(fixtureDir, "index.html"),
      `<!doctype html><html lang="en"><title>Large</title><main>${"x".repeat(513 * 1024)}</main></html>`,
    );

    await page.goto("/");
    await waitForWorker(page);
    const response = await page.goto("/__sw-large");
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toContainText("xxx");
    await page.waitForTimeout(500);
    expect(await documentUrls(page)).not.toContain("/__sw-large");
  });

  test("an update removes only obsolete dc-sw caches", async ({ page }) => {
    await writeFile(
      path.join(publicDir, "sw-upgrade.js"),
      `// Test-only worker update.\n${await readFile(path.join(publicDir, "sw.js"), "utf8")}`,
    );
    await page.goto("/");
    await waitForWorker(page);
    await page.evaluate(async () => {
      await caches.open("dc-sw:precache:v0");
      await caches.open("dc-sw:documents:v0");
      await caches.open("foreign-sentinel-cache");
      await navigator.serviceWorker.register("/sw-upgrade.js", { scope: "/" });
    });
    await waitForWorker(page, "/sw-upgrade.js");

    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(
        expect.arrayContaining([
          PRECACHE_NAME,
          "foreign-sentinel-cache",
        ]),
      );
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .not.toContain("dc-sw:precache:v0");
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .not.toContain("dc-sw:documents:v0");
  });

  test("a broken install leaves the current worker active", async ({ page }) => {
    const currentSource = await readFile(path.join(publicDir, "sw.js"), "utf8");
    const brokenSource = currentSource.replace(
      'const OFFLINE_URL = "/offline";',
      'const OFFLINE_URL = "/__missing-offline";',
    );
    expect(brokenSource).not.toBe(currentSource);
    await writeFile(path.join(publicDir, "sw-broken.js"), brokenSource);

    await page.goto("/");
    await waitForWorker(page);
    const result = await page.evaluate(async () => {
      const current = await navigator.serviceWorker.getRegistration("/");
      const currentScript = current?.active?.scriptURL;
      let failed = false;
      let brokenActive = false;
      let brokenRegistration: ServiceWorkerRegistration | undefined;
      try {
        brokenRegistration = await navigator.serviceWorker.register("/sw-broken.js", {
          scope: "/__sw-broken__/",
        });
        const candidate = brokenRegistration.installing || brokenRegistration.waiting;
        if (candidate && candidate.state !== "redundant") {
          await new Promise<void>((resolve) => {
            candidate.addEventListener("statechange", () => {
              if (candidate.state === "redundant" || candidate.state === "activated") {
                resolve();
              }
            });
          });
        }
        failed = candidate?.state === "redundant";
        brokenActive = Boolean(brokenRegistration.active);
      } catch {
        failed = true;
      }
      await brokenRegistration?.unregister();
      const after = await navigator.serviceWorker.getRegistration("/");
      return {
        failed,
        brokenActive,
        currentScript,
        currentAfter: after?.active?.scriptURL,
      };
    });

    expect(result.failed).toBe(true);
    expect(result.brokenActive).toBe(false);
    expect(result.currentAfter).toBe(result.currentScript);
  });

  test("the site registration replaces a legacy worker on the same scope", async ({ page }) => {
    await writeFile(
      path.join(publicDir, "sw-legacy.js"),
      'self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));\n' +
        'self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));\n',
    );
    await page.route("**/js/sw-register.*.js", (route) => route.abort());
    await page.goto("/");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/sw-legacy.js", {
        scope: "/",
      });
      const worker = registration.installing || registration.waiting || registration.active;
      if (worker && worker.state !== "activated") {
        await new Promise<void>((resolve) => {
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
          });
        });
      }
    });
    await waitForWorker(page, "/sw-legacy.js");

    await page.unroute("**/js/sw-register.*.js");
    await page.reload();
    await waitForWorker(page);
  });

  test("unregistering and removing registration leaves the site usable", async ({ page, context }) => {
    await page.goto("/");
    await waitForWorker(page);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration || !(await registration.unregister())) {
        throw new Error("failed to unregister current worker");
      }
    });

    await context.route("**/js/sw-register.*.js", (route) => route.abort());
    await page.close();
    const cleanPage = await context.newPage();
    const response = await cleanPage.goto("/");
    expect(response?.status()).toBe(200);
    await expect(cleanPage.locator("main")).toBeVisible();
    expect(
      await cleanPage.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0);
  });
});
