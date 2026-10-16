/**
 * AeroSky - Gráficos (Chart.js)
 *
 * Princípios aplicados:
 *  - Um eixo Y por gráfico. Medidas diferentes (chance % × volume mm) ficam em
 *    painéis empilhados que compartilham o eixo X, nunca em dois eixos sobrepostos.
 *  - Janela contínua: 12h de histórico + 24h de previsão, com o passado esmaecido
 *    e um marcador "Agora" — dispensa alternar entre "Previsão" e "Histórico".
 *  - Marcas finas, grade discreta, rótulos diretos só nos extremos.
 *  - Crosshair + tooltip com todos os valores do horário; navegação por teclado
 *    (setas) e visão em tabela como alternativa acessível.
 *  - Paleta validada para daltonismo e contraste sobre a superfície escura dos cartões.
 */

const PAST_HOURS = 12;
const FUTURE_HOURS = 24;

const VIZ = {
  surface: "#080e18",
  grid: "rgba(255, 255, 255, 0.06)",
  textMuted: "#7c8aa0",
  textSecondary: "#cbd5e1",
  now: "rgba(255, 255, 255, 0.45)",
  rain: "#3987e5",
  prob: "#199e70",
  temp: "#c98500",
  feels: "#d55181",
  wind: "#3987e5",
  gust: "#d95926",
};

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

let chartsObj = {};
let currentPrecipViewState = "rain";
let chartTableVisible = { precip: false, wind: false };
let lastChartModel = null;

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Formatadores ----------
const fmtNum = (v, digits = 0) =>
  v == null || Number.isNaN(v)
    ? "--"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function hourOf(iso) {
  return parseInt(iso.slice(11, 13), 10);
}

function weekdayOf(iso) {
  return WEEKDAYS_SHORT[new Date(iso.slice(0, 10) + "T12:00:00").getDay()];
}

/** "14:00" para hoje; "Sáb, 14:00" para outros dias */
function formatTooltipTime(iso, todayIso) {
  const time = iso.slice(11, 16);
  return iso.slice(0, 10) === todayIso ? time : `${weekdayOf(iso)}, ${time}`;
}

function xTickLabel(iso) {
  const h = hourOf(iso);
  return h === 0 ? weekdayOf(iso) : `${h}h`;
}

const maxOf = (arr) => {
  const valid = arr.filter((v) => v != null);
  return valid.length ? Math.max(...valid) : null;
};
const minOf = (arr) => {
  const valid = arr.filter((v) => v != null);
  return valid.length ? Math.min(...valid) : null;
};

