// The grid every check runs over. Keep LANGS in step with js/core.js.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const LANGS = [
  { code: "en", dir: "ltr", locale: "en-US" }, { code: "es", dir: "ltr", locale: "es-US" },
  { code: "zh-Hans", dir: "ltr", locale: "zh-CN" }, { code: "zh-Hant", dir: "ltr", locale: "zh-TW" },
  { code: "vi", dir: "ltr", locale: "vi-VN" }, { code: "fil", dir: "ltr", locale: "fil-PH" },
  { code: "ar", dir: "rtl", locale: "ar" }, { code: "ht", dir: "ltr", locale: "ht-HT" },
  { code: "ko", dir: "ltr", locale: "ko-KR" }, { code: "ru", dir: "ltr", locale: "ru-RU" },
  { code: "pt", dir: "ltr", locale: "pt-BR" }, { code: "fa-AF", dir: "rtl", locale: "fa-AF" },
  { code: "ps", dir: "rtl", locale: "ps-AF" }, { code: "so", dir: "ltr", locale: "so-SO" },
  { code: "uk", dir: "ltr", locale: "uk-UA" },
];
export const WIDTHS = [280, 320, 390, 768, 1024, 1440];
export const HEIGHT = w => (w >= 1024 ? 900 : w >= 768 ? 1024 : 800);
export const THEMES = ["light", "dark"];
// Folding phones and phones held sideways (iPhone Duo: outer screen, inner screen upright and sideways;
// any phone in landscape). Checked in light, every language. The gate checks the sideways inner screen,
// the one that switches to the computer layout below 960px.
export const FOLDS = [
  { id: "duo-outer", w: 382, h: 700 }, { id: "duo-inner", w: 669, h: 951 },
  { id: "duo-inner-wide", w: 951, h: 669 }, { id: "phone-sideways", w: 678, h: 466 },
];
export const folds = () => (QUICK || GATE ? FOLDS.filter(f => f.id === "duo-inner-wide") : FOLDS);
// same rule as DESK in js/core.js
export const isDesk = (w, h) => w >= 960 || (w >= 900 && h >= 540);

// QA_QUICK=1 (local runs): fewer combinations, same checks.
export const QUICK = !!process.env.QA_QUICK;
// QA_GATE=1 (before each deploy): every language, the three widths that break most, dark at phone size.
// The full grid runs on pull requests and every night.
export const GATE = !!process.env.QA_GATE;
export const langs = () => (QUICK ? LANGS.filter(l => ["en", "ar", "ru", "vi"].includes(l.code)) : LANGS);
export const widths = () => (QUICK || GATE ? [280, 390, 1440] : WIDTHS);
export const themesFor = w => (GATE || QUICK ? (w === 390 ? THEMES : ["light"]) : THEMES);

export const SITE_DIR = process.env.QA_SITE_DIR || new URL("../_site", import.meta.url).pathname;
export const BASE = process.env.QA_BASE_URL || "http://localhost:4173/";
export const LIVE = !BASE.includes("localhost");

const cache = {};
export function strings(code) {
  if (cache[code]) return cache[code];
  const root = new URL("../../i18n/", import.meta.url).pathname;
  return (cache[code] = JSON.parse(readFileSync(join(root, code + ".json"), "utf8")));
}
export function firstSiteId() {
  try {
    const r = JSON.parse(readFileSync(join(SITE_DIR, "data/regions/san-diego.json"), "utf8"));
    return (r.sites.find(s => s.k === "pantry" && s.ph) || r.sites[0]).id;
  } catch { return null; }
}
// A San Diego ZIP so Find food, Budget and Benefits all have real local data.
export const LOC = { zip: "92113", lat: 32.697, lon: -117.116, label: "92113", st: "CA", src: "zip" };
// And one outside San Diego County, to exercise the nationwide packs.
export const LOC_US = { zip: "78240", lat: 29.52, lon: -98.6, label: "78240", st: "TX", src: "zip" };
