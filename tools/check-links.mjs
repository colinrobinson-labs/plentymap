// Checks every link in the benefits modules still opens. Runs on GitHub Actions (monthly and on change).
// Usage: node tools/check-links.mjs js/benefits/gb.js js/benefits/ca.js
import { pathToFileURL } from "node:url";
const files = process.argv.slice(2);
const urls = new Map();
const walk = (v, where) => {
  if (typeof v === "string") { if (/^https:\/\//.test(v)) (urls.get(v) || urls.set(v, []).get(v)).push(where); }
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
};
for (const f of files) { const m = await import(pathToFileURL(f).href); for (const [k, v] of Object.entries(m)) walk(v, `${f}:${k}`); }
const UA = "Mozilla/5.0 (compatible; PlentyMapLinkCheck/1.0; +https://plentymap.com)";
let bad = 0;
await Promise.all([...urls].map(async ([u, where], i) => {
  await new Promise(r => setTimeout(r, i * 150));
  let st = "", fin = "";
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(u, { method, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(30000) });
      st = r.status; fin = r.url;
      if (r.ok) break;
    } catch (e) { st = e.cause?.code || e.message; }
  }
  const ok = typeof st === "number" && st < 400;
  if (!ok) bad++;
  console.log(`${ok ? "ok " : "BAD"} ${st} ${u}${fin && fin !== u ? ` -> ${fin}` : ""}${ok ? "" : `  (${where.join(", ")})`}`);
}));
console.log(`${urls.size} links, ${bad} broken`);
if (bad) process.exitCode = 1;
