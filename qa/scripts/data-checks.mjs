// Checks the food listings themselves: shape, places on the map, duplicates, phone and web formats,
// how fresh each source is, sudden drops in counts (a half-finished download), and a sample checked against the source.
//
// Usage: node scripts/data-checks.mjs --region <dir with san-diego.json> --us <dir with index.json, cells/>
//          [--sd-raw <data branch raw/>] [--us-raw <usdata branch raw/>] [--tiles <data branch tiles/>]
//          [--history <history.json, read and updated>] [--online]   (--online: fetch source pages and websites)
// Writes results/data-problems.json ({meta, problems}) for scripts/triage.mjs, and prints a summary.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const arg = (k, d = null) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const ONLINE = process.argv.includes("--online");
const here = new URL("..", import.meta.url).pathname;
const read = f => (f && existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const problems = [];
const add = (check, scope, sel, detail) => problems.push({ check, screen: "data:" + scope, sel: String(sel || ""), detail: String(detail).slice(0, 300) });
const stats = {};
const now = Date.now();
const hours = iso => (now - Date.parse(iso)) / 36e5;

const KINDS_SITE = new Set(["pantry", "senior", "meal", "fridge", "garden", "shelter", "kids", "foodbank", "other"]);
const KINDS_STORE = new Set(["store", "market", "rmp"]);
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(the|inc|llc|church|of|and)\b/g, "").replace(/[^a-z0-9]+/g, "");
const km = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const phoneOk = p => { const d = String(p).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 && /^[2-9]\d{2}[2-9]/.test(d); };
const urlOk = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes(".") && !/localhost|example\.com/.test(x.hostname); } catch { return false; } };

// ---------- one list of places, wherever it came from ----------
function checkPlaces(scope, sites, stores, zips, { bbox, cellKey, srcKeys } = {}) {
  const ids = new Map();
  const seenAt = new Map(); // grid -> [{id, n, lat, lon}]
  let phoneBad = 0, urlBad = 0, far = 0, noHours = 0;
  for (const [list, kinds, isSite] of [[sites, KINDS_SITE, true], [stores, KINDS_STORE, false]]) for (const s of list || []) {
    const where = s.id || s.n;
    if (!s.id || typeof s.id !== "string") add("data-schema", scope, where, "missing id");
    else if (ids.has(s.id)) add("data-duplicate", scope, s.id, `id appears twice (${ids.get(s.id)} and ${s.n})`);
    else ids.set(s.id, s.n);
    if (!kinds.has(s.k)) add("data-schema", scope, where, `unknown kind "${s.k}"`);
    if (!s.n || !String(s.n).trim()) add("data-schema", scope, where, "no name");
    if (typeof s.lat !== "number" || typeof s.lon !== "number" || !isFinite(s.lat) || !isFinite(s.lon)) { add("data-schema", scope, where, `bad coordinates ${s.lat},${s.lon}`); continue; }
    if (s.lat < 17 || s.lat > 72 || s.lon < -180 || s.lon > -64) add("data-coords", scope, where, `${s.lat},${s.lon} is outside the U.S. (lat/lon swapped or wrong sign?)`);
    if (bbox && (s.lon < bbox[0] || s.lat < bbox[1] || s.lon > bbox[2] || s.lat > bbox[3])) add("data-coords", scope, where, `${s.n}: ${s.lat},${s.lon} is outside this region's box`);
    if (cellKey && cellKey !== `${Math.floor(s.lat * 2)}_${Math.floor(s.lon * 2)}`) add("data-coords", scope, where, `${s.n} is filed in map cell ${cellKey} but sits in ${Math.floor(s.lat * 2)}_${Math.floor(s.lon * 2)}`);
    if (s.z && !/^\d{5}$/.test(s.z)) add("data-format", scope, where, `ZIP "${s.z}" isn't 5 digits`);
    const zc = s.z && (zips[s.z] || ALLZIPS.get(s.z));
    if (zc) {
      const d = km(s.lat, s.lon, zc[0], zc[1]);
      // a ZIP is rarely more than ~40 km across outside Alaska and the rural West
      if (d > 80) { far++; add("data-coords", scope, where, `${s.n} (${s.a || ""}, ${s.z}) is ${Math.round(d)} km from the middle of ZIP ${s.z}${zc[3] ? " in " + zc[3] : ""}`); }
      if (s.st && zc[3] && s.st !== zc[3]) add("data-coords", scope, where, `${s.n} says ${s.st} but ZIP ${s.z} is in ${zc[3]}`);
    }
    if (s.ph && !phoneOk(s.ph)) { phoneBad++; add("data-format", scope, where, `phone "${s.ph}" isn't a dialable U.S. number`); }
    if (s.w && !urlOk(s.w)) { urlBad++; add("data-format", scope, where, `website "${s.w}" isn't a valid web address`); }
    if (isSite) {
      if (!Array.isArray(s.d) || !s.d.length) add("data-schema", scope, where, "free food site with no details");
      for (const d of s.d || []) {
        if (srcKeys && d.src && !srcKeys.has(d.src)) add("data-schema", scope, where, `source "${d.src}" isn't listed in sources`);
        const hasRules = d.sc && ((d.sc.rules || []).length || (d.sc.once || []).length);
        if (d.when && !hasRules && d.conf !== "call") noHours++;
      }
    }
    // duplicates: same name within ~150 m
    const g = `${Math.round(s.lat * 100)}_${Math.round(s.lon * 100)}`, nm = fold(s.n);
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      const k = `${Math.round(s.lat * 100) + dx}_${Math.round(s.lon * 100) + dy}`;
      for (const o of seenAt.get(k) || []) if (o.k === s.k && o.nm === nm && nm.length > 3 && km(s.lat, s.lon, o.lat, o.lon) < 0.15) add("data-duplicate", scope, where, `"${s.n}" looks like a duplicate of ${o.id} (${Math.round(km(s.lat, s.lon, o.lat, o.lon) * 1000)} m apart)`);
    }
    (seenAt.get(g) || seenAt.set(g, []).get(g)).push({ id: s.id, k: s.k, nm, lat: s.lat, lon: s.lon });
  }
  return { phoneBad, urlBad, far, noHours };
}

