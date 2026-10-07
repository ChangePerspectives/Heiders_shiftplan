// Bei jeder Veröffentlichung CACHE_VERSION ändern (oder dieses Paket vollständig ersetzen).
const CACHE_VERSION = 'cloud-e9af9fb3b781';
const PREFIX = 'heiders-app-';
const CACHE = PREFIX + CACHE_VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './config.js', './supabase.js', './cloud.js'];
const TAILWIND = 'https://cdn.tailwindcss.com/';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Frische Dateien auch bei vorhandenen HTTP-Caches laden.
    for (const path of SHELL) {
      const response = await fetch(new Request(new URL(path, self.registration.scope), {cache: 'reload'}));
      if (!response.ok) throw new Error('App-Datei nicht verfügbar: ' + path);
      await cache.put(new URL(path, self.registration.scope), response);
    }
    try {
      const response = await fetch(TAILWIND, {mode: 'no-cors', cache: 'reload'});
      await cache.put(TAILWIND, response);
    } catch (_) { /* Installation bleibt möglich; Design benötigt zunächst Internet. */ }
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
  const tailwind = url.origin === 'https://cdn.tailwindcss.com';
  if (!own && !tailwind) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request, {ignoreSearch: false});
    if (hit) return hit;
    try {
      const response = await fetch(event.request);
      if (tailwind && (response.ok || response.type === 'opaque')) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') return (await cache.match(new URL('./index.html', self.registration.scope))) || Response.error();
      throw error;
    }
  })());
});
