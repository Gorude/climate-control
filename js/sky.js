/**
 * AeroSky - Céu: posição do Sol e da Lua, curva solar do dia e fase lunar.
 *
 * Os cálculos astronômicos seguem as fórmulas de Jean Meeus ("Astronomical Algorithms")
 * na forma simplificada popularizada pela biblioteca SunCalc (Vladimir Agafonkin, BSD-2).
 * A precisão (~1 min nos horários, <1° nas posições) é mais que suficiente para a interface.
 *
 * Textura da Lua: NASA Scientific Visualization Studio (domínio público).
 */

const Astro = (() => {
  const PI = Math.PI;
  const rad = PI / 180;
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const e = rad * 23.4397; // obliquidade da eclíptica

  const toJulian = (date) => date / dayMs - 0.5 + J1970;
  const fromJulian = (j) => (j + 0.5 - J1970) * dayMs;
  const toDays = (date) => toJulian(date) - J2000;

  const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const astroRefraction = (h) => {
    const hh = Math.max(h, 0);
    return 0.0002967 / Math.tan(hh + 0.00312536 / (hh + 0.08901179));
  };

  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + rad * 102.9372 + PI;
  };
  const sunCoords = (d) => {
    const L = eclipticLongitude(solarMeanAnomaly(d));
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  };

  /** Azimute em graus de bússola (0 = Norte, 90 = Leste) */
  const toCompass = (az) => ((az / rad + 180) % 360 + 360) % 360;

  function sunPosition(ms, lat, lon) {
    const lw = rad * -lon;
    const phi = rad * lat;
    const d = toDays(ms);
    const c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    return { altitude: altitude(H, phi, c.dec) / rad, azimuth: toCompass(azimuth(H, phi, c.dec)) };
  }

  // Horários do Sol (nascer/pôr, crepúsculo, golden hour, meio-dia solar)
  const J0 = 0.0009;
  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h, phi, dec) =>
    Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

  function sunTimes(ms, lat, lon) {
    const lw = rad * -lon;
    const phi = rad * lat;
    const d = toDays(ms);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L, 0);
    const Jnoon = solarTransitJ(ds, M, L);
    const result = { solarNoon: fromJulian(Jnoon) };
    const defs = [
      [-0.833, 'sunrise', 'sunset'],
      [-6, 'dawn', 'dusk'],
      [6, 'goldenHourEnd', 'goldenHourStart']
    ];
    defs.forEach(([h, riseKey, setKey]) => {
      const w = hourAngle(h * rad, phi, dec);
      if (Number.isNaN(w)) {
        result[riseKey] = result[setKey] = null; // dia/noite polar
        return;
      }
      const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
      result[riseKey] = fromJulian(Jnoon - (Jset - Jnoon));
      result[setKey] = fromJulian(Jset);
    });
    return result;
  }

  // Lua
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d);
    const M = rad * (134.963 + 13.064993 * d);
    const F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M);
    const b = rad * 5.128 * Math.sin(F);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }

  function moonPosition(ms, lat, lon) {
    const lw = rad * -lon;
    const phi = rad * lat;
    const d = toDays(ms);
    const c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    let h = altitude(H, phi, c.dec);
    h += astroRefraction(h);
    // Ponto sublunar: onde a Lua está a pino (longitude = AR − tempo sideral de Greenwich)
    let subLon = (c.ra - siderealTime(d, 0)) / rad;
    subLon = ((((subLon + 180) % 360) + 360) % 360) - 180;
    return {
      altitude: h / rad,
      azimuth: toCompass(azimuth(H, phi, c.dec)),
      distance: c.dist,
      subLat: c.dec / rad,
      subLon
    };
  }

  /** Nascer e pôr da Lua nas 24h a partir de startMs (meia-noite local da cidade) */
  function moonTimes(startMs, lat, lon) {
    const hc = 0.133 * rad;
    const altAt = (hours) => moonPosition(startMs + hours * 3600000, lat, lon).altitude * rad - hc;
    let h0 = altAt(0);
    let rise = null;
    let set = null;
    let ye = 0;
    for (let i = 1; i <= 24; i += 2) {
      const h1 = altAt(i);
      const h2 = altAt(i + 1);
      const a = (h0 + h2) / 2 - h1;
      const b = (h2 - h0) / 2;
      const xe = -b / (2 * a);
      ye = (a * xe + b) * xe + h1;
      const disc = b * b - 4 * a * h1;
      let roots = 0;
      let x1 = 0;
      let x2 = 0;
      if (disc >= 0) {
        const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
        x1 = xe - dx;
        x2 = xe + dx;
        if (Math.abs(x1) <= 1) roots++;
        if (Math.abs(x2) <= 1) roots++;
        if (x1 < -1) x1 = x2;
      }
      if (roots === 1) {
        if (h0 < 0) rise = i + x1;
        else set = i + x1;
      } else if (roots === 2) {
        rise = i + (ye < 0 ? x2 : x1);
        set = i + (ye < 0 ? x1 : x2);
      }
      if (rise !== null && set !== null) break;
      h0 = h2;
    }
    return {
      rise: rise !== null ? startMs + rise * 3600000 : null,
      set: set !== null ? startMs + set * 3600000 : null,
      alwaysUp: rise === null && set === null && ye > 0,
      alwaysDown: rise === null && set === null && ye <= 0
    };
  }

  return { sunPosition, sunTimes, moonPosition, moonTimes };
})();

