/* ============================================
   DROPLY GPS — app.js  (fixed + 3D nav)
   ============================================ */

"use strict";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const MAPBOX_TOKEN = "pk.eyJ1IjoidW5haXNhbmNoaSIsImEiOiJjbW9vN2pidm0wM3QzMnBzZWJxbHZwdnJiIn0.znroTxqrU_r53xCasPxyCg";

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
  geocoder: null,
  userMarker: null,
  userPos: null,
  heading: 0,
  speed: 0,
  accuracy: 0,
  isFollowing: true,
  routeDist: 0,
  currentStyle: "mapbox://styles/mapbox/navigation-day-v1",
  is3D: false,
  routeActive: false,
  navPillTimer: null,
  navPillInterval: null,
  lastRoute: null,
  trafficVisible: false,
  units: "metric",
  profile: "mapbox/driving-traffic",
  voiceEnabled: true,
  autoCenter: true,
  showSpeedometer: true,
  watchId: null,
  navMode: false,
  selectedDest: null,
  selectedDestName: null,
  avoidTolls: false,
  avoidMotorways: false,
  avoidFerries: false,
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
  bottomNav: $("bottomnav"),
  btnStartRoute: $("btn-start-route"),
  geocoderContainer: $("geocoder"),
  navPanel: $("nav-panel"),
  navNextTitle: $("nav-next-title"),
  navNextDist: $("nav-next-dist"),
  btnSteps: $("btn-steps"),
  stepsModal: $("steps-modal"),
  closeSteps: $("close-steps"),
  closeStepsBackdrop: $("close-steps-backdrop"),
  stepsList: $("steps-list"),
  avoidTolls: $("avoid-tolls-toggle"),
  avoidMotorways: $("avoid-motorways-toggle"),
  avoidFerries: $("avoid-ferries-toggle"),
  overspeedToggle: $("overspeed-toggle"),
  speedLimitInput: $("speed-limit-input"),
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
  mapboxgl.accessToken = MAPBOX_TOKEN;
  initMap();
  initClock();
  startGPS();
  initGeocoder();
  initEvents();
  setScreen("map");
  showToast("✓ Droply GPS listo", "success");
}

// ─────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────
function initMap() {
  state.map = new mapboxgl.Map({
    container: "map",
    style: state.currentStyle,
    center: [-3.7, 40.4],
    zoom: 14,
    pitch: 0,
    bearing: 0,
    antialias: true,
    renderWorldCopies: false,
  });

  state.map.addControl(
    new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
    "bottom-right"
  );
  state.map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

  // Directions plugin (solo para dibujar la ruta, los inputs están ocultos)
  state.directions = new MapboxDirections({
    accessToken: MAPBOX_TOKEN,
    unit: state.units,
    profile: state.profile,
    controls: { inputs: false, instructions: false, profileSwitcher: false },
    language: "es",
    interactive: false,
  });
  state.map.addControl(state.directions, "top-left");
  state.directions.on("route", onRouteCalculated);
  state.directions.on("clear", onRouteClear);

  state.map.on("load", onMapLoaded);
  state.map.on("dragstart", () => {
    if (state.navMode) return;
    state.isFollowing = false;
    dom.btnFollow && dom.btnFollow.classList.remove("active");
  });
}

function onMapLoaded() {
  // 3D buildings
  if (!state.map.getLayer("3d-buildings")) {
    state.map.addLayer({
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#c8d4e8",
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "height"]],
        "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "min_height"]],
        "fill-extrusion-opacity": 0.6,
      },
      layout: { visibility: "none" },
    });
  }

  // Traffic source
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
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": [
          "match", ["get", "congestion"],
          "low", "#16a34a",
          "moderate", "#f59e0b",
          "heavy", "#f97316",
          "severe", "#dc2626",
          "#3b82f6",
        ],
        "line-width": 7,
        "line-opacity": 0.88,
      },
    });
  }

  // Crear marcador coche
  createCarMarker();
}

