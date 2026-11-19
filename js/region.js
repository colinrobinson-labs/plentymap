/* Area data: food help sites, stores, ZIPs and place names, all from static files built on GitHub.
   - San Diego County: one region file with the partner food banks' full schedules (nightly).
   - Everywhere else in the U.S.: small 0.5° packs around the person's place (weekly).
   Searching a ZIP or a town happens on the phone; only our own files are read. */
import { fetchJSON, S, save, dist } from "./core.js";
import { STATES, snapName } from "./benefits.js";

const SD_BBOX = [-117.62, 32.53, -116.08, 33.51];
const inBox = (b, lat, lon, pad = 0) => lat >= b[1] - pad && lat <= b[3] + pad && lon >= b[0] - pad && lon <= b[2] + pad;
export const inSD = (lat, lon) => inBox(SD_BBOX, lat, lon);
export const cellKey = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
// "Saint Louis" = "St. Louis", "Mount Vernon" = "Mt. Vernon", "Fort Worth" = "Ft. Worth" (tools/build-us.mjs folds the same way)
const fold = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  .replace(/\bsainte\b/g, "ste").replace(/\bsaint\b/g, "st").replace(/\bmount\b/g, "mt").replace(/\bfort\b/g, "ft");

/* ---------- San Diego region file ---------- */
let SD = null;
async function sd() {
  if (SD) return SD;
  const r = await fetchJSON("data/regions/san-diego.json");
  r.placeIdx = buildPlaces(r);
  return (SD = r);
}
function buildPlaces(r) {
  const out = new Map();
  const add = (name, lat, lon) => { const k = fold(name); if (k && !out.has(k)) out.set(k, { name, lat, lon }); };
  // ZIP centers give one point per city name: the average of that city's ZIP centers
  const cities = {};
  for (const [, [lat, lon, city]] of Object.entries(r.zips)) if (city) (cities[city] ||= []).push([lat, lon]);
  for (const [city, pts] of Object.entries(cities)) {
    add(city, +(pts.reduce((a, p) => a + p[0], 0) / pts.length).toFixed(5), +(pts.reduce((a, p) => a + p[1], 0) / pts.length).toFixed(5));
  }
  for (const [name, lat, lon] of r.places || []) add(name, lat, lon);
  return out;
}

/* ---------- US packs ---------- */
let US;   // undefined: not tried yet; null: not available (the app then covers San Diego only)
async function usIndex() {
  if (US === undefined) US = await fetchJSON("data/us/index.json").catch(() => null);
  return US;
}
// cells whose box comes within `km` of the point
function cellsNear(lat, lon, km = 35) {
  const out = [];
  const y0 = Math.floor(lat * 2), x0 = Math.floor(lon * 2);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const y = y0 + dy, x = x0 + dx;
    const cl = Math.min(Math.max(lat, y / 2), (y + 1) / 2), co = Math.min(Math.max(lon, x / 2), (x + 1) / 2);
    if (dist(lat, lon, cl, co) <= km * 1000) out.push(`${y}_${x}`);
  }
  return out;
}

/* ---------- the area around a place ---------- */
let AREA = null, AREA_KEY = "";
export async function region(loc = S.loc) {
  if (loc?.lat == null) return area(await sd(), null, [], true, "CA");
  const key = cellsNear(loc.lat, loc.lon).join(",");
  if (AREA && AREA_KEY === key) return AREA;
  const nearSD = inBox(SD_BBOX, loc.lat, loc.lon, 0.5);
  const [sdR, idx] = await Promise.all([nearSD ? sd() : null, usIndex()]);
  const want = idx ? cellsNear(loc.lat, loc.lon).filter(k => idx.cells[k]) : [];
  const packs = (await Promise.all(want.map(k => fetchJSON(`data/us/cells/${k}.json`).catch(() => null)))).filter(Boolean);
  const partner = !!sdR && inSD(loc.lat, loc.lon);
  AREA = area(sdR, idx, packs, partner, loc.st || (partner ? "CA" : null));
  AREA_KEY = key;
  if (!AREA.st) AREA.st = stateNear(AREA, loc.lat, loc.lon);
  return AREA;
}
function area(sdR, idx, packs, partner, st) {
  const sites = [...(sdR?.sites || [])], stores = [...(sdR?.stores || [])], zips = { ...(sdR?.zips || {}) };
  for (const p of packs) {
    // inside San Diego County the region file is the fuller source; the packs fill in around it
    for (const s of p.sites) if (!(sdR && inSD(s.lat, s.lon))) sites.push(s);
    for (const s of p.stores) if (!(sdR && inSD(s.lat, s.lon))) stores.push(s);
    for (const [z, v] of Object.entries(p.zips)) zips[z] ||= v;
  }
  const byId = new Map();
  for (const s of sites) byId.set(s.id, s);
  for (const s of stores) byId.set(s.id, s);
  const r = {
    sites, stores, zips, byId, partner, st,
    sources: { ...(idx?.sources || {}), ...(sdR?.sources || {}) },
    built: partner ? sdR.built : idx?.built || sdR?.built,
    // San Diego rebuilds nightly, the US packs weekly: past this many days, the lists count as stale
    staleAfter: partner ? 7 : 10,
    covered: partner || packs.length > 0,
  };
  return r;
}
function stateNear(r, lat, lon) {
  let best = null, bd = Infinity;
  for (const v of Object.values(r.zips)) { const d = dist(lat, lon, v[0], v[1]); if (d < bd) { bd = d; best = v; } }
  return best?.[3] || (inSD(lat, lon) ? "CA" : null);
}

