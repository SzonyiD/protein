// Offline cache. Új kiadásnál a VERSION-t kell emelni.
const VERSION = 'protein-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'calc.js',
  'db.js',
  'foods.js',
  'stats.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'unbounded-latin-wght-normal.woff2',
  'unbounded-latin-ext-wght-normal.woff2',
  'dm-sans-latin-wght-normal.woff2',
  'dm-sans-latin-ext-wght-normal.woff2',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
