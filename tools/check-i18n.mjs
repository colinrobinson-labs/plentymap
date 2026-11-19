// Checks every language file against English: missing keys, extra keys, and {placeholders} that don't match.
// Usage: node tools/check-i18n.mjs   (exit code 1 if anything is wrong)
import { readFile, readdir } from "node:fs/promises";
const dir = new URL("../i18n/", import.meta.url).pathname;
const en = JSON.parse(await readFile(dir + "en.json", "utf8"));
const enR = JSON.parse(await readFile(dir + "recipes/en.json", "utf8"));
const base = k => k.replace(/_(zero|one|two|few|many|other)$/, "");
const ph = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
let bad = 0;
const enBase = new Map(); for (const k in en) if (k !== "_meta") enBase.set(base(k), en[k]);
for (const f of (await readdir(dir)).filter(f => f.endsWith(".json") && f !== "en.json")) {
  const d = JSON.parse(await readFile(dir + f, "utf8"));
  const have = new Set(Object.keys(d).map(base));
  const miss = [...enBase.keys()].filter(k => !have.has(k));
  const extra = Object.keys(d).filter(k => k !== "_meta" && !enBase.has(base(k)));
  const ref = k => en[k] ?? en[base(k) + "_other"] ?? enBase.get(base(k));
  const strip = x => x.split(",").filter(v => v && v !== "n").join(",");
  const phx = Object.keys(d).filter(k => k !== "_meta" && enBase.has(base(k)) && (base(k) === k ? ph(d[k]) !== ph(ref(k)) : strip(ph(d[k])) !== strip(ph(ref(k)))));
  // every plural family needs an _other
  const noOther = [...new Set(Object.keys(d).filter(k => base(k) !== k).map(base))].filter(b => !(b + "_other" in d));
  let r = null;
  try { r = JSON.parse(await readFile(dir + "recipes/" + f, "utf8")); } catch {}
  const rMiss = r ? Object.keys(enR).filter(k => !(k in r)) : ["(no recipe file)"];
  const rIng = r ? Object.keys(enR.ing).filter(k => !(k in (r.ing || {}))) : [];
  const rSteps = r ? Object.keys(enR).filter(k => !["ing", "units"].includes(k) && r[k] && r[k].s?.length !== enR[k].s.length) : [];
  const n = miss.length + extra.length + phx.length + noOther.length + rMiss.length + rIng.length + rSteps.length;
  if (n) bad++;
  console.log(`${f.padEnd(14)} ${n ? "FIX" : "ok "} missing ${miss.length}${miss.length ? " " + miss.slice(0, 8).join(" ") : ""} | extra ${extra.length}${extra.length ? " " + extra.slice(0, 5).join(" ") : ""} | placeholders ${phx.length}${phx.length ? " " + phx.slice(0, 5).join(" ") : ""} | no _other ${noOther.join(" ")} | recipes missing ${rMiss.length}${rMiss.length && rMiss.length < 6 ? " " + rMiss.join(" ") : ""} ing ${rIng.length} steps ${rSteps.join(" ")}`);
}
process.exit(bad ? 1 : 0);
