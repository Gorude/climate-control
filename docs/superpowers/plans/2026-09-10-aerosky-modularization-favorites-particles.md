# AeroSky Modularization, Favorites, and Particles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize AeroSky into maintainable files, implement a dynamic city favorites system with chips and header star, and add a lightweight canvas atmospheric particle engine.

**Architecture:** Pure Vanilla JS (no bundlers or build steps) with static module separation (`css/style.css` and `js/*.js`), 100% compatible with GitHub Pages and PWA offline caching via `sw.js` (v3).

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3 Custom Properties & Bento Grid, Chart.js, Leaflet, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-09-10-aerosky-modularization-favorites-particles-design.md`

## Global Constraints

- Must work 100% on GitHub Pages without build tools (zero npm build / bundlers).
- Relative paths (`./css/style.css`, `./js/app.js`, etc.) for universal path resolution.
- Service Worker must precache all module files under `aerosky-v3` with offline navigation fallback.
- High-performance canvas particles capped at 60 FPS with auto-pause on `visibilitychange`.
- LocalStorage persistence for favorites (`aerosky_favorites`) and particle toggle (`particles_enabled`).

---

### Task 1: Modularize CSS into `css/style.css` and Update `index.html` Markup

**Files:**
- Create: `css/style.css`
- Modify: `index.html`

- [ ] **Step 1: Extract `<style>` from `index.html` to `css/style.css`**
- [ ] **Step 2: Add styles for `#weather-particles-canvas`, `#favorites-bar`, `.favorite-chip`, `#btn-favorite`, and `#btn-particles`**
- [ ] **Step 3: Replace inline `<style>` with `<link rel="stylesheet" href="./css/style.css" />` in `index.html`**
- [ ] **Step 4: Verify CSS loading and braces integrity via Node script**
- [ ] **Step 5: Commit changes**

---

### Task 2: Create `js/constants.js` and `js/weather.js`

**Files:**
- Create: `js/constants.js`
- Create: `js/weather.js`

- [ ] **Step 1: Implement `js/constants.js` with `ALERT_THRESHOLDS`, `WMO_MAP`, `parseWMO`, `getWindDirectionStr`, `escapeHtml`**
- [ ] **Step 2: Implement `js/weather.js` with state (`LAT`, `LON`, `currentCityName`, `globalWeatherData`), `getCurrentHourlyIndex`, `fetchData`, `reverseGeocode`, `initRadarMap`**
- [ ] **Step 3: Validate syntax with `node --check`**
- [ ] **Step 4: Commit changes**

---

### Task 3: Create `js/charts.js`

**Files:**
- Create: `js/charts.js`

- [ ] **Step 1: Implement `createChart`, `renderCharts`, `currentIndicatorPlugin`, sub-tab switches, and debounced chart resize**
- [ ] **Step 2: Validate syntax with `node --check`**
- [ ] **Step 3: Commit changes**

---

### Task 4: Create `js/favorites.js` (Cidades Favoritas)

**Files:**
- Create: `js/favorites.js`
- Modify: `index.html` (add `#favorites-bar` and `#btn-favorite`)

- [ ] **Step 1: Implement `FavoritesManager` in `js/favorites.js`**
  - Storage methods: `getFavorites`, `saveFavorites`, `isCurrentFavorite`, `toggleCurrentFavorite`, `removeFavorite`
  - UI methods: `renderFavoritesBar`, `updateFavoriteStar`, `highlightActiveChip`
- [ ] **Step 2: Add `#favorites-bar` and `#btn-favorite` markup in `index.html`**
- [ ] **Step 3: Validate syntax and event delegation**
- [ ] **Step 4: Commit changes**

---

### Task 5: Create `js/particles.js` (Motor de Partículas Canvas)

**Files:**
- Create: `js/particles.js`
- Modify: `index.html` (add `<canvas id="weather-particles-canvas">` and `#btn-particles`)

- [ ] **Step 1: Implement `WeatherParticles` engine in `js/particles.js`**
  - Rain simulation with wind angle & ground splashes
  - Thunderstorm mode with subtle lightning background flash
  - Fog mode with floating mist clouds
  - Starry night mode with twinkling stars
  - 60 FPS loop, `visibilitychange` auto-pause, toggle method
- [ ] **Step 2: Add canvas and `#btn-particles` toggle button in `index.html`**
- [ ] **Step 3: Validate syntax with `node --check`**
- [ ] **Step 4: Commit changes**

---

### Task 6: Create `js/ui.js` and `js/app.js`

**Files:**
- Create: `js/ui.js`
- Create: `js/app.js`
- Modify: `index.html` (clean script block to import modules)

- [ ] **Step 1: Implement `js/ui.js` (`populateUI`, `updateSeason`, `updateWellbeingRecommendations`, `checkAlerts`, `renderForecast`, `viewDayForecast`, `switchForecast`, `switchAstro`)**
- [ ] **Step 2: Implement `js/app.js` (`initApp`, `updateClock`, search listeners, keyboard shortcuts, PWA registration)**
- [ ] **Step 3: Clean `index.html` to reference all new scripts in order**
- [ ] **Step 4: Validate syntax with `node --check`**
- [ ] **Step 5: Commit changes**

---

### Task 7: Update `sw.js` (v3) with Modular Assets & Test Offline Support

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Update `CACHE_NAME` to `aerosky-v3` and add all modular files to `ASSETS`**
- [ ] **Step 2: Run automated test suite validating HTTP 200, offline cache, and syntax**
- [ ] **Step 3: Commit changes**

---

### Task 8: Verification, Test Suite & Remote Push

**Files:**
- Test all endpoints and user flows
- Push to `https://github.com/Gorude/climate-control` on `origin main`

- [ ] **Step 1: Run comprehensive local test server and verify all flows**
- [ ] **Step 2: Push commit history to remote repository**
- [ ] **Step 3: Update `walkthrough.md`**
