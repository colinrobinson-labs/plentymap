// Research only (not part of the app build): looks at candidate national pantry sources and at
// each Feeding America food bank's "find food" page to see which locator platform it uses.
// Reads robots.txt first and skips any path it disallows. Usage: node probe.mjs <outDir>
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = process.argv[2] || "probe";
await mkdir(out, { recursive: true });
const UA = "PlentyMapDataBot/1.0 (free food-help app; source research; hello@plentymap.com)";
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const log = (...a) => console.log("[probe]", ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (n, d) => { await writeFile(join(out, n), typeof d === "string" ? d : JSON.stringify(d, null, 1)); log("saved", n); };
async function get(url, { ua = UA, timeout = 30000, ...o } = {}) {
  const r = await fetch(url, { ...o, redirect: "follow", headers: { "User-Agent": ua, Accept: "*/*", ...(o.headers || {}) }, signal: AbortSignal.timeout(timeout) });
  return { status: r.status, url: r.url, type: r.headers.get("content-type") || "", text: await r.text() };
}
const tryGet = async (url, o) => { try { return await get(url, o); } catch (e) { return { status: 0, url, type: "", text: "", err: e.message }; } };

// ---------- robots.txt ----------
const robotsCache = new Map();
async function allowed(u) {
  const x = new URL(u);
  if (!robotsCache.has(x.origin)) {
    const r = await tryGet(x.origin + "/robots.txt", { timeout: 15000 });
    const rules = [];
    if (r.status === 200 && !/<html/i.test(r.text.slice(0, 200))) {
      let mine = false, any = false;
      for (const line of r.text.split(/\r?\n/)) {
        const [k, ...v] = line.split(":"); const val = v.join(":").trim(); const key = (k || "").trim().toLowerCase();
        if (key === "user-agent") { mine = val === "*" || /plentymap/i.test(val); any = true; }
        else if (mine && key === "disallow" && val) rules.push(val);
      }
    }
    robotsCache.set(x.origin, rules);
  }
  const path = x.pathname + x.search;
  return !robotsCache.get(x.origin).some(rule => path.startsWith(rule.replace(/\*.*$/, "")));
}

// ---------- 1. Feed America (feedam.org) open data ----------
{
  const F = "https://feedam.org";
  const res = {};
  for (const p of ["/robots.txt", "/policies", "/api/stats", "/api/resources/types", "/api/v1/types.json", "/atlas.json",
    "/api/resources/bulk?state=VT&type=food_pantry&limit=1000&page=1&format=json",
    "/api/resources/bulk?state=TX&type=food_pantry&limit=1000&page=1&format=json",
    "/api/resources/bulk?state=VT&type=food_pantry&limit=5&page=1&format=csv",
    "/hsds/v3/", "/.well-known/openapi.json", "/about.json", "/data", "/license", "/terms"]) {
    const r = await tryGet(F + p, { timeout: 60000 });
    res[p] = { status: r.status, type: r.type, bytes: r.text.length };
    await save("feedam_" + p.replace(/[^a-z0-9]+/gi, "_").slice(0, 80) + (/json/.test(r.type) ? ".json" : ".txt"), r.text.slice(0, 3_000_000));
    await sleep(1500);
  }
  await save("feedam_index.json", res);
}

// ---------- 2. Feeding America food bank list ----------
let banks = [];
{
  const page = await tryGet("https://www.feedingamerica.org/find-your-local-foodbank", { ua: BROWSER });
  await save("fa_find.html", page.text);
  await save("fa_robots.txt", (await tryGet("https://www.feedingamerica.org/robots.txt")).text);
  const hints = [...new Set(page.text.match(/(ws-api|\/api\/)[A-Za-z0-9_\/.?=&-]*/g) || [])];
  await save("fa_hints.json", hints);
  const cands = ["https://www.feedingamerica.org/ws-api/GetAllOrganizations", ...hints.filter(h => h.startsWith("ws-api")).map(h => "https://www.feedingamerica.org/" + h)];
  for (const u of cands) {
    const r = await tryGet(u, { ua: BROWSER, headers: { Accept: "application/json, text/xml, */*" } });
    log("fa", u, r.status, r.type, r.text.length);
    if (r.status === 200 && r.text.length > 20000) { await save("fa_orgs" + (/json/.test(r.type) ? ".json" : ".xml"), r.text); break; }
    await sleep(1000);
  }
  // pull name + website pairs out of whatever shape came back (JSON or XML)
  const { readFile } = await import("node:fs/promises");
  let txt = "";
  try { txt = await readFile(join(out, "fa_orgs.json"), "utf8"); } catch { try { txt = await readFile(join(out, "fa_orgs.xml"), "utf8"); } catch { } }
  if (txt.trim().startsWith("{") || txt.trim().startsWith("[")) {
    const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") {
      const keys = Object.keys(o); const url = keys.find(k => /^(url|website|web_?site|org_?url|homepage)$/i.test(k)); const name = keys.find(k => /^(full_?name|name|org_?name|organization_?name)$/i.test(k));
      if (url && name && typeof o[url] === "string" && /\./.test(o[url])) banks.push({ name: o[name], url: o[url], st: o.State || o.state || o.MailAddress?.State || "" });
      Object.values(o).forEach(walk); } };
    walk(JSON.parse(txt));
  } else if (txt) {
    for (const m of txt.matchAll(/<Organization>([\s\S]*?)<\/Organization>/g)) {
      const g = t => (m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`, "i")) || [])[1] || "";
      const url = g("URL") || g("Website"); if (url) banks.push({ name: g("FullName") || g("Name"), url, st: g("State") });
    }
  }
  log("food banks found:", banks.length);
}

// ---------- 3. Each food bank's find-food page: which platform powers it ----------
const SIG = {
  vivery: /vivery|accessfood|pantrynet|pantrytrac/i,
  storepoint: /storepoint\.co/i,
  link2feed: /link2feed/i,
  arcgis: /arcgis\.com|arcgis\/rest|experience\.arcgis/i,
  mymaps: /google\.com\/maps\/d\//i,
  freshtrak: /freshtrak/i,
  findhelp: /findhelp\.org|auntbertha/i,
  foodfinder: /foodfinder\.us|foodfinder\.org/i,
  wpsl: /wpsl[-_]|wp-store-locator/i,
  slp: /store-locator-le|storelocatorplus|\bslp_/i,
  agile: /agile-store-locator|asl_configs/i,
  storerocket: /storerocket/i,
  oasis: /oasisinsight/i,
  pantrysoft: /pantrysoft/i,
  mapme: /mapme\.com/i,
  zeemaps: /zeemaps/i,
  batchgeo: /batchgeo/i,
  airtable: /airtable\.com/i,
  google_sheets: /docs\.google\.com\/spreadsheets/i,
  elfsight: /elfsight/i,
  plentiful: /plentifulapp|plentiful\.org/i,
  two11: /211[a-z]*\.(org|com)|\b211\b.*(search|resource)/i,
  amplehvst: /ampleharvest/i,
  mealconnect: /mealconnect/i,
  carto: /carto\.com/i,
  mapbox: /api\.mapbox\.com/i,
  leaflet: /leaflet(\.min)?\.js/i,
  gmapsjs: /maps\.googleapis\.com\/maps\/api\/js/i,
  storemapper: /storemapper/i,
  powerbi: /powerbi\.com/i,
  tableau: /tableau/i,
  pdf_list: /href="[^"]+\.pdf"[^>]*>[^<]*(pantr|agenc|distribution|site|schedule)/i,
};
const FINDLINK = /href="([^"#]+)"[^>]*>([^<]{0,80})/gi;
const FINDWORDS = /(find|get|need|locate)[\s-]*(food|help|a pantry|pantry|meal)|food[\s-]*(finder|locator|map)|pantry[\s-]*(locator|finder|map|list)|partner[\s-]*agenc|agency[\s-]*locator|distribution[\s-]*(site|schedule|map)/i;
function detect(html) { return Object.entries(SIG).filter(([, rx]) => rx.test(html)).map(([k]) => k); }
const rows = [];
const norm = u => /^https?:/i.test(u) ? u : "https://" + u.replace(/^\/+/, "");
for (const b of banks) {
  const row = { name: b.name, st: b.st, site: b.url, status: "", find: "", plat: [], iframes: [], note: "" };
  try {
    const home = norm(b.url);
    if (!(await allowed(home))) { row.note = "robots blocks home"; rows.push(row); continue; }
    const h = await tryGet(home, { ua: BROWSER, timeout: 25000 });
    row.status = h.status;
    const links = [];
    for (const m of h.text.matchAll(FINDLINK)) if (FINDWORDS.test(m[2] + " " + m[1])) { try { links.push(new URL(m[1], h.url || home).href); } catch { } }
    const pages = [...new Set(links)].filter(u => /^https?:/.test(u)).slice(0, 3);
    const seen = [h.text];
    for (const u of pages) {
      if (!(await allowed(u))) { row.note += " robots:" + u; continue; }
      const r = await tryGet(u, { ua: BROWSER, timeout: 25000 });
      seen.push(r.text);
      // iframes and script sources often name the platform when the page itself does not
      for (const m of r.text.matchAll(/<iframe[^>]+src="([^"]+)"/gi)) row.iframes.push(m[1].slice(0, 160));
      await sleep(800);
    }
    row.find = pages.join(" ");
    row.plat = detect(seen.join("\n"));
  } catch (e) { row.note += " " + e.message; }
  rows.push(row);
  log(row.st, row.name, row.status, row.plat.join(","));
  await sleep(600);
}
await save("banks.json", rows);
const tsv = ["state\tname\tsite\tstatus\tplatforms\tfind_pages\tiframes\tnote", ...rows.map(r => [r.st, r.name, r.site, r.status, r.plat.join(","), r.find, r.iframes.join(" "), r.note.trim()].join("\t"))].join("\n");
await save("banks.tsv", tsv);
const tally = {};
for (const r of rows) for (const p of r.plat) tally[p] = (tally[p] || 0) + 1;
await save("tally.json", tally);
log("tally", JSON.stringify(tally));
