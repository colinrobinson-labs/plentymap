/* Plenty Map core: state, device-only storage, i18n, formatting, icons, small UI helpers.
   Nothing here talks to any server except our own static files. */

import { MARKET } from "./config.js";
export const VERSION = "1.0.0";

export const LANGS = [
  { code: "en", name: "English", dir: "ltr", cuisine: "american" },
  { code: "es", name: "Español", dir: "ltr", cuisine: "latin" },
  { code: "zh-Hans", name: "简体中文", dir: "ltr", cuisine: "chinese" },
  { code: "zh-Hant", name: "繁體中文", dir: "ltr", cuisine: "chinese" },
  { code: "vi", name: "Tiếng Việt", dir: "ltr", cuisine: "vietnamese" },
  { code: "fil", name: "Tagalog", dir: "ltr", cuisine: "filipino" },
  { code: "ar", name: "العربية", dir: "rtl", cuisine: "middleeast" },
  { code: "ht", name: "Kreyòl ayisyen", dir: "ltr", cuisine: "haitian" },
  { code: "ko", name: "한국어", dir: "ltr", cuisine: "korean" },
  { code: "ru", name: "Русский", dir: "ltr", cuisine: "easteuro" },
  { code: "pt", name: "Português", dir: "ltr", cuisine: "brazilian" },
  { code: "fa-AF", name: "دری", dir: "rtl", cuisine: "afghan" },
  { code: "ps", name: "پښتو", dir: "rtl", cuisine: "afghan" },
  { code: "so", name: "Soomaali", dir: "ltr", cuisine: "somali" },
  { code: "uk", name: "Українська", dir: "ltr", cuisine: "easteuro" },
];
export const LANG = Object.fromEntries(LANGS.map(l => [l.code, l]));

/* ---------- device-only storage ---------- */
const P = "pm.";
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* storage full or blocked: app still works */ } },
  del(k) { try { localStorage.removeItem(P + k); } catch {} },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); } catch {} },
};

/* ---------- state ---------- */
export const S = {
  lang: store.get("lang"),
  loc: store.get("loc"),                // {zip, lat, lon, label, src: "zip"|"gps"|"place"}
  kit: store.get("kit", ["stove", "micro"]), // stove (stove + oven), hotplate, micro. [] = no heat
  maxCost: store.get("maxCost", 0),     // per serving, 0 = any
  comfort: store.get("comfort", 2),     // 1 easy, 2 some cooking, 3 likes to cook
  cuisine: store.get("cuisine", null),  // null = use the language default
  diet: store.get("diet", "any"),       // any, veg, vegan, halal, kosher
  avoid: new Set(store.get("avoid", [])), // gluten, dairy, egg, peanut, soy, fish, salt (lower sodium)
  have: new Set(store.get("have", [])),
  saved: new Set(store.get("saved", [])),
  hh: store.get("hh", { a: 1, k: 0 }),
  weekly: store.get("weekly", null),    // weekly food budget in dollars, null = suggest
  meals: store.get("meals", { b: 1, l: 1, d: 1 }),
  plan: store.get("plan", null),
  got: new Set(store.get("got", [])),
  extra: store.get("extra", {}),        // shopping-list items added from recipes: {id: qty}
  prices: store.get("prices", {}),
  senior: store.get("senior", false),
  theme: store.get("theme", "auto"),
};
export function save(k) {
  const v = S[k];
  store.set(k, v instanceof Set ? [...v] : v);
}
export const langDefaultCuisine = () => LANG[S.lang]?.cuisine || "american";
export const activeCuisine = () => S.cuisine || langDefaultCuisine();

