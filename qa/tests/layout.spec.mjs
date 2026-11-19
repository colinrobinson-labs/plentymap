// Every screen, in every language, at every width, light and dark:
// nothing sideways-scrolls, nothing is cut off or drawn on top of something else, every control is big enough to tap,
// right-to-left languages keep numbers in order, no English or raw keys leak, no script errors or broken files.
import { test } from "@playwright/test";
import { langs, widths, themesFor, HEIGHT } from "../lib/matrix.mjs";
import { screens } from "../lib/screens.mjs";
import { seed, watch, waitReady, check, openRoute, attach } from "../lib/harness.mjs";

for (const L of langs()) for (const w of widths()) for (const theme of themesFor(w)) {
  test(`${L.code} ${w}px ${theme}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: w, height: HEIGHT(w) }, colorScheme: theme, locale: L.locale, serviceWorkers: "block", hasTouch: w < 1024 });
    await seed(context, { lang: L.code });
    const page = await context.newPage();
    const problems = [], cur = { id: "load" };
    watch(page, problems, cur);
    for (const sc of screens({ wide: w >= 960 })) {
      cur.id = sc.id;
      await test.step(sc.id, async () => {
        try {
          await openRoute(page, sc.go);
          await waitReady(page, L.code, sc.act ? null : sc.ready);
          if (sc.act) { await sc.act(page); await waitReady(page, L.code, sc.ready); }
          problems.push(...await check(page, { lang: L.code, dir: L.dir, screen: sc.id }));
        } catch (e) {
          if (process.env.QA_DEBUG) console.log(sc.id, e.message);
          problems.push({ check: "screen-failed", screen: sc.id, sel: "", detail: String(e.message || e).split("\n")[0].slice(0, 300) });
        }
      });
    }
    await attach(testInfo, problems, { suite: "layout", lang: L.code, width: w, theme });
    await context.close();
  });
}
