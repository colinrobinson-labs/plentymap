// Downloads the public sources for the extra map layers into a raw folder. Runs on GitHub Actions only;
// the phone never calls any of these.
//   - OpenStreetMap: community gardens, little free pantries (give boxes), bakery outlet stores
//   - USDA FNS Summer Meals Site Finder (ArcGIS), when a summer season is published
// Usage: node fetch-extra.mjs <outDir>
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = process.argv[2] || "raw-extra";
await mkdir(out, { recursive: true });
const UA = "PlentyMapDataBot/1.0 (free food-help app; weekly build; hello@plentymap.com)";
const log = (...a) => console.log("[fetch-extra]", ...a);

async function get(url, opts = {}, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 300000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      log(`retry ${i} ${url.slice(0, 120)}: ${e.message}`);
      await new Promise(res => setTimeout(res, 5000 * i));
    }
  }
}
const json = async (url, opts) => (await get(url, opts)).json();
async function save(name, data) {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  await writeFile(join(out, name), s);
  log(`saved ${name} (${(s.length / 1048576).toFixed(2)} MB)`);
}
const report = {};
async function step(name, fn) {
  try { await fn(); report[name] ||= "ok"; }
  catch (e) { report[name] = "failed: " + e.message; log(`FAILED ${name}: ${e.message}`); }
}

// ---------- 1. OpenStreetMap ----------
const EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function overpass(name, body, min) {
  const q = `[out:json][timeout:900];\narea["ISO3166-1"="US"][admin_level=2]->.us;\n(\n${body}\n);\nout center tags meta;`;
  let last;
  for (const ep of EPS) {
    try {
      const j = await json(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 960000 });
      const n = j.elements?.length || 0;
      if (n < min) throw new Error(`too few elements: ${n} ${j.remark || ""}`);
      report[name + "_n"] = n;
      return save(name + ".json", j);
    } catch (e) { last = e; log(`overpass ${name} ${ep}: ${e.message}`); }
  }
  throw last;
}
await step("gardens", () => overpass("gardens", `  nwr["leisure"="garden"]["garden:type"="community"](area.us);
  nwr["landuse"="allotments"]["name"](area.us);`, 1000));
await step("giveboxes", () => overpass("giveboxes", `  nwr["amenity"="give_box"](area.us);
  nwr["amenity"="food_sharing"]["name"~"pantry|blessing",i](area.us);`, 50));
await step("bakeries", () => overpass("bakeries", `  nwr["shop"]["name"~"(bread|bakery|bake shop|baking|bakeries).*(outlet|thrift|discount)|(outlet|thrift).*(bread|bakery)",i](area.us);
  nwr["shop"]["name"~"^(franz|dave's killer bread|pepperidge farm|flowers|nature's own|entenmann's|bimbo|aunt millie's|schwebel's|alpha baking|lewis bake shop|hostess|mrs\\\\. baird's|holsum|sara lee|arnold|oroweat|martin's|wonder).*(outlet|store|thrift)",i](area.us);`, 20));

// ---------- 2. USDA Summer Meals Site Finder ----------
// The finder is an ArcGIS Experience app. Find its feature layers from the app's own config (the same
// layers the public map reads), falling back to an ArcGIS Online search for this year's layer.
const AGO = "https://www.arcgis.com/sharing/rest";
const EXPERIENCE = "bded45358b994a8fa009e1f88133eb03";
async function layersFromItem(id, seen = new Set(), depth = 0) {
  if (seen.has(id) || depth > 3) return [];
  seen.add(id);
  const info = await json(`${AGO}/content/items/${id}?f=json`).catch(() => null);
  if (!info || info.error) return [];
  const out = [];
  if (/Feature Service|Map Service/.test(info.type || "") && info.url) out.push({ url: info.url, title: info.title, modified: info.modified, owner: info.owner });
  const data = await get(`${AGO}/content/items/${id}/data?f=json`).then(r => r.text()).catch(() => "");
  for (const m of data.matchAll(/https?:\/\/[^"'\s]+?\/(?:FeatureServer|MapServer)(?:\/\d+)?/g)) out.push({ url: m[0], title: info.title, from: id });
  for (const m of new Set([...data.matchAll(/"itemId"\s*:\s*"([0-9a-f]{32})"/g)].map(m => m[1]))) out.push(...await layersFromItem(m, seen, depth + 1));
  return out;
}
await step("summer", async () => {
  let cands = await layersFromItem(EXPERIENCE);
  const yr = new Date().getUTCFullYear();
  if (!cands.length) {
    for (const y of [yr, yr - 1]) {
      const p = new URLSearchParams({ q: `"summer meal" ${y} type:"Feature Service"`, num: "50", f: "json" });
      const s = await json(`${AGO}/search?${p}`).catch(() => ({}));
      for (const r of s.results || []) if (/summer/i.test(r.title) && /meal|site|sfsp|sso/i.test(r.title)) cands.push({ url: r.url, title: r.title, modified: r.modified, owner: r.owner });
    }
  }
  const urls = [...new Map(cands.filter(c => c.url).map(c => [c.url.replace(/\/\d+$/, ""), c])).values()];
  report.summer_candidates = urls.map(c => `${c.title} | ${c.url} | ${c.owner || c.from || ""}`);
  log("summer candidates", JSON.stringify(report.summer_candidates, null, 1));
  // read every point layer of every candidate service; keep the one with the most rows
  let best = null;
  for (const c of urls) {
    const svc = c.url.replace(/\/\d+$/, "");
    const meta = await json(`${svc}?f=json`).catch(() => null);
    for (const L of meta?.layers || []) {
      const lm = await json(`${svc}/${L.id}?f=json`).catch(() => null);
      if (!lm || lm.geometryType !== "esriGeometryPoint") continue;
      const cnt = await json(`${svc}/${L.id}/query?where=1%3D1&returnCountOnly=true&f=json`).catch(() => ({}));
      log(`layer ${svc}/${L.id} "${lm.name}" rows ${cnt.count}`);
      if ((cnt.count || 0) > (best?.count || 0)) best = { url: `${svc}/${L.id}`, name: lm.name, count: cnt.count, fields: lm.fields.map(f => f.name), edited: lm.editingInfo?.lastEditDate };
    }
  }
  if (!best) { report.summer = "no layer found (off season?)"; await save("summer.json", { layer: null, features: [] }); return; }
  const feats = [];
  for (let off = 0; off < 200000; off += 2000) {
    const p = new URLSearchParams({ where: "1=1", outFields: "*", outSR: "4326", f: "json", resultOffset: off, resultRecordCount: 2000, returnGeometry: "true" });
    const j = await json(`${best.url}/query?${p}`);
    if (j.error) throw new Error(JSON.stringify(j.error));
    feats.push(...(j.features || []));
    if (!j.exceededTransferLimit && (j.features || []).length < 2000) break;
  }
  report.summer_layer = best.url; report.summer_n = feats.length; report.summer_fields = best.fields;
  await save("summer.json", { layer: best, fetched: new Date().toISOString(), features: feats });
});

await save("report.json", { fetched: new Date().toISOString(), ...report });
log(JSON.stringify(report, null, 1));
// the OSM layers are the core of this build; summer meals are seasonal and may be absent
if (["gardens", "giveboxes", "bakeries"].every(k => report[k] !== "ok")) process.exit(1);
