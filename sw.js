/* CIN service worker: keeps the app opening when the signal is weak. Code is network-first, so updates arrive right away. */
const CACHE = 'cin-shell-v2';
const SHELL = ['./', 'index.html', 'logo.png', 'logo-clear.png', 'icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  // only the app's own files and the Firebase code library; never videos, photos, music or database calls
  const ok = u.origin === self.location.origin || u.hostname === 'www.gstatic.com';
  if (!ok) return;
  e.respondWith(fetch(r).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}); } return res; })
    .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
