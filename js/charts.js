/**
 * AeroSky - Gerenciamento e Renderização de Gráficos (Chart.js)
 */

let chartsObj = {};
let currentPrecipViewState = "rain";
let rainSubTab = "forecast";
let tempSubTab = "history";
let windSubTab = "forecast";

// Configuração Global do Chart.js
if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = "rgba(255, 255, 255, 0.5)";
  Chart.defaults.scale.grid.color = "rgba(255, 255, 255, 0.03)";
  Chart.defaults.scale.grid.borderColor = "transparent";

  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(11, 21, 36, 0.9)";
  Chart.defaults.plugins.tooltip.titleColor = "#ffffff";
  Chart.defaults.plugins.tooltip.bodyColor = "#e2e8f0";
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.borderColor = "rgba(0, 210, 211, 0.3)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;

  // Indicador de Posição Atual no Gráfico (Linha Tracejada Vermelha com Ponto)
  const currentIndicatorPlugin = {
    id: "currentIndicator",
    afterDatasetsDraw(chart, args, options) {
      if (!chart || !chart.chartArea) return;
      const {
        ctx,
        chartArea: { top, bottom },
      } = chart;
      const targetIndex = options.index;
      if (targetIndex === undefined || targetIndex === null) return;

      const meta = chart.getDatasetMeta(0);
      if (
        !meta ||
        !meta.data ||
        targetIndex < 0 ||
        targetIndex >= meta.data.length ||
        !meta.data[targetIndex]
      )
        return;

      const xPos = meta.data[targetIndex].x;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 0, 84, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();

      const circleX = Math.max(6, Math.min(chart.width - 6, xPos));
      ctx.beginPath();
      ctx.arc(circleX, top + 5, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#ff0054";
      ctx.shadowColor = "#ff0054";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    },
  };
  Chart.register(currentIndicatorPlugin);
}

function createChart(canvasId, type, data, options) {
  if (chartsObj[canvasId]) chartsObj[canvasId].destroy();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  chartsObj[canvasId] = new Chart(ctx, { type, data, options });
}

