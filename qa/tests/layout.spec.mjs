// Every screen, in every language, at every width, light and dark:
// nothing sideways-scrolls, nothing is cut off or drawn on top of something else, every control is big enough to tap,
// right-to-left languages keep numbers in order, no English or raw keys leak, no script errors or broken files.
import { test } from "@playwright/test";
import { langs, widths, themesFor, HEIGHT, folds, isDesk } from "../lib/matrix.mjs";
import { screens } from "../lib/screens.mjs";
import { seed, watch, waitReady, check, openRoute, attach } from "../lib/harness.mjs";

const sizes = [
  ...widths().flatMap(w => themesFor(w).map(theme => ({ name: `${w}px ${theme}`, w, h: HEIGHT(w), theme }))),
  ...folds().map(f => ({ name: `${f.id} ${f.w}x${f.h} light`, w: f.w, h: f.h, theme: "light", fold: f.id })),
];
for (const L of langs()) for (const { name, w, h, theme, fold } of sizes) {
  test(`${L.code} ${name}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, locale: L.locale, serviceWorkers: "block", hasTouch: w < 1024 });
    await seed(context, { lang: L.code });
    const page = await context.newPage();
    const problems = [], cur = { id: "load" };
    watch(page, problems, cur);
    for (const sc of screens({ wide: isDesk(w, h) })) {
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
    await attach(testInfo, problems, { suite: "layout", lang: L.code, width: fold ? `${w}x${h}` : w, theme });
    await context.close();
  });
}