// ---------- Plugins ----------
if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = VIZ.textMuted;
  Chart.defaults.scale.grid.color = VIZ.grid;
  if (prefersReducedMotion) Chart.defaults.animation = false;

  /** Esmaece o passado e desenha a linha "Agora" (sólida, discreta) */
  Chart.register({
    id: "aeroNow",
    afterDatasetsDraw(chart, args, opts) {
      const idx = opts.index;
      const xScale = chart.scales.x;
      if (idx == null || !xScale || !chart.chartArea) return;
      const { top, bottom, left } = chart.chartArea;
      const x = xScale.getPixelForValue(idx);
      const ctx = chart.ctx;
      ctx.save();
      if (x > left) {
        ctx.fillStyle = "rgba(8, 14, 24, 0.5)";
        ctx.fillRect(left, top, x - left, bottom - top);
      }
      ctx.strokeStyle = VIZ.now;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, top);
      ctx.lineTo(Math.round(x) + 0.5, bottom);
      ctx.stroke();
      ctx.fillStyle = VIZ.textSecondary;
      ctx.font = "600 10px Inter, sans-serif";
      ctx.textAlign = x < left + 24 ? "left" : "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Agora", x, top - 4);
      ctx.restore();
    },
  });

  /** Crosshair vertical no horário ativo do tooltip */
  Chart.register({
    id: "aeroCrosshair",
    afterDatasetsDraw(chart) {
      const active = chart.tooltip && chart.tooltip.getActiveElements();
      if (!active || active.length === 0 || !chart.chartArea) return;
      const x = active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, top);
      ctx.lineTo(Math.round(x) + 0.5, bottom);
      ctx.stroke();
      ctx.restore();
    },
  });

  /** Rótulos diretos apenas nos extremos (máxima/mínima) */
  Chart.register({
    id: "aeroPeaks",
    afterDatasetsDraw(chart, args, opts) {
      if (!opts.marks || !chart.chartArea) return;
      const ctx = chart.ctx;
      const { left, right } = chart.chartArea;
      opts.marks.forEach((mark) => {
        const meta = chart.getDatasetMeta(mark.dataset);
        if (!meta || meta.hidden) return;
        const data = chart.data.datasets[mark.dataset].data;
        const target = mark.mode === "min" ? minOf(data) : maxOf(data);
        if (target == null || (mark.threshold != null && target < mark.threshold)) return;
        const i = data.indexOf(target);
        const el = meta.data[i];
        if (!el) return;
        const isBar = meta.type === "bar";
        ctx.save();
        if (!isBar) {
          // Ponto com anel na cor da superfície para destacar sobre as linhas
          ctx.beginPath();
          ctx.arc(el.x, el.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = chart.data.datasets[mark.dataset].borderColor;
          ctx.strokeStyle = VIZ.surface;
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
        }
        const text = mark.format(target);
        ctx.font = "600 11px Inter, sans-serif";
        const w = ctx.measureText(text).width;
        const x = Math.min(Math.max(el.x, left + w / 2), right - w / 2);
        const y = mark.mode === "min" ? el.y + 16 : el.y - 9;
        ctx.fillStyle = VIZ.textSecondary;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x, y);
        ctx.restore();
      });
    },
  });

  /** Legenda de cada painel em gráficos de painéis empilhados */
  Chart.register({
    id: "aeroPanelCaptions",
    afterDraw(chart, args, opts) {
      if (!opts.captions || !chart.chartArea) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "600 10px Inter, sans-serif";
      ctx.fillStyle = VIZ.textMuted;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      Object.entries(opts.captions).forEach(([scaleId, text]) => {
        const scale = chart.scales[scaleId];
        if (scale) ctx.fillText(text, chart.chartArea.right, scale.top + 2);
      });
      ctx.restore();
    },
  });

  /** Setas de direção do vento acima do gráfico, a cada N horas */
  Chart.register({
    id: "aeroWindArrows",
    afterDraw(chart, args, opts) {
      if (!opts.directions || !chart.chartArea) return;
      const ctx = chart.ctx;
      const xScale = chart.scales.x;
      const y = chart.chartArea.top - 22;
      const step = opts.step || 3;
      ctx.save();
      ctx.strokeStyle = VIZ.textMuted;
      ctx.fillStyle = VIZ.textMuted;
      ctx.lineWidth = 1.5;
      opts.directions.forEach((from, i) => {
        if (from == null || i % step !== 0) return;
        const x = xScale.getPixelForValue(i);
        // Seta aponta para onde o vento sopra (origem + 180°)
        const angle = ((from + 180) * Math.PI) / 180;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.lineTo(0, -4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-3, -1.5);
        ctx.lineTo(3, -1.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    },
  });
}

/** Lavagem de área: ~16% no topo esmaecendo até transparente na base */
function areaGradient(chart, rgb) {
  const area = chart.chartArea;
  if (!area) return `rgba(${rgb}, 0.1)`;
  const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, `rgba(${rgb}, 0.16)`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  return g;
}

const WIND_ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const WIND_SHORT = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
/** Direção para onde o vento sopra, compacta: "↗ NE" */
function windToShort(fromDeg) {
  const i = Math.round((((fromDeg + 180) % 360) + 360) % 360 / 45) % 8;
  return `${WIND_ARROWS[i]} ${WIND_SHORT[i]}`;
}

// ---------- Configuração compartilhada ----------
function baseOptions(model, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion ? false : { duration: 500, easing: "easeOutQuart" },
    interaction: { mode: "index", intersect: false },
    layout: { padding: { top: extra.padTop || 16, right: 4, left: 0, bottom: 0 } },
    plugins: {
      legend: { display: false },
      aeroNow: { index: model.nowIndex },
      tooltip: {
        backgroundColor: "rgba(8, 14, 24, 0.96)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        borderWidth: 1,
        cornerRadius: 10,
        padding: 10,
        caretSize: 0,
        titleColor: VIZ.textMuted,
        titleFont: { size: 11, weight: "500" },
        bodyColor: "#f8fafc",
        bodyFont: { size: 12, weight: "600" },
        bodySpacing: 6,
        boxWidth: 12,
        boxHeight: 3,
        boxPadding: 6,
        multiKeyBackground: "transparent",
        footerColor: VIZ.textMuted,
        footerFont: { size: 11, weight: "500" },
        footerMarginTop: 8,
        callbacks: {
          title: (items) =>
            items.length ? formatTooltipTime(model.times[items[0].dataIndex], model.todayIso) : "",
          // Traço na cor da série (não caixa): a identidade vem da marca, o texto fica neutro
          labelColor: (ctx) => {
            const ds = ctx.dataset;
            const c = ds.seriesColor || ds.borderColor;
            return { borderColor: c, backgroundColor: c, borderWidth: 0, borderRadius: 2 };
          },
        },
      },
      ...extra.plugins,
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: "rgba(255, 255, 255, 0.12)" },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 14,
          callback: (v) => xTickLabel(model.times[v]),
        },
      },
      ...extra.scales,
    },
  };
}

