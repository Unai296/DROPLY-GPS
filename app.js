/* ============================================
   DROPLY GPS — app.js
   ============================================ */

"use strict";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const MAPBOX_TOKEN = "pk.eyJ1IjoidW5haXNhbmNoaSIsImEiOiJjbW9vN2pidm0wM3QzMnBzZWJxbHZwdnJiIn0.znroTxqrU_r53xCasPxyCg";
const MAX_SPEED_KMH = 200;

const RADIO_STATIONS = [
  { name: "Los 40 Principales", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3",    genre: "Pop",    icon: "🎵" },
  { name: "Cadena Dial",        url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENADIAL.mp3", genre: "Latino", icon: "💃" },
  { name: "Europa FM",          url: "https://playerservices.streamtheworld.com/api/livestream-redirect/EUROPAFM.mp3",   genre: "Dance",  icon: "🎧" },
  { name: "M80 Radio",          url: "https://playerservices.streamtheworld.com/api/livestream-redirect/M80RADIO.mp3",   genre: "Hits",   icon: "🎸" },
  { name: "Radio Nacional",     url: "https://rne.a.llnwd.net/stream/rne_rne1_main.mp3",                                genre: "News",   icon: "📰" },
  { name: "Loca FM",            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOCAFM.mp3",     genre: "House",  icon: "🏠" },
];

const SPLASH_STEPS = [
  "Cargando mapas...",
  "Buscando señal GPS...",
  "Preparando navegación...",
  "¡Listo!",
];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
  map: null,
  directions: null,
  userMarker: null,
  userPos: null,
  heading: 0,
  speed: 0,
  altitude: 0,
  accuracy: 0,
  isFollowing: true,
  radioPlaying: false,
  radioIndex: 0,
  stations: [...RADIO_STATIONS],
  routeStartDist: 0,
  routeDist: 0,
  currentStyle: "mapbox://styles/mapbox/navigation-day-v1",
  is3D: false,
  theme: "light",
  routeActive: false,
  navPillTimer: null,
  navPillInterval: null,
  lastRoute: null,
  trafficAlerts: [],
  trafficMode: false,
  units: "metric",
  profile: "mapbox/driving-traffic",
  voiceEnabled: true,
  autoCenter: true,
  showSpeedometer: true,
  watchId: null,
  trafficVisible: false,
  sheetState: "peek", // peek | mid | expanded
  routeHistory: JSON.parse(localStorage.getItem("droply_history") || "[]"),
  _lastWeatherUpdate: 0,
  _sheetStartY: 0,
  _sheetCurrentY: 0,
};

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  splash: $("splash"),
  splashBarFill: $("splashBarFill"),
  splashStatus: $("splashStatus"),
  app: $("app"),
  clock: $("clock"),
  gpsBadge: $("gps-badge"),
  gpsLabel: $("gps-label"),
  gpsPrompt: $("gps-prompt"),
  btnRequestGps: $("btn-request-gps"),
  btnEndRoute: $("btn-end-route"),
  navPill: $("nav-pill"),
  navArrow: $("nav-arrow"),
  navText: $("nav-text"),
  navDist: $("nav-dist"),
  speedVal: $("speed-val"),
  distVal: $("dist-val"),
  etaVal: $("eta-val"),
  btnCenter: $("btn-center"),
  btnFollow: $("btn-follow"),
  btnMap3D: $("btn-map-3d"),
  btnTraffic: $("btn-traffic"),
  btnClearRoute: $("btn-clear-route"),
  btnSettings: $("btn-settings"),
  btnOpenSettings: $("btn-open-settings"),
  settingsModal: $("settings-modal"),
  closeSettings: $("close-settings"),
  closeSettingsBackdrop: $("close-settings-backdrop"),
  profileSelect: $("profile-select"),
  voiceToggle: $("voice-toggle"),
  autocenterToggle: $("autocenter-toggle"),
  speedometerToggle: $("speedometer-toggle"),
  tokenInput: $("token-input"),
  btnSaveSettings: $("btn-save-settings"),
  toastContainer: $("toast-container"),
  styleSwitcher: $("style-switcher"),
  bottomNav: $("bottomnav"),
};

// ─────────────────────────────────────────────
// SPLASH
// ─────────────────────────────────────────────
async function runSplash() {
  for (let i = 0; i < SPLASH_STEPS.length; i++) {
    dom.splashStatus.textContent = SPLASH_STEPS[i];
    dom.splashBarFill.style.width = `${((i + 1) / SPLASH_STEPS.length) * 100}%`;
    await sleep(i === SPLASH_STEPS.length - 1 ? 300 : 600);
  }
  dom.splash.classList.add("fade-out");
  await sleep(600);
  dom.splash.classList.add("hidden");
  dom.app.classList.remove("hidden");
  initApp();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function initApp() {
  initMap();
  initClock();
  initEvents();
  startGPS();
  setScreen("map");
  showToast("✓ Droply GPS listo", "success");
}

function configureDataSaver() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return;
  state._dataSaver = connection.saveData || /2g/.test(connection.effectiveType || "");
  if (state._dataSaver) {
    state.showSpeedometer = false;
    dom.speedBadge.style.display = "none";
    showToast("Modo ahorro de datos activado", "info", 4200);
  }
}

function getGeoOptions() {
  return {
    enableHighAccuracy: state.routeDist > 0,
    maximumAge: 5000,
    timeout: 15000,
  };
}

// ─────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────
function initApp() {
  initMap();
  initClock();
  initEvents();
  startGPS();
  setScreen("map");
  showToast("✓ Droply GPS listo", "success");

  // 🔥 BOTÓN INICIAR VIAJE
  document.getElementById('btn-start-route').addEventListener('click', () => {

    const dest = state.directions.getDestination();

    if (!dest) {
      alert("Primero escribe un destino arriba");
      return;
    }

    // Cambiar a pantalla mapa
    setScreen("map");

    // Activar navegación
    state.routeActive = true;

    showToast("🚗 Navegación iniciada", "success");
  });

  mapboxgl.accessToken = MAPBOX_TOKEN;

  state.map = new mapboxgl.Map({
    container: "map",
    style: state.currentStyle,
    center: [-3.7, 40.4],
    zoom: 14,
    pitch: 0,
    bearing: 0,
    antialias: false,
    renderWorldCopies: false,
    failIfMajorPerformanceCaveat: true,
  });

  // Minimal controls — positioned bottom-right, above the sheet
  state.map.addControl(
    new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
    "bottom-right"
  );
  state.map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

  // Directions
  state.directions = new MapboxDirections({
    accessToken: mapboxgl.accessToken,
    unit: state.units,
    profile: state.profile,
    controls: { inputs: true, instructions: false, profileSwitcher: false },
    language: "es",
  });
  state.map.addControl(state.directions, "top-left");

  state.directions.on("route", onRouteCalculated);
  state.directions.on("clear", onRouteClear);

  state.map.on("load", onMapLoaded);
  state.map.on("dragstart", () => {
    if (state.isFollowing) {
      state.isFollowing = false;
      dom.btnFollow.classList.remove("active");
    }
  });

  // User location marker
  const el = document.createElement("div");
  el.className = "user-marker";
  state.userMarker = new mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([-3.7, 40.4])
    .addTo(state.map);
}

function onMapLoaded() {
  // 3D buildings layer
  state.map.addLayer({
    id: "3d-buildings",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "true"],
    type: "fill-extrusion",
    minzoom: 15,
    paint: {
      "fill-extrusion-color": "#aaa",
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "height"]],
      "fill-extrusion-base":   ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "min_height"]],
      "fill-extrusion-opacity": 0.5,
    },
    layout: { visibility: "none" }
  });

  initTrafficSources();
}

