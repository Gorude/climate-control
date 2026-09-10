const CACHE_NAME = 'aerosky-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/style.css',
  './js/constants.js',
  './js/weather.js',
  './js/charts.js',
  './js/particles.js',
  './js/favorites.js',
  './js/ui.js',
  './js/app.js'
];

// Instalação: Cacheia os ativos estáticos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Falha parcial ao pré-cachear ativos:', err);
      });
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

// Interceptação de Fetch: Estratégia Stale-While-Revalidate com Fallback Offline
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET ou de esquemas não suportados (ex: extensões)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Ignora requisições de dados em tempo real (APIs externas de clima e geocodificação)
  if (
    event.request.url.includes('api.open-meteo.com') ||
    event.request.url.includes('nominatim.openstreetmap.org') ||
    event.request.url.includes('api.rainviewer.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Em falha de rede para navegação de páginas, fallback para a tela principal offline
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
          return null;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
