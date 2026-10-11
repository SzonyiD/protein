// Offline cache. Új kiadásnál a VERSION-t kell emelni.
const VERSION = 'protein-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'calc.js',
  'db.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'fonts/unbounded-latin-wght-normal.woff2',
  'fonts/unbounded-latin-ext-wght-normal.woff2',
  'fonts/dm-sans-latin-wght-normal.woff2',
  'fonts/dm-sans-latin-ext-wght-normal.woff2',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Saját fájlok azonnal a cache-ből, közben a háttérben frissülnek (a következő indításkor élnek).
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  ev.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