/** Atualiza o gráfico existente (sem piscar) ou cria um novo */
function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const existing = chartsObj[canvasId];
  if (existing && existing.config.type === config.type) {
    existing.data = config.data;
    existing.options = config.options;
    existing.update();
    return;
  }
  if (existing) existing.destroy();
  chartsObj[canvasId] = new Chart(canvas.getContext("2d"), config);
  enableKeyboardNav(chartsObj[canvasId], canvas);
}

/** Setas ←/→ percorrem os horários com o tooltip, como o hover do mouse */
function enableKeyboardNav(chart, canvas) {
  if (canvas.dataset.kbd) return;
  canvas.dataset.kbd = "1";
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    const c = chartsObj[canvas.id];
    if (!c || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const count = c.data.labels.length;
    const current = c.tooltip.getActiveElements();
    let idx = current.length ? current[0].index : c.options.plugins.aeroNow.index ?? 0;
    if (e.key === "ArrowLeft") idx = Math.max(0, idx - 1);
    if (e.key === "ArrowRight") idx = Math.min(count - 1, idx + 1);
    if (e.key === "Home") idx = 0;
    if (e.key === "End") idx = count - 1;
    const active = c.data.datasets.map((_, datasetIndex) => ({ datasetIndex, index: idx }));
    const el = c.getDatasetMeta(0).data[idx];
    c.setActiveElements(active);
    c.tooltip.setActiveElements(active, { x: el.x, y: el.y });
    c.update("none");
  });
  canvas.addEventListener("blur", () => {
    const c = chartsObj[canvas.id];
    if (!c) return;
    c.setActiveElements([]);
    c.tooltip.setActiveElements([], { x: 0, y: 0 });
    c.update("none");
  });
}

// ---------- Modelo de dados ----------
function buildModel(hourly) {
  const c = globalWeatherData ? globalWeatherData.current : null;
  const nowIdx = getCurrentHourlyIndex(hourly, c);
  const start = Math.max(0, nowIdx - PAST_HOURS);
  const end = Math.min(hourly.time.length, nowIdx + FUTURE_HOURS + 1);
  const pick = (key) => (hourly[key] || []).slice(start, end);
  const futureSlice = (key) => (hourly[key] || []).slice(nowIdx, nowIdx + FUTURE_HOURS);

  return {
    start,
    nowIndex: nowIdx - start,
    todayIso: (c && c.time ? c.time : hourly.time[nowIdx]).slice(0, 10),
    times: hourly.time.slice(start, end),
    precip: pick("precipitation"),
    prob: pick("precipitation_probability"),
    temp: pick("temperature_2m"),
    feels: pick("apparent_temperature"),
    wind: pick("wind_speed_10m"),
    gust: pick("wind_gusts_10m"),
    dir: pick("wind_direction_10m"),
    future: {
      precip: futureSlice("precipitation"),
      prob: futureSlice("precipitation_probability"),
      temp: futureSlice("temperature_2m"),
      gust: futureSlice("wind_gusts_10m"),
    },
  };
}

// ---------- Renderização ----------
function renderCharts(hourly) {
  if (!hourly || !hourly.time) return;
  const model = buildModel(hourly);
  lastChartModel = model;

  renderRainChart(model);
  renderTempChart(model);
  renderWindChart(model);
  updatePrecipHeader(model);
  updateWindHeader(model);
  refreshVisibleTables();
}

