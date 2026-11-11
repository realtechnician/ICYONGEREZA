// Offline support: cache the app and lessons, refresh them in the background.
const CACHE = 'icyongereza-v1';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'icon.svg', 'manifest.webmanifest',
  'lessons/index.json', 'lessons/sounds.json',
  'lessons/week-01.json', 'lessons/week-02.json', 'lessons/week-03.json', 'lessons/week-04.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
