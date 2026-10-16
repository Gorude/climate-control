/**
 * AeroSky Weather - Módulo de Interface do Usuário (UI)
 * Gerencia renderização, formatação, alertas severos, relógio, estação do ano,
 * recomendações de bem-estar, integração com radar e notificações.
 */

// --- CONTROLE DO LOADER GLOBAL ---
let loaderHideTimer = null;

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.style.opacity = '0';
  clearTimeout(loaderHideTimer);
  loaderHideTimer = setTimeout(() => {
    loader.style.display = 'none';
  }, 500);
}
window.hideLoader = hideLoader;

function showLoader(message = 'Sincronizando dados...') {
  const loader = document.getElementById('loader');
  if (!loader) return;
  clearTimeout(loaderHideTimer);
  loader.classList.remove('has-error');
  const msg = document.getElementById('loader-message');
  if (msg) msg.innerText = message;
  loader.style.display = 'flex';
  requestAnimationFrame(() => {
    loader.style.opacity = '1';
  });
}
window.showLoader = showLoader;

function showLoaderError() {
  showLoader();
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('has-error');
}
window.showLoaderError = showLoaderError;

// --- HORÁRIOS NO FUSO DA CIDADE EXIBIDA ---
function formatTimeInCity(ms, withSeconds = false) {
  const options = { hour: '2-digit', minute: '2-digit' };
  if (withSeconds) options.second = '2-digit';
  if (globalWeatherData && globalWeatherData.timezone) options.timeZone = globalWeatherData.timezone;
  try {
    return new Date(ms).toLocaleTimeString('pt-BR', options);
  } catch (e) {
    delete options.timeZone;
    return new Date(ms).toLocaleTimeString('pt-BR', options);
  }
}

// --- STATUS DA CONEXÃO COM A API ---
function setApiStatus(ok) {
  const badge = document.getElementById('api-status');
  if (badge) {
    badge.classList.toggle('offline', !ok);
    badge.innerHTML = ok
      ? '<i data-lucide="check" width="14" height="14"></i> Conectado'
      : '<i data-lucide="wifi-off" width="14" height="14"></i> Offline';
  }

  const lastUpdate = document.getElementById('menu-last-update');
  if (lastUpdate && lastFetchTime) {
    const time = formatTimeInCity(lastFetchTime);
    lastUpdate.innerText = ok ? `Última atualização às ${time}` : `Offline • dados de ${time}`;
  }

  if (window.lucide) lucide.createIcons();
}

// --- NOTIFICAÇÕES TOAST VISUAIS ---
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  // Evita empilhar a mesma mensagem repetidas vezes
  if ([...container.children].some((t) => t.textContent === message)) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// --- RELÓGIO EM TEMPO REAL (no fuso horário da cidade exibida) ---
function updateClock() {
  const timeStr = formatTimeInCity(Date.now(), true);
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.innerText = timeStr;
  const menuClock = document.getElementById('menu-clock-text');
  if (menuClock) menuClock.innerText = timeStr;
}

// --- ESTAÇÃO DO ANO (datas astronômicas aproximadas, sensível ao hemisfério) ---
function updateSeason() {
  const now = new Date();
  const monthDay = (now.getMonth() + 1) * 100 + now.getDate();
  const isSouth = LAT < 0;

  // Estação no Hemisfério Norte: equinócios ~20/03 e ~22/09, solstícios ~21/06 e ~21/12
  let north;
  if (monthDay >= 1221 || monthDay < 320) north = 'winter';
  else if (monthDay < 621) north = 'spring';
  else if (monthDay < 922) north = 'summer';
  else north = 'autumn';

  const opposite = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
  const season = isSouth ? opposite[north] : north;

  const seasons = {
    summer: { name: 'Verão', icon: 'sun', color: '#facc15' },
    autumn: { name: 'Outono', icon: 'leaf', color: '#fb923c' },
    winter: { name: 'Inverno', icon: 'snowflake', color: '#38bdf8' },
    spring: { name: 'Primavera', icon: 'flower-2', color: '#f472b6' }
  };
  const { name, icon, color } = seasons[season];

  const seasonEl = document.getElementById('season-indicator');
  if (seasonEl) {
    seasonEl.innerHTML = `<i data-lucide="${icon}" width="16" height="16" style="color: ${color};"></i> <span style="font-weight: 500;">${name}</span>`;
  }
  const menuSeason = document.getElementById('menu-season-text');
  if (menuSeason) {
    menuSeason.innerText = `${name} no Hemisfério ${isSouth ? 'Sul' : 'Norte'}`;
  }
  if (window.lucide) lucide.createIcons();
}