// ---------- San Diego region ----------
const ALLZIPS = new Map();
const regionDir = arg("region", here + "../data/regions");
const R = read(join(regionDir, "san-diego.json"));
const counts = { at: new Date().toISOString().slice(0, 10), sd: {}, us: {} };
if (!R) add("data-missing", "san-diego", "", `no san-diego.json in ${regionDir}`);
else {
  for (const [z, v] of Object.entries(R.zips || {})) ALLZIPS.set(z, v);
  const h = hours(R.built);
  if (h > 36) add("data-stale", "san-diego", "built", `San Diego listings were last built ${Math.round(h)} hours ago (nightly job should keep this under 36)`);
  const srcKeys = new Set(Object.keys(R.sources || {}));
  const r = checkPlaces("san-diego", R.sites, R.stores, R.zips || {}, { bbox: R.bbox, srcKeys });
  stats.sd = { sites: R.sites.length, stores: R.stores.length, ...r, built: R.built };
  if (r.noHours) add("data-hours", "san-diego", "", `${r.noHours} free food schedules couldn't be read into days and times (people will only see the raw text)`);
  for (const s of R.sites) for (const d of s.d) counts.sd["src:" + d.src] = (counts.sd["src:" + d.src] || 0) + 1;
  for (const s of [...R.sites, ...R.stores]) counts.sd["kind:" + s.k] = (counts.sd["kind:" + s.k] || 0) + 1;
  for (const [k, u] of Object.entries(R.sources || {})) if (!urlOk(u.url)) add("data-format", "san-diego", "source:" + k, `source link "${u.url}" isn't valid`);
}

