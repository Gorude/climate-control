/**
 * AeroSky Weather - Motor de Efeitos Climáticos Dinâmicos em Canvas (Ultra-Otimizado)
 * Renderiza chuva com inclinação de vento e respingos, tempestades com relâmpagos sutis,
 * névoa atmosférica e céu estrelado com estrelas cadentes à noite.
 * Desenvolvido para 60 FPS estáveis, desenho em lote (batching), pausa inteligente e baixo consumo de bateria.
 */

const WeatherParticles = {
  canvas: null,
  ctx: null,
  enabled: true,
  isRunning: false,
  animationFrameId: null,
  currentMode: 'none', // 'none' | 'rain' | 'thunderstorm' | 'mist' | 'stars'
  particles: [],
  splashes: [],
  shootingStars: [],
  windSpeed: 10, // km/h
  isDay: 1,
  lastFlashTime: 0,
  lastFrameTime: 0,
  flashOpacity: 0,
  nextFlashInterval: 5000,
  nextShootingStarTime: 0,

  STORAGE_KEY: 'aerosky_particles_enabled',

  init() {
    this.canvas = document.getElementById('weather-particles-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    // Recupera preferência do usuário
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    } catch (e) {
      console.warn('Erro ao ler preferência de partículas:', e);
    }

    this.resize();

    // Redimensionamento debounced (evita recalcular ao rolar a página em celulares)
    let resizeTimer;
    window.addEventListener(
      'resize',
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          // Só redimensiona se houver mudança real de largura (evita disparos causados pela barra do navegador móvel)
          if (Math.abs(window.innerWidth - (this.displayWidth || 0)) > 20) {
            this.resize();
          }
        }, 200);
      },
      { passive: true }
    );

    // Economia de bateria: auto-pausa quando a aba fica em segundo plano
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else if (this.enabled && this.currentMode !== 'none') {
        this.start();
      }
    });

    this.updateToggleButton();
  },

  resize() {
    if (!this.canvas) return;
    // 1x DPR: reduz em até 9x a sobrecarga da GPU móvel garantindo 60 FPS fluidos
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.displayWidth = w;
    this.displayHeight = h;
    this.resetParticles();
  },

  updateToggleButton() {
    const btn = document.getElementById('btn-particles');
    if (!btn) return;
    if (this.enabled) {
      btn.classList.add('particles-active');
      btn.title = 'Desativar efeitos climáticos dinâmicos';
      btn.setAttribute('aria-label', 'Desativar efeitos climáticos');
    } else {
      btn.classList.remove('particles-active');
      btn.title = 'Ativar efeitos climáticos dinâmicos';
      btn.setAttribute('aria-label', 'Ativar efeitos climáticos');
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

    if (this.enabled) {
      if (typeof showToast === 'function') {
        showToast('Efeitos climáticos ativados ✨');
      }
      this.start();
    } else {
      if (typeof showToast === 'function') {
        showToast('Efeitos climáticos desativados');
      }
      this.stop();
      this.clearCanvas();
    }
  },

  setWeatherCondition(weatherCode, isDay = 1, windKmh = 10) {
    this.isDay = isDay;
    this.windSpeed = typeof windKmh === 'number' ? windKmh : 10;

    let newMode = 'none';

    // Tempestade
    if ([95, 96, 99].includes(weatherCode)) {
      newMode = 'thunderstorm';
    }
    // Chuva / Garoa / Pancadas
    else if (
      [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)
    ) {
      newMode = 'rain';
    }
    // Névoa / Neblina
    else if ([45, 48].includes(weatherCode)) {
      newMode = 'mist';
    }
    // Noite limpa ou poucas nuvens
    else if (!isDay && [0, 1, 2].includes(weatherCode)) {
      newMode = 'stars';
    }

    if (newMode !== this.currentMode) {
      this.currentMode = newMode;
      this.resetParticles();
      if (this.enabled && this.currentMode !== 'none') {
        this.start();
      } else {
        this.stop();
        this.clearCanvas();
      }
    }
  },

  resetParticles() {
    this.particles = [];
    this.splashes = [];
    this.shootingStars = [];
    this.flashOpacity = 0;
    this.lastFlashTime = performance.now();
    this.nextShootingStarTime = performance.now() + 8000;

    const w = this.displayWidth || window.innerWidth;
    const h = this.displayHeight || window.innerHeight;
    const isMobile = w < 768;

    if (this.currentMode === 'rain' || this.currentMode === 'thunderstorm') {
      const count = isMobile
        ? this.currentMode === 'thunderstorm'
          ? 50
          : 35
        : this.currentMode === 'thunderstorm'
          ? 85
          : 55;

      for (let i = 0; i < count; i++) {
        this.particles.push(this.createRainDrop(w, h, true));
      }
    } else if (this.currentMode === 'mist') {
      const count = isMobile ? 12 : 20;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 50 + Math.random() * 80,
          speedX: 0.15 + Math.random() * 0.25,
          speedY: (Math.random() - 0.5) * 0.1,
          alpha: 0.03 + Math.random() * 0.04,
          phase: Math.random() * Math.PI * 2
        });
      }
    } else if (this.currentMode === 'stars') {
      const count = isMobile ? 35 : 65;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * (h * 0.75),
          radius: 0.8 + Math.random() * 1.3,
          baseAlpha: 0.3 + Math.random() * 0.5,
          twinkleSpeed: 0.015 + Math.random() * 0.03,
          twinklePhase: Math.random() * Math.PI * 2
        });
      }
    }
  },

  createRainDrop(w, h, randomY = false) {
    const windEffect = Math.min(Math.max(this.windSpeed * 0.2, -10), 10);
    return {
      x: Math.random() * (w + 160) - 80,
      y: randomY ? Math.random() * h : -20,
      length: 12 + Math.random() * 14,
      speedY: 13 + Math.random() * 8,
      speedX: windEffect + (Math.random() - 0.5) * 0.4
    };
  },

  addSplashes(x, y) {
    if (this.splashes.length > 20) return;
    const splashCount = 2;
    for (let i = 0; i < splashCount; i++) {
      const angle = Math.PI + Math.random() * Math.PI;
      const speed = 1.2 + Math.random() * 2.5;
      this.splashes.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1,
        decay: 0.06
      });
    }
  },

  start() {
    if (this.isRunning || !this.enabled || this.currentMode === 'none') return;
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
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(
      0,
      0,
      this.displayWidth || window.innerWidth,
      this.displayHeight || window.innerHeight
    );
  },

  render(timestamp) {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.displayWidth || window.innerWidth;
    const h = this.displayHeight || window.innerHeight;

    // Normalização de Delta Time: garante velocidade física idêntica a 60, 90, 120 ou 144 FPS
    const now = timestamp || performance.now();
    const delta = this.lastFrameTime ? now - this.lastFrameTime : 16.667;
    this.lastFrameTime = now;
    // dt = 1.0 a 60 FPS (16.667ms), dt = 0.5 a 120 FPS (8.333ms). Limitado entre 0.1 e 3.0 para evitar saltos.
    const dt = Math.min(Math.max(delta / 16.667, 0.1), 3.0);

    ctx.clearRect(0, 0, w, h);

    if (this.currentMode === 'rain' || this.currentMode === 'thunderstorm') {
      this.renderRain(ctx, w, h, now, dt);
    } else if (this.currentMode === 'mist') {
      this.renderMist(ctx, w, h, now, dt);
    } else if (this.currentMode === 'stars') {
      this.renderStars(ctx, w, h, now, dt);
    }
  },

  renderRain(ctx, w, h, timestamp, dt = 1.0) {
    // Flash de trovão suave para tempestade (decaimento temporal suave)
    if (this.currentMode === 'thunderstorm') {
      if (timestamp - this.lastFlashTime > this.nextFlashInterval) {
        this.flashOpacity = 0.22 + Math.random() * 0.15;
        this.lastFlashTime = timestamp;
        this.nextFlashInterval = 4000 + Math.random() * 7000;
      }

      if (this.flashOpacity > 0.01) {
        ctx.fillStyle = `rgba(220, 235, 255, ${this.flashOpacity})`;
        ctx.fillRect(0, 0, w, h);
        this.flashOpacity *= Math.pow(0.88, dt);
      }
    }

    // BATCH DRAW: 1 único stroke() para todas as gotas!
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(180, 220, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.speedX * 1.5, p.y + p.length);

      p.x += p.speedX * dt;
      p.y += p.speedY * dt;

      if (p.y >= h - 8) {
        this.addSplashes(p.x, h - 4);
        this.particles[i] = this.createRainDrop(w, h, false);
      } else if (p.x < -80 || p.x > w + 80) {
        this.particles[i] = this.createRainDrop(w, h, false);
      }
    }
    ctx.stroke();

    // BATCH DRAW: 1 único fill() para todos os respingos!
    if (this.splashes.length > 0) {
      ctx.fillStyle = 'rgba(180, 225, 255, 0.55)';
      ctx.beginPath();
      for (let i = this.splashes.length - 1; i >= 0; i--) {
        const s = this.splashes[i];
        ctx.moveTo(s.x + s.radius, s.y);
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);

        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 0.15 * dt;
        s.decay += 0.01 * dt;

        if (s.decay > 0.4) {
          this.splashes.splice(i, 1);
        }
      }
      ctx.fill();
    }
  },

  renderMist(ctx, w, h, timestamp, dt = 1.0) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.phase += 0.01 * dt;
      const currentAlpha = p.alpha * (0.8 + 0.2 * Math.sin(p.phase));

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      grad.addColorStop(0, `rgba(200, 220, 240, ${currentAlpha})`);
      grad.addColorStop(1, 'rgba(200, 220, 240, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      p.x += p.speedX * dt;
      p.y += Math.sin(p.phase) * 0.2 * dt;

      if (p.x - p.radius > w) {
        p.x = -p.radius;
        p.y = Math.random() * h;
      }
    }
  },

  renderStars(ctx, w, h, timestamp, dt = 1.0) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < this.particles.length; i++) {
      const star = this.particles[i];
      star.twinklePhase += star.twinkleSpeed * dt;
      const alpha = Math.max(
        0.1,
        star.baseAlpha + Math.sin(star.twinklePhase) * 0.35
      );

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Estrela Cadente Ocasional
    if (timestamp > this.nextShootingStarTime) {
      this.shootingStars.push({
        x: Math.random() * (w * 0.7),
        y: Math.random() * (h * 0.4),
        speedX: 8 + Math.random() * 6,
        speedY: 4 + Math.random() * 4,
        alpha: 0.9,
        decay: 0.025
      });
      this.nextShootingStarTime = timestamp + 14000 + Math.random() * 16000;
    }

    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const ss = this.shootingStars[i];

      ctx.strokeStyle = `rgba(255, 255, 255, ${ss.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(ss.x - ss.speedX * 3, ss.y - ss.speedY * 3);
      ctx.stroke();

      ss.x += ss.speedX * dt;
      ss.y += ss.speedY * dt;
      ss.alpha -= ss.decay * dt;

      if (ss.alpha <= 0 || ss.x > w || ss.y > h) {
        this.shootingStars.splice(i, 1);
      }
    }
  }
};
