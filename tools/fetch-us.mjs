// Downloads the public national sources for the US build into a raw/ folder.
// Runs on GitHub Actions only (the phone never calls any of these).
// Usage: node fetch-us.mjs <outDir>
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const out = process.argv[2] || "raw-us";
await mkdir(out, { recursive: true });
const UA = "PlentyMapDataBot/1.0 (free food-help app; monthly US build)";
const log = (...a) => console.log("[fetch-us]", ...a);

async function get(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const { timeout = 300000, ...o } = opts;
      const r = await fetch(url, { ...o, headers: { "User-Agent": UA, ...(o.headers || {}) }, signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      log(`retry ${i} ${url.slice(0, 120)}: ${e.message}`);
      await new Promise(res => setTimeout(res, 5000 * i));
    }
  }
}
async function save(name, data) {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  await writeFile(join(out, name), s);
  log(`saved ${name} (${(s.length / 1048576).toFixed(1)} MB)`);
}
const report = {};
// ONLY=osm,snap runs just those steps (for testing a source on its own)
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
async function step(name, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  try { await fn(); report[name] = "ok"; }
  catch (e) { report[name] = "failed: " + e.message; log(`FAILED ${name}: ${e.message}`); }
}

// 1. USDA SNAP retailers, state by state (the public ArcGIS layer behind the SNAP Retailer Locator).
//    Only the store types the app lists; convenience stores, gas stations and the like are left out here.
const STATES = "AK AL AR AZ CA CO CT DC DE FL GA GU HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VI VT WA WI WV WY".split(" ");
const TYPES = ["Supermarket", "Super Store", "Grocery Store", "Farmers and Markets", "Specialty Store", "Other", "Restaurant Meals Program"];
await step("snap", async () => {
  const base = "https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0/query";
  const fields = "Record_ID,Store_Name,Store_Street_Address,City,State,Zip_Code,Store_Type,Latitude,Longitude,Incentive_Program";
  const rows = [], per = {};
  for (const st of STATES) {
    let n = 0;
    for (let off = 0; off < 60000; off += 1000) {
      const where = `State='${st}' AND Store_Type IN (${TYPES.map(t => `'${t}'`).join(",")})`;
      const p = new URLSearchParams({ where, outFields: fields, returnGeometry: "false", orderByFields: "ObjectId", f: "json", resultOffset: off, resultRecordCount: 1000 });
      const j = await (await get(`${base}?${p}`)).json();
      if (j.error) throw new Error(st + " " + JSON.stringify(j.error));
      const f = j.features || [];
      for (const x of f) rows.push(x.attributes);
      n += f.length;
      if (!j.exceededTransferLimit && f.length < 1000) break;
    }
    per[st] = n;
  }
  log("snap per state", JSON.stringify(per));
  const low = STATES.filter(s => !per[s]);
  if (rows.length < 50000 || low.length > 2) throw new Error(`too few rows (${rows.length}); empty states: ${low.join(" ")}`);
  report.snap_per_state = per;
  await save("snap.json", rows);
});