function initTrafficSources() {
  if (!state.map.getSource("route-traffic")) {
    state.map.addSource("route-traffic", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!state.map.getLayer("route-traffic")) {
    state.map.addLayer({
      id: "route-traffic",
      type: "line",
      source: "route-traffic",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": [
          "match",
          ["get", "congestion"],
          "low", "#16a34a",
          "moderate", "#f59e0b",
          "heavy", "#f97316",
          "severe", "#dc2626",
          "unknown", "#3b82f6",
          "#3b82f6",
        ],
        "line-width": 7,
        "line-opacity": 0.88,
      },
    });
  }
}

// ─────────────────────────────────────────────
// GPS — improved detection
// ─────────────────────────────────────────────
function startGPS() {
  if (!navigator.geolocation) {
    showToast("⚠ Geolocalización no disponible en este navegador", "error");
    setGPSStatus("error", "Sin GPS");
    return;
  }

  // Check permission status if API available
  if (navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then(result => {
      if (result.state === "denied") {
        setGPSStatus("error", "Denegado");
        dom.gpsPrompt.classList.remove("hidden");
      } else {
        watchGPS();
      }
      result.addEventListener("change", () => {
        if (result.state === "granted") {
          dom.gpsPrompt.classList.add("hidden");
          watchGPS();
        }
      });
    }).catch(() => watchGPS());
  } else {
    watchGPS();
  }
}

