// Downloads the public sources for one country outside the US into a raw/ folder.
// Runs on GitHub Actions only (the phone never calls any of these).
// Usage: node fetch-intl.mjs <GB|CA> <outDir>
//
// Sources (see docs/adding-a-country.md for terms):
//   GB  Give Food API (food banks and their distribution points, several updates a day)
//   CA  DataBC "Food Banks" (Open Government Licence - British Columbia)
//   both  OpenStreetMap (food banks, community fridges, soup kitchens; branded supermarkets),
//         GeoNames postal codes and populated places (CC BY 4.0)
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const CC = (process.argv[2] || "").toUpperCase();
const out = process.argv[3] || `raw-${CC.toLowerCase()}`;
if (!["GB", "CA"].includes(CC)) { console.error("usage: fetch-intl.mjs <GB|CA> <outDir>"); process.exit(2); }
await mkdir(out, { recursive: true });
const UA = "PlentyMapDataBot/1.0 (free food-help app; https://plentymap.com; hello@plentymap.com)";
const log = (...a) => console.log(`[fetch-${CC.toLowerCase()}]`, ...a);

async function get(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(600000) });
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
const report = { country: CC };
async function step(name, fn) {
  try { await fn(); report[name] = "ok"; }
  catch (e) { report[name] = "failed: " + e.message; log(`FAILED ${name}: ${e.message}`); }
}
async function unzipText(url, member, min) {
  const buf = Buffer.from(await (await get(url, {}, 3)).arrayBuffer());
  const tmp = join(out, "_tmp.zip");
  await writeFile(tmp, buf);
  const txt = execFileSync("unzip", ["-p", tmp, member], { maxBuffer: 512 << 20 }).toString();
  execFileSync("rm", ["-f", tmp]);
  const n = txt.split("\n").length;
  if (n < min) throw new Error(`${member}: too few lines (${n})`);
  return txt;
}
const fresh = async (f, days) => { try { return (Date.now() - (await stat(join(out, f))).mtimeMs) / 864e5 < days; } catch { return false; } };

// 1. Food sites from the country's main feed
if (CC === "GB") {
  await step("givefood", async () => {
    const fb = await (await get("https://www.givefood.org.uk/api/2/foodbanks/")).json();
    const loc = await (await get("https://www.givefood.org.uk/api/2/locations/")).json();
    if (!(fb.length > 700 && loc.length > 1000)) throw new Error(`too few: ${fb.length} food banks, ${loc.length} locations`);
    report.givefood_counts = { foodbanks: fb.length, locations: loc.length };
    await save("givefood-foodbanks.json", fb);
    await save("givefood-locations.json", loc);
  });
}
if (CC === "CA") {
  await step("bc", async () => {
    const u = "https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature"
      + "&typeName=pub:WHSE_IMAGERY_AND_BASE_MAPS.GSR_FOOD_BANKS_SV&outputFormat=application/json&srsName=EPSG:4326";
    const j = await (await get(u)).json();
    if (!(j.features?.length > 40)) throw new Error("too few BC food banks: " + (j.features?.length || 0));
    report.bc_count = j.features.length;
    await save("bc-foodbanks.json", j);
  });
  // City of Vancouver "Free and low cost food programs" (Open Government Licence - Vancouver):
  // meals, grocery hampers and markets with days and times. Optional: the build works without it.
  await step("vancouver", async () => {
    const u = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/free-and-low-cost-food-programs/exports/geojson";
    const j = await (await get(u)).json();
    if (!(j.features?.length > 20)) throw new Error("too few Vancouver programs: " + (j.features?.length || 0));
    report.vancouver_count = j.features.length;
    await save("vancouver-programs.json", j);
  });
}

// 2. OpenStreetMap. Weekly is plenty, so a copy under 6 days old (kept by the Actions cache) is reused
//    and the public Overpass servers aren't asked every day.
async function overpass(q, min) {
  const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  let last;
  for (const ep of eps) {
    try {
      const j = await (await get(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 2)).json();
      if (!(j.elements?.length >= min)) throw new Error(`too few elements: ${j.elements?.length || 0} ${j.remark || ""}`);
      return j;
    } catch (e) { last = e; log(`overpass ${ep} failed: ${e.message}`); }
  }
  throw last;
}
const AREA = `area["ISO3166-1"="${CC}"][admin_level=2]->.c;`;
await step("osm", async () => {
  if (await fresh("osm.json", 6)) { log("osm.json is under 6 days old; keeping it"); report.osm_cached = true; return; }
  const j = await overpass(`[out:json][timeout:900];${AREA}
(
  nwr["amenity"~"^(food_bank|community_fridge|food_sharing|soup_kitchen)$"](area.c);
  nwr["amenity"="social_facility"]["social_facility"~"^(food_bank|soup_kitchen)$"](area.c);
);
out center meta;`, CC === "GB" ? 300 : 150);   // Nov 2026: GB ~450, CA ~224
  await save("osm.json", j);
});
await step("osm_shops", async () => {
  if (await fresh("osm-shops.json", 6)) { log("osm-shops.json is under 6 days old; keeping it"); return; }
  const j = await overpass(`[out:json][timeout:900];${AREA}
( nwr["shop"="supermarket"]["brand"](area.c); );
out center tags;`, 3000);
  // keep only what the build reads
  j.elements = j.elements.map(e => ({ type: e.type, id: e.id, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon,
    tags: Object.fromEntries(Object.entries(e.tags || {}).filter(([k]) => /^(name|brand|brand:wikidata|addr:.*|opening_hours|website|phone|contact:phone|contact:website)$/.test(k))) }));
  await save("osm-shops.json", j);
});

// 3. GeoNames: postal codes and populated places (towns, villages, neighbourhoods)
await step("postcodes", async () => {
  // GB: every postcode (1.8M rows) is reduced at build time to sector and district centres.
  // CA: the FSA file only (first three characters), never full postal codes.
  const txt = CC === "GB"
    ? await unzipText("https://download.geonames.org/export/zip/GB_full.csv.zip", "GB_full.txt", 1500000)
    : await unzipText("https://download.geonames.org/export/zip/CA.zip", "CA.txt", 1500);
  await save("postcodes.tsv", txt);
});
await step("places", async () => {
  const txt = await unzipText(`https://download.geonames.org/export/dump/${CC}.zip`, `${CC}.txt`, 20000);
  // populated places only (feature class P), minus the columns we don't use
  const keep = txt.split("\n").map(l => l.split("\t")).filter(c => c[6] === "P")
    .map(c => [c[1], c[4], c[5], c[7], c[10], c[14], c[17]].join("\t"));
  await save("places.tsv", "name\tlat\tlon\tfcode\tadmin1\tpop\ttz\n" + keep.join("\n"));
});

await save("report.json", { fetched: new Date().toISOString(), ...report });
log(JSON.stringify(report));
const must = CC === "GB" ? ["givefood", "postcodes", "places"] : ["postcodes", "places"];
if (must.some(k => report[k] !== "ok")) process.exit(1);