// 2. Census Gazetteer: ZIP code (ZCTA) centers and place (city, town, CDP) centers.
async function gaz(kind, file, min) {
  for (const yr of [2025, 2024, 2023]) {
    try {
      const url = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${yr}_Gazetteer/${yr}_Gaz_${kind}_national.zip`;
      const buf = Buffer.from(await (await get(url, {}, 2)).arrayBuffer());
      await writeFile(`/tmp/${kind}.zip`, buf);
      const txt = execFileSync("unzip", ["-p", `/tmp/${kind}.zip`], { maxBuffer: 256 << 20 }).toString();
      const n = txt.split(/\r?\n/).length;
      if (n < min) throw new Error(`too few lines: ${n}`);
      await save(file, txt);
      report[kind + "_year"] = yr;
      return;
    } catch (e) { log(`${kind} ${yr}: ${e.message}`); }
  }
  throw new Error("no gazetteer year worked for " + kind);
}
await step("zcta", () => gaz("zcta", "zcta.tsv", 30000));
await step("place", () => gaz("place", "place.tsv", 30000));

// 4. OpenStreetMap: food banks, pantries, soup kitchens and community fridges.
//    One nationwide query often times out on the shared Overpass servers and comes back partial (a "remark"
//    and a few hundred elements), so the country is pulled in regional boxes, each checked on its own.
//    A region that fails, or drops far below last week's count, keeps last week's listings
//    (raw/osm-regions.json on the usdata branch). Then every listing gets a state from the nearest
//    Census place, and the pull must cover most states, not just reach a total.
await step("osm", async () => {
  const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  // [name, south, west, north, east]; together they cover the lower 48, Alaska and Hawaii
  const REGIONS = [
    ["northeast", 38.7, -80.6, 47.6, -66.8], ["mid-south", 36.5, -92.0, 38.7, -74.9], ["great-lakes", 38.7, -92.0, 49.5, -80.6],
    ["southeast", 24.3, -92.0, 36.5, -75.2], ["south-central", 25.8, -107.0, 36.5, -92.0], ["plains", 36.5, -104.1, 49.5, -92.0],
    ["mountain", 31.3, -117.0, 49.1, -104.1], ["pacific", 32.4, -125.0, 49.1, -117.0],
    ["alaska", 51.0, -180.0, 71.6, -129.9], ["hawaii", 18.8, -160.5, 22.4, -154.7],
  ];
  const sel = `nwr["amenity"~"^(food_bank|community_fridge|food_sharing|soup_kitchen)$"]`, sel2 = `nwr["amenity"="social_facility"]["social_facility"~"^(food_bank|soup_kitchen)$"]`;
  const q = ([, s, w, n, e]) => `[out:json][timeout:240];
area["ISO3166-1"="US"][admin_level=2]->.us;
(${sel}(area.us)(${s},${w},${n},${e});${sel2}(area.us)(${s},${w},${n},${e}););
out center meta;`;
  const qPR = `[out:json][timeout:120];area["ISO3166-1"="PR"][admin_level=2]->.pr;(${sel}(area.pr);${sel2}(area.pr););out center meta;`;
  let prev = {};
  try { prev = JSON.parse(await readFile(join(out, "osm-regions.json"), "utf8")); } catch { }
  // the whole step gets a time budget; once it runs out, the remaining regions keep last week's listings
  const deadline = Date.now() + 35 * 60000;
  async function pull(query, name, tries = 3, timeout = 240000) {
    for (let i = 0; i < tries; i++) {
      if (Date.now() + 30000 > deadline) { log(`osm ${name}: out of time`); return null; }
      const ep = eps[i % eps.length];
      try {
        const j = await (await get(ep, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: Math.min(timeout, deadline - Date.now()) }, 1)).json();
        // Overpass reports a timeout or memory stop as a "remark" next to whatever it managed to return
        if (j.remark && /error|timed out|out of memory|runtime/i.test(j.remark)) throw new Error(j.remark.slice(0, 120));
        if (!Array.isArray(j.elements)) throw new Error("no elements array");
        return j.elements;
      } catch (e) { log(`osm ${name} via ${ep.split("/")[2]}: ${e.message}`); await new Promise(r => setTimeout(r, 8000 * (i + 1))); }
    }
    return null;
  }
  const inBox = (e, [, s, w, n, ea]) => { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; return la >= s && la <= n && lo >= w && lo <= ea; };
  // the fewest listings a region can plausibly have; zero or a handful means the server cut it short
  const FLOOR = { alaska: 3, hawaii: 3, "puerto-rico": 0 };
  const by = {}, kept = [], missing = [];
  // first try the whole country in one query (fast when the servers are quiet), then split it by region
  const all = await pull(`[out:json][timeout:900];
area["ISO3166-1"="US"][admin_level=2]->.us;
(${sel}(area.us);${sel2}(area.us););
out center meta;`, "nationwide", 3, 600000);
  const pr = await pull(qPR, "puerto-rico");
  for (const r of [...REGIONS, ["puerto-rico"]]) {
    const name = r[0], was = prev[name]?.length || 0, floor = FLOOR[name] ?? 10;
    let got = name === "puerto-rico" ? pr : all ? all.filter(e => inBox(e, r)) : null;
    const ok = x => x && x.length >= floor && !(was >= 20 && x.length < was * 0.6);
    // far fewer than last week means a cut-off pull, not hundreds of pantries closing in a week
    if (!ok(got)) { log(`osm ${name}: ${got ? got.length : "no"} from the big pull; asking for the region alone`); got = name === "puerto-rico" ? null : await pull(q(r), name); }
    if (ok(got)) by[name] = got;
    else if (was) { by[name] = prev[name]; kept.push(name); }
    else if (got) by[name] = got;
    else missing.push(name);
    log(`osm ${name}: ${by[name]?.length ?? 0}${kept.includes(name) ? " (kept last week's)" : ""}`);
  }
  const seen = new Set(), elements = [];
  for (const e of Object.values(by).flat()) { const k = e.type + e.id; if (!seen.has(k)) { seen.add(k); elements.push(e); } }
  // state of each listing, from the nearest Census place (good enough for a coverage check)
  const perState = {};
  try {
    const lines = (await readFile(join(out, "place.tsv"), "utf8")).split(/\r?\n/), head = lines[0].split("|").map(h => h.trim());
    const iS = head.indexOf("USPS"), iLa = head.findIndex(h => /INTPTLAT/.test(h)), iLo = head.findIndex(h => /INTPTLONG/.test(h));
    const grid = new Map();
    for (const l of lines.slice(1)) { const c = l.split("|"); const la = +c[iLa], lo = +c[iLo]; if (!la) continue; const k = `${Math.floor(la)}_${Math.floor(lo)}`; (grid.get(k) || grid.set(k, []).get(k)).push([la, lo, c[iS].trim()]); }
    for (const e of elements) {
      const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null) continue;
      let best = "", bd = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const p of grid.get(`${Math.floor(la) + dy}_${Math.floor(lo) + dx}`) || []) { const d = (p[0] - la) ** 2 + (p[1] - lo) ** 2; if (d < bd) { bd = d; best = p[2]; } }
      if (best) perState[best] = (perState[best] || 0) + 1;
    }
  } catch (e) { log("osm state check skipped: " + e.message); }
  const nStates = Object.keys(perState).length;
  log(`osm ${elements.length} elements; per state ${JSON.stringify(perState)}; kept: ${kept.join(" ") || "none"}; missing: ${missing.join(" ") || "none"}`);
  report.osm_per_region = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length]));
  report.osm_per_state = perState; report.osm_kept = kept; report.osm_missing = missing;
  if (elements.length < 1500) throw new Error(`thin OSM pull: ${elements.length} elements`);
  if (Object.keys(perState).length && nStates < 45) throw new Error(`OSM pull covers only ${nStates} states`);
  if (missing.length > 1) throw new Error("OSM regions missing: " + missing.join(" "));
  await save("osm-regions.json", by);
  await save("osm.json", { elements });
});

await save("report.json", { fetched: new Date().toISOString(), ...report });
log(JSON.stringify(report));
if (ONLY) process.exit(ONLY.every(n => report[n] === "ok") ? 0 : 1);
if (report.snap !== "ok" || report.zcta !== "ok" || report.osm !== "ok") process.exit(1);
