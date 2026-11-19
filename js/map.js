/* The map: MapLibre + a US PMTiles file from our tiles host, and glyphs from our own site.
   Loaded only when someone opens the map, so the app shell stays small. */
import { t, esc } from "./core.js";
import { CONFIG, TILES } from "./config.js";
import { KIND_GLYPH, KCOL } from "./glyphs.js";

/* Pins: a teardrop in the kind's colour with its glyph, drawn once per kind on a canvas (no image requests).
   The selected pin is bigger, with a yolk ring. */
const BOARD = "#1F3B2D", CHALK = "#F1EBDD", YOLK = "#F5C04A";
function pinImage(k, sel) {
  const pr = Math.min(3, Math.max(2, devicePixelRatio || 1));
  const W = sel ? 46 : 34, H = Math.round(W * 1.25);
  const c = document.createElement("canvas"); c.width = W * pr; c.height = H * pr;
  const g = c.getContext("2d"); g.scale(pr, pr);
  const r = W / 2 - (sel ? 4 : 2.5), cx = W / 2, cy = r + (sel ? 4 : 2.5), tip = H - 1.5;
  const drop = () => {
    g.beginPath();
    const a = Math.asin(Math.min(1, r / (tip - cy))) ;
    g.arc(cx, cy, r, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI);
    g.lineTo(cx, tip); g.closePath();
  };
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
  if (sel) { g.save(); g.lineWidth = 7; g.strokeStyle = YOLK; drop(); g.stroke(); g.restore(); }
  drop(); g.fillStyle = KCOL[k] || CHALK; g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = 2; g.strokeStyle = sel ? BOARD : CHALK; drop(); g.stroke();
  const gl = KIND_GLYPH[k];
  if (gl) {
    const s = (r * 1.25) / 24;
    g.save(); g.translate(cx - 12 * s, cy - 12 * s); g.scale(s, s);
    g.lineCap = g.lineJoin = "round"; g.lineWidth = 2.1; g.strokeStyle = BOARD; g.fillStyle = "transparent";
    for (const d of [...gl.d, ...gl.a]) g.stroke(new Path2D(d));
    g.restore();
  }
  return { width: W * pr, height: H * pr, data: new Uint8Array(g.getImageData(0, 0, W * pr, H * pr).data.buffer), pr };
}
let loaded = null;

function script(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error("load " + src));
    document.head.appendChild(s);
  });
}
function css(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
}
async function libs() {
  if (loaded) return loaded;
  css("vendor/maplibre-gl.css");
  loaded = Promise.all([script("vendor/maplibre-gl-csp.js"), script("vendor/pmtiles.js"), script("vendor/basemaps.js")]).then(() => {
    const ml = window.maplibregl;
    ml.setWorkerUrl(new URL("vendor/maplibre-gl-csp-worker.js", location.href).href);
    const p = new window.pmtiles.Protocol();
    ml.addProtocol("pmtiles", p.tile);
    return ml;
  });
  return loaded;
}

/* Chalkboard colors over the Protomaps dark flavor */
function flavor() {
  const f = { ...window.basemaps.namedFlavor("dark") };
  Object.assign(f, {
    background: "#1F3B2D", earth: "#1F3B2D", water: "#122219",
    park_a: "#24452F", park_b: "#24452F", wood_a: "#24452F", wood_b: "#24452F", scrub_a: "#22412E", scrub_b: "#22412E",
    hospital: "#2B4D3B", school: "#2B4D3B", industrial: "#223F30", pedestrian: "#2B4D3B", aerodrome: "#223F30", runway: "#2E5240",
    sand: "#2A4734", beach: "#2A4734", zoo: "#24452F", military: "#223F30", glacier: "#2B4D3B", pier: "#2B4D3B",
    buildings: "#2A4A39",
    other: "#3A5C4A", minor_service: "#36584A", minor_a: "#46695A", minor_b: "#46695A", link: "#557868", major: "#6B8A79", highway: "#8EA597",
    minor_casing: "#1F3B2D", minor_service_casing: "#1F3B2D", link_casing: "#1F3B2D", major_casing_early: "#1F3B2D", major_casing_late: "#1F3B2D", highway_casing_early: "#1F3B2D", highway_casing_late: "#1F3B2D",
    railway: "#46695A", boundaries: "#6B8A79",
    roads_label_minor: "#C9C3B4", roads_label_minor_halo: "#1F3B2D", roads_label_major: "#E4DECF", roads_label_major_halo: "#1F3B2D",
    ocean_label: "#7FA08F", subplace_label: "#C9C3B4", subplace_label_halo: "#1F3B2D", city_label: "#F1EBDD", city_label_halo: "#1F3B2D",
    state_label: "#B4BCAE", state_label_halo: "#1F3B2D", country_label: "#B4BCAE", address_label: "#B4BCAE", address_label_halo: "#1F3B2D",
  });
  delete f.pois; // our own pins carry the meaning; shop icons would only add noise
  return f;
}

