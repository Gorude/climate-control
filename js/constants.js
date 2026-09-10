/**
 * AeroSky - Constantes, Tabela WMO e Utilitários Gerais
 */

const ALERT_THRESHOLDS = {
  tempMax: 38,
  tempMin: 15,
  windGusts: 40,
  uvIndex: 11,
};

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseWMO(code, isDay = true) {
  const map = {
    0: { t: "Céu Limpo", i: isDay ? "sun" : "moon", c: "#facc15" },
    1: { t: "Quase Limpo", i: isDay ? "sun" : "moon", c: "#facc15" },
    2: {
      t: "Parcialmente Nublado",
      i: isDay ? "cloud-sun" : "cloud-moon",
      c: "#94a3b8",
    },
    3: { t: "Nublado", i: "cloud", c: "#64748b" },
    45: { t: "Neblina", i: "cloud-fog", c: "#94a3b8" },
    48: { t: "Névoa", i: "cloud-fog", c: "#94a3b8" },
    51: { t: "Chuvisco Leve", i: "cloud-drizzle", c: "#38bdf8" },
    53: { t: "Chuvisco", i: "cloud-drizzle", c: "#38bdf8" },
    55: { t: "Chuvisco Forte", i: "cloud-drizzle", c: "#38bdf8" },
    61: { t: "Chuva Leve", i: "cloud-rain", c: "#3b82f6" },
    63: { t: "Chuva", i: "cloud-rain", c: "#3b82f6" },
    65: { t: "Chuva Forte", i: "cloud-rain", c: "#3b82f6" },
    80: { t: "Pancadas", i: "cloud-rain", c: "#3b82f6" },
    81: { t: "Pancadas Fortes", i: "cloud-rain", c: "#3b82f6" },
    82: { t: "Pancadas Violentas", i: "cloud-rain", c: "#3b82f6" },
    95: { t: "Tempestade", i: "cloud-lightning", c: "#a855f7" },
    96: { t: "Tempestade", i: "cloud-lightning", c: "#a855f7" },
    99: { t: "Tempestade Severa", i: "cloud-lightning", c: "#a855f7" },
  };
  let res = map[code];
  if (!res) res = code < 50 ? map[3] : code < 80 ? map[61] : map[95];
  return res;
}

function getWindDirectionStr(degrees) {
  const points = [
    "Norte",
    "Nordeste",
    "Leste",
    "Sudeste",
    "Sul",
    "Sudoeste",
    "Oeste",
    "Noroeste",
  ];
  const index =
    Math.round(((degrees %= 360) < 0 ? degrees + 360 : degrees) / 45) % 8;
  return points[index];
}
