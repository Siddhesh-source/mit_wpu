// CampusSign service worker: makes the app shell (and so the gate check) load with no network.
// API calls are never cached here; the gate keeps its signed revocation list and issuer key in local storage.
const CACHE = 'plc-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
const FONTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) caches.open(CACHE).then((c) => c.put(req, res));
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.startsWith('/api/')) return;
  if (!same && !FONTS.includes(url.hostname)) return;

  // Pages: network first (fresh app), fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => (put('/', res.clone()), res))
        .catch(() => caches.match('/')),
    );
    return;
  }
  // Hashed assets and fonts: cache first.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => (put(req, res.clone()), res))));
});