function renderRainChart(model) {
  const maxMm = maxOf(model.precip) || 0;
  upsertChart("chart-precip", {
    type: "bar",
    data: {
      labels: model.times.map((_, i) => i),
      datasets: [
        {
          type: "line",
          label: "Chance de chuva",
          data: model.prob,
          yAxisID: "yProb",
          borderColor: VIZ.prob,
          backgroundColor: "rgba(25, 158, 112, 0.1)",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: VIZ.surface,
          pointHoverBackgroundColor: VIZ.prob,
          fill: "origin",
          unit: "%",
        },
        {
          label: "Volume",
          data: model.precip,
          yAxisID: "yMm",
          seriesColor: VIZ.rain,
          backgroundColor: VIZ.rain,
          hoverBackgroundColor: "#5598e7",
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: "start",
          maxBarThickness: 14,
          categoryPercentage: 0.85,
          barPercentage: 0.9,
          unit: "mm",
        },
      ],
    },
    options: baseOptions(model, {
      plugins: {
        tooltip: {
          ...baseOptions(model).plugins.tooltip,
          callbacks: {
            ...baseOptions(model).plugins.tooltip.callbacks,
            label: (ctx) =>
              ctx.dataset.unit === "%"
                ? ` ${fmtNum(ctx.parsed.y)}%  Chance de chuva`
                : ` ${fmtNum(ctx.parsed.y, 1)} mm  Volume`,
          },
        },
        aeroPeaks: {
          marks: [
            { dataset: 1, mode: "max", threshold: 0.1, format: (v) => `${fmtNum(v, 1)} mm` },
          ],
        },
        aeroPanelCaptions: { captions: { yProb: "Chance de chuva (%)", yMm: "Volume (mm)" } },
      },
      // Dois painéis empilhados com o mesmo eixo X (não um eixo duplo)
      scales: {
        yMm: {
          type: "linear",
          position: "left",
          stack: "rain",
          stackWeight: 3,
          beginAtZero: true,
          suggestedMax: Math.max(1, maxMm * 1.25),
          border: { display: false },
          ticks: { maxTicksLimit: 4, callback: (v) => fmtNum(v, v % 1 ? 1 : 0) },
        },
        yProb: {
          type: "linear",
          position: "left",
          stack: "rain",
          stackWeight: 2,
          offset: true,
          min: 0,
          max: 100,
          border: { display: false },
          // O 0% é omitido para não encostar no topo do painel de volume logo abaixo
          ticks: { stepSize: 50, callback: (v) => (v === 0 ? "" : `${v}%`) },
        },
      },
    }),
  });
}

function renderTempChart(model) {
  const hasFeels = model.feels.some((v) => v != null);
  const datasets = [
    {
      label: "Temperatura",
      data: model.temp,
      borderColor: VIZ.temp,
      backgroundColor: (ctx) => areaGradient(ctx.chart, "201, 133, 0"),
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: VIZ.surface,
      pointHoverBackgroundColor: VIZ.temp,
      fill: "origin",
    },
  ];
  if (hasFeels) {
    datasets.push({
      label: "Sensação",
      data: model.feels,
      borderColor: VIZ.feels,
      backgroundColor: "transparent",
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: VIZ.surface,
      pointHoverBackgroundColor: VIZ.feels,
      fill: false,
    });
  }

  const base = baseOptions(model);
  upsertChart("chart-temp-history", {
    type: "line",
    data: { labels: model.times.map((_, i) => i), datasets },
    options: baseOptions(model, {
      plugins: {
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            ...base.plugins.tooltip.callbacks,
            label: (ctx) => ` ${fmtNum(ctx.parsed.y, 1)}°  ${ctx.dataset.label}`,
          },
        },
        aeroPeaks: {
          marks: [
            { dataset: 0, mode: "max", format: (v) => `${fmtNum(v)}°` },
            { dataset: 0, mode: "min", format: (v) => `${fmtNum(v)}°` },
          ],
        },
      },
      scales: {
        y: {
          grace: "12%",
          border: { display: false },
          ticks: { maxTicksLimit: 5, callback: (v) => `${fmtNum(v)}°` },
        },
      },
    }),
  });
}