// --- MENU DE OPÇÕES RÁPIDAS MOBILE ---
window.toggleMoreMenu = function (show) {
  const panel = document.getElementById('more-menu-panel');
  const overlay = document.getElementById('more-menu-overlay');
  const btn = document.getElementById('btn-more-menu');
  if (!panel || !overlay) return;

  const willShow = typeof show === 'boolean' ? show : !panel.classList.contains('active');
  if (willShow) updateMenuStates();
  panel.classList.toggle('active', willShow);
  overlay.classList.toggle('active', willShow);
  if (btn) btn.setAttribute('aria-expanded', willShow ? 'true' : 'false');
};

// O menu rápido só existe abaixo de 1024px: fecha-o se a tela crescer com ele aberto
const desktopHeaderQuery = window.matchMedia('(min-width: 1024px)');
desktopHeaderQuery.addEventListener('change', (e) => {
  if (e.matches) toggleMoreMenu(false);
});

function updateMenuStates() {
  const pStatus = document.getElementById('menu-particles-status');
  const pIcon = document.getElementById('menu-particles-icon');
  const pEnabled = WeatherParticles.enabled;
  if (pStatus) {
    pStatus.innerText = pEnabled ? 'Ativo' : 'Desativado';
    pStatus.classList.toggle('active', pEnabled);
  }
  if (pIcon) {
    pIcon.style.color = pEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)';
  }

  const nStatus = document.getElementById('menu-notif-status');
  const nIcon = document.getElementById('menu-notif-icon');
  if (nStatus) {
    nStatus.innerText = notificationsEnabled ? 'Ativo' : 'Desativado';
    nStatus.classList.toggle('active', notificationsEnabled);
  }
  if (nIcon) {
    nIcon.style.color = notificationsEnabled ? 'var(--accent-yellow)' : 'var(--text-muted)';
  }
}
window.updateMenuStates = updateMenuStates;

// --- CONSULTOR DE BEM-ESTAR ---
window.toggleWellbeing = function (show) {
  const panel = document.getElementById('wellbeing-panel');
  const overlay = document.getElementById('wellbeing-overlay');
  if (!panel || !overlay) return;
  panel.classList.toggle('active', !!show);
  overlay.classList.toggle('active', !!show);
  panel.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) updateWellbeingRecommendations();
};

