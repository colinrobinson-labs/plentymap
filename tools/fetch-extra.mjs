// Downloads the public sources for the extra map layers into a raw folder. Runs on GitHub Actions only;
// the phone never calls any of these.
//   - OpenStreetMap: community gardens, little free pantries (give boxes), bakery outlet stores
//   - USDA FNS Summer Meals Site Finder (ArcGIS), when a summer season is published
// Usage: node fetch-extra.mjs <outDir>
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
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
const json = async (url, opts, tries) => (await get(url, opts, tries)).json();
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
// One nationwide query is too heavy for the public Overpass servers (they answer 502/504), so the US is
// read in boxes and merged. A box that fails on every server is split into four smaller boxes and read
// again (up to two levels). If a layer still fails, last week's copy of that layer is reused (saved on
// the extradata branch under raw/), so one slow server never blocks the other layers from publishing.
const EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
// [south, west, north, east]: the lower 48 in 4 x 3 boxes, then Alaska, Hawaii, Puerto Rico + USVI
const BOXES = [];
for (const [s, n] of [[24.4, 33], [33, 40], [40, 49.5]]) for (const [w, e] of [[-125, -110], [-110, -97], [-97, -84], [-84, -66.8]]) BOXES.push([s, w, n, e]);
BOXES.push([51, -180, 71.5, -129], [18.8, -160.5, 22.4, -154.7], [17.6, -67.4, 18.6, -64.5]);
const T0 = Date.now(), BUDGET = 75 * 60000;   // stop splitting after 75 min so the job ends in time
const quarter = ([s, w, n, e]) => { const m = r => Math.round(r * 100) / 100, y = m((s + n) / 2), x = m((w + e) / 2); return [[s, w, y, x], [s, x, y, e], [y, w, n, x], [y, x, n, e]]; };
async function readBox(name, body, b, depth, seen) {
  const q = `[out:json][timeout:170][bbox:${b.join(",")}];\n(\n${body}\n);\nout center tags meta;`;
  let last;
  for (const ep of EPS) {
    try {
      const j = await json(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 200000 }, 1);
      if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark.slice(0, 120));
      for (const e of j.elements || []) seen.set(e.type + e.id, e);
      await new Promise(r => setTimeout(r, 2000));   // be gentle with the shared servers
      return;
    } catch (e) { last = e; log(`overpass ${name} box ${b.join(",")} ${ep}: ${e.message}`); await new Promise(r => setTimeout(r, 4000)); }
  }
  if (depth >= 2 || Date.now() - T0 > BUDGET) throw new Error(`box ${b.join(",")}: ${last?.message}`);
  log(`overpass ${name}: splitting box ${b.join(",")}`);
  for (const sub of quarter(b)) await readBox(name, body, sub, depth + 1, seen);
}
const prevDir = process.env.PREV_RAW || "";
async function overpass(name, body, min) {
  try {
    const seen = new Map();
    for (const b of BOXES) await readBox(name, body, b, 0, seen);
    const elements = [...seen.values()];
    if (elements.length < min) throw new Error(`too few elements: ${elements.length}`);
    report[name + "_n"] = elements.length;
    return await save(name + ".json", { fetched: new Date().toISOString(), elements });
  } catch (e) {
    // reuse last week's copy of this layer, if there is one
    const prev = prevDir && await readFile(join(prevDir, name + ".json.gz")).then(b => JSON.parse(gunzipSync(b))).catch(() => null);
    if (!prev?.elements?.length) throw e;
    report[name] = `reused copy from ${String(prev.fetched || "last week").slice(0, 10)} (${e.message})`;
    report[name + "_n"] = prev.elements.length;
    report.stale = [...(report.stale || []), name];
    return save(name + ".json", prev);
  }
}
await step("gardens", () => overpass("gardens", `  nwr["leisure"="garden"]["garden:type"="community"];
  nwr["landuse"="allotments"]["name"];`, 1000));
await step("giveboxes", () => overpass("giveboxes", `  nwr["amenity"="give_box"];
  nwr["amenity"="food_sharing"]["name"~"pantry|blessing",i];`, 50));
await step("bakeries", () => overpass("bakeries", `  nwr["shop"]["name"~"(bread|bakery|bake shop|baking|bakeries).*(outlet|thrift|discount)|(outlet|thrift).*(bread|bakery)",i];
  nwr["shop"]["name"~"^(franz|dave's killer bread|pepperidge farm|flowers|nature's own|entenmann's|bimbo|aunt millie's|schwebel's|alpha baking|lewis bake shop|hostess|mrs\\\\. baird's|holsum|sara lee|arnold|oroweat|martin's|wonder).*(outlet|store|thrift)",i];`, 20));

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
      // a published layer beats a "(Testing)" copy of it, then the one with more rows
      const rank = c => (/test/i.test(c.url) ? 0 : 1e9) + (c.count || 0);
      const cand = { url: `${svc}/${L.id}`, count: cnt.count };
      if (cnt.count > 0 && (!best || rank(cand) > rank(best))) best = { url: `${svc}/${L.id}`, name: lm.name, count: cnt.count, fields: lm.fields.map(f => f.name), edited: lm.editingInfo?.lastEditDate };
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
// A layer that failed with no earlier copy is left out; build-extra.mjs then publishes the others.
// Only stop when every OpenStreetMap layer failed outright (likely an outage), keeping last week's build.
const osm = ["gardens", "giveboxes", "bakeries"];
if (osm.every(k => /^failed/.test(report[k] || ""))) { log("every OpenStreetMap layer failed; keeping last week's layers"); process.exit(1); }
if (osm.some(k => report[k] !== "ok")) log("some layers were reused or left out: " + osm.filter(k => report[k] !== "ok").join(", "));