function renderWindChart(model) {
  const base = baseOptions(model);
  upsertChart("chart-wind", {
    type: "line",
    data: {
      labels: model.times.map((_, i) => i),
      datasets: [
        {
          label: "Vento",
          data: model.wind,
          borderColor: VIZ.wind,
          backgroundColor: (ctx) => areaGradient(ctx.chart, "57, 135, 229"),
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: VIZ.surface,
          pointHoverBackgroundColor: VIZ.wind,
          fill: "origin",
        },
        {
          label: "Rajadas",
          data: model.gust,
          borderColor: VIZ.gust,
          backgroundColor: "transparent",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: VIZ.surface,
          pointHoverBackgroundColor: VIZ.gust,
          fill: false,
        },
      ],
    },
    options: baseOptions(model, {
      padTop: 40,
      plugins: {
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            ...base.plugins.tooltip.callbacks,
            label: (ctx) => ` ${fmtNum(ctx.parsed.y)} km/h  ${ctx.dataset.label}`,
            footer: (items) => {
              const d = items.length ? model.dir[items[0].dataIndex] : null;
              return d == null ? "" : `Soprando para ${getWindDirectionStr((d + 180) % 360)}`;
            },
          },
        },
        aeroPeaks: {
          marks: [{ dataset: 1, mode: "max", format: (v) => `${fmtNum(v)} km/h` }],
        },
        aeroWindArrows: { directions: model.dir, step: 3 },
      },
      scales: {
        y: {
          beginAtZero: true,
          grace: "15%",
          border: { display: false },
          ticks: { maxTicksLimit: 4 },
        },
      },
    }),
  });
}

// ---------- Cabeçalhos, resumos e legendas ----------
function legendHtml(items) {
  return items
    .map(
      ([color, label]) =>
        `<span class="legend-item"><span class="legend-key" style="--key:${color}"></span>${label}</span>`
    )
    .join("");
}

function updatePrecipHeader(model) {
  const title = document.getElementById("precip-header-title");
  const meta = document.getElementById("precip-meta");
  const legend = document.getElementById("precip-legend");
  const f = model.future;

  if (currentPrecipViewState === "rain") {
    if (title) title.innerHTML = '<i data-lucide="cloud-rain"></i> Chuva';
    const total = f.precip.reduce((s, v) => s + (v || 0), 0);
    const maxProb = maxOf(f.prob) || 0;
    if (meta) {
      if (total < 0.1 && maxProb < 20) {
        meta.innerHTML = "Sem chuva prevista nas próximas 24h";
      } else {
        const peakIdx = f.prob.indexOf(maxProb);
        const peakTime = peakIdx >= 0 ? model.times[model.nowIndex + peakIdx] : null;
        meta.innerHTML = `Próx. 24h: <strong>${fmtNum(total, 1)} mm</strong> · até <strong>${fmtNum(maxProb)}%</strong>${
          peakTime ? ` às ${peakTime.slice(11, 16)}` : ""
        }`;
      }
    }
    // Um painel por série: as legendas de cada painel ficam dentro do gráfico
    if (legend) legend.innerHTML = "";
  } else {
    if (title) title.innerHTML = '<i data-lucide="thermometer"></i> Temperatura';
    if (meta) {
      meta.innerHTML = `Próx. 24h: <strong>${fmtNum(minOf(f.temp))}°</strong> a <strong>${fmtNum(maxOf(f.temp))}°</strong>`;
    }
    if (legend) {
      const items = [[VIZ.temp, "Temperatura"]];
      if (model.feels.some((v) => v != null)) items.push([VIZ.feels, "Sensação"]);
      legend.innerHTML = legendHtml(items);
    }
  }
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function updateWindHeader(model) {
  const meta = document.getElementById("wind-meta");
  const legend = document.getElementById("wind-legend");
  if (meta) meta.innerHTML = `Rajada máx. 24h: <strong>${fmtNum(maxOf(model.future.gust))} km/h</strong>`;
  if (legend) legend.innerHTML = legendHtml([[VIZ.wind, "Vento"], [VIZ.gust, "Rajadas"]]);
}

// ---------- Visão em tabela (alternativa acessível) ----------
function buildTable(headers, rows, nowRow) {
  const table = document.createElement("table");
  table.className = "data-table";
  const thead = table.createTHead().insertRow();
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    thead.appendChild(th);
  });
  const tbody = table.createTBody();
  rows.forEach((cells, i) => {
    const tr = tbody.insertRow();
    if (i === nowRow) tr.className = "is-now";
    if (i < nowRow) tr.classList.add("is-past");
    cells.forEach((value, j) => {
      const cell = j === 0 ? document.createElement("th") : document.createElement("td");
      if (j === 0) cell.scope = "row";
      cell.textContent = value;
      tr.appendChild(cell);
    });
  });
  return table;
}