/* The state for the current place, and the name its SNAP program goes by */
export const stateOf = (loc = S.loc) => loc?.st || (loc?.lat == null || inSD(loc.lat, loc.lon) ? "CA" : null);
export const programName = (loc = S.loc) => snapName(stateOf(loc));

/* ---------- search ---------- */
/* Returns {lat, lon, label, zip, st, src} or {error: "notfound"|"outside"} */
export async function findPlace(q) {
  const s = String(q || "").trim();
  if (!s) return { error: "notfound" };
  const idx = await usIndex();
  const zip = s.match(/^\d{5}$/)?.[0];
  if (zip) {
    const sdz = (await sd()).zips[zip];
    if (sdz) return { lat: sdz[0], lon: sdz[1], label: zip, zip, st: "CA", src: "zip" };
    if (!idx) return { error: /^9(19|20|21)/.test(zip) ? "notfound" : "outside" };
    const m = await fetchJSON(`data/us/zip/${zip.slice(0, 3)}.json`).catch(() => null);
    const z = m?.[zip];
    return z ? { lat: z[0], lon: z[1], label: zip, zip, st: z[3] || null, src: "zip" } : { error: "notfound" };
  }
  // "City, ST" or "City ST"
  const mm = s.match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
  const st2 = mm?.[2].toUpperCase();
  const wantSt = st2 && STATES[st2] ? st2 : null;
  const name = fold(wantSt ? mm[1] : s);
  if (!name) return { error: "notfound" };
  // San Diego neighborhoods and towns first, unless another state was named
  if (!wantSt || wantSt === "CA") {
    const r = await sd();
    const exact = r.placeIdx.get(name);
    if (exact) return { lat: exact.lat, lon: exact.lon, label: exact.name, zip: null, st: "CA", src: "place" };
  }
  if (idx) {
    const hit = await usPlace(name, wantSt);
    if (hit) return hit;
  }
  if (!wantSt || wantSt === "CA") {
    const r = await sd();
    let best = null;
    for (const [key, p] of r.placeIdx) if (key.startsWith(name)) { best = p; break; }
    if (!best && name.length >= 4) for (const [key, p] of r.placeIdx) if (key.includes(name)) { best = p; break; }
    if (best) return { lat: best.lat, lon: best.lon, label: best.name, zip: null, st: "CA", src: "place" };
  }
  return { error: idx ? "notfound" : "outside" };
}
async function usPlaces(letter) {
  const l = /[a-z]/.test(letter) ? letter : "0";
  return (await fetchJSON(`data/us/places/${l}.json`).catch(() => null)) || [];
}
async function usPlace(name, st) {
  const list = await usPlaces(name[0]);
  const here = S.loc?.st;
  const ok = p => !st || p[1] === st;
  // exact name: the busiest place with that name (the list is busiest first), unless one in the
  // person's current state is reasonably big too ([4] = how many food retailers list that town)
  const exact = list.filter(p => fold(p[0]) === name && ok(p));
  const same = here && exact.find(p => p[1] === here);
  const pick = (same && (same[4] ?? 0) * 5 >= (exact[0][4] ?? 0) ? same : exact[0]) || list.find(p => ok(p) && fold(p[0]).startsWith(name));
  return pick ? { lat: pick[2], lon: pick[3], label: `${pick[0]}, ${pick[1]}`, zip: null, st: pick[1], src: "place" } : null;
}

/* Suggestions for the search box (datalist), for what's been typed so far */
export async function placeNames(q = "") {
  const k = fold(q);
  const out = [];
  if (!k || /^\d/.test(k)) return out;
  // San Diego neighborhoods first for people there (a few), then towns across the U.S., biggest first
  const r = await sd();
  if (stateOf() === "CA" && k.length >= 3) for (const [key, p] of r.placeIdx) { if (key.startsWith(k)) out.push(p.name); if (out.length >= 4) break; }
  const seen = new Set(out.map(fold));
  if (await usIndex()) for (const p of await usPlaces(k[0])) {
    const f = fold(p[0]);
    if (f.startsWith(k) && !(p[1] === "CA" && seen.has(f))) out.push(`${p[0]}, ${p[1]}`);
    if (out.length >= 40) break;
  }
  return [...new Set(out)].slice(0, 40);
}

export function setLoc(loc) {
  S.loc = loc; save("loc");
  window.dispatchEvent(new CustomEvent("pm:loc"));
}

/* Is this point somewhere we have data for? (GPS) */
export async function covered(lat, lon) {
  if (inSD(lat, lon)) return true;
  const idx = await usIndex();
  return !!idx && cellsNear(lat, lon, 60).some(k => idx.cells[k]);
}

/* Nearest ZIP for a GPS point, so the label is something people recognize; also gives the state */
export function nearestZip(lat, lon, r = AREA || SD) {
  let best = null, bd = Infinity;
  for (const [z, v] of Object.entries(r?.zips || {})) { const d = dist(lat, lon, v[0], v[1]); if (d < bd) { bd = d; best = z; } }
  return best ? { zip: best, st: r.zips[best][3] || (inSD(lat, lon) ? "CA" : null) } : { zip: null, st: null };
}
