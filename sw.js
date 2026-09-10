const CACHE_NAME = 'news-minimal-v1';

// ✅ Quitamos los iconos de esta lista temporalmente para que no falle la instalación
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  
  // Las noticias SIEMPRE van a la red primero (Network First)
  if (request.url.includes('workers.dev')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Solo guardamos en caché si la respuesta es exitosa
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request)) // Fallback a caché si no hay red
    );
    return;
  }
  
  // Resto de assets: Cache First
  event.respondWith(
    caches.match(request).then(res => res || fetch(request))
  );
});
