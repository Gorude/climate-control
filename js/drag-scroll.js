/**
 * AeroSky Weather - Arrasto com inércia nas faixas horizontais
 * O navegador cuida da rolagem vertical da página; o arrasto horizontal (dedo, caneta ou mouse) fica com
 * este módulo, que continua deslizando depois de soltar, como no iOS, e para alinhado a um cartão.
 * A física nativa varia muito entre navegadores e o scroll-snap cortava o embalo: era preciso arrastar
 * várias vezes para chegar ao fim das próximas 24 horas.
 */

const DragScroll = {
  DECELERATION: 0.998, // fração da velocidade mantida a cada ms (a mesma do UIScrollView do iOS)
  MAX_SPEED: 8, // px/ms
  SLOP: 6, // px de movimento antes de virar arrasto (abaixo disso é toque/clique)
  VELOCITY_WINDOW: 100, // ms de amostras usadas para medir a velocidade ao soltar

  attach(el) {
    if (!el || el.dataset.dragScroll) return;
    el.dataset.dragScroll = '1';
    const state = { pointerId: null, dragging: false, startX: 0, startScroll: 0, samples: [], frame: 0, suppressClick: false };
    el._dragScroll = state;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || el.scrollWidth - el.clientWidth < 1) return;
      this.stop(el);
      state.pointerId = e.pointerId;
      state.dragging = false;
      state.suppressClick = false;
      state.startX = e.clientX;
      state.startScroll = el.scrollLeft;
      state.samples = [[e.timeStamp, e.clientX]];
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.startX;
      if (!state.dragging) {
        if (Math.abs(dx) < this.SLOP) return;
        state.dragging = true;
        state.suppressClick = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging');
        el.style.scrollSnapType = 'none';
        if (e.pointerType === 'mouse') window.getSelection()?.removeAllRanges();
      }
      el.scrollLeft = state.startScroll - dx;
      state.samples.push([e.timeStamp, e.clientX]);
      while (state.samples.length > 2 && e.timeStamp - state.samples[0][0] > this.VELOCITY_WINDOW) state.samples.shift();
    });

    const release = (e) => {
      if (e.pointerId !== state.pointerId) return;
      state.pointerId = null;
      if (!state.dragging) return;
      state.dragging = false;
      el.classList.remove('is-dragging');
      // Soltar o dedo parado (última amostra antiga) não deve lançar a faixa
      const [t0, x0] = state.samples[0];
      const [t1, x1] = state.samples[state.samples.length - 1];
      const fresh = e.type === 'pointerup' && e.timeStamp - t1 < 50 && t1 > t0;
      const v = fresh ? Math.max(-this.MAX_SPEED, Math.min(this.MAX_SPEED, -(x1 - x0) / (t1 - t0))) : 0;
      this.glide(el, v);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    // Depois de um arrasto, o clique que o navegador dispara ao soltar não seleciona o cartão
    el.addEventListener(
      'click',
      (e) => {
        if (!state.suppressClick) return;
        state.suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
    el.addEventListener('wheel', () => this.stop(el), { passive: true });
  },

  /** Desliza com a velocidade v (px/ms de rolagem) e para no cartão mais próximo do ponto projetado. */
  glide(el, v) {
    const state = el._dragScroll;
    const tau = -1 / Math.log(this.DECELERATION); // ≈ 500 ms
    const from = el.scrollLeft;
    const target = this.snapPoint(el, from + v * tau);
    const distance = target - from;
    if (Math.abs(distance) < 0.5) return this.finish(el, target);

    // Desaceleração cúbica: começa na velocidade do dedo (3·d/T) e termina parada no alvo, sem a cauda
    // de segundos rastejando que a exponencial pura teria
    const duration = Math.abs(v) > 0.05 ? Math.min(Math.max((3 * distance) / v, 250), 2500) : 280;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      if (t >= 1) return this.finish(el, target);
      el.scrollLeft = target - distance * Math.pow(1 - t, 3);
      state.frame = requestAnimationFrame(step);
    };
    state.frame = requestAnimationFrame(step);
  },

  finish(el, target) {
    const state = el._dragScroll;
    state.frame = 0;
    el.scrollLeft = target;
    el.style.scrollSnapType = ''; // já está num ponto de encaixe: devolver o snap não faz a faixa pular
  },

  /** Posição de encaixe (início de um cartão, respeitando o scroll-padding) mais próxima de x. */
  snapPoint(el, x) {
    const max = el.scrollWidth - el.clientWidth;
    const clamped = Math.min(Math.max(x, 0), max);
    if (getComputedStyle(el).scrollSnapType === 'none' && !el.style.scrollSnapType) return clamped;
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const left = el.getBoundingClientRect().left - el.scrollLeft;
    let best = clamped;
    let bestDist = Infinity;
    for (const child of el.children) {
      const pos = Math.min(Math.max(child.getBoundingClientRect().left - left - pad, 0), max);
      const dist = Math.abs(pos - clamped);
      if (dist < bestDist) {
        best = pos;
        bestDist = dist;
      }
    }
    // O fim da faixa também é um ponto válido (o último cartão pode não alinhar ao início)
    return Math.abs(max - clamped) < bestDist ? max : best;
  },

  stop(el) {
    const state = el && el._dragScroll;
    if (!state || !state.frame) return;
    cancelAnimationFrame(state.frame);
    state.frame = 0;
    el.style.scrollSnapType = '';
  },

  /** Volta ao início sem brigar com uma inércia em andamento (troca de aba / de dia). */
  reset(el) {
    if (!el) return;
    this.stop(el);
    el.scrollLeft = 0;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  DragScroll.attach(document.getElementById('forecast-container'));
  DragScroll.attach(document.getElementById('favorites-bar'));
});
