// Store screenshots for the App Store and Google Play, made from the real app with frozen data and clock.
// Usage: (serve the built site first: bash qa/build-site.sh _site && node qa/serve.mjs _site 4173)
//   node tools/store-screenshots.mjs [outDir] [lang]
// Each shot is the live app screen inside a board-green frame with a short caption (captions: store/captions/<lang>.json).
// It fails if any caption overflows its box, so nothing is ever cut off.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
// playwright from qa/ (CI) or a global install
const req = createRequire(join(root, "qa/package.json"));
const { chromium } = req("playwright");
const OUT = process.argv[2] || join(root, "store/screenshots");
const LANG = process.argv[3] || "en";
const BASE = process.env.PM_BASE || "http://localhost:4173/";
const CAP = JSON.parse(await readFile(join(root, "store/captions", LANG + ".json"), "utf8"));
const LOC = { zip: "92113", lat: 32.697, lon: -117.116, label: "92113", st: "CA", src: "zip" };
const FROZEN = new Date("2026-11-17T10:30:00-08:00"); // a Tuesday morning, when most pantries are open

// Canvas sizes are what each store asks for. `s` is the pixel ratio, so css size = px / s.
const TARGETS = [
  { id: "apple-iphone-6.9", w: 1320, h: 2868, s: 3 },   // App Store: iPhone 6.9" (required)
  { id: "apple-ipad-13",    w: 2064, h: 2752, s: 2, fill: true },   // App Store: iPad 13" (required, the app runs on iPad)
  { id: "play-phone",       w: 1242, h: 2484, s: 3 },   // Google Play: phone (2:1 is the tallest allowed)
  { id: "play-tablet-7",    w: 1080, h: 1920, s: 2, fill: true },   // Google Play: 7" tablet (9:16)
  { id: "play-tablet-10",   w: 1440, h: 2560, s: 2, fill: true },   // Google Play: 10" tablet (9:16)
];

const click = sel => async p => { const el = p.locator(sel).filter({ visible: true }).first(); if (await el.count()) await el.click(); };
const SCREENS = [
  { id: "1-home", go: "#/home" },
  { id: "2-cook", go: "#/cook" },
  { id: "3-recipe", go: "#/cook/dal", ready: "#sheet-h", modal: true },
  { id: "4-budget", go: "#/budget" },
  { id: "5-find", go: "#/find", act: async (p, wide) => { if (!wide) { await click('[data-view="map"]')(p); await p.evaluate(() => scrollTo(0, 0)); } await p.waitForTimeout(4500); } },
  { id: "6-benefits", go: "#/help", act: async p => {
      await p.fill("#inc", "1800"); await p.locator("#qs [type=submit]").first().click(); await p.waitForTimeout(600);
      // bring the answer to the top of the screen
      await p.evaluate(() => { const h = [...document.querySelectorAll("h2,h3")].find(e => e.offsetParent && e.getBoundingClientRect().top > 200 && /\S/.test(e.textContent) && e.closest("#qsr, .qs-result, [id*=res]")) || [...document.querySelectorAll("h2,h3")].filter(e => e.offsetParent).pop(); h?.scrollIntoView({ block: "start" }); scrollBy(0, -80); });
      await p.waitForTimeout(400);
    } },
  { id: "7-language", go: "#/home", act: click("#langbtn"), ready: "#w-pick", modal: true },
];

// fonts go in as data URLs: the frame page has no origin, so it can't fetch them from the server
const font = async f => "data:font/woff2;base64," + (await readFile(join(root, "fonts", f))).toString("base64");
const CAPRASIMO = await font("caprasimo-latin.woff2"), FIGTREE = await font("figtree-latin.woff2");
// No line of text may be half hidden under the fixed header or the tab bar: nudge the scroll until every
// line that touches an edge is either fully shown or fully hidden.
async function settle(p) {
  for (let i = 0; i < 12; i++) {
    const d = await p.evaluate(() => {
      const bar = document.querySelector("nav.tabs, #tabs, .tabbar, nav[role=tablist]") || [...document.querySelectorAll("nav")].find(n => getComputedStyle(n).position === "fixed" && n.getBoundingClientRect().bottom >= innerHeight - 2);
      const head = document.querySelector("header");
      const lo = bar ? bar.getBoundingClientRect().top : innerHeight, hi = head && getComputedStyle(head).position !== "static" ? head.getBoundingClientRect().bottom : 0;
      const w = document.createTreeWalker(document.querySelector("#main") || document.body, NodeFilter.SHOW_TEXT);
      const r = document.createRange();
      for (let n; (n = w.nextNode());) {
        if (!n.textContent.trim() || !n.parentElement.offsetParent) continue;
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) {
          if (b.height < 4) continue;
          if (b.top < lo - 1 && b.bottom > lo + 1) return b.bottom - lo + 6;   // cut by the tab bar: scroll down
          if (b.top < hi - 1 && b.bottom > hi + 1) return -(hi - b.top + 6);   // cut by the header: scroll up
        }
      }
      return 0;
    });
    if (!d) return;
    // at the top of a page there is nothing above to scroll to: make the screen a little shorter instead
    const atTop = await p.evaluate(() => scrollY === 0 && (document.querySelector("#main")?.scrollTop || 0) === 0);
    if (d > 0 && atTop) { const v = p.viewportSize(); await p.setViewportSize({ width: v.width, height: Math.floor(v.height - d) }); await p.waitForTimeout(150); continue; }
    await p.evaluate(d => { const before = scrollY; scrollBy(0, d); if (scrollY === before) { let e = document.querySelector("#main"); while (e && e.scrollHeight <= e.clientHeight) e = e.parentElement; e?.scrollBy(0, d); } }, d);
    await p.waitForTimeout(120);
  }
}
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function frame(t, img, cap) {
  const W = t.w / t.s, H = t.h / t.s, u = W / 440;           // u: one "phone point", so type scales with the canvas
  const tablet = W / H > 0.62;
  const pad = Math.round((tablet ? 48 : 26) * u), top = Math.round((tablet ? 54 : 50) * u);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Caprasimo;src:url(${CAPRASIMO})}
