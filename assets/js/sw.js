// Cleanup worker: this site has no Service Worker layer any more. Published at
// the stable /sw.js so a client that still holds the previous worker replaces
// it with this one, which removes the retired caches and unregisters itself.
const CACHE_PREFIX = "dc-sw:";

async function removeRetiredCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX))
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await removeRetiredCaches();
      } catch {
        // Cache Storage is best-effort; unregistering still has to happen.
      }
      await self.registration.unregister();
      await self.clients.claim();
    })(),
  );
});
