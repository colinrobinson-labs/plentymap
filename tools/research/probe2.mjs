// Research only: saves the find-food pages of one or two food banks per locator platform, plus the
// platform scripts they load, so the public data calls those maps make can be read by hand.
// Reads robots.txt first. Usage: node probe2.mjs <outDir>
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = process.argv[2] || "probe2";
await mkdir(out, { recursive: true });
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const log = (...a) => console.log("[probe2]", ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": BROWSER, Accept: "*/*" }, signal: AbortSignal.timeout(30000) });
    return { status: r.status, url: r.url, type: r.headers.get("content-type") || "", text: await r.text() };
  } catch (e) { return { status: 0, url, type: "", text: "", err: e.message }; }
}
const robots = new Map();
async function allowed(u) {
  const x = new URL(u);
  if (!robots.has(x.origin)) {
    const r = await get(x.origin + "/robots.txt"); const rules = [];
    if (r.status === 200 && !/<html/i.test(r.text.slice(0, 200))) { let mine = false; for (const l of r.text.split(/\r?\n/)) { const [k, ...v] = l.split(":"); const key = (k || "").trim().toLowerCase(), val = v.join(":").trim(); if (key === "user-agent") mine = val === "*"; else if (mine && key === "disallow" && val) rules.push(val); } }
    robots.set(x.origin, rules);
  }
  return !robots.get(x.origin).some(r => (x.pathname + x.search).startsWith(r.replace(/\*.*$/, "")));
}
const PAGES = {
  vivery: ["https://foodlifeline.org/find-food", "https://www.vtfoodbank.org/access-food/find-a-food-shelf/", "https://gbfb.vivery.org/", "https://pantrynet.org/"],
  wpsl: ["https://www.philabundance.org/find-food/", "https://coastalbendfoodbank.org/get-help/find-food/"],
  slp: ["https://goldenharvest.org/find-help/food-pantry-finder/", "https://stophunger.org/food-finder/"],
  agile: ["https://foodshare.com/find-help/", "https://fulfillnj.org/get-help/locate-a-pantry-or-soup-kitchen/"],
  storepoint: ["https://www.lafoodbank.org/find-food/pantry-locator/", "https://feedoc.org/need-food/"],
  freshtrak: ["https://mofc.org/get-involved/find-food/", "https://freshtrak.com/"],
  storerocket: ["https://www.secondharvestmidtn.org/find-resources/find-food/", "https://www.islandharvest.org/find-help/find-a-food-pantry/"],
  mapbox: ["https://www.licares.org/find-food", "https://www.secondharvestmetrolina.org/need-food/find-food-near-you"],
  link2feed: ["https://www.elpasoansfightinghunger.org/get-help"],
  arcgis: ["https://www.capitalareafoodbank.org/find-food-assistance/", "https://www.gsfb.org/food-map/"],
  leaflet: ["https://harrychapinfoodbank.org/find-food/?type=food-pantries", "https://www.foodbankccs.org/find-food/foodbycity/"],
  plentiful: ["https://www.cityharvest.org/food-map/", "https://sm-ch-map.netlify.app/", "https://fbnycmap.z13.web.core.windows.net/"],
  mymaps: ["https://hawaiifoodbank.org/get-help/find-food/"],
  houston: ["https://www.houstonfoodbank.org/find-help/find-food-map/"],
  ntfb: ["https://ntfb.org/"],
  gcfd: ["https://www.chicagosfoodbank.org/find-food/"],
  feedingamerica_tx: ["https://www.feedingtexas.org/"],
};
const VENDOR_JS = /vivery|accessfood|pantrynet|storepoint|wpsl|store-locator|storelocator|agile|asl|storerocket|freshtrak|link2feed|mapbox|arcgis|locator|finder|map/i;
const index = [];
for (const [plat, urls] of Object.entries(PAGES)) {
  for (const u of urls) {
    if (!(await allowed(u))) { index.push({ plat, u, note: "robots disallows" }); continue; }
    const r = await get(u);
    const slug = plat + "_" + new URL(u).hostname.replace(/^www\./, "").replace(/\W+/g, "_");
    await writeFile(join(out, slug + ".html"), r.text);
    const scripts = [...r.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => { try { return new URL(m[1].replace(/&amp;/g, "&"), r.url || u).href; } catch { return ""; } }).filter(s => s && VENDOR_JS.test(s) && !/googletagmanager|gtag|analytics|recaptcha|jquery(\.min)?\.js/i.test(s));
    const frames = [...r.text.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1].replace(/&amp;/g, "&"));
    let n = 0;
    for (const s of scripts.slice(0, 8)) {
      if (!(await allowed(s))) continue;
      const js = await get(s);
      if (js.status === 200 && js.text.length < 3_000_000) { await writeFile(join(out, `${slug}__js${n++}.txt`), `// ${s}\n` + js.text); }
      await sleep(400);
    }
    for (const f of frames.filter(f => /^https?:/.test(f) && !/googletagmanager|youtube|google\.com\/maps\/embed\?pb/.test(f)).slice(0, 3)) {
      if (!(await allowed(f))) continue;
      const fr = await get(f);
      await writeFile(join(out, `${slug}__frame${n++}.html`), `<!-- ${f} -->\n` + fr.text);
      await sleep(400);
    }
    index.push({ plat, u, status: r.status, final: r.url, bytes: r.text.length, scripts, frames });
    log(plat, u, r.status, r.text.length, scripts.length, frames.length);
    await sleep(800);
  }
}
await writeFile(join(out, "index.json"), JSON.stringify(index, null, 1));
