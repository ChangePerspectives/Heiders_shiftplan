// Bei jeder Veröffentlichung CACHE_VERSION ändern (oder dieses Paket vollständig ersetzen).
const CACHE_VERSION = 'v4-11-1-button-wochenwahl-20261008';
const PREFIX = 'heiders-app-';
const CACHE = PREFIX + CACHE_VERSION;
const SHELL = ["./", "./index.html", "./cloud.js", "./auth.js", "./push.js", "./push-config.js", "./config.js", "./supabase.js", "./design.css", "./design.js", "./demo.js", "./manifest-v4-10.webmanifest", "./icon-192-v4-10.png", "./icon-512-v4-10.png", "./icon-maskable-512-v4-10.png", "./apple-touch-icon-v4-10.png", "./jspdf.js", "./pdf-font.js", "./pdf-export.js"];
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

self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch(_){}
  // Keine personenbezogenen Inhalte auf dem Sperrbildschirm anzeigen.
  if(data?.type!=='heiders-unread')return;
  await self.registration.showNotification('Heiders Dienstplan',{body:'Neue Nachrichten oder Schichtanfragen. Bitte in der App ansehen.',tag:'heiders-unread',icon:new URL('./icon-192-v4-10.png',self.registration.scope).href,data:{type:'heiders-unread'}});
  try{if(self.navigator.setAppBadge)await self.navigator.setAppBadge();}catch(_){}
 })());
});
self.addEventListener('notificationclick',event=>{
 if(event.notification.data?.type!=='heiders-unread')return;
 event.notification.close();event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.startsWith(self.registration.scope));
  if(existing){await existing.focus();existing.postMessage({type:'OPEN_HEIDERS_INBOX'});}
  else await self.clients.openWindow(new URL('./?inbox=1',self.registration.scope).href);
 })());
});
