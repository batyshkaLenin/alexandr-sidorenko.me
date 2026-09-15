// Offline continuity for visited documents and their stylesheets.
// Worker logic version: 2.
// Cache schema versions move independently from the worker logic.
const CACHE_PREFIX = "dc-sw:";
const PRECACHE_NAME = `${CACHE_PREFIX}precache:v1`;
const DOCUMENTS_CACHE_NAME = `${CACHE_PREFIX}documents:v1`;
const STYLES_CACHE_NAME = `${CACHE_PREFIX}styles:v1`;
const OFFLINE_URL = "/offline";
const CACHED_AT_HEADER = "X-DC-SW-Cached-At";
const STYLES_HEADER = "X-DC-SW-Styles";

const MAX_OFFLINE_BYTES = 32 * 1024;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_STYLE_BYTES = 256 * 1024;
const MAX_DOCUMENTS = 12;
const DOCUMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isHtml(response) {
  return (response.headers.get("content-type") || "")
    .toLowerCase()
    .startsWith("text/html");
}

function isOfflineDocument(response) {
  const path = new URL(response.url).pathname;
  return (
    response.ok &&
    isHtml(response) &&
    (path === OFFLINE_URL || path === `${OFFLINE_URL}/`)
  );
}

async function installOfflineDocument() {
  const response = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
  // Production serves /offline directly. Hugo's live server 301s to /offline/;
  // that trailing slash is the same document.
  if (!isOfflineDocument(response)) {
    throw new Error("The offline document is unavailable.");
  }

  const body = await response.clone().arrayBuffer();
  if (body.byteLength > MAX_OFFLINE_BYTES) {
    throw new Error("The offline document exceeds its 32 KiB budget.");
  }

  const cache = await caches.open(PRECACHE_NAME);
  await cache.put(OFFLINE_URL, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    installOfflineDocument().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const currentCaches = new Set([
        PRECACHE_NAME,
        DOCUMENTS_CACHE_NAME,
        STYLES_CACHE_NAME,
      ]);
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && !currentCaches.has(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheableDocument(request, response) {
  const url = new URL(request.url);
  return (
    response.status === 200 &&
    !response.redirected &&
    isHtml(response) &&
    url.search === "" &&
    url.pathname !== OFFLINE_URL
  );
}

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

// Same-origin stylesheets the document links to, as absolute URLs.
function stylesheetUrls(html, base) {
  const urls = new Set();
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attribute(tag, "rel") || "").toLowerCase().split(/\s+/);
    const href = attribute(tag, "href");
    if (!href || !rel.includes("stylesheet")) {
      continue;
    }
    const url = new URL(href, base);
    if (url.origin === self.location.origin) {
      urls.add(url.href);
    }
  }
  return [...urls];
}

// `arrayBuffer()` is decoded by Fetch. Do not retain transport headers that
// would make a reconstructed response look compressed or keep a stale size.
function storedResponse(response, body, headers) {
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheStyles(urls) {
  const cache = await caches.open(STYLES_CACHE_NAME);
  await Promise.all(
    urls.map(async (href) => {
      // A stylesheet URL carries the digest of its contents, so a stored copy
      // never goes stale.
      if (await cache.match(href)) {
        return;
      }
      const response = await fetch(href);
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (response.status !== 200 || !type.startsWith("text/css")) {
        return;
      }
      const body = await response.clone().arrayBuffer();
      if (body.byteLength > MAX_STYLE_BYTES) {
        return;
      }
      await cache.put(
        href,
        storedResponse(response, body, new Headers(response.headers)),
      );
    }),
  );
}

// Keep only stylesheets that a cached document still links to.
async function pruneStyles() {
  const documents = await caches.open(DOCUMENTS_CACHE_NAME);
  const referenced = new Set();
  for (const request of await documents.keys()) {
    const response = await documents.match(request);
    for (const href of (response?.headers.get(STYLES_HEADER) || "").split(" ")) {
      if (href) {
        referenced.add(href);
      }
    }
  }

  const styles = await caches.open(STYLES_CACHE_NAME);
  const keys = await styles.keys();
  await Promise.all(
    keys
      .filter((request) => !referenced.has(request.url))
      .map((request) => styles.delete(request)),
  );
}

async function cacheDocument(request, response) {
  const body = await response.clone().arrayBuffer();
  if (body.byteLength > MAX_DOCUMENT_BYTES) {
    return;
  }

  const styles = stylesheetUrls(new TextDecoder().decode(body), request.url);
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  headers.set(STYLES_HEADER, styles.join(" "));
  const cachedResponse = storedResponse(response, body, headers);

  const cache = await caches.open(DOCUMENTS_CACHE_NAME);
  // Reinsert an existing URL so Cache.keys() keeps least-recently-written
  // entries first. This makes a successful put the newest document.
  await cache.delete(request);
  await cache.put(request, cachedResponse);

  const keys = await cache.keys();
  const overflow = keys.length - MAX_DOCUMENTS;
  if (overflow > 0) {
    await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
  }

  await cacheStyles(styles).catch(() => {});
  await pruneStyles();
}

async function deleteCachedDocument(request) {
  const cache = await caches.open(DOCUMENTS_CACHE_NAME);
  await cache.delete(request);
  await pruneStyles();
}

async function cachedDocument(request) {
  const cache = await caches.open(DOCUMENTS_CACHE_NAME);
  const response = await cache.match(request);
  if (!response) {
    return null;
  }

  const cachedAt = Date.parse(response.headers.get(CACHED_AT_HEADER) || "");
  const age = Date.now() - cachedAt;
  if (!Number.isFinite(cachedAt) || age < 0 || age > DOCUMENT_TTL_MS) {
    await cache.delete(request);
    await pruneStyles().catch(() => {});
    return null;
  }

  return response;
}

async function offlineDocument() {
  try {
    const cache = await caches.open(PRECACHE_NAME);
    const response = await cache.match(OFFLINE_URL);
    if (response) {
      return response;
    }
  } catch {
    // Cache Storage is best-effort. Try the network below.
  }

  try {
    return await fetch(OFFLINE_URL);
  } catch {
    return Response.error();
  }
}

async function navigate(request) {
  try {
    const response = await fetch(request);

    if (response.status === 404 || response.status === 410) {
      return {
        response,
        completion: deleteCachedDocument(request).catch(() => {}),
      };
    }

    if (response.status >= 500) {
      return { response, completion: Promise.resolve() };
    }

    if (isCacheableDocument(request, response)) {
      return {
        response,
        completion: cacheDocument(request, response).catch(() => {}),
      };
    }

    // Redirects keep their network semantics and are never cached under the
    // URL that led to them.
    return { response, completion: Promise.resolve() };
  } catch {
    try {
      const response = await cachedDocument(request);
      if (response) {
        return { response, completion: Promise.resolve() };
      }
    } catch {
      // Cache Storage is best-effort; continue to the system fallback.
    }

    return {
      response: await offlineDocument(),
      completion: Promise.resolve(),
    };
  }
}

// The network answers first; a stored copy only stands in when it fails.
async function stylesheet(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(STYLES_CACHE_NAME).catch(() => null);
    const response = cache && (await cache.match(request.url));
    if (response) {
      return response;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.destination === "style") {
    event.respondWith(stylesheet(request));
    return;
  }

  if (request.mode !== "navigate") {
    return;
  }

  const operation = navigate(request);
  event.respondWith(operation.then(({ response }) => response));
  event.waitUntil(operation.then(({ completion }) => completion));
});
