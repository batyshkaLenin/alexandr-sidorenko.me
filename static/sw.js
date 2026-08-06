// Cleanup worker: unregisters any previously installed service worker for
// this origin, for visitors who still have one. This site ships no service
// worker of its own and does not use the Cache Storage API, so this worker
// never touches caches.keys()/caches.delete() — it can't guess which cache
// entries still belong to some other origin feature, so it leaves Cache
// Storage alone entirely and only removes its own registration.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration
      .unregister()
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});
