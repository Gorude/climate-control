/**
 * AeroSky Weather - Módulo de Interface do Usuário (UI)
 * Gerencia renderização, formatação, alertas severos, relógio, estação do ano,
 * recomendações de bem-estar, integração com radar e notificações.
 */

// --- CONTROLE DO LOADER GLOBAL ---
function hideLoader() {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 400);
  }
}
window.hideLoader = hideLoader;

function showLoader(message = 'Sincronizando dados...') {
  const loader = document.getElementById('loader');
  if (loader) {
    const p = loader.querySelector('p');
    if (p) p.innerText = message;
    loader.style.display = 'flex';
    requestAnimationFrame(() => {
      loader.style.opacity = '1';
    });
  }
}
window.showLoader = showLoader;


// --- NOTIFICAÇÕES TOAST VISUAIS ---
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:9999; display:flex; flex-direction:column; gap:8px; pointer-events:none;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.style.cssText =
    'background:rgba(10, 20, 38, 0.9); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); color:#fff; border:1px solid rgba(0, 245, 212, 0.35); border-radius:9999px; padding:9px 20px; font-size:0.86rem; font-weight:500; box-shadow:0 12px 30px rgba(0,0,0,0.6); opacity:0; transform:translateY(12px); transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);';
  toast.innerText = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// --- RELÓGIO EM TEMPO REAL ---
function updateClock() {
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.innerText = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

// --- ESTAÇÃO DO ANO (Sensível à latitude Norte vs Sul) ---
function updateSeason() {
  const month = new Date().getMonth();
  const isSouth = typeof LAT === 'number' ? LAT < 0 : true;
  let seasonName = '';
  let iconName = '';
  let iconColor = '';

  if (month === 11 || month === 0 || month === 1) {
    seasonName = isSouth ? 'Verão' : 'Inverno';
    iconName = isSouth ? 'sun' : 'snowflake';
    iconColor = isSouth ? '#facc15' : '#38bdf8';
  } else if (month >= 2 && month <= 4) {
    seasonName = isSouth ? 'Outono' : 'Primavera';
    iconName = isSouth ? 'leaf' : 'flower-2';
    iconColor = isSouth ? '#fb923c' : '#f472b6';
  } else if (month >= 5 && month <= 7) {
    seasonName = isSouth ? 'Inverno' : 'Verão';
    iconName = isSouth ? 'snowflake' : 'sun';
    iconColor = isSouth ? '#38bdf8' : '#facc15';
  } else {
    seasonName = isSouth ? 'Primavera' : 'Outono';
    iconName = isSouth ? 'flower-2' : 'leaf';
    iconColor = isSouth ? '#f472b6' : '#fb923c';
  }

  const seasonEl = document.getElementById('season-indicator');
  if (seasonEl) {
    seasonEl.innerHTML = `<i data-lucide="${iconName}" size="16" style="color: ${iconColor};"></i> <span style="font-weight: 500;">${seasonName}</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

// --- LÓGICA DO MAPA DE CHUVA RADAR ---
window.toggleWeatherMap = function (show) {
  const overlay = document.getElementById('map-overlay');
  if (!overlay) return;
  if (show) {
    overlay.classList.add('active');
    setTimeout(() => initRadarMap(), 300);
  } else {
    overlay.classList.remove('active');
  }
};

async function initRadarMap() {
  if (typeof L === 'undefined') {
    console.warn('Leaflet não carregado.');
    return;
  }

  const mapContainer = document.getElementById('weather-map-container');
  if (!mapContainer) return;

  const currentLat = typeof LAT === 'number' ? LAT : -23.065;
  const currentLon = typeof LON === 'number' ? LON : -54.1906;

  if (!weatherMap) {
    weatherMap = L.map('weather-map-container', {
      zoomControl: false
    }).setView([currentLat, currentLon], 8);

    L.control.zoom({ position: 'bottomright' }).addTo(weatherMap);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(weatherMap);
  } else {
    weatherMap.setView([currentLat, currentLon], 8);
    weatherMap.invalidateSize();
  }

  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return;
    const data = await response.json();

    if (!data || !data.radar || !data.radar.past || data.radar.past.length === 0) return;

    const latestEntry = data.radar.past[data.radar.past.length - 1];
    const tileHost = data.host;
    const tilePath = latestEntry.path;

    if (radarLayer && weatherMap) weatherMap.removeLayer(radarLayer);

    radarLayer = L.tileLayer(`${tileHost}${tilePath}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0.65,
      zIndex: 100
    });

    radarLayer.addTo(weatherMap);
  } catch (err) {
    console.warn('Erro ao carregar radar:', err);
  }
}

