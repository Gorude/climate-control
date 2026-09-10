/**
 * AeroSky Weather - Ponto de Entrada Principal da Aplicação (App Entrypoint)
 * Gerencia ciclo de vida, estado global, geolocalização não-bloqueante, busca de cidades,
 * requisições à API Open-Meteo, atalhos de teclado e inicialização dos subsistemas.
 */

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let LAT = -23.065;
let LON = -54.1906;
let currentCityName = 'Naviraí - MS';
let globalWeatherData = null;
let weatherMap = null;
let radarLayer = null;
let currentForecastTab = '24h';
let selectedDayIndex = 0; // 0 = próximas 24h a partir do momento atual
let notificationsEnabled = localStorage.getItem('notif_enabled') === 'true';
let searchDebounceTimer = null;
let searchAbortController = null;

// Sincroniza estado inicial com CONFIG se disponível
if (typeof CONFIG !== 'undefined' && CONFIG.CITY) {
  LAT = CONFIG.CITY.lat;
  LON = CONFIG.CITY.lon;
  currentCityName = CONFIG.CITY.name;
}

// --- AEROSKY: GEOLOCALIZAÇÃO INTELIGENTE (MOBILE-FRIENDLY & NÃO BLOQUEANTE) ---
async function performGeolocation(isAutomatic = false) {
  if (!navigator.geolocation) {
    console.warn('Geolocalização não suportada neste dispositivo.');
    if (!isAutomatic) {
      alert('Seu navegador não suporta geolocalização.');
    }
    return;
  }

  // Se acionado manualmente pelo usuário, mostra feedback
  if (!isAutomatic && typeof showLoader === 'function') {
    showLoader('Detectando sua localização...');
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      // Atualiza coordenadas e dispara a busca de clima imediatamente
      LAT = lat;
      LON = lon;
      fetchData();

      // Resolve o nome da cidade em segundo plano sem travar a interface
      let resolvedCity = '';
      if (typeof WeatherService !== 'undefined' && WeatherService.reverseGeocode) {
        resolvedCity = await WeatherService.reverseGeocode(lat, lon);
      }

      if (resolvedCity) {
        currentCityName = resolvedCity;
        if (typeof CONFIG !== 'undefined') {
          CONFIG.CITY = { name: resolvedCity, lat, lon };
        }
        const cityEl = document.getElementById('city-name');
        if (cityEl) cityEl.innerText = resolvedCity;
        document.title = `AeroSky - ${resolvedCity}`;

        if (typeof FavoritesManager !== 'undefined') {
          FavoritesManager.updateFavoriteStar();
          FavoritesManager.highlightActiveChip(resolvedCity);
        }
      }
    },
    (error) => {
      console.warn('Geolocalização não disponível ou negada:', error.message);
      if (!isAutomatic) {
        if (typeof hideLoader === 'function') hideLoader();
        alert(
          'Não foi possível acessar sua localização GPS. Verifique as permissões de localização do seu celular.'
        );
      }
    },
    {
      enableHighAccuracy: false, // Evita travar o GPS e economiza bateria em celulares
      timeout: 6000,
      maximumAge: 300000 // 5 minutos de cache
    }
  );
}

window.requestGeolocation = function () {
  const panel = document.getElementById('search-panel');
  if (panel && panel.style.display !== 'none') {
    toggleSearch();
  }
  performGeolocation(false);
};

window.initGeolocation = function () {
  performGeolocation(true);
};

// --- DEFINIÇÃO E TROCA DE LOCALIZAÇÃO CENTRALIZADA ---
window.setLocation = function (lat, lon, name) {
  LAT = lat;
  LON = lon;
  currentCityName = name;

  if (typeof CONFIG !== 'undefined') {
    CONFIG.CITY = { name: name, lat: lat, lon: lon };
  }

  const cityEl = document.getElementById('city-name');
  if (cityEl) cityEl.innerText = name;
  document.title = `AeroSky - ${name}`;

  if (typeof FavoritesManager !== 'undefined') {
    FavoritesManager.updateFavoriteStar();
    FavoritesManager.highlightActiveChip(name);
  }

  if (typeof showLoader === 'function') {
    showLoader(`Conectando satélites para ${name}...`);
  }

  fetchData();
};

