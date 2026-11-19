// Downloads the food bank pantry lists in pantry-sources.mjs into <outDir>/pantries/<id>.json,
// plus Feeding America's food bank list (names, main phone numbers, counties served).
// Runs on GitHub Actions only (the phone never calls any of these).
// Each list is read the way the food bank's own public map reads it, after checking robots.txt.
// Usage: node fetch-pantries.mjs <outDir> [id,id,...]
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SOURCES } from "./pantry-sources.mjs";

const out = process.argv[2] || "raw-us";
const only = process.argv[3] ? process.argv[3].split(",") : null;
await mkdir(join(out, "pantries"), { recursive: true });
const UA = "PlentyMapDataBot/1.0 (free food-help app; weekly US build; https://plentymap.com)";
const log = (...a) => console.log("[pantries]", ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, opts = {}) {
  const { timeout = 60000, tries = 3, ...o } = opts;
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { redirect: "follow", ...o, headers: { "User-Agent": UA, Accept: "application/json, text/html, */*", ...(o.headers || {}) }, signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { url: r.url, text: await r.text() };
    } catch (e) {
      if (i >= tries || /HTTP 4\d\d/.test(e.message)) throw e;
      await sleep(4000 * i);
    }
  }
}

// ---- robots.txt (longest matching rule wins, Allow beats Disallow on a tie; "*" and "$" supported) ----
const robots = new Map();
async function allowed(u) {
  const x = new URL(u);
  if (!robots.has(x.origin)) {
    let groups = [];
    try {
      const t = (await get(x.origin + "/robots.txt", { tries: 1, timeout: 20000 })).text;
      if (!/<html/i.test(t.slice(0, 300))) {
        let cur = null, lastWasAgent = false;
        for (const raw of t.split(/\r?\n/)) {
          const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
          const i = line.indexOf(":"); if (i < 0) continue;
          const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
          if (k === "user-agent") { if (!lastWasAgent) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastWasAgent = true; }
          else { lastWasAgent = false; if (cur && (k === "allow" || k === "disallow")) cur.rules.push([k === "allow", v]); }
        }
      }
    } catch { groups = []; }   // no robots.txt: everything allowed
    const mine = groups.filter(g => g.agents.some(a => a.includes("plentymap")));
    robots.set(x.origin, (mine.length ? mine : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules));
  }
  const path = x.pathname + x.search;
  let best = null;
  for (const [allow, pat] of robots.get(x.origin)) {
    if (!pat) continue;
    const rx = new RegExp("^" + pat.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (rx.test(path) && (!best || pat.length > best[1].length || (pat.length === best[1].length && allow))) best = [allow, pat];
  }
  return !best || best[0];
}
async function fetchOk(u, opts) {
  if (!(await allowed(u))) throw new Error("robots.txt disallows " + new URL(u).pathname);
  return get(u, opts);
}
const decode = s => s.replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/\\\//g, "/");

// ---- platform readers: each returns the raw list exactly as the food bank's map receives it ----
const PLATFORMS = {
  async storepoint(src, html) {
    const id = (html.match(/storepoint\.co\/api\/v\d\/js\/([0-9a-f]+)\.js/) || html.match(/data-map-id=["']([0-9a-f]+)["']/) || [])[1];
    if (!id) throw new Error("no Storepoint map id on the page");
    // the map's own script names its API host (api.storepoint.co or a numbered one like api26.storepoint.co)
    const hosts = [...new Set([...html.matchAll(/(api\d*)\.storepoint\.co/g)].map(m => m[1]).concat(["api", "api26"]))];
    const tries = hosts.flatMap(h => [`https://${h}.storepoint.co/v1/${id}/locations`, `https://${h}.storepoint.co/v2/${id}/locations`]);
    for (const u of tries) {
      try { const j = JSON.parse((await fetchOk(u)).text); if (j?.results?.locations?.length) return { endpoint: u, data: j }; } catch (e) { log(src.id, u, e.message); }
    }
    throw new Error(`Storepoint returned no locations (map ${id})`);
  },
  async wpsl(src, html) {
    const ajax = decode((html.match(/"ajaxurl":"([^"]+)"/) || [])[1] || new URL("/wp-admin/admin-ajax.php", src.page).href);
    const lat = +(html.match(/"startLatlng":"([-\d.]+),/) || [])[1] || 0, lng = +(html.match(/"startLatlng":"[-\d.]+,([-\d.]+)"/) || [])[1] || 0;
    const u = `${ajax}?${new URLSearchParams({ action: "store_search", lat, lng, max_results: 5000, search_radius: 5000, autoload: 1 })}`;
    const data = JSON.parse((await fetchOk(u)).text);
    if (!Array.isArray(data)) throw new Error("unexpected WPSL reply");
    return { endpoint: u.split("?")[0] + "?action=store_search", data };
  },
  async slp(src, html) {
    const ajax = decode((html.match(/"ajaxurl":"([^"]+)"/) || [])[1] || new URL("/wp-admin/admin-ajax.php", src.page).href);
    const lat = +(html.match(/"map_center_lat":"?([-\d.]+)/) || [])[1] || 0, lng = +(html.match(/"map_center_lng":"?([-\d.]+)/) || [])[1] || 0;
    const body = new URLSearchParams({ action: "csl_ajax_onload", lat, lng, "options[initial_results_returned]": 5000, "options[radius]": 5000 });
    if (!(await allowed(ajax))) throw new Error("robots.txt disallows " + new URL(ajax).pathname);
    const r = await get(ajax, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const j = JSON.parse(r.text);
    if (!Array.isArray(j?.response)) throw new Error("unexpected SLP reply");
    return { endpoint: ajax + " (csl_ajax_onload)", data: j.response };
  },
  async agile(src, html) {
    const cfg = html.match(/ASL_REMOTE\s*=\s*(\{[^;]+\})/);
    const remote = cfg ? JSON.parse(cfg[1]) : {};
    const ajax = decode(remote.ajax_url || new URL("/wp-admin/admin-ajax.php", src.page).href);
    const u = `${ajax}?${new URLSearchParams({ action: "asl_load_stores", nonce: remote.nonce || "", load_all: 1, layout: 1 })}`;
    const data = JSON.parse((await fetchOk(u)).text);
    if (!Array.isArray(data)) throw new Error("unexpected Agile Store Locator reply");
    return { endpoint: ajax + "?action=asl_load_stores", data };
  },
  async storerocket(src, html) {
    const id = (html.match(/data-storerocket-id=["']([^"']+)["']/) || html.match(/storerocket-id=["']([^"']+)["']/) || html.match(/projectId["']?\s*[:=]\s*["']([A-Za-z0-9]+)["']/) || [])[1];
    if (!id) throw new Error("no StoreRocket id on the page");
    const u = `https://storerocket.io/api/user/${id}/locations`;
    const data = JSON.parse((await fetchOk(u)).text);
    return { endpoint: u, data };
  },
  async mymaps(src, html) {
    const mids = [...new Set([...html.matchAll(/maps\/d\/(?:u\/\d\/)?(?:embed|viewer)\?mid=([A-Za-z0-9_-]+)/g)].map(m => m[1]))];
    if (!mids.length) throw new Error("no Google My Maps id on the page");
    const kml = [];
    for (const mid of mids) { const u = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`; kml.push({ mid, kml: (await fetchOk(u)).text }); await sleep(1000); }
    return { endpoint: "https://www.google.com/maps/d/kml", data: kml };
  },
};

// ---- Feeding America food bank list (name, main phone, website, counties served) ----
const report = { fetched: new Date().toISOString(), sources: {} };
try {
  const fa = JSON.parse((await fetchOk("https://www.feedingamerica.org/ws-api/GetAllOrganizations", { timeout: 120000 })).text);
  const banks = (fa.Organization || []).map(o => ({ id: o.OrganizationID, name: o.FullName, phone: o.Phone, url: o.URL, st: o.MailAddress?.State,
    counties: [...new Set(JSON.stringify(o.ListFipsCounty || {}).match(/"FipsCode":"\d{5}"/g) || [])].map(s => s.slice(-6, -1)) }));
  await writeFile(join(out, "pantries", "_feedingamerica.json"), JSON.stringify(banks));
  report.feedingamerica = banks.length;
} catch (e) { report.feedingamerica = "failed: " + e.message; log("Feeding America list:", e.message); }

for (const src of SOURCES) {
  if (only && !only.includes(src.id)) continue;
  try {
    if (!(await allowed(src.page))) throw new Error("robots.txt disallows the find-food page");
    const page = await get(src.page);
    const { endpoint, data } = await PLATFORMS[src.platform](src, page.text);
    const n = Array.isArray(data) ? data.length : data?.results?.locations?.length ?? data?.results?.length ?? data?.length ?? 0;
    await writeFile(join(out, "pantries", src.id + ".json"), JSON.stringify({ id: src.id, fetched: report.fetched, page: src.page, endpoint, data }));
    report.sources[src.id] = { ok: true, n, endpoint };
    log(src.id, src.platform, "ok", n);
  } catch (e) {
    report.sources[src.id] = { ok: false, error: e.message };
    log(src.id, src.platform, "FAILED", e.message);
  }
  await sleep(2000);
}
await writeFile(join(out, "pantries", "_report.json"), JSON.stringify(report, null, 1));
const ok = Object.values(report.sources).filter(s => s.ok).length;
log(`${ok} of ${Object.keys(report.sources).length} food bank lists fetched`);