function watchGPS() {
  setGPSStatus("searching", "Buscando...");

  const geoOptions = getGeoOptions();

  // First: quick low-accuracy fix to show something fast
  navigator.geolocation.getCurrentPosition(
    pos => onGPSSuccess(pos),
    () => {}, // ignore error, watchPosition will handle it
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
  );

  state.watchId = navigator.geolocation.watchPosition(
    onGPSSuccess,
    onGPSError,
    geoOptions
  );
}

function onGPSSuccess(pos) {
  const { latitude: lat, longitude: lng, speed, altitude, accuracy, heading } = pos.coords;

  state.userPos = [lng, lat];
  state.speed = speed ? +(speed * 3.6).toFixed(1) : 0;
  state.altitude = altitude ? +altitude.toFixed(0) : 0;
  state.accuracy = accuracy ? +accuracy.toFixed(0) : 0;
  state.heading = heading || state.heading;

  state.userMarker.setLngLat([lng, lat]);

  if (state.isFollowing && state.autoCenter) {
    state.map.easeTo({ center: [lng, lat], duration: 800 });
  }

  state.directions.setOrigin([lng, lat]);

  updateHUD();
  setGPSStatus("ok", "GPS");
  dom.gpsPrompt.classList.add("hidden");
}

function onGPSError(err) {
  const msgs = {
    1: "Permiso denegado",
    2: "Señal no disponible",
    3: "Tiempo agotado",
  };
  const msg = msgs[err.code] || "Error GPS";
  setGPSStatus(err.code === 1 ? "error" : "searching", msg);

  if (err.code === 1) {
    dom.gpsPrompt.classList.remove("hidden");
    showToast("📍 Activa la ubicación para navegar", "warning");
  } else {
    showToast(`📡 GPS: ${msg}`, "warning");
  }
}

function setGPSStatus(type, label) {
  dom.gpsBadge.className = `gps-badge ${type}`;
  dom.gpsLabel.textContent = label;
}

// ─────────────────────────────────────────────
// HUD UPDATE
// ─────────────────────────────────────────────
function updateHUD() {
  dom.speedVal.textContent = state.speed;
}

// ─────────────────────────────────────────────
// ROUTE EVENTS
// ─────────────────────────────────────────────
function onRouteCalculated(e) {
  const route = e.route[0];
  const distKm = (route.distance / 1000).toFixed(1);
  const etaMins = Math.round(route.duration / 60);

  state.routeDist = route.distance;
  state.routeStartDist = route.distance;

  dom.distVal.textContent = distKm;
  dom.etaVal.textContent = etaMins;

  if (route.legs?.[0]?.steps?.[0]) {
    const step = route.legs[0].steps[0];
    setNavInstruction(step.maneuver.instruction, step.maneuver.type, distKm);
  }

  state.lastRoute = route;
  state.routeActive = true;

  if (state.voiceEnabled) {
    speak(`Ruta calculada. ${distKm} kilómetros, ${etaMins} minutos.`);
  }

  fitRouteView(route);
  updateRouteTraffic(route);
  showNavPill();
  startNavPillLoop();

  showToast(`📍 ${distKm} km · ${etaMins} min`, "success");
}

function onRouteClear() {
  dom.distVal.textContent = "—";
  dom.etaVal.textContent = "—";
  dom.navPill.classList.add("hidden");
  updateTrafficSource({ type: "FeatureCollection", features: [] });
  state.lastRoute = null;
  state.routeActive = false;
  stopNavPillLoop();
}

function setNavInstruction(text, type, dist) {
  const arrowMap = {
    "turn-right": "→", "turn-left": "←",
    "turn-sharp-right": "⬎", "turn-sharp-left": "⬏",
    "turn-slight-right": "↱", "turn-slight-left": "↰",
    "uturn": "↩", "arrive": "🏁",
    "depart": "↑", "straight": "↑",
    "roundabout": "⟲", "merge": "↑",
  };
  dom.navArrow.textContent = arrowMap[type] || "↑";
  dom.navText.textContent = text || "Continúa recto";
  if (dist) dom.navDist.textContent = `${dist} km`;
  showNavPill();
}