// --- CONSULTOR DE BEM-ESTAR ---
window.toggleWellbeing = function (show) {
  const panel = document.getElementById('wellbeing-panel');
  const overlay = document.getElementById('wellbeing-overlay');
  if (!panel || !overlay) return;
  if (show) {
    panel.classList.add('active');
    overlay.classList.add('active');
    updateWellbeingRecommendations();
  } else {
    panel.classList.remove('active');
    overlay.classList.remove('active');
  }
};

function updateWellbeingRecommendations() {
  const container = document.getElementById('wellbeing-content');
  if (!container) return;
  if (!globalWeatherData) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-info); margin-top: 40px;">
          <i data-lucide="cloud-off" size="24" style="margin-bottom: 12px; opacity: 0.7;"></i>
          <p>Nenhum dado meteorológico disponível para análise.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const c = globalWeatherData.current;
  const h = globalWeatherData.hourly;
  const startIndex = getCurrentHourlyIndex(h, c);

  // Dados atuais
  const uv = h.uv_index && h.uv_index[startIndex] != null ? h.uv_index[startIndex] : 0;
  const temp = c.temperature_2m;
  const feels = c.apparent_temperature != null ? c.apparent_temperature : temp;
  const humidity = c.relative_humidity_2m;
  const wind = c.wind_speed_10m;
  const rain = c.precipitation || 0;

  let recommendations = [];

  // 1. Recomendação de Proteção UV
  if (uv >= 8) {
    recommendations.push({
      category: 'uv',
      icon: 'sun',
      title: 'Radiação UV Extrema',
      desc: `Índice UV está em ${uv.toFixed(1)} (Muito Alto). Use protetor solar FPS 50+, evite exposição direta entre 10h e 16h, e use óculos de sol e roupas protetoras.`
    });
  } else if (uv >= 3) {
    recommendations.push({
      category: 'uv',
      icon: 'sun-medium',
      title: 'Exposição UV Moderada',
      desc: `Índice UV está em ${uv.toFixed(1)}. Recomenda-se protetor solar FPS 30+, mesmo em dias nublados.`
    });
  } else {
    recommendations.push({
      category: 'uv',
      icon: 'sun-dim',
      title: 'Radiação UV Baixa',
      desc: `Índice UV em ${uv.toFixed(1)}. Baixo risco para a pele. Ótimo momento para aproveitar a luz natural com segurança.`
    });
  }

  // 2. Recomendação de Hidratação
  if (temp >= 33 || feels >= 35) {
    recommendations.push({
      category: 'hydration',
      icon: 'droplet',
      title: 'Alerta de Calor Severo',
      desc: `Temperatura de ${temp.toFixed(1)}°C (Sensação de ${feels.toFixed(0)}°C). Risco de estresse térmico. Beba ao menos 3L de água hoje e evite exposição solar direta.`
    });
  } else if (humidity <= 40) {
    recommendations.push({
      category: 'hydration',
      icon: 'droplets',
      title: 'Ar Muito Seco',
      desc: `Umidade relativa em ${humidity}%. Hidrate-se com frequência, use hidratante labial e umidificador para aliviar as vias respiratórias.`
    });
  } else {
    recommendations.push({
      category: 'hydration',
      icon: 'glass-water',
      title: 'Hidratação Normal',
      desc: `Umidade em ${humidity}% e clima agradável. Mantenha o consumo regular de cerca de 2L/dia de água.`
    });
  }

  // 3. Atividades Físicas / Exercícios
  if (rain > 0) {
    recommendations.push({
      category: 'activity',
      icon: 'home',
      title: 'Exercícios Indoor Recomendados',
      desc: `Precipitação no momento (${rain.toFixed(1)} mm). Dê preferência a atividades físicas em locais fechados ou academia.`
    });
  } else if (temp >= 16 && temp <= 26 && wind < 25) {
    recommendations.push({
      category: 'activity',
      icon: 'bike',
      title: 'Perfeito para Esportes ao Ar Livre',
      desc: `Clima ideal de ${temp.toFixed(0)}°C e sem previsão de chuva. Perfeito para corrida, caminhada ou ciclismo.`
    });
  } else {
    recommendations.push({
      category: 'activity',
      icon: 'dumbbell',
      title: 'Atividade Física Moderada',
      desc: `Condições meteorológicas estáveis. Planeje treinos ao ar livre no início da manhã ou no fim da tarde.`
    });
  }

  // 4. Perfil Eólico e Conforto Térmico
  if (wind >= 30) {
    recommendations.push({
      category: 'wind',
      icon: 'wind',
      title: 'Ventos Fortes & Alergias',
      desc: `Vento soprando a ${Math.round(wind)} km/h. Risco de dispersão de poeira e partículas. Pessoas alérgicas devem ter cautela.`
    });
  } else if (feels <= 15) {
    recommendations.push({
      category: 'wind',
      icon: 'thermometer-snowflake',
      title: 'Desconforto por Frio',
      desc: `Sensação térmica baixa de ${feels.toFixed(0)}°C. Agasalhe-se bem e consuma bebidas quentes para conforto térmico.`
    });
  } else if (feels >= 32) {
    recommendations.push({
      category: 'wind',
      icon: 'sun',
      title: 'Calor Intenso',
      desc: `Sensação térmica elevada de ${feels.toFixed(0)}°C. Permaneça em ambientes arejados ou climatizados e evite esforço excessivo.`
    });
  } else {
    recommendations.push({
      category: 'wind',
      icon: 'smile',
      title: 'Conforto Térmico Ideal',
      desc: `Equilíbrio harmonioso de temperatura e ventilação, com sensação neutra e agradável.`
    });
  }

  container.innerHTML = recommendations
    .map(
      (r) => `
        <div class="wellbeing-card ${r.category}">
            <div class="wellbeing-card-title">
                <i data-lucide="${r.icon}" size="18"></i>
                <span>${r.title}</span>
            </div>
            <div class="wellbeing-card-desc">${r.desc}</div>
        </div>
      `
    )
    .join('');

  if (window.lucide) lucide.createIcons();
}

