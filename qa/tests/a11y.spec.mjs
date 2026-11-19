// axe-core accessibility rules (WCAG 2.2 A/AA) on every screen, every language, phone and desktop, light and dark.
import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { langs, QUICK, GATE } from "../lib/matrix.mjs";
import { screens } from "../lib/screens.mjs";
import { seed, watch, waitReady, openRoute, attach } from "../lib/harness.mjs";

const SIZES = [{ w: 390, h: 800 }, { w: 1440, h: 900 }];
for (const L of langs()) for (const theme of ["light", "dark"]) {
  if ((QUICK || GATE) && theme === "dark" && !["en", "ar"].includes(L.code)) continue;
  test(`axe ${L.code} ${theme}`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const problems = [];
    for (const { w, h } of SIZES) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, locale: L.locale, serviceWorkers: "block" });
      await seed(context, { lang: L.code });
      const page = await context.newPage();
      const cur = { id: "load" }; watch(page, [], cur);
      for (const sc of screens({ wide: w >= 960 })) {
        cur.id = sc.id;
        try {
          await openRoute(page, sc.go);
          await waitReady(page, L.code, sc.act ? null : sc.ready);
          if (sc.act) { await sc.act(page); await waitReady(page, L.code, sc.ready); }
          const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
            .exclude(".maplibregl-canvas").analyze();
          for (const v of r.violations) for (const n of v.nodes) problems.push({
            // target-size depends on what's scrolled under the fixed tab bar at scan time, so it can flicker run to run:
            // reported with the other tap-target findings, never blocking
            check: v.id === "target-size" ? "axe-target-size" : "axe-" + (v.impact || "minor"), screen: sc.id, sel: [].concat(n.target).join(" ").slice(0, 160),
            detail: `${v.id}: ${v.help}. ${(n.failureSummary || "").replace(/\s+/g, " ").slice(0, 160)}`, width: w, theme,
          });
        } catch (e) { problems.push({ check: "screen-failed", screen: sc.id, sel: "", detail: String(e.message || e).split("\n")[0], width: w, theme }); }
      }
      await context.close();
    }
    await attach(testInfo, problems, { suite: "a11y", lang: L.code });
  });
}
