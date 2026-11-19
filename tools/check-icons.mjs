// Icon geometry check: catches shapes that collide, food that spills past its pot, accents that graze a line,
// and gaps too tight to read. Runs on js/icons.js in a headless browser.
//   node tools/check-icons.mjs            -> prints problems, exits 1 if any
//   ONE=<name> node tools/check-icons.mjs   checks one icon
//   node tools/check-icons.mjs --sheet x.png  also writes a contact sheet with the problems outlined in red
// Rules (units are the 24-unit icon grid):
//   spill   a food fill tucked behind a pot, bowl or pan must sit inside that vessel's walls (0.5 inset)
//   collide a food fill that overlaps another shape must either sit inside it or carry it inside itself
//   graze   an accent line may touch a shape only at its own ends, or sit fully inside it
//   tight   two shapes in the same layer that don't touch must be at least 0.6 apart
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
let chromium;
for (const p of ["playwright", "../qa/node_modules/playwright", "/opt/node22/lib/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch {}
}
if (!chromium) { console.error("check-icons: Playwright not found"); process.exit(2); }

const root = fileURLToPath(new URL("..", import.meta.url));
const src = readFileSync(root + "js/icons.js", "utf8").replace(/export const /g, "const ");
const sheetArg = process.argv.indexOf("--sheet");

const pageCode = `
${src}
const PX = 8, PAD = 2, W = (24 + PAD * 2) * PX;
const FILL = new Set(["f", "fa", "ft", "fb"]);
const cv = Object.assign(document.createElement("canvas"), { width: W, height: W }), cx = cv.getContext("2d", { willReadFrequently: true });
async function raster(markup) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + W + '" viewBox="-' + PAD + ' -' + PAD + ' ' + (24 + PAD * 2) + ' ' + (24 + PAD * 2) + '" stroke-linecap="round" stroke-linejoin="round">' + markup + '</svg>';
  const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); await img.decode();
  cx.clearRect(0, 0, W, W); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, W, W).data, m = new Uint8Array(W * W);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return m;
}
const count = m => { let n = 0; for (const v of m) n += v; return n; };
const and = (a, b) => { const r = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) r[i] = a[i] & b[i]; return r; };
function dilate(m, k) {
  const r = new Uint8Array(m.length), off = [];
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) if (dx * dx + dy * dy <= k * k) off.push([dx, dy]);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y * W + x])
    for (const [dx, dy] of off) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < W) r[Y * W + X] = 1; }
  return r;
}
function xspan(m) { let a = W, b = -1; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < a) a = x; if (x > b) b = x; } return [a, b]; }
// leaf elements of one layer, with their full transform and class
function leaves(layerMarkup, sw) {
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.setAttribute("viewBox", "0 0 24 24"); host.innerHTML = layerMarkup; document.body.appendChild(host);
  const out = [];
  for (const el of host.querySelectorAll("path,circle,rect,ellipse")) {
    const m = el.getCTM(), hm = host.getCTM(), rel = hm.inverse().multiply(m);
    const cls = (el.getAttribute("class") || "").trim();
    const c = el.cloneNode(); c.removeAttribute("class"); c.removeAttribute("style");
    const w = el.getAttribute("stroke-width") || (cls === "sb" ? 1.2 : sw);
    const tf = 'matrix(' + [rel.a, rel.b, rel.c, rel.d, rel.e, rel.f].join(" ") + ')';
    const geom = new XMLSerializer().serializeToString(c).replace(/ xmlns="[^"]*"/, "").replace(/ stroke-width="[^"]*"/, "").replace(/><\\/\\w+>$/, "/>");
    const ends = [];
    if (el.tagName === "path") for (const sub of (el.getAttribute("d").match(/[Mm][^Mm]*/g) || [])) {
      // only absolute-start subpaths can be measured on their own; relative starts are resolved by the browser below
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); host.appendChild(p);
      p.setAttribute("d", sub.replace(/^m/, "M")); const L = p.getTotalLength();
      if (/z\\s*$/i.test(sub)) { p.remove(); continue; }
      for (const t of [0, L]) { const q = p.getPointAtLength(t).matrixTransform(rel); ends.push([q.x, q.y]); }
      p.remove();
    }
    const g = el.parentNode !== host ? el.parentNode : el;
    if (!g.__id) g.__id = Math.random().toString(36).slice(2);
    const closed = el.tagName !== "path" || /z\\s*$/i.test(el.getAttribute("d"));
    out.push({ cls, tag: el.tagName, tf, geom, w, ends, grp: g.__id, closed });
  }
  host.remove();
  return out;
}
async function check(name, icon, isDish) {
  const sw = isDish ? 1.5 : 1.75, layers = Array.isArray(icon) ? icon : [icon];
  const els = [];
  for (let li = 0; li < layers.length; li++) for (const e of leaves(layers[li], sw)) els.push({ ...e, li });
  for (const e of els) {
    const filled = FILL.has(e.cls);
    e.P = await raster('<g transform="' + e.tf + '">' + e.geom.replace("/>", ' fill="' + (filled ? "#000" : "none") + '" stroke="' + (filled ? "none" : "#000") + '" stroke-width="' + e.w + '"/>') + '</g>');
    e.R = await raster('<g transform="' + e.tf + '">' + e.geom.replace("/>", ' fill="#000" stroke="#000" stroke-width="' + e.w + '"/>') + '</g>');
    e.n = count(e.P);
  }
  const probs = [], inside = (a, b) => count(and(a.P, b.R)) >= a.n * 0.98;
  const content = e => FILL.has(e.cls) && e.cls !== "fb";
  for (const A of els) {
    if (content(A)) {
      // spill: a fill partly hidden behind a vessel in front of it
      const front = els.filter(B => B.li > A.li && B.cls === "o");
      const hid = front.map(B => [B, count(and(A.P, dilate(B.R, 3)))]).filter(x => x[1] > 0).sort((p, q) => q[1] - p[1]);
      if (hid.length) {
        const [ax0, ax1] = xspan(A.P), [bx0, bx1] = xspan(hid[0][0].R), m = 0.5 * PX;
        if (ax0 < bx0 + m || ax1 > bx1 - m) probs.push({ rule: "spill", msg: "food runs past the edge of its pot/bowl" });
      }
      // collide: same layer
      for (const B of els) if (B !== A && B.li === A.li && B.grp !== A.grp && B.cls !== "sb" && B.cls !== "fb") {
        const ov = count(and(A.P, B.P));
        if (ov > 2 && !inside(A, B) && !inside(B, A)) probs.push({ rule: "collide", msg: A.cls + " shape overlaps a " + (B.cls || "line") + " without sitting inside it" });
      }
    }
    if (A.cls === "a" || A.cls === "t") {
      for (const B of els) if (B !== A && B.li === A.li && !(B.cls === "a" || B.cls === "t")) {
        const ov = and(A.P, B.P); if (count(ov) <= 2 || inside(A, B)) continue;
        // allowed when every touching pixel is near one of A's own line ends
        const near = new Uint8Array(W * W);
        for (const [x, y] of [...A.ends, ...B.ends]) { const X = Math.round((x + PAD) * PX), Y = Math.round((y + PAD) * PX), k = Math.round(sw * PX); for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { const i = (Y + dy) * W + X + dx; if (i >= 0 && i < near.length) near[i] = 1; } }
        if (count(and(ov, near)) < count(ov) * 0.9) probs.push({ rule: "graze", msg: "accent line runs into a shape instead of meeting it at an end" });
      }
    }
    // outline collide: two closed outlines in the same layer that cross instead of nesting
    if (!FILL.has(A.cls) && A.cls !== "sb" && A.closed) {
      for (const B of els) if (B !== A && B.li === A.li && B.grp !== A.grp && B.closed && !FILL.has(B.cls) && B.cls !== "sb" && els.indexOf(B) > els.indexOf(A)) {
        if (count(and(A.P, B.P)) > 2 && !inside(A, B) && !inside(B, A)) probs.push({ rule: "collide", msg: "two outlines cross each other" });
      }
    }
    // tight: content or accent vs anything else in the same layer, not touching but closer than 0.6
    if (content(A) || A.cls === "a" || A.cls === "t") {
      const halo = dilate(A.P, Math.round(0.6 * PX));
      for (const B of els) if (B !== A && B.li === A.li && B.grp !== A.grp && B.cls !== "sb" && B.cls !== "fb") {
        if (count(and(A.P, B.P)) === 0 && count(and(halo, B.P)) > 0) probs.push({ rule: "tight", msg: A.cls + " " + A.tag + " sits too close to a " + (B.cls || "line") + " " + B.tag + " (under 0.6)" });
      }
    }
  }
  const seen = new Set();
  return probs.filter(p => { const k = p.rule + p.msg; if (seen.has(k)) return false; seen.add(k); return true; }).map(p => ({ name, ...p }));
}
window.one = async (k) => IC[k] ? check("ui:" + k, IC[k], false) : check("dish:" + k, DISH[k], true);
window.runCheck = async () => {
  const all = [];
  for (const k of Object.keys(IC)) all.push(...await check("ui:" + k, IC[k], false));
  for (const k of Object.keys(DISH)) all.push(...await check("dish:" + k, DISH[k], true));
  return all;
};
`;
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent("<!doctype html><body></body>");
await p.addScriptTag({ content: pageCode });
const probs = process.env.ONE ? await p.evaluate(k => window.one(k), process.env.ONE) : await p.evaluate(() => window.runCheck());
if (sheetArg > 0) {
  const bad = new Set(probs.map(x => x.name));
  await p.evaluate(bad => {
    const css = `.i,.d{fill:none;stroke:#F1EBDD;stroke-linecap:round;stroke-linejoin:round;width:64px;height:64px;overflow:visible}.i{stroke-width:1.75}.d{stroke-width:1.5}.a{stroke:#F5C04A}.t{stroke:#E0664F}.f,.fa,.ft,.fb{stroke:none}.f{fill:#F1EBDD}.fa{fill:#F5C04A}.ft{fill:#E0664F}.fb{fill:#1F3B2D}.sb{stroke:#1F3B2D;stroke-width:1.2}.kn *{stroke:#000!important;fill:none!important}.i .kn *{stroke-width:3.9!important}.d .kn *{stroke-width:3.4!important}.kn .o,.kn .f,.kn .fa,.kn .ft,.kn .fb{fill:#000!important}
      body{background:#16291F;display:flex;flex-wrap:wrap;gap:8px;width:1200px;font:10px sans-serif;color:#ccc;margin:8px}.c{width:84px;text-align:center}.c div{background:#1F3B2D;border-radius:10px;padding:10px}.bad div{outline:3px solid #ff3b30}`;
    let h = "<style>" + css + "</style>";
    for (const k of Object.keys(IC)) h += `<div class="c ${bad.includes("ui:" + k) ? "bad" : ""}"><div>${ico(k)}</div>${k}</div>`;
    for (const k of Object.keys(DISH)) h += `<div class="c ${bad.includes("dish:" + k) ? "bad" : ""}"><div>${dish(k)}</div>${k}</div>`;
    document.body.innerHTML = h;
  }, [...bad]);
  await p.screenshot({ path: process.argv[sheetArg + 1], fullPage: true });
}
await b.close();
for (const x of probs) console.log(`${x.name.padEnd(22)} ${x.rule.padEnd(8)} ${x.msg}`);
console.log(probs.length ? `\n${probs.length} icon problem(s).` : "Icons: no overlaps, spills, grazes or tight gaps.");
process.exit(probs.length ? 1 : 0);