// --- SISTEMA DE NOTIFICAÇÕES PUSH ---
window.toggleNotifications = async function () {
  if (!('Notification' in window)) {
    alert('Seu navegador não suporta notificações.');
    return;
  }

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
  }

  if (Notification.permission === 'denied') {
    alert(
      'Notificações bloqueadas. Habilite nas configurações do navegador para receber os alertas.'
    );
    return;
  }

  notificationsEnabled = !notificationsEnabled;
  localStorage.setItem('notif_enabled', notificationsEnabled);
  updateNotifBadge();

  if (notificationsEnabled) {
    sendWeatherNotification(
      'AeroSky - Conectado! 🚀',
      'Notificações inteligentes ativas. Você receberá alertas de clima severo e boletins de bem-estar personalizados.',
      true,
      'welcome'
    );
  }
};

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.classList.toggle('active', notificationsEnabled);
  }
  const btn = document.getElementById('btn-notifications');
  if (btn) {
    btn.title = notificationsEnabled
      ? 'Notificações ativas (clique para desativar)'
      : 'Ativar notificações de alerta';
  }
}

function sendWeatherNotification(
  title,
  body,
  bypassCooldown = false,
  category = ''
) {
  if (!notificationsEnabled || Notification.permission !== 'granted') return;

  const key = `notif_${(title + '_' + category).replace(/[\s\W]/g, '_')}`;
  if (!bypassCooldown) {
    const lastSent = parseInt(localStorage.getItem(key) || '0');
    const now = Date.now();
    if (now - lastSent < 30 * 60 * 1000) return; // 30 min cooldown
    localStorage.setItem(key, now.toString());
  }

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body: body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        tag: key
      });
    });
  } else {
    new Notification(title, { body: body, icon: './icon-192.png' });
  }
}

