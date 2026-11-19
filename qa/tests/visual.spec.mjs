// Screenshots compared with the approved ones (stored on the qa-baselines branch).
// Data and the clock are frozen so only design changes show up. The map itself is masked: tiles render differently run to run.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { langs, QUICK } from "../lib/matrix.mjs";
import { screens } from "../lib/screens.mjs";
import { seed, waitReady, openRoute } from "../lib/harness.mjs";

const FIX = new URL("../fixtures/", import.meta.url).pathname;
const FROZEN = new Date("2026-11-18T19:00:00Z"); // a Wednesday, 11am in San Diego
const SHOTS = ["cook", "recipe", "budget", "budget-swap", "find", "find-free", "benefits", "benefits-result", "settings", "about", "language"];
// every language at three looks (top of screen); English and Arabic also full length
const COMBOS = [
  { w: 320, h: 720, theme: "light" }, { w: 390, h: 844, theme: "dark" }, { w: 1440, h: 900, theme: "light" },
];
const FULL = ["en", "ar"];

for (const L of langs()) for (const c of COMBOS) {
  if (QUICK && c.w !== 390) continue;
  test(`visual ${L.code} ${c.w}px ${c.theme}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: c.w, height: c.h }, colorScheme: c.theme, locale: L.locale, serviceWorkers: "block", reducedMotion: "reduce" });
    await seed(context, { lang: L.code });
    await context.route(/\/data\/regions\/(san-diego|index)\.json/, r => r.fulfill({ contentType: "application/json", body: readFileSync(FIX + r.request().url().split("/").pop().split("?")[0]) }));
    // same "random" meal plan and swap ideas every run
    await context.addInitScript(() => { let x = 20261118; Math.random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); });
    const page = await context.newPage();
    await page.clock.setFixedTime(FROZEN);
    const list = screens({ wide: c.w >= 960 }).filter(s => SHOTS.includes(s.id));
    for (const sc of list) {
      await test.step(sc.id, async () => {
        await openRoute(page, sc.go);
        await waitReady(page, L.code, sc.act ? null : sc.ready);
        if (sc.act) { await sc.act(page); await waitReady(page, L.code, sc.ready); }
        const opts = { mask: [page.locator(".mapbox, .maplibregl-canvas")], fullPage: false };
        await expect.soft(page).toHaveScreenshot(`${L.code}/${sc.id}-${c.w}-${c.theme}.png`, opts);
        if (FULL.includes(L.code) && c.theme === "light")
          await expect.soft(page).toHaveScreenshot(`${L.code}/${sc.id}-${c.w}-${c.theme}-full.png`, { ...opts, fullPage: true });
      });
    }
    await context.close();
  });
}
