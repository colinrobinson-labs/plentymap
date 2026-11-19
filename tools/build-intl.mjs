// Builds the data packs the app reads for one country outside the US (same cell format as data/us):
//   data/<cc>/index.json            country, sources, build date, regions, which cells have data
//   data/<cc>/cells/<y>_<x>.json    free food sites, supermarkets and postcode areas in one 0.5° cell,
//                                   plus that cell's time zone (Canada spans six)
//   data/<cc>/pc/<key>.json         postcode areas for search. GB: sectors and districts by postcode
//                                   area ("sw" holds "SW2 3" and "SW2"). CA: FSAs by first letter.
//   data/<cc>/places/<a>.json       towns, villages and neighbourhoods: [name, region, lat, lon, weight]
// Usage: node build-intl.mjs <GB|CA> <rawDir> <outDir>
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { r5, clean, tidyName, phoneOf, urlOk } from "./lib-food.mjs";

const CC = (process.argv[2] || "").toUpperCase();
const [raw = `raw-${CC.toLowerCase()}`, outDir = `data/${CC.toLowerCase()}`] = process.argv.slice(3);
if (!["GB", "CA"].includes(CC)) { console.error("usage: build-intl.mjs <GB|CA> <rawDir> <outDir>"); process.exit(2); }
const log = (...a) => console.log(`[build-${CC.toLowerCase()}]`, ...a);
const has = f => existsSync(join(raw, f));
const rdJ = async f => has(f) ? JSON.parse(await readFile(join(raw, f), "utf8")) : null;
const rdT = async f => has(f) ? await readFile(join(raw, f), "utf8") : "";
const rep = (await rdJ("report.json")) || {};
const fetched = rep.fetched || new Date().toISOString();
const today = fetched.slice(0, 10);

