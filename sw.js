/* Bilan├ğo Analiz ÔÇö PWA service worker
   Statik kabu─şu ├Ânbelle─şe al─▒r; API k├Âpr├╝leri (/price, /bist, /secÔÇĞ) her zaman a─şdan gelir. */
const CACHE = 'bilanco-shell-v189';
const SHELL = [
  '/',
  '/bilanco-analiz.html',
  '/apple-design.css',
  '/app.js',
  '/i18n.js',
  '/cik-map.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/notification-badge-96.png',
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
  const isApi = /^\/(api\/notifications|ai|sec|secw|secfilings|bist|bistown|bistfloat|bistakd|bistakdimg|price|quotes|news|tr|trcal|tefas|targets|tvt|econ|investcal|ifrs|yfin|yfsearch|yscr|yqs|ycal|ynews|stocktwits|tvlive|invforum|invopen|private-company)(\/|\?|$)/.test(url.pathname);
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

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_e) {
    payload = { title: 'Bilanço Analiz', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Bilanço Analiz';
  const options = {
    body: payload.body || 'İzleme listenizde yeni bir gelişme var.',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/notification-badge-96.png',
    tag: payload.tag || 'bilanco-update',
    renotify: true,
    silent: false,
    timestamp: Number(payload.timestamp) || Date.now(),
    vibrate: [160, 80, 160],
    data: { url: payload.url || '/', symbol: payload.symbol, market: payload.market, eventType: payload.eventType },
    actions: [{ action: 'open', title: 'Detayı görüntüle' }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.navigate(target).then(() => client.focus());
        }
      }
      return clients.openWindow(target);
    })
  );
});
