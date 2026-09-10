/**
 * AeroSky Weather - Gerenciador de Cidades Favoritas
 * Permite salvar, remover e alternar rapidamente entre cidades favoritas com persistência no LocalStorage.
 */

const FavoritesManager = {
  STORAGE_KEY: 'aerosky_favorites',
  DEFAULT_FAVORITES: [
    { name: 'São Paulo, SP', lat: -23.5505, lon: -46.6333 },
    { name: 'Rio de Janeiro, RJ', lat: -22.9068, lon: -43.1729 },
    { name: 'Curitiba, PR', lat: -25.4284, lon: -49.2733 },
    { name: 'Brasília, DF', lat: -15.7975, lon: -47.8919 },
    { name: 'Naviraí, MS', lat: -23.0647, lon: -54.1983 }
  ],

  getFavorites() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
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

  isFavorite(cityName) {
    if (!cityName) return false;
    const cleanTarget = cityName.trim().toLowerCase();
    const favs = this.getFavorites();
    return favs.some((f) => {
      const fName = f.name.trim().toLowerCase();
      return (
        fName === cleanTarget ||
        fName.split(',')[0].trim() === cleanTarget.split(',')[0].trim() ||
        cleanTarget.includes(fName.split(',')[0].trim())
      );
    });
  },

  toggleFavorite(currentCityObj) {
    if (!currentCityObj || !currentCityObj.name) return false;
    const favs = this.getFavorites();
    const cleanTarget = currentCityObj.name.trim().toLowerCase();
    const index = favs.findIndex((f) => {
      const fName = f.name.trim().toLowerCase();
      return (
        fName === cleanTarget ||
        fName.split(',')[0].trim() === cleanTarget.split(',')[0].trim()
      );
    });

    let isFavNow = false;
    if (index >= 0) {
      favs.splice(index, 1);
      isFavNow = false;
      if (typeof showToast === 'function') {
        showToast(`"${currentCityObj.name}" removida dos favoritos`);
      }
    } else {
      favs.unshift({
        name: currentCityObj.name,
        lat: currentCityObj.lat,
        lon: currentCityObj.lon
      });
      // Limita a 10 cidades favoritas
      if (favs.length > 10) favs.pop();
      isFavNow = true;
      if (typeof showToast === 'function') {
        showToast(`"${currentCityObj.name}" adicionada aos favoritos! ⭐`);
      }
    }

    this.saveFavorites(favs);
    this.renderFavoritesBar();
    this.updateFavoriteStar(isFavNow);
    return isFavNow;
  },

  removeFavorite(name, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const favs = this.getFavorites().filter(
      (f) => f.name.trim().toLowerCase() !== name.trim().toLowerCase()
    );
    this.saveFavorites(favs);
    this.renderFavoritesBar();
    if (typeof CONFIG !== 'undefined' && CONFIG.CITY) {
      this.updateFavoriteStar(this.isFavorite(CONFIG.CITY.name));
    }
    if (typeof showToast === 'function') {
      showToast(`Cidade removida dos favoritos`);
    }
  },

  renderFavoritesBar(
    containerEl = document.getElementById('favorites-bar'),
    onSelect = selectFavoriteCity
  ) {
    if (!containerEl) return;
    const favs = this.getFavorites();
    containerEl.innerHTML = '';

    if (favs.length === 0) {
      containerEl.innerHTML =
        '<span style="font-size:0.8rem; color:var(--text-muted); padding:4px 8px;">Nenhuma cidade favorita salva. Clique na estrela ao lado do nome da cidade para adicionar.</span>';
      return;
    }

    const currentCityName =
      typeof CONFIG !== 'undefined' && CONFIG.CITY && CONFIG.CITY.name
        ? CONFIG.CITY.name.trim().toLowerCase()
        : '';

    favs.forEach((city) => {
      const chip = document.createElement('div');
      chip.className = 'favorite-chip';
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('title', `Ver clima em ${city.name}`);

      const chipCityName = city.name.trim().toLowerCase();
      if (
        currentCityName &&
        (chipCityName === currentCityName ||
          chipCityName.split(',')[0].trim() ===
            currentCityName.split(',')[0].trim())
      ) {
        chip.classList.add('active');
      }

      const label = document.createElement('span');
      label.textContent = city.name;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'favorite-chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('title', `Remover ${city.name} dos favoritos`);
      removeBtn.setAttribute('role', 'button');
      removeBtn.setAttribute('aria-label', `Remover ${city.name}`);
      removeBtn.addEventListener('click', (e) =>
        this.removeFavorite(city.name, e)
      );

      chip.appendChild(label);
      chip.appendChild(removeBtn);

      const handleSelect = (e) => {
        if (e.target === removeBtn) return;
        if (typeof onSelect === 'function') {
          onSelect(city);
        } else if (typeof setLocation === 'function') {
          setLocation(city.lat, city.lon, city.name);
        }
      };

      chip.addEventListener('click', handleSelect);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect(e);
        }
      });

      containerEl.appendChild(chip);
    });
  },

  updateFavoriteStar(isFav) {
    const btn = document.getElementById('btn-favorite');
    if (!btn) return;
    if (typeof isFav === 'undefined') {
      isFav =
        typeof CONFIG !== 'undefined' && CONFIG.CITY
          ? this.isFavorite(CONFIG.CITY.name)
          : false;
    }

    if (isFav) {
      btn.classList.add('is-favorite');
      btn.title = 'Remover dos favoritos';
      btn.setAttribute('aria-label', 'Remover dos favoritos');
      btn.innerHTML =
        '<i data-lucide="star" style="fill:#facc15; stroke:#facc15;" size="16"></i>';
    } else {
      btn.classList.remove('is-favorite');
      btn.title = 'Adicionar aos favoritos';
      btn.setAttribute('aria-label', 'Adicionar aos favoritos');
      btn.innerHTML = '<i data-lucide="star" size="16"></i>';
    }

    if (window.lucide) {
      window.lucide.createIcons({
        attrs: { class: ['lucide'] },
        nameAttr: 'data-lucide',
        elements: [btn]
      });
    }
  },

  highlightActiveChip(currentCityName) {
    const container = document.getElementById('favorites-bar');
    if (!container) return;
    const chips = container.querySelectorAll('.favorite-chip');
    const target = currentCityName ? currentCityName.trim().toLowerCase() : '';
    chips.forEach((chip) => {
      const text =
        chip.querySelector('span')?.textContent?.trim()?.toLowerCase() || '';
      if (
        target &&
        (text === target || text.split(',')[0].trim() === target.split(',')[0].trim())
      ) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }
};

/**
 * Função global chamada ao clicar em uma cidade favorita
 */
function selectFavoriteCity(city) {
  if (!city) return;
  if (typeof setLocation === 'function') {
    setLocation(city.lat, city.lon, city.name);
  } else if (typeof CONFIG !== 'undefined') {
    CONFIG.CITY = { name: city.name, lat: city.lat, lon: city.lon };
    if (typeof forceUpdate === 'function') forceUpdate();
  }
}
