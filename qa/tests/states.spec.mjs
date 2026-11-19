// The screens a returning visitor never sees, and the ones that only show when something goes wrong:
// first-run language picker and "Where are you?" in every language and width, data that fails to load,
// data that's slow, empty results, offline, a place outside the U.S., nationwide (non-San Diego) listings,
// and the static pages (privacy, support, 404).
import { test, expect } from "@playwright/test";
import { langs, widths, HEIGHT, LOC_US, BASE } from "../lib/matrix.mjs";
import { seed, watch, waitReady, check, attach } from "../lib/harness.mjs";

const ctxFor = (browser, w, L, theme = "light") =>
  browser.newContext({ viewport: { width: w, height: HEIGHT(w) }, colorScheme: theme, locale: L.locale, serviceWorkers: "block", hasTouch: w < 1024 });

// ---- first run, per language: the phone's language decides the first screen ----
for (const L of langs()) {
  test(`first run ${L.code}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const problems = [];
    for (const w of widths()) for (const theme of ["light", "dark"]) {
      if (theme === "dark" && ![320, 1440].includes(w)) continue;
      const context = await ctxFor(browser, w, L, theme);
      const page = await context.newPage();
      const cur = { id: "welcome" }; const mine = [];
      watch(page, mine, cur);
      try {
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#welcome:not([hidden]) .langmain", { timeout: 15000 });
        await page.evaluate(() => document.fonts?.ready);
        // the welcome screen's own language: the one the phone asks for
        const shown = await page.locator(".langmain").getAttribute("data-l");
        if (shown !== L.code) mine.push({ check: "first-run-failed", screen: "welcome", sel: ".langmain", detail: `phone asks for ${L.code} (${L.locale}) but the picker leads with ${shown}` });
        mine.push(...await check(page, { lang: "en", dir: "ltr", screen: "welcome" }).then(ps => ps.filter(p => !["lang-attr", "untranslated"].includes(p.check))));
        cur.id = "setup";
        await page.locator(".langmain").click();
        await page.waitForSelector("#setup-h", { timeout: 10000 });
        await waitReady(page, L.code, "#setup-h");
        mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "setup" }));
        // a ZIP that isn't real gets a clear message, not a crash
        await page.fill("#s-q", "00000"); await page.locator("#s-form [type=submit]").click();
        await page.waitForTimeout(600);
        mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "setup-bad-zip" }));
        cur.id = "setup-done";
        await page.fill("#s-q", "92113"); await page.locator("#s-form [type=submit]").click();
        await page.waitForSelector("#app:not([hidden]) #main h1", { timeout: 15000 });
      } catch (e) {
        mine.push({ check: "first-run-failed", screen: cur.id, sel: "", detail: String(e.message || e).split("\n")[0] });
      }
      problems.push(...mine.map(p => ({ ...p, width: w, theme })));
      await context.close();
    }
    await attach(testInfo, problems, { suite: "states", lang: L.code });
  });
}

// ---- when things go wrong (English and Arabic, phone and desktop) ----
const STATE_LANGS = langs().filter(l => ["en", "ar"].includes(l.code));
for (const L of STATE_LANGS) for (const w of [320, 1440]) {
  test(`trouble states ${L.code} ${w}px`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const problems = [];
    const run = async (id, fn, { abort, slow, offline, loc } = {}) => {
      const context = await ctxFor(browser, w, L);
      await seed(context, { lang: L.code, ...(loc ? { loc } : {}) });
      if (abort) await context.route(abort, r => r.abort("failed"));
      if (slow) await context.route(slow, async r => { await new Promise(res => setTimeout(res, 4000)); r.continue().catch(() => {}); });
      const page = await context.newPage();
      const mine = [], cur = { id };
      watch(page, mine, cur);
      try { await fn(page, mine); } catch (e) { mine.push({ check: "state-failed", screen: id, sel: "", detail: String(e.message || e).split("\n")[0] }); }
      if (offline) await context.setOffline(false);
      // on purpose: failed loads and their console lines are the point of these states
      problems.push(...mine.filter(p => !(abort && ["broken-asset", "console-error", "js-error"].includes(p.check))).map(p => ({ ...p, width: w })));
      await context.close();
    };
    // the listings file fails: Find food must say so and offer Try again + 2-1-1, never sit on "Loading…"
    await run("find-data-failed", async (page, mine) => {
      await page.goto(BASE + "#/find", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      const txt = await page.locator("#main").innerText();
      const hasRetry = await page.locator("#main button, #main a[href^='tel:']").count();
      if (!hasRetry) mine.push({ check: "state-failed", screen: "find-data-failed", sel: "#main", detail: `no retry or call button when data fails: "${txt.slice(0, 120)}"` });
      mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "find-data-failed" }));
    }, { abort: /\/data\/(regions|us)\// });
    // slow network: the loading state itself must look right
    await run("find-loading", async (page, mine) => {
      await page.goto(BASE + "#/find", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "find-loading" }));
    }, { slow: /\/data\/(regions|us)\// });
    // a recipe link that doesn't exist goes back to the list instead of a blank screen
    await run("recipe-missing", async (page, mine) => {
      await page.goto(BASE + "#/cook/not-a-recipe", { waitUntil: "domcontentloaded" });
      await waitReady(page, L.code);
      if (!(await page.locator("#main h1").count())) mine.push({ check: "state-failed", screen: "recipe-missing", sel: "", detail: "blank screen for an unknown recipe" });
    });
    // empty: filters that match nothing
    await run("cook-empty", async (page, mine) => {
      await page.goto(BASE + "#/cook", { waitUntil: "domcontentloaded" });
      await waitReady(page, L.code);
      mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "cook-empty" }));
    }, {});
    // outside San Diego: nationwide packs
    await run("find-nationwide", async (page, mine) => {
      await page.goto(BASE + "#/find", { waitUntil: "domcontentloaded" });
      await waitReady(page, L.code);
      await page.waitForTimeout(800);
      const n = await page.locator("#flist > li").count();
      if (!n) mine.push({ check: "state-failed", screen: "find-nationwide", sel: "#flist", detail: "no listings for San Antonio, TX (78240)" });
      mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "find-nationwide" }));
      await page.goto(BASE + "#/help", { waitUntil: "domcontentloaded" });
      await waitReady(page, L.code);
      mine.push(...await check(page, { lang: L.code, dir: L.dir, screen: "benefits-nationwide" }));
    }, { loc: LOC_US });
    // offline: the banner shows, saved screens still open
    await run("offline", async (page, mine) => {
      await page.goto(BASE + "#/cook", { waitUntil: "domcontentloaded" });
      await waitReady(page, L.code);
      await page.context().setOffline(true);
      await page.waitForTimeout(400);
      if (await page.locator("#offline").isHidden()) mine.push({ check: "state-failed", screen: "offline", sel: "#offline", detail: "no offline notice" });
      mine.push(...(await check(page, { lang: L.code, dir: L.dir, screen: "offline" })).filter(p => p.check !== "broken-asset"));
    }, { offline: true });
    await attach(testInfo, problems, { suite: "states", lang: L.code, width: w });
  });
}

// ---- the plain pages ----
for (const path of ["privacy/", "support/", "this-page-does-not-exist"]) {
  test(`page ${path}`, async ({ browser }, testInfo) => {
    const problems = [];
    for (const w of [280, 390, 1440]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: theme, serviceWorkers: "block" });
      const page = await context.newPage();
      const mine = [], cur = { id: path };
      watch(page, mine, cur);
      const res = await page.goto(BASE + path, { waitUntil: "load" });
      if (path !== "this-page-does-not-exist" && (!res || res.status() >= 400)) mine.push({ check: "broken-link", screen: path, sel: "", detail: `${res?.status()} ${path}` });
      const lang = await page.evaluate(() => document.documentElement.lang || "en");
      mine.push(...(await check(page, { lang, dir: "ltr", screen: path })).filter(p => p.check !== "broken-asset" || path !== "this-page-does-not-exist" || !p.detail.includes(path)));
      problems.push(...mine.filter(p => !(path === "this-page-does-not-exist" && p.check === "broken-asset" && p.detail.includes(path))).map(p => ({ ...p, width: w, theme })));
      await context.close();
    }
    await attach(testInfo, problems, { suite: "states" });
  });
}

// ---- the phone's Back button with a panel open must close the panel, never leave the app frozen under it ----
test("back button closes panels", async ({ browser }, testInfo) => {
  const problems = [];
  const panels = [
    { id: "budget-swap", from: "#/cook", go: "#/budget", open: "[data-swap]", panel: "#swap-h" },
    { id: "language", from: "#/budget", go: "#/cook", open: "#langbtn", panel: "#w-pick" },
    { id: "recipe", from: "#/budget", go: "#/cook", open: "[data-r]", panel: "#sheet-h" },
  ];
  for (const P of panels) {
    const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block", hasTouch: true });
    await seed(context, { lang: "en" });
    const page = await context.newPage();
    try {
      await page.goto(BASE + P.from); await waitReady(page, "en");
      await page.goto(BASE + P.go); await waitReady(page, "en");
      await page.locator(P.open).first().click(); await page.waitForSelector(P.panel, { timeout: 8000 });
      await page.goBack(); await page.waitForTimeout(1000);
      const st = await page.evaluate(sel => ({ open: !!document.querySelector(sel) && !document.querySelector(sel).closest("[hidden]"), inert: !!document.querySelector("#app")?.inert, hash: location.hash }), P.panel);
      if (st.open || st.inert) problems.push({ check: "state-failed", screen: "back-" + P.id, sel: P.panel, detail: `after Back the ${P.id} panel is ${st.open ? "still open" : "gone"} and the app is ${st.inert ? "frozen (inert)" : "usable"} on ${st.hash}` });
    } catch (e) { problems.push({ check: "state-failed", screen: "back-" + P.id, sel: "", detail: String(e.message || e).split("\n")[0] }); }
    await context.close();
  }
  await attach(testInfo, problems, { suite: "states", lang: "en", width: 390 });
});