function showRouteStatusBar(distKm, etaMins) {
  if (!dom.routeStatusBar || !dom.routeStatusText) return;
  dom.routeStatusText.textContent = `${distKm} km · ${etaMins} min`;
  dom.routeStatusBar.classList.remove("hidden");
}

function hideRouteStatusBar() {
  if (!dom.routeStatusBar) return;
  dom.routeStatusBar.classList.add("hidden");
}

function showNavPill() {
  if (!dom.navPill) return;
  dom.navPill.classList.remove("hidden");
  clearTimeout(state.navPillTimer);
  state.navPillTimer = setTimeout(() => dom.navPill.classList.add("hidden"), 6500);
}

function startNavPillLoop() {
  stopNavPillLoop();
  state.navPillInterval = setInterval(() => {
    if (state.routeActive) {
      dom.navPill.classList.remove("hidden");
      clearTimeout(state.navPillTimer);
      state.navPillTimer = setTimeout(() => dom.navPill.classList.add("hidden"), 6500);
    }
  }, 18000);
}

function stopNavPillLoop() {
  clearTimeout(state.navPillTimer);
  clearInterval(state.navPillInterval);
}

function openSideMenu() {
  if (!dom.sideMenu || !dom.sideMenuOverlay) return;
  dom.sideMenuOverlay.classList.remove("hidden");
  dom.sideMenu.classList.remove("hidden");
  requestAnimationFrame(() => {
    dom.sideMenuOverlay.classList.add("visible");
    dom.sideMenu.classList.add("open");
  });
}

function closeSideMenu() {
  if (!dom.sideMenu || !dom.sideMenuOverlay) return;
  dom.sideMenuOverlay.classList.remove("visible");
  dom.sideMenu.classList.remove("open");
  setTimeout(() => {
    dom.sideMenuOverlay.classList.add("hidden");
    dom.sideMenu.classList.add("hidden");
  }, 300);
}

function setVisibleTrafficSummary(visible) {
  if (!dom.trafficSummary) return;
  dom.trafficSummary.classList.toggle("hidden", !visible);
}

function fitRouteView(route) {
  if (!route?.geometry?.coordinates?.length) return;
  const bounds = route.geometry.coordinates.reduce((b, coord) => {
    return b.extend(coord);
  }, new mapboxgl.LngLatBounds(route.geometry.coordinates[0], route.geometry.coordinates[0]));

  state.map.fitBounds(bounds, {
    padding: { top: 200, bottom: 420, left: 40, right: 40 },
    duration: 1200,
  });
}

async function updateRouteTraffic(route) {
  if (!route) return;
  const congestion = route.legs?.[0]?.annotation?.congestion;
  let coords = route.geometry?.coordinates;

  if (!coords?.length || !route.legs?.length) return;

  if (!congestion) {
    const extra = await fetchRouteTraffic(route);
    if (extra) {
      coords = extra.geometry?.coordinates || coords;
      state.trafficAlerts = extra.trafficAlerts || [];
      updateTrafficSummary(extra);
      return;
    }
  }

  const data = buildTrafficGeoJSON(coords, congestion || []);
  updateTrafficSource(data);
  const status = estimateTrafficStatus(congestion || []);
  setTrafficSummaryText(status);
  announceTrafficIncidents(status);
}

