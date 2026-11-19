// Every link and file the app points to: our own pages and files must load; outside links (food banks, benefits
// sites, store sites) are checked too when QA_EXTERNAL=1 (nightly), since those sites are slower and sometimes block robots.
// Phone links must be dialable numbers.
import { test } from "@playwright/test";
import { langs, LOC_US, BASE, GATE } from "../lib/matrix.mjs";
import { screens } from "../lib/screens.mjs";
import { seed, waitReady, openRoute, attach } from "../lib/harness.mjs";

const EXTERNAL = !!process.env.QA_EXTERNAL;
test("links", async ({ browser, request }, testInfo) => {
  test.setTimeout(600_000);
  const found = new Map(); // url -> first screen seen
  const problems = [];
  // before a deploy, English and Arabic cover every link the app builds; nightly checks every language
  const list = GATE ? langs().filter(l => ["en", "ar"].includes(l.code)) : langs();
  for (const L of list) for (const loc of [undefined, LOC_US]) {
    if (loc && !["en", "es"].includes(L.code)) continue;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    await seed(context, { lang: L.code, ...(loc ? { loc } : {}) });
    const page = await context.newPage();
    for (const sc of screens({ wide: true })) {
      try {
        await openRoute(page, sc.go);
        await waitReady(page, L.code, sc.act ? null : sc.ready);
        if (sc.act) await sc.act(page);
        // expand "show more" once so more listings' links are seen
        const more = page.locator("#fmore button, #more").first();
        if (await more.count().catch(() => 0)) await more.click({ timeout: 2000 }).catch(() => {});
        const hrefs = await page.$$eval("a[href]", as => as.map(a => a.getAttribute("href")));
        for (const h of hrefs) if (h && !found.has(h)) found.set(h, `${sc.id} (${L.code}${loc ? ", TX" : ""})`);
      } catch {}
    }
    await context.close();
  }
  for (const [href, where] of found) {
    if (href.startsWith("#")) continue;
    if (href.startsWith("tel:")) {
      const d = href.slice(4).replace(/[^\d+]/g, "");
      if (!/^(\+?1)?\d{10}$/.test(d) && !/^\d{3}$/.test(d)) problems.push({ check: "broken-link", screen: where, sel: "", detail: `phone link doesn't dial: ${href}` });
      continue;
    }
    if (/^(mailto|sms|geo|maps):/.test(href)) continue;
    const url = new URL(href, BASE).href;
    const own = url.startsWith(new URL(BASE).origin) || url.startsWith("https://plentymap.com");
    if (!own && !EXTERNAL) continue;
    let status = 0, err = "";
    for (const method of ["head", "get"]) {
      try {
        const r = await request[method](url, { timeout: 20000, maxRedirects: 8, failOnStatusCode: false, headers: { "User-Agent": "Mozilla/5.0 (compatible; PlentyMapLinkCheck/1.0; +https://plentymap.com/support/)" } });
        status = r.status(); if (status < 400) break;
      } catch (e) { err = String(e.message || e).split("\n")[0]; }
    }
    if (status >= 200 && status < 400) continue;
    // 401/403/429 from big sites usually means "no robots", not "gone"
    const blocked = [401, 403, 405, 429, 999].includes(status);
    problems.push({ check: own ? "broken-link" : blocked ? "external-link" : "external-link", screen: where, sel: "", detail: `${status || err} ${url}${blocked ? " (site may block robots)" : ""}` });
  }
  testInfo.annotations.push({ type: "links", description: `${found.size} distinct links checked` });
  await attach(testInfo, problems, { suite: "links" });
});
