/**
 * AeroSky - Mapa de Radar de Chuva (RainViewer + Leaflet)
 *
 * - Animação dos últimos quadros do radar (passos de 10 min) com play/pausa e linha do tempo.
 * - Pré-carrega o próximo quadro e só avança quando ele terminou de carregar (sem piscar).
 * - Tiles de 512px: 4× menos requisições (a API gratuita limita a 100 req/min por IP).
 * - O radar só existe até o zoom 7; com tiles de 512px isso equivale ao zoom 8 do mapa.
 * - Rótulos de cidades desenhados acima da chuva para manter a orientação.
 * - Toque no mapa para ver a previsão daquele ponto.
 */

const RadarMap = {
  map: null,
  marker: null,
  host: '',
  frames: [],
  layers: new Map(), // path -> L.TileLayer
  index: 0,
  playing: false,
  timer: null,
  refreshTimer: null,
  lastFetch: 0,
  opacityLevels: [0.5, 0.7, 0.9],
  opacityIndex: 1,
  isOpen: false,

  MAX_FRAMES: 10,
  FRAME_MS: 600,
  END_PAUSE_MS: 1600,
  REFRESH_MS: 5 * 60 * 1000,
  // Paleta "Universal Blue" do RainViewer (extraída da tabela oficial dBZ → cor)
  LEGEND_GRADIENT:
    'linear-gradient(to right, #d6c88f 0%, #88ddee 9%, #00a3e0 18%, #0077aa 27%, #004768 36%, #ffee00 36%, #ffaa00 45%, #ff8100 53%, #ff4400 55%, #c10000 64%, #5d0000 72%, #ffaaff 73%, #ff58ff 100%)',

  get opacity() {
    return this.opacityLevels[this.opacityIndex];
  },

  open() {
    this.isOpen = true;
    this.ensureMap();
    if (!this.map) return;

    this.map.setView([LAT, LON], 7, { animate: false });
    this.updateMarker();
    // Recalcula o tamanho depois da animação de abertura do modal
    setTimeout(() => this.map && this.map.invalidateSize(), 320);

    if (Date.now() - this.lastFetch > this.REFRESH_MS || this.frames.length === 0) {
      this.loadFrames();
    } else if (!this.prefersReducedMotion()) {
      this.play();
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.loadFrames(), this.REFRESH_MS);
  },

  close() {
    this.isOpen = false;
    this.pause();
    clearInterval(this.refreshTimer);
    if (this.map) this.map.closePopup();
  },

  invalidate() {
    if (this.map && this.isOpen) this.map.invalidateSize();
  },

  prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  ensureMap() {
    if (this.map) return;
    if (typeof L === 'undefined') {
      this.setStatus('Mapa indisponível (biblioteca não carregada).');
      return;
    }

    const legendBar = document.querySelector('.radar-legend-bar');
    if (legendBar) legendBar.style.background = this.LEGEND_GRADIENT;

    this.map = L.map('weather-map-container', {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 10,
      worldCopyJump: true,
      attributionControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);
    L.control
      .attribution({ position: 'bottomright', prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' })
      .addAttribution(
        '&copy; Esri &copy; OpenStreetMap | Radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'
      )
      .addTo(this.map);

    // Camadas: base escura → radar → rótulos (cidades sempre legíveis sobre a chuva)
    this.map.createPane('radar').style.zIndex = 350;
    const labelsPane = this.map.createPane('labels');
    labelsPane.style.zIndex = 450;
    labelsPane.style.pointerEvents = 'none';

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16 }
    ).addTo(this.map);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16, pane: 'labels' }
    ).addTo(this.map);

    // Botão de recentralizar na cidade exibida
    const Recenter = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const btn = L.DomUtil.create('button', 'radar-recenter');
        btn.type = 'button';
        btn.title = 'Centralizar na cidade';
        btn.setAttribute('aria-label', 'Centralizar na cidade');
        btn.innerHTML = '<i data-lucide="locate-fixed" width="18" height="18"></i>';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', () => this.map.flyTo([LAT, LON], Math.max(this.map.getZoom(), 7)));
        return btn;
      }
    });
    this.map.addControl(new Recenter());
    if (window.lucide) lucide.createIcons();

    this.map.on('click', (e) => this.showPointPopup(e.latlng));
  },

  updateMarker() {
    const icon = L.divIcon({
      className: 'radar-you',
      html: '<span class="radar-you-pulse"></span><span class="radar-you-dot"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    if (this.marker) {
      this.marker.setLatLng([LAT, LON]);
    } else {
      this.marker = L.marker([LAT, LON], { icon, keyboard: false, interactive: true }).addTo(this.map);
    }
    this.marker.bindTooltip(escapeHtml(currentCityName), { direction: 'top', offset: [0, -10] });
  },

  showPointPopup(latlng) {
    const lat = Math.round(latlng.lat * 10000) / 10000;
    const lon = Math.round(latlng.wrap().lng * 10000) / 10000;
    const wrap = document.createElement('div');
    wrap.className = 'radar-popup';
    const coords = document.createElement('div');
    coords.className = 'radar-popup-coords';
    coords.textContent = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'radar-popup-btn';
    btn.textContent = 'Ver previsão aqui';
    btn.addEventListener('click', () => {
      this.map.closePopup();
      toggleWeatherMap(false);
      setLocationFromCoords(lat, lon, 'Local selecionado', 'manual');
    });
    wrap.append(coords, btn);
    L.popup({ closeButton: false, className: 'radar-popup-wrap', offset: [0, -2] })
      .setLatLng(latlng)
      .setContent(wrap)
      .openOn(this.map);
  },

  async loadFrames() {
    if (!this.map) return;
    this.setStatus('Atualizando radar...');
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();
      const past = (data && data.radar && data.radar.past) || [];
      if (past.length === 0) throw new Error('Sem quadros de radar');

      this.host = data.host;
      this.frames = past.slice(-this.MAX_FRAMES);
      this.lastFetch = Date.now();

      // Remove camadas de quadros que saíram da janela
      const keep = new Set(this.frames.map((f) => f.path));
      this.layers.forEach((layer, path) => {
        if (!keep.has(path)) {
          this.map.removeLayer(layer);
          this.layers.delete(path);
        }
      });

      const slider = document.getElementById('radar-slider');
      if (slider) {
        slider.max = String(this.frames.length - 1);
        slider.disabled = this.frames.length < 2;
      }

      this.showFrame(this.frames.length - 1);
      const minutes = Math.round((this.frames.at(-1).time - this.frames[0].time) / 60);
      this.setStatus(`Últimos ${minutes} min · atualizado às ${formatTimeInCity(this.lastFetch)}`);

      if (this.isOpen && !this.prefersReducedMotion()) this.play();
    } catch (err) {
      console.warn('Erro ao carregar radar:', err);
      this.setStatus('Radar indisponível no momento. Tente novamente em instantes.', true);
      this.pause();
    }
  },

  layerFor(frame) {
    let layer = this.layers.get(frame.path);
    if (!layer) {
      layer = L.tileLayer(`${this.host}${frame.path}/512/{z}/{x}/{y}/2/1_0.png`, {
        tileSize: 512,
        zoomOffset: -1,
        maxNativeZoom: 8,
        maxZoom: 10,
        opacity: 0,
        pane: 'radar',
        className: 'radar-frame'
      });
      layer.addTo(this.map);
      this.layers.set(frame.path, layer);
    }
    return layer;
  },

  showFrame(i) {
    if (this.frames.length === 0) return;
    this.index = (i + this.frames.length) % this.frames.length;
    const frame = this.frames[this.index];
    const current = this.layerFor(frame);

    this.layers.forEach((layer) => {
      layer.setOpacity(layer === current ? this.opacity : 0);
    });

    // Pré-carrega o próximo quadro para a animação não piscar
    const next = this.frames[(this.index + 1) % this.frames.length];
    if (next) this.layerFor(next);

    this.updateTimeLabel(frame);
  },

  updateTimeLabel(frame) {
    const ms = frame.time * 1000;
    const ago = Math.max(0, Math.round((Date.now() - ms) / 60000));
    const timeEl = document.getElementById('radar-time');
    const agoEl = document.getElementById('radar-ago');
    const slider = document.getElementById('radar-slider');
    const isLatest = this.index === this.frames.length - 1;
    const time = formatTimeInCity(ms);
    if (timeEl) timeEl.textContent = time;
    if (agoEl) agoEl.textContent = isLatest ? `Mais recente · há ${ago} min` : `há ${ago} min`;
    if (slider) {
      slider.value = String(this.index);
      slider.setAttribute('aria-valuetext', `${time}, há ${ago} minutos`);
      const pct = this.frames.length > 1 ? (this.index / (this.frames.length - 1)) * 100 : 100;
      slider.style.setProperty('--progress', `${pct}%`);
    }
  },

  play() {
    if (this.frames.length < 2) return;
    this.playing = true;
    this.updatePlayButton();
    clearTimeout(this.timer);
    this.scheduleNext(this.FRAME_MS);
  },

  pause() {
    this.playing = false;
    clearTimeout(this.timer);
    this.updatePlayButton();
  },

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  },

  scheduleNext(delay) {
    this.timer = setTimeout(() => this.tick(), delay);
  },

  tick(waited = 0) {
    if (!this.playing) return;
    const nextIndex = (this.index + 1) % this.frames.length;
    const nextLayer = this.layerFor(this.frames[nextIndex]);
    // Aguarda o próximo quadro terminar de carregar (até ~2,5 s)
    if (nextLayer.isLoading && nextLayer.isLoading() && waited < 2500) {
      this.timer = setTimeout(() => this.tick(waited + 150), 150);
      return;
    }
    this.showFrame(nextIndex);
    const isLatest = this.index === this.frames.length - 1;
    this.scheduleNext(isLatest ? this.END_PAUSE_MS : this.FRAME_MS);
  },

  step(delta) {
    this.pause();
    this.showFrame(this.index + delta);
  },

  seek(value) {
    this.pause();
    this.showFrame(parseInt(value, 10));
  },

  cycleOpacity() {
    this.opacityIndex = (this.opacityIndex + 1) % this.opacityLevels.length;
    const btn = document.getElementById('radar-opacity');
    if (btn) {
      const pct = Math.round(this.opacity * 100);
      btn.querySelector('span').textContent = `${pct}%`;
      btn.setAttribute('aria-label', `Opacidade do radar: ${pct}%`);
    }
    this.showFrame(this.index);
  },

  updatePlayButton() {
    const btn = document.getElementById('radar-play');
    if (!btn) return;
    btn.setAttribute('aria-label', this.playing ? 'Pausar animação' : 'Reproduzir animação');
    btn.title = this.playing ? 'Pausar' : 'Reproduzir';
    btn.innerHTML = `<i data-lucide="${this.playing ? 'pause' : 'play'}" width="18" height="18"></i>`;
    if (window.lucide) lucide.createIcons({ root: btn });
  },

  setStatus(text, isError = false) {
    const el = document.getElementById('radar-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
  }
};

window.RadarMap = RadarMap;

window.toggleWeatherMap = function (show) {
  const overlay = document.getElementById('map-overlay');
  if (!overlay) return;
  overlay.classList.toggle('active', !!show);
  overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) {
    RadarMap.open();
    const closeBtn = overlay.querySelector('.map-close-btn');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  } else {
    RadarMap.close();
    const opener = document.getElementById('btn-map');
    if (opener) opener.focus({ preventScroll: true });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('radar-slider');
  if (slider) slider.addEventListener('input', (e) => RadarMap.seek(e.target.value));

  // Espaço alterna a animação; ←/→ trocam de quadro (fora de campos e botões)
  const modal = document.querySelector('.map-modal');
  if (modal) {
    modal.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') return;
      if (e.key === ' ') {
        e.preventDefault();
        RadarMap.togglePlay();
      }
    });
  }

  // Economia: pausa a animação com a aba em segundo plano
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) RadarMap.pause();
    else if (RadarMap.isOpen && !RadarMap.prefersReducedMotion()) RadarMap.play();
  });
});
