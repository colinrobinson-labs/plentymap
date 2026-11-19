// Every screen and state the layout checks visit, in order, inside one page.
// `go` is the hash route; `act` (optional) puts the screen into a state (opens a panel, fills a form...).
import { firstSiteId } from "./matrix.mjs";

const click = sel => async page => { const el = page.locator(sel).first(); if (await el.count()) await el.click(); };

export function screens({ wide }) {
  const site = firstSiteId();
  return [
    { id: "cook", go: "#/cook" },
    { id: "cook-filters", go: "#/cook", act: async page => {
        // phones fold the filters away: open every fold
        for (let i = 0; i < 6; i++) {
          const s = page.locator("#filters details:not([open]) > summary").filter({ visible: true }).first();
          if (!(await s.count())) break;
          await s.click({ timeout: 3000 }).catch(() => {});
        }
      } },
    { id: "recipe", go: "#/cook/dal", ready: "#sheet-h" },
    { id: "budget", go: "#/budget" },
    { id: "budget-swap", go: "#/budget", act: click("[data-swap]"), ready: "#swap-h" },
    { id: "find", go: "#/find" },
    { id: "find-free", go: "#/find/in/free" },
    { id: "find-map", go: "#/find", act: async page => { if (!wide) await click('[data-view="map"]')(page); await page.waitForTimeout(1500); } },
    ...(site ? [{ id: "find-place", go: "#/find/" + encodeURIComponent(site) }] : []),
    { id: "benefits", go: "#/help" },
    { id: "benefits-result", go: "#/help", act: async page => {
        await page.fill("#inc", "1800"); await page.locator("#qs [type=submit]").first().click(); await page.waitForTimeout(300);
      } },
    { id: "settings", go: "#/settings" },
    { id: "privacy", go: "#/privacy" },
    { id: "about", go: "#/about" },
    { id: "language", go: "#/cook", act: click("#langbtn"), ready: "#w-pick", modal: true },
  ];
}