export async function mountMap(el, { center, onSelect }) {
  const ml = await libs();
  el.innerHTML = "";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", t("map_label"));
  const base = CONFIG.dataBase;
  // The US map on our tiles host; if that can't be reached, the San Diego file on our own site.
  let tiles = null;
  try {
    const r = await fetch(TILES + "tiles.json", { cache: "no-cache" });
    const f = r.ok ? (await r.json()).file : null;
    if (typeof f === "string" && /^[\w.-]+\.pmtiles$/.test(f)) tiles = TILES + f;
  } catch {}
  if (!tiles) {
    let file = "san-diego.pmtiles";
    try { const r = await fetch(base + "data/tiles/tiles.json", { cache: "no-cache" }); if (r.ok) file = (await r.json()).file || file; } catch {}
    if (!/^[\w.-]+\.pmtiles$/.test(file)) file = "san-diego.pmtiles";
    tiles = new URL(base + "data/tiles/" + file, location.href).href;
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "tiles-file", url: tiles });
  const glyphs = new URL(base + "data/tiles/fonts/", location.href).href + "{fontstack}/{range}.pbf";
  const layers = window.basemaps.layers("protomaps", flavor(), { lang: "en" }).filter(l => !/^pois|landuse_pedestrian/.test(l.id) && !l.layout?.["icon-image"]);
  const map = new ml.Map({
    container: el,
    style: {
      version: 8, glyphs,
      sources: { protomaps: { type: "vector", url: "pmtiles://" + tiles, attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · Protomaps' } },
      layers,
    },
    center: [center.lon, center.lat], zoom: 12, minZoom: 3, maxZoom: 17,
    maxBounds: [[-180, 12], [-60, 74]], // the US, Alaska to Puerto Rico
    attributionControl: { compact: true }, cooperativeGestures: false, pitchWithRotate: false, dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

  let pending = null, me = center;
  const ready = new Promise(res => map.on("load", res));
  ready.then(() => {
    map.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "me-halo", type: "circle", source: "me", paint: { "circle-radius": 14, "circle-color": "#F5C04A", "circle-opacity": 0.25 } });
    map.addLayer({ id: "me", type: "circle", source: "me", paint: { "circle-radius": 6, "circle-color": "#F5C04A", "circle-stroke-color": "#1F3B2D", "circle-stroke-width": 2 } });
    for (const k of Object.keys(KCOL)) for (const sel of [0, 1]) {
      const im = pinImage(k, sel);
      map.addImage(`pin-${k}${sel ? "-sel" : ""}`, { width: im.width, height: im.height, data: im.data }, { pixelRatio: im.pr });
    }
    // far out, small dots; closer in, glyph pins
    map.addLayer({
      id: "dots", type: "circle", source: "pts", maxzoom: 10.5,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 10.5, 5], "circle-color": ["match", ["get", "k"], ...Object.entries(KCOL).flat(), CHALK], "circle-stroke-color": BOARD, "circle-stroke-width": 1 },
    });
    const pinLayout = img => ({ "icon-image": img, "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["-", 0, ["get", "o"]] });
    map.addLayer({ id: "pts", type: "symbol", source: "pts", minzoom: 10.5, layout: { ...pinLayout(["concat", "pin-", ["get", "k"]]), "icon-size": ["interpolate", ["linear"], ["zoom"], 10.5, 0.7, 13, 1] } });
    map.addLayer({ id: "hover", type: "symbol", source: "pts", filter: ["==", ["get", "id"], ""], layout: { ...pinLayout(["concat", "pin-", ["get", "k"]]), "icon-size": 1.2 } });
    map.addLayer({ id: "sel", type: "symbol", source: "pts", filter: ["==", ["get", "id"], ""], layout: pinLayout(["concat", "pin-", ["get", "k"], "-sel"]) });
    for (const L of ["pts", "dots", "hover", "sel"]) {
      map.on("click", L, e => { const f = e.features?.[0]; if (f) onSelect?.(f.properties.id); });
      map.on("mouseenter", L, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", L, () => (map.getCanvas().style.cursor = ""));
    }
    if (pending) api.update(...pending);
    api.select(selId);
    setMe(me);
  });
  function setMe(c) {
    me = c;
    if (!map.getSource("me")) return;
    map.getSource("me").setData({ type: "FeatureCollection", features: c?.src ? [{ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: {} }] : [] });
  }
  let fitted = false, selId = null, hovId = null, byId = new Map();
  const setFilter = (L, id) => map.getLayer(L) && map.setFilter(L, ["==", ["get", "id"], id || ""]);
  const api = {
    update(items, loc) {
      if (!map.getSource("pts")) { pending = [items, loc]; return; }
      byId = new Map(items.map(s => [s.id, s]));
      // o = list order, so nearer or better matches draw on top
      map.getSource("pts").setData({ type: "FeatureCollection", features: items.map((s, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { id: s.id, k: s.k, n: s.n, o: i } })) });
      if (loc) setMe(loc);
      if (!fitted && items.length) {
        fitted = true;
        const near = items.slice(0, 12), b = new ml.LngLatBounds();
        near.forEach(s => b.extend([s.lon, s.lat])); if (loc) b.extend([loc.lon, loc.lat]);
        map.fitBounds(b, { padding: 40, maxZoom: 14, duration: 0 });
      }
    },
    // the row someone picked: big pin with a ring; brought into view if it's off the map
    select(id, { fly = false } = {}) {
      selId = id || null; setFilter("sel", selId); setFilter("hover", hovId && hovId !== selId ? hovId : "");
      const s = selId && byId.get(selId);
      if (s && fly) {
        const p = map.project([s.lon, s.lat]), c = map.getContainer(), m = 60;
        if (p.x < m || p.y < m || p.x > c.clientWidth - m || p.y > c.clientHeight - m || map.getZoom() < 12)
          map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 13), duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500 });
      }
    },
    hover(id) { hovId = id || null; setFilter("hover", hovId && hovId !== selId ? hovId : ""); },
    recenter(loc) { fitted = false; setMe(loc); map.easeTo({ center: [loc.lon, loc.lat], zoom: 12.5, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 }); },
    resize() { map.resize(); },
    destroy() { map.remove(); },
  };
  return api;
}
