// Nightly: reads the report totals from report.plentymap.com (never the notes), checks each reported
// listing against our latest data and OpenStreetMap, and decides on its own what to do:
//   hide  - leave the listing out of the site (strong, repeated reports, or the source says it's gone)
//   flag  - keep it, with a "people reported this; call first" line
//   (none) - too few reports yet, or already fixed in the source
// Writes flags.json (read by tools/apply-flags.mjs when the site is published) and digest.md (the
// weekly summary posted as a GitHub issue: names, problems, counts and what was done; no notes).
// Usage: node check-reports.mjs <dataDir> <outDir>
//   dataDir holds: regions/san-diego.json, us/cells/*.json, extra/cells/*.json, kids.json
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

const [dataDir = "_data", outDir = "_flags"] = process.argv.slice(2);
const SUMMARY = process.env.REPORT_SUMMARY_URL || "https://report.plentymap.com/summary.json";
const UA = "PlentyMapReportCheck/1.0 (hello@plentymap.com)";
const log = (...a) => console.log("[check-reports]", ...a);
const rd = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };
await mkdir(outDir, { recursive: true });

// ---- every listing we publish, by id ----
const L = new Map();
const put = (s, from) => L.set(s.id, { n: s.n, k: s.k, c: s.c || "", st: s.st, chg: s.chg, src: s.src || s.d?.map(d => d.src) || [from], from });
const sd = await rd(join(dataDir, "regions/san-diego.json"));
for (const s of [...(sd?.sites || []), ...(sd?.stores || [])]) put(s, "san-diego");
for (const sub of ["us/cells", "extra/cells"]) {
  let files = [];
  try { files = await readdir(join(dataDir, sub)); } catch {}
  for (const f of files) { const c = await rd(join(dataDir, sub, f)); for (const s of [...(c?.sites || []), ...(c?.stores || [])]) if (!L.has(s.id)) put(s, sub); }
}
const kids = await rd(join(dataDir, "kids.json"));
for (const x of kids?.deals || []) put({ ...x, k: "kid" }, "kids");
log(`listings known: ${L.size}`);

// ---- report totals ----
let sum;
try {
  const r = await fetch(SUMMARY, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  sum = await r.json();
} catch (e) {
  // the endpoint being down must never hide or show anything by surprise: keep yesterday's flags
  log("summary unavailable:", e.message);
  process.exit(2);
}

const PARTNER = new Set(["sdfb", "fsd"]);
const osmUrl = id => { const m = id.match(/^osm-([nwr])(\d+)$/); return m ? `https://api.openstreetmap.org/api/0.6/${{ n: "node", w: "way", r: "relation" }[m[1]]}/${m[2]}.json` : null; };
async function osmGone(id) {
  const u = osmUrl(id);
  if (!u) return null;
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (r.status === 410 || r.status === 404) return "deleted in OpenStreetMap";
    if (!r.ok) return null;
    const el = (await r.json()).elements?.[0];
    const t = el?.tags || {};
    if (el?.visible === false) return "deleted in OpenStreetMap";
    if (Object.keys(t).some(k => /^(disused|abandoned|was|demolished|removed):/.test(k)) || t.shop === "vacant") return "marked closed in OpenStreetMap";
    return null;
  } catch { return null; }
}

const hide = {}, flag = {}, rows = [];
let osmChecks = 0;
for (const [id, kinds] of Object.entries(sum.listings || {})) {
  const s = L.get(id);
  const get = k => kinds[k] || [0, "", "", 0, 0];   // [count, first day, last day, distinct days, with note]
  const total = Object.values(kinds).reduce((a, v) => a + v[0], 0);
  const last = Object.values(kinds).map(v => v[2]).sort().pop();
  const row = { id, n: s?.n || "(not in our data)", k: s?.k || "", c: s?.c || "", kinds, total, action: "", why: "" };
  rows.push(row);
  if (!s) { row.action = "resolved"; row.why = "no longer listed"; continue; }
  if (s.chg && s.chg >= last) { row.action = "resolved"; row.why = "the source changed this listing after the reports"; continue; }
  const partner = (s.src || []).some(x => PARTNER.has(x));
  if (s.k === "kid") {
    const [n] = get("deal_ended");
    if (n >= 2) { hide[id] = "reported ended"; row.action = "hidden"; row.why = `${n} people said the deal ended`; }
    else if (n === 1 || get("hours")[0] >= 2) { flag[id] = "ended"; row.action = "marked"; row.why = "a report says the deal may have changed"; }
    continue;
  }
  const [cn, , , cd] = get("closed");
  if (cn >= 1 && osmChecks < 300 && id.startsWith("osm-")) {
    osmChecks++;
    const g = await osmGone(id);
    await new Promise(r => setTimeout(r, 300));   // be gentle with the OSM API
    if (g) { hide[id] = g; row.action = "hidden"; row.why = g; continue; }
  }
  if (cn >= 3 && cd >= 2) {
    if (partner) { flag[id] = "closed"; row.action = "marked"; row.why = `${cn} closed reports on ${cd} days; the food bank's own list still has it, so ask them`; row.ask = true; }
    else { hide[id] = "reported closed"; row.action = "hidden"; row.why = `${cn} closed reports on ${cd} different days`; }
    continue;
  }
  if (cn >= 2 || get("nofood")[0] >= 3) { flag[id] = "closed"; row.action = "marked"; row.why = "several reports of closed or no food"; continue; }
  if (get("hours")[0] + get("address")[0] + get("phone")[0] >= 2) { flag[id] = "hours"; row.action = "marked"; row.why = "several reports of wrong times, address or phone"; continue; }
  row.action = "watching"; row.why = "not enough reports yet";
}

await writeFile(join(outDir, "flags.json"), JSON.stringify({ v: 1, built: new Date().toISOString(), summary: sum.built, hide, flag }));
log(`hidden ${Object.keys(hide).length}, marked ${Object.keys(flag).length}, reported listings ${rows.length}`);

// ---- weekly digest (posted only when something still needs a person) ----
const label = { closed: "closed", nofood: "no food", hours: "times", address: "address", phone: "phone", deal_ended: "deal ended", other: "other" };
const kindsTxt = k => Object.entries(k).map(([x, v]) => `${label[x] || x} ${v[0]}${v[4] ? ` (${v[4]} with note)` : ""}`).join(", ");
const needs = rows.filter(r => r.ask || (r.action === "watching" && r.total >= 1) || r.kinds.other);
const done = rows.filter(r => r.action === "hidden" || r.action === "marked" || r.action === "resolved");
const md = [
  `Automatic check of listing reports from the last ${sum.days || 60} days. Notes are never copied here; read them in the Cloudflare dashboard (D1, plentymap-reports) if you want to.`,
  "",
  `**Needs a look (${needs.length})**`,
  needs.length ? "| Listing | Where | Reports | Status |\n|---|---|---|---|\n" + needs.map(r => `| ${r.n} \`${r.id}\` | ${r.c} | ${kindsTxt(r.kinds)} | ${r.why} |`).join("\n") : "Nothing.",
  "",
  `**Handled automatically (${done.length})**`,
  done.length ? "| Listing | Reports | Action |\n|---|---|---|\n" + done.map(r => `| ${r.n} \`${r.id}\` | ${kindsTxt(r.kinds)} | ${r.action}: ${r.why} |`).join("\n") : "Nothing.",
].join("\n");
await writeFile(join(outDir, "digest.md"), md);
await writeFile(join(outDir, "digest-needed"), needs.length ? "yes" : "no");