function updateWellbeingRecommendations() {
  const container = document.getElementById('wellbeing-content');
  if (!container) return;
  if (!globalWeatherData) {
    container.innerHTML = `
      <div class="wellbeing-empty">
          <i data-lucide="cloud-off" width="24" height="24"></i>
          <p>Nenhum dado meteorológico disponível para análise.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const c = globalWeatherData.current;
  const h = globalWeatherData.hourly;
  const d = globalWeatherData.daily;
  const startIndex = getCurrentHourlyIndex(h, c);

  // Dados atuais
  const isDay = c.is_day === 1;
  const uv = h.uv_index && h.uv_index[startIndex] != null ? h.uv_index[startIndex] : 0;
  const temp = c.temperature_2m;
  const feels = c.apparent_temperature != null ? c.apparent_temperature : temp;
  const humidity = c.relative_humidity_2m;
  const wind = c.wind_speed_10m || 0;
  const rain = c.precipitation || 0;

  const recommendations = [];

  // 1. Recomendação de Proteção UV
  if (!isDay) {
    // À noite o UV é zero: mostra o pico previsto para o próximo período de sol
    const beforeSunrise = d.sunrise && d.sunrise[1] && c.time < d.sunrise[1];
    const nextIdx = beforeSunrise ? 1 : 2;
    const nextUvMax = d.uv_index_max && d.uv_index_max[nextIdx];
    recommendations.push({
      category: 'uv',
      icon: 'moon',
      title: 'Sem Radiação UV Agora',
      desc:
        nextUvMax != null
          ? `É noite, sem exposição solar. O índice UV máximo previsto para ${beforeSunrise ? 'hoje' : 'amanhã'} é ${nextUvMax.toFixed(1)}${nextUvMax >= 3 ? ', então separe o protetor solar.' : '.'}`
          : 'É noite, sem exposição solar.'
    });
  } else if (uv >= 8) {
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
  } else if (humidity <= 30) {
    recommendations.push({
      category: 'hydration',
      icon: 'droplets',
      title: 'Ar Muito Seco',
      desc: `Umidade relativa em ${humidity}%. Hidrate-se com frequência, use hidratante labial e umidificador para aliviar as vias respiratórias.`
    });
  } else if (humidity <= 40) {
    recommendations.push({
      category: 'hydration',
      icon: 'droplets',
      title: 'Ar Seco',
      desc: `Umidade relativa em ${humidity}%. Aumente a ingestão de água e evite ambientes muito climatizados por longos períodos.`
    });
  } else {
    recommendations.push({
      category: 'hydration',
      icon: 'glass-water',
      title: 'Hidratação Normal',
      desc: `Umidade em ${humidity}%. Mantenha o consumo regular de cerca de 2L/dia de água.`
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
      desc: `Clima ideal de ${temp.toFixed(0)}°C e sem chuva no momento. Perfeito para corrida, caminhada ou ciclismo.`
    });
  } else {
    recommendations.push({
      category: 'activity',
      icon: 'dumbbell',
      title: 'Atividade Física Moderada',
      desc: 'Condições menos favoráveis para treinos intensos. Prefira o início da manhã ou o fim da tarde e respeite seus limites.'
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
      desc: 'Equilíbrio harmonioso de temperatura e ventilação, com sensação neutra e agradável.'
    });
  }

  container.innerHTML = recommendations
    .map(
      (r) => `
        <div class="wellbeing-card ${r.category}">
            <div class="wellbeing-card-title">
                <i data-lucide="${r.icon}" width="18" height="18"></i>
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
  // Desativar nunca depende de permissão
  if (notificationsEnabled) {
    setNotificationsEnabled(false);
    showToast('Notificações desativadas');
    return;
  }

  if (!('Notification' in window)) {
    showToast('Seu navegador não suporta notificações.');
    return;
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission !== 'granted') {
    showToast('Notificações bloqueadas. Habilite nas configurações do navegador.');
    return;
  }

  setNotificationsEnabled(true);
  sendWeatherNotification(
    'AeroSky - Conectado! 🚀',
    'Notificações inteligentes ativas. Você receberá alertas de clima severo para a cidade exibida.',
    true,
    'welcome'
  );
};

function setNotificationsEnabled(enabled) {
  notificationsEnabled = enabled;
  try {
    localStorage.setItem('notif_enabled', String(enabled));
  } catch (e) {
    /* armazenamento indisponível */
  }
  updateNotifBadge();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (badge) badge.classList.toggle('active', notificationsEnabled);
  const btn = document.getElementById('btn-notifications');
  if (btn) {
    const label = notificationsEnabled
      ? 'Notificações ativas (clique para desativar)'
      : 'Ativar notificações de alerta';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', notificationsEnabled ? 'true' : 'false');
  }
  updateMenuStates();
}

async function sendWeatherNotification(title, body, bypassCooldown = false, category = '') {
  if (!notificationsEnabled || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const key = `notif_${(title + '_' + category).replace(/[\s\W]/g, '_')}`;
  if (!bypassCooldown) {
    try {
      const lastSent = parseInt(localStorage.getItem(key) || '0', 10);
      const now = Date.now();
      if (now - lastSent < 30 * 60 * 1000) return; // 30 min cooldown
      localStorage.setItem(key, now.toString());
    } catch (e) {
      /* armazenamento indisponível: envia mesmo assim */
    }
  }

  const options = {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    tag: key
  };

  try {
    // No Android, "new Notification()" lança exceção: o caminho correto é via Service Worker
    const reg =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch (e) {
    console.warn('Falha ao exibir notificação:', e);
  }
}

// --- SISTEMA DE ALERTAS SEVEROS ---
function checkAlerts(current, daily) {
  const container = document.getElementById('alert-container');
  if (!container) return;
  container.innerHTML = '';
  const alerts = [];

  const code = current.weather_code;
  const gusts = current.wind_gusts_10m || 0;
  const tempFeels =
    current.apparent_temperature != null ? current.apparent_temperature : current.temperature_2m;
  const tempReal = current.temperature_2m;
  const uvMax = daily.uv_index_max && daily.uv_index_max[1] != null ? daily.uv_index_max[1] : 0;

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
    const severe = gusts >= 60;
    alerts.push({
      type: severe ? 'danger' : 'warning',
      category: 'wind',
      icon: 'wind',
      text: `${severe ? 'PERIGO' : 'ATENÇÃO'}: Rajadas de vento de ${Math.round(gusts)} km/h. ${severe ? 'Risco de queda de galhos e destelhamentos.' : 'Tenha cuidado ao ar livre.'}`
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
    div.setAttribute('role', 'alert');
    div.innerHTML = `<i data-lucide="${al.icon}" width="20" height="20" class="alert-icon"></i> <span>${escapeHtml(al.text)}</span>`;
    container.appendChild(div);
  });

  if (alerts.length === 0) return;
  if (window.lucide) lucide.createIcons();

  // Só notifica com dados recém-obtidos da rede (não com previsão em cache)
  if (Date.now() - lastFetchTime < 60000) {
    alerts.forEach((al) => {
      sendWeatherNotification(`⚠️ Alerta Clima - ${currentCityName}`, al.text, false, al.category);
    });
  }
}

// --- PREVISÃO DO TEMPO (24H E 7 DIAS) ---
function renderForecast() {
  if (!globalWeatherData) return;
  const container = document.getElementById('forecast-container');
  if (!container) return;

  const c = globalWeatherData.current;
  const h = globalWeatherData.hourly;
  const d = globalWeatherData.daily;
  if (!h || !h.time) return;

  container.innerHTML = '';
  container.classList.toggle('is-daily', currentForecastTab === '7d');
  const startIndex = getCurrentHourlyIndex(h, c);

  if (currentForecastTab === '24h') {
    const isNext24h = selectedDayIndex === 0;
    const startLoop = isNext24h ? startIndex : selectedDayIndex * 24;
    const endLoop = startLoop + 23;

    for (let i = startLoop; i <= endLoop && i < h.time.length; i++) {
      if (!h.time[i]) continue;
      const hour = parseInt(h.time[i].slice(11, 13), 10);
      const isHDay = h.is_day ? h.is_day[i] === 1 : hour >= 6 && hour < 18;
      const hwmo = parseWMO(h.weather_code[i], isHDay);
      const temp = h.temperature_2m[i];
      const prob = h.precipitation_probability ? h.precipitation_probability[i] : null;
      const isNow = i === startIndex;

      const card = document.createElement('div');
      card.className = `hour-card ${isNow ? 'now' : ''}`;
      card.title = hwmo.t;
      card.innerHTML = `
        <div class="hour-time">${isNow ? 'Agora' : formatHourLabel(h.time[i])}</div>
        <i data-lucide="${hwmo.i}" width="26" height="26" style="color:${hwmo.c};"></i>
        <div class="hour-temp">${temp != null ? Math.round(temp) : '--'}°</div>
        <div class="hour-prob">${prob != null ? prob + '%' : '--'}</div>
      `;
      container.appendChild(card);
    }
  } else {
    if (!d || !d.time) return;
    const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 1; i < Math.min(8, d.time.length); i++) {
      const dDate = new Date(d.time[i] + 'T12:00:00');
      const dwmo = parseWMO(d.weather_code[i], true);
      const isToday = i === 1;
      const maxT = d.temperature_2m_max && d.temperature_2m_max[i] != null ? Math.round(d.temperature_2m_max[i]) : '--';
      const minT = d.temperature_2m_min && d.temperature_2m_min[i] != null ? Math.round(d.temperature_2m_min[i]) : '--';
      const rainSum = d.precipitation_sum && d.precipitation_sum[i] != null ? d.precipitation_sum[i] : 0;
      const probMax =
        d.precipitation_probability_max && d.precipitation_probability_max[i] != null
          ? d.precipitation_probability_max[i]
          : null;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `hour-card day-card ${isToday ? 'now' : ''}`;
      card.title = `${dwmo.t} — ver previsão de 24h deste dia`;
      card.addEventListener('click', () => viewDayForecast(i));
      card.innerHTML = `
        <div class="hour-time day-name">${isToday ? 'Hoje' : daysOfWeek[dDate.getDay()]}</div>
        <i data-lucide="${dwmo.i}" width="26" height="26" class="day-icon" style="color:${dwmo.c};"></i>
        <div class="hour-prob day-prob">${probMax != null ? probMax + '%' : '--'}</div>
        <div class="day-rain">${rainSum.toFixed(1)} mm</div>
        <div class="hour-temp day-temp">
            <span class="t-max">${maxT}°</span>
            <span class="t-min">${minT}°</span>
        </div>
      `;
      container.appendChild(card);
    }
  }

  if (window.lucide) lucide.createIcons();
}
window.renderForecast = renderForecast;

function setForecastTitle(text) {
  const titleEl = document.getElementById('forecast-header-title');
  if (titleEl) {
    titleEl.innerHTML = `<i data-lucide="calendar-clock"></i> ${escapeHtml(text)}`;
  }
}

function setForecastTabButtons(tab) {
  const btn24h = document.getElementById('btn-24h');
  const btn7d = document.getElementById('btn-7d');
  if (btn24h) {
    btn24h.classList.toggle('active', tab === '24h');
    btn24h.setAttribute('aria-pressed', tab === '24h' ? 'true' : 'false');
  }
  if (btn7d) {
    btn7d.classList.toggle('active', tab === '7d');
    btn7d.setAttribute('aria-pressed', tab === '7d' ? 'true' : 'false');
  }
}

window.switchForecast = function (tab) {
  currentForecastTab = tab;
  if (tab === '24h') selectedDayIndex = 0;
  setForecastTitle(tab === '24h' ? 'Próximas 24h' : 'Próximos 7 dias');
  setForecastTabButtons(tab);
  renderForecast();
  const container = document.getElementById('forecast-container');
  if (container) container.scrollLeft = 0;
};

window.viewDayForecast = function (dayIndex) {
  currentForecastTab = '24h';
  selectedDayIndex = dayIndex;
  setForecastTabButtons('24h');

  const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  if (globalWeatherData && globalWeatherData.daily && globalWeatherData.daily.time) {
    const d = globalWeatherData.daily;
    const dDate = new Date(d.time[dayIndex] + 'T12:00:00');
    const dayName = dayIndex === 1 ? 'Hoje' : daysOfWeek[dDate.getDay()];
    setForecastTitle(dayIndex === 1 ? 'Hoje' : dayName);
  }
  renderForecast();
  const container = document.getElementById('forecast-container');
  if (container) container.scrollLeft = 0;
};

// --- ALTERNADOR SOLAR / LUNAR (CICLOS CELESTES) ---
window.switchAstro = function (tab) {
  const btnSolar = document.getElementById('btn-solar');
  const btnLunar = document.getElementById('btn-lunar');
  const viewSolar = document.getElementById('astro-solar-view');
  const viewLunar = document.getElementById('astro-lunar-view');

  if (btnSolar) btnSolar.classList.toggle('active', tab === 'solar');
  if (btnLunar) btnLunar.classList.toggle('active', tab === 'lunar');
  if (viewSolar) viewSolar.style.display = tab === 'solar' ? 'flex' : 'none';
  if (viewLunar) viewLunar.style.display = tab === 'lunar' ? 'flex' : 'none';
};

// --- FORMATADORES ---
function getTrend(current, previous) {
  let icon = 'minus';
  let color = 'var(--text-muted)';
  let label = 'Estável';
  if (current != null && previous != null) {
    if (current > previous) {
      icon = 'trending-up';
      color = '#4ade80';
      label = 'Subindo';
    } else if (current < previous) {
      icon = 'trending-down';
      color = '#fb923c';
      label = 'Descendo';
    }
  }
  return `<span class="trend-icon" title="${label}"><i data-lucide="${icon}" width="14" height="14" color="${color}" aria-label="${label}"></i></span>`;
}

// --- ATUALIZAÇÃO GERAL DA INTERFACE (POPULATE UI) ---
function populateUI() {
  if (!globalWeatherData) return;
  const c = globalWeatherData.current;
  const h = globalWeatherData.hourly;
  const d = globalWeatherData.daily;
  if (!c || !h || !d) return;

  const isDay = c.is_day === 1;
  const wmo = parseWMO(c.weather_code, isDay);

  updateSeason();
  updateClock();
  checkAlerts(c, d);

  // Background dinâmico
  const bg = document.getElementById('weather-bg');
  if (bg) {
    if (c.precipitation > 0) bg.className = 'bg-rain';
    else bg.className = isDay ? 'bg-day' : 'bg-night';
  }

  // Atualiza motor de partículas dinâmicas
  WeatherParticles.setWeatherCondition(
    c.weather_code,
    c.is_day,
    c.wind_speed_10m,
    c.wind_direction_10m
  );

  // Atualiza favoritos (barra e estrela)
  FavoritesManager.renderFavoritesBar();
  FavoritesManager.updateFavoriteStar();

  // Visão Geral
  const valTemp = document.getElementById('val-temp');
  if (valTemp) valTemp.innerHTML = `${c.temperature_2m.toFixed(1)}<span>°</span>`;
  const valDesc = document.getElementById('val-desc');
  if (valDesc) valDesc.innerText = wmo.t;

  // Tendência da temperatura em relação à hora anterior
  const currentHourOffset = getCurrentHourlyIndex(h, c);
  const prevHourOffset = Math.max(0, currentHourOffset - 1);
  const prevTemp =
    h.temperature_2m && h.temperature_2m[prevHourOffset] != null
      ? h.temperature_2m[prevHourOffset]
      : c.temperature_2m;
  const diffTemp = Math.round((c.temperature_2m - prevTemp) * 10) / 10;

  const trendTempEl = document.getElementById('trend-temp');
  if (trendTempEl) {
    const dir = diffTemp > 0 ? 'up' : diffTemp < 0 ? 'down' : 'flat';
    const icon = { up: 'trending-up', down: 'trending-down', flat: 'minus' }[dir];
    const text = (diffTemp > 0 ? '+' : '') + diffTemp.toFixed(1) + '° em 1h';
    trendTempEl.className = `trend-chip ${dir}`;
    trendTempEl.innerHTML = `<i data-lucide="${icon}" width="14" height="14"></i><span>${text}</span>`;
  }

  const valUpdated = document.getElementById('val-updated');
  if (valUpdated && lastFetchTime) {
    valUpdated.innerText = `Atualizado às ${formatTimeInCity(lastFetchTime)}`;
  }

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

  // O ícone principal precisa ser recriado: o lucide substitui o <i> por <svg>
  const iconWrapper = document.querySelector('.main-icon-wrapper');
  if (iconWrapper) {
    iconWrapper.innerHTML = `<i data-lucide="${wmo.i}" id="main-icon" stroke-width="1.5" style="color:${wmo.c}; filter: drop-shadow(0 0 22px ${wmo.c}66);" aria-label="${escapeHtml(wmo.t)}"></i>`;
  }

  // Céu: curva solar do dia, fase e posição da Lua
  renderSky();

  // Bússola de Vento
  const originDir = c.wind_direction_10m || 0;
  const destDir = (originDir + 180) % 360;

  const windNeedle = document.getElementById('wind-needle');
  if (windNeedle) windNeedle.style.transform = `rotate(${destDir}deg)`;
  const valWindSfc = document.getElementById('val-wind-sfc');
  if (valWindSfc) valWindSfc.innerText = Math.round(c.wind_speed_10m || 0);
  const valWindDest = document.getElementById('val-wind-dest');
  if (valWindDest) valWindDest.innerText = getWindDirectionStr(destDir);

  // Previsão Horária e Diária
  renderForecast();

  // Tendências Atmosféricas
  const startIndex = currentHourOffset;
  const prevIndex = prevHourOffset;

  const valHum = document.getElementById('val-humidity');
  if (valHum) valHum.innerText = c.relative_humidity_2m != null ? c.relative_humidity_2m : '--';
  const trendHum = document.getElementById('trend-humidity');
  if (trendHum) {
    trendHum.innerHTML = getTrend(
      c.relative_humidity_2m,
      h.relative_humidity_2m ? h.relative_humidity_2m[prevIndex] : null
    );
  }

  const valPress = document.getElementById('val-pressure');
  if (valPress) valPress.innerText = c.pressure_msl != null ? Math.round(c.pressure_msl) : '--';
  const trendPress = document.getElementById('trend-pressure');
  if (trendPress) {
    trendPress.innerHTML = getTrend(c.pressure_msl, h.pressure_msl ? h.pressure_msl[prevIndex] : null);
  }

  const valVis = document.getElementById('val-vis');
  if (valVis) valVis.innerText = c.visibility != null ? (c.visibility / 1000).toFixed(1) : '--';
  const trendVis = document.getElementById('trend-vis');
  if (trendVis) {
    trendVis.innerHTML = getTrend(c.visibility, h.visibility ? h.visibility[prevIndex] : null);
  }

  // Índice UV Atual
  const currentUv = h.uv_index && h.uv_index[startIndex] != null ? h.uv_index[startIndex] : 0;
  const prevUv = h.uv_index && h.uv_index[prevIndex] != null ? h.uv_index[prevIndex] : 0;
  const valUv = document.getElementById('val-uv');
  if (valUv) valUv.innerText = currentUv.toFixed(1);
  const trendUv = document.getElementById('trend-uv');
  if (trendUv) trendUv.innerHTML = getTrend(currentUv, prevUv);

  const uvPct = Math.max(0, Math.min(1, currentUv / 11));
  const uvRing = document.getElementById('uv-ring-mini');
  if (uvRing) uvRing.style.strokeDashoffset = 200 - 200 * uvPct;

  // Nebulosidade
  const valCloud = document.getElementById('val-cloud');
  if (valCloud) valCloud.innerText = c.cloud_cover != null ? c.cloud_cover : '--';
  const trendCloud = document.getElementById('trend-cloud');
  if (trendCloud) {
    trendCloud.innerHTML = getTrend(c.cloud_cover, h.cloud_cover ? h.cloud_cover[prevIndex] : null);
  }

  // Ponto de Orvalho Atual
  const currentDew =
    h.dew_point_2m && h.dew_point_2m[startIndex] != null ? h.dew_point_2m[startIndex] : null;
  const prevDew =
    h.dew_point_2m && h.dew_point_2m[prevIndex] != null ? h.dew_point_2m[prevIndex] : null;
  const valDew = document.getElementById('val-dew');
  if (valDew) valDew.innerText = currentDew != null ? currentDew.toFixed(1) : '--';
  const trendDew = document.getElementById('trend-dew');
  if (trendDew) trendDew.innerHTML = getTrend(currentDew, prevDew);

  if (window.lucide) lucide.createIcons();

  renderCharts(h);

  // Mantém o painel de bem-estar sincronizado se estiver aberto
  const wellbeingPanel = document.getElementById('wellbeing-panel');
  if (wellbeingPanel && wellbeingPanel.classList.contains('active')) {
    updateWellbeingRecommendations();
  }

  hideLoader();
}