window.selectCity = function (lat, lon, name) {
  toggleSearch();
  setLocation(lat, lon, name);
};

// --- BUSCA DE LOCALIZAÇÃO (AUTOCOMPLETE OPEN-METEO) ---
window.toggleSearch = function () {
  const panel = document.getElementById('search-panel');
  const display = document.getElementById('location-display');
  if (!panel || !display) return;
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    display.style.display = 'none';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.focus();
  } else {
    panel.style.display = 'none';
    display.style.display = '';
    const results = document.getElementById('search-results');
    if (results) results.classList.remove('visible');
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
  }
};

async function searchCity(query) {
  try {
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = new AbortController();

    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query
      )}&count=6&language=pt&format=json`,
      { signal: searchAbortController.signal }
    );
    const data = await res.json();
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!data.results || data.results.length === 0) {
      container.innerHTML =
        '<div class="search-no-results">Nenhuma cidade encontrada</div>';
      container.classList.add('visible');
      return;
    }

    container.innerHTML = data.results
      .map((r) => {
        const cityName = escapeHtml(r.name);
        const stateName = r.admin1 || '';
        const uf =
          typeof BRAZIL_UF !== 'undefined' && BRAZIL_UF[stateName]
            ? BRAZIL_UF[stateName]
            : stateName;
        const region = escapeHtml(
          [uf, r.country].filter(Boolean).join(', ')
        );
        const fullName = escapeHtml(
          r.name + (uf ? ' - ' + uf : '')
        );
        return `<div class="search-result-item" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${fullName}">
                  <div>
                      <div class="result-city">${cityName}</div>
                      <div class="result-region">${region}</div>
                  </div>
              </div>`;
      })
      .join('');

    container.classList.add('visible');
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('Erro na busca:', e);
    }
  }
}

// --- BUSCA DE DADOS METEOROLÓGICOS (API OPEN-METEO) ---
async function fetchData() {
  try {
    let data;
    if (typeof WeatherService !== 'undefined' && WeatherService.fetchForecast) {
      data = await WeatherService.fetchForecast(LAT, LON);
    } else {
      const urlWeather = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code,uv_index,relative_humidity_2m,pressure_msl,visibility,dew_point_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_sum&timezone=auto&past_days=1`;
      const resW = await fetch(urlWeather, { signal: AbortSignal.timeout(8000) });
      if (!resW.ok) throw new Error('API Failure: Status ' + resW.status);
      data = await resW.json();
    }

    globalWeatherData = data;

    if (typeof populateUI === 'function') {
      populateUI();
    } else if (typeof hideLoader === 'function') {
      hideLoader();
    }
    return true;
  } catch (e) {
    console.error('Erro ao obter dados meteorológicos:', e);
    if (typeof hideLoader === 'function') hideLoader();
    const loader = document.getElementById('loader');
    if (loader) {
      loader.style.display = 'flex';
      loader.style.opacity = '1';
      loader.innerHTML = `
        <div style="text-align: center; max-width: 320px; padding: 20px;">
          <h3 style="color:#ef4444; margin-bottom: 8px;">Falha de Conexão</h3>
          <p style="color:var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">Não foi possível acessar os servidores meteorológicos.</p>
          <button onclick="fetchData()" style="background: var(--accent-cyan); color: #000; border: none; padding: 8px 18px; border-radius: 8px; font-weight: 600; cursor: pointer;">Tentar Novamente</button>
        </div>
      `;
    }
    return false;
  }
}