// ─── MARCADOR COCHE SVG 3D ────────────────────
function createCarMarker() {
  if (state.userMarker) {
    state.userMarker.remove();
    state.userMarker = null;
  }

  const el = document.createElement("div");
  el.id = "car-marker-el";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64" width="40" height="64">
    <ellipse cx="20" cy="60" rx="13" ry="4" fill="rgba(0,0,0,0.20)"/>
    <rect x="7" y="26" width="26" height="22" rx="5" fill="#1B4FD8"/>
    <rect x="10" y="10" width="20" height="20" rx="6" fill="#2563EB"/>
    <rect x="11" y="11" width="18" height="12" rx="4" fill="rgba(186,230,255,0.88)"/>
    <rect x="11" y="28" width="18" height="9" rx="2" fill="rgba(186,230,255,0.50)"/>
    <rect x="3" y="28" width="7" height="11" rx="3.5" fill="#1e293b"/>
    <rect x="30" y="28" width="7" height="11" rx="3.5" fill="#1e293b"/>
    <rect x="3" y="37" width="7" height="11" rx="3.5" fill="#1e293b"/>
    <rect x="30" y="37" width="7" height="11" rx="3.5" fill="#1e293b"/>
    <rect x="10" y="25" width="6" height="3" rx="1.5" fill="#fde68a"/>
    <rect x="24" y="25" width="6" height="3" rx="1.5" fill="#fde68a"/>
    <rect x="12" y="47" width="5" height="2" rx="1" fill="#fca5a5"/>
    <rect x="23" y="47" width="5" height="2" rx="1" fill="#fca5a5"/>
    <circle cx="20" cy="6" r="3.5" fill="rgba(255,255,255,0.9)" stroke="#e2e8f0" stroke-width="0.5"/>
  </svg>`;

  el.style.cssText = `
    width:40px; height:64px;
    transform-origin: 50% 80%;
    filter: drop-shadow(0 4px 10px rgba(0,0,0,0.4));
    cursor: pointer;
    pointer-events: auto;
    transition: none;
  `;

  state.userMarker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
    .setLngLat(state.userPos || [-3.7, 40.4])
    .addTo(state.map);
}

// ─────────────────────────────────────────────
// GEOCODER (instancia única)
// ─────────────────────────────────────────────
function initGeocoder() {
  if (dom.geocoderContainer) dom.geocoderContainer.innerHTML = "";

  state.geocoder = new MapboxGeocoder({
    accessToken: MAPBOX_TOKEN,
    placeholder: "Buscar destino...",
    mapboxgl: mapboxgl,
    language: "es",
    flyTo: false, // evitamos que vuele solo al mapa, lo haremos nosotros
  });

  state.geocoder.on("result", e => {
    state.selectedDest = e.result.center;
    state.selectedDestName = e.result.place_name || e.result.text || "Destino";
    showToast(`📍 ${state.selectedDestName.split(",")[0]}`, "success");
  });

  state.geocoder.on("clear", () => {
    state.selectedDest = null;
    state.selectedDestName = null;
  });

  if (dom.geocoderContainer) {
    dom.geocoderContainer.appendChild(state.geocoder.onAdd(state.map));
  }
}

// ─────────────────────────────────────────────
// INICIAR RUTA
// ─────────────────────────────────────────────
function iniciarRuta(dest) {
  if (!dest) {
    showToast("✏️ Escribe un destino primero", "warning");
    return;
  }

  if (!state.userPos) {
    showToast("📡 Esperando señal GPS...", "warning");
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userPos = [pos.coords.longitude, pos.coords.latitude];
        iniciarRuta(dest);
      },
      () => showToast("❌ No se pudo obtener tu ubicación", "error"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
    return;
  }

  showToast("🗺 Calculando ruta...", "");

  // Reconstruir directions con opciones actuales
  try { state.map.removeControl(state.directions); } catch (_) {}

  const excludes = [];
  if (state.avoidTolls) excludes.push("toll");
  if (state.avoidMotorways) excludes.push("motorway");
  if (state.avoidFerries) excludes.push("ferry");

  state.directions = new MapboxDirections({
    accessToken: MAPBOX_TOKEN,
    unit: state.units,
    profile: state.profile,
    controls: { inputs: false, instructions: false, profileSwitcher: false },
    language: "es",
    interactive: false,
    ...(excludes.length ? { exclude: excludes.join(",") } : {}),
  });
  state.map.addControl(state.directions, "top-left");
  state.directions.on("route", onRouteCalculated);
  state.directions.on("clear", onRouteClear);

  // Origen = posición actual, destino = seleccionado
  state.directions.setOrigin(state.userPos);
  state.directions.setDestination(dest);

  // Volver al mapa
  setScreen("map");

  // Activar cámara de navegación 3D
  activateNavMode();
}

// ─────────────────────────────────────────────
// MODO NAVEGACIÓN 3D
// ─────────────────────────────────────────────
function activateNavMode() {
  state.navMode = true;
  state.isFollowing = true;
  state.is3D = true;

  if (state.map.getLayer("3d-buildings")) {
    state.map.setLayoutProperty("3d-buildings", "visibility", "visible");
  }
  dom.btnMap3D && dom.btnMap3D.classList.add("active");
  dom.btnFollow && dom.btnFollow.classList.add("active");

  if (state.userPos) {
    state.map.easeTo({
      center: state.userPos,
      zoom: 17.5,
      pitch: 60,
      bearing: state.heading || 0,
      duration: 1200,
    });
  }

  dom.navPanel && dom.navPanel.classList.remove("hidden");
}

function deactivateNavMode() {
  state.navMode = false;
  state.isFollowing = false;
  state.is3D = false;

  state.map.easeTo({ pitch: 0, bearing: 0, zoom: 14, duration: 800 });

  if (state.map.getLayer("3d-buildings")) {
    state.map.setLayoutProperty("3d-buildings", "visibility", "none");
  }
  dom.btnMap3D && dom.btnMap3D.classList.remove("active");
  dom.navPanel && dom.navPanel.classList.add("hidden");
}

// ─────────────────────────────────────────────
// GPS
// ─────────────────────────────────────────────
function startGPS() {
  if (!navigator.geolocation) {
    showToast("⚠ Geolocalización no disponible", "error");
    setGPSStatus("error", "Sin GPS");
    return;
  }

  if (navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then(result => {
      if (result.state === "denied") {
        setGPSStatus("error", "Denegado");
        dom.gpsPrompt && dom.gpsPrompt.classList.remove("hidden");
      } else {
        watchGPS();
      }
      result.addEventListener("change", () => {
        if (result.state === "granted") {
          dom.gpsPrompt && dom.gpsPrompt.classList.add("hidden");
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

  navigator.geolocation.getCurrentPosition(
    pos => onGPSSuccess(pos),
    () => {},
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
  );

  state.watchId = navigator.geolocation.watchPosition(
    onGPSSuccess,
    onGPSError,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

function onGPSSuccess(pos) {
  const { latitude: lat, longitude: lng, speed, accuracy, heading } = pos.coords;

  const prevPos = state.userPos;
  state.userPos = [lng, lat];
  state.speed = speed ? +(speed * 3.6).toFixed(1) : 0;
  state.accuracy = accuracy ? +accuracy.toFixed(0) : 0;

  // Heading: usar el del dispositivo o calcular desde movimiento
  if (heading != null && heading >= 0) {
    state.heading = heading;
  } else if (prevPos) {
    const dLng = lng - prevPos[0];
    const dLat = lat - prevPos[1];
    if (Math.abs(dLng) > 0.000005 || Math.abs(dLat) > 0.000005) {
      state.heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    }
  }

  // Mover y rotar el marcador de coche
  if (state.userMarker) {
    state.userMarker.setLngLat([lng, lat]);
    const el = document.getElementById("car-marker-el");
    if (el) el.style.transform = `rotate(${state.heading}deg)`;
  }

  // Cámara sigue al coche en modo nav
  if (state.navMode && state.autoCenter) {
    state.map.easeTo({
      center: [lng, lat],
      bearing: state.heading,
      pitch: 60,
      zoom: 17.5,
      duration: 800,
    });
  } else if (state.isFollowing && state.autoCenter && !state.navMode) {
    state.map.easeTo({ center: [lng, lat], duration: 600 });
  }

  // Actualizar origen en directions
  if (state.routeActive && state.directions) {
    try { state.directions.setOrigin([lng, lat]); } catch (_) {}
  }

  updateHUD();
  setGPSStatus("ok", "GPS");
  dom.gpsPrompt && dom.gpsPrompt.classList.add("hidden");

  // Aviso exceso velocidad
  if (dom.overspeedToggle && dom.overspeedToggle.checked) {
    const limit = parseInt((dom.speedLimitInput && dom.speedLimitInput.value) || "120");
    if (state.speed > limit) {
      showToast(`⚠ Velocidad: ${state.speed} km/h`, "warning");
    }
  }
}

function onGPSError(err) {
  const msgs = { 1: "Permiso denegado", 2: "Señal no disponible", 3: "Tiempo agotado" };
  const msg = msgs[err.code] || "Error GPS";
  setGPSStatus(err.code === 1 ? "error" : "searching", msg);
  if (err.code === 1) {
    dom.gpsPrompt && dom.gpsPrompt.classList.remove("hidden");
    showToast("📍 Activa la ubicación para navegar", "warning");
  }
}

function setGPSStatus(type, label) {
  if (dom.gpsBadge) dom.gpsBadge.className = `gps-badge ${type}`;
  if (dom.gpsLabel) dom.gpsLabel.textContent = label;
}

// ─────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────
function updateHUD() {
  if (dom.speedVal) dom.speedVal.textContent = state.speed;
}

// ─────────────────────────────────────────────
// RUTA CALLBACKS
// ─────────────────────────────────────────────
function onRouteCalculated(e) {
  const route = e.route && e.route[0];
  if (!route) return;

  const distKm = (route.distance / 1000).toFixed(1);
  const etaMins = Math.round(route.duration / 60);

  state.routeDist = route.distance;
  state.lastRoute = route;
  state.routeActive = true;

  if (dom.distVal) dom.distVal.textContent = distKm;
  if (dom.etaVal) dom.etaVal.textContent = etaMins;

  const firstStep = route.legs && route.legs[0] && route.legs[0].steps && route.legs[0].steps[0];
  if (firstStep) {
    const instr = firstStep.maneuver.instruction || "Sal hacia la ruta";
    const type = firstStep.maneuver.type;
    setNavInstruction(instr, type, distKm);
    if (dom.navNextTitle) dom.navNextTitle.textContent = instr;
    if (dom.navNextDist) dom.navNextDist.textContent = `${distKm} km`;
  }

  updateRouteTraffic(route);
  renderStepsList(route);

  if (state.voiceEnabled) speak(`Ruta calculada. ${distKm} kilómetros, ${etaMins} minutos.`);
  showToast(`📍 ${distKm} km · ${etaMins} min`, "success");

  // Mostrar nav pill
  if (dom.navPill) dom.navPill.classList.remove("hidden");
  clearTimeout(state.navPillTimer);
  state.navPillTimer = setTimeout(() => dom.navPill && dom.navPill.classList.add("hidden"), 5000);
}

function onRouteClear() {
  if (dom.distVal) dom.distVal.textContent = "—";
  if (dom.etaVal) dom.etaVal.textContent = "—";
  if (dom.navPill) dom.navPill.classList.add("hidden");
  if (dom.navPanel) dom.navPanel.classList.add("hidden");
  try {
    const src = state.map.getSource("route-traffic");
    if (src) src.setData({ type: "FeatureCollection", features: [] });
  } catch (_) {}
  state.lastRoute = null;
  state.routeActive = false;
  clearTimeout(state.navPillTimer);
  clearInterval(state.navPillInterval);
}

function setNavInstruction(text, type, dist) {
  const arrowMap = {
    "turn-right": "→", "turn-left": "←",
    "turn-sharp-right": "↪", "turn-sharp-left": "↩",
    "turn-slight-right": "↗", "turn-slight-left": "↖",
    "uturn": "↩", "arrive": "🏁",
    "depart": "↑", "straight": "↑",
    "roundabout": "⟲", "merge": "↑",
    "fork": "⑂", "off ramp": "↱", "on ramp": "↱",
  };
  if (dom.navArrow) dom.navArrow.textContent = arrowMap[type] || "↑";
  if (dom.navText) dom.navText.textContent = text || "Continúa recto";
  if (dist && dom.navDist) dom.navDist.textContent = `${dist} km`;
}

function renderStepsList(route) {
  if (!dom.stepsList) return;
  dom.stepsList.innerHTML = "";
  const steps = (route.legs && route.legs[0] && route.legs[0].steps) || [];
  const arrowMap = {
    "turn-right": "→", "turn-left": "←", "arrive": "🏁",
    "depart": "↑", "straight": "↑", "roundabout": "⟲",
    "turn-sharp-right": "↪", "turn-sharp-left": "↩",
    "uturn": "↩", "merge": "↑", "fork": "⑂",
  };
  steps.forEach(step => {
    const li = document.createElement("li");
    li.className = "step-item";
    const dist = (step.distance / 1000).toFixed(1);
    const arrow = arrowMap[step.maneuver && step.maneuver.type] || "↑";
    li.innerHTML = `<span class="step-arrow">${arrow}</span>
      <div class="step-body">
        <div class="step-text">${(step.maneuver && step.maneuver.instruction) || "Continúa"}</div>
        <div class="step-dist">${dist} km</div>
      </div>`;
    dom.stepsList.appendChild(li);
  });
}

// ─────────────────────────────────────────────
// TRAFFIC
// ─────────────────────────────────────────────
function updateRouteTraffic(route) {
  if (!route) return;
  const congestion = route.legs && route.legs[0] && route.legs[0].annotation && route.legs[0].annotation.congestion;
  const coords = route.geometry && route.geometry.coordinates;
  if (!coords || !coords.length) return;
  const data = buildTrafficGeoJSON(coords, congestion || []);
  try {
    const src = state.map.getSource("route-traffic");
    if (src) src.setData(data);
  } catch (_) {}
}

function buildTrafficGeoJSON(coords, congestion) {
  const features = [];
  for (let i = 0; i < coords.length - 1; i++) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [coords[i], coords[i + 1]] },
      properties: { congestion: congestion[i] || "unknown" },
    });
  }
  return { type: "FeatureCollection", features };
}

// ─────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────
function setScreen(screen) {
  document.body.dataset.screen = screen;
  document.querySelectorAll(".screen[data-screen]").forEach(el => {
    el.classList.toggle("active", el.dataset.screen === screen);
  });
  dom.bottomNav && dom.bottomNav.querySelectorAll(".nav-btn[data-go]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.go === screen);
  });
}

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────
function openSettings() {
  dom.settingsModal && dom.settingsModal.classList.remove("hidden");
  if (dom.profileSelect) dom.profileSelect.value = state.profile;
  if (dom.voiceToggle) dom.voiceToggle.checked = state.voiceEnabled;
  if (dom.autocenterToggle) dom.autocenterToggle.checked = state.autoCenter;
  if (dom.speedometerToggle) dom.speedometerToggle.checked = state.showSpeedometer;
  if (dom.tokenInput) dom.tokenInput.value = MAPBOX_TOKEN;
  if (dom.avoidTolls) dom.avoidTolls.checked = state.avoidTolls;
  if (dom.avoidMotorways) dom.avoidMotorways.checked = state.avoidMotorways;
  if (dom.avoidFerries) dom.avoidFerries.checked = state.avoidFerries;
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
function initEvents() {
  // GPS permission button
  dom.btnRequestGps && dom.btnRequestGps.addEventListener("click", () => {
    dom.gpsPrompt && dom.gpsPrompt.classList.add("hidden");
    navigator.geolocation.getCurrentPosition(
      pos => { onGPSSuccess(pos); watchGPS(); },
      err => onGPSError(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Bottom nav
  dom.bottomNav && dom.bottomNav.querySelectorAll(".nav-btn[data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      if (go === "settings") openSettings();
      else setScreen(go);
    });
  });

  // ★★★ INICIAR RUTA ★★★
  dom.btnStartRoute && dom.btnStartRoute.addEventListener("click", () => {
    if (!state.selectedDest) {
      showToast("✏️ Escribe un destino primero", "warning");
      return;
    }
    iniciarRuta(state.selectedDest);
  });

  // Limpiar ruta
  dom.btnClearRoute && dom.btnClearRoute.addEventListener("click", () => {
    try { state.directions && state.directions.removeRoutes(); } catch (_) {}
    onRouteClear();
    deactivateNavMode();
    state.selectedDest = null;
    state.selectedDestName = null;
    state.geocoder && state.geocoder.clear();
    showToast("Ruta eliminada", "");
  });

  // Finalizar ruta (puede haber varios botones con ese ID en search y nav)
  document.querySelectorAll("#btn-end-route").forEach(btn => {
    btn.addEventListener("click", () => {
      try { state.directions && state.directions.removeRoutes(); } catch (_) {}
      onRouteClear();
      deactivateNavMode();
      state.selectedDest = null;
      state.geocoder && state.geocoder.clear();
      showToast("Ruta finalizada", "success");
    });
  });

  // Centrar
  dom.btnCenter && dom.btnCenter.addEventListener("click", () => {
    if (state.userPos) {
      state.isFollowing = true;
      dom.btnFollow && dom.btnFollow.classList.add("active");
      state.map.flyTo({ center: state.userPos, zoom: 15, duration: 900 });
    } else {
      showToast("📡 Esperando señal GPS...", "warning");
    }
  });

  // Follow / toggle nav mode
  dom.btnFollow && dom.btnFollow.addEventListener("click", () => {
    if (state.navMode) {
      deactivateNavMode();
      showToast("Modo libre", "");
    } else {
      state.isFollowing = !state.isFollowing;
      dom.btnFollow.classList.toggle("active", state.isFollowing);
      if (state.isFollowing && state.userPos) {
        state.map.flyTo({ center: state.userPos, zoom: 15, duration: 800 });
      }
      showToast(state.isFollowing ? "Siguiendo ubicación" : "Modo libre", "");
    }
  });

  // 3D toggle
  dom.btnMap3D && dom.btnMap3D.addEventListener("click", () => {
    state.is3D = !state.is3D;
    dom.btnMap3D.classList.toggle("active", state.is3D);
    state.map.easeTo({ pitch: state.is3D ? 55 : 0, bearing: state.is3D ? -15 : 0, duration: 800 });
    try {
      if (state.map.getLayer("3d-buildings")) {
        state.map.setLayoutProperty("3d-buildings", "visibility", state.is3D ? "visible" : "none");
      }
    } catch (_) {}
  });

  // Traffic toggle
  dom.btnTraffic && dom.btnTraffic.addEventListener("click", () => {
    state.trafficVisible = !state.trafficVisible;
    dom.btnTraffic.classList.toggle("active", state.trafficVisible);
    const style = state.trafficVisible
      ? "mapbox://styles/mapbox/traffic-day-v2"
      : state.currentStyle;
    state.map.setStyle(style);
    state.map.once("styledata", () => {
      onMapLoaded();
      if (state.lastRoute) updateRouteTraffic(state.lastRoute);
    });
    showToast(state.trafficVisible ? "Tráfico activado" : "Tráfico desactivado", "");
  });

  // Map styles
  document.querySelectorAll(".style-btn[data-style]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".style-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentStyle = "mapbox://styles/mapbox/" + btn.dataset.style;
      state.map.setStyle(state.currentStyle);
      state.map.once("styledata", () => {
        onMapLoaded();
        if (state.lastRoute) updateRouteTraffic(state.lastRoute);
      });
    });
  });

  // Settings
  dom.btnSettings && dom.btnSettings.addEventListener("click", openSettings);
  dom.btnOpenSettings && dom.btnOpenSettings.addEventListener("click", openSettings);
  dom.closeSettings && dom.closeSettings.addEventListener("click", () => dom.settingsModal && dom.settingsModal.classList.add("hidden"));
  dom.closeSettingsBackdrop && dom.closeSettingsBackdrop.addEventListener("click", () => dom.settingsModal && dom.settingsModal.classList.add("hidden"));

  // Steps modal
  dom.btnSteps && dom.btnSteps.addEventListener("click", () => dom.stepsModal && dom.stepsModal.classList.remove("hidden"));
  dom.closeSteps && dom.closeSteps.addEventListener("click", () => dom.stepsModal && dom.stepsModal.classList.add("hidden"));
  dom.closeStepsBackdrop && dom.closeStepsBackdrop.addEventListener("click", () => dom.stepsModal && dom.stepsModal.classList.add("hidden"));

  // Units segment
  document.querySelectorAll(".segment[data-setting]").forEach(btn => {
    btn.addEventListener("click", () => {
      const setting = btn.dataset.setting;
      document.querySelectorAll(`.segment[data-setting="${setting}"]`).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state[setting] = btn.dataset.val;
    });
  });

  // HUD mode
  dom.hudToggle && dom.hudToggle.addEventListener("change", () => {
    document.body.classList.toggle("hud", dom.hudToggle.checked);
  });

  // Save settings
  dom.btnSaveSettings && dom.btnSaveSettings.addEventListener("click", () => {
    if (dom.profileSelect) state.profile = dom.profileSelect.value;
    if (dom.voiceToggle) state.voiceEnabled = dom.voiceToggle.checked;
    if (dom.autocenterToggle) state.autoCenter = dom.autocenterToggle.checked;
    if (dom.speedometerToggle) state.showSpeedometer = dom.speedometerToggle.checked;
    if (dom.avoidTolls) state.avoidTolls = dom.avoidTolls.checked;
    if (dom.avoidMotorways) state.avoidMotorways = dom.avoidMotorways.checked;
    if (dom.avoidFerries) state.avoidFerries = dom.avoidFerries.checked;
    dom.settingsModal && dom.settingsModal.classList.add("hidden");
    showToast("✓ Ajustes guardados", "success");
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      dom.settingsModal && dom.settingsModal.classList.add("hidden");
      dom.stepsModal && dom.stepsModal.classList.add("hidden");
    }
  });
}

// ─────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────
function initClock() {
  const tick = () => {
    const now = new Date();
    if (dom.clock) dom.clock.textContent = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 10000);
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(msg, type = "", duration = 3200) {
  if (!dom.toastContainer) return;
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
  utt.lang = "es-ES";
  utt.rate = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
runSplash();
