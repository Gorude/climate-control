/**
 * AeroSky Weather - Bússola real do vento
 * No celular, gira o mostrador da bússola com os sensores de orientação (magnetômetro + giroscópio),
 * para o N do mostrador apontar o norte de verdade e a agulha mostrar para onde o vento sopra no mundo.
 * Sem sensor de orientação absoluta (computador), nada muda: o mostrador fica parado com o N no topo.
 */

const LiveCompass = {
  SMOOTHING: 0.25, // fração da diferença aplicada por leitura (filtra o tremor do magnetômetro)

  dial: null,
  target: null, // rumo do topo da tela, em graus a partir do norte (0..360)
  display: null, // ângulo contínuo já desenhado (sem saltar de 359° para 0°)
  frame: 0,

  init() {
    this.dial = document.querySelector('.compass-dial');
    if (!this.dial || !window.DeviceOrientationEvent) return;

    // iOS 13+: a leitura só é liberada depois de um toque do usuário
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) this.showPermissionButton();
      return;
    }
    // Chrome/Android: evento com norte absoluto. Firefox: o evento comum, quando vier com absolute = true
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', (e) => this.onOrientation(e));
    } else {
      window.addEventListener('deviceorientation', (e) => {
        if (e.absolute) this.onOrientation(e);
      });
    }
  },

  showPermissionButton() {
    const btn = document.getElementById('compass-enable');
    if (!btn) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state !== 'granted') return;
          btn.hidden = true;
          window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
        })
        .catch((err) => console.warn('Bússola: permissão de orientação negada:', err));
    });
  },

  onOrientation(e) {
    const heading = this.deviceHeading(e);
    if (heading == null) return; // navegadores de computador disparam o evento com valores nulos

    const screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    this.target = (((heading + screenAngle) % 360) + 360) % 360;

    if (this.display == null) {
      this.display = this.target;
      this.dial.classList.add('is-live');
      const status = document.getElementById('compass-live');
      if (status) status.hidden = false;
    }
    if (!this.frame) this.frame = requestAnimationFrame(() => this.render());
  },

  /** Rumo do topo do aparelho em graus a partir do norte, ou null sem leitura válida. */
  deviceHeading(e) {
    // iOS: rumo magnético já compensado pela inclinação
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      return e.webkitCompassHeading;
    }
    if (e.alpha == null || e.beta == null || e.gamma == null) return null;

    // Projeta no plano horizontal o topo do aparelho (vale com o celular deitado) somado à direção
    // para onde a traseira aponta (vale com o celular em pé); assim o rumo não some em nenhuma inclinação.
    const d = Math.PI / 180;
    const sa = Math.sin(e.alpha * d), ca = Math.cos(e.alpha * d);
    const sb = Math.sin(e.beta * d), cb = Math.cos(e.beta * d);
    const sg = Math.sin(e.gamma * d), cg = Math.cos(e.gamma * d);
    const east = -sa * cb - (ca * sg + sa * sb * cg);
    const north = ca * cb + (ca * sb * cg - sa * sg);
    if (Math.hypot(east, north) < 1e-3) return null;
    return Math.atan2(east, north) / d;
  },

  render() {
    this.frame = 0;
    // Menor caminho até o alvo (passa de 359° para 1° sem dar a volta inteira)
    const diff = ((this.target - this.display + 540) % 360) - 180;
    const settled = Math.abs(diff) <= 0.5;
    this.display += settled ? diff : diff * this.SMOOTHING;
    this.dial.style.setProperty('--heading', this.display.toFixed(2));
    if (!settled) this.frame = requestAnimationFrame(() => this.render());
  }
};

document.addEventListener('DOMContentLoaded', () => LiveCompass.init());
