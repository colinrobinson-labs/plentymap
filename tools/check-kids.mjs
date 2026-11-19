// Weekly: checks that every kids-eat-free deal is still mentioned by at least one of its published sources,
// and flags deals that end soon or haven't been re-checked in a while. Writes a short Markdown list
// (empty file when all is well) that the workflow posts as an issue.
// Usage: node check-kids.mjs data/kids.json out.md
import { readFile, writeFile } from "node:fs/promises";

const [file = "data/kids.json", outFile = "kids-check.md"] = process.argv.slice(2);
const K = JSON.parse(await readFile(file, "utf8"));
const UA = "Mozilla/5.0 (compatible; PlentyMapCheck/1.0; +https://plentymap.com)";
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'`]/g, "").replace(/&amp;/g, "&").replace(/[^a-z0-9&]+/g, " ");
const pages = {};
for (const u of Object.keys(K.sources)) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "text/html" }, signal: AbortSignal.timeout(45000) });
    pages[u] = r.ok ? norm(await r.text()) : null;
    console.log(`[check-kids] ${u} ${r.status}`);
  } catch (e) { pages[u] = null; console.log(`[check-kids] ${u} ${e.message}`); }
}
// the distinctive part of a chain's name: "Denny's" -> "dennys", "TGI Fridays" -> "tgi fridays"
const key = n => norm(n).replace(/\b(the|restaurant|restaurants|grill|cafe|bakery|fresh mex|mexican eats|coastal|world burrito|barbecue pit|original roadhouse|tex mex|brazilian)\b/g, " ").replace(/\s+/g, " ").trim();
const today = new Date().toISOString().slice(0, 10);
const soon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const age = Math.round((Date.parse(today) - Date.parse(K.checked)) / 864e5);
const lines = [], hide = {};
const reachable = Object.values(pages).some(Boolean);
for (const x of K.deals) {
  const k = key(x.n);
  const seen = x.src.filter(u => pages[u]);
  if (reachable && seen.length && !seen.some(u => pages[u].includes(k))) {
    // only hide when every source we could read dropped it, and at least one source was read
    hide[x.id] = "no longer listed by its sources";
    lines.push(`- **${x.n}** (\`${x.id}\`): no longer mentioned by ${seen.map(u => K.sources[u].name).join(", ")}. Hidden automatically; re-check and remove or re-source it.`);
  }
  if (x.until && x.until < today) lines.push(`- **${x.n}**: ended ${x.until}; the app already hides it. Remove it or add the new dates.`);
  else if (x.until && x.until <= soon) lines.push(`- **${x.n}**: ends ${x.until}. Check whether it was extended.`);
}
if (!reachable) lines.push("- None of the source pages could be read this week (blocked or down). Nothing was changed.");
if (age > 75) lines.unshift(`- The whole list was last checked ${K.checked} (${age} days ago). The app hides it after 120 days. Re-check data/kids.json and update "checked".`);
await writeFile(outFile.replace(/\.md$/, "") + "-hide.json", JSON.stringify({ v: 1, built: new Date().toISOString(), hide }));
await writeFile(outFile, lines.length ? `Weekly check of data/kids.json against its published sources.\n\n${lines.join("\n")}\n` : "");
console.log(lines.join("\n") || "[check-kids] all deals still listed by their sources");
