// Layout and language checks that run inside the page. One call returns every problem on the screen as it is now.
// Each problem: { check, sel, detail }. The test adds language, width, theme and screen.
//
// Checks:
//   h-overflow      the page scrolls sideways
//   off-screen      an element pokes out past the left or right edge (and nothing scrolls it)
//   clipped-text    text cut off by its own box (ellipsis, or overflow hidden) on a button, link, label, heading or chip
//   clipped-hint    an input's placeholder is wider than the box
//   overlap         two pieces of text (or text and an icon) drawn on top of each other
//   tap-target      a button, link or control smaller than 44x44 (inline links inside sentences are allowed)
//   rtl-digits      in Arabic, Dari or Pashto, a phone number, ZIP, address or time shows its digit groups in the wrong order
//   rtl-dir         the page isn't right-to-left in a right-to-left language
//   lang-attr       <html lang> doesn't match the chosen language
//   untranslated    a screen string shows in English in another language
//   raw-key         a translation key (like tab_find) shows instead of words
//   placeholder     a {placeholder} wasn't filled in
//   bad-value       "undefined", "NaN", "null" or "[object Object]" on screen
//   broken-image    an image that didn't load

export function runChecks({ lang, dir, enLeaks = [], keys = [], skip = [] }) {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const add = (check, el, detail) => out.push({ check, sel: el ? selOf(el) : "", detail: String(detail || "").slice(0, 300) });
  const skipSel = skip.join(",");

  function selOf(el) {
    const parts = [];
    for (let e = el, i = 0; e && e.nodeType === 1 && e !== document.body && i < 4; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase();
      if (e.id && !/\d{3,}/.test(e.id)) { parts.unshift(s + "#" + e.id); break; }
      const cls = [...e.classList].filter(c => !/^(on|active|open|sel|is-|has-)/.test(c) && !/\d{3,}/.test(c)).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      const role = e.getAttribute("role"); if (role && !cls.length) s += `[role=${role}]`;
      parts.unshift(s);
    }
    return parts.join(" > ");
  }
  const cs = el => getComputedStyle(el);
  function hiddenish(el) {
    if (skipSel && el.closest(skipSel)) return true;
    if (el.closest("[hidden],.sr,template,noscript")) return true;
    // inside a closed <details> (other than its summary): not shown
    for (let d = el.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])")) {
      const sum = d.querySelector(":scope > summary");
      if (!sum || !sum.contains(el)) return true;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return true;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return true;
      if (s.clip === "rect(0px, 0px, 0px, 0px)" || s.clipPath === "inset(50%)") return true;
    }
    return false;
  }
  // ancestor that clips or scrolls sideways (so poking out of the page doesn't matter)
  function xContained(el) {
    for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const o = cs(e).overflowX;
      if (o !== "visible") return true;
    }
    return false;
  }
  function fixedRoot(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const p = cs(e).position; if (p === "fixed" || p === "sticky") return e; }
    return null;
  }

  const all = [...document.body.querySelectorAll("*")].filter(e => !["SCRIPT", "STYLE", "LINK", "META", "BR", "TEMPLATE", "NOSCRIPT"].includes(e.tagName));
  const vis = all.filter(e => !hiddenish(e));

  // ---- sideways scrolling ----
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) add("h-overflow", null, `page is ${sw}px wide in a ${vw}px window`);
  // ---- elements past the edges ----
  const offs = new Set();
  for (const e of vis) {
    if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue;
    const r = e.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !xContained(e)) {
      if (e.parentElement && offs.has(e.parentElement)) { offs.add(e); continue; }
      offs.add(e); add("off-screen", e, `spans ${Math.round(r.left)}..${Math.round(r.right)} in a ${vw}px window`);
    }
  }

  // ---- text cut off by its box ----
  const textOf = e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
  const CLIPWATCH = "button,a,label,summary,h1,h2,h3,h4,.btn,.chip,[role=button],[role=tab],th,td,dt,dd,li,.badge,.tag,.pill,.kpi,b,strong,span,p";
  for (const e of vis) {
    if (!e.matches(CLIPWATCH)) continue;
    const s = cs(e);
    const txt = e.innerText?.trim(); if (!txt) continue;
    const ox = s.overflowX, oy = s.overflowY;
    if (ox === "auto" || ox === "scroll" || oy === "auto" || oy === "scroll") continue;
    const cutX = e.scrollWidth > e.clientWidth + 1 && (ox === "hidden" || ox === "clip" || s.textOverflow === "ellipsis");
    const cutY = e.scrollHeight > e.clientHeight + 2 && (oy === "hidden" || oy === "clip") && e.clientHeight > 0;
    const clampY = s.webkitLineClamp && s.webkitLineClamp !== "none" && e.scrollHeight > e.clientHeight + 2;
    if (cutX || cutY || clampY) add("clipped-text", e, `"${txt.slice(0, 60)}" needs ${e.scrollWidth}x${e.scrollHeight}, has ${e.clientWidth}x${e.clientHeight}`);
  }
  // placeholders wider than their box
  const cv = document.createElement("canvas").getContext("2d");
  for (const e of vis.filter(e => e.matches("input[placeholder],textarea[placeholder]") && !e.value)) {
    const s = cs(e);
    cv.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const need = cv.measureText(e.placeholder).width;
    const have = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    if (need > have + 1) add("clipped-hint", e, `"${e.placeholder}" needs ${Math.ceil(need)}px, box has ${Math.floor(have)}px`);
  }

  // ---- text on top of text ----
  const boxes = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const visSet = new Set(vis);
  for (let n; (n = tw.nextNode());) {
    const el = n.parentElement; if (!el || !visSet.has(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    // text cut off by an overflow:hidden box only paints inside that box
    let clipR = null;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = cs(e); if (s.overflowX !== "visible" || s.overflowY !== "visible") { clipR = e.getBoundingClientRect(); break; }
    }
    for (const r0 of rg.getClientRects()) {
      let r = r0;
      if (clipR) { const L = Math.max(r0.left, clipR.left), R = Math.min(r0.right, clipR.right), T = Math.max(r0.top, clipR.top), B = Math.min(r0.bottom, clipR.bottom); r = { left: L, right: R, top: T, bottom: B, width: R - L, height: B - T }; }
      if (r.width > 2 && r.height > 2) boxes.push({ el, r, kind: "t", fx: fixedRoot(el) });
    }
  }
  for (const e of vis.filter(e => e.tagName.toLowerCase() === "svg" && !e.closest(".mark,.brand,.mapbox"))) {
    const r = e.getBoundingClientRect(); boxes.push({ el: e, r, kind: "i", fx: fixedRoot(e) });
  }
  boxes.sort((a, b) => a.r.top - b.r.top);
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j];
      if (B.r.top >= A.r.bottom) break;
      if (A.el === B.el || (A.kind === "i" && B.kind === "i")) continue;
      if (A.fx !== B.fx) continue; // content scrolling under a fixed bar is fine
      if (A.el.contains(B.el) || B.el.contains(A.el)) { if (A.kind === "t" && B.kind === "t") continue; }
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w <= 1 || h <= 1) continue;
      const small = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
      // line boxes of neighbouring lines can touch by a few px: need a real overlap
      if (w * h < Math.max(24, small * 0.25) || h < Math.min(A.r.height, B.r.height) * 0.4) continue;
      const k = selOf(A.el) + "|" + selOf(B.el); if (seen.has(k)) continue; seen.add(k);
      const ta = A.kind === "t" ? (A.el.innerText || "").trim().slice(0, 40) : "(icon)";
      const tb = B.kind === "t" ? (B.el.innerText || "").trim().slice(0, 40) : "(icon)";
      add("overlap", A.el, `"${ta}" overlaps "${tb}" at ${selOf(B.el)}`);
    }
  }

  // ---- tap targets ----
  const CTRL = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],[role=option],[tabindex]:not([tabindex='-1'])";
  for (const e of vis.filter(e => e.matches(CTRL))) {
    if (e.matches("h1,h2,h3,main,#main")) continue;
    let target = e;
    // a visually hidden checkbox/radio uses its label as the target
    if (e.matches("input[type=checkbox],input[type=radio]") && e.closest("label")) target = e.closest("label");
    const s = cs(e);
    // WCAG 2.5.8 exception: links inside a sentence
    if (e.tagName === "A" && s.display === "inline") {
      const p = e.parentElement; const own = p ? textOf(p) : "";
      if (own.length > 0 || (p && p.matches("p,li,dd,td,small,span,label"))) continue;
    }
    const r = target.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) add("tap-target", target, `${Math.round(r.width)}x${Math.round(r.height)}px "${(target.innerText || target.getAttribute("aria-label") || "").trim().slice(0, 40)}"`);
  }

  // ---- language ----
  const html = document.documentElement;
  if (html.lang !== lang) add("lang-attr", null, `<html lang="${html.lang}"> but the chosen language is ${lang}`);
  if (dir === "rtl" && cs(html).direction !== "rtl") add("rtl-dir", null, `page direction is ${cs(html).direction}`);
  const leak = new Set(enLeaks), keySet = new Set(keys);
  const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw2.nextNode());) {
    const el = n.parentElement; if (!el || !visSet.has(el)) continue;
    const t = n.textContent.replace(/\s+/g, " ").trim(); if (!t) continue;
    if (lang !== "en" && leak.has(t) && !el.closest("[lang=en]")) add("untranslated", el, t);
    for (const m of t.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) || []) if (keySet.has(m)) add("raw-key", el, m);
    if (/\{[a-zA-Z_]+\}/.test(t)) add("placeholder", el, t);
    if (/(^|\W)(undefined|NaN|null)(\W|$)|\[object \w+\]/.test(t)) add("bad-value", el, t);
  }
  // ---- digit order in right-to-left text ----
  if (dir === "rtl") {
    const tw3 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw3.nextNode());) {
      const el = n.parentElement; if (!el || !visSet.has(el)) continue;
      const txt = n.textContent;
      for (const m of txt.matchAll(/[0-9٠-٩۰-۹]+(?:[\s\-./:,()]+[0-9٠-٩۰-۹]+)+/g)) {
        // x position of the first digit of each group: must go left to right
        const groups = [...m[0].matchAll(/[0-9٠-٩۰-۹]+/g)];
        const xs = [];
        let line = null, ok = true;
        for (const g of groups) {
          const rg = document.createRange(); const at = m.index + g.index;
          rg.setStart(n, at); rg.setEnd(n, at + 1);
          const r = rg.getBoundingClientRect(); if (!r.width) { ok = false; break; }
          if (line === null) line = r.top; else if (Math.abs(r.top - line) > 4) { ok = false; break; } // wrapped: can't judge
          xs.push(r.left);
        }
        if (!ok || xs.length < 2) continue;
        if (xs.some((x, i) => i && x < xs[i - 1])) add("rtl-digits", el, `"${m[0].trim()}" shows its digit groups reversed`);
      }
    }
  }
  // ---- images ----
  for (const img of document.images) if (img.complete && img.naturalWidth === 0 && !hiddenish(img)) add("broken-image", img, img.currentSrc || img.src);
  return out;
}
