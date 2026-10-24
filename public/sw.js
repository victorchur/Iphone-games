/* Мини-игры - service worker меню на корне сайта.
 * Он обслуживает только файлы меню. У каждой игры свой воркер в её папке,
 * поэтому запросы к играм здесь не перехватываются. */
const CACHE_PREFIX = 'hub-';
const CACHE_NAME = CACHE_PREFIX + 'v3';
const LEGACY_CACHES = ['neon-runner-v1']; // кэш старой версии, когда Neon Runner жил на корне
const ASSETS = [
  './',
  './index.html',
  './hub.css',
  './manifest.json',
  './icons/hub-192.png',
  './icons/hub-512.png',
  './icons/hub-512-maskable.png',
  './icons/hub-apple-touch-icon.png',
  './louis-walk/icons/icon-192.png',
  './louis/icons/icon-192.png',
  './neon-runner/icons/icon-192.png'
];
const OWN = new Set(ASSETS.map((a) => new URL(a, self.registration.scope).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) || LEGACY_CACHES.includes(k))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !OWN.has(url.pathname)) return; // игры обслуживают себя сами

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