function renderTable(kind) {
  const m = lastChartModel;
  const container = document.getElementById(`${kind}-table`);
  if (!m || !container) return;
  const timeLabel = (i) => (i === m.nowIndex ? "Agora" : formatTooltipTime(m.times[i], m.todayIso));
  let table;
  if (kind === "wind") {
    table = buildTable(
      ["Horário", "Vento", "Rajadas", "Direção"],
      m.times.map((_, i) => [
        timeLabel(i),
        `${fmtNum(m.wind[i])} km/h`,
        `${fmtNum(m.gust[i])} km/h`,
        m.dir[i] == null ? "--" : windToShort(m.dir[i]),
      ]),
      m.nowIndex
    );
  } else if (currentPrecipViewState === "rain") {
    table = buildTable(
      ["Horário", "Chance", "Volume"],
      m.times.map((_, i) => [timeLabel(i), `${fmtNum(m.prob[i])}%`, `${fmtNum(m.precip[i], 1)} mm`]),
      m.nowIndex
    );
  } else {
    table = buildTable(
      ["Horário", "Temperatura", "Sensação"],
      m.times.map((_, i) => [timeLabel(i), `${fmtNum(m.temp[i], 1)}°`, `${fmtNum(m.feels[i], 1)}°`]),
      m.nowIndex
    );
  }
  container.replaceChildren(table);
  // Mantém o horário atual à vista ao abrir a tabela
  const nowRow = table.querySelector(".is-now");
  if (nowRow) container.scrollTop = Math.max(0, nowRow.offsetTop - 40);
}

function refreshVisibleTables() {
  Object.entries(chartTableVisible).forEach(([kind, visible]) => {
    if (visible) renderTable(kind);
  });
}

function applyPrecipVisibility() {
  const showTable = chartTableVisible.precip;
  const viewRain = document.getElementById("view-precip-rain");
  const viewTemp = document.getElementById("view-precip-temp");
  const table = document.getElementById("precip-table");
  if (viewRain) viewRain.style.display = !showTable && currentPrecipViewState === "rain" ? "" : "none";
  if (viewTemp) viewTemp.style.display = !showTable && currentPrecipViewState === "temp" ? "" : "none";
  if (table) table.hidden = !showTable;
}

window.toggleChartTable = function (kind) {
  chartTableVisible[kind] = !chartTableVisible[kind];
  const visible = chartTableVisible[kind];
  const btn = document.getElementById(`btn-${kind}-table`);
  if (btn) {
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
    btn.title = visible ? "Ver como gráfico" : "Ver como tabela";
    btn.innerHTML = `<i data-lucide="${visible ? "chart-line" : "table-2"}" width="16" height="16"></i>`;
  }
  if (kind === "precip") {
    applyPrecipVisibility();
  } else {
    const chart = document.getElementById("view-wind-chart");
    const table = document.getElementById("wind-table");
    if (chart) chart.style.display = visible ? "none" : "";
    if (table) table.hidden = !visible;
  }
  if (visible) renderTable(kind);
  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.switchPrecipView = function (view) {
  currentPrecipViewState = view;
  const btnRain = document.getElementById("btn-precip-rain");
  const btnTemp = document.getElementById("btn-precip-temp");
  if (btnRain) {
    btnRain.classList.toggle("active", view === "rain");
    btnRain.setAttribute("aria-pressed", view === "rain" ? "true" : "false");
  }
  if (btnTemp) {
    btnTemp.classList.toggle("active", view === "temp");
    btnTemp.setAttribute("aria-pressed", view === "temp" ? "true" : "false");
  }
  applyPrecipVisibility();
  if (lastChartModel) updatePrecipHeader(lastChartModel);
  if (chartTableVisible.precip) renderTable("precip");
  const chart = chartsObj[view === "rain" ? "chart-precip" : "chart-temp-history"];
  if (chart) chart.resize();
};

// Redimensionamento de gráficos
function resizeAllCharts() {
  Object.values(chartsObj).forEach((chart) => {
    if (chart) chart.resize();
  });
}
window.resizeAllCharts = resizeAllCharts;
