// Quick-check rules: income limits and the odds we show. Run: node --test tests/
// Expected figures come straight from the official tables named in js/benefits.js, so a wrong
// constant or a rounding slip fails here before it reaches anyone's phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, parseMoney, pct, SNAP, WIC } from "../js/benefits.js";

const ca = (n, inc, w = {}) => estimate({ n, inc, w, st: "CA", ca: true });
const us = (st, n, inc, w = {}) => estimate({ n, inc, w, st });

test("limits match the official 2026 tables (48 states + DC)", () => {
  // USDA FY2027 SNAP COLA memo: 130% gross
  assert.deepEqual([1, 2, 3, 4, 8].map(n => pct(n, "US", 130)), [1729, 2345, 2960, 3575, 6037]);
  assert.equal(pct(9, "US", 130) - pct(8, "US", 130), 616);
  // 100% net
  assert.deepEqual([1, 2, 4].map(n => pct(n, "US", 100)), [1330, 1804, 2750]);
  // WIC / school reduced price / SFMNP 185%, Jul 2026 to Jun 2027
  assert.deepEqual([1, 2, 3, 4, 8].map(n => WIC.limit(n, "US")), [2461, 3337, 4212, 5088, 8591]);
  assert.deepEqual([1, 2].map(n => WIC.limit(n, "AK")), [3076, 4171]);
  assert.deepEqual([1, 2].map(n => WIC.limit(n, "HI")), [2831, 3838]);
  // CSFP 150%: San Diego Food Bank 2026 table
  assert.deepEqual([1, 2].map(n => pct(n, "US", 150)), [1995, 2705]);
  // CalFresh 200%
  assert.equal(SNAP.grossLimit(1, "CA"), 2660);
  assert.equal(SNAP.grossLimit(4, "CA"), 5500);
  // SNAP maximums FY2027
  assert.deepEqual([1, 4, 8, 9].map(n => SNAP.max(n)), [306, 1023, 1841, 2066]);
  assert.equal(WIC.limit(9, "US"), 8591 + 876);
});

test("the reported case: 1 person, $6,000 a month, no boxes", () => {
  const r = ca(1, 6000);
  assert.equal(r.snap.odds, "no");
  assert.equal(r.snap.key, "cf_no");
  assert.equal(r.lifeline, false);
  assert.equal(r.rmp, undefined);
  assert.equal(r.pantry.odds, "maybe");   // over CA TEFAP 235% ($3,126), but other pantries serve anyone
  assert.equal(r.pantry.limit, 3126);
});

test("CalFresh: right at, just over, and well over the 200% line", () => {
  assert.equal(ca(1, 2660).snap.odds, "likely");
  assert.equal(ca(1, 2661).snap.odds, "ask");
  assert.equal(ca(1, 2660 * 1.1).snap.odds, "ask");
  assert.equal(ca(1, 2927).snap.odds, "no");
  assert.equal(ca(1, 2661).snap.key, "cf_near");
  assert.equal(us("TX", 1, 2300).snap.key, "us_cf_near");   // TX 165% = $2,195
  assert.equal(ca(4, 5500).snap.odds, "likely");
  assert.equal(ca(4, 7000).snap.odds, "no");
  assert.equal(ca(1, 0).snap.odds, "likely");
});

test("60+ or disabled: past the gross line, only with high costs, and not at any income", () => {
  assert.equal(ca(1, 3000, { senior: 1 }).snap.odds, "maybe");
  assert.equal(ca(1, 3000, { senior: 1 }).snap.key, "cf_older");
  assert.equal(ca(1, 3325, { dis: 1 }).snap.odds, "maybe");   // 250% of poverty
  assert.equal(ca(1, 3326, { dis: 1 }).snap.odds, "no");
  assert.equal(ca(1, 6000, { senior: 1 }).snap.key, "cf_older_no");
  assert.equal(us("OH", 2, 3000, { senior: 1 }).snap.key, "us_cf_older");
});

test("second limits: NY dependent care, Arkansas only for 60+ or disabled", () => {
  // NY: 130%, or 200% with dependent care costs
  assert.equal(us("NY", 1, 2000).snap.odds, "maybe");
  assert.equal(us("NY", 1, 2000).snap.key, "us_cf_alt");
  // AR: 130%, 165% for 60+ or disabled; a younger home just over 130% is near, not "alt"
  assert.equal(us("AR", 1, 2100, { senior: 1 }).snap.key, "us_cf_alt");
  assert.equal(us("AR", 1, 1850).snap.key, "us_cf_near");
  assert.equal(us("AR", 1, 2100).snap.odds, "no");
});

