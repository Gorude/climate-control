# Especificação de Design - AeroSky: Modularização, Cidades Favoritas e Motor de Partículas

**Data**: 2026-09-10  
**Autor**: Antigravity Pair Programmer & José Gabriel  
**Repositório**: [Gorude/climate-control](https://github.com/Gorude/climate-control)  
**Status**: Aprovado

---

## 1. Visão Geral e Objetivos

O projeto **AeroSky** é um Progressive Web App (PWA) de meteorologia premium hospedado no GitHub Pages. Atualmente, o arquivo `index.html` concentra mais de 4.100 linhas (HTML, CSS e JavaScript), o que dificulta manutenções futuras e extensibilidade.

Esta especificação define a implementação de três objetivos essenciais:
1. **Modularização Arquitetural Limpa**: Separação do código em arquivos CSS e módulos JavaScript focados e organizados, mantendo 100% de compatibilidade com GitHub Pages (sem build tools externas) e garantindo a resiliência offline do Service Worker.
2. **Sistema de Cidades Favoritas**: Possibilidade de salvar múltiplos locais no `localStorage`, com botão de estrela no cabeçalho e uma barra horizontal de chips para troca rápida de cidade com 1 clique.
3. **Motor de Partículas Atmosféricas em Canvas**: Efeitos visuais dinâmicos e leves de fundo (chuva reativa à direção do vento, tempestade com flashes sutis, névoa e estrelas cintilantes à noite), com foco em alta performance (60 FPS), pausa automática ao ocultar a aba e botão para ativar/desativar.

---

## 2. Arquitetura de Arquivos

```
climate-control/
├── index.html              # HTML semântico enxuto (~350 linhas)
├── manifest.json           # Manifesto PWA com escopo relativo "./"
├── sw.js                   # Service Worker v3 com cache modular completo
├── icon-192.png
├── icon-512.png
├── css/
│   └── style.css           # Design system, Bento Grid, responsividade, chips e canvas
└── js/
    ├── constants.js        # Constantes, tabela WMO, thresholds e ícones
    ├── weather.js          # APIs Open-Meteo, Nominatim, RainViewer e cálculo de índices/fusos
    ├── charts.js           # Gerenciamento de instâncias e renderização do Chart.js
    ├── particles.js        # Engine de partículas Canvas com loop otimizado
    ├── favorites.js        # Persistência e renderização de cidades favoritas
    ├── ui.js               # Atualização de métricas, bem-estar, astronomia e alertas
    └── app.js              # Bootstrap da aplicação, eventos globais e PWA
```

---

## 3. Especificação dos Módulos

### 3.1. `css/style.css`
- Extraído de `<style>` no `index.html`.
- Adição dos estilos da barra de chips de favoritos (`.favorites-bar`, `.favorite-chip`, `.favorite-chip.active`, `.favorite-chip-remove`).
- Estilos do canvas de partículas (`#weather-particles-canvas` com `position: fixed; inset: 0; z-index: 0; pointer-events: none;`).
- Estilos do botão de estrela de favoritos (`#btn-favorite.is-favorite` com cor `#facc15` e glow dourado).
- Estilos do botão de partículas (`#btn-particles.active`).

### 3.2. `js/constants.js`
- Exporta/define globalmente:
  - Objeto `ALERT_THRESHOLDS` (tempMax, tempMin, windGusts, uvIndex).
  - Tabela `WMO_MAP` e função `parseWMO(code, isDay)`.
  - Função `getWindDirectionStr(degrees)`.
  - Função utilitária `escapeHtml(str)`.

### 3.3. `js/weather.js`
- Estado compartilhado: `LAT`, `LON`, `currentCityName`, `globalWeatherData`.
- Funções:
  - `getCurrentHourlyIndex(hourly, current)`: cálculo robusto do índice horário sincronizado por prefixo de hora local da API.
  - `fetchData()`: requisição para a API Open-Meteo com AbortSignal de 8s e tratamento de erro com retorno booleano.
  - `reverseGeocode(lat, lon)`: geocodificação reversa via Nominatim.
  - `initRadarMap()`: inicialização e atualização do Leaflet e RainViewer com checagens de nulos.

### 3.4. `js/charts.js`
- Objeto de instâncias `chartsObj`.
- Plugin `currentIndicatorPlugin` com verificação de segurança `chart.chartArea`.
- Funções:
  - `createChart(canvasId, type, data, options)`.
  - `renderCharts(hourly)`.
  - `switchPrecipView(view)`, `switchPrecipSubTab(subTab)`, `switchWindSubTab(subTab)`.
  - Redimensionamento debounced de gráficos e mapa.

### 3.5. `js/particles.js`
- Gerencia o elemento `<canvas id="weather-particles-canvas">`.
- Classe / Objeto `WeatherParticles`:
  - `init()`: obtém contexto 2D, ajusta dimensões e liga listener de redimensionamento e visibilidade (`visibilitychange`).
  - `setMode(weatherCode, precipitation, windSpeed, isDay)`: transiciona suavemente entre os modos (chuva, tempestade, névoa, estrelas, dia limpo).
  - `toggle(enabled)`: ativa ou pausa o loop `requestAnimationFrame`. Salva preferência em `localStorage.getItem('particles_enabled')`.
  - Parâmetros físicos:
    - Chuva: velocidade proporcional à gravidade, ângulo influenciado por `windSpeed`, limite de 80 a 120 partículas.
    - Tempestade: chuva rápida + flash estético de relâmpago no background (opacidade decrescente suave, intervalo randômico de 5 a 14s).
    - Névoa: nuvens ovais translúcidas flutuando horizontalmente.
    - Noite: estrelas cintilantes com brilho pulsante.

### 3.6. `js/favorites.js`
- Chave no localStorage: `aerosky_favorites`.
- Funções:
  - `init()`: lê lista salva e renderiza os chips no carregamento.
  - `getFavorites()`: retorna array de objetos `{ id, name, lat, lon }`.
  - `isCurrentFavorite()`: checa se a cidade ativa está favoritada.
  - `toggleCurrentFavorite()`: adiciona ou remove a cidade ativa, atualizando a estrela e os chips.
  - `removeFavorite(id)`: remove a cidade pelo identificador e atualiza a UI.
  - `renderFavoritesBar()`: renderiza os chips com delegação de eventos para clique na cidade e exclusão no `×`.
  - `updateFavoriteButtonState()`: sincroniza o estado visual da estrela no cabeçalho.

### 3.7. `js/ui.js`
- Funções:
  - `populateUI()`: atualiza cards de temperatura, sensação, sol, lua, vento, bússola, UV ring, e aciona `particles.setWeather()`.
  - `updateSeason()`: cálculo sazonal sensível a latitude Norte/Sul.
  - `updateWellbeingRecommendations()`: consultor de saúde e bem-estar.
  - `checkAlerts(current, daily)`: alertas com categorias distintas e notificações locais.
  - `renderForecast()`, `switchForecast(tab)`, `viewDayForecast(dayIndex)`.
  - `switchAstro(tab)`.

### 3.8. `js/app.js`
- Ponto de entrada (bootstrap):
  - Inicia relógio em tempo real (`updateClock`).
  - Registra listeners de busca (`searchCity` com `AbortController` e delegação de clique em resultados).
  - Registra atalhos de teclado (tecla `Escape` fecha busca, radar e bem-estar).
  - Inicializa geolocalização (`initGeolocation`).
  - Registra o Service Worker `sw.js`.

### 3.9. `sw.js` (Versão `aerosky-v3`)
- Atualizado para pré-cachear a lista modular de ativos (`ASSETS`).
- Fallback para navegação offline.

---

## 4. Plano de Testes e Validação

1. **Validação de Sintaxe**:
   - `node --check` em cada arquivo `.js`.
   - `JSON.parse` em `manifest.json`.
2. **Servidor HTTP Local**:
   - Verificação de status `200` para todos os novos caminhos de arquivos.
3. **Casos de Teste Funcionais**:
   - Adicionar uma cidade aos favoritos -> validar persistência e exibição do chip.
   - Clicar no chip favorito -> validar carregamento completo dos dados meteorológicos.
   - Remover cidade favorita -> validar remoção imediata do chip.
   - Ativar/Desativar partículas -> validar suspensão do `requestAnimationFrame` e persistência no localStorage.
   - Simular aba oculta -> validar que o loop de partículas congela e retoma ao focar.
   - Teste offline via Service Worker -> verificar que a aplicação carrega sem conexão.
4. **Git**:
   - Commit semântico e push para a branch `main` no GitHub.