// ---------- nationwide packs ----------
const usDir = arg("us");
const US = usDir && read(join(usDir, "index.json"));
if (usDir && !US) add("data-missing", "us", "", `no us/index.json in ${usDir}`);
if (US) {
  const h = hours(US.built);
  if (h > 24 * 8) add("data-stale", "us", "built", `Nationwide listings were last built ${Math.round(h / 24)} days ago (weekly job should keep this under 8)`);
  const files = readdirSync(join(usDir, "cells")).filter(f => f.endsWith(".json"));
  const cells = files.map(f => read(join(usDir, "cells", f)));
  for (const c of cells) for (const [z, v] of Object.entries(c.zips || {})) ALLZIPS.set(z, v);
  let nSites = 0, nStores = 0; const perState = {}, perStateSites = {}, perSrc = {};
  const agg = { phoneBad: 0, urlBad: 0, far: 0, noHours: 0 };
  for (const c of cells) {
    const listed = US.cells?.[c.c];
    if (!listed && (c.sites.length || c.stores.length)) add("data-schema", "us", c.c, "cell has listings but isn't in index.json (the app will never load it)");
    if (listed && (listed[0] !== c.sites.length || listed[1] !== c.stores.length)) add("data-schema", "us", c.c, `index.json says ${listed} but the cell has ${c.sites.length} sites, ${c.stores.length} stores`);
    const r = checkPlaces("us", c.sites, c.stores, c.zips || {}, { cellKey: c.c });
    for (const k in agg) agg[k] += r[k];
    nSites += c.sites.length; nStores += c.stores.length;
    for (const s of [...c.sites, ...c.stores]) {
      const st = s.st || (s.z && ALLZIPS.get(s.z)?.[3]) || "??";
      if (s.k === "store" || s.k === "market" || s.k === "rmp") perState[st] = (perState[st] || 0) + 1; else perStateSites[st] = (perStateSites[st] || 0) + 1;
      const src = s.d?.[0]?.src || s.id.split("-")[0];
      perSrc[src] = (perSrc[src] || 0) + 1;
    }
  }
  for (const k of Object.keys(US.cells || {})) if (!files.includes(k + ".json")) add("data-missing", "us", k, "index.json lists a cell file that doesn't exist");
  stats.us = { cells: cells.length, sites: nSites, stores: nStores, ...agg, built: US.built };
  for (const [st, n] of Object.entries(perState)) counts.us["stores:" + st] = n;
  for (const [st, n] of Object.entries(perStateSites)) counts.us["sites:" + st] = n;
  for (const [s, n] of Object.entries(perSrc)) counts.us["src:" + s] = n;
  counts.us.total_sites = nSites; counts.us.total_stores = nStores;
  // the SNAP download reports how many stores each state should have
  const rep = read(join(arg("us-raw", ""), "report.json"));
  // (the build leaves out some store types on purpose, so compare each state with the national rate, not 100%)
  if (rep?.snap_per_state) {
    const ratio = Object.entries(rep.snap_per_state).filter(([, n]) => n > 50).map(([st, n]) => [st, (perState[st] || 0) / n, n]);
    const med = ratio.map(r => r[1]).sort((a, b) => a - b)[Math.floor(ratio.length / 2)] || 0;
    for (const [st, r, n] of ratio) if (r < med * 0.6) add("data-count", "us", "state:" + st, `${st}: only ${perState[st] || 0} of ${n} USDA SNAP stores made it into the app (${Math.round(r * 100)}%, most states keep ${Math.round(med * 100)}%)`);
  }
  if (rep) for (const [k, v] of Object.entries(rep)) if (typeof v === "string" && v !== "ok" && !/^\d{4}-/.test(v)) add("data-source", "us", "source:" + k, `nationwide source "${k}" reported: ${v}`);
}
// raw source status for San Diego
const sdRep = read(join(arg("sd-raw", ""), "report.json"));
if (sdRep) {
  for (const [k, v] of Object.entries(sdRep)) if (typeof v === "string" && v !== "ok" && !/^\d{4}-/.test(v) && k !== "fetched") add("data-source", "san-diego", "source:" + k, `San Diego source "${k}" reported: ${v}`);
  if (hours(sdRep.fetched) > 36) add("data-stale", "san-diego", "fetched", `San Diego sources last fetched ${Math.round(hours(sdRep.fetched))} hours ago`);
}
const tiles = read(join(arg("tiles", ""), "info.json"));
if (tiles && hours(tiles.built) > 24 * 45) add("data-stale", "tiles", "built", `Map tiles are ${Math.round(hours(tiles.built) / 24)} days old (monthly refresh expected)`);

// ---------- sudden drops since last time ----------
const histFile = arg("history");
const hist = read(histFile) || { runs: [] };
const prev = hist.runs[hist.runs.length - 1];
if (prev) for (const scope of ["sd", "us"]) for (const [k, n] of Object.entries(prev[scope] || {})) {
  const cur = counts[scope][k] || 0;
  if (scope === "us" && !US) continue; if (scope === "sd" && !R) continue;
  if (n >= 20 && cur < n * 0.85) add("data-count", scope === "sd" ? "san-diego" : "us", k, `${k} dropped from ${n} to ${cur} since ${prev.at} (${Math.round((1 - cur / n) * 100)}% fewer): a source may have only partly downloaded`);
}
hist.runs.push(counts); hist.runs = hist.runs.slice(-60);
if (histFile) writeFileSync(histFile, JSON.stringify(hist));