function renderCharts(hourly) {
  if (!hourly || !hourly.time) return;
  const c = globalWeatherData ? globalWeatherData.current : null;
  const startIndex = getCurrentHourlyIndex(hourly, c);
  const totalCount = hourly.time.length;

  const anim = {
    y: {
      duration: 1000,
      easing: "easeOutQuart",
      delay: (ctx) => ctx.dataIndex * 30,
    },
  };

  // 1. Chuva (Bar & Line)
  const rainStart =
    rainSubTab === "forecast" ? startIndex : Math.max(0, startIndex - 24);
  const rainEnd = Math.min(totalCount, rainStart + 24);
  const rainLabels = hourly.time
    .slice(rainStart, rainEnd)
    .map((t) => new Date(t).getHours() + "h");
  const rainData = (hourly.precipitation || []).slice(rainStart, rainEnd);
  const rainProbData = (hourly.precipitation_probability || []).slice(
    rainStart,
    rainEnd,
  );

  const totalRain = rainData.reduce((sum, val) => sum + (val || 0), 0);
  const valPrecipEl = document.getElementById("val-precip");
  if (valPrecipEl) valPrecipEl.innerText = totalRain.toFixed(1) + " mm";

  const precipHeaderTitle = document.getElementById("precip-header-title");
  if (precipHeaderTitle && currentPrecipViewState === "rain") {
    const label =
      rainSubTab === "forecast"
        ? "Chuva (Previsão 24h)"
        : "Chuva (Histórico 24h)";
    precipHeaderTitle.innerHTML = `<i data-lucide="cloud-rain"></i> ${label}`;
  }

  const precipCanvas = document.getElementById("chart-precip");
  if (precipCanvas) {
    const ctxP = precipCanvas.getContext("2d");
    const gradRain = ctxP.createLinearGradient(0, 0, 0, 200);
    gradRain.addColorStop(0, "rgba(59, 130, 246, 0.8)");
    gradRain.addColorStop(1, "rgba(59, 130, 246, 0.1)");

    createChart(
      "chart-precip",
      "bar",
      {
        labels: rainLabels,
        datasets: [
          {
            label: "Probabilidade (%)",
            data: rainProbData,
            type: "line",
            borderColor: "#facc15",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: false,
            yAxisID: "y1",
          },
          {
            label: "Volume (mm)",
            data: rainData,
            backgroundColor: gradRain,
            borderRadius: 4,
            yAxisID: "y",
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        animation: anim,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { left: 6, right: 6, top: 8, bottom: 0 } },
        plugins: {
          legend: { display: false },
          currentIndicator: {
            index:
              rainSubTab === "forecast"
                ? 0
                : Math.max(0, rainLabels.length - 1),
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, border: { display: false } },
          y1: {
            beginAtZero: true,
            max: 100,
            position: "right",
            border: { display: false },
            grid: { display: false },
          },
        },
      },
    );
  }

  // 2. Vento (Single-Line Area)
  const windStart =
    windSubTab === "forecast" ? startIndex : Math.max(0, startIndex - 24);
  const windEnd = Math.min(totalCount, windStart + 24);
  const windLabels = hourly.time
    .slice(windStart, windEnd)
    .map((t) => new Date(t).getHours() + "h");
  const windSpeedData = (hourly.wind_speed_10m || []).slice(
    windStart,
    windEnd,
  );

  const gustsSource = hourly.wind_gusts_10m || hourly.wind_speed_10m || [];
  const windGustsData = gustsSource.slice(windStart, windEnd);
  const maxGusts =
    windGustsData.length > 0 ? Math.max(...windGustsData) : 0;
  const valGustsEl = document.getElementById("val-gusts");
  if (valGustsEl) valGustsEl.innerText = Math.round(maxGusts) + " km/h";

  const windHeaderTitle = document.getElementById("wind-header-title");
  if (windHeaderTitle) {
    const windLabel =
      windSubTab === "forecast"
        ? "Vento (Previsão 24h)"
        : "Vento (Histórico 24h)";
    windHeaderTitle.innerHTML = `<i data-lucide="wind"></i> ${windLabel}`;
  }

  const windCanvas = document.getElementById("chart-wind");
  if (windCanvas) {
    createChart(
      "chart-wind",
      "line",
      {
        labels: windLabels,
        datasets: [
          {
            label: "Velocidade",
            data: windSpeedData,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.1)",
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: true,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        animation: anim,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { left: 6, right: 6, top: 8, bottom: 0 } },
        plugins: {
          legend: { display: false },
          currentIndicator: {
            index:
              windSubTab === "forecast"
                ? 0
                : Math.max(0, windLabels.length - 1),
          },
        },
        scales: { x: { display: false }, y: { display: false } },
      },
    );
  }

  // 3. Temperatura (Previsão ou Histórico)
  const tempStart =
    tempSubTab === "forecast" ? startIndex : Math.max(0, startIndex - 24);
  const tempEnd = Math.min(totalCount, tempStart + 24);
  const tempLabels = hourly.time
    .slice(tempStart, tempEnd)
    .map((t) => new Date(t).getHours() + "h");
  const tempData = (hourly.temperature_2m || []).slice(
    tempStart,
    tempEnd,
  );

  if (tempData.length > 0) {
    const tempMin = Math.min(...tempData);
    const tempMax = Math.max(...tempData);
    const rangeEl = document.getElementById("val-temp-range");
    if (rangeEl)
      rangeEl.innerText = `${tempMin.toFixed(0)}° — ${tempMax.toFixed(0)}°`;
  }

  if (precipHeaderTitle && currentPrecipViewState === "temp") {
    const label =
      tempSubTab === "forecast"
        ? "Temperatura (Previsão 24h)"
        : "Temperatura (Histórico 24h)";
    precipHeaderTitle.innerHTML = `<i data-lucide="thermometer"></i> ${label}`;
  }

  const tempCanvas = document.getElementById("chart-temp-history");
  if (tempCanvas) {
    const ctxT = tempCanvas.getContext("2d");
    const gradTemp = ctxT.createLinearGradient(0, 0, 0, 200);
    gradTemp.addColorStop(0, "rgba(239, 68, 68, 0.3)");
    gradTemp.addColorStop(0.5, "rgba(250, 204, 21, 0.15)");
    gradTemp.addColorStop(1, "rgba(56, 189, 248, 0.05)");

    createChart(
      "chart-temp-history",
      "line",
      {
        labels: tempLabels,
        datasets: [
          {
            label: "Temperatura (°C)",
            data: tempData,
            borderColor: "#facc15",
            backgroundColor: gradTemp,
            borderWidth: 2.5,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#facc15",
            fill: true,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        animation: anim,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { left: 0, right: 6, top: 8, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) : "--"}°C`,
            },
          },
          currentIndicator: {
            index:
              tempSubTab === "forecast"
                ? 0
                : Math.max(0, tempLabels.length - 1),
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            border: { display: false },
            ticks: { callback: (v) => v + "°" },
          },
        },
      },
    );
  }

  if (typeof lucide !== "undefined") lucide.createIcons();
}

window.switchPrecipView = function (view) {
  currentPrecipViewState = view;
  const btnRain = document.getElementById("btn-precip-rain");
  const btnTemp = document.getElementById("btn-precip-temp");
  const viewRain = document.getElementById("view-precip-rain");
  const viewTemp = document.getElementById("view-precip-temp");

  if (btnRain) btnRain.classList.toggle("active", view === "rain");
  if (btnTemp) btnTemp.classList.toggle("active", view === "temp");
  if (viewRain) viewRain.style.display = view === "rain" ? "block" : "none";
  if (viewTemp) viewTemp.style.display = view === "temp" ? "block" : "none";

  const metaRain = document.getElementById("meta-rain");
  const metaTemp = document.getElementById("meta-temp");

  if (view === "rain") {
    if (metaRain) metaRain.style.display = "inline";
    if (metaTemp) metaTemp.style.display = "none";

    if (chartsObj["chart-precip"]) {
      chartsObj["chart-precip"].resize();
      chartsObj["chart-precip"].update("none");
    }
  } else {
    if (metaRain) metaRain.style.display = "none";
    if (metaTemp) metaTemp.style.display = "inline";

    if (chartsObj["chart-temp-history"]) {
      chartsObj["chart-temp-history"].resize();
      chartsObj["chart-temp-history"].update("none");
    }
  }

  updatePrecipSubToggleUI();

  if (globalWeatherData) {
    renderCharts(globalWeatherData.hourly);
  }

  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.switchPrecipSubTab = function (subTab) {
  if (currentPrecipViewState === "rain") {
    rainSubTab = subTab;
  } else {
    tempSubTab = subTab;
  }
  updatePrecipSubToggleUI();
  if (globalWeatherData) {
    renderCharts(globalWeatherData.hourly);
  }
};

function updatePrecipSubToggleUI() {
  const activeSubTab =
    currentPrecipViewState === "rain" ? rainSubTab : tempSubTab;
  const btnForecast = document.getElementById("btn-precip-forecast");
  const btnHistory = document.getElementById("btn-precip-history");
  if (btnForecast)
    btnForecast.classList.toggle("active", activeSubTab === "forecast");
  if (btnHistory)
    btnHistory.classList.toggle("active", activeSubTab === "history");
}

window.switchWindSubTab = function (subTab) {
  windSubTab = subTab;
  const btnForecast = document.getElementById("btn-wind-forecast");
  const btnHistory = document.getElementById("btn-wind-history");
  if (btnForecast)
    btnForecast.classList.toggle("active", subTab === "forecast");
  if (btnHistory)
    btnHistory.classList.toggle("active", subTab === "history");
  if (globalWeatherData) {
    renderCharts(globalWeatherData.hourly);
  }
};

// Redimensionamento de gráficos
function resizeAllCharts() {
  Object.values(chartsObj).forEach((chart) => {
    if (chart) {
      chart.resize();
      chart.update("none");
    }
  });
}
window.resizeAllCharts = resizeAllCharts;

