/**
 * AeroSky Weather - Motor de Efeitos Climáticos em Canvas
 * Cada condição do tempo vira uma "cena" composta por camadas (sol, estrelas,
 * nuvens, chuva, garoa, neve, granizo, neblina e relâmpagos), com profundidade
 * (parallax), intensidade proporcional à precipitação e vento real.
 * Sprites são pré-renderizados uma única vez e desenhados em lote para manter
 * 60 FPS em celulares; a animação pausa quando a aba fica em segundo plano.
 */

const WeatherParticles = {
  canvas: null,
  ctx: null,
  enabled: true,
  isRunning: false,
  animationFrameId: null,
  lastFrameTime: 0,
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,

  // Estado do tempo
  code: null,
  isDay: 1,
  windSpeed: 10, // km/h
  windDrift: 1, // componente leste-oeste (-1 = para oeste, 1 = para leste)
  precip: 0,
  cloudCover: null,
  twilight: false,

  scene: null,
  sceneKey: '',
  sprites: {},
  fadeTimer: null,

  // Camadas ativas
  stars: [],
  shootingStars: [],
  clouds: [],
  drops: [],
  ripples: [],
  flakes: [],
  hail: [],
  fogBands: [],
  motes: [],
  bolts: [],
  flash: 0,
  flashX: 0,
  nextLightning: 0,
  nextShootingStar: 0,

  STORAGE_KEY: 'aerosky_particles_enabled',

  init() {
    this.canvas = document.getElementById('weather-particles-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved !== null) {
        this.enabled = saved === 'true';
      } else if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // Respeita a preferência do sistema por menos animações
        this.enabled = false;
      }
    } catch (e) {
      console.warn('Erro ao ler preferência de partículas:', e);
    }

    this.resize();

    // Redimensionamento debounced (ignora a barra de endereço do navegador móvel)
    let resizeTimer;
    window.addEventListener(
      'resize',
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (Math.abs(window.innerWidth - this.width) > 20 || Math.abs(window.innerHeight - this.height) > 150) {
            this.resize();
          }
        }, 200);
      },
      { passive: true }
    );

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });

    // O crepúsculo muda ao longo do tempo mesmo sem nova previsão
    setInterval(() => this.updateSky(), 5 * 60 * 1000);

    this.updateToggleButton();
  },

  resize() {
    if (!this.canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Celulares em 1x (GPU móvel); desktop até 1.5x para traços mais nítidos
    this.dpr = w < 768 ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.width = w;
    this.height = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.buildLayers();
  },

  updateToggleButton() {
    const btn = document.getElementById('btn-particles');
    if (btn) {
      btn.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
      btn.classList.toggle('particles-active', this.enabled);
      btn.title = this.enabled ? 'Desativar efeitos climáticos dinâmicos' : 'Ativar efeitos climáticos dinâmicos';
      btn.setAttribute('aria-label', this.enabled ? 'Desativar efeitos climáticos' : 'Ativar efeitos climáticos');
    }
    if (typeof updateMenuStates === 'function') {
      updateMenuStates();
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(this.STORAGE_KEY, String(this.enabled));
    } catch (e) {
      console.warn('Erro ao salvar preferência de partículas:', e);
    }
    this.updateToggleButton();

    if (typeof showToast === 'function') {
      showToast(this.enabled ? 'Efeitos climáticos ativados ✨' : 'Efeitos climáticos desativados');
    }
    if (this.enabled) {
      this.buildLayers();
      this.canvas.style.opacity = '1';
      this.start();
    } else {
      this.stop();
      this.clearCanvas();
    }
  },

  /**
   * Atualiza a cena a partir das condições atuais.
   * opts.precip (mm) e opts.cloudCover (%) refinam a intensidade.
   */
  setWeatherCondition(weatherCode, isDay = 1, windKmh = 10, windFromDeg = 270, opts = {}) {
    this.code = weatherCode;
    this.isDay = isDay ? 1 : 0;
    this.windSpeed = typeof windKmh === 'number' ? windKmh : 10;
    // A direção meteorológica indica de onde o vento vem; o movimento vai para o lado oposto
    if (typeof windFromDeg === 'number') {
      this.windDrift = Math.sin((((windFromDeg + 180) % 360) * Math.PI) / 180);
    }
    this.precip = typeof opts.precip === 'number' ? opts.precip : 0;
    this.cloudCover = typeof opts.cloudCover === 'number' ? opts.cloudCover : null;

    const scene = this.describeScene();
    const key = JSON.stringify(scene);
    this.updateSky(scene);

    if (key === this.sceneKey) return;
    const hadScene = !!this.scene;
    this.scene = scene;
    this.sceneKey = key;

    if (!this.enabled || !this.canvas) {
      this.buildLayers();
      return;
    }

    // Transição suave entre cenas: esmaece, recria as camadas e reaparece
    clearTimeout(this.fadeTimer);
    if (hadScene && this.isRunning) {
      this.canvas.style.opacity = '0';
      this.fadeTimer = setTimeout(() => {
        this.buildLayers();
        this.canvas.style.opacity = '1';
      }, 700);
    } else {
      this.buildLayers();
      this.canvas.style.opacity = '1';
      this.start();
    }
  },

  // Traduz o código WMO em camadas e intensidades (0–1)
  describeScene() {
    const c = this.code;
    const day = !!this.isDay;
    const s = { sky: 'clear', sun: 0, stars: 0, clouds: 0, dark: false, rain: 0, drizzle: 0, snow: 0, hail: 0, fog: 0, storm: 0 };
    const pick = (map) => map[c] || 0;

    if (c === 0 || c === 1 || c === 2) {
      s.clouds = { 0: 0, 1: 0.22, 2: 0.5 }[c];
      if (this.cloudCover !== null) s.clouds = Math.max(s.clouds * 0.5, Math.min(this.cloudCover / 100, 0.65));
      s.sky = s.clouds >= 0.45 ? 'cloudy' : 'clear';
    } else if (c === 3) {
      s.sky = 'overcast';
      s.clouds = 0.9;
    } else if (c === 45 || c === 48) {
      s.sky = 'fog';
      s.fog = c === 48 ? 1 : 0.8;
      s.clouds = 0.3;
    } else if ([51, 53, 55, 56, 57].includes(c)) {
      s.sky = 'rain';
      s.drizzle = pick({ 51: 0.35, 53: 0.6, 55: 0.85, 56: 0.45, 57: 0.8 });
      s.clouds = 0.75;
    } else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) {
      s.sky = 'rain';
      s.rain = pick({ 61: 0.4, 63: 0.65, 65: 0.95, 66: 0.45, 67: 0.85, 80: 0.5, 81: 0.75, 82: 1 });
      s.clouds = 0.85;
      s.dark = s.rain >= 0.65;
    } else if ([71, 73, 75, 77, 85, 86].includes(c)) {
      s.sky = 'snow';
      s.snow = pick({ 71: 0.4, 73: 0.65, 75: 0.95, 77: 0.3, 85: 0.55, 86: 0.9 });
      s.clouds = 0.7;
    } else if ([95, 96, 99].includes(c)) {
      s.sky = 'storm';
      s.rain = c === 95 ? 0.8 : 0.95;
      s.hail = c === 95 ? 0 : c === 96 ? 0.4 : 0.8;
      s.storm = 1;
      s.clouds = 1;
      s.dark = true;
    }

    // Precipitação medida reforça a intensidade descrita pelo código
    const mmBoost = Math.min(this.precip / 6, 1);
    if (s.rain) s.rain = Math.max(s.rain, 0.35 + mmBoost * 0.65);
    if (s.snow) s.snow = Math.max(s.snow, 0.35 + mmBoost * 0.65);

    if (day) s.sun = s.sky === 'clear' ? 1 : s.sky === 'cloudy' ? 0.45 : 0;
    else s.stars = s.sky === 'clear' ? 1 : s.sky === 'cloudy' ? 0.45 : s.sky === 'fog' ? 0.1 : 0;

    // Arredonda para comparar cenas sem recriar por variações mínimas
    Object.keys(s).forEach((k) => {
      if (typeof s[k] === 'number') s[k] = Math.round(s[k] * 20) / 20;
    });
    s.day = day;
    return s;
  },

  // Fundo em CSS: cor do céu, brilho e crepúsculo (funciona mesmo com efeitos desligados)
  updateSky(scene = this.scene) {
    const bg = document.getElementById('weather-bg');
    if (!bg || !scene) return;
    this.twilight = false;
    if (typeof Astro !== 'undefined' && typeof LAT === 'number' && typeof LON === 'number') {
      const alt = Astro.sunPosition(Date.now(), LAT, LON).altitude;
      this.twilight = alt > -7 && alt < 7;
    }
    const tod = ['clear', 'cloudy', 'rain', 'snow'].includes(scene.sky) ? (scene.day ? '-day' : '-night') : '';
    bg.className = `sky-${scene.sky}${tod}${this.twilight && scene.sky !== 'storm' ? ' is-twilight' : ''}`;
  },

  // ---------- Sprites pré-renderizados ----------
  makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },

  rand(seed) {
    // Pseudo-aleatório determinístico para formas estáveis
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  },

  cloudSprite(variant, tone) {
    const key = `cloud-${variant}-${tone}`;
    if (this.sprites[key]) return this.sprites[key];
    const W = 480;
    const H = 260;
    const cv = this.makeCanvas(W, H);
    const g = cv.getContext('2d');
    const rnd = this.rand(variant * 977 + 13);
    const rgb = { light: '226, 234, 246', mid: '150, 164, 188', dark: '78, 88, 112' }[tone];
    const puffs = 16;
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      // Base achatada e topo arredondado, como um cúmulo
      const x = 100 + t * (W - 200) + (rnd() - 0.5) * 24;
      const arch = Math.sin(t * Math.PI);
      const y = H * 0.6 - arch * H * 0.14 * (0.6 + rnd() * 0.6);
      const r = 28 + arch * 40 + rnd() * 16;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${rgb}, 0.42)`);
      grad.addColorStop(0.55, `rgba(${rgb}, 0.22)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    this.sprites[key] = cv;
    return cv;
  },

  fogSprite() {
    if (this.sprites.fog) return this.sprites.fog;
    const W = 900;
    const H = 320;
    const cv = this.makeCanvas(W, H);
    const g = cv.getContext('2d');
    const rnd = this.rand(4242);
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * W;
      const y = H * 0.5 + (rnd() - 0.5) * H * 0.2;
      const rx = 90 + rnd() * 130;
      // Cada sopro é desenhado também deslocado de ±W: a faixa se repete sem emendas
      for (const x of [cx - W, cx, cx + W]) {
        const grad = g.createRadialGradient(x, y, 0, x, y, rx);
        grad.addColorStop(0, 'rgba(205, 215, 228, 0.1)');
        grad.addColorStop(1, 'rgba(205, 215, 228, 0)');
        g.fillStyle = grad;
        g.save();
        g.translate(x, y);
        g.scale(1, 0.38);
        g.translate(-x, -y);
        g.beginPath();
        g.arc(x, y, rx, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    this.sprites.fog = cv;
    return cv;
  },

  glowSprite(rgb) {
    const key = `glow-${rgb}`;
    if (this.sprites[key]) return this.sprites[key];
    const S = 64;
    const cv = this.makeCanvas(S, S);
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, `rgba(${rgb}, 1)`);
    grad.addColorStop(0.25, `rgba(${rgb}, 0.65)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    this.sprites[key] = cv;
    return cv;
  },

  raysSprite() {
    if (this.sprites.rays) return this.sprites.rays;
    const S = 900;
    const cv = this.makeCanvas(S, S);
    const g = cv.getContext('2d');
    const c = S / 2;
    const rnd = this.rand(77);
    g.translate(c, c);
    // Desfoque suaviza as bordas dos feixes (ignorado onde não houver suporte)
    g.filter = 'blur(10px)';
    const rays = 18;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + rnd() * 0.25;
      const spread = 0.025 + rnd() * 0.045;
      const len = c * (0.55 + rnd() * 0.4);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, len);
      grad.addColorStop(0, 'rgba(255, 236, 190, 0.45)');
      grad.addColorStop(0.5, 'rgba(255, 236, 190, 0.12)');
      grad.addColorStop(1, 'rgba(255, 236, 190, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, len, a - spread, a + spread);
      g.closePath();
      g.fill();
    }
    this.sprites.rays = cv;
    return cv;
  },

  // ---------- Construção das camadas ----------
  buildLayers() {
    const s = this.scene;
    this.stars = [];
    this.shootingStars = [];
    this.clouds = [];
    this.drops = [];
    this.ripples = [];
    this.flakes = [];
    this.hail = [];
    this.fogBands = [];
    this.motes = [];
    this.bolts = [];
    this.flash = 0;
    if (!s || !this.width) return;

    const w = this.width;
    const h = this.height;
    // Densidade proporcional à área da tela (referência: 1280×800)
    const area = Math.min(Math.max((w * h) / (1280 * 800), 0.35), 1.6);
    const now = performance.now();
    this.nextLightning = now + 1500 + Math.random() * 2500;
    this.nextShootingStar = now + 5000 + Math.random() * 6000;

    if (s.stars) {
      const n = Math.round(150 * area * s.stars);
      const tints = ['255, 255, 255', '255, 255, 255', '210, 225, 255', '255, 236, 210'];
      for (let i = 0; i < n; i++) {
        const z = Math.random();
        this.stars.push({
          x: Math.random() * w,
          y: Math.pow(Math.random(), 1.4) * h * 0.8,
          r: 0.4 + z * z * 1.5,
          base: 0.25 + z * 0.6,
          speed: 0.6 + Math.random() * 1.8,
          phase: Math.random() * Math.PI * 2,
          tint: tints[(Math.random() * tints.length) | 0],
          bright: z > 0.93
        });
      }
    }

    if (s.sun) {
      const n = Math.round(22 * area * s.sun);
      for (let i = 0; i < n; i++) this.motes.push(this.newMote(w, h, true));
    }

    if (s.clouds) {
      const n = Math.max(1, Math.round((2 + s.clouds * 9) * Math.min(w / 1100, 1.4)));
      const tone = s.dark ? 'dark' : !s.day || s.sky === 'overcast' || s.sky === 'rain' || s.sky === 'snow' ? 'mid' : 'light';
      for (let i = 0; i < n; i++) {
        const z = 0.35 + Math.random() * 0.65;
        const scale = (0.6 + z * 0.9) * (w < 600 ? 0.75 : 1);
        this.clouds.push({
          sprite: this.cloudSprite(i % 4, tone),
          x: Math.random() * (w + 400) - 200,
          y: -40 + Math.random() * h * (0.18 + s.clouds * 0.22),
          z,
          scale,
          alpha: (0.35 + z * 0.5) * (s.day ? 1 : 0.7) * (0.6 + s.clouds * 0.5),
          flip: Math.random() < 0.5
        });
      }
      this.clouds.sort((a, b) => a.z - b.z);
    }

    const rainAmt = s.rain || s.drizzle;
    if (rainAmt) {
      const drizzle = !s.rain;
      const n = Math.round((drizzle ? 140 : 180) * area * rainAmt + 20);
      for (let i = 0; i < n; i++) this.drops.push(this.newDrop(w, h, true, drizzle));
    }

    if (s.snow) {
      const n = Math.round(160 * area * s.snow + 20);
      for (let i = 0; i < n; i++) this.flakes.push(this.newFlake(w, h, true));
    }

    if (s.hail) {
      const n = Math.round(26 * area * s.hail);
      for (let i = 0; i < n; i++) this.hail.push(this.newHail(w, h, true));
    }

    if (s.fog) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const z = (i + 1) / n;
        this.fogBands.push({
          x: Math.random() * -900,
          y: h * (0.15 + 0.8 * z) - 160,
          speed: 0.08 + z * 0.22,
          scale: 0.9 + z * 0.8,
          alpha: (0.3 + z * 0.4) * s.fog,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
  },

  newDrop(w, h, randomY, drizzle) {
    const z = Math.random();
    const speed = drizzle ? 6 + z * 5 : 11 + z * 13;
    return {
      x: Math.random() * (w + 200) - 100,
      y: randomY ? Math.random() * h : -30 - Math.random() * 60,
      z,
      speed,
      len: drizzle ? 4 + z * 6 : 10 + z * 22,
      layer: z < 0.4 ? 0 : z < 0.78 ? 1 : 2,
      drizzle
    };
  },

  newFlake(w, h, randomY) {
    const z = Math.random();
    return {
      x: Math.random() * (w + 100) - 50,
      y: randomY ? Math.random() * h : -10 - Math.random() * 40,
      z,
      r: 1 + z * z * 3.6,
      vy: 0.35 + z * 1.25,
      sway: 0.4 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      spin: 0.4 + Math.random() * 0.8,
      alpha: 0.35 + z * 0.55
    };
  },

  newHail(w, h, randomY) {
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -10 - Math.random() * 200,
      vy: 13 + Math.random() * 7,
      vx: 0,
      r: 1.2 + Math.random() * 1.6,
      bounces: 0,
      alpha: 0.85
    };
  },

  newMote(w, h, randomY) {
    return {
      x: w * (0.45 + Math.random() * 0.6),
      y: randomY ? Math.random() * h * 0.75 : h * 0.75,
      r: 0.6 + Math.random() * 1.4,
      vy: -(0.08 + Math.random() * 0.18),
      phase: Math.random() * Math.PI * 2,
      alpha: 0.15 + Math.random() * 0.3
    };
  },

  // ---------- Loop ----------
  start() {
    if (this.isRunning || !this.enabled || !this.scene || document.hidden) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    const loop = (timestamp) => {
      if (!this.isRunning) return;
      this.render(timestamp);
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  },

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  },

  clearCanvas() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
  },

  render(timestamp) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.width;
    const h = this.height;
    const now = timestamp || performance.now();
    // dt = 1.0 a 60 FPS; mantém a física idêntica em 90/120/144 Hz
    const dt = Math.min(Math.max((now - this.lastFrameTime) / 16.667, 0.1), 3);
    this.lastFrameTime = now;
    this.time += dt / 60;

    ctx.clearRect(0, 0, w, h);
    const s = this.scene;
    // Rajadas: o vento oscila devagar, dando vida à inclinação da chuva e à deriva
    const gust = 1 + 0.25 * Math.sin(this.time * 0.7) + 0.1 * Math.sin(this.time * 2.3);
    const wind = Math.min(Math.max(this.windSpeed * 0.11 * this.windDrift, -7), 7) * gust;

    if (s.sun) this.drawSun(ctx, w, h, dt, s.sun);
    if (s.stars) this.drawStars(ctx, w, h, dt, now);
    if (this.clouds.length) this.drawClouds(ctx, w, dt);
    if (this.fogBands.length) this.drawFog(ctx, w, dt);
    if (s.storm) this.drawLightning(ctx, w, h, dt, now);
    if (this.drops.length) this.drawRain(ctx, w, h, dt, wind);
    if (this.flakes.length) this.drawSnow(ctx, w, h, dt, wind);
    if (this.hail.length) this.drawHail(ctx, w, h, dt, wind);
  },

  drawSun(ctx, w, h, dt, amount) {
    const cx = w * 0.86;
    const cy = this.twilight ? h * 0.2 : h * 0.04;
    const warm = this.twilight ? '255, 150, 90' : '255, 214, 140';
    const R = Math.max(w, h) * 0.55;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, `rgba(${warm}, ${0.2 * amount})`);
    glow.addColorStop(0.35, `rgba(${warm}, ${0.06 * amount})`);
    glow.addColorStop(1, `rgba(${warm}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Raios girando bem devagar, com "respiração" sutil
    const size = Math.max(w, h) * 1.1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.015);
    ctx.globalAlpha = (0.13 + 0.03 * Math.sin(this.time * 0.5)) * amount;
    ctx.drawImage(this.raysSprite(), -size / 2, -size / 2, size, size);
    ctx.restore();

    // Partículas de poeira dourada flutuando na luz
    const sprite = this.glowSprite('255, 230, 180');
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.phase += 0.01 * dt;
      m.y += m.vy * dt;
      m.x += Math.sin(m.phase) * 0.15 * dt;
      const fade = Math.min(1, m.y / (h * 0.2), (h * 0.75 - m.y) / (h * 0.15));
      if (m.y < -10) Object.assign(m, this.newMote(w, h, false));
      ctx.globalAlpha = Math.max(0, m.alpha * fade * (0.6 + 0.4 * Math.sin(m.phase * 3)));
      const d = m.r * 6;
      ctx.drawImage(sprite, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  },

  drawStars(ctx, w, h, dt, now) {
    const glow = this.glowSprite('220, 230, 255');
    for (let i = 0; i < this.stars.length; i++) {
      const st = this.stars[i];
      st.phase += st.speed * 0.02 * dt;
      // Cintilação irregular (soma de duas frequências)
      const tw = 0.65 + 0.35 * Math.sin(st.phase) * Math.sin(st.phase * 0.37 + 1);
      const a = Math.max(0.05, st.base * tw);
      if (st.bright) {
        ctx.globalAlpha = a * 0.55;
        const d = st.r * 9;
        ctx.drawImage(glow, st.x - d / 2, st.y - d / 2, d, d);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${st.tint})`;
      ctx.fillRect(st.x - st.r / 2, st.y - st.r / 2, st.r, st.r);
    }
    ctx.globalAlpha = 1;

    // Estrelas cadentes ocasionais, com cauda em degradê
    if (now > this.nextShootingStar && this.scene.stars >= 0.5) {
      const ang = (20 + Math.random() * 25) * (Math.PI / 180) * (Math.random() < 0.5 ? 1 : -1);
      const speed = 11 + Math.random() * 7;
      const dir = Math.sign(ang);
      this.shootingStars.push({
        x: dir > 0 ? Math.random() * w * 0.6 : w * 0.4 + Math.random() * w * 0.6,
        y: Math.random() * h * 0.35,
        vx: Math.cos(Math.abs(ang)) * speed * dir,
        vy: Math.sin(Math.abs(ang)) * speed,
        life: 1,
        len: 90 + Math.random() * 80
      });
      this.nextShootingStar = now + 9000 + Math.random() * 14000;
    }
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const ss = this.shootingStars[i];
      ss.x += ss.vx * dt;
      ss.y += ss.vy * dt;
      ss.life -= 0.018 * dt;
      if (ss.life <= 0) {
        this.shootingStars.splice(i, 1);
        continue;
      }
      // Surge, brilha e se apaga
      const a = Math.sin(ss.life * Math.PI);
      const mag = Math.hypot(ss.vx, ss.vy);
      const tx = ss.x - (ss.vx / mag) * ss.len;
      const ty = ss.y - (ss.vy / mag) * ss.len;
      const grad = ctx.createLinearGradient(ss.x, ss.y, tx, ty);
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * a})`);
      grad.addColorStop(1, 'rgba(180, 210, 255, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.drawImage(glow, ss.x - 6, ss.y - 6, 12, 12);
      ctx.globalAlpha = 1;
    }
  },

  drawClouds(ctx, w, dt) {
    const dir = this.windDrift >= 0 ? 1 : -1;
    const base = 0.06 + Math.min(this.windSpeed, 60) * 0.006;
    const flash = this.flash;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const cw = c.sprite.width * c.scale;
      const ch = c.sprite.height * c.scale;
      c.x += base * c.z * dir * dt;
      if (dir > 0 && c.x > w + 40) c.x = -cw - 40;
      if (dir < 0 && c.x < -cw - 40) c.x = w + 40;
      ctx.globalAlpha = Math.min(1, c.alpha + flash * 0.8);
      if (c.flip) {
        ctx.save();
        ctx.translate(c.x + cw, c.y);
        ctx.scale(-1, 1);
        ctx.drawImage(c.sprite, 0, 0, cw, ch);
        ctx.restore();
      } else {
        ctx.drawImage(c.sprite, c.x, c.y, cw, ch);
      }
    }
    ctx.globalAlpha = 1;
  },

  drawFog(ctx, w, dt) {
    const sprite = this.fogSprite();
    for (let i = 0; i < this.fogBands.length; i++) {
      const f = this.fogBands[i];
      f.phase += 0.004 * dt;
      f.x += f.speed * dt;
      const fw = sprite.width * f.scale;
      const fh = sprite.height * f.scale;
      if (f.x > 0) f.x -= fw;
      ctx.globalAlpha = f.alpha * (0.8 + 0.2 * Math.sin(f.phase));
      const y = f.y + Math.sin(f.phase * 1.3) * 12;
      // Faixa repetida horizontalmente para cobrir a tela sem emendas
      for (let x = f.x; x < w; x += fw) ctx.drawImage(sprite, x, y, fw, fh);
    }
    ctx.globalAlpha = 1;
  },

  drawRain(ctx, w, h, dt, wind) {
    // Três camadas de profundidade: distante (fina, translúcida) → próxima (longa, nítida)
    const styles = [
      { a: 0.16, lw: 0.7 },
      { a: 0.3, lw: 1 },
      { a: 0.5, lw: 1.35 }
    ];
    const drizzle = !this.scene.rain;
    ctx.lineCap = 'round';
    for (let layer = 0; layer < 3; layer++) {
      const st = styles[layer];
      ctx.strokeStyle = `rgba(185, 215, 250, ${drizzle ? st.a * 0.8 : st.a})`;
      ctx.lineWidth = drizzle ? st.lw * 0.8 : st.lw;
      ctx.beginPath();
      for (let i = 0; i < this.drops.length; i++) {
        const p = this.drops[i];
        if (p.layer !== layer) continue;
        const vx = wind * (0.5 + p.z * 0.6);
        const k = p.len / p.speed;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - vx * k, p.y - p.len);
        p.x += vx * dt;
        p.y += p.speed * dt;
        if (p.y > h + 10) {
          if (layer === 2 && !drizzle && this.ripples.length < 40) this.addRipple(p.x, h - 3 - Math.random() * 6);
          Object.assign(p, this.newDrop(w, h, false, drizzle));
        } else if (p.x < -120 || p.x > w + 120) {
          Object.assign(p, this.newDrop(w, h, false, drizzle));
        }
      }
      ctx.stroke();
    }

    // Respingos: anel que se expande + gotículas que saltam
    if (this.ripples.length) {
      ctx.strokeStyle = 'rgba(190, 220, 255, 0.35)';
      ctx.fillStyle = 'rgba(200, 228, 255, 0.55)';
      ctx.lineWidth = 0.8;
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.life -= 0.05 * dt;
        if (r.life <= 0) {
          this.ripples.splice(i, 1);
          continue;
        }
        const grow = 1 - r.life;
        ctx.globalAlpha = r.life;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, 2 + grow * 9, 0.8 + grow * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (let j = 0; j < r.drops.length; j++) {
          const d = r.drops[j];
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vy += 0.22 * dt;
          ctx.moveTo(d.x + 1, d.y);
          ctx.arc(d.x, d.y, 1, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },

  addRipple(x, y) {
    const drops = [];
    for (let i = 0; i < 2; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 1.2 + Math.random() * 1.6;
      drops.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
    }
    this.ripples.push({ x, y, life: 1, drops });
  },

  drawSnow(ctx, w, h, dt, wind) {
    const sprite = this.glowSprite('245, 250, 255');
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.phase += 0.02 * f.spin * dt;
      f.y += f.vy * dt;
      f.x += (Math.sin(f.phase) * f.sway * 0.5 + wind * 0.25 * (0.4 + f.z)) * dt;
      if (f.y > h + 10 || f.x < -60 || f.x > w + 60) Object.assign(f, this.newFlake(w, h, false));
      const d = f.r * 3;
      ctx.globalAlpha = f.alpha;
      ctx.drawImage(sprite, f.x - d / 2, f.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  },

  drawHail(ctx, w, h, dt, wind) {
    ctx.fillStyle = 'rgba(235, 245, 255, 0.85)';
    ctx.strokeStyle = 'rgba(160, 200, 240, 0.6)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < this.hail.length; i++) {
      const p = this.hail[i];
      p.x += (wind * 0.6 + p.vx) * dt;
      p.y += p.vy * dt;
      if (p.bounces === 0) p.vy = Math.min(p.vy + 0.2 * dt, 22);
      else p.vy += 0.5 * dt;
      // Quica ao tocar o chão e some em seguida
      if (p.y > h - p.r && p.bounces < 2) {
        p.y = h - p.r;
        p.vy = -p.vy * (p.bounces === 0 ? 0.35 : 0.25);
        p.vx = (Math.random() - 0.5) * 3;
        p.bounces++;
      }
      if (p.bounces >= 1) p.alpha -= 0.025 * dt;
      if (p.alpha <= 0 || p.y > h + 20) {
        Object.assign(p, this.newHail(w, h, false));
        continue;
      }
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // ---------- Relâmpagos ----------
  makeBolt(x0, y0, x1, y1, spread, depth) {
    // Deslocamento de ponto médio: zigue-zague natural de um raio
    let pts = [
      [x0, y0],
      [x1, y1]
    ];
    for (let it = 0; it < 6; it++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        next.push([(ax + bx) / 2 + (Math.random() - 0.5) * spread, (ay + by) / 2 + (Math.random() - 0.5) * spread * 0.25]);
        next.push(pts[i + 1]);
      }
      pts = next;
      spread *= 0.55;
    }
    const branches = [];
    if (depth < 2) {
      for (let i = 4; i < pts.length - 8; i += 6) {
        if (Math.random() < 0.22) {
          const [bx, by] = pts[i];
          const len = (y1 - y0) * (0.2 + Math.random() * 0.25);
          const ex = bx + (Math.random() - 0.5) * len * 1.2;
          branches.push(this.makeBolt(bx, by, ex, by + len, len * 0.35, depth + 1));
        }
      }
    }
    return { pts, branches, width: depth === 0 ? 1.8 : 1.1 - depth * 0.3 };
  },

  strokeBolt(ctx, bolt, a) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1]);
      for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1]);
    };
    path();
    ctx.strokeStyle = `rgba(150, 180, 255, ${0.18 * a})`;
    ctx.lineWidth = bolt.width * 6;
    ctx.stroke();
    ctx.strokeStyle = `rgba(245, 248, 255, ${0.95 * a})`;
    ctx.lineWidth = bolt.width;
    ctx.stroke();
    for (let i = 0; i < bolt.branches.length; i++) this.strokeBolt(ctx, bolt.branches[i], a * 0.7);
  },

  drawLightning(ctx, w, h, dt, now) {
    if (now > this.nextLightning) {
      this.flashX = w * (0.15 + Math.random() * 0.7);
      // ~55% raios visíveis; o resto são clarões entre nuvens
      if (Math.random() < 0.55) {
        const x0 = this.flashX;
        const y1 = h * (0.45 + Math.random() * 0.4);
        this.bolts.push({
          bolt: this.makeBolt(x0, -10, x0 + (Math.random() - 0.5) * w * 0.25, y1, w * 0.12, 0),
          start: now,
          // Padrão de cintilação típico: pisca, apaga, pisca de novo
          pattern: [1, 0.25, 0.85, 0.1, 0.6]
        });
        this.flash = 0.32;
      } else {
        this.flash = 0.18 + Math.random() * 0.12;
      }
      this.nextLightning = now + 3500 + Math.random() * 8000;
    }

    if (this.flash > 0.005) {
      const g = ctx.createRadialGradient(this.flashX, 0, 0, this.flashX, 0, Math.max(w, h) * 0.9);
      g.addColorStop(0, `rgba(215, 225, 255, ${this.flash})`);
      g.addColorStop(1, `rgba(215, 225, 255, ${this.flash * 0.15})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      this.flash *= Math.pow(0.86, dt);
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const t = (now - b.start) / 70;
      const idx = Math.floor(t);
      if (idx >= b.pattern.length) {
        this.bolts.splice(i, 1);
        continue;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.strokeBolt(ctx, b.bolt, b.pattern[idx]);
      if (idx === 2 && this.flash < 0.15) this.flash = 0.2;
    }
  }
};
