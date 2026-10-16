/**
 * AeroSky Weather - Ponto de Entrada Principal da Aplicação (App Entrypoint)
 * Gerencia ciclo de vida, estado global, geolocalização não-bloqueante, busca de cidades,
 * requisições à API Open-Meteo, atalhos de teclado e inicialização dos subsistemas.
 */

// --- ESTADO GLOBAL DA APLICAÇÃO ---
const LOCATION_STORAGE_KEY = 'aerosky_location';

let LAT = CONFIG.CITY.lat;
let LON = CONFIG.CITY.lon;
let currentCityName = CONFIG.CITY.name;
let locationSource = 'default'; // 'default' | 'manual' | 'gps'
let locationVersion = 0; // incrementado a cada troca de local (descarta respostas antigas)
let globalWeatherData = null;
let globalWeatherLocation = null; // { lat, lon } a que globalWeatherData pertence
let lastFetchTime = 0;
let fetchSeq = 0;
let currentForecastTab = '24h';
let selectedDayIndex = 0; // 0 = próximas 24h a partir do momento atual
let notificationsEnabled = false;
let searchDebounceTimer = null;
let searchAbortController = null;
let searchActiveIndex = -1;

try {
  notificationsEnabled = localStorage.getItem('notif_enabled') === 'true';
} catch (e) {
  /* armazenamento indisponível */
}

// --- PERSISTÊNCIA DA ÚLTIMA LOCALIZAÇÃO ---
function loadSavedLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY));
    if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number' && saved.name) {
      return saved;
    }
  } catch (e) {
    /* ignora dados corrompidos */
  }
  return null;
}

function saveLocation() {
  try {
    localStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify({ lat: LAT, lon: LON, name: currentCityName, source: locationSource })
    );
  } catch (e) {
    /* armazenamento indisponível */
  }
}

function updateLocationLabels() {
  const cityEl = document.getElementById('city-name');
  if (cityEl) cityEl.innerText = currentCityName;
  document.title = `AeroSky - ${currentCityName}`;

  if (typeof FavoritesManager !== 'undefined') {
    FavoritesManager.updateFavoriteStar();
    FavoritesManager.highlightActiveChip();
  }
}

// --- DEFINIÇÃO E TROCA DE LOCALIZAÇÃO CENTRALIZADA ---
window.setLocation = function (lat, lon, name, source = 'manual') {
  LAT = lat;
  LON = lon;
  currentCityName = name;
  locationSource = source;
  locationVersion++;
  CONFIG.CITY = { name, lat, lon };

  saveLocation();
  updateLocationLabels();

  // Exibe imediatamente a previsão em cache (se houver) enquanto busca dados novos
  const cached = WeatherService.loadCachedForecast(lat, lon);
  if (cached) {
    globalWeatherData = cached.data;
    globalWeatherLocation = { lat, lon };
    populateUI();
  } else {
    showLoader(`Conectando satélites para ${name}...`);
  }

  fetchData();
};

window.selectCity = function (lat, lon, name) {
  closeSearch();
  setLocation(lat, lon, name, 'manual');
};

/**
 * Troca para coordenadas sem nome conhecido (GPS ou ponto escolhido no radar):
 * exibe um nome provisório e resolve o nome real da cidade em segundo plano.
 */
window.setLocationFromCoords = async function (lat, lon, placeholder, source) {
  setLocation(lat, lon, placeholder, source);
  const versionAfterSet = locationVersion;

  const resolvedCity = await WeatherService.reverseGeocode(lat, lon);
  if (locationVersion !== versionAfterSet) return;

  currentCityName = resolvedCity;
  CONFIG.CITY = { name: resolvedCity, lat, lon };
  saveLocation();
  updateLocationLabels();
};

// --- AEROSKY: GEOLOCALIZAÇÃO INTELIGENTE (MOBILE-FRIENDLY & NÃO BLOQUEANTE) ---
function performGeolocation(isAutomatic = false) {
  if (!navigator.geolocation) {
    if (!isAutomatic) showToast('Seu navegador não suporta geolocalização.');
    return;
  }

  if (!isAutomatic) showLoader('Detectando sua localização...');

  const versionAtStart = locationVersion;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      // Se o usuário escolheu outra cidade enquanto o GPS respondia, não sobrescreve a escolha
      if (isAutomatic && locationVersion !== versionAtStart) return;

      setLocationFromCoords(
        position.coords.latitude,
        position.coords.longitude,
        'Sua Localização',
        'gps'
      );
    },
    (error) => {
      console.warn('Geolocalização não disponível ou negada:', error.message);
      if (!isAutomatic) {
        hideLoader();
        showToast('Não foi possível acessar sua localização. Verifique as permissões do aparelho.');
      }
    },
    {
      enableHighAccuracy: false, // Evita travar o GPS e economiza bateria em celulares
      timeout: 10000,
      maximumAge: 300000 // 5 minutos de cache
    }
  );
}

