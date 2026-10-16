/**
 * AeroSky Weather - Gerenciador de Cidades Favoritas
 * Permite salvar, remover e alternar rapidamente entre cidades favoritas com persistência no LocalStorage.
 * As cidades são identificadas pelas coordenadas, já que nomes podem se repetir entre estados.
 */

const FavoritesManager = {
  STORAGE_KEY: 'aerosky_favorites',
  MAX_FAVORITES: 10,
  DEFAULT_FAVORITES: [
    { name: 'São Paulo - SP', lat: -23.5505, lon: -46.6333 },
    { name: 'Rio de Janeiro - RJ', lat: -22.9068, lon: -43.1729 },
    { name: 'Curitiba - PR', lat: -25.4284, lon: -49.2733 },
    { name: 'Brasília - DF', lat: -15.7975, lon: -47.8919 },
    { name: 'Naviraí - MS', lat: -23.065, lon: -54.1906 }
  ],

  getFavorites() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Uma lista vazia é uma escolha válida do usuário: não restaura os padrões
        if (Array.isArray(parsed)) {
          return parsed.filter((f) => f && f.name && typeof f.lat === 'number' && typeof f.lon === 'number');
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar cidades favoritas:', e);
    }
    return [...this.DEFAULT_FAVORITES];
  },

  saveFavorites(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Erro ao salvar favoritos:', e);
    }
  },

  getCurrentCity() {
    return { name: currentCityName, lat: LAT, lon: LON };
  },

  isFavorite(city) {
    return this.getFavorites().some((f) => isSameLocation(f, city));
  },

  toggleFavorite(city = this.getCurrentCity()) {
    if (!city || !city.name) return false;
    const favs = this.getFavorites();
    const index = favs.findIndex((f) => isSameLocation(f, city));

    let isFavNow;
    if (index >= 0) {
      favs.splice(index, 1);
      isFavNow = false;
      showToast(`"${city.name}" removida dos favoritos`);
    } else {
      if (favs.length >= this.MAX_FAVORITES) {
        showToast(`Limite de ${this.MAX_FAVORITES} favoritos atingido. Remova uma cidade antes.`);
        return false;
      }
      favs.unshift({ name: city.name, lat: city.lat, lon: city.lon });
      isFavNow = true;
      showToast(`"${city.name}" adicionada aos favoritos! ⭐`);
    }

    this.saveFavorites(favs);
    this.renderFavoritesBar();
    this.updateFavoriteStar(isFavNow);
    return isFavNow;
  },

  removeFavorite(city, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const favs = this.getFavorites().filter((f) => !isSameLocation(f, city));
    this.saveFavorites(favs);
    this.renderFavoritesBar();
    this.updateFavoriteStar();
    showToast(`"${city.name}" removida dos favoritos`);
  },

  renderFavoritesBar(containerEl = document.getElementById('favorites-bar')) {
    if (!containerEl) return;
    const favs = this.getFavorites();
    containerEl.innerHTML = '';

    if (favs.length === 0) {
      containerEl.innerHTML =
        '<span class="favorites-empty">Nenhuma cidade favorita salva. Toque na estrela ao lado do nome da cidade para adicionar.</span>';
      return;
    }

    const current = this.getCurrentCity();

    favs.forEach((city) => {
      const chip = document.createElement('div');
      chip.className = 'favorite-chip';
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('title', `Ver clima em ${city.name}`);
      chip.dataset.lat = city.lat;
      chip.dataset.lon = city.lon;
      if (isSameLocation(city, current)) chip.classList.add('active');

      const label = document.createElement('span');
      label.textContent = city.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'favorite-chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('title', `Remover ${city.name} dos favoritos`);
      removeBtn.setAttribute('aria-label', `Remover ${city.name} dos favoritos`);
      removeBtn.addEventListener('click', (e) => this.removeFavorite(city, e));
      removeBtn.addEventListener('keydown', (e) => e.stopPropagation());

      chip.appendChild(label);
      chip.appendChild(removeBtn);

      const handleSelect = () => setLocation(city.lat, city.lon, city.name, 'manual');

      chip.addEventListener('click', handleSelect);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });

      containerEl.appendChild(chip);
    });
  },

  updateFavoriteStar(isFav) {
    const btn = document.getElementById('btn-favorite');
    if (!btn) return;
    if (typeof isFav === 'undefined') isFav = this.isFavorite(this.getCurrentCity());

    const label = isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.classList.toggle('is-favorite', isFav);
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btn.innerHTML = isFav
      ? '<i data-lucide="star" style="fill:#facc15; stroke:#facc15;" width="16" height="16"></i>'
      : '<i data-lucide="star" width="16" height="16"></i>';

    if (window.lucide) lucide.createIcons({ root: btn });
  },

  highlightActiveChip() {
    const container = document.getElementById('favorites-bar');
    if (!container) return;
    const current = this.getCurrentCity();
    container.querySelectorAll('.favorite-chip').forEach((chip) => {
      const chipCity = { lat: parseFloat(chip.dataset.lat), lon: parseFloat(chip.dataset.lon) };
      chip.classList.toggle('active', isSameLocation(chipCity, current));
    });
  }
};