/* ---------- i18n ---------- */
let STR = {}, EN = {}, REC = {}, REC_EN = {};
const cache = {};
const SITE = "https://plentymap.com/"; // keep in step with js/config.js
async function getJSON(url) {
  if (cache[url]) return cache[url];
  // Phone apps ship with a copy of the data and pick up the nightly update from our site when online.
  if (/^data\//.test(url) && window.Capacitor?.isNativePlatform?.()) {
    try {
      const r = await fetch(SITE + url, { cache: "no-cache", signal: AbortSignal.timeout(6000) });
      if (r.ok) return (cache[url] = await r.json());
    } catch { /* offline or site down: use the copy inside the app */ }
  }
  const r = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout?.(15000) });
  if (!r.ok) throw new Error(url + " " + r.status);
  return (cache[url] = await r.json());
}
export async function loadLang(code) {
  if (!LANG[code]) code = "en";
  const [en, cur, ren, rcur] = await Promise.all([
    getJSON("i18n/en.json"), code === "en" ? null : getJSON(`i18n/${code}.json`).catch(() => null),
    getJSON("i18n/recipes/en.json"), code === "en" ? null : getJSON(`i18n/recipes/${code}.json`).catch(() => null),
  ]);
  EN = en; STR = cur || en; REC_EN = ren; REC = rcur || ren;
  S.lang = code;
  const l = LANG[code];
  document.documentElement.lang = code;
  document.documentElement.dir = l.dir;
}
const PR = {};
const plural = (n) => (PR[S.lang] ||= new Intl.PluralRules(S.lang)).select(n);
/* Text-wide values: {snap} is the name people know food money by where they are (CalFresh, SNAP...). */
export const VARS = { snap: "CalFresh" };
export function t(k, v) {
  let s;
  if (v && typeof v.n === "number") {
    const f = k + "_" + plural(v.n);
    s = STR[f] ?? STR[k + "_other"] ?? EN[f] ?? EN[k + "_other"];
  }
  s ??= STR[k] ?? EN[k] ?? k;
  if (v) for (const x in v) s = s.split("{" + x + "}").join(x === "n" ? num(v[x]) : v[x]);
  if (s.includes("{snap}")) s = s.split("{snap}").join(VARS.snap);
  if (LANG[S.lang]?.dir === "rtl") s = s.replace(/\d+(?:[-\u2013]\d+)+/g, m => "\u2066" + m + "\u2069");
  return s;
}
export const hasT = k => k in STR || k in EN;
/* recipe text: {t: title, s: [steps], tip} */
export const rt = id => REC[id] || REC_EN[id] || { t: id, s: [], tip: "" };
export const ingName = id => REC.ing?.[id] ?? REC_EN.ing?.[id] ?? id;
export const ingNameEn = id => REC_EN.ing?.[id] ?? id;
export const unitName = (u, n) => {
  const tbl = REC.units?.[u] ?? REC_EN.units?.[u];
  if (!tbl) return u;
  return typeof tbl === "string" ? tbl : (tbl[plural(n)] ?? tbl.other ?? tbl.one);
};
/* Is the current language's recipe text complete for this recipe? */
export const recipeInLang = id => !!REC[id];

