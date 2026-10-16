const CACHE_NAME = 'aerosky-v10';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/moon.webp',
  './css/style.css',
  './js/constants.js',
  './js/weather.js',
  './js/charts.js',
  './js/particles.js',
  './js/favorites.js',
  './js/radar.js',
  './js/sky.js',
  './js/ui.js',
  './js/app.js'
];

// Bibliotecas e fontes externas que podem ser cacheadas (todas com versão fixa)
const CACHEABLE_HOSTS = [
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Instalação: Cacheia os ativos estáticos essenciais (ignorando o cache HTTP do navegador)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache
        .addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
        .catch((err) => console.warn('Falha parcial ao pré-cachear ativos:', err))
    )
  );
  self.skipWaiting();
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Navegação: rede primeiro (para receber atualizações), com fallback offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(request, response))
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || Response.error())
    );
    return;
  }

  // Só cacheia ativos do próprio app e das CDNs conhecidas. APIs de clima,
  // geocodificação e tiles de mapa/radar ficam fora (dados em tempo real e cache sem limite).
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  // Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() => cachedResponse || Response.error());
      return cachedResponse || fetchPromise;
    })
  );
});

// Clique na notificação: foca o app aberto ou abre uma nova janela
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
