// Service worker van Spellenkast: slaat alle bestanden lokaal op zodat de app offline start.
// De lijst hieronder wordt bijgewerkt door `node tools/build-sw.mjs` (draai dat na elke wijziging).

// <<PRECACHE>>
const VERSION = 'be2f8c4c3999';
const ASSETS = [
  "./",
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./index.html",
  "./js/app.js",
  "./js/core/gamestore.js",
  "./js/core/settings.js",
  "./js/core/sound.js",
  "./js/core/storage.js",
  "./js/core/ui.js",
  "./js/core/util.js",
  "./js/games/blokval/game.js",
  "./js/games/blokval/logic.js",
  "./js/games/g2048/game.js",
  "./js/games/g2048/logic.js",
  "./js/games/klondike/game.js",
  "./js/games/klondike/logic.js",
  "./js/games/registry.js",
  "./js/games/woordzoeker/game.js",
  "./js/games/woordzoeker/logic.js",
  "./js/games/woordzoeker/words.js",
  "./manifest.webmanifest"
];
// <</PRECACHE>>

const CACHE = 'spellenkast-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' omzeilt de HTTP-cache, zodat we echt de nieuwe versie bewaren.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    // Bij de allereerste installatie meteen actief worden; bij updates wachten op de gebruiker.
    if (!(await hasOtherVersion())) await self.skipWaiting();
  })());
});

async function hasOtherVersion() {
  const keys = await caches.keys();
  return keys.some((k) => k.startsWith('spellenkast-') && k !== CACHE);
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('spellenkast-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'activeer') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navigaties (de app openen, ook met #/spel) altijd vanuit index.html.
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html') || await cache.match('./');
      if (page) return page;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return new Response('Offline en niet in de cache: ' + url.pathname, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
