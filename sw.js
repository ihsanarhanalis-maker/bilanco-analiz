/* Bilanço Analiz — PWA service worker
   Statik kabuğu önbelleğe alır; API köprüleri (/price, /bist, /sec…) her zaman ağdan gelir. */
const CACHE = 'bilanco-shell-v25';
const SHELL = [
  '/',
  '/bilanco-analiz.html',
  '/app.js',
  '/cik-map.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API / köprü istekleri: ağa öncelik, önbelleğe alma
  const isApi = /^\/(sec|secw|bist|bistown|price|news|tr|targets|tvt|econ|investcal|ifrs|yfin|yfsearch)(\/|\?|$)/.test(url.pathname);
  if (isApi) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // Kabuk: önce ağ (güncel HTML/JS), yoksa önbellek
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(cached =>
      cached || caches.match('/bilanco-analiz.html')
    ))
  );
});