// --- SISTEMA DE ALERTAS SEVEROS ---

function checkAlerts(current, daily) {
  const container = document.getElementById('alert-container');
  if (!container) return;
  container.innerHTML = '';
  let alerts = [];

  const code = current.weather_code;
  const gusts = current.wind_gusts_10m || 0;
  const tempFeels =
    current.apparent_temperature != null
      ? current.apparent_temperature
      : current.temperature_2m;
  const tempReal = current.temperature_2m;
  const uvMax =
    daily.uv_index_max && daily.uv_index_max[1] != null
      ? daily.uv_index_max[1]
      : 0;

  // 1. Tempestades (Raios)
  if ([95, 96, 99].includes(code)) {
    alerts.push({
      type: 'danger',
      category: 'storm',
      icon: 'cloud-lightning',
      text: `ALERTA DE TEMPESTADE: Condições severas com possibilidade de raios detectadas em ${currentCityName}.`
    });
  } else if ([65, 81, 82].includes(code)) {
    alerts.push({
      type: 'warning',
      category: 'heavy_rain',
      icon: 'cloud-rain-wind',
      text: 'ATENÇÃO: Chuva forte ou pancadas intensas ocorrendo agora. Risco de alagamentos pontuais.'
    });
  }

  // 2. Ventos e Rajadas
  if (gusts >= ALERT_THRESHOLDS.windGusts) {
    alerts.push({
      type: gusts >= 60 ? 'danger' : 'warning',
      category: 'wind',
      icon: 'wind',
      text: `${gusts >= 60 ? 'PERIGO' : 'ATENÇÃO'}: Rajadas de vento de ${Math.round(gusts)} km/h. ${gusts >= 60 ? 'Risco de queda de galhos e destelhamentos.' : 'Tenha cuidado ao ar livre.'}`
    });
  }

  // 3. Calor Extremo
  if (tempFeels >= ALERT_THRESHOLDS.tempMax) {
    alerts.push({
      type: 'danger',
      category: 'heat',
      icon: 'thermometer-sun',
      text: `ALERTA DE CALOR: Sensação térmica perigosa de ${Math.round(tempFeels)}°C em ${currentCityName}. Hidrate-se e evite exercícios ao ar livre!`
    });
  }

  // 4. Frio Intenso
  if (tempReal <= ALERT_THRESHOLDS.tempMin) {
    alerts.push({
      type: 'warning',
      category: 'cold',
      icon: 'thermometer-snowflake',
      text: `ATENÇÃO FRIO: Temperatura de ${Math.round(tempReal)}°C em ${currentCityName}. Agasalhe-se e proteja-se do frio!`
    });
  }

  // 5. Radiação UV
  if (uvMax >= ALERT_THRESHOLDS.uvIndex) {
    alerts.push({
      type: 'warning',
      category: 'uv',
      icon: 'sun-dim',
      text: `RADIAÇÃO EXTREMA: Índice UV atingirá ${Math.round(uvMax)} hoje em ${currentCityName}. Risco altíssimo de queimaduras.`
    });
  }

  alerts.forEach((al) => {
    const div = document.createElement('div');
    div.className = `weather-alert alert-${al.type}`;
    div.innerHTML = `<i data-lucide="${al.icon}" size="20" class="alert-icon"></i> <span>${escapeHtml(al.text)}</span>`;
    container.appendChild(div);
  });

  if (alerts.length > 0) {
    if (window.lucide) lucide.createIcons();

    alerts.forEach((al) => {
      sendWeatherNotification(
        `⚠️ Alerta Clima - ${currentCityName}`,
        al.text,
        false,
        al.category
      );
    });
  }
}

