import { test as base, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const article = "/library/bluredu-new-teachers";

type CopyFixture = {
  article: string;
  serve: (context: BrowserContext, responses?: boolean) => Promise<void>;
};

// Worker-scoped and opt-in: unrelated tests in these specs do not build it.
// Both variants use the real publication renderer and component registration.
export const test = base.extend<{}, { copyFixture: CopyFixture }>({
  copyFixture: [async ({}, use) => {
    const root = mkdtempSync(join(tmpdir(), "copy-responses-"));
    try {
      const data = join(root, "data");
      cpSync("data", data, { recursive: true });
      const materialId = readFileSync(`content${article}.md`, "utf8")
        .match(/^id: "([^"]+)"$/m)?.[1];
      if (!materialId) throw new Error("Copy fixture article must have a material ID");
      for (const responses of [false, true]) {
        writeFileSync(join(data, "webmentions.json"), JSON.stringify({
          contract: 2,
          updated: "2026-10-26",
          mentions: responses ? [{
            id: "copy-browser-fixture",
            type: "mention",
            targetReceived: `https://alexandr-sidorenko.me${article}`,
            source: "https://example.org/copy-fixture",
            author_name: "Copy fixture",
            author_url: "",
            published: "2026-10-26T00:00:00Z",
            content_text: "",
            target: { materialId, selector: { type: "document" } },
          }] : [],
        }));
        execFileSync("hugo", ["build", "--environment", "preview", "--panicOnWarning", "--noBuildLock",
          "--destination", join(root, String(responses)), "--cacheDir", join(root, "cache")],
        { stdio: "pipe", env: { ...process.env,
          HUGO_DATADIR: data, HUGO_RESOURCEDIR: join(root, "resources") } });
      }
      await use({
        article,
        async serve(context, responses = true) {
          const output = join(root, String(responses));
          await context.route(url => url.pathname === article || url.pathname === `${article}/`,
            route => route.fulfill({ contentType: "text/html; charset=utf-8",
              path: join(output, article, "index.html") }));
          // The normal preview has no responses and may not emit this asset.
          await context.route(/\/js\/dc-copy\.min\.[a-f0-9]+\.js$/, route =>
            route.fulfill({ path: join(output, new URL(route.request().url()).pathname) }));
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, { scope: "worker" }],
});
