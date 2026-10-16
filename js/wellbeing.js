/**
 * AeroSky - Consultor de Bem-Estar
 *
 * Analisa as próximas horas da previsão (não só o momento atual) para gerar:
 *  - um índice de conforto ao ar livre (0–100) com resumo em linguagem natural;
 *  - o melhor horário para atividades ao ar livre, com o conforto hora a hora;
 *  - o que levar consigo (guarda-chuva, protetor, casaco...);
 *  - recomendações priorizadas por gravidade, sempre com horários concretos.
 *
 * Referências dos limiares: escala de índice UV da OMS; níveis de umidade relativa
 * usados pela Defesa Civil/INMET (atenção < 30%, alerta < 20%, emergência < 12%).
 */

const Wellbeing = (() => {
  const HORIZON = 18; // horas analisadas a partir de agora

  const SEVERITY = {
    critical: { rank: 0, label: 'Alerta', icon: 'octagon-alert' },
    warning: { rank: 1, label: 'Atenção', icon: 'triangle-alert' },
    info: { rank: 2, label: 'Dica', icon: 'info' },
    good: { rank: 3, label: 'Tudo certo', icon: 'circle-check' }
  };

  const fmt = (v, d = 0) =>
    v == null || Number.isNaN(v)
      ? '--'
      : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const hourLabel = (iso) => `${parseInt(iso.slice(11, 13), 10)}h`;
  const maxOf = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? Math.max(...v) : null;
  };
  const minOf = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? Math.min(...v) : null;
  };

  /** Conforto de uma hora para ficar ao ar livre (0–100) */
  function hourComfort(h, i) {
    let score = 100;
    const feels = h.apparent_temperature?.[i] ?? h.temperature_2m[i];
    if (feels != null) {
      if (feels < 18) score -= Math.min(50, (18 - feels) * 4);
      else if (feels > 26) score -= Math.min(55, (feels - 26) * 4.5);
    }
    const prob = h.precipitation_probability?.[i] ?? 0;
    if (prob > 20) score -= (prob - 20) * 0.6;
    if ((h.precipitation?.[i] ?? 0) >= 0.2) score -= 20;

    const wind = h.wind_speed_10m?.[i] ?? 0;
    if (wind > 20) score -= (wind - 20) * 1.2;
    if ((h.wind_gusts_10m?.[i] ?? 0) > 45) score -= 10;

    const isDay = h.is_day ? h.is_day[i] === 1 : true;
    const uv = h.uv_index?.[i] ?? 0;
    if (isDay && uv >= 8) score -= 15;
    else if (isDay && uv >= 6) score -= 8;

    const dew = h.dew_point_2m?.[i];
    if (dew != null && dew > 20) score -= (dew - 20) * 4;
    const hum = h.relative_humidity_2m?.[i];
    if (hum != null && hum < 30) score -= (30 - hum) * 0.8;

    if (!isDay) score -= 8; // leve preferência por horários com luz natural
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  function comfortLabel(score) {
    if (score >= 80) return { text: 'Excelente', plural: 'excelentes', tone: 'good' };
    if (score >= 65) return { text: 'Bom', plural: 'boas', tone: 'good' };
    if (score >= 45) return { text: 'Razoável', plural: 'razoáveis', tone: 'warning' };
    return { text: 'Desfavorável', plural: 'desfavoráveis', tone: 'serious' };
  }

  /** "13h–17h", ou "às 13h" quando o período tem uma hora só */
  const formatSpan = (from, to) => (from === to ? `às ${hourLabel(from)}` : `${hourLabel(from)}–${hourLabel(to)}`);

  /** Primeira e última hora (dentro da janela) em que a condição é verdadeira */
  function spanWhere(times, values, test) {
    let first = -1;
    let last = -1;
    values.forEach((v, i) => {
      if (v != null && test(v)) {
        if (first < 0) first = i;
        last = i;
      }
    });
    return first < 0 ? null : { from: times[first], to: times[last], fromIdx: first };
  }

  function analyze(data) {
    const c = data.current;
    const h = data.hourly;
    const d = data.daily;
    const start = getCurrentHourlyIndex(h, c);
    const end = Math.min(h.time.length, start + HORIZON);
    const idx = [];
    for (let i = start; i < end; i++) idx.push(i);
    const take = (key) => idx.map((i) => (h[key] ? h[key][i] : null));

    const times = take('time');
    const feels = idx.map((i) => h.apparent_temperature?.[i] ?? h.temperature_2m[i]);
    const temps = take('temperature_2m');
    const prob = take('precipitation_probability');
    const rain = take('precipitation');
    const uv = take('uv_index');
    const hum = take('relative_humidity_2m');
    const dew = take('dew_point_2m');
    const wind = take('wind_speed_10m');
    const gust = take('wind_gusts_10m');
    const isDay = idx.map((i) => (h.is_day ? h.is_day[i] === 1 : true));
    const todayIso = c.time.slice(0, 10);

    const comfort = idx.map((i) => hourComfort(h, i));
    const nowScore = comfort[0];

    // Melhor janela de 2h para atividades ao ar livre
    // (sugere apenas horários razoáveis para se exercitar: início entre 5h e 21h)
    let best = null;
    for (let k = 0; k < comfort.length - 1; k++) {
      const startHour = parseInt(times[k].slice(11, 13), 10);
      if (startHour < 5 || startHour > 21) continue;
      const avg = (comfort[k] + comfort[k + 1]) / 2;
      if (!best || avg > best.avg) best = { k, avg };
    }

    const recs = [];
    const carry = [];
    const nowFeels = c.apparent_temperature ?? c.temperature_2m;

    // --- Chuva ---
    const raining = (c.precipitation || 0) > 0;
    const rainSpan = spanWhere(times, prob, (p) => p >= 40);
    const rainTotal = rain.slice(0, 12).reduce((s, v) => s + (v || 0), 0);
    const maxProb12 = maxOf(prob.slice(0, 12)) || 0;
    if (raining) {
      recs.push({
        sev: [65, 81, 82, 95, 96, 99].includes(c.weather_code) ? 'critical' : 'warning',
        icon: 'cloud-rain',
        title: 'Chovendo agora',
        desc: `Precipitação de ${fmt(c.precipitation, 1)} mm no momento. Prefira atividades em locais cobertos e redobre a atenção no trânsito.`,
        when: rainSpan ? `Chance alta até ${hourLabel(rainSpan.to)}` : null
      });
    } else if (rainSpan && rainSpan.fromIdx < 12) {
      recs.push({
        sev: 'warning',
        icon: 'umbrella',
        title: `Chuva provável a partir das ${hourLabel(rainSpan.from)}`,
        desc: `Até ${fmt(maxProb12)}% de chance${rainTotal >= 0.1 ? ` e ${fmt(rainTotal, 1)} mm previstos nas próximas 12h` : ''}. Planeje deslocamentos e atividades externas antes disso.`,
        when: formatSpan(rainSpan.from, rainSpan.to)
      });
    }
    if (raining || maxProb12 >= 40 || rainTotal >= 1) carry.push({ icon: 'umbrella', label: 'Guarda-chuva' });

    // --- Radiação UV (somente horas de sol de hoje) ---
    const uvToday = uv.map((v, i) => (isDay[i] && times[i].startsWith(todayIso) ? v : null));
    const uvMaxToday = maxOf(uvToday);
    const highUv = spanWhere(times, uvToday, (v) => v >= 6);
    if (highUv) {
      const extreme = uvMaxToday >= 8;
      recs.push({
        sev: extreme ? 'critical' : 'warning',
        icon: 'sun',
        title: extreme ? 'Radiação UV muito alta' : 'Radiação UV alta',
        desc: `Índice UV chega a ${fmt(uvMaxToday, 1)}. Use protetor FPS ${extreme ? '50+' : '30+'}, reaplique a cada 2 horas e prefira a sombra nesse período.`,
        when: formatSpan(highUv.from, highUv.to)
      });
    } else if (uvMaxToday != null && uvMaxToday >= 3) {
      recs.push({
        sev: 'info',
        icon: 'sun-medium',
        title: 'UV moderado',
        desc: `Índice UV máximo de ${fmt(uvMaxToday, 1)} no restante do dia. Protetor solar é recomendado para exposições longas, mesmo com nuvens.`
      });
    }
    if (uvMaxToday != null && uvMaxToday >= 3) carry.push({ icon: 'spray-can', label: 'Protetor solar' });
    if (uvMaxToday != null && uvMaxToday >= 6) carry.push({ icon: 'glasses', label: 'Óculos de sol' });

    // --- Calor e hidratação ---
    const maxFeels = maxOf(feels);
    const minFeels = minOf(feels);
    if (maxFeels != null && maxFeels >= 32) {
      const hotSpan = spanWhere(times, feels, (v) => v >= 32);
      const severe = maxFeels >= 38;
      recs.push({
        sev: severe ? 'critical' : 'warning',
        icon: 'thermometer-sun',
        title: severe ? 'Calor extremo' : 'Calor intenso',
        desc: `Sensação térmica de até ${fmt(maxFeels)}°. Beba água antes de sentir sede (cerca de ${severe ? '3' : '2,5'} L no dia), use roupas leves e evite esforço físico nas horas mais quentes.`,
        when: hotSpan ? formatSpan(hotSpan.from, hotSpan.to) : null
      });
    }

    // --- Frio ---
    if (minFeels != null && minFeels <= 12) {
      const coldSpan = spanWhere(times, feels, (v) => v <= 12);
      recs.push({
        sev: minFeels <= 5 ? 'critical' : 'warning',
        icon: 'thermometer-snowflake',
        title: minFeels <= 5 ? 'Frio intenso' : 'Frio',
        desc: `Sensação térmica de até ${fmt(minFeels)}°. Agasalhe-se em camadas, proteja extremidades e atenção redobrada com crianças, idosos e animais.`,
        when: coldSpan ? formatSpan(coldSpan.from, coldSpan.to) : null
      });
    }

    // --- Amplitude térmica do dia ---
    const dayMax = d.temperature_2m_max?.[1];
    const dayMin = d.temperature_2m_min?.[1];
    if (dayMax != null && dayMin != null && dayMax - dayMin >= 10) {
      recs.push({
        sev: 'info',
        icon: 'shirt',
        title: 'Grande variação de temperatura',
        desc: `De ${fmt(dayMin)}° a ${fmt(dayMax)}° hoje. Vista-se em camadas para se adaptar ao longo do dia.`
      });
    }

    // --- Umidade do ar ---
    const minHum = minOf(hum.slice(0, 12));
    if (minHum != null && minHum < 30) {
      const level = minHum < 20 ? 'critical' : 'warning';
      const drySpan = spanWhere(times.slice(0, 12), hum.slice(0, 12), (v) => v < 30);
      recs.push({
        sev: level,
        icon: 'droplets',
        title: minHum < 12 ? 'Umidade em nível de emergência' : minHum < 20 ? 'Ar muito seco' : 'Ar seco',
        desc: `Umidade relativa de até ${fmt(minHum)}%. Hidrate-se com frequência, use soro nasal e hidratante labial e evite exercícios ao ar livre no período mais seco.`,
        when: drySpan ? formatSpan(drySpan.from, drySpan.to) : null
      });
      carry.push({ icon: 'droplet', label: 'Hidratante labial' });
    }

    // --- Abafado (ponto de orvalho) ---
    const maxDew = maxOf(dew.slice(0, 12));
    if (maxDew != null && maxDew >= 21 && !(maxFeels >= 32)) {
      recs.push({
        sev: 'info',
        icon: 'cloud-sun',
        title: 'Tempo abafado',
        desc: `Ponto de orvalho de ${fmt(maxDew)}°: o suor evapora menos e o calor parece maior. Prefira tecidos leves e respiráveis.`
      });
    }

    // --- Vento ---
    const maxGust = maxOf(gust.slice(0, 12));
    const maxWind = maxOf(wind.slice(0, 12));
    if (maxGust != null && maxGust >= 45) {
      const gustSpan = spanWhere(times.slice(0, 12), gust.slice(0, 12), (v) => v >= 45);
      recs.push({
        sev: maxGust >= 60 ? 'critical' : 'warning',
        icon: 'wind',
        title: 'Rajadas fortes',
        desc: `Rajadas de até ${fmt(maxGust)} km/h. Evite ficar sob árvores e estruturas soltas; prenda objetos em varandas.`,
        when: gustSpan ? formatSpan(gustSpan.from, gustSpan.to) : null
      });
    } else if (maxWind != null && maxWind >= 30) {
      recs.push({
        sev: 'info',
        icon: 'wind',
        title: 'Vento forte e poeira',
        desc: `Vento de até ${fmt(maxWind)} km/h pode espalhar poeira e pólen. Pessoas com rinite ou asma devem ter cautela.`
      });
    }

    // --- Noite / sono ---
    const nightIdx = idx
      .map((i, k) => ({ k, hour: parseInt(h.time[i].slice(11, 13), 10) }))
      .filter((o) => o.hour >= 22 || o.hour <= 6)
      .map((o) => o.k);
    if (nightIdx.length >= 3) {
      const nightTemps = nightIdx.map((k) => temps[k]);
      const nightMin = minOf(nightTemps);
      const nightMax = maxOf(nightTemps);
      let sleep;
      if (nightMax >= 25) {
        sleep = { sev: 'info', title: 'Noite quente', desc: `Temperatura entre ${fmt(nightMin)}° e ${fmt(nightMax)}° durante a noite. Ventile o quarto e use roupas de cama leves.` };
      } else if (nightMin <= 14) {
        sleep = { sev: 'info', title: 'Noite fria', desc: `Mínima de ${fmt(nightMin)}° durante a noite. Separe um cobertor extra.` };
      } else {
        sleep = { sev: 'good', title: 'Noite agradável para dormir', desc: `Temperatura entre ${fmt(nightMin)}° e ${fmt(nightMax)}° durante a noite.` };
      }
      recs.push({ ...sleep, icon: 'bed' });
    }

    // --- Roupas sugeridas ---
    if (minFeels != null && minFeels <= 14) carry.push({ icon: 'shirt', label: 'Agasalho' });
    else if (minFeels != null && minFeels <= 20) carry.push({ icon: 'shirt', label: 'Casaco leve' });
    if (maxFeels != null && maxFeels >= 27) carry.push({ icon: 'shirt', label: 'Roupas leves' });
    if (maxFeels != null && maxFeels >= 30) carry.push({ icon: 'glass-water', label: 'Garrafa de água' });

    // --- Atividade física (melhor janela) ---
    if (best) {
      const label = comfortLabel(best.avg);
      const from = times[best.k];
      const to = times[Math.min(best.k + 2, times.length - 1)];
      recs.push({
        sev: best.avg >= 65 ? 'good' : 'info',
        icon: 'bike',
        title: best.k === 0 ? 'Bom momento para se exercitar' : `Melhor horário para se exercitar: ${hourLabel(from)}`,
        desc:
          best.avg >= 45
            ? `Condições ${label.plural} entre ${hourLabel(from)} e ${hourLabel(to)}, considerando temperatura, chuva, vento e UV.`
            : 'Nenhum horário realmente favorável nas próximas horas. Prefira atividades em ambientes fechados.',
        when: `${hourLabel(from)}–${hourLabel(to)}`
      });
    }

    recs.sort((a, b) => SEVERITY[a.sev].rank - SEVERITY[b.sev].rank);

    // Resumo em linguagem natural
    const label = comfortLabel(nowScore);
    const top = recs.find((r) => r.sev === 'critical' || r.sev === 'warning');
    const opening = {
      Excelente: 'Ótimas condições para ficar ao ar livre agora.',
      Bom: 'Boas condições para ficar ao ar livre agora.',
      Razoável: 'Condições razoáveis ao ar livre agora.',
      Desfavorável: 'Condições pouco favoráveis ao ar livre agora.'
    }[label.text];
    const summary = top ? `${opening} ${top.title}.` : `${opening} Nenhum alerta para as próximas horas.`;

    return {
      nowScore,
      label,
      summary,
      nowFeels,
      comfort,
      times,
      best,
      carry: dedupeCarry(carry),
      recs,
      hasAlert: recs.some((r) => r.sev === 'critical')
    };
  }

  function dedupeCarry(items) {
    const seen = new Set();
    return items.filter((i) => (seen.has(i.label) ? false : seen.add(i.label)));
  }

  // ---------- Renderização ----------
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const icon = (name, size = 16) => {
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.setAttribute('width', size);
    i.setAttribute('height', size);
    return i;
  };

  function renderScore(a) {
    const section = el('section', `wb-hero tone-${a.label.tone}`);
    const C = 2 * Math.PI * 42;
    const offset = C * (1 - a.nowScore / 100);
    section.innerHTML = `
      <div class="wb-ring" role="img" aria-label="Índice de conforto ao ar livre: ${a.nowScore} de 100, ${a.label.text}">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="42" class="wb-ring-track"/>
          <circle cx="50" cy="50" r="42" class="wb-ring-fill" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
        </svg>
        <div class="wb-ring-value"><strong></strong><span>/100</span></div>
      </div>
      <div class="wb-hero-text">
        <div class="wb-eyebrow">Conforto ao ar livre</div>
        <div class="wb-score-label"></div>
        <p class="wb-summary"></p>
      </div>`;
    section.querySelector('.wb-ring-value strong').textContent = a.nowScore;
    section.querySelector('.wb-score-label').textContent = a.label.text;
    section.querySelector('.wb-summary').textContent = a.summary;
    return section;
  }

  function renderTimeline(a) {
    const section = el('section', 'wb-section');
    const head = el('div', 'wb-section-head');
    head.append(el('h3', 'wb-section-title', 'Conforto nas próximas horas'));
    if (a.best) {
      const bestFrom = hourLabel(a.times[a.best.k]);
      const bestTo = hourLabel(a.times[Math.min(a.best.k + 2, a.times.length - 1)]);
      const chip = el('span', 'wb-best-chip');
      chip.append(icon('sparkles', 12), document.createTextNode(` Melhor: ${bestFrom}–${bestTo}`));
      head.append(chip);
    }
    section.append(head);

    const strip = el('div', 'wb-timeline');
    strip.setAttribute('role', 'list');
    a.comfort.forEach((score, k) => {
      const isBest = a.best && (k === a.best.k || k === a.best.k + 1);
      const item = el('div', `wb-bar${isBest ? ' is-best' : ''}${k === 0 ? ' is-now' : ''}`);
      item.setAttribute('role', 'listitem');
      const label = comfortLabel(score).text;
      const time = k === 0 ? 'Agora' : hourLabel(a.times[k]);
      item.title = `${time}: conforto ${score}/100 (${label})`;
      item.setAttribute('aria-label', `${time}: conforto ${score} de 100, ${label}`);
      const bar = el('span', 'wb-bar-fill');
      bar.style.height = `${Math.max(6, score)}%`;
      const t = el('span', 'wb-bar-time', k === 0 ? 'Agora' : k % 3 === 0 ? hourLabel(a.times[k]) : '');
      item.append(bar, t);
      strip.append(item);
    });
    section.append(strip);
    return section;
  }

  function renderCarry(a) {
    if (a.carry.length === 0) return null;
    const section = el('section', 'wb-section');
    section.append(el('h3', 'wb-section-title', 'Leve com você'));
    const list = el('ul', 'wb-carry');
    a.carry.forEach((c) => {
      const li = el('li', 'wb-carry-item');
      li.append(icon(c.icon, 15), el('span', null, c.label));
      list.append(li);
    });
    section.append(list);
    return section;
  }

  function renderRecs(a) {
    const section = el('section', 'wb-section');
    section.append(el('h3', 'wb-section-title', 'Recomendações'));
    const list = el('div', 'wb-recs');
    a.recs.forEach((r) => {
      const sev = SEVERITY[r.sev];
      const card = el('article', `wb-rec sev-${r.sev}`);
      const iconWrap = el('div', 'wb-rec-icon');
      iconWrap.append(icon(r.icon, 18));
      const body = el('div', 'wb-rec-body');
      const top = el('div', 'wb-rec-top');
      const tag = el('span', 'wb-tag');
      tag.append(icon(sev.icon, 12), document.createTextNode(` ${sev.label}`));
      top.append(tag);
      if (r.when) {
        const when = el('span', 'wb-when');
        when.append(icon('clock', 12), document.createTextNode(` ${r.when}`));
        top.append(when);
      }
      body.append(top, el('h4', 'wb-rec-title', r.title), el('p', 'wb-rec-desc', r.desc));
      card.append(iconWrap, body);
      list.append(card);
    });
    section.append(list);
    return section;
  }

  function render() {
    const container = document.getElementById('wellbeing-content');
    if (!container) return;
    if (!globalWeatherData || !globalWeatherData.hourly) {
      container.innerHTML = `
        <div class="wellbeing-empty">
          <i data-lucide="cloud-off" width="24" height="24"></i>
          <p>Nenhum dado meteorológico disponível para análise.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const a = analyze(globalWeatherData);
    const subtitle = document.getElementById('wellbeing-subtitle');
    if (subtitle) {
      subtitle.textContent = `${currentCityName}${lastFetchTime ? ` · atualizado às ${formatTimeInCity(lastFetchTime)}` : ''}`;
    }
    container.replaceChildren(
      ...[renderScore(a), renderTimeline(a), renderCarry(a), renderRecs(a)].filter(Boolean)
    );
    if (window.lucide) lucide.createIcons({ root: container });
  }

  /** Sinaliza no botão do cabeçalho quando há um alerta importante */
  function updateBadge() {
    const btn = document.getElementById('btn-wellbeing');
    if (!btn || !globalWeatherData || !globalWeatherData.hourly) return;
    const { hasAlert } = analyze(globalWeatherData);
    btn.classList.toggle('has-alert', hasAlert);
    btn.setAttribute('aria-label', hasAlert ? 'Bem-estar (há alertas importantes)' : 'Bem-estar');
  }

  return { analyze, render, updateBadge };
})();

window.Wellbeing = Wellbeing;