/* ---------- formatting (Latin digits everywhere so prices, phones and addresses match) ---------- */
const NF = {};
const nfo = (o) => { const k = S.lang + JSON.stringify(o); return (NF[k] ||= new Intl.NumberFormat(S.lang + "-u-nu-latn", o)); };
export const num = (n, d = 0) => nfo({ maximumFractionDigits: d }).format(n);
/* Money always goes through the active market's currency (config.js), shown in the reader's language. */
export const money = (v, cents = true) => nfo({ style: "currency", currency: MARKET.currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(v);
export function dateFmt(d, o) { return new Intl.DateTimeFormat(S.lang + "-u-nu-latn", { timeZone: "America/Los_Angeles", ...o }).format(d); }
export const dayName = (wd, style = "long") => dateFmt(new Date(Date.UTC(2024, 0, 7 + wd, 20)), { weekday: style }); // 2024-01-07 was a Sunday
export function timeFmt(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return dateFmt(new Date(Date.UTC(2024, 0, 10, h + 8, m)), { hour: "numeric", minute: m ? "2-digit" : undefined });
}
export const miles = (m) => {
  const mi = m / 1609.34;
  if (mi < 0.1) return S.loc?.src === "gps" ? t("dist_here") : t("dist_mi", { d: "< " + num(0.1, 1) });
  return t("dist_mi", { d: num(mi, mi < 10 ? 1 : 0) });
};

/* ---------- html ---------- */
export const tidyCaps = s => !s || /[a-z]/.test(s) ? s ?? "" : s.toLowerCase().replace(/(^|[\s\-\/(#])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ne|Nw|Se|Sw|Po)\b/g, m => m.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, n, x) => n + x.toLowerCase());
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
// full numbers, and the 3-digit N11 lines (2-1-1)
export const telHref = p => { const d = String(p || "").replace(/[^\d+]/g, ""); return d.length >= 7 || /^[2-8]11$/.test(d) ? "tel:" + d : ""; };

let toastT;
export function toast(msg, act) {
  document.querySelector(".toast")?.remove();
  const d = document.createElement("div");
  d.className = "toast"; d.setAttribute("role", "status"); d.textContent = msg;
  // an optional link, e.g. to where the thing just went
  if (act) {
    const a = document.createElement(act.href ? "a" : "button");
    if (act.href) a.href = act.href; else { a.type = "button"; a.className = "link"; }
    a.textContent = act.label; a.onclick = () => { act.go?.(); d.remove(); }; d.append(" ", a);
  }
  document.body.appendChild(d);
  clearTimeout(toastT); if (!act?.stay) toastT = setTimeout(() => d.remove(), act ? 6000 : 2600);
}
/* Announce to screen readers without a visual toast */
export function announce(msg) {
  const r = document.getElementById("live");
  if (!r) return;
  r.textContent = ""; setTimeout(() => (r.textContent = msg), 50);
}

/* ---------- icons: drawn in icons.js (round 3 set) ---------- */
export { ico, dish, KIND_GLYPH } from "./icons.js";
import { ico } from "./icons.js";
/* The little box, dot or cross at the start of a choice: tells people at a glance what kind of choice it is */
export const mark = kind => `<span class="mk mk-${kind}" aria-hidden="true">${kind === "out" ? ico("x") : kind === "ck" ? ico("check") : ""}</span>`;

/* The Plenty Map mark (main + small partner mark), drawn inline so it never needs a request. */
export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 62 L14.45 38.76 A22 22 0 1 1 49.55 38.76 Z" fill="#F1EBDD"/><circle cx="32" cy="25.5" r="16.5" fill="#1F3B2D"/><g fill="none" stroke-width="2.8" stroke-linecap="round"><path d="M28.55 24.61 A4.5 4.5 0 0 1 35.45 24.61" stroke="#F5C04A"/><path d="M25.49 22.04 A8.5 8.5 0 0 1 38.51 22.04" stroke="#F7CF6E"/><path d="M22.42 19.46 A12.5 12.5 0 0 1 41.58 19.46" stroke="#F9DE9C"/></g><path d="M20.5 29.5 H43.5 A11.5 8.5 0 0 1 20.5 29.5 Z" fill="#F1EBDD"/><rect x="28" y="38.8" width="8" height="2" rx="1" fill="#F1EBDD"/></svg>`;

/* Geo */
export function dist(a, b, c, d) {
  const R0 = 6371e3, p = Math.PI / 180;
  const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 2 * R0 * Math.asin(Math.sqrt(x));
}

/* Data files (our own static files only) */
export const fetchJSON = getJSON;

/* Native bridges: Capacitor when inside the app, web APIs otherwise. */
export const native = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor : null;
/* Native plugins are reached through the Capacitor bridge; no npm bundle needed in the web code. */
const PLUG = {};
const plugin = name => { const C = native(); if (!C) return null; return (PLUG[name] ||= C.Plugins?.[name] || C.registerPlugin?.(name) || null); };
export async function shareThing({ title, text, url }) {
  try {
    const Sh = plugin("Share");
    if (Sh) { await Sh.share({ title, text, url, dialogTitle: title }); return true; }
    if (navigator.share) { await navigator.share({ title, text, url }); return true; }
    await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n"));
    toast(t("copied"));
    return true;
  } catch { return false; }
}
export async function getPosition() {
  const G = plugin("Geolocation");
  if (G) {
    const p = await G.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    return { lat: p.coords.latitude, lon: p.coords.longitude };
  }
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("nogeo"));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
      e => rej(e), { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });
}
/* Links that leave the app (directions, program sites) open in the system browser/maps app. */
export function openOut(url) {
  const B = plugin("Browser");
  if (B && /^https:/.test(url)) return B.open({ url });
  window.open(url, "_blank", "noopener,noreferrer");
}
