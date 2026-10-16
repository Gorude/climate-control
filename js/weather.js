/**
 * AeroSky - Acesso às APIs Meteorológicas e Cache Offline
 */

const WeatherService = {
  CACHE_KEY: 'aerosky_last_forecast',

  /**
   * Busca os dados meteorológicos completos da API Open-Meteo
   */
  async fetchForecast(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover',
      hourly:
        'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code,uv_index,relative_humidity_2m,pressure_msl,visibility,dew_point_2m,is_day,cloud_cover,apparent_temperature,wind_direction_10m',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_sum,precipitation_probability_max',
      timezone: 'auto',
      past_days: 1
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error('Falha na API Open-Meteo: status ' + res.status);
    return await res.json();
  },

  /**
   * Geocodificação reversa usando Nominatim OpenStreetMap
   */
  async reverseGeocode(lat, lon) {
    try {
      // O idioma vai na query string para evitar preflight CORS desnecessário
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1&accept-language=pt-BR`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) throw new Error('Erro no Nominatim');
      const data = await res.json();
      const addr = (data && data.address) || {};
      const city =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.suburb ||
        addr.city_district ||
        'Sua Localização';
      const state = addr.state || '';
      const uf = BRAZIL_UF[state] || state;
      return uf ? `${city} - ${uf}` : city;
    } catch (e) {
      console.warn('Erro na geocodificação reversa:', e);
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  },

  /**
   * Guarda a última previsão para abertura instantânea e uso offline
   */
  saveCachedForecast(lat, lon, data) {
    try {
      localStorage.setItem(
        this.CACHE_KEY,
        JSON.stringify({ lat, lon, savedAt: Date.now(), data })
      );
    } catch (e) {
      console.warn('Não foi possível salvar a previsão em cache:', e);
    }
  },

  /**
   * Retorna a previsão em cache se for da mesma localização e tiver menos de 12h
   */
  loadCachedForecast(lat, lon) {
    try {
      const entry = JSON.parse(localStorage.getItem(this.CACHE_KEY));
      if (!entry || !entry.data) return null;
      if (!isSameLocation(entry, { lat, lon })) return null;
      if (Date.now() - entry.savedAt > 12 * 3600 * 1000) return null;
      return entry;
    } catch (e) {
      return null;
    }
  }
};

window.WeatherService = WeatherService;
