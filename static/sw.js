// Navigation-only offline continuity. Worker logic version: 1.
// Cache schema versions move independently from the worker logic.
const CACHE_PREFIX = "dc-sw:";
const PRECACHE_NAME = `${CACHE_PREFIX}precache:v1`;
const DOCUMENTS_CACHE_NAME = `${CACHE_PREFIX}documents:v1`;
const OFFLINE_URL = "/offline";
const CACHED_AT_HEADER = "X-DC-SW-Cached-At";

const MAX_OFFLINE_BYTES = 32 * 1024;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_DOCUMENTS = 12;
const DOCUMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isHtml(response) {
  return (response.headers.get("content-type") || "")
    .toLowerCase()
    .startsWith("text/html");
}

async function installOfflineDocument() {
  const response = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
  if (!response.ok || response.redirected || !isHtml(response)) {
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
      const currentCaches = new Set([PRECACHE_NAME, DOCUMENTS_CACHE_NAME]);
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

async function cacheDocument(request, response) {
  const body = await response.clone().arrayBuffer();
  if (body.byteLength > MAX_DOCUMENT_BYTES) {
    return;
  }

  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  // `arrayBuffer()` is decoded by Fetch. Do not retain transport headers that
  // would make a reconstructed response look compressed or keep a stale size.
  headers.delete("content-encoding");
  headers.delete("content-length");

  const cachedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

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
}

async function deleteCachedDocument(request) {
  const cache = await caches.open(DOCUMENTS_CACHE_NAME);
  await cache.delete(request);
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  const operation = navigate(request);
  event.respondWith(operation.then(({ response }) => response));
  event.waitUntil(operation.then(({ completion }) => completion));
});
