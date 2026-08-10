/* Bilan├ğo Analiz ÔÇö PWA service worker
   Statik kabu─şu ├Ânbelle─şe al─▒r; API k├Âpr├╝leri (/price, /bist, /secÔÇĞ) her zaman a─şdan gelir. */
const CACHE = 'bilanco-shell-v161';
const SHELL = [
  '/',
  '/bilanco-analiz.html',
  '/app.js',
  '/i18n.js',
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

  // API / köprü istekleri: her zaman ağ (asla HTML kabuğuna düşmesin)
  const isApi = /^\/(sec|secw|secfilings|bist|bistown|bistfloat|bistakd|bistakdimg|price|quotes|news|tr|trcal|tefas|targets|tvt|econ|investcal|ifrs|yfin|yfsearch|yscr|yqs|ycal|ynews|stocktwits|tvlive|invforum|invopen)(\/|\?|$)/.test(url.pathname);
  if (isApi) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // Kabuk: ├Ânce a─ş (g├╝ncel HTML/JS), yoksa ├Ânbellek
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