@font-face{font-family:Figtree;src:url(${FIGTREE});font-weight:300 900}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#1F3B2D}
body{display:flex;flex-direction:column;align-items:center;padding:${top}px ${pad}px ${pad}px;
  background:radial-gradient(120% 60% at 50% 0%,#2A4B3A 0%,#1F3B2D 60%,#1A3226 100%)}
.cap{width:100%;text-align:center;color:#F1EBDD;flex:none;height:${(tablet ? 30*1.08*2 + 15*1.35*2 + 10 : 31*1.08*2 + 16*1.35*2 + 10) * u + 2}px;overflow:hidden}
h1{font:400 ${(tablet ? 30 : 31) * u}px/1.08 Caprasimo,serif;letter-spacing:-.005em;max-width:${tablet ? 15 : 12}em;margin:0 auto;text-wrap:balance}
h1 em{font-style:normal;color:#F5C04A}
p{font:500 ${(tablet ? 15 : 16) * u}px/1.35 Figtree,sans-serif;color:rgba(241,235,221,.82);margin:${10 * u}px auto 0;max-width:${tablet ? 30 : 22}em;text-wrap:balance}
.shot{margin-top:${(tablet ? 30 : 24) * u}px;flex:1;width:100%;display:flex;justify-content:center;min-height:0}
.shot img{height:100%;max-width:100%;object-fit:contain;border-radius:${(tablet ? 16 : 22) * u}px;
  box-shadow:0 0 0 ${1.5 * u}px rgba(241,235,221,.16),0 ${14 * u}px ${40 * u}px rgba(0,0,0,.35)}
</style></head><body><div class="cap"><h1>${cap.h}</h1><p>${esc(cap.p)}</p></div><div class="shot"><img src="${img}"></div></body></html>`;
}
// The screen box left after the caption, in css px (measured from the frame itself).
async function boxSize(b, t, cap) {
  const pg = await b.newPage({ viewport: { width: t.w / t.s, height: t.h / t.s } });
  await pg.setContent(frame(t, "data:image/gif;base64,R0lGODlhAQABAAAAACw=", cap));
  await pg.evaluate(() => document.fonts.ready);
  const r = await pg.evaluate(() => { const s = document.querySelector(".shot").getBoundingClientRect(); return { w: s.width, h: s.height }; });
  await pg.close(); return r;
}

const b = await chromium.launch();
await mkdir(OUT, { recursive: true });
let bad = 0;
for (const t of TARGETS.filter(t => !process.env.PM_ONLY || t.id === process.env.PM_ONLY)) {
  await mkdir(join(OUT, t.id), { recursive: true });
  for (const sc of SCREENS) {
    const cap = CAP[sc.id]; if (!cap) throw new Error("no caption for " + sc.id);
    const box = await boxSize(b, t, cap);
    const W = t.w / t.s, tablet = W / (t.h / t.s) > 0.62;
    // app viewport: as wide as the box allows at a phone-like or tablet-like aspect
    const vw = Math.floor(t.fill ? box.w : Math.min(box.w, box.h * 0.54)), vh = Math.floor(box.h);
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: t.s, isMobile: vw < 900, hasTouch: true, colorScheme: "light", locale: LANG });
    await ctx.addInitScript(([loc, lang]) => {
      localStorage.setItem("pm.lang", JSON.stringify(lang)); localStorage.setItem("pm.loc", JSON.stringify(loc));
      localStorage.setItem("pm.setupDone", "true"); localStorage.setItem("pm.theme", '"light"');
    }, [LOC, LANG]);
    const p = await ctx.newPage(); await p.clock.setFixedTime(FROZEN);
    await p.goto(BASE + sc.go, { waitUntil: "networkidle" }).catch(() => {});
    if (sc.ready) await p.waitForSelector(sc.ready, { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
    if (sc.act) await sc.act(p, vw >= 720);
    if (!sc.modal) await settle(p);
    const png = await p.screenshot({ type: "png" }); await ctx.close();
    const fp = await b.newPage({ viewport: { width: W, height: t.h / t.s }, deviceScaleFactor: t.s });
    await fp.setContent(frame(t, "data:image/png;base64," + png.toString("base64"), cap));
    await fp.evaluate(() => document.fonts.ready); await fp.waitForTimeout(150);
    // nothing in the caption may be cut off or run past the edges
    const over = await fp.evaluate(() => { const c = document.querySelector(".cap"); return c.scrollHeight > c.clientHeight + 1 || c.lastElementChild.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1; }) || await fp.evaluate(() => [...document.querySelectorAll("h1,p")].some(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth || e.getBoundingClientRect().left < 0));
    if (over) { bad++; console.error(`caption overflow: ${t.id}/${sc.id}`); }
    await fp.screenshot({ path: join(OUT, t.id, `${sc.id}.jpg`), type: "jpeg", quality: 92 }); await fp.close();
    console.log(`${t.id}/${sc.id}  app ${vw}x${vh}`);
  }
}
await b.close();
if (bad) process.exit(1);
