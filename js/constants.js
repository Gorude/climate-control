/**
 * AeroSky - Constantes, Configuração, Tabela WMO e Utilitários Gerais
 */

const CONFIG = {
  CITY: {
    name: 'Naviraí - MS',
    lat: -23.065,
    lon: -54.1906
  },
  REFRESH_INTERVAL: 300000 // 5 minutos
};

const ALERT_THRESHOLDS = {
  tempMax: 38,
  tempMin: 10,
  windGusts: 40,
  uvIndex: 11
};

const BRAZIL_UF = {
  Acre: 'AC',
  Alagoas: 'AL',
  Amapá: 'AP',
  Amazonas: 'AM',
  Bahia: 'BA',
  Ceará: 'CE',
  'Distrito Federal': 'DF',
  'Espírito Santo': 'ES',
  Goiás: 'GO',
  Maranhão: 'MA',
  'Mato Grosso': 'MT',
  'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG',
  Pará: 'PA',
  Paraíba: 'PB',
  Paraná: 'PR',
  Pernambuco: 'PE',
  Piauí: 'PI',
  'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS',
  Rondônia: 'RO',
  Roraima: 'RR',
  'Santa Catarina': 'SC',
  'São Paulo': 'SP',
  Sergipe: 'SE',
  Tocantins: 'TO'
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Compara duas localizações pelas coordenadas (tolerância de ~5 km).
 * Nomes não são confiáveis: existem muitas cidades homônimas em estados diferentes.
 */
function isSameLocation(a, b) {
  if (!a || !b) return false;
  const hasCoords = (o) => typeof o.lat === 'number' && typeof o.lon === 'number';
  if (hasCoords(a) && hasCoords(b)) {
    return Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;
  }
  if (!a.name || !b.name) return false;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

function getCurrentHourlyIndex(hourly, current) {
  if (!hourly || !hourly.time || hourly.time.length === 0) return 24;
  if (current && current.time) {
    const targetPrefix = current.time.slice(0, 13);
    const idx = hourly.time.findIndex((t) => t.startsWith(targetPrefix));
    if (idx !== -1) return idx;
  }
  return Math.min(24, hourly.time.length - 1);
}

/** Formata "2026-10-16T09:00" como "09:00" sem depender do fuso do navegador */
function formatHourLabel(isoTime) {
  return isoTime ? isoTime.slice(11, 16) : '--:--';
}

function parseWMO(code, isDay = true) {
  const map = {
    0: { t: 'Céu Limpo', i: isDay ? 'sun' : 'moon', c: '#facc15' },
    1: { t: 'Quase Limpo', i: isDay ? 'sun' : 'moon', c: '#facc15' },
    2: {
      t: 'Parcialmente Nublado',
      i: isDay ? 'cloud-sun' : 'cloud-moon',
      c: '#94a3b8'
    },
    3: { t: 'Nublado', i: 'cloud', c: '#64748b' },
    45: { t: 'Neblina', i: 'cloud-fog', c: '#94a3b8' },
    48: { t: 'Nevoeiro com Geada', i: 'cloud-fog', c: '#94a3b8' },
    51: { t: 'Chuvisco Leve', i: 'cloud-drizzle', c: '#38bdf8' },
    53: { t: 'Chuvisco', i: 'cloud-drizzle', c: '#38bdf8' },
    55: { t: 'Chuvisco Forte', i: 'cloud-drizzle', c: '#38bdf8' },
    56: { t: 'Chuvisco Congelante', i: 'cloud-drizzle', c: '#7dd3fc' },
    57: { t: 'Chuvisco Congelante Forte', i: 'cloud-drizzle', c: '#7dd3fc' },
    61: { t: 'Chuva Leve', i: 'cloud-rain', c: '#3b82f6' },
    63: { t: 'Chuva', i: 'cloud-rain', c: '#3b82f6' },
    65: { t: 'Chuva Forte', i: 'cloud-rain', c: '#3b82f6' },
    66: { t: 'Chuva Congelante', i: 'cloud-hail', c: '#7dd3fc' },
    67: { t: 'Chuva Congelante Forte', i: 'cloud-hail', c: '#7dd3fc' },
    71: { t: 'Neve Fraca', i: 'cloud-snow', c: '#e2e8f0' },
    73: { t: 'Neve', i: 'cloud-snow', c: '#e2e8f0' },
    75: { t: 'Neve Forte', i: 'cloud-snow', c: '#e2e8f0' },
    77: { t: 'Grãos de Neve', i: 'snowflake', c: '#e2e8f0' },
    80: { t: 'Pancadas', i: 'cloud-rain', c: '#3b82f6' },
    81: { t: 'Pancadas Fortes', i: 'cloud-rain', c: '#3b82f6' },
    82: { t: 'Pancadas Violentas', i: 'cloud-rain', c: '#3b82f6' },
    85: { t: 'Pancadas de Neve', i: 'cloud-snow', c: '#e2e8f0' },
    86: { t: 'Pancadas de Neve Fortes', i: 'cloud-snow', c: '#e2e8f0' },
    95: { t: 'Tempestade', i: 'cloud-lightning', c: '#a855f7' },
    96: { t: 'Tempestade com Granizo', i: 'cloud-lightning', c: '#a855f7' },
    99: { t: 'Tempestade Severa com Granizo', i: 'cloud-lightning', c: '#a855f7' }
  };
  let res = map[code];
  if (!res) res = code < 50 ? map[3] : code < 70 ? map[61] : code < 90 ? map[80] : map[95];
  return res;
}

function getWindDirectionStr(degrees) {
  const points = [
    'Norte',
    'Nordeste',
    'Leste',
    'Sudeste',
    'Sul',
    'Sudoeste',
    'Oeste',
    'Noroeste'
  ];
  const normalized = ((degrees % 360) + 360) % 360;
  return points[Math.round(normalized / 45) % 8];
}
