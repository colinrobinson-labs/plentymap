// Shared set-up: seeds the device the way a returning visitor's phone looks, watches the console and network,
// and walks screens. Problems are attached to the test as JSON; scripts/triage.mjs decides what blocks.
import { runChecks } from "./checks.mjs";
import { strings, LOC, BASE, LIVE } from "./matrix.mjs";

const SELF = new URL(BASE).origin;
// The privacy promise: the phone talks only to plentymap.com (and its own tile host).
const ALLOWED_HOSTS = [new URL(BASE).host, "plentymap.com", "tiles.plentymap.com"];

export async function seed(context, { lang, loc = LOC, theme = "auto", extra = {} }) {
  await context.addInitScript(([lang, loc, theme, extra]) => {
    if (location.protocol === "about:") return;
    try { if (sessionStorage.getItem("pm.qa.seeded")) return; sessionStorage.setItem("pm.qa.seeded", "1"); } catch { return; } // keep what the app saves after the first load
    if (lang) localStorage.setItem("pm.lang", JSON.stringify(lang));
    if (loc) localStorage.setItem("pm.loc", JSON.stringify(loc));
    localStorage.setItem("pm.setupDone", "true");
    localStorage.setItem("pm.theme", JSON.stringify(theme));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem("pm." + k, JSON.stringify(v));
  }, [lang, loc, theme, extra]);
}

export function watch(page, problems, screenRef) {
  const at = () => screenRef.id || "load";
  page.on("console", m => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // reported with its URL by the response handler
    // the R2 tile host only allows plentymap.com, so a local test server is refused by CORS (the app falls back to its own tiles)
    if (!LIVE && /tiles\.plentymap\.com/.test(t) && /CORS|Access-Control|Failed to fetch/i.test(t)) return;
    problems.push({ check: "console-error", screen: at(), sel: "", detail: t.slice(0, 300) });
  });
  page.on("pageerror", e => problems.push({ check: "js-error", screen: at(), sel: "", detail: (e.message || String(e)).slice(0, 300) }));
  page.on("response", r => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(SELF)) problems.push({ check: "broken-asset", screen: at(), sel: "", detail: `${r.status()} ${u.replace(SELF, "")}` });
  });
  page.on("requestfailed", r => {
    const err = r.failure()?.errorText || "";
    if (/ERR_ABORTED|cancelled/i.test(err)) return; // the app or a navigation cancelled it
    if (r.url().startsWith(SELF)) problems.push({ check: "broken-asset", screen: at(), sel: "", detail: `${err} ${r.url().replace(SELF, "")}` });
  });
  page.on("request", r => {
    const u = new URL(r.url());
    if (!/^https?:$/.test(u.protocol)) return;
    if (!ALLOWED_HOSTS.includes(u.host)) problems.push({ check: "third-party-request", screen: at(), sel: "", detail: `${r.method()} ${u.origin}${u.pathname}` });
  });
}

export async function waitReady(page, lang, ready) {
  const loading = strings(lang).loading || "Loading…";
  await page.waitForFunction(([loading, ready]) => {
    const m = document.querySelector("#main");
    const welcome = document.querySelector("#welcome:not([hidden])");
    if (ready) return !!document.querySelector(ready);
    if (welcome && welcome.innerHTML) return true;
    return m && m.children.length && !m.textContent.includes(loading);
  }, [loading, ready], { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
}

export function i18nArgs(lang, dir) {
  const L = strings(lang), E = strings("en");
  const keys = Object.keys(E).filter(k => k !== "_meta");
  // English strings that, shown in another language, mean someone forgot to translate.
  // Only longer phrases, and only where the translation really differs.
  const enLeaks = lang === "en" ? [] : keys
    .filter(k => typeof E[k] === "string" && L[k] && L[k] !== E[k] && E[k].length >= 12 && E[k].includes(" ") && !E[k].includes("{"))
    .map(k => E[k].replace(/\s+/g, " ").trim());
  return { lang, dir, enLeaks, keys };
}

export async function check(page, { lang, dir, screen, skip = [] }) {
  const found = await page.evaluate(runChecks, { ...i18nArgs(lang, dir), skip: [".mapbox canvas", ".maplibregl-ctrl-attrib", ...skip] });
  return found.map(p => ({ ...p, screen }));
}

// A fresh load per screen, so one screen's open panel can't leak into the next.
// (A hash-only goto is a same-page navigation in browsers, so leave the page first.)
export async function openRoute(page, hash) {
  if (page.url() !== "about:blank") await page.goto("about:blank");
  await page.goto(BASE + hash, { waitUntil: "domcontentloaded" });
}

export function attach(testInfo, problems, meta) {
  return testInfo.attach("qa-problems.json", { body: JSON.stringify({ meta, problems }), contentType: "application/json" });
}
export { LIVE };