window.requestGeolocation = function () {
  closeSearch();
  performGeolocation(false);
};

// --- BUSCA DE LOCALIZAÇÃO (AUTOCOMPLETE OPEN-METEO) ---
function isSearchOpen() {
  const panel = document.getElementById('search-panel');
  return !!panel && !panel.hidden;
}

function openSearch() {
  const panel = document.getElementById('search-panel');
  const display = document.getElementById('location-display');
  const nav = document.querySelector('.top-nav');
  if (!panel || !display) return;
  panel.hidden = false;
  display.hidden = true;
  if (nav) nav.classList.add('search-open');
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.focus();
}

function closeSearch() {
  const panel = document.getElementById('search-panel');
  const display = document.getElementById('location-display');
  const nav = document.querySelector('.top-nav');
  if (!panel || !display || panel.hidden) return;
  panel.hidden = true;
  display.hidden = false;
  if (nav) nav.classList.remove('search-open');

  clearTimeout(searchDebounceTimer);
  if (searchAbortController) searchAbortController.abort();
  hideSearchResults();
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
}

window.toggleSearch = function () {
  if (isSearchOpen()) closeSearch();
  else openSearch();
};

function hideSearchResults() {
  const results = document.getElementById('search-results');
  if (results) {
    results.classList.remove('visible');
    results.innerHTML = '';
  }
  searchActiveIndex = -1;
}

function setActiveSearchResult(index) {
  const items = document.querySelectorAll('#search-results .search-result-item');
  if (items.length === 0) return;
  searchActiveIndex = (index + items.length) % items.length;
  items.forEach((item, i) => {
    const active = i === searchActiveIndex;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) item.scrollIntoView({ block: 'nearest' });
  });
}

function selectSearchResultItem(item) {
  if (!item) return;
  selectCity(parseFloat(item.dataset.lat), parseFloat(item.dataset.lon), item.dataset.name);
}