async function fetchRouteTraffic(route) {
  try {
    const start = route.legs[0].steps[0]?.maneuver?.location;
    const endStep = route.legs[route.legs.length - 1].steps.slice(-1)[0];
    const end = endStep?.maneuver?.location;
    if (!start || !end) return null;

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start[0]},${start[1]};${end[0]},${end[1]}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&annotations=congestion&language=es`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes?.length) return null;

    const routeData = data.routes[0];
    const congestion = routeData.legs?.[0]?.annotation?.congestion || [];
    const geometry = routeData.geometry;
    const trafficAlerts = [];
    const incidentCount = congestion.filter(level => level === "heavy" || level === "severe").length;
    if (incidentCount) {
      trafficAlerts.push(`Tráfico pesado detectado en ${incidentCount} tramos`);
    }

    const summary = {
      geometry,
      congestion,
      trafficAlerts,
      incidentCount,
      rawRoute: routeData,
    };
    const dataSource = buildTrafficGeoJSON(geometry?.coordinates || route.geometry.coordinates, congestion);
    updateTrafficSource(dataSource);
    setTrafficSummaryText(summary);
    announceTrafficIncidents(summary);
    return summary;
  } catch (err) {
    console.warn("No se pudo obtener tráfico extra:", err);
    return null;
  }
}

function buildTrafficGeoJSON(coords, congestion) {
  const features = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const level = congestion[i] || "unknown";
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [coords[i], coords[i + 1]] },
      properties: { congestion: level },
    });
  }
  return { type: "FeatureCollection", features };
}

function updateTrafficSource(data) {
  if (!state.map.getSource("route-traffic")) return;
  state.map.getSource("route-traffic").setData(data);
}

function estimateTrafficStatus(congestion) {
  if (!congestion?.length) return { level: "sin datos", color: "traffic-good", message: "Tráfico en tiempo real" };
  if (congestion.includes("severe")) return { level: "Severo", color: "traffic-danger", message: "Accidente o corte grave" };
  if (congestion.includes("heavy")) return { level: "Denso", color: "traffic-alert", message: "Atasco pesado" };
  if (congestion.includes("moderate")) return { level: "Moderado", color: "traffic-alert", message: "Tráfico medio" };
  return { level: "Fluido", color: "traffic-good", message: "Viaje limpio" };
}

function setTrafficSummaryText(summary) {
  const info = typeof summary === "string" ? { level: summary } : summary;
  const status = info.level || info.message || "Tráfico en tiempo real";
  if (dom.trafficStatus) {
    dom.trafficStatus.textContent = `Tráfico: ${status}`;
    dom.trafficStatus.className = `traffic-pill ${info.color || "traffic-good"}`;
  }
  if (dom.trafficAlert) {
    const alertText = info.trafficAlerts?.length ? info.trafficAlerts.join(" · ") : "Sin incidencias";
    dom.trafficAlert.textContent = alertText;
    dom.trafficAlert.className = `traffic-pill ${info.color === "traffic-danger" ? "traffic-danger" : info.color || "traffic-good"}`;
  }
  if (dom.trafficBanner) {
    const bannerMessage = info.color === "traffic-danger"
      ? `Atención: ${status}`
      : info.color === "traffic-alert"
      ? `Tráfico medio detectado`
      : `Tráfico limpio`;
    dom.trafficBannerText.textContent = bannerMessage;
    dom.trafficBanner.classList.toggle("hidden", !info.trafficAlerts?.length && info.color !== "traffic-danger");
  }
}

function updateTrafficSummary(summary) {
  setTrafficSummaryText(summary);
}

function announceTrafficIncidents(summary) {
  if (!state.voiceEnabled) return;
  const status = typeof summary === "string" ? summary : summary.message || summary.level;
  if (status && status !== "Tráfico en tiempo real") {
    speak(`Atención: ${status}`);
  }
}

function updateTrafficMode() {
  if (state.trafficVisible) {
    state.map.setStyle("mapbox://styles/mapbox/traffic-day-v2");
    showToast("Tráfico en vivo activado", "");
  } else {
    state.map.setStyle(state.currentStyle);
    showToast("Tráfico en vivo desactivado", "");
  }
  state.map.once("styledata", () => {
    initTrafficSources();
    if (state.lastRoute) {
      updateRouteTraffic(state.lastRoute);
    }
  });
}

// ─────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────
function saveHistory(route) {
  const entry = {
    id: Date.now(),
    dist: (route.distance / 1000).toFixed(1),
    eta: Math.round(route.duration / 60),
    time: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
  state.routeHistory.unshift(entry);
  if (state.routeHistory.length > 10) state.routeHistory.pop();
  localStorage.setItem("droply_history", JSON.stringify(state.routeHistory));
  renderHistory();
}

function renderHistory() {
  dom.historyList.innerHTML = "";
  if (!state.routeHistory.length) {
    dom.historyList.innerHTML = '<li class="history-empty">Sin rutas guardadas</li>';
    return;
  }
  state.routeHistory.forEach(entry => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <span class="history-item-icon">📍</span>
      <div class="history-item-text">${entry.dist} km · ~${entry.eta} min</div>
      <div class="history-item-time">${entry.time}</div>
    `;
    dom.historyList.appendChild(li);
  });
}

function initHistory() { renderHistory(); }

// ─────────────────────────────────────────────
// RADIO
// ─────────────────────────────────────────────
function initRadio() {
  renderStations();
  dom.radioAudio.preload = "none";
  dom.radioAudio.volume = +dom.volume.value;
  dom.volume.addEventListener("input", () => {
    dom.radioAudio.volume = +dom.volume.value;
  });
  dom.radioAudio.addEventListener("error", () => {
    showToast("⚠ No se pudo cargar la emisora", "error");
    stopRadio();
  });
  dom.radioAudio.addEventListener("waiting", () => {
    showToast("Cargando emisora...", "info", 1500);
  });
  dom.radioAudio.addEventListener("stalled", () => {
    showToast("Emisora interrumpida, prueba otra", "warning", 2000);
  });
  dom.radioAudio.addEventListener("ended", stopRadio);
}

