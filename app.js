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

  // Navigation details
  routeSteps: [],
  routeLineCoords: [],
  routeTotalDuration: 0,

  // Classic GPS extras
  exclude: [],
  overspeedEnabled: true,
  speedLimitKmh: 120,
  radarsEnabled: false,
  hudMode: false,
  _lastOverspeedSpoken: 0,
  _radarNodes: [],
  _radarLastFetch: 0,
  _radarWarned: new Set(),
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

  // Classic nav UI
  navPanel: $("nav-panel"),
  navNextTitle: $("nav-next-title"),
  navNextDist: $("nav-next-dist"),
  navTrafficLevel: $("nav-traffic-level"),
  btnSteps: $("btn-steps"),
  trafficLegend: $("traffic-legend"),
  routeProgress: $("route-progress"),
  routeProgressFill: $("route-progress-fill"),
  stepsModal: $("steps-modal"),
  closeSteps: $("close-steps"),
  closeStepsBackdrop: $("close-steps-backdrop"),
  stepsList: $("steps-list"),

  // New settings
  avoidTollsToggle: $("avoid-tolls-toggle"),
  avoidMotorwaysToggle: $("avoid-motorways-toggle"),
  avoidFerriesToggle: $("avoid-ferries-toggle"),
  overspeedToggle: $("overspeed-toggle"),
  speedLimitInput: $("speed-limit-input"),
  radarsToggle: $("radars-toggle"),
  hudToggle: $("hud-toggle"),
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
  loadPrefs();
  applyHudMode();
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
function initMap() {
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
  if (state.routeActive) {
    updateNavigationLive();
  }
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
  state.routeTotalDuration = route.duration || 0;
  state.routeLineCoords = route.geometry?.coordinates || [];
  state.routeSteps = route.legs?.[0]?.steps || [];

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
  renderStepsList();
  setNavVisibility(true);
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
  state.routeSteps = [];
  state.routeLineCoords = [];
  state.routeTotalDuration = 0;
  setNavVisibility(false);
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

function setNavVisibility(visible) {
  dom.navPanel?.classList.toggle("hidden", !visible);
  dom.routeProgress?.classList.toggle("hidden", !visible);
  dom.trafficLegend?.classList.toggle("hidden", !visible || !state.trafficVisible);
  if (!visible) {
    dom.trafficLegend?.classList.add("hidden");
    if (dom.routeProgressFill) dom.routeProgressFill.style.width = "0%";
    if (dom.navNextTitle) dom.navNextTitle.textContent = "—";
    if (dom.navNextDist) dom.navNextDist.textContent = "—";
    if (dom.navTrafficLevel) dom.navTrafficLevel.textContent = "Tráfico: —";
  }
}

function renderStepsList() {
  if (!dom.stepsList) return;
  dom.stepsList.innerHTML = "";
  if (!state.routeSteps?.length) return;
  state.routeSteps.slice(0, 60).forEach(step => {
    const li = document.createElement("li");
    const dist = formatDistance(step.distance || 0);
    const dur = formatDuration(step.duration || 0);
    li.innerHTML = `${escapeHtml(step.maneuver?.instruction || "—")}<span class="step-sub">${dist} · ${dur}</span>`;
    dom.stepsList.appendChild(li);
  });
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
  // Classic UI traffic label
  const lvl = estimateTrafficLevel(congestion || []);
  if (dom.navTrafficLevel) dom.navTrafficLevel.textContent = `Tráfico: ${lvl.level}`;
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
  // Legacy UI no longer exists, keep a lightweight label in nav panel.
  if (dom.navTrafficLevel) dom.navTrafficLevel.textContent = `Tráfico: ${status}`;
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

  dom.avoidTollsToggle.checked = state.exclude.includes("toll");
  dom.avoidMotorwaysToggle.checked = state.exclude.includes("motorway");
  dom.avoidFerriesToggle.checked = state.exclude.includes("ferry");
  dom.overspeedToggle.checked = state.overspeedEnabled;
  dom.speedLimitInput.value = String(state.speedLimitKmh || 120);
  dom.radarsToggle.checked = state.radarsEnabled;
  dom.hudToggle.checked = state.hudMode;
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
    dom.trafficLegend?.classList.toggle("hidden", !state.trafficVisible || !state.routeActive);
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

  // Steps modal
  dom.btnSteps?.addEventListener("click", () => {
    if (!state.routeActive) return;
    dom.stepsModal.classList.remove("hidden");
  });
  dom.closeSteps?.addEventListener("click", () => dom.stepsModal.classList.add("hidden"));
  dom.closeStepsBackdrop?.addEventListener("click", () => dom.stepsModal.classList.add("hidden"));

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
    state.overspeedEnabled = dom.overspeedToggle.checked;
    state.speedLimitKmh = clamp(parseInt(dom.speedLimitInput.value || "120", 10) || 120, 10, 200);
    state.radarsEnabled = dom.radarsToggle.checked;
    state.hudMode = dom.hudToggle.checked;

    state.exclude = [
      dom.avoidTollsToggle.checked ? "toll" : null,
      dom.avoidMotorwaysToggle.checked ? "motorway" : null,
      dom.avoidFerriesToggle.checked ? "ferry" : null,
    ].filter(Boolean);

    // Rebuild directions
    state.map.removeControl(state.directions);
    state.directions = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: state.units,
      profile: state.profile,
      exclude: state.exclude.join(","),
      controls: { inputs: true, instructions: false, profileSwitcher: false },
      language: "es",
    });
    state.map.addControl(state.directions, "top-left");
    state.directions.on("route", onRouteCalculated);
    state.directions.on("clear", onRouteClear);
    if (state.userPos) state.directions.setOrigin(state.userPos);

    dom.settingsModal.classList.add("hidden");
    savePrefs();
    applyHudMode();
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

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function formatDistance(meters) {
  const m = Math.max(0, meters || 0);
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function formatDuration(seconds) {
  const s = Math.max(0, seconds || 0);
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${m} min`;
}

function toRad(d) { return (d * Math.PI) / 180; }
function haversineMeters(a, b) {
  // a/b: [lng, lat]
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function polylineLengthMeters(coords) {
  if (!coords?.length) return 0;
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) sum += haversineMeters(coords[i], coords[i + 1]);
  return sum;
}

function nearestCoordIndex(coords, p) {
  if (!coords?.length) return 0;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(coords[i], p);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}

function remainingMetersFromIndex(coords, idx) {
  if (!coords?.length) return 0;
  const i0 = clamp(idx, 0, coords.length - 1);
  let sum = 0;
  for (let i = i0; i < coords.length - 1; i++) sum += haversineMeters(coords[i], coords[i + 1]);
  return sum;
}

function estimateTrafficLevel(congestion) {
  if (!congestion?.length) return { level: "—", color: "low" };
  if (congestion.includes("severe")) return { level: "Severo", color: "severe" };
  if (congestion.includes("heavy")) return { level: "Denso", color: "heavy" };
  if (congestion.includes("moderate")) return { level: "Moderado", color: "moderate" };
  if (congestion.includes("low")) return { level: "Fluido", color: "low" };
  return { level: "—", color: "low" };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function savePrefs() {
  const payload = {
    exclude: state.exclude,
    overspeedEnabled: state.overspeedEnabled,
    speedLimitKmh: state.speedLimitKmh,
    radarsEnabled: state.radarsEnabled,
    hudMode: state.hudMode,
  };
  localStorage.setItem("droply_prefs", JSON.stringify(payload));
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem("droply_prefs");
    if (!raw) return;
    const p = JSON.parse(raw);
    if (Array.isArray(p.exclude)) state.exclude = p.exclude;
    if (typeof p.overspeedEnabled === "boolean") state.overspeedEnabled = p.overspeedEnabled;
    if (typeof p.speedLimitKmh === "number") state.speedLimitKmh = p.speedLimitKmh;
    if (typeof p.radarsEnabled === "boolean") state.radarsEnabled = p.radarsEnabled;
    if (typeof p.hudMode === "boolean") state.hudMode = p.hudMode;
  } catch (_) {}
}

function applyHudMode() {
  document.body.classList.toggle("hud", !!state.hudMode);
}

async function maybeFetchRadars() {
  if (!state.userPos) return;
  const now = Date.now();
  if (now - state._radarLastFetch < 180000) return; // 3 min
  state._radarLastFetch = now;

  const [lng, lat] = state.userPos;
  // 5km around user
  const query = `
    [out:json][timeout:10];
    (
      node["highway"="speed_camera"](around:5000,${lat},${lng});
      node["enforcement"="speed_camera"](around:5000,${lat},${lng});
    );
    out body;
  `;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "data=" + encodeURIComponent(query),
    });
    const data = await res.json();
    const nodes = (data.elements || [])
      .filter(e => e.type === "node" && typeof e.lat === "number" && typeof e.lon === "number")
      .map(e => ({ id: e.id, lat: e.lat, lon: e.lon }));
    state._radarNodes = nodes;
  } catch (_) {
    // Silent: Overpass can rate limit
  }
}

function warnNearbyRadars() {
  if (!state.userPos || !state._radarNodes?.length) return;
  const [lng, lat] = state.userPos;
  const here = [lng, lat];
  for (const n of state._radarNodes) {
    const d = haversineMeters(here, [n.lon, n.lat]);
    if (d <= 350) {
      const key = String(n.id);
      if (state._radarWarned.has(key)) continue;
      state._radarWarned.add(key);
      showToast(`📷 Radar a ${Math.round(d)} m`, "info", 2500);
      speak(`Radar a ${Math.round(d)} metros`);
    }
  }
  // Cleanup warned set occasionally
  if (state._radarWarned.size > 200) state._radarWarned = new Set(Array.from(state._radarWarned).slice(-80));
}

function updateNavigationLive() {
  if (!state.routeActive || !state.userPos || !state.routeLineCoords?.length) return;
  const idx = nearestCoordIndex(state.routeLineCoords, state.userPos);
  const remainingM = remainingMetersFromIndex(state.routeLineCoords, idx);

  const totalM = state.routeStartDist || polylineLengthMeters(state.routeLineCoords) || 1;
  const pct = clamp(1 - remainingM / totalM, 0, 1);
  if (dom.routeProgressFill) dom.routeProgressFill.style.width = `${Math.round(pct * 100)}%`;

  // Remaining distance + ETA
  dom.distVal.textContent = (remainingM / 1000).toFixed(1);
  const etaSec = state.routeTotalDuration ? Math.round(state.routeTotalDuration * (1 - pct)) : 0;
  dom.etaVal.textContent = etaSec ? Math.round(etaSec / 60) : "—";

  // Next maneuver (closest step)
  if (state.routeSteps?.length) {
    let best = null;
    let bestD = Infinity;
    for (const step of state.routeSteps) {
      const loc = step?.maneuver?.location;
      if (!loc) continue;
      const d = haversineMeters(state.userPos, loc);
      if (d < bestD) { bestD = d; best = step; }
    }
    const instr = best?.maneuver?.instruction || "Sigue la ruta";
    dom.navNextTitle.textContent = instr;
    dom.navNextDist.textContent = formatDistance(bestD);
    setNavInstruction(instr, best?.maneuver?.type, (remainingM / 1000).toFixed(1));
  }

  // Overspeed warning
  if (state.overspeedEnabled && state.speedLimitKmh && state.speed > state.speedLimitKmh + 5) {
    if (Date.now() - state._lastOverspeedSpoken > 12000) {
      state._lastOverspeedSpoken = Date.now();
      showToast(`⚠ Exceso de velocidad (${state.speed} km/h)`, "warning", 1800);
      speak(`Atención. Exceso de velocidad.`);
    }
  }

  // Radars (OSM) warnings
  if (state.radarsEnabled) {
    maybeFetchRadars();
    warnNearbyRadars();
  }
}

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
runSplash();
