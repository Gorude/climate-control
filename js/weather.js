/**
 * AeroSky - Dados Meteorológicos, APIs e Geocodificação
 */

let LAT = -23.065;
let LON = -54.1906;
let currentCityName = "Naviraí - MS";
let globalWeatherData = null;
let weatherMap = null;
let radarLayer = null;

function getCurrentHourlyIndex(hourly, current) {
  if (!hourly || !hourly.time || hourly.time.length === 0) return 24;
  if (current && current.time) {
    const targetPrefix = current.time.slice(0, 13);
    const idx = hourly.time.findIndex((t) => t.startsWith(targetPrefix));
    if (idx !== -1) return idx;
  }
  return Math.min(24, hourly.time.length - 1);
}

// --- LÓGICA DO MAPA DE CHUVA ---
window.toggleWeatherMap = function (show) {
  const overlay = document.getElementById("map-overlay");
  if (!overlay) return;
  if (show) {
    overlay.classList.add("active");
    setTimeout(() => initRadarMap(), 300);
  } else {
    overlay.classList.remove("active");
  }
};

async function initRadarMap() {
  if (typeof L === "undefined") {
    console.warn("Leaflet não carregado.");
    return;
  }

  const mapContainer = document.getElementById("weather-map-container");
  if (!mapContainer) return;

  if (!weatherMap) {
    weatherMap = L.map("weather-map-container", {
      zoomControl: false,
    }).setView([LAT, LON], 8);

    L.control.zoom({ position: "bottomright" }).addTo(weatherMap);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap",
      },
    ).addTo(weatherMap);
  } else {
    weatherMap.setView([LAT, LON], 8);
    weatherMap.invalidateSize();
  }

  try {
    const response = await fetch(
      "https://api.rainviewer.com/public/weather-maps.json",
      { signal: AbortSignal.timeout(6000) },
    );
    if (!response.ok) return;
    const data = await response.json();

    if (
      !data ||
      !data.radar ||
      !data.radar.past ||
      data.radar.past.length === 0
    )
      return;

    const latestEntry = data.radar.past[data.radar.past.length - 1];
    const tileHost = data.host;
    const tilePath = latestEntry.path;

    if (radarLayer && weatherMap) weatherMap.removeLayer(radarLayer);

    radarLayer = L.tileLayer(
      `${tileHost}${tilePath}/256/{z}/{x}/{y}/2/1_1.png`,
      {
        opacity: 0.65,
        zIndex: 100,
      },
    );

    radarLayer.addTo(weatherMap);
  } catch (err) {
    console.warn("Erro ao carregar radar:", err);
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      {
        headers: { "Accept-Language": "pt-BR" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) throw new Error("Erro no Nominatim");
    const data = await res.json();

    const addr = (data && data.address) || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      addr.city_district ||
      "Sua Localização";
    const state = addr.state ? addr.state : "";

    const finalName = state ? `${city} - ${state}` : city;
    return finalName;
  } catch (e) {
    console.warn("Erro ao obter geocodificação reversa:", e);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

async function performGeolocation(isAutomatic = false) {
  const loader = document.getElementById("loader");
  if (!isAutomatic && loader) {
    loader.style.display = "flex";
    loader.style.opacity = "1";
    const p = loader.querySelector("p");
    if (p) p.innerText = "Detectando sua localização...";
  }

  if (!navigator.geolocation) {
    console.warn("Geolocalização não suportada.");
    if (!isAutomatic) {
      alert("Seu navegador não suporta geolocalização.");
      if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => (loader.style.display = "none"), 800);
      }
    } else {
      fetchData();
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      LAT = lat;
      LON = lon;

      const resolvedCity = await reverseGeocode(lat, lon);
      currentCityName = resolvedCity;

      const cityEl = document.getElementById("city-name");
      if (cityEl) cityEl.innerText = resolvedCity;
      document.title = `AeroSky - ${resolvedCity}`;

      if (isAutomatic && loader) {
        const p = loader.querySelector("p");
        if (p) p.innerText = `Carregando clima de ${resolvedCity}...`;
      }

      if (window.FavoritesManager) {
        window.FavoritesManager.updateFavoriteButtonState();
        window.FavoritesManager.highlightActiveChip();
      }

      await fetchData();
    },
    (error) => {
      console.warn("Erro ou permissão negada de geolocalização:", error);
      if (!isAutomatic) {
        alert(
          "Não foi possível acessar sua localização. Verifique as permissões de geolocalização do seu navegador.",
        );
      }
      if (isAutomatic) {
        fetchData();
      } else if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => (loader.style.display = "none"), 800);
      }
    },
    {
      enableHighAccuracy: !isAutomatic,
      timeout: isAutomatic ? 6000 : 8000,
      maximumAge: 60000,
    },
  );
}

window.requestGeolocation = function () {
  const panel = document.getElementById("search-panel");
  if (panel && panel.style.display !== "none") {
    toggleSearch();
  }
  performGeolocation(false);
};

window.initGeolocation = function () {
  performGeolocation(true);
};

async function fetchData() {
  try {
    const urlWeather = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code,uv_index,relative_humidity_2m,pressure_msl,visibility,dew_point_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_sum&timezone=auto&past_days=1`;

    const resW = await fetch(urlWeather, {
      signal: AbortSignal.timeout(8000),
    });

    if (!resW.ok) throw new Error("API Failure: Status " + resW.status);

    globalWeatherData = await resW.json();

    if (typeof populateUI === "function") populateUI();

    if (window.WeatherParticles && typeof window.WeatherParticles.setWeather === "function") {
      window.WeatherParticles.setWeather(globalWeatherData);
    }

    if (window.FavoritesManager && typeof window.FavoritesManager.updateFavoriteButtonState === "function") {
      window.FavoritesManager.updateFavoriteButtonState();
      window.FavoritesManager.highlightActiveChip();
    }

    return true;
  } catch (e) {
    console.error("Erro ao obter dados meteorológicos:", e);
    const loader = document.getElementById("loader");
    if (loader) {
      loader.style.display = "flex";
      loader.style.opacity = "1";
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
  const btn = document.getElementById("btn-refresh");
  if (btn) btn.classList.add("spinning");

  const success = await fetchData();

  if (btn) btn.classList.remove("spinning");

  const badge = document.getElementById("api-status");
  if (badge) {
    const originalHtml = badge.innerHTML;
    if (success) {
      badge.innerHTML = '<i data-lucide="check" size="14"></i> Atualizado';
    } else {
      badge.innerHTML =
        '<i data-lucide="alert-circle" size="14" style="color:#ef4444"></i> Erro na rede';
    }
    if (typeof lucide !== "undefined") lucide.createIcons();

    setTimeout(() => {
      badge.innerHTML = originalHtml;
      if (typeof lucide !== "undefined") lucide.createIcons();
    }, 3000);
  }
};