window.forceUpdate = async function () {
  const btn = document.getElementById('btn-refresh');
  if (btn) btn.classList.add('spinning');

  const success = await fetchData();

  if (btn) btn.classList.remove('spinning');

  const badge = document.getElementById('api-status');
  if (badge) {
    const originalHtml = badge.innerHTML;
    if (success) {
      badge.innerHTML = '<i data-lucide="check" size="14"></i> Atualizado';
    } else {
      badge.innerHTML =
        '<i data-lucide="alert-circle" size="14" style="color:#ef4444"></i> Erro na rede';
    }
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      badge.innerHTML = originalHtml;
      if (window.lucide) lucide.createIcons();
    }, 3000);
  }
};

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  // 1. Inicializa subsistemas imediatos
  if (typeof WeatherParticles !== 'undefined') {
    WeatherParticles.init();
  }

  if (typeof FavoritesManager !== 'undefined') {
    FavoritesManager.renderFavoritesBar();
    FavoritesManager.updateFavoriteStar();
  }

  updateClock();
  setInterval(updateClock, 1000);

  updateSeason();
  updateNotifBadge();

  // 2. Dispara a carga de dados imediatamente para a cidade padrão (Naviraí ou favorito)
  // Isso garante que no celular o app abre imediatamente e NUNCA fica travado em "Sincronizando Dados"!
  fetchData();

  // 3. Failsafe: se por qualquer razão a rede estiver lenta, oculta o loader após 6 segundos
  setTimeout(() => {
    if (typeof hideLoader === 'function') hideLoader();
  }, 6000);

  // 4. Inicia geolocalização em segundo plano de forma não-bloqueante
  initGeolocation();

  // 5. Configura campo de busca
  const input = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');

  if (input) {
    input.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const query = e.target.value.trim();
      if (query.length < 2) {
        if (resultsContainer) resultsContainer.classList.remove('visible');
        return;
      }
      searchDebounceTimer = setTimeout(() => searchCity(query), 400);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') toggleSearch();
    });
  }

  // Delegação de eventos para clique em cidades pesquisadas
  if (resultsContainer) {
    resultsContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item) {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        const name = item.dataset.name;
        selectCity(lat, lon, name);
      }
    });
  }

  // Fechamento de painel de busca clicando fora
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('search-panel');
    const toggle = document.querySelector('.search-toggle');
    if (
      panel &&
      panel.style.display !== 'none' &&
      !panel.contains(e.target) &&
      toggle &&
      !toggle.contains(e.target)
    ) {
      toggleSearch();
    }
  });

  // Atalhos de Teclado Globais
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const searchPanel = document.getElementById('search-panel');
      if (searchPanel && searchPanel.style.display !== 'none') toggleSearch();
      const wellbeingPanel = document.getElementById('wellbeing-panel');
      if (wellbeingPanel && wellbeingPanel.classList.contains('active'))
        toggleWellbeing(false);
      const mapOverlay = document.getElementById('map-overlay');
      if (mapOverlay && mapOverlay.classList.contains('active'))
        toggleWeatherMap(false);
      const moreMenu = document.getElementById('more-menu-panel');
      if (moreMenu && moreMenu.classList.contains('active'))
        toggleMoreMenu(false);
    } else if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      toggleSearch();
    }
  });

  // Atualização periódica a cada 5 minutos
  setInterval(fetchData, 300000);
});

// Redimensionamento debounced garantindo resize dos gráficos e do mapa radar
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (typeof resizeAllCharts === 'function') {
      resizeAllCharts();
    }
    if (
      weatherMap &&
      document.getElementById('map-overlay') &&
      document.getElementById('map-overlay').classList.contains('active')
    ) {
      weatherMap.invalidateSize();
    }
  }, 150);
});

// Registro do Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => console.log('Service Worker registrado!', reg))
      .catch((err) =>
        console.error('Erro ao registrar Service Worker:', err)
      );
  });
}
