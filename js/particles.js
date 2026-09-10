/**
 * AeroSky Weather - Motor de Efeitos Climáticos Dinâmicos em Canvas
 * Renderiza chuva com inclinação de vento e respingos, tempestades com relâmpagos sutis,
 * névoa atmosférica e céu estrelado com estrelas cadentes à noite.
 * Desenvolvido com 60 FPS, pausa inteligente para economia de bateria e alternador manual.
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
  flashOpacity: 0,
  nextFlashInterval: 5000,
  nextShootingStarTime: 0,

  STORAGE_KEY: 'aerosky_particles_enabled',

  init() {
    this.canvas = document.getElementById('weather-particles-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

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
    window.addEventListener('resize', () => this.resize(), { passive: true });

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
    this.displayWidth = window.innerWidth;
    this.displayHeight = window.innerHeight;
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
    else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
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

    if (this.currentMode === 'rain' || this.currentMode === 'thunderstorm') {
      const count = this.currentMode === 'thunderstorm' ? 140 : 90;
      for (let i = 0; i < count; i++) {
        this.particles.push(this.createRainDrop(w, h, true));
      }
    } else if (this.currentMode === 'mist') {
      const count = 30;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 60 + Math.random() * 100,
          speedX: 0.15 + Math.random() * 0.25,
          speedY: (Math.random() - 0.5) * 0.1,
          alpha: 0.03 + Math.random() * 0.05,
          phase: Math.random() * Math.PI * 2
        });
      }
    } else if (this.currentMode === 'stars') {
      const count = 80;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * (h * 0.75), // Principalmente no céu superior
          radius: 0.8 + Math.random() * 1.5,
          baseAlpha: 0.3 + Math.random() * 0.6,
          twinkleSpeed: 0.015 + Math.random() * 0.03,
          twinklePhase: Math.random() * Math.PI * 2
        });
      }
    }
  },

  createRainDrop(w, h, randomY = false) {
    const windEffect = Math.min(Math.max(this.windSpeed * 0.25, -12), 12);
    return {
      x: Math.random() * (w + 200) - 100,
      y: randomY ? Math.random() * h : -20,
      length: 12 + Math.random() * 16,
      speedY: 14 + Math.random() * 10,
      speedX: windEffect + (Math.random() - 0.5) * 0.5,
      alpha: 0.25 + Math.random() * 0.45,
      weight: 1 + Math.random() * 1.2
    };
  },

  addSplashes(x, y) {
    if (this.splashes.length > 50) return;
    const splashCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < splashCount; i++) {
      const angle = Math.PI + (Math.random() * Math.PI); // Para cima
      const speed = 1.5 + Math.random() * 3.5;
      this.splashes.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 0.6,
        radius: 1 + Math.random() * 1.2,
        decay: 0.04 + Math.random() * 0.04
      });
    }
  },

  start() {
    if (this.isRunning || !this.enabled || this.currentMode === 'none') return;
    this.isRunning = true;
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
    this.ctx.clearRect(0, 0, this.displayWidth || window.innerWidth, this.displayHeight || window.innerHeight);
  },

  render(timestamp) {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.displayWidth || window.innerWidth;
    const h = this.displayHeight || window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    if (this.currentMode === 'rain' || this.currentMode === 'thunderstorm') {
      this.renderRain(ctx, w, h, timestamp);
    } else if (this.currentMode === 'mist') {
      this.renderMist(ctx, w, h, timestamp);
    } else if (this.currentMode === 'stars') {
      this.renderStars(ctx, w, h, timestamp);
    }
  },

  renderRain(ctx, w, h, timestamp) {
    // Flash de trovão suave para tempestade
    if (this.currentMode === 'thunderstorm') {
      if (timestamp - this.lastFlashTime > this.nextFlashInterval) {
        this.flashOpacity = 0.28 + Math.random() * 0.2;
        this.lastFlashTime = timestamp;
        this.nextFlashInterval = 4000 + Math.random() * 7000;
      }

      if (this.flashOpacity > 0.01) {
        ctx.fillStyle = `rgba(220, 235, 255, ${this.flashOpacity})`;
        ctx.fillRect(0, 0, w, h);
        this.flashOpacity *= 0.88; // Decaimento rápido suave
      }
    }

    ctx.lineCap = 'round';

    // Gotas de chuva
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      ctx.strokeStyle = `rgba(180, 220, 255, ${p.alpha})`;
      ctx.lineWidth = p.weight;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.speedX * 1.8, p.y + p.length);
      ctx.stroke();

      p.x += p.speedX;
      p.y += p.speedY;

      // Se a gota atingir o fundo, cria respingo sutil
      if (p.y >= h - 10) {
        this.addSplashes(p.x, h - 5);
        this.particles[i] = this.createRainDrop(w, h, false);
      } else if (p.x < -150 || p.x > w + 150) {
        this.particles[i] = this.createRainDrop(w, h, false);
      }
    }

    // Respingos no solo
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      ctx.fillStyle = `rgba(180, 225, 255, ${s.alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();

      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.15; // Gravidade no respingo
      s.alpha -= s.decay;

      if (s.alpha <= 0) {
        this.splashes.splice(i, 1);
      }
    }
  },

  renderMist(ctx, w, h, timestamp) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.phase += 0.01;
      const currentAlpha = p.alpha * (0.8 + 0.2 * Math.sin(p.phase));

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      grad.addColorStop(0, `rgba(200, 220, 240, ${currentAlpha})`);
      grad.addColorStop(1, 'rgba(200, 220, 240, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      p.x += p.speedX;
      p.y += Math.sin(p.phase) * 0.2;

      if (p.x - p.radius > w) {
        p.x = -p.radius;
        p.y = Math.random() * h;
      }
    }
  },

  renderStars(ctx, w, h, timestamp) {
    // Estrelas cintilantes
    for (let i = 0; i < this.particles.length; i++) {
      const star = this.particles[i];
      star.twinklePhase += star.twinkleSpeed;
      const alpha = Math.max(0.1, star.baseAlpha + Math.sin(star.twinklePhase) * 0.35);

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Estrela Cadente Ocasional
    if (timestamp > this.nextShootingStarTime) {
      this.shootingStars.push({
        x: Math.random() * (w * 0.7),
        y: Math.random() * (h * 0.4),
        length: 80 + Math.random() * 60,
        speedX: 8 + Math.random() * 6,
        speedY: 4 + Math.random() * 4,
        alpha: 0.9,
        decay: 0.02
      });
      this.nextShootingStarTime = timestamp + 12000 + Math.random() * 16000;
    }

    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const ss = this.shootingStars[i];

      const grad = ctx.createLinearGradient(
        ss.x, ss.y,
        ss.x - ss.speedX * 5, ss.y - ss.speedY * 5
      );
      grad.addColorStop(0, `rgba(255, 255, 255, ${ss.alpha})`);
      grad.addColorStop(1, 'rgba(0, 245, 212, 0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(ss.x - ss.speedX * 4, ss.y - ss.speedY * 4);
      ctx.stroke();

      ss.x += ss.speedX;
      ss.y += ss.speedY;
      ss.alpha -= ss.decay;

      if (ss.alpha <= 0 || ss.x > w || ss.y > h) {
        this.shootingStars.splice(i, 1);
      }
    }
  }
};