// ---------- online: source pages alive, and a sample checked against the source ----------
async function get(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Mozilla/5.0 (compatible; PlentyMapDataCheck/1.0; +https://plentymap.com/support/)" } });
      if (r.ok || method === "GET") return { status: r.status, text: method === "GET" && r.ok ? await r.text().catch(() => "") : "" };
    } catch (e) { if (method === "GET") return { status: 0, err: String(e.cause?.code || e.message) }; }
  }
}
if (ONLINE) {
  const srcs = { ...(R?.sources || {}), ...(US?.sources || {}) };
  for (const [k, s] of Object.entries(srcs)) {
    const r = await get(s.url);
    if (!r.status || r.status >= 400) add("data-source-link", "sources", k, `${s.name}: ${s.url} answered ${r.status || r.err}`);
  }
  // sample of listing websites: alive, and the page mentions the place (name or street number)
  const pool = [...(R?.sites || [])].filter(s => s.w);
  const sample = pool.sort(() => Math.random() - 0.5).slice(0, 25);
  let checked = 0, mismatch = 0;
  for (const s of sample) {
    const r = await get(s.w); checked++;
    if (!r.status || (r.status >= 400 && ![401, 403, 429].includes(r.status))) { add("data-dead-link", "san-diego", s.id, `${s.n}: website ${s.w} answered ${r.status || r.err}`); continue; }
    if (r.text) {
      const t = fold(r.text.replace(/<[^>]+>/g, " "));
      const num = (s.a || "").match(/^\d+/)?.[0];
      const words = fold(s.n).slice(0, 12);
      if (words.length > 5 && !t.includes(words) && !(num && r.text.includes(num))) { mismatch++; add("data-spotcheck", "san-diego", s.id, `${s.n}: its website ${s.w} doesn't mention the name or street number; check it's the right page`); }
    }
  }
  // the built listings must match what the food banks publish right now (name, address, place)
  const live = [
    ["sdfb", "https://api.storepoint.co/v1/16597334723364/locations"],
    ["fsd", "https://api26.storepoint.co/v2/16765f3e46d5c1/locations"],
  ];
  for (const [src, url] of live) {
    try {
      const j = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).json();
      const locs = j?.results?.locations || [];
      const byId = new Map(locs.map(l => [String(l.id), l]));
      const mine = (R?.sites || []).filter(s => s.id.startsWith(src + "-"));
      if (locs.length && mine.length < locs.length * 0.8) add("data-count", "san-diego", "src:" + src, `${src} publishes ${locs.length} locations; the app has ${mine.length}`);
      for (const s of mine.sort(() => Math.random() - 0.5).slice(0, 15)) {
        const l = byId.get(s.id.split("-").slice(1).join("-"));
        if (!l) { add("data-spotcheck", "san-diego", s.id, `${s.n} is no longer on the ${src} list (closed or moved?)`); continue; }
        if (fold(l.name) !== fold(s.n) && !fold(l.name).includes(fold(s.n).slice(0, 8))) add("data-spotcheck", "san-diego", s.id, `name differs: app "${s.n}", ${src} "${l.name}"`);
        const d = km(s.lat, s.lon, +l.loc_lat, +l.loc_long);
        if (d > 0.3) add("data-spotcheck", "san-diego", s.id, `${s.n}: the app's pin is ${Math.round(d * 1000)} m from where ${src} puts it`);
        const num = (s.a || "").match(/^\d+/)?.[0];
        if (num && !String(l.streetaddress || "").includes(num)) add("data-spotcheck", "san-diego", s.id, `${s.n}: address differs: app "${s.a}", ${src} "${l.streetaddress}"`);
      }
    } catch (e) { add("data-source-link", "sources", src, `couldn't read the ${src} list: ${e.message}`); }
  }
  stats.online = { websitesChecked: checked, websiteMismatch: mismatch };
  // no network at all (a sandbox, an outage on our side): don't blame the food banks
  const net = problems.filter(p => /ENOTFOUND|EAI_AGAIN|fetch failed|ECONNREFUSED/.test(p.detail));
  const online = problems.filter(p => ["data-source-link", "data-dead-link", "data-spotcheck"].includes(p.check));
  if (online.length && net.length === online.length) {
    for (const p of net) problems.splice(problems.indexOf(p), 1);
    console.log("::warning::no outside network: online checks skipped");
    stats.online.skipped = "no network";
  }
}

mkdirSync(here + "results", { recursive: true });
writeFileSync(here + "results/data-problems.json", JSON.stringify({ meta: { suite: "data" }, problems, stats }));
console.log(JSON.stringify(stats, null, 1));
const by = {}; for (const p of problems) by[p.check] = (by[p.check] || 0) + 1;
console.log("problems:", by);
