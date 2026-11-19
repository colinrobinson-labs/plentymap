// Applies the nightly report check (flags.json from tools/check-reports.mjs) to the site's data files
// as they are published: hidden listings are left out, marked ones get rep: "closed" | "hours" | "ended",
// which the app shows as "people reported this; call before you go".
// Usage: node apply-flags.mjs <siteDataDir> <flags.json>
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const [dir = "_site/data", flagsFile = "flags.json"] = process.argv.slice(2);
let F = {};
try { F = JSON.parse(await readFile(flagsFile, "utf8")); } catch { console.log("[apply-flags] no report flags"); }
// flags older than 3 days mean the nightly check has stopped: show everything as published rather than act on stale reports
if (F.built && Date.now() - Date.parse(F.built) > 3 * 864e5) { console.log("[apply-flags] report flags are stale; ignoring them"); F = {}; }
const hide = { ...(F.hide || {}) }, flag = F.flag || {};
// the weekly kids-eat-free source check (flags/kids.json next to flags.json), if it is recent
try {
  const K = JSON.parse(await readFile(join(flagsFile, "..", "kids.json"), "utf8"));
  if (Date.now() - Date.parse(K.built) < 10 * 864e5) Object.assign(hide, K.hide || {});
} catch {}
let nh = 0, nf = 0;

function fix(list) {
  if (!Array.isArray(list)) return list;
  const out = [];
  for (const s of list) {
    if (hide[s.id]) { nh++; continue; }
    if (flag[s.id]) { s.rep = flag[s.id]; nf++; }
    out.push(s);
  }
  return out;
}
async function each(sub) {
  let files = [];
  try { files = (await readdir(join(dir, sub))).filter(f => f.endsWith(".json")); } catch { return; }
  for (const f of files) {
    const p = join(dir, sub, f);
    const j = JSON.parse(await readFile(p, "utf8"));
    if (!j.sites && !j.stores) continue;
    const before = (j.sites?.length || 0) + (j.stores?.length || 0);
    j.sites = fix(j.sites); j.stores = fix(j.stores);
    if ((j.sites?.length || 0) + (j.stores?.length || 0) !== before || JSON.stringify(j).includes('"rep":')) await writeFile(p, JSON.stringify(j));
  }
}
await each("regions");
await each("us/cells");
await each("extra/cells");
try {
  const p = join(dir, "kids.json");
  const k = JSON.parse(await readFile(p, "utf8"));
  for (const x of k.deals) { if (hide[x.id]) { x.hide = 1; nh++; } else if (flag[x.id]) { x.rep = flag[x.id]; nf++; } }
  await writeFile(p, JSON.stringify(k));
} catch {}
console.log(`[apply-flags] hidden ${nh}, marked ${nf}`);