async function searchCity(query) {
  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();
  const container = document.getElementById('search-results');
  if (!container) return;

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query
      )}&count=6&language=pt&format=json`,
      { signal: searchAbortController.signal }
    );
    if (!res.ok) throw new Error('Status ' + res.status);
    const data = await res.json();
    if (!isSearchOpen()) return;

    searchActiveIndex = -1;
    if (!data.results || data.results.length === 0) {
      container.innerHTML = '<div class="search-no-results">Nenhuma cidade encontrada</div>';
      container.classList.add('visible');
      return;
    }

    container.innerHTML = data.results
      .map((r) => {
        const stateName = r.admin1 || '';
        const uf = BRAZIL_UF[stateName] || stateName;
        const region = escapeHtml([uf, r.country].filter(Boolean).join(', '));
        const fullName = escapeHtml(r.name + (uf ? ' - ' + uf : ''));
        return `<div class="search-result-item" role="option" aria-selected="false" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${fullName}">
                  <div>
                      <div class="result-city">${escapeHtml(r.name)}</div>
                      <div class="result-region">${region}</div>
                  </div>
              </div>`;
      })
      .join('');

    container.classList.add('visible');
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error('Erro na busca:', e);
    if (!isSearchOpen()) return;
    container.innerHTML = '<div class="search-no-results">Erro ao buscar. Verifique sua conexão.</div>';
    container.classList.add('visible');
  }
}

// --- BUSCA DE DADOS METEOROLÓGICOS (API OPEN-METEO) ---
async function fetchData() {
  const seq = ++fetchSeq;
  const lat = LAT;
  const lon = LON;

  try {
    const data = await WeatherService.fetchForecast(lat, lon);
    // Descarta respostas de requisições antigas (ex.: troca rápida de cidade ou GPS)
    if (seq !== fetchSeq) return false;

    globalWeatherData = data;
    globalWeatherLocation = { lat, lon };
    lastFetchTime = Date.now();
    WeatherService.saveCachedForecast(lat, lon, data);

    setApiStatus(true);
    populateUI();
    return true;
  } catch (e) {
    if (seq !== fetchSeq) return false;
    console.error('Erro ao obter dados meteorológicos:', e);
    setApiStatus(false);

    if (globalWeatherData && isSameLocation(globalWeatherLocation, { lat, lon })) {
      // Já há dados desta cidade na tela: não bloqueia a interface, apenas avisa
      hideLoader();
      showToast('Sem conexão com os servidores. Exibindo os últimos dados disponíveis.');
    } else {
      showLoaderError();
    }
    return false;
  }
}

window.retryFetch = function () {
  showLoader('Tentando novamente...');
  fetchData();
};

let isForceUpdating = false;
window.forceUpdate = async function () {
  if (isForceUpdating) return;
  isForceUpdating = true;
  const btn = document.getElementById('btn-refresh');
  if (btn) btn.classList.add('spinning');

  const success = await fetchData();

  if (btn) btn.classList.remove('spinning');
  isForceUpdating = false;
  showToast(success ? 'Dados atualizados' : 'Falha ao atualizar. Verifique sua conexão.');
};

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Restaura a última localização usada
  const saved = loadSavedLocation();
  if (saved) {
    LAT = saved.lat;
    LON = saved.lon;
    currentCityName = saved.name;
    locationSource = saved.source || 'manual';
    CONFIG.CITY = { name: saved.name, lat: saved.lat, lon: saved.lon };
  }

  if (window.lucide) lucide.createIcons();

  // 2. Inicializa subsistemas imediatos
  WeatherParticles.init();
  FavoritesManager.renderFavoritesBar();
  updateLocationLabels();

  updateClock();
  setInterval(updateClock, 1000);

  updateSeason();
  updateNotifBadge();

  // 3. Abre instantaneamente com a previsão em cache e busca dados novos em seguida
  const cached = WeatherService.loadCachedForecast(LAT, LON);
  if (cached) {
    globalWeatherData = cached.data;
    globalWeatherLocation = { lat: LAT, lon: LON };
    lastFetchTime = cached.savedAt;
    populateUI();
  }
  fetchData();

  // 4. Geolocalização automática apenas se o usuário não escolheu uma cidade manualmente
  if (locationSource !== 'manual') {
    performGeolocation(true);
  }

  // 5. Configura campo de busca
  const input = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');

  if (input) {
    input.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const query = e.target.value.trim();
      if (query.length < 2) {
        if (searchAbortController) searchAbortController.abort();
        hideSearchResults();
        return;
      }
      searchDebounceTimer = setTimeout(() => searchCity(query), 400);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSearchResult(searchActiveIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSearchResult(searchActiveIndex - 1);
      } else if (e.key === 'Enter') {
        const items = document.querySelectorAll('#search-results .search-result-item');
        if (items.length > 0) {
          e.preventDefault();
          selectSearchResultItem(items[Math.max(0, searchActiveIndex)]);
        }
      }
    });
  }

  // Delegação de eventos para clique em cidades pesquisadas
  if (resultsContainer) {
    resultsContainer.addEventListener('click', (e) => {
      selectSearchResultItem(e.target.closest('.search-result-item'));
    });
  }

  // Fechamento do painel de busca clicando fora
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('search-panel');
    if (
      isSearchOpen() &&
      !panel.contains(e.target) &&
      !e.target.closest('[data-search-toggle]')
    ) {
      closeSearch();
    }
  });

  // Atalhos de Teclado Globais
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      const wellbeingPanel = document.getElementById('wellbeing-panel');
      if (wellbeingPanel && wellbeingPanel.classList.contains('active')) toggleWellbeing(false);
      const mapOverlay = document.getElementById('map-overlay');
      if (mapOverlay && mapOverlay.classList.contains('active')) toggleWeatherMap(false);
      const moreMenu = document.getElementById('more-menu-panel');
      if (moreMenu && moreMenu.classList.contains('active')) toggleMoreMenu(false);
    } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = document.activeElement;
      const isTyping =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!isTyping) {
        e.preventDefault();
        openSearch();
      }
    }
  });

  // Atualização periódica (pausada com a aba em segundo plano)
  setInterval(() => {
    if (!document.hidden) fetchData();
  }, CONFIG.REFRESH_INTERVAL);

  // Ao voltar para o app (PWA retomado), atualiza se os dados estiverem desatualizados
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastFetchTime > CONFIG.REFRESH_INTERVAL) {
      fetchData();
    }
  });
});

// Redimensionamento debounced garantindo resize dos gráficos e do mapa radar
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    resizeAllCharts();
    RadarMap.invalidate();
  }, 150);
});

// Registro do Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((err) => console.error('Erro ao registrar Service Worker:', err));
  });
}