test("WIC: 185%, then the Medicaid route, then probably not", () => {
  assert.equal(ca(2, 3337, { baby: 1 }).wic.odds, "likely");
  assert.equal(ca(2, 4000, { baby: 1 }).wic.odds, "ask");     // Medi-Cal kids up to 266% = $4,797
  assert.equal(ca(2, 4797, { baby: 1 }).wic.odds, "ask");
  assert.equal(ca(2, 4800, { baby: 1 }).wic.odds, "no");
  assert.equal(ca(1, 2800, { preg: 1 }).wic.odds, "ask");     // a pregnancy counts as one more: 2 = $3,337
  assert.equal(ca(1, 3400, { preg: 1 }).wic.odds, "no");
  assert.equal(ca(3, 4300, { baby: 1 }).wic.odds, "likely");  // over 185% but gets CalFresh (200%)
  assert.equal(ca(3, 6100, { baby: 1 }).wic.odds, "no");    // 266% for 3 = $6,057
});

test("school meals and SUN Bucks", () => {
  // California: free for every student, whatever the income
  assert.equal(ca(4, 9000, { school: 1 }).school.kind, "all");
  // A state without universal meals: free, reduced, over
  assert.equal(us("TX", 4, 3500, { school: 1 }).school.kind, "free");
  assert.equal(us("OH", 4, 5000, { school: 1 }).school.kind, "reduced");
  assert.equal(us("OH", 4, 6000, { school: 1 }).school.kind, "over");
  assert.equal(us("OH", 4, 6000, { school: 1 }).school.odds, "");
  // SUN Bucks: 185% limit everywhere it runs
  assert.equal(ca(4, 5088, { school: 1 }).sun.odds, "likely");
  assert.equal(ca(4, 5500, { school: 1 }).sun.odds, "likely");   // gets CalFresh, so automatic
  assert.equal(ca(4, 5590, { school: 1 }).sun.odds, "ask");
  assert.equal(ca(4, 5600, { school: 1 }).sun.odds, "no");
  assert.equal(ca(4, 9000, { school: 1 }).sun.odds, "no");
  assert.equal(us("TX", 4, 1000, { school: 1 }).sun.none, true);   // Texas doesn't take part
});

test("seniors: CSFP 150%, farmers market checks 185%", () => {
  const lo = ca(1, 1900, { senior: 1 }), mid = ca(1, 2400, { senior: 1 }), hi = ca(1, 6000, { senior: 1 });
  assert.equal(lo.csfp.odds, "likely");
  assert.equal(mid.csfp.odds, "no");
  assert.equal(mid.sfmnp.odds, "likely");
  assert.equal(hi.sfmnp.odds, "no");
  assert.equal(hi.rmp, undefined);   // Restaurant Meals needs CalFresh
  assert.equal(lo.rmp, "likely");
});

test("pantries and Lifeline", () => {
  assert.equal(us("OH", 1, 2400).pantry.odds, "likely");    // under the 185% floor every state uses
  assert.equal(us("OH", 1, 2500).pantry.odds, "maybe");
  assert.equal(us("OH", 1, 9000, { home: 1 }).pantry.odds, "likely");
  assert.equal(us("OH", 1, 1700).lifeline, true);            // 135% = $1,796
  assert.equal(us("OH", 1, 1800).lifeline, false);          // over 135% and over Ohio's 130% SNAP line
  assert.equal(ca(1, 2600).lifeline, true);                 // through CalFresh
  assert.equal(us("PR", 1, 100).lifeline, false);
});

test("money as people type it", () => {
  const cases = [["6000", 6000], ["6,000", 6000], ["$6,000.50", 6000.5], ["6.000", 6000], ["6 000", 6000],
    ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["2500,5", 2500.5], ["12.50", 12.5], ["1.000.000", 1000000],
    ["٦٠٠٠", 6000], ["۶٬۰۰۰", 6000], ["", 0], ["abc", 0], [null, 0], ["-50", 50], ["0", 0], [".", 0]];
  for (const [raw, want] of cases) assert.equal(parseMoney(raw), want, JSON.stringify(raw));
});

test("odd inputs never throw and never say yes by mistake", () => {
  for (const n of [0, -3, 1.7, NaN, 16, 40]) assert.ok(estimate({ n, inc: 1e6, w: {}, st: "CA", ca: true }).snap.odds === "no");
  assert.equal(estimate({ n: 1, inc: NaN, st: "ZZ" }).snap.odds, "likely");   // unknown state: federal 130%
  assert.equal(us("ID", 1, 1800).snap.odds, "ask");   // no BBCE: 130% gross, $1,729
});
