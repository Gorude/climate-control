/**
 * AeroSky - Dados Meteorológicos e Cálculos Físico-Atmosféricos
 */

const WeatherService = {
  /**
   * Busca os dados meteorológicos completos da API Open-Meteo
   */
  async fetchForecast(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code,uv_index,relative_humidity_2m,pressure_msl,visibility,dew_point_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_sum&timezone=auto&past_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Falha na API Open-Meteo: status ' + res.status);
    return await res.json();
  },

  /**
   * Geocodificação reversa usando Nominatim OpenStreetMap
   */
  async reverseGeocode(lat, lon) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
        {
          headers: { 'Accept-Language': 'pt-BR' },
          signal: AbortSignal.timeout(6000)
        }
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
      const state = addr.state ? addr.state : '';
      return state ? `${city} - ${state}` : city;
    } catch (e) {
      console.warn('Erro na geocodificação reversa:', e);
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  },

  /**
   * Calcula o Ponto de Orvalho (Fórmula de Magnus-Tetens)
   */
  calculateDewPoint(temp, rh) {
    if (temp == null || rh == null) return null;
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * temp) / (b + temp) + Math.log(rh / 100);
    return (b * alpha) / (a - alpha);
  },

  /**
   * Calcula o índice Humidex (sensação de calor combinada com umidade)
   */
  calculateHumidex(temp, dewPoint) {
    if (temp == null || dewPoint == null) return temp;
    const e =
      6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPoint)));
    return temp + (5 / 9) * (e - 10);
  },

  /**
   * Calcula a densidade aproximada do ar úmido em kg/m³
   */
  calculateAirDensity(tempC, pressureHpa) {
    if (tempC == null || pressureHpa == null) return 1.225;
    const tempK = tempC + 273.15;
    const pressurePa = pressureHpa * 100;
    const R = 287.058; // constante de gás para o ar seco
    return pressurePa / (R * tempK);
  }
};

window.WeatherService = WeatherService;