function renderStations() {
  dom.radioStations.innerHTML = "";
  state.stations.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.className = "radio-station-btn" + (i === state.radioIndex ? " active" : "");
    btn.innerHTML = `<span>${s.icon}</span><span>${s.name}</span><span class="station-genre">${s.genre}</span>`;
    btn.addEventListener("click", () => selectStation(i));
    dom.radioStations.appendChild(btn);
  });
}

function selectStation(idx) {
  state.radioIndex = idx;
  renderStations();
  playStation();
}

function playStation() {
  const station = state.stations[state.radioIndex];
  if (!dom.radioAudio.src.endsWith(station.url)) {
    dom.radioAudio.src = station.url;
  }
  dom.radioAudio.play().then(() => {
    state.radioPlaying = true;
    dom.btnPlay.textContent = "⏸";
    dom.playingLabel.textContent = station.name;
    dom.eqBars.classList.add("playing");
    showToast(`📻 ${station.name}`, "");
  }).catch(() => {
    showToast("⚠ Error de reproducción", "warning");
    stopRadio();
  });
}

function stopRadio() {
  dom.radioAudio.pause();
  dom.radioAudio.removeAttribute("src");
  dom.radioAudio.load();
  state.radioPlaying = false;
  dom.btnPlay.textContent = "▶";
  dom.playingLabel.textContent = "Sin reproducción";
  dom.eqBars.classList.remove("playing");
}

function toggleRadio() {
  state.radioPlaying ? stopRadio() : playStation();
}

