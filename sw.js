const CACHE_NAME = 'clima-navirai-v1';
const ASSETS = [
  './Clima.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instalação: Cacheia os ativos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de Fetch: Estratégia Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  // Ignora requisições de APIs externas (como a Open-Meteo) para garantir dados frescos
  if (event.request.url.includes('api.open-meteo.com') || event.request.url.includes('nominatim.openstreetmap.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      });
      return response || fetchPromise;
    })
  );
});