window.Astro = Astro;

// ---------------------------------------------------------------------------
// Renderização do cartão "Céu"
// ---------------------------------------------------------------------------
const LUNAR_MONTH = 29.53058867;
const KNOWN_NEW_MOON = 1704974220000; // 11/01/2024 11:57 UTC

const SUN_CHART = { w: 320, h: 132, left: 10, right: 310, horizon: 96, upScale: 80, downScale: 26 };

function skyFormatDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

function skyFormatDate(ms) {
  const options = { weekday: 'short', day: '2-digit', month: '2-digit' };
  if (globalWeatherData && globalWeatherData.timezone) options.timeZone = globalWeatherData.timezone;
  try {
    return new Date(ms).toLocaleDateString('pt-BR', options).replace('.', '');
  } catch (e) {
    return new Date(ms).toLocaleDateString('pt-BR');
  }
}

/** Instante UTC da meia-noite local da cidade para a data de c.time */
function cityMidnightMs() {
  const c = globalWeatherData.current;
  const offset = globalWeatherData.utc_offset_seconds || 0;
  return Date.parse(c.time.slice(0, 10) + 'T00:00:00Z') - offset * 1000;
}

function sunY(alt) {
  const { horizon, upScale, downScale } = SUN_CHART;
  return alt >= 0 ? horizon - (alt / 90) * upScale : horizon - (alt / 90) * downScale;
}

function sunX(hours) {
  const { left, right } = SUN_CHART;
  return left + (hours / 24) * (right - left);
}

