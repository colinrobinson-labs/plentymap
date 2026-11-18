// Downloads the public national sources for the US build into a raw/ folder.
// Runs on GitHub Actions only (the phone never calls any of these).
// Usage: node fetch-us.mjs <outDir>
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const out = process.argv[2] || "raw-us";
await mkdir(out, { recursive: true });
const UA = "PlentyMapDataBot/1.0 (free food-help app; monthly US build)";
const log = (...a) => console.log("[fetch-us]", ...a);

async function get(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(300000) });
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
async function step(name, fn) {
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

// 2. OpenStreetMap: food banks, pantries, soup kitchens and community fridges across the US.
await step("osm", async () => {
  const q = `[out:json][timeout:600];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["amenity"~"^(food_bank|community_fridge|food_sharing|soup_kitchen)$"](area.us);
  nwr["amenity"="social_facility"]["social_facility"~"^(food_bank|soup_kitchen)$"](area.us);
);
out center meta;`;
  const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  let last;
  for (const ep of eps) {
    try {
      const j = await (await get(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 2)).json();
      if (!(j.elements?.length > 500)) throw new Error("too few elements: " + (j.elements?.length || 0) + " " + (j.remark || ""));
      await save("osm.json", j);
      return;
    } catch (e) { last = e; log(`overpass ${ep} failed: ${e.message}`); }
  }
  throw last;
});

// 3. Census Gazetteer: ZIP code (ZCTA) centers and place (city, town, CDP) centers.
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

await save("report.json", { fetched: new Date().toISOString(), ...report });
log(JSON.stringify(report));
if (report.snap !== "ok" || report.zcta !== "ok") process.exit(1);
