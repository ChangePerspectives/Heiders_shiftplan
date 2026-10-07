// Bei jeder Veröffentlichung CACHE_VERSION ändern (oder dieses Paket vollständig ersetzen).
const CACHE_VERSION = 'v4-4-planning-capacity-20261007';
const PREFIX = 'heiders-app-';
const CACHE = PREFIX + CACHE_VERSION;
const SHELL = ["./", "./index.html", "./cloud.js", "./config.js", "./supabase.js", "./design.css", "./design.js", "./demo.js", "./manifest.webmanifest", "./icon-192-v2.png", "./icon-512-v2.png", "./icon-maskable-512-v2.png", "./apple-touch-icon-v2.png", "./jspdf.js", "./pdf-font.js", "./pdf-export.js"];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Frische Dateien auch bei vorhandenen HTTP-Caches laden.
    for (const path of SHELL) {
      const response = await fetch(new Request(new URL(path, self.registration.scope), {cache: 'reload'}));
      if (!response.ok) throw new Error('App-Datei nicht verfügbar: ' + path);
      await cache.put(new URL(path, self.registration.scope), response);
    }

  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  const own = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  if (!own) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request, {ignoreSearch: false});
    if (hit) return hit;
    try {
      const response = await fetch(event.request);
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') return (await cache.match(new URL('./index.html', self.registration.scope))) || Response.error();
      throw error;
    }
  })());
});
