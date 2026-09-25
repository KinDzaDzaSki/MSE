/* MSE Berza — service worker (dashboard PWA).
 *
 * Strategy — data must never be stale:
 *   navigations      network-first → cached copy → /offline.html
 *   /api/favicon/*   cache-first (immutable, ?v=-busted) so logos work offline
 *   other /api/*     network-only — live quotes are NEVER served from cache
 *   static assets    stale-while-revalidate
 * Third-party requests (Google Fonts, CDN, analytics) are left to the network.
 *
 * Bump CACHE_VERSION on any change so `activate` purges the old caches.
 */
const CACHE_VERSION = 'mse-berza-v2';
const PRECACHE = CACHE_VERSION + '-precache';
const RUNTIME = CACHE_VERSION + '-runtime';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party → default network

  // Live-data API: never cache (favicons are immutable, so cache those).
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/favicon/')) event.respondWith(cacheFirst(req));
    return;
  }

  // Page navigations: fresh HTML when online, cached/offline page otherwise.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  // Same-origin static assets.
  if (STATIC_DESTINATIONS.has(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function networkFirstNavigation(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await network) || new Response('', { status: 504, statusText: 'offline' });
}

// ---- Web Push: daily movers + watchlist notifications ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'MSE Berza';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-512.png',
    badge: '/favicon-192.png',
    tag: data.tag || 'mse-movers',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