function renderSunChart(midnight, nowMs, times) {
  const svg = document.getElementById('sun-chart');
  if (!svg) return;
  const { w, h, left, right, horizon } = SUN_CHART;

  // Curva de altitude ao longo do dia (a cada 15 min)
  const pts = [];
  for (let m = 0; m <= 24 * 60; m += 15) {
    const alt = Astro.sunPosition(midnight + m * 60000, LAT, LON).altitude;
    pts.push([sunX(m / 60), sunY(alt), alt]);
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${right} ${horizon} L${left} ${horizon} Z`;

  const nowHours = (nowMs - midnight) / 3600000;
  const now = Astro.sunPosition(nowMs, LAT, LON);
  const nowX = sunX(Math.min(24, Math.max(0, nowHours)));
  const nowY = sunY(now.altitude);
  const isUp = now.altitude > -0.833;

  const peak = pts.reduce((best, p) => (p[2] > best[2] ? p : best), pts[0]);
  const markerAt = (ms) => (ms ? sunX((ms - midnight) / 3600000) : null);
  const riseX = markerAt(times.sunrise);
  const setX = markerAt(times.sunset);

  const ticks = [0, 6, 12, 18, 24]
    .map((hr) => `<text x="${sunX(hr)}" y="${h - 4}" class="sun-axis" text-anchor="${hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle'}">${hr}h</text>`)
    .join('');

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="sun-area-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffb703" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#ffb703" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="night-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="sun-above"><rect x="0" y="0" width="${w}" height="${horizon}"/></clipPath>
      <clipPath id="sun-past"><rect x="0" y="0" width="${nowX}" height="${h}"/></clipPath>
      <filter id="sun-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
    </defs>
    <rect x="${left}" y="${horizon}" width="${right - left}" height="${h - 18 - horizon}" fill="url(#night-grad)"/>
    <path d="${area}" fill="url(#sun-area-grad)" clip-path="url(#sun-above)"/>
    <path d="${line}" class="sun-curve-night"/>
    <path d="${line}" class="sun-curve-day" clip-path="url(#sun-above)"/>
    <g clip-path="url(#sun-past)"><path d="${line}" class="sun-curve-traveled" clip-path="url(#sun-above)"/></g>
    <line x1="${left}" x2="${right}" y1="${horizon}" y2="${horizon}" class="sun-horizon"/>
    ${riseX != null ? `<circle cx="${riseX}" cy="${horizon}" r="2.5" class="sun-marker"/>` : ''}
    ${setX != null ? `<circle cx="${setX}" cy="${horizon}" r="2.5" class="sun-marker"/>` : ''}
    ${peak[2] > 0 ? `<text x="${peak[0]}" y="${peak[1] - 7}" class="sun-peak" text-anchor="middle">${Math.round(peak[2])}°</text>` : ''}
    ${ticks}
    <circle cx="${nowX}" cy="${nowY}" r="${isUp ? 9 : 6}" class="${isUp ? 'sun-now-glow' : 'sun-now-glow night'}" filter="url(#sun-glow)"/>
    <circle cx="${nowX}" cy="${nowY}" r="5" class="${isUp ? 'sun-now' : 'sun-now night'}"/>
  `;
  svg.setAttribute(
    'aria-label',
    `Trajetória do Sol hoje. Altura máxima de ${Math.round(peak[2])} graus. Agora o Sol está ${
      isUp ? `a ${Math.round(now.altitude)} graus de altura` : 'abaixo do horizonte'
    }.`
  );
  return { now, isUp, peakAlt: peak[2] };
}

function renderSun() {
  const d = globalWeatherData.daily;
  const nowMs = Date.now();
  const midnight = cityMidnightMs();
  const times = Astro.sunTimes(midnight + 12 * 3600000, LAT, LON);

  // Horários exibidos vêm da API (mesma fonte do restante do app); a curva vem do cálculo
  const sunriseMs = d.sunrise && d.sunrise[1] ? Date.parse(d.sunrise[1] + ':00Z') - (globalWeatherData.utc_offset_seconds || 0) * 1000 : times.sunrise;
  const sunsetMs = d.sunset && d.sunset[1] ? Date.parse(d.sunset[1] + ':00Z') - (globalWeatherData.utc_offset_seconds || 0) * 1000 : times.sunset;
  const chart = renderSunChart(midnight, nowMs, { sunrise: sunriseMs, sunset: sunsetMs });

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('val-sunrise', sunriseMs ? formatTimeInCity(sunriseMs) : '--:--');
  setText('val-sunset', sunsetMs ? formatTimeInCity(sunsetMs) : '--:--');

  const daylight = sunsetMs && sunriseMs ? sunsetMs - sunriseMs : 0;
  setText('val-daylight', daylight ? skyFormatDuration(daylight) : '--');

  // Variação da duração do dia em relação a ontem
  const trendEl = document.getElementById('daylight-trend');
  if (trendEl && d.sunrise[0] && d.sunset[0] && daylight) {
    const yesterday = Date.parse(d.sunset[0] + ':00Z') - Date.parse(d.sunrise[0] + ':00Z');
    const deltaMin = Math.round((daylight - yesterday) / 60000);
    const sign = deltaMin > 0 ? '+' : deltaMin < 0 ? '−' : '±';
    trendEl.textContent = `${sign}${Math.abs(deltaMin)} min vs. ontem`;
    trendEl.className = `sky-delta ${deltaMin > 0 ? 'up' : deltaMin < 0 ? 'down' : ''}`;
  }

  // Meio-dia solar, golden hour e contagem regressiva
  setText(
    'val-solar-noon',
    times.solarNoon ? `${formatTimeInCity(times.solarNoon)} · ${Math.round(chart.peakAlt)}°` : '--'
  );
  setText(
    'val-golden-hour',
    times.goldenHourStart && sunsetMs ? `${formatTimeInCity(times.goldenHourStart)}–${formatTimeInCity(sunsetMs)}` : '--'
  );

  // Contagem regressiva para o próximo nascer ou pôr do sol
  let countdownLabel = 'Nasce em';
  let countdownMs = null;
  if (sunriseMs && nowMs < sunriseMs) {
    countdownMs = sunriseMs - nowMs;
  } else if (sunsetMs && nowMs < sunsetMs) {
    countdownLabel = 'Pôr do sol em';
    countdownMs = sunsetMs - nowMs;
  } else if (d.sunrise && d.sunrise[2]) {
    const tomorrowRise = Date.parse(d.sunrise[2] + ':00Z') - (globalWeatherData.utc_offset_seconds || 0) * 1000;
    countdownMs = tomorrowRise - nowMs;
  }
  setText('val-sun-countdown-label', countdownLabel);
  setText('val-sun-countdown', countdownMs != null ? skyFormatDuration(countdownMs) : '--');

  const SHORT_DIR = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const dirShort = SHORT_DIR[Math.round(chart.now.azimuth / 45) % 8];
  const sunNowEl = document.getElementById('val-sun-now');
  if (sunNowEl) {
    sunNowEl.textContent = chart.isUp ? `${Math.round(chart.now.altitude)}° · ${dirShort}` : 'Abaixo do horizonte';
    sunNowEl.title = chart.isUp
      ? `${Math.round(chart.now.altitude)}° de altura, na direção ${getWindDirectionStr(chart.now.azimuth)}`
      : '';
  }
}

function renderMoon() {
  const nowMs = Date.now();

  // Fase pela idade sinódica (mesma lógica de iluminação de antes)
  let phaseFraction = ((nowMs - KNOWN_NEW_MOON) / 86400000 % LUNAR_MONTH) / LUNAR_MONTH;
  if (phaseFraction < 0) phaseFraction += 1;

  let phaseName;
  if (phaseFraction < 0.03 || phaseFraction >= 0.97) phaseName = 'Lua Nova';
  else if (phaseFraction < 0.22) phaseName = 'Crescente';
  else if (phaseFraction < 0.28) phaseName = 'Quarto Crescente';
  else if (phaseFraction < 0.47) phaseName = 'Crescente Gibosa';
  else if (phaseFraction < 0.53) phaseName = 'Lua Cheia';
  else if (phaseFraction < 0.72) phaseName = 'Minguante Gibosa';
  else if (phaseFraction < 0.78) phaseName = 'Quarto Minguante';
  else phaseName = 'Minguante';

  const illumination = Math.round((0.5 - Math.cos(phaseFraction * Math.PI * 2) * 0.5) * 100);
  const ageDays = Math.floor(phaseFraction * LUNAR_MONTH);

  const sweepOut = phaseFraction <= 0.5 ? 1 : 0;
  let sweepRet;
  if (phaseFraction < 0.25) sweepRet = 0;
  else if (phaseFraction <= 0.5) sweepRet = 1;
  else if (phaseFraction < 0.75) sweepRet = 0;
  else sweepRet = 1;
  const rxMoon = 48 * Math.abs(Math.cos(phaseFraction * 2 * Math.PI));
  const litPath = `M 50 2 A 48 48 0 0 ${sweepOut} 50 98 A ${rxMoon} 48 0 0 ${sweepRet} 50 2`;

  const moonLitPath = document.getElementById('moon-lit-path');
  if (moonLitPath) moonLitPath.setAttribute('d', litPath);

  // No Hemisfério Sul a Lua é vista girada 180° (textura e iluminação juntas)
  const moonBody = document.getElementById('moon-body');
  if (moonBody) moonBody.setAttribute('transform', LAT < 0 ? 'rotate(180 50 50)' : '');

  // Brilho do halo acompanha a iluminação
  const moonSvg = document.getElementById('moon-svg');
  if (moonSvg) {
    moonSvg.style.filter = `drop-shadow(0 0 ${6 + illumination / 8}px rgba(255, 244, 214, ${0.06 + illumination / 450}))`;
    moonSvg.setAttribute('aria-label', `${phaseName}, ${illumination}% iluminada`);
  }

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('val-moon-phase', phaseName);
  setText('val-moon-ill', `${illumination}%`);
  setText('val-moon-age', `${ageDays} ${ageDays === 1 ? 'dia' : 'dias'}`);

  // Próximas fases principais
  const daysToFull = ((0.5 - phaseFraction + 1) % 1) * LUNAR_MONTH;
  const daysToNew = ((1 - phaseFraction) % 1) * LUNAR_MONTH;
  const showFullFirst = daysToFull <= daysToNew;
  const nextEl = document.getElementById('val-moon-next');
  if (nextEl) {
    const fullTxt = `Cheia ${skyFormatDate(nowMs + daysToFull * 86400000)}`;
    const newTxt = `Nova ${skyFormatDate(nowMs + daysToNew * 86400000)}`;
    nextEl.textContent = showFullFirst ? `${fullTxt} · ${newTxt}` : `${newTxt} · ${fullTxt}`;
  }

  // Nascer/pôr da Lua e posição atual no céu
  const midnight = cityMidnightMs();
  const times = Astro.moonTimes(midnight, LAT, LON);
  setText('val-moonrise', times.rise ? formatTimeInCity(times.rise) : times.alwaysUp ? 'Sempre acima' : '—');
  setText('val-moonset', times.set ? formatTimeInCity(times.set) : times.alwaysDown ? 'Sempre abaixo' : '—');

  const pos = Astro.moonPosition(nowMs, LAT, LON);
  const visible = pos.altitude > 0;
  const badge = document.getElementById('badge-moon-vis');
  if (badge) {
    badge.className = `moon-vis-badge ${visible ? 'visible' : ''}`;
    badge.title = `Calculado para ${currentCityName}`;
  }
  setText(
    'val-moon-vis',
    visible
      ? `Visível · ${Math.round(pos.altitude)}° de altura, ${getWindDirectionStr(pos.azimuth)}`
      : times.rise && times.rise > nowMs
        ? `Abaixo do horizonte · nasce às ${formatTimeInCity(times.rise)}`
        : 'Abaixo do horizonte'
  );
  const holder = document.getElementById('moon-vis-icon-holder');
  if (holder) holder.innerHTML = `<i data-lucide="${visible ? 'eye' : 'eye-off'}" width="12" height="12"></i>`;

  let region;
  const lon = pos.subLon;
  if (lon <= -130) region = 'Oceano Pacífico';
  else if (lon <= -80) region = 'América do Norte / Pacífico';
  else if (lon <= -35) region = 'América do Sul / Atlântico';
  else if (lon <= 20) region = 'Oceano Atlântico / África';
  else if (lon <= 60) region = 'África / Oriente Médio';
  else if (lon <= 120) region = 'Ásia / Oceano Índico';
  else region = 'Austrália / Pacífico';
  setText('val-moon-location', region);
}

function renderSky() {
  if (!globalWeatherData || !globalWeatherData.current || !globalWeatherData.daily) return;
  renderSun();
  renderMoon();
  if (window.lucide) lucide.createIcons();
}
window.renderSky = renderSky;

// Mantém a posição do Sol/Lua atualizada mesmo sem novos dados da API
setInterval(() => {
  if (!document.hidden) renderSky();
}, 60000);
