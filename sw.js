/* Corta Vida — Service Worker (caché de assets estáticos)
   Estrategia:
   - HTML / navegación .......... network-first (siempre lo más nuevo, offline como respaldo)
   - Imágenes / videos / fuentes  cache-first (instantáneo en visitas repetidas)
   - Google Fonts .............. stale-while-revalidate
   Sube el número de versión (v#) para invalidar la caché tras un deploy. */
const VERSION = 'cv-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE   = `${VERSION}-pages`;
const FONT_CACHE   = `${VERSION}-fonts`;

const ASSET_RE = /\.(?:webp|jpg|jpeg|png|gif|svg|mp4|webm|woff2?|ttf|otf|css|js|pdf|ico)$/i;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  // Documentos HTML / navegación → network-first
  if (req.mode === 'navigate' || (isSameOrigin && req.destination === 'document')) {
    event.respondWith(networkFirst(req, PAGE_CACHE));
    return;
  }

  // Google Fonts → stale-while-revalidate
  if (isGoogleFonts) {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // Assets estáticos del propio sitio → cache-first
  if (isSameOrigin && ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    return cached || cache.match('index.html') || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}
