// Temario (móvil): la interfaz funciona sin conexión; los datos se sincronizan al volver la red.
const CACHE = 'temario-mvbn12fh';
const SHELL = ['./', 'index.html', 'web.js', 'icons.js', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase va siempre por red
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => (res.ok && caches.open(CACHE).then((c) => c.put(e.request, res.clone())), res)).catch(() => hit);
      return hit || net;
    })
  );
});
