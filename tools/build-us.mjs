// Builds the nationwide data packs the app reads outside San Diego County:
//   data/us/index.json            sources, build date, and which map cells have data
//   data/us/cells/<y>_<x>.json    free food sites, SNAP stores and ZIPs in one 0.5° cell
//   data/us/zip/<123>.json        ZIP centers by the first three digits (for search)
//   data/us/places/<a>.json       city and town centers by first letter (for search)
// Usage: node build-us.mjs <rawDir> <outDir>
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { r5, clean, tidyName, phoneOf, urlOk } from "./lib-food.mjs";

const [raw = "raw-us", outDir = "data/us"] = process.argv.slice(2);
const rd = async f => existsSync(join(raw, f)) ? JSON.parse(await readFile(join(raw, f), "utf8")) : null;
const rep = (await rd("report.json")) || {};
const fetched = rep.fetched || new Date().toISOString();

// One cell is 0.5° by 0.5° (about 55 km tall). The app works out the same key from a point.
const cellOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const cells = new Map();
const cell = k => { let c = cells.get(k); if (!c) cells.set(k, c = { sites: [], stores: [], zips: {} }); return c; };
const fold = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// ---- Census places (search, and a fallback city name for ZIPs) ----
const places = [];
{
  const txt = existsSync(join(raw, "place.tsv")) ? await readFile(join(raw, "place.tsv"), "utf8") : "";
  const lines = txt.split(/\r?\n/), head = lines[0].split("|").map(h => h.trim());
  const iS = head.indexOf("USPS"), iN = head.indexOf("NAME"), iLa = head.findIndex(h => /INTPTLAT/.test(h)), iLo = head.findIndex(h => /INTPTLONG/.test(h)), iA = head.indexOf("ALAND");
  for (const l of lines.slice(1)) {
    const c = l.split("|").map(x => x.trim());
    if (!c[iN]) continue;
    const name = c[iN]
      .replace(/\s+\(balance\)$/, "")
      .replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|city|town|village|CDP|borough|municipality|comunidad|zona urbana|plantation|corporation)$/i, "")
      .trim();
    if (!name) continue;
    places.push({ n: name, st: c[iS], lat: r5(+c[iLa]), lon: r5(+c[iLo]), a: +c[iA] || 0 });
  }
}
// nearest place, by a coarse grid so 33k ZIPs don't each scan 32k places
const pgrid = new Map();
for (const p of places) { const k = `${Math.floor(p.lat)}_${Math.floor(p.lon)}`; (pgrid.get(k) || pgrid.set(k, []).get(k)).push(p); }
function nearestPlace(lat, lon) {
  let best = null, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const p of pgrid.get(`${Math.floor(lat) + dy}_${Math.floor(lon) + dx}`) || []) {
    const d = (p.lat - lat) ** 2 + ((p.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---- SNAP retailers ----
const BUDGET = /\b(aldi|lidl|save[- ]?a[- ]?lot|winco|grocery outlet|walmart|food 4 less|foodmaxx|food ?for less|costco|sam'?s club|price rite|pricerite|smart (&|and) final|el super|northgate|vallarta|cardenas|fiesta mart|la michoacana|sedano'?s|bravo supermarket|c-?town|ranch market|mercado|carniceria|supermercado|99 ranch|h mart|seafood city|patel brothers|apna bazar|food city|marc'?s|ruler foods|piggly wiggly|county market|cash saver|aldi'?s|food depot|super 1 foods|ocean state job lot|market basket|win[- ]?co|carnival|halal|produce)\b/i;
const PREMIUM = /\b(whole foods|sprouts|trader joe'?s|the fresh market|fresh market|erewhon|gelson'?s|bristol farms|pavilions|earth fare|natural grocers|new seasons|central market|mollie stone|lazy acres|jimbo'?s|dean (&|and) deluca|balducci|citarella|eataly|fairway)\b/i;
const SKIP = /\b(cvs|walgreens|rite aid|dollar ?tree|dollar general|family dollar|99 cents|five below|liquor|wine|beer|tobacco|smoke|vape|nutrition(al)?( center)?|vitamin|gnc|commissary|cash (&|and) carry|7-eleven|circle k|arco|chevron|shell|mobil|exxon|valero|sunoco|speedway|wawa|sheetz|casey'?s|kwik|quik|mini ?mart|food mart|gas|fuel|travel (center|plaza)|truck stop|pharmacy|drug|resort|properties|exports|distributors|wholesale club only|book|sweets|candy|bakery|donut|beverages|spice(s)? market|pet|feed (&|and) seed)\b/i;
const CUISINE = [
  ["latin", /\b(northgate|vallarta|el super|cardenas|superior grocers|fiesta mart|sedano'?s|bravo|c-?town|mercado|super ?mercado|supermercado|carniceria|tortilleria|michoacana|mex|azteca|latin[oa]?|hispan|tienda|bodega|el rancho|la placita|el guero|la fiesta|el ahorro|la bonita)\b/i],
  ["chinese", /\b(99 ranch|88 ranch|sf supermarket|asian|chinese|hong kong|china|great wall|kam man|jmart|good fortune|new york mart|ranch 99|lotte|t ?& ?t)\b/i],
  ["vietnamese", /\b(vietnam|saigon|viet|hoa binh|lee'?s market|a dong|hung vuong|lucky seafood|vien dong)\b/i],
  ["filipino", /\b(seafood city|island pacific|manila|filipino|fil-?am|pinoy|valleymax)\b/i],
  ["korean", /\b(h mart|zion market|lotte|korean|assi|galleria market|hannam|kim'?s)\b/i],
  ["middleeast", /\b(halal|middle eastern|mediterranean|arab|persian|lebanese|syrian|iraqi|babylon|sahara|al[- ]?[a-z]+ market|damascus|aladdin|nazareth|jerusalem)\b/i],
  ["afghan", /\b(afghan|kabul|ariana|pamir|khyber|bamiyan)\b/i],
  ["somali", /\b(somali|african|ethiopian|eritrean|axum|addis|blue nile|habesha|mogadishu|bakaro|motherland|safari)\b/i],
  ["haitian", /\b(haiti|haitian|caribbean|west indian|jamaican|kreyol|creole)\b/i],
  ["easteuro", /\b(european|euro|russian|ukrain|polish|polski|deli russia|net cost|gastronom)\b/i],
  ["southasian", /\b(patel brothers|apna bazar|india|indian|desi|bombay|bazaar|subzi|sabzi|punjab|nepal|bangla)\b/i],
];
const snap = (await rd("snap.json")) || [];
const zc = {}, zst = {}, cityN = {};
let nStores = 0, nRmp = 0, nInc = 0;
for (const a of snap) {
  const t = a.Store_Type, lat = a.Latitude, lon = a.Longitude;
  if (!lat || !lon || Math.abs(lat) < 1) continue;
  const rawName = clean(a.Store_Name);
  const z = (a.Zip_Code || "").toString().padStart(5, "0").slice(0, 5), city = clean(a.City);
  if (z && city) { zc[z] ||= {}; zc[z][city] = (zc[z][city] || 0) + 1; zst[z] ||= a.State; }
  if (city) { const ck = a.State + "|" + fold(city); cityN[ck] = (cityN[ck] || 0) + 1; }
  if (t !== "Farmers and Markets" && t !== "Restaurant Meals Program" && SKIP.test(rawName)) continue;
  if (t === "Other" && !CUISINE.some(([, rx]) => rx.test(rawName)) && !BUDGET.test(rawName)) continue;
  // national chains carry store codes the shared tidy-up leaves behind ("Target Store T", "Kroger J-123")
  const n = tidyName(rawName).replace(/\s+Store\s+[A-Z]{0,2}$/i, "").replace(/(\S{3,})\s+[A-Z]$/, "$1").replace(/[/.]+(?=\S)/g, m => m.includes("/") ? " / " : m).trim();
  if (!n) continue;
  const base = { a: clean(a.Store_Street_Address), c: city, z, lat: r5(lat), lon: r5(lon) };
  if (t === "Restaurant Meals Program") { cell(cellOf(lat, lon)).stores.push({ id: "rmp-" + a.Record_ID, k: "rmp", n, ...base }); nRmp++; continue; }
  const isMkt = t === "Farmers and Markets" || /farmers'? market|certified farm/i.test(rawName);
  const cu = CUISINE.filter(([, rx]) => rx.test(rawName)).map(([c]) => c);
  const tier = isMkt ? "mkt" : PREMIUM.test(rawName) ? "premium" : BUDGET.test(rawName) || cu.length ? "budget" : "standard";
  const s = { id: "snap-" + a.Record_ID, k: isMkt ? "market" : "store", n, ...base, tier, cu };
  if (a.Incentive_Program) { s.inc = 1; nInc++; }   // gives extra money for fruits and vegetables (Double Up and similar)
  cell(cellOf(lat, lon)).stores.push(s); nStores++;
}

// ---- OpenStreetMap free food ----
const osm = (await rd("osm.json"))?.elements || [];
const sites = [];
for (const e of osm) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const kind = t.amenity === "community_fridge" || t.amenity === "food_sharing" ? "fridge" : (t.amenity === "soup_kitchen" || t.social_facility === "soup_kitchen") ? "meal" : (t.social_facility === "food_bank" || t.amenity === "food_bank") ? "pantry" : null;
  if (!kind || !t.name) continue;
  if (/\b(warehouse|distribution center|headquarters|admin(istrative)? office)\b/i.test(t.name)) continue;
  const oh = t.opening_hours || "";
  sites.push({ id: `osm-${e.type[0]}${e.id}`, ed: e.timestamp ? e.timestamp.slice(0, 10) : undefined, k: kind, n: clean(t.name),
    a: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), c: t["addr:city"] || "", z: (t["addr:postcode"] || "").slice(0, 5),
    lat: r5(lat), lon: r5(lon), ph: phoneOf(t.phone || t["contact:phone"]), w: urlOk(t.website || t["contact:website"] || ""),
    d: [{ src: "osm", prog: "", when: oh, notes: clean(t.description || "").slice(0, 300), food: "", who: "", tips: "", f: [], sc: null, conf: oh ? "osm" : "call" }] });
}
// freshness: when each listing first appeared and when its details last changed (same rules as San Diego)
const today = fetched.slice(0, 10);
const prev = (await rd("history.json")) || { since: today, sites: {} };
const hist = { since: prev.since || today, sites: {} };
const hashOf = s => { const x = JSON.stringify([s.n, s.a, s.ph, s.w, s.d.map(d => [d.src, d.when, d.notes])]); let h = 0; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return h; };
for (const s of sites) {
  const h = hashOf(s), p = prev.sites[s.id];
  const rec = !p ? { first: today, h } : p.h === h ? p : { first: p.first, changed: today, h };
  hist.sites[s.id] = rec;
  if (rec.changed) s.chg = rec.changed;
  cell(cellOf(s.lat, s.lon)).sites.push(s);
}
await writeFile(join(raw, "history.json"), JSON.stringify(hist));

// ---- ZIP codes ----
const zips = {};
{
  const txt = existsSync(join(raw, "zcta.tsv")) ? await readFile(join(raw, "zcta.tsv"), "utf8") : "";
  const lines = txt.split(/\r?\n/), head = lines[0].split(/[|\t]/).map(h => h.trim());
  const iz = head.indexOf("GEOID"), ila = head.findIndex(h => /INTPTLAT/.test(h)), ilo = head.findIndex(h => /INTPTLONG/.test(h));
  for (const l of lines.slice(1)) {
    const c = l.split(/[|\t]/).map(x => x.trim());
    if (!/^\d{5}$/.test(c[iz] || "")) continue;
    const la = r5(+c[ila]), lo = r5(+c[ilo]);
    const top = zc[c[iz]] && Object.entries(zc[c[iz]]).sort((a, b) => b[1] - a[1])[0][0];
    const np = nearestPlace(la, lo);
    const city = top ? top.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Of|And)\b/g, w => w.toLowerCase()) : np?.n || "";
    zips[c[iz]] = [la, lo, city, zst[c[iz]] || np?.st || ""];
  }
}
for (const [z, v] of Object.entries(zips)) cell(cellOf(v[0], v[1])).zips[z] = v;

// ---- write ----
await rm(outDir, { recursive: true, force: true });
for (const d of ["cells", "zip", "places"]) await mkdir(join(outDir, d), { recursive: true });
const sortN = (a, b) => a.n.localeCompare(b.n);
const index = {};
let bytes = 0;
for (const [k, c] of cells) {
  c.sites.sort(sortN); c.stores.sort(sortN);
  const s = JSON.stringify({ v: 1, c: k, ...c });
  bytes += s.length;
  await writeFile(join(outDir, "cells", k + ".json"), s);
  index[k] = [c.sites.length, c.stores.length];
}
const byPre = {};
for (const [z, v] of Object.entries(zips)) (byPre[z.slice(0, 3)] ||= {})[z] = v;
for (const [p, m] of Object.entries(byPre)) await writeFile(join(outDir, "zip", p + ".json"), JSON.stringify(m));
// places: busiest first within a letter (by how many SNAP retailers list that city), so "Springfield"
// suggests the larger ones first. Land area breaks ties.
const weight = p => cityN[p.st + "|" + fold(p.n)] || 0;
const byL = {};
for (const p of places.sort((a, b) => weight(b) - weight(a) || b.a - a.a)) { const l = fold(p.n)[0]; if (!l) continue; (byL[/[a-z]/.test(l) ? l : "0"] ||= []).push([p.n, p.st, p.lat, p.lon, weight(p)]); }
for (const [l, arr] of Object.entries(byL)) await writeFile(join(outDir, "places", l + ".json"), JSON.stringify(arr));
await writeFile(join(outDir, "index.json"), JSON.stringify({
  v: 1, built: fetched, tracked: hist.since, cell: 0.5,
  sources: {
    snap: { name: "USDA SNAP Retailer Locator", url: "https://www.fns.usda.gov/snap/retailer-locator" },
    osm: { name: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
    zcta: { name: "U.S. Census Bureau, Gazetteer files", url: "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html" },
  },
  cells: index,
}));
console.log(`[build-us] cells ${cells.size}, sites ${sites.length}, stores ${nStores} (+${nRmp} restaurants, ${nInc} with produce bonus), zips ${Object.keys(zips).length}, places ${places.length}, ${(bytes / 1048576).toFixed(1)} MB in cells`);
if (nStores < 30000 || Object.keys(zips).length < 30000) { console.error("[build-us] output looks too small; stopping"); process.exit(1); }
