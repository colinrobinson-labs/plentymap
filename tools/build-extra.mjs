// Builds the extra map layers from the raw files fetch-extra.mjs saved:
//   data/extra/index.json           build date, sources, which 0.5° cells have rows
//   data/extra/cells/<y>_<x>.json   {sites: [summer, garden, givebox], stores: [bakery]}
// Same cell grid and record shape as tools/build-us.mjs, so js/region.js merges them the same way.
// Usage: node build-extra.mjs <rawDir> <outDir>
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const [raw = "raw-extra", outDir = "data/extra"] = process.argv.slice(2);
const rd = async f => { try { return JSON.parse(await readFile(join(raw, f), "utf8")); } catch { return null; } };
const r5 = x => Math.round(x * 1e5) / 1e5;
const cellOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
const phoneOf = p => { const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : ""; };
const urlOk = u => { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const titleCase = s => !s || /[a-z]/.test(s) ? clean(s) : clean(s).toLowerCase().replace(/(^|[\s\-\/(#])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const inUS = (lat, lon) => lat > 17 && lat < 72 && lon > -180 && lon < -64;
const today = new Date().toISOString().slice(0, 10);

const cells = new Map();
const cell = k => { let c = cells.get(k); if (!c) cells.set(k, c = { sites: [], stores: [] }); return c; };
const count = {};
const add = (bucket, s) => { cell(cellOf(s.lat, s.lon))[bucket].push(s); count[s.k] = (count[s.k] || 0) + 1; };

// ---------- OpenStreetMap ----------
function osmBase(e, kind, name) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null || !inUS(lat, lon)) return null;
  const oh = t.opening_hours || "";
  return {
    id: `osm-${e.type[0]}${e.id}`, ed: e.timestamp ? e.timestamp.slice(0, 10) : undefined, k: kind, n: clean(name),
    a: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), c: t["addr:city"] || "", z: (t["addr:postcode"] || "").slice(0, 5),
    lat: r5(lat), lon: r5(lon), ph: phoneOf(t.phone || t["contact:phone"]), w: urlOk(t.website || t["contact:website"] || ""),
    d: [{ src: "osm", prog: "", when: oh, notes: clean(t.description || "").slice(0, 300), food: "", who: "", tips: "", f: [], sc: null, conf: oh ? "osm" : "call" }],
  };
}
const gone = t => Object.keys(t).some(k => /^(disused|abandoned|was|demolished|razed|removed):/.test(k)) || t.access === "private";

for (const e of (await rd("gardens.json"))?.elements || []) {
  const t = e.tags || {};
  if (gone(t)) continue;
  // unnamed allotments are often just land use; keep unnamed only when tagged as a community garden
  const name = t.name || (t["garden:type"] === "community" ? "" : null);
  if (name === null) continue;
  const s = osmBase(e, "garden", name || "Community garden");
  if (s) { if (!name) s.nn = 1; add("sites", s); }
}
const FOODY = /pantry|food|blessing|little free|mini|share|giving|community (box|cupboard|shelf)/i;
for (const e of (await rd("giveboxes.json"))?.elements || []) {
  const t = e.tags || {};
  if (gone(t)) continue;
  // give boxes can hold anything (books, clothes); keep the ones that say they hold food
  const txt = [t.name, t.description, t.note, t["give_box:type"], t.goods].filter(Boolean).join(" ");
  if (!(t.food === "yes" || t.amenity === "food_sharing" || FOODY.test(txt)) || /\b(book|library|clothes|clothing|seed)s?\b/i.test(t.name || "") && !/food|pantry/i.test(txt)) continue;
  const s = osmBase(e, "givebox", t.name || "Little free pantry");
  if (s) { if (!t.name) s.nn = 1; add("sites", s); }
}
for (const e of (await rd("bakeries.json"))?.elements || []) {
  const t = e.tags || {};
  if (gone(t) || !t.name) continue;
  const s = osmBase(e, "bakery", t.name);
  if (!s) continue;
  delete s.d;   // a store, like SNAP retailers: no schedule block
  s.oh = t.opening_hours || undefined;
  add("stores", s);
}

// ---------- USDA summer meal sites ----------
const sm = await rd("summer.json");
let summerLayer = null;
if (sm?.features?.length) {
  summerLayer = sm.layer;
  const F = sm.layer.fields;
  const pick = (...res) => F.find(f => res.some(r => r.test(f)));
  const fld = {
    name: pick(/^site_?name$/i, /sitename/i, /^name$/i, /site/i),
    addr: pick(/^site_?address(1|_?line_?1)?$/i, /address/i, /street/i),
    city: pick(/^site_?city$/i, /city/i),
    st: pick(/^site_?state$/i, /^state$/i, /state/i),
    zip: pick(/^site_?zip/i, /zip/i),
    phone: pick(/site_?phone/i, /phone/i),
    start: pick(/start_?date/i, /^start/i, /begin/i),
    end: pick(/end_?date/i, /^end/i),
    days: pick(/days?_?of_?op/i, /days/i),
    b: pick(/breakfast/i), l: pick(/lunch/i), sn: pick(/snack.*am|am.*snack/i, /snack/i), s2: pick(/snack.*pm|pm.*snack/i), d: pick(/dinner|supper/i),
    type: pick(/program_?type/i, /program/i),
    org: pick(/sponsor/i),
    notes: pick(/comment/i, /note/i),
  };
  console.log("[build-extra] summer field map", JSON.stringify(fld));
  const asDate = v => {
    if (v == null || v === "") return "";
    if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
    const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  };
  let n = 0, ended = 0;
  for (const f of sm.features) {
    const a = f.attributes || {}, g = f.geometry || {};
    const lat = g.y, lon = g.x;
    if (lat == null || !inUS(lat, lon)) continue;
    const from = asDate(a[fld.start]), to = asDate(a[fld.end]);
    // only sites with a published end date that hasn't passed, and not withdrawn by the state
    if (!to || to < today) { ended++; continue; }
    if (["Dropped", "Expired"].some(k => /^(y|yes|true|1)$/i.test(String(a[k] ?? "").trim()))) { ended++; continue; }
    // not more than two months ahead: a site listed for next summer would mislead today
    if (from && from > new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)) { ended++; continue; }
    const meals = [["Breakfast", fld.b], ["Lunch", fld.l], ["Snack", fld.sn], ["Snack", fld.s2], ["Supper", fld.d]]
      .filter(([, k]) => k && clean(a[k])).map(([lab, k]) => `${lab} ${clean(a[k])}`);
    const when = [from && to ? `${from} to ${to}` : "", clean(a[fld.days]), meals.join("; ")].filter(Boolean).join(" · ");
    const oid = a.OBJECTID ?? a.objectid ?? a.FID ?? n;
    add("sites", {
      id: `sum-${oid}`, k: "summer", n: titleCase(a[fld.name]) || "Summer meal site",
      a: titleCase(a[fld.addr]), c: titleCase(a[fld.city]), z: String(a[fld.zip] || "").slice(0, 5), lat: r5(lat), lon: r5(lon),
      ph: phoneOf(a[fld.phone]), w: "", from: from || undefined, to: to || undefined,
      d: [{ src: "sfsp", prog: "", when, notes: clean(a[fld.notes]).slice(0, 300), food: "", who: "18 and under", tips: "", f: [], sc: null, conf: "call" }],
    });
    n++;
  }
  console.log(`[build-extra] summer sites kept ${n}, already ended ${ended}`);
}

// ---------- write ----------
await rm(outDir, { recursive: true, force: true });
await mkdir(join(outDir, "cells"), { recursive: true });
const index = {};
let bytes = 0;
for (const [k, c] of cells) {
  c.sites.sort((a, b) => a.n.localeCompare(b.n)); c.stores.sort((a, b) => a.n.localeCompare(b.n));
  const s = JSON.stringify({ v: 1, c: k, sites: c.sites, stores: c.stores, zips: {} });
  bytes += s.length;
  await writeFile(join(outDir, "cells", k + ".json"), s);
  index[k] = [c.sites.length, c.stores.length];
}
const rep = (await rd("report.json")) || {};
await writeFile(join(outDir, "index.json"), JSON.stringify({
  v: 1, built: rep.fetched || new Date().toISOString(), cell: 0.5, counts: count,
  summer: summerLayer ? { layer: summerLayer.url, edited: summerLayer.edited || null } : null,
  sources: {
    osm: { name: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
    sfsp: { name: "USDA Summer Meals Site Finder", url: "https://www.fna.usda.gov/sfsp/sitefinder", phone: "866-348-6479" },
  },
  cells: index,
}));
console.log(`[build-extra] cells ${cells.size}, ${JSON.stringify(count)}, ${(bytes / 1048576).toFixed(1)} MB`);
// each OpenStreetMap layer must look complete, or last week's layers stay up
const MIN = { garden: 1000, givebox: 100, bakery: 20 };
const short = Object.entries(MIN).filter(([k, n]) => (count[k] || 0) < n);
if (short.length) { console.error(`[build-extra] output looks too small (${short.map(([k]) => `${k} ${count[k] || 0}`).join(", ")}); stopping`); process.exit(1); }