// ─────────────────────────────────────────────
// WEATHER
// ─────────────────────────────────────────────
async function fetchWeather(lat, lng) {
  if (navigator.connection?.saveData) return;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=relativehumidity_2m,windspeed_10m`;
    const res = await fetch(url);
    const data = await res.json();
    const cw = data.current_weather;

    dom.weatherIcon.textContent = wmoEmoji(cw.weathercode);
    dom.weatherTemp.textContent = `${cw.temperature} °C`;
    dom.weatherDesc.textContent = wmoText(cw.weathercode);
    dom.weatherHum.textContent = `${data.hourly?.relativehumidity_2m?.[0] ?? "--"}%`;
    dom.weatherWind.textContent = `${cw.windspeed} km/h`;
  } catch (_) {
    dom.weatherDesc.textContent = "No disponible";
  }
}

function wmoText(code) {
  const map = { 0:"Despejado", 1:"Principalmente despejado", 2:"Parcialmente nublado", 3:"Nublado", 45:"Niebla", 48:"Escarcha", 51:"Llovizna", 53:"Llovizna moderada", 61:"Lluvia ligera", 63:"Lluvia moderada", 65:"Lluvia fuerte", 71:"Nieve ligera", 73:"Nieve moderada", 80:"Chubascos", 95:"Tormenta" };
  return map[code] || "Variable";
}

function wmoEmoji(code) {
  if (code <= 1)  return "☀️";
  if (code <= 3)  return "☁️";
  if (code <= 48) return "🌫";
  if (code <= 67) return "🌧";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦";
  if (code >= 95) return "⛈";
  return "🌍";
}

// ─────────────────────────────────────────────
// BOTTOM SHEET (drag to expand)
// ─────────────────────────────────────────────
function initBottomSheet() {
  const sheet = dom.bottomSheet;
  const handle = dom.sheetHandle;
  let startY = 0;
  let startTranslate = 0;
  let isDragging = false;

  const getTranslate = () => {
    const style = window.getComputedStyle(sheet);
    const matrix = new DOMMatrix(style.transform);
    return matrix.m42;
  };

  // Add route badge to app
  const badge = document.createElement("div");
  badge.id = "route-active-badge";
  badge.textContent = "● NAVEGANDO";
  $("app").appendChild(badge);

  handle.addEventListener("touchstart", e => {
    // Only drag on mobile
    if (window.innerWidth >= 768) return;
    isDragging = true;
    startY = e.touches[0].clientY;
    startTranslate = getTranslate();
    sheet.style.transition = "none";
  }, { passive: true });

  handle.addEventListener("touchmove", e => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - startY;
    const newTranslate = Math.max(
      window.innerHeight * 0.12, // max expand
      startTranslate + dy
    );
    sheet.style.transform = `translateY(${newTranslate}px)`;
  }, { passive: true });

  handle.addEventListener("touchend", e => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = "";
    const finalY = e.changedTouches[0].clientY;
    const dy = finalY - startY;
    const velocity = dy;

    // Snap to nearest state
    const states = {
      peek: window.innerHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sheet-peek")),
      mid: window.innerHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sheet-mid")),
      expanded: window.innerHeight * 0.12,
    };

    // Pick state based on direction
    if (velocity > 50) {
      // dragging down
      if (state.sheetState === "expanded") setSheetState("mid");
      else setSheetState("peek");
    } else if (velocity < -50) {
      // dragging up
      if (state.sheetState === "peek") setSheetState("mid");
      else setSheetState("expanded");
    } else {
      setSheetState(state.sheetState); // snap back
    }
  }, { passive: true });

  // Tap handle to cycle states
  handle.addEventListener("click", () => {
    if (window.innerWidth >= 768) return;
    const cycle = { peek: "mid", mid: "expanded", expanded: "peek" };
    setSheetState(cycle[state.sheetState]);
  });
}

function setSheetState(newState) {
  state.sheetState = newState;
  dom.bottomSheet.classList.remove("mid", "expanded");
  if (newState === "mid") dom.bottomSheet.classList.add("mid");
  if (newState === "expanded") dom.bottomSheet.classList.add("expanded");
}

// ─────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      $(`tab-${tab.dataset.tab}`).classList.add("active");
      // Expand sheet when tapping tabs
      if (state.sheetState === "peek") setSheetState("mid");
    });
  });
}

// ─────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────
function initClock() {
  const tick = () => {
    const now = new Date();
    dom.clock.textContent = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 60000);
}

// ─────────────────────────────────────────────
// TOASTS
// ─────────────────────────────────────────────
function showToast(msg, type = "", duration = 3200) {
  const el = document.createElement("div");
  el.className = "toast" + (type ? ` ${type}` : "");
  el.textContent = msg;
  dom.toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 350);
  }, duration);
}

// ─────────────────────────────────────────────
// TTS
// ─────────────────────────────────────────────
function speak(text) {
  if (!state.voiceEnabled || !window.speechSynthesis) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "es-ES"; utt.rate = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
function setScreen(screen) {
  const next = screen === "search" ? "search" : "map";
  document.body.dataset.screen = next;

  document.querySelectorAll(".screen[data-screen]").forEach(el => {
    el.classList.toggle("active", el.dataset.screen === next);
  });

  dom.bottomNav?.querySelectorAll(".nav-btn[data-go]")?.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.go === next);
  });

  if (next === "search") {
    // Let Mapbox control render before focusing.
    setTimeout(() => {
      const input = document.querySelector(".mapboxgl-ctrl-geocoder input");
      input?.focus?.();
    }, 60);
  }
}

function openSettings() {
  dom.settingsModal.classList.remove("hidden");
  dom.profileSelect.value = state.profile;
  dom.voiceToggle.checked = state.voiceEnabled;
  dom.autocenterToggle.checked = state.autoCenter;
  dom.speedometerToggle.checked = state.showSpeedometer;
  dom.tokenInput.value = MAPBOX_TOKEN;
}

function initEvents() {
  // GPS permission button
  dom.btnRequestGps?.addEventListener("click", () => {
    dom.gpsPrompt.classList.add("hidden");
    navigator.geolocation.getCurrentPosition(
      pos => { onGPSSuccess(pos); watchGPS(); },
      err => onGPSError(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Bottom navigation (screens)
  dom.bottomNav?.querySelectorAll(".nav-btn[data-go]")?.forEach(btn => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      if (go === "settings") openSettings();
      else setScreen(go);
    });
  });

  // Map styles
  document.querySelectorAll(".style-btn[data-style]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".style-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentStyle = "mapbox://styles/mapbox/" + btn.dataset.style;
      state.map.setStyle(state.currentStyle);
    });
  });

  // 3D
  dom.btnMap3D?.addEventListener("click", () => {
    state.is3D = !state.is3D;
    dom.btnMap3D.classList.toggle("active", state.is3D);
    state.map.easeTo({ pitch: state.is3D ? 55 : 0, bearing: state.is3D ? -15 : 0, duration: 800 });
    if (state.map.getLayer("3d-buildings")) {
      state.map.setLayoutProperty("3d-buildings", "visibility", state.is3D ? "visible" : "none");
    }
  });

  // Center
  dom.btnCenter?.addEventListener("click", () => {
    if (state.userPos) {
      state.isFollowing = true;
      dom.btnFollow?.classList.add("active");
      state.map.flyTo({ center: state.userPos, zoom: 15, duration: 900 });
    } else {
      showToast("📡 Esperando señal GPS...", "warning");
    }
  });

  // Follow
  dom.btnFollow?.addEventListener("click", () => {
    state.isFollowing = !state.isFollowing;
    dom.btnFollow.classList.toggle("active", state.isFollowing);
    if (state.isFollowing && state.userPos) {
      state.map.flyTo({ center: state.userPos, zoom: 15, duration: 800 });
    }
    showToast(state.isFollowing ? "Siguiendo ubicación" : "Modo libre", "");
  });

  // Traffic
  dom.btnTraffic?.addEventListener("click", () => {
    state.trafficVisible = !state.trafficVisible;
    dom.btnTraffic.classList.toggle("active", state.trafficVisible);
    updateTrafficMode();
  });

  // Clear route
  dom.btnClearRoute?.addEventListener("click", () => {
    state.directions.removeRoutes();
    onRouteClear();
    showToast("Ruta eliminada", "");
  });

  // End route
  dom.btnEndRoute?.addEventListener("click", () => {
    state.directions.removeRoutes();
    onRouteClear();
    showToast("Ruta finalizada", "");
  });

  // Settings open (top-right icon and bottom nav)
  dom.btnSettings?.addEventListener("click", openSettings);
  dom.btnOpenSettings?.addEventListener("click", openSettings);

  // Settings close
  dom.closeSettings?.addEventListener("click", () => dom.settingsModal.classList.add("hidden"));
  dom.closeSettingsBackdrop?.addEventListener("click", () => dom.settingsModal.classList.add("hidden"));

  // Segment controls (units)
  document.querySelectorAll(".segment[data-setting]").forEach(btn => {
    btn.addEventListener("click", () => {
      const setting = btn.dataset.setting;
      document.querySelectorAll(`.segment[data-setting="${setting}"]`).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state[setting] = btn.dataset.val;
    });
  });

  // Save settings
  dom.btnSaveSettings?.addEventListener("click", () => {
    state.profile = dom.profileSelect.value;
    state.voiceEnabled = dom.voiceToggle.checked;
    state.autoCenter = dom.autocenterToggle.checked;
    state.showSpeedometer = dom.speedometerToggle.checked;

    // Rebuild directions
    state.map.removeControl(state.directions);
    state.directions = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: state.units,
      profile: state.profile,
      controls: { inputs: true, instructions: false, profileSwitcher: false },
      language: "es",
    });
    state.map.addControl(state.directions, "top-left");
    state.directions.on("route", onRouteCalculated);
    state.directions.on("clear", onRouteClear);
    if (state.userPos) state.directions.setOrigin(state.userPos);

    dom.settingsModal.classList.add("hidden");
    showToast("✓ Ajustes guardados", "success");
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") dom.settingsModal?.classList.add("hidden");
  });
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
runSplash();


let destino = null;

geocoder.on('result', function(e) {
  destino = e.result.center; // [lng, lat]
  console.log("Destino guardado:", destino);
});


document.getElementById('btn-start-route').addEventListener('click', () => {
  if (!destino) {
    alert("Primero elige un destino");
    return;
  }

  // 👉 Cambiar a pantalla del mapa
  document.querySelector('[data-screen="search"]').style.display = 'none';
  document.querySelector('[data-screen="map"]').style.display = 'block';

  iniciarRuta(destino);
});















window.onload = () => {

  let destino = null;

  const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    placeholder: 'Buscar destino...',
    mapboxgl: mapboxgl
  });

  document.getElementById('geocoder').appendChild(geocoder.onAdd());

  geocoder.on('result', function(e) {
    destino = e.result.center;
    console.log("Destino:", destino);
  });

  document.getElementById('btn-start-route').addEventListener('click', () => {
    console.log("CLICK FUNCIONA");

    if (!destino) {
      alert("Primero elige un destino");
      return;
    }

    document.querySelector('[data-screen="search"]').style.display = 'none';
    document.querySelector('[data-screen="map"]').style.display = 'block';

    iniciarRuta(destino);
  });

};


