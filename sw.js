// Offline support: cache the app and lessons.
const CACHE = 'icyongereza-v2';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'icon.svg', 'manifest.webmanifest',
  'lessons/index.json', 'lessons/sounds.json',
  'lessons/week-01.json', 'lessons/week-02.json', 'lessons/week-03.json', 'lessons/week-04.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Network first, so updates show up straight away; the cache is the offline fallback.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
