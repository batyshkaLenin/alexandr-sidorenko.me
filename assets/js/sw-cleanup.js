// The site runs without a Service Worker. Remove any registration this origin
// still carries, plus the caches the retired offline layer left behind.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if (!("caches" in window)) return;
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("dc-sw:")).map((name) => caches.delete(name)),
      );
    } catch {
      // Cleanup is best-effort; it must never affect the page.
    }
  });
}