// --- ATUALIZAÇÃO GERAL DA INTERFACE (POPULATE UI) ---
function populateUI() {
  if (!globalWeatherData) return;
  const c = globalWeatherData.current;
  const h = globalWeatherData.hourly;
  const d = globalWeatherData.daily;
  const isDay = c.is_day === 1;
  const wmo = parseWMO(c.weather_code, isDay);

  // Atualiza estação do ano com base na latitude
  updateSeason();

  // Verifica Alertas Meteorológicos
  checkAlerts(c, d);

  // Background dinâmico
  const bg = document.getElementById('weather-bg');
  if (bg) {
    if (c.precipitation > 0) bg.className = 'bg-rain';
    else bg.className = isDay ? 'bg-day' : 'bg-night';
  }

  // Atualiza motor de partículas dinâmicas
  if (typeof WeatherParticles !== 'undefined' && WeatherParticles.setWeatherCondition) {
    WeatherParticles.setWeatherCondition(c.weather_code, c.is_day, c.wind_speed_10m);
  }

  // Atualiza favoritos (barra e estrela)
  if (typeof FavoritesManager !== 'undefined') {
    FavoritesManager.renderFavoritesBar();
    FavoritesManager.updateFavoriteStar();
  }

  // Visão Geral
  const valTemp = document.getElementById('val-temp');
  if (valTemp) valTemp.innerHTML = `${c.temperature_2m.toFixed(1)}<span>°</span>`;
  const valDesc = document.getElementById('val-desc');
  if (valDesc) valDesc.innerText = wmo.t;

  // Lógica de Tendência da Temperatura Atual
  const currentHourOffset = getCurrentHourlyIndex(h, c);
  const prevHourOffset = Math.max(0, currentHourOffset - 1);
  const prevTemp =
    h.temperature_2m && h.temperature_2m[prevHourOffset] != null
      ? h.temperature_2m[prevHourOffset]
      : c.temperature_2m;
  const diffTemp = (c.temperature_2m - prevTemp).toFixed(1);

  let trendTempHtml = '';
  if (diffTemp > 0) {
    trendTempHtml = `<i data-lucide="trending-up" size="16" color="#ef4444"></i> <span style="color: #ef4444;">+${diffTemp}°</span>`;
  } else if (diffTemp < 0) {
    trendTempHtml = `<i data-lucide="trending-down" size="16" color="#3b82f6"></i> <span style="color: #3b82f6;">${diffTemp}°</span>`;
  } else {
    trendTempHtml = `<i data-lucide="minus" size="16" color="var(--text-muted)"></i> <span style="color: var(--text-muted);">0.0°</span>`;
  }
  const trendTempEl = document.getElementById('trend-temp');
  if (trendTempEl) trendTempEl.innerHTML = trendTempHtml;

  const valFeels = document.getElementById('val-feels');
  if (valFeels) {
    valFeels.innerText = `${Math.round(c.apparent_temperature != null ? c.apparent_temperature : c.temperature_2m)}°C`;
  }

  const valMax = document.getElementById('val-max');
  if (valMax) {
    valMax.innerText =
      (d.temperature_2m_max && d.temperature_2m_max[1] != null
        ? Math.round(d.temperature_2m_max[1])
        : '--') + '°';
  }
  const valMin = document.getElementById('val-min');
  if (valMin) {
    valMin.innerText =
      (d.temperature_2m_min && d.temperature_2m_min[1] != null
        ? Math.round(d.temperature_2m_min[1])
        : '--') + '°';
  }

  const iconEl = document.getElementById('main-icon');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', wmo.i);
    iconEl.style.color = wmo.c;
    iconEl.style.filter = `drop-shadow(0 0 25px ${wmo.c})`;
  }

  // Sol e Crepúsculo (sincronizado com horário local do tempo)
  const sr = new Date(d.sunrise[1]);
  const ss = new Date(d.sunset[1]);
  const localNow = new Date(c.time);

  const valSunrise = document.getElementById('val-sunrise');
  if (valSunrise) {
    valSunrise.innerText = sr.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  const valSunset = document.getElementById('val-sunset');
  if (valSunset) {
    valSunset.innerText = ss.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Golden Hour (45 min antes do pôr do sol)
  const ghStart = new Date(ss.getTime() - 45 * 60000);
  const valGoldenHour = document.getElementById('val-golden-hour');
  if (valGoldenHour) {
    valGoldenHour.innerText =
      ghStart.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      }) +
      ' às ' +
      ss.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
  }

  const diffMs = ss - sr;
  const valDaylight = document.getElementById('val-daylight');
  if (valDaylight) {
    valDaylight.innerText = `${Math.floor(diffMs / 3600000)}h ${Math.round((diffMs % 3600000) / 60000)}m`;
  }

  // Comparação precisa de duração da luz solar (hoje vs ontem)
  if (
    d.sunrise &&
    d.sunset &&
    d.sunrise[1] &&
    d.sunset[1] &&
    d.sunrise[0] &&
    d.sunset[0]
  ) {
    const todayDaylight = new Date(d.sunset[1]) - new Date(d.sunrise[1]);
    const yesterdayDaylight = new Date(d.sunset[0]) - new Date(d.sunrise[0]);
    const isLengthening = todayDaylight >= yesterdayDaylight;

    const trendDaylightEl = document.getElementById('daylight-trend');
    if (trendDaylightEl) {
      trendDaylightEl.innerHTML = isLengthening
        ? `<i data-lucide="trending-up" size="14" color="#4ade80" title="Aumentando em relação a ontem"></i>`
        : `<i data-lucide="trending-down" size="14" color="#fb923c" title="Diminuindo em relação a ontem"></i>`;
    }
  }

  let t = (localNow - sr) / diffMs;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  const p0 = { x: 20, y: 70 },
    p1 = { x: 100, y: -20 },
    p2 = { x: 180, y: 70 };
  const sunX =
    Math.pow(1 - t, 2) * p0.x +
    2 * (1 - t) * t * p1.x +
    Math.pow(t, 2) * p2.x;
  const sunY =
    Math.pow(1 - t, 2) * p0.y +
    2 * (1 - t) * t * p1.y +
    Math.pow(t, 2) * p2.y;

  const sunDot = document.getElementById('sun-dot');
  if (sunDot) {
    sunDot.setAttribute('cx', sunX);
    sunDot.setAttribute('cy', sunY);
  }
  const sunClip = document.getElementById('sun-clip-rect');
  if (sunClip) {
    sunClip.setAttribute('width', sunX);
  }

  // Lógica do Ciclo Lunar
  const LUNAR_MONTH = 29.53058867;
  const KNOWN_NEW_MOON = 1704974220000;
  const diffDaysMoon =
    (localNow.getTime() - KNOWN_NEW_MOON) / (1000 * 60 * 60 * 24);
  let phaseFraction = (diffDaysMoon % LUNAR_MONTH) / LUNAR_MONTH;
  if (phaseFraction < 0) phaseFraction += 1;

  let phaseName;
  if (phaseFraction < 0.03 || phaseFraction >= 0.97) {
    phaseName = 'Lua Nova';
  } else if (phaseFraction < 0.22) {
    phaseName = 'Crescente';
  } else if (phaseFraction < 0.28) {
    phaseName = 'Quarto Crescente';
  } else if (phaseFraction < 0.47) {
    phaseName = 'Crescente Convexa';
  } else if (phaseFraction < 0.53) {
    phaseName = 'Lua Cheia';
  } else if (phaseFraction < 0.72) {
    phaseName = 'Minguante Convexa';
  } else if (phaseFraction < 0.78) {
    phaseName = 'Quarto Minguante';
  } else {
    phaseName = 'Minguante Côncava';
  }

  const illumination = Math.round(
    (0.5 - Math.cos(phaseFraction * Math.PI * 2) * 0.5) * 100
  );
  const ageDays = Math.round(phaseFraction * 29.53);

  const rMoon = 48;
  const sweepOut = phaseFraction <= 0.5 ? 1 : 0;
  let sweepRet;
  if (phaseFraction < 0.25) sweepRet = 0;
  else if (phaseFraction <= 0.5) sweepRet = 1;
  else if (phaseFraction < 0.75) sweepRet = 0;
  else sweepRet = 1;

  const rxMoon = rMoon * Math.abs(Math.cos(phaseFraction * 2 * Math.PI));
  const litPath = `M 50 2 A 48 48 0 0 ${sweepOut} 50 98 A ${rxMoon} 48 0 0 ${sweepRet} 50 2`;
  const moonLitPath = document.getElementById('moon-lit-path');
  if (moonLitPath) moonLitPath.setAttribute('d', litPath);

  const valMoonPhase = document.getElementById('val-moon-phase');
  if (valMoonPhase) valMoonPhase.innerText = phaseName;
  const valMoonIll = document.getElementById('val-moon-ill');
  if (valMoonIll) valMoonIll.innerText = illumination + '%';
  const valMoonAge = document.getElementById('val-moon-age');
  if (valMoonAge) valMoonAge.innerText = ageDays + ' dias';

  // Ponto Sublunar
  const currentLon = typeof LON === 'number' ? LON : -54.1906;
  const utcHour = localNow.getUTCHours() + localNow.getUTCMinutes() / 60;
  let sunLon = (12 - utcHour) * 15;
  let moonLon = sunLon - phaseFraction * 360;
  while (moonLon <= -180) moonLon += 360;
  while (moonLon > 180) moonLon -= 360;

  let region = '';
  if (moonLon > -180 && moonLon <= -130) region = 'Oceano Pacífico';
  else if (moonLon > -130 && moonLon <= -80)
    region = 'América do Norte / Pacífico';
  else if (moonLon > -80 && moonLon <= -35)
    region = 'América do Sul / Atlântico';
  else if (moonLon > -35 && moonLon <= 20)
    region = 'Oceano Atlântico / África';
  else if (moonLon > 20 && moonLon <= 60)
    region = 'África / Oriente Médio';
  else if (moonLon > 60 && moonLon <= 120)
    region = 'Ásia / Oceano Índico';
  else region = 'Austrália / Pacífico';

  const valMoonLoc = document.getElementById('val-moon-location');
  if (valMoonLoc) valMoonLoc.innerText = region;

  // Visibilidade Local
  let diffLon = moonLon - currentLon;
  while (diffLon <= -180) diffLon += 360;
  while (diffLon > 180) diffLon -= 360;

  const badgeVis = document.getElementById('badge-moon-vis');
  const textVis = document.getElementById('val-moon-vis');
  const iconVis = document.getElementById('icon-moon-vis');

  if (badgeVis) {
    badgeVis.setAttribute('title', `Visibilidade calculada para ${currentCityName}`);
  }

  if (Math.abs(diffLon) < 85) {
    let direcao = 'Acima / Norte';
    if (diffLon > 15) direcao = 'Leste';
    else if (diffLon < -15) direcao = 'Oeste';

    if (badgeVis) {
      badgeVis.style.background = 'rgba(74, 222, 128, 0.1)';
      badgeVis.style.border = '1px solid rgba(74, 222, 128, 0.2)';
      badgeVis.style.color = '#4ade80';
    }
    if (iconVis) iconVis.setAttribute('data-lucide', 'eye');
    if (textVis)
      textVis.innerHTML = `<span style="color: #fff;">Visível agora:</span> ${direcao}`;
  } else {
    if (badgeVis) {
      badgeVis.style.background = 'rgba(255, 255, 255, 0.05)';
      badgeVis.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      badgeVis.style.color = 'var(--text-muted)';
    }
    if (iconVis) iconVis.setAttribute('data-lucide', 'eye-off');
    if (textVis) textVis.innerHTML = 'Abaixo do horizonte';
  }

  // Bússola de Vento
  const originDir = c.wind_direction_10m || 0;
  const destDir = (originDir + 180) % 360;

  const windNeedle = document.getElementById('wind-needle');
  if (windNeedle) {
    windNeedle.style.transform = `rotate(${destDir}deg)`;
  }
  const valWindSfc = document.getElementById('val-wind-sfc');
  if (valWindSfc) {
    valWindSfc.innerText = Math.round(c.wind_speed_10m || 0);
  }
  const valGusts = document.getElementById('val-gusts');
  if (valGusts) {
    valGusts.innerText = Math.round(c.wind_gusts_10m || 0) + ' km/h';
  }
  const valWindDest = document.getElementById('val-wind-dest');
  if (valWindDest) {
    valWindDest.innerText = getWindDirectionStr(destDir);
  }

  // Previsão Horária e Diária
  if (typeof renderForecast === 'function') {
    renderForecast();
  }

  // Tendências Atmosféricas
  const startIndex = getCurrentHourlyIndex(h, c);
  const prevIndex = Math.max(0, startIndex - 1);

  const getTrend = (current, previous) => {
    if (current == null || previous == null)
      return `<i data-lucide="minus" size="14" color="var(--text-muted)" title="Estável"></i>`;
    if (current > previous)
      return `<i data-lucide="trending-up" size="14" color="#4ade80" title="Subindo"></i>`;
    if (current < previous)
      return `<i data-lucide="trending-down" size="14" color="#fb923c" title="Descendo"></i>`;
    return `<i data-lucide="minus" size="14" color="var(--text-muted)" title="Estável"></i>`;
  };

  const valHum = document.getElementById('val-humidity');
  if (valHum) {
    valHum.innerText =
      c.relative_humidity_2m != null ? c.relative_humidity_2m : '--';
  }
  const trendHum = document.getElementById('trend-humidity');
  if (trendHum) {
    trendHum.innerHTML = getTrend(
      c.relative_humidity_2m,
      h.relative_humidity_2m ? h.relative_humidity_2m[prevIndex] : null
    );
  }

  const valPress = document.getElementById('val-pressure');
  if (valPress) {
    valPress.innerText =
      c.pressure_msl != null ? Math.round(c.pressure_msl) : '--';
  }
  const trendPress = document.getElementById('trend-pressure');
  if (trendPress) {
    trendPress.innerHTML = getTrend(
      c.pressure_msl,
      h.pressure_msl ? h.pressure_msl[prevIndex] : null
    );
  }

  const visKm =
    c.visibility != null ? (c.visibility / 1000).toFixed(1) : '--';
  const valVis = document.getElementById('val-vis');
  if (valVis) valVis.innerText = visKm;
  const trendVis = document.getElementById('trend-vis');
  if (trendVis) {
    trendVis.innerHTML = getTrend(
      c.visibility,
      h.visibility ? h.visibility[prevIndex] : null
    );
  }

  // Índice UV Atual
  const currentUv =
    h.uv_index && h.uv_index[startIndex] != null
      ? h.uv_index[startIndex]
      : 0;
  const prevUv =
    h.uv_index && h.uv_index[prevIndex] != null
      ? h.uv_index[prevIndex]
      : 0;
  const valUv = document.getElementById('val-uv');
  if (valUv) valUv.innerText = currentUv.toFixed(1);
  const trendUv = document.getElementById('trend-uv');
  if (trendUv) trendUv.innerHTML = getTrend(currentUv, prevUv);

  let uvPct = Math.max(0, Math.min(1, currentUv / 11));
  const uvRing = document.getElementById('uv-ring-mini');
  if (uvRing) {
    uvRing.style.strokeDashoffset = 200 - 200 * uvPct;
  }

  // Ponto de Orvalho Atual
  const currentDew =
    h.dew_point_2m && h.dew_point_2m[startIndex] != null
      ? h.dew_point_2m[startIndex]
      : null;
  const prevDew =
    h.dew_point_2m && h.dew_point_2m[prevIndex] != null
      ? h.dew_point_2m[prevIndex]
      : null;
  const valDew = document.getElementById('val-dew');
  if (valDew) {
    valDew.innerText = currentDew != null ? currentDew.toFixed(1) : '--';
  }
  const trendDew = document.getElementById('trend-dew');
  if (trendDew) trendDew.innerHTML = getTrend(currentDew, prevDew);

  if (window.lucide) lucide.createIcons();

  // Renderiza gráficos
  if (typeof renderCharts === 'function') {
    renderCharts(h);
  }

  // Oculta loader
  hideLoader();
}
