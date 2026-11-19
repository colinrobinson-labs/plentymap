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
// read in boxes and merged. A box that fails on every server fails the whole layer, and the job then
// stops before saving, so last week's layers stay up instead of a half-empty map.
const EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
// [south, west, north, east]: the lower 48 in 4 x 3 boxes, then Alaska, Hawaii, Puerto Rico + USVI
const BOXES = [];
for (const [s, n] of [[24.4, 33], [33, 40], [40, 49.5]]) for (const [w, e] of [[-125, -110], [-110, -97], [-97, -84], [-84, -66.8]]) BOXES.push([s, w, n, e]);
BOXES.push([51, -180, 71.5, -129], [18.8, -160.5, 22.4, -154.7], [17.6, -67.4, 18.6, -64.5]);
async function overpass(name, body, min) {
  const seen = new Map();
  for (const b of BOXES) {
    const q = `[out:json][timeout:300][bbox:${b.join(",")}];\n(\n${body}\n);\nout center tags meta;`;
    let ok = false, last;
    for (const ep of EPS) {
      try {
        const j = await json(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 360000 }, 2);
        if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark.slice(0, 120));
        for (const e of j.elements || []) seen.set(e.type + e.id, e);
        ok = true; break;
      } catch (e) { last = e; log(`overpass ${name} box ${b.join(",")} ${ep}: ${e.message}`); }
    }
    if (!ok) throw new Error(`box ${b.join(",")}: ${last?.message}`);
    await new Promise(r => setTimeout(r, 2000));   // be gentle with the shared servers
  }
  const elements = [...seen.values()];
  if (elements.length < min) throw new Error(`too few elements: ${elements.length}`);
  report[name + "_n"] = elements.length;
  return save(name + ".json", { elements });
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
// all three OSM layers must succeed; summer meals are seasonal and may be absent
if (["gardens", "giveboxes", "bakeries"].some(k => report[k] !== "ok")) { log("an OpenStreetMap layer failed; keeping last week's layers"); process.exit(1); }