const REGIONS = CC === "GB"
  ? { ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland" }
  : { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia",
      NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" };
// GeoNames admin1 codes for Canada are numbers
const CA_ADMIN = { "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL", "07": "NS", "08": "ON", "09": "PE", "10": "QC", "11": "SK", "12": "YT", "13": "NT", "14": "NU" };
// rough country boxes, to drop stray rows (GeoNames files list Akrotiri and Dhekelia under GB)
const BOX = CC === "GB" ? [-8.7, 49.8, 1.8, 61.0] : [-141.1, 41.6, -52.5, 83.2];
const inBox = (lat, lon) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];

const cellOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const cells = new Map();
const cell = k => { let c = cells.get(k); if (!c) cells.set(k, c = { sites: [], stores: [], zips: {} }); return c; };
const fold = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const pfold = s => fold(s).replace(/\bsainte\b/g, "ste").replace(/\bsaint\b/g, "st").replace(/\bmount\b/g, "mt").replace(/\bfort\b/g, "ft");
const dist = (a, b, c, d) => { const R = 6371e3, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * R; };

// Phone numbers as people write them locally. Canada is +1 like the US (613-555-0100).
function phoneUK(s) {
  let d = String(s || "").replace(/[^\d+]/g, "").replace(/^\+44/, "0").replace(/^0044/, "0");
  if (!/^0\d{9,10}$/.test(d)) return "";
  if (/^02/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;                         // 020 7921 4205
  if (/^01\d1/.test(d) || /^011/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;   // 0161 496 0000
  if (/^0(3|8|9)/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;                  // 0808 208 2138
  return `${d.slice(0, 5)} ${d.slice(5)}`;                                                           // 01534 735472, 07700 900123
}
const phone = CC === "GB" ? phoneUK : phoneOf;
const blank = (src, extra = {}) => ({ src, prog: "", when: "", notes: "", food: "", who: "", tips: "", f: [], sc: null, conf: "call", ...extra });

/* ---------------- postcode areas ---------------- */
const pcFiles = {};          // file key -> { code: [lat, lon, town, region] }
const districts = [];        // [code, lat, lon, town, region] for cells and nearest-region lookups
{
  const txt = await rdT("postcodes.tsv");
  if (CC === "GB") {
    // GB_full: country, postcode, place, nation, nation code, county, ..., lat, lon, accuracy
    const agg = new Map();
    const add = (k, lat, lon, town, reg) => {
      let a = agg.get(k); if (!a) agg.set(k, a = { n: 0, la: 0, lo: 0, towns: {}, regs: {} });
      a.n++; a.la += lat; a.lo += lon; if (town) a.towns[town] = (a.towns[town] || 0) + 1; if (reg) a.regs[reg] = (a.regs[reg] || 0) + 1;
    };
    for (const l of txt.split("\n")) {
      const c = l.split("\t");
      const pc = (c[1] || "").toUpperCase().trim(), lat = +c[9], lon = +c[10];
      const m = pc.match(/^([A-Z]{1,2}\d[A-Z\d]?) (\d)[A-Z]{2}$/);
      if (!m || !lat || !inBox(lat, lon) || /^(JE|GY|IM)/.test(pc)) continue;
      const reg = c[4] in REGIONS ? c[4] : null;
      add(`${m[1]} ${m[2]}`, lat, lon, clean(c[2]), reg);
      add(m[1], lat, lon, clean(c[2]), reg);
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    for (const [k, a] of agg) {
      const v = [r5(a.la / a.n), r5(a.lo / a.n), top(a.towns), top(a.regs)];
      (pcFiles[k.match(/^[A-Z]+/)[0].toLowerCase()] ||= {})[k] = v;
      if (!k.includes(" ")) districts.push([k, ...v]);
    }
  } else {
    // CA.txt (FSAs): country, FSA, place, province name, province code, ..., lat, lon, accuracy
    for (const l of txt.split("\n")) {
      const c = l.split("\t");
      const fsa = (c[1] || "").toUpperCase().trim(), lat = +c[9], lon = +c[10];
      if (!/^[A-Z]\d[A-Z]$/.test(fsa) || !lat) continue;
      const v = [r5(lat), r5(lon), clean(c[2]).replace(/\s*\((.+)\)$/, " ($1)"), c[4] in REGIONS ? c[4] : ""];
      (pcFiles[fsa[0].toLowerCase()] ||= {})[fsa] = v;
      districts.push([fsa, ...v]);
    }
  }
}
for (const [k, la, lo, town, reg] of districts) cell(cellOf(la, lo)).zips[k] = [la, lo, town, reg];
const dgrid = new Map();
for (const d of districts) { const k = `${Math.floor(d[1])}_${Math.floor(d[2])}`; (dgrid.get(k) || dgrid.set(k, []).get(k)).push(d); }
function nearestDistrict(lat, lon) {
  let best = null, bd = Infinity;
  for (let r = 1; r <= 4 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (const d of dgrid.get(`${Math.floor(lat) + dy}_${Math.floor(lon) + dx}`) || []) {
    const x = dist(lat, lon, d[1], d[2]); if (x < bd) { bd = x; best = d; }
  }
  return best;
}

/* ---------------- places (search) and time zones ---------------- */
const places = [];
const tzVotes = new Map();
{
  const lines = (await rdT("places.tsv")).split("\n");
  const head = lines[0].split("\t");
  const I = n => head.indexOf(n);
  const [iN, iLa, iLo, iF, iA, iP, iT] = ["name", "lat", "lon", "fcode", "admin1", "pop", "tz"].map(I);
  const KEEP = /^(PPL|PPLA\d?|PPLC|PPLG|PPLL|PPLS|PPLX|PPLF|STLMT)$/;
  for (const l of lines.slice(1)) {
    const c = l.split("\t");
    const lat = +c[iLa], lon = +c[iLo];
    if (!c[iN] || !KEEP.test(c[iF]) || !inBox(lat, lon)) continue;
    if (CC === "GB" && c[iT] !== "Europe/London") continue;
    const reg = CC === "GB" ? (c[iA] in REGIONS ? c[iA] : null) : CA_ADMIN[c[iA]] || null;
    const p = { n: clean(c[iN]), reg: reg || nearestDistrict(lat, lon)?.[4] || "", lat: r5(lat), lon: r5(lon), pop: +c[iP] || 0, x: c[iF] === "PPLX" };
    if (!p.reg) continue;
    places.push(p);
    if (c[iT]) { const k = cellOf(lat, lon); const v = tzVotes.get(k) || tzVotes.set(k, {}).get(k); v[c[iT]] = (v[c[iT]] || 0) + 1 + p.pop / 1000; }
  }
}
// a cell's time zone: its own places' vote, else the nearest cell that has one
const tzOf = new Map([...tzVotes].map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));
function cellTz(k) {
  if (tzOf.has(k)) return tzOf.get(k);
  const [y, x] = k.split("_").map(Number);
  for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const z = tzOf.get(`${y + dy}_${x + dx}`); if (z) return z; }
  return CC === "GB" ? "Europe/London" : "America/Toronto";
}

/* ---------------- free food sites ---------------- */
const sites = [];
const srcs = {
  osm: { name: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
  geonames: { name: "GeoNames", url: "https://www.geonames.org/", license: "CC BY 4.0" },
};
const placeFor = (lat, lon) => { const d = nearestDistrict(lat, lon); return d ? { c: d[3], reg: d[4] } : { c: "", reg: "" }; };

if (CC === "GB") {
  // Give Food: each food bank and its distribution points. A food bank with listed points shows those
  // (its own address is often an office or warehouse); one without shows its own address.
  // Terms: credit and link Give Food, keep it fresh (built daily), link each food bank's page.
  srcs.givefood = { name: "Give Food", url: "https://www.givefood.org.uk/", terms: "https://www.givefood.org.uk/api/", partner: false };
  const fbs = (await rdJ("givefood-foodbanks.json")) || [];
  const locs = (await rdJ("givefood-locations.json")) || [];
  const bySlug = new Map(fbs.map(f => [f.slug, f]));
  const withLocs = new Set(locs.map(l => l.foodbank?.slug));
  const ll = s => { const [a, b] = String(s || "").split(",").map(Number); return a && b ? [a, b] : null; };
  const addrParts = (a, pc) => {
    const lines = String(a || "").split(/\r?\n/).map(clean).filter(Boolean).filter(x => x.toUpperCase() !== String(pc || "").toUpperCase());
    return { a: lines.slice(0, -1).join(", ") || lines[0] || "", c: lines.length > 1 ? lines[lines.length - 1] : "" };
  };
  const orgName = f => { const n = clean(f.name); return /food ?bank|pantry|larder|food/i.test(n) ? n : `${n} Foodbank`; };
  const push = (id, n, org, f, src, p) => {
    const pt = ll(src.lat_lng);
    if (!pt || !inBox(pt[0], pt[1]) || /^(JE|GY|IM)\d/.test(src.postcode || "")) return;
    const { a, c } = addrParts(src.address, src.postcode);
    const pl = placeFor(pt[0], pt[1]);
    sites.push({
      id, k: "pantry", n, org, a, c: c || pl.c, z: (src.postcode || "").toUpperCase(), lat: r5(pt[0]), lon: r5(pt[1]),
      ph: phone(src.phone || f.phone), w: urlOk(f.urls?.homepage || ""), u: f.urls?.html || src.urls?.html || "",
      net: f.network || "", ref: 1, reg: pl.reg,
      d: [blank("givefood")],
    });
  };
  for (const l of locs) {
    const f = bySlug.get(l.foodbank?.slug) || { ...l.foodbank, name: l.foodbank?.name };
    if (f.closed) continue;
    const org = orgName(f), ln = clean(l.name);
    const n = fold(org).includes(fold(ln)) ? org : `${org}: ${ln}`;
    push(`gf-${l.id}`, n, org, f, l);
  }
  for (const f of fbs) if (!f.closed && !withLocs.has(f.slug)) push(`gf-${f.id}`, orgName(f), orgName(f), f, f);
  log(`give food: ${sites.length} sites from ${fbs.length} food banks, ${locs.length} distribution points`);
}

if (CC === "CA") {
  // DataBC "Food Banks" (BC only). Field names vary a little between releases, so read them loosely.
  srcs.bc = { name: "Province of British Columbia (DataBC)", url: "https://catalogue.data.gov.bc.ca/dataset/food-banks", license: "Open Government Licence – British Columbia", partner: false };
  const bc = (await rdJ("bc-foodbanks.json"))?.features || [];
  const pick = (p, ...ks) => { for (const k of ks) for (const [kk, v] of Object.entries(p)) if (kk.toUpperCase() === k && v != null && String(v).trim()) return clean(v); return ""; };
  let n = 0;
  for (const f of bc) {
    const g = f.geometry; if (!g || g.type !== "Point") continue;
    const [lon, lat] = g.coordinates, p = f.properties || {};
    const name = pick(p, "FACILITY_NAME", "NAME", "ORGANIZATION_NAME");
    if (!name) continue;
    const pl = placeFor(lat, lon);
    const addr = pick(p, "STREET_ADDRESS", "PHYSICAL_ADDRESS", "ADDRESS");
    const upd = pick(p, "DATE_UPDATED").slice(0, 10);
    const hours = pick(p, "HOURS", "HOURS_OF_OPERATION", "OPERATING_HOURS");
    sites.push({
      id: `bc-${pick(p, "SOURCE_DATA_ID", "SEQUENCE_ID") || f.id}`, ...(/^\d{4}-\d\d-\d\d$/.test(upd) ? { ed: upd } : {}), k: "pantry", n: name,
      a: addr, c: pick(p, "LOCALITY", "CITY", "MUNICIPALITY") || pl.c, z: pick(p, "POSTAL_CODE").toUpperCase(), lat: r5(lat), lon: r5(lon),
      ph: phone(pick(p, "PHONE", "PHONE_NUMBER", "CONTACT_PHONE")), w: urlOk(pick(p, "WEBSITE", "WEBSITE_URL", "URL")), reg: "BC",
      d: [blank("bc", { when: hours, notes: pick(p, "DESCRIPTION", "COMMENTS", "SERVICES").slice(0, 300), conf: hours ? "osm" : "call" })],
    });
    n++;
  }
  log(`bc: ${n} food banks`);

  // City of Vancouver free and low cost food programs: meals and hampers with days and times
  const van = (await rdJ("vancouver-programs.json"))?.features || [];
  if (van.length) {
    srcs.vancouver = { name: "City of Vancouver", url: "https://opendata.vancouver.ca/explore/dataset/free-and-low-cost-food-programs/", license: "Open Government Licence – Vancouver", partner: false };
    let m = 0;
    for (const f of van) {
      const g = f.geometry, p = f.properties || {};
      const pt = g?.type === "Point" ? g.coordinates : (+p.latitude && +p.longitude ? [+p.longitude, +p.latitude] : null);
      const name = pick(p, "PROGRAM_NAME", "ORGANIZATION_NAME", "NAME");
      if (!pt || !name) continue;
      const yes = k => /^(true|yes|y|1)$/i.test(pick(p, k));
      const meal = yes("PROVIDES_MEALS") && !yes("PROVIDES_HAMPERS");
      const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const open = DAYS.filter(d => yes("OPEN_" + d.toUpperCase())).map(d => d[0].toUpperCase() + d.slice(1, 3));
      const when = pick(p, "DAYS_OPEN") || (open.length ? open.join(", ") : "");
      const ref = yes("REQUIRES_REFERRAL");
      sites.push({
        id: `van-${pick(p, "PROGRAM_ID", "OBJECTID") || m}`, k: meal ? "meal" : "pantry", n: name, org: pick(p, "ORGANIZATION_NAME"),
        a: pick(p, "ADDRESS", "LOCATION_ADDRESS").replace(/\b([A-Z])([A-Z]+)\b/g, (m, x, y) => x + y.toLowerCase()), c: "Vancouver", z: pick(p, "POSTAL_CODE").toUpperCase(), lat: r5(pt[1]), lon: r5(pt[0]),
        ph: phone(pick(p, "SIGNUP_PHONE_NUMBER", "PHONE")), w: urlOk(pick(p, "SIGNUP_LINK", "WEBSITE", "URL")), reg: "BC", ...(ref ? { ref: 1 } : {}),
        // days only (the city lists days, not hours), so the app shows them as notes, not as next-open times
        d: [blank("vancouver", { notes: [when && `Open: ${when}.`, pick(p, "DESCRIPTION"), pick(p, "PROGRAM_POPULATION_SERVED") && `For: ${pick(p, "PROGRAM_POPULATION_SERVED")}.`, pick(p, "COMMENT")].filter(Boolean).join(" ").slice(0, 400) })],
      });
      m++;
    }
    log(`vancouver: ${m} programs (fields: ${Object.keys(van[0].properties || {}).join(",")})`);
  }
}

// OpenStreetMap: community fridges, soup kitchens, and food banks the main feed doesn't have.
// A food bank within 200 m of one we already list is treated as the same place.
{
  const main = sites.slice();
  const mgrid = new Map();
  for (const s of main) { const k = `${Math.round(s.lat * 50)}_${Math.round(s.lon * 30)}`; (mgrid.get(k) || mgrid.set(k, []).get(k)).push(s); }
  const near = (lat, lon) => { const y = Math.round(lat * 50), x = Math.round(lon * 30); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const s of mgrid.get(`${y + dy}_${x + dx}`) || []) if (dist(lat, lon, s.lat, s.lon) < 200) return true; return false; };
  let n = 0, dup = 0;
  for (const e of (await rdJ("osm.json"))?.elements || []) {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || !inBox(lat, lon) || !t.name) continue;
    const kind = t.amenity === "community_fridge" || t.amenity === "food_sharing" ? "fridge"
      : (t.amenity === "soup_kitchen" || t.social_facility === "soup_kitchen") ? "meal"
      : (t.social_facility === "food_bank" || t.amenity === "food_bank") ? "pantry" : null;
    if (!kind) continue;
    if (/\b(warehouse|distribution cent(er|re)|headquarters|head office|admin(istrative)? office)\b/i.test(t.name)) continue;
    if (kind === "pantry" && near(lat, lon)) { dup++; continue; }
    const oh = t.opening_hours || "", pl = placeFor(lat, lon);
    sites.push({ id: `osm-${e.type[0]}${e.id}`, ed: e.timestamp ? e.timestamp.slice(0, 10) : undefined, k: kind, n: clean(t.name),
      a: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), c: t["addr:city"] || t["addr:town"] || pl.c, z: (t["addr:postcode"] || "").toUpperCase(),
      lat: r5(lat), lon: r5(lon), ph: phone(t.phone || t["contact:phone"]), w: urlOk(t.website || t["contact:website"] || ""), reg: pl.reg,
      ...(CC === "GB" && kind === "pantry" ? { ref: 1 } : {}),
      d: [blank("osm", { when: oh, notes: clean(t.description || "").slice(0, 300), conf: oh ? "osm" : "call" })] });
    n++;
  }
  log(`osm: ${n} sites added, ${dup} food banks already listed`);
}

// freshness: when each listing first appeared and when its details last changed (same rules as the US)
const prev = (await rdJ("history.json")) || { since: today, sites: {} };
const hist = { since: prev.since || today, sites: {} };
const hashOf = s => { const x = JSON.stringify([s.n, s.a, s.ph, s.w, s.d.map(d => [d.src, d.when, d.notes])]); let h = 0; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return h; };
for (const s of sites) {
  const h = hashOf(s), p = prev.sites[s.id];
  const rec = !p ? { first: today, h } : p.h === h ? p : { first: p.first, changed: today, h };
  hist.sites[s.id] = rec;
  if (rec.changed) s.chg = rec.changed;
  if (!s.ed) delete s.ed;
  for (const k of ["ph", "w", "u", "z", "a", "net"]) if (!s[k]) delete s[k];
  cell(cellOf(s.lat, s.lon)).sites.push(s);
}
await writeFile(join(raw, "history.json"), JSON.stringify(hist));

/* ---------------- supermarkets ---------------- */
// Price tier by brand, so "cheap groceries" can lead with discounters. Brands not listed count as standard.
const TIERS = CC === "GB" ? {
  budget: /^(aldi|lidl|asda|iceland|the food warehouse|farmfoods|heron foods|jack'?s|b&m|home bargains|fulton'?s foods|costcutter)$/i,
  premium: /^(waitrose|waitrose & partners|little waitrose|m&s|m&s food|marks (&|and) spencer|marks & spencer simply food|planet organic|whole foods market|booths|cook)$/i,
} : {
  budget: /^(no frills|freshco|food basics|maxi|super c|giant tiger|walmart|walmart supercentre|real canadian superstore|superstore|save-on-foods|chalo! freshco|food fair|basics|t&t supermarket|adonis|nations fresh foods|price chopper)$/i,
  premium: /^(whole foods market|pusateri'?s|longo'?s|urban fare|summerhill market|farm boy|choices markets|nature'?s fare)$/i,
};
const SKIP_BRAND = /^(costco|sam'?s club|bulk barn|shoppers drug mart|boots|superdrug|pharmaprix|dollarama)$/i;
let nStores = 0;
for (const e of (await rdJ("osm-shops.json"))?.elements || []) {
  const t = e.tags || {}, lat = e.lat, lon = e.lon;
  if (lat == null || !inBox(lat, lon)) continue;
  const brand = clean(t.brand || ""), name = clean(t.name || brand);
  if (!brand || SKIP_BRAND.test(brand)) continue;
  const tier = TIERS.budget.test(brand) ? "budget" : TIERS.premium.test(brand) ? "premium" : "standard";
  const pl = placeFor(lat, lon);
  cell(cellOf(lat, lon)).stores.push({ id: `osm-${e.type[0]}${e.id}`, k: "store", n: tidyName(name), b: brand,
    a: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), c: t["addr:city"] || t["addr:town"] || pl.c, z: (t["addr:postcode"] || "").toUpperCase(),
    lat: r5(lat), lon: r5(lon), tier, cu: [], reg: pl.reg, ...(t.opening_hours ? { oh: t.opening_hours } : {}) });
  nStores++;
}

/* ---------------- write ---------------- */
await rm(outDir, { recursive: true, force: true });
for (const d of ["cells", "pc", "places"]) await mkdir(join(outDir, d), { recursive: true });
const sortN = (a, b) => a.n.localeCompare(b.n);
const index = {};
let bytes = 0;
for (const [k, c] of cells) {
  c.sites.sort(sortN); c.stores.sort(sortN);
  const s = JSON.stringify({ v: 1, c: k, cc: CC, tz: cellTz(k), ...c });
  bytes += s.length;
  await writeFile(join(outDir, "cells", k + ".json"), s);
  index[k] = [c.sites.length, c.stores.length];
}
for (const [f, m] of Object.entries(pcFiles)) await writeFile(join(outDir, "pc", f + ".json"), JSON.stringify(m));
// places: biggest first within a letter; neighbourhoods (PPLX) after towns of the same size
const byL = {}, seen = new Set();
for (const p of places.sort((a, b) => b.pop - a.pop || a.x - b.x)) {
  const key = p.reg + "|" + pfold(p.n);
  if (seen.has(key)) continue;            // the same name twice in one nation or province: keep the biggest
  seen.add(key);
  const l = fold(p.n)[0]; if (!l) continue;
  (byL[/[a-z]/.test(l) ? l : "0"] ||= []).push([p.n, p.reg, p.lat, p.lon, p.pop]);
}
for (const [l, arr] of Object.entries(byL)) await writeFile(join(outDir, "places", l + ".json"), JSON.stringify(arr));
const kinds = sites.reduce((o, s) => (o[s.k] = (o[s.k] || 0) + 1, o), {});
await writeFile(join(outDir, "index.json"), JSON.stringify({
  v: 1, cc: CC, currency: CC === "GB" ? "GBP" : "CAD", built: fetched, tracked: hist.since, cell: 0.5,
  regions: REGIONS, sources: srcs, counts: { ...kinds, stores: nStores, postcodes: districts.length, places: seen.size },
  cells: index,
}));
log(`cells ${cells.size}, sites ${sites.length} ${JSON.stringify(kinds)}, stores ${nStores}, postcode areas ${districts.length}, places ${seen.size}, ${(bytes / 1048576).toFixed(1)} MB in cells`);
const MIN = CC === "GB" ? { sites: 1500, zips: 2500 } : { sites: 250, zips: 1500 };
if (sites.length < MIN.sites || districts.length < MIN.zips) { console.error(`[build-${CC.toLowerCase()}] output looks too small; stopping`); process.exit(1); }
