// Visitor "report a problem" totals, for the weekly digest. The report system (extra-data.yml, reports job) files its own
// Monday digest issue (labels qa, qa:user-report, listing-reports) and re-checks reported listings itself, so this only reads
// the public totals (no visitor notes: those never leave Cloudflare) and flags listings reported again and again.
// Writes results/user-reports.json.
import { writeFileSync, mkdirSync } from "node:fs";
const here = new URL("..", import.meta.url).pathname;
const URL_ = process.env.QA_REPORTS_SUMMARY || "https://report.plentymap.com/summary.json";
mkdirSync(here + "results", { recursive: true });
const out = { at: new Date().toISOString(), listings: 0, reports: 0, repeat: [] };
try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(20000) });
  if (r.ok) {
    const j = await r.json();
    for (const [id, kinds] of Object.entries(j.listings || {})) {
      out.listings++;
      let n = 0, days = 0;
      for (const [, v] of Object.entries(kinds)) { n += v[0] || 0; days = Math.max(days, v[3] || 0); }
      out.reports += n;
      if (days >= 3) out.repeat.push({ id, reports: n, days, kinds: Object.keys(kinds) });
    }
    console.log(`visitor reports: ${out.reports} on ${out.listings} listings; ${out.repeat.length} reported on 3+ days`);
  } else console.log(`visitor report totals not available yet (${r.status})`);
} catch (e) { console.log("visitor report totals not available yet:", e.message); }
writeFileSync(here + "results/user-reports.json", JSON.stringify(out));
