// Reads every problem the test run attached, groups them, and decides what blocks.
//   results/findings.json   grouped problems, each marked new or known
//   results/summary.md      short readable report (also shown on the GitHub run page)
// Exit code 1 when there is a NEW problem of a blocking kind. Problems already listed in known-issues.json
// are reported (and get issues filed) but don't block, so an old flaw can't hold up an unrelated deploy.
// Usage: node scripts/triage.mjs [results/report.json ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { LANGS } from "../lib/matrix.mjs";
import { BLOCKING, LABEL } from "../lib/labels.mjs";

const here = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const files = args.length ? args : [here + "results/report.json"];
const known = existsSync(here + "known-issues.json") ? JSON.parse(readFileSync(here + "known-issues.json", "utf8")) : { items: {} };

const LANGRX = new RegExp(`^(${LANGS.map(l => l.code).sort((a, b) => b.length - a.length).join("|")})-`);
const norm = s => String(s || "").replace(/\d+(\.\d+)?px/g, "Npx").replace(/https?:\/\/[^\s"]+/g, u => u.replace(/[?#].*/, "")).replace(/\b\d{4,}\b/g, "N").slice(0, 160);
const itemKey = p => [p.check, p.screen, p.sel || norm(p.detail)].join("|");
const groupKey = p => [p.check, p.screen].join("|");
export const fp = s => createHash("sha1").update(s).digest("hex").slice(0, 10);

function collect(report) {
  const out = [];
  const walk = suite => {
    for (const s of suite.suites || []) walk(s);
    for (const sp of suite.specs || []) for (const t of sp.tests || []) for (const r of t.results || []) {
      for (const a of r.attachments || []) {
        if (a.name !== "qa-problems.json" || !a.body) continue;
        const { meta, problems } = JSON.parse(Buffer.from(a.body, "base64").toString("utf8"));
        for (const p of problems) out.push({ ...p, ...meta });
      }
      // a test that crashed outright is a problem too
      if (r.status !== "passed" && r.status !== "skipped" && !(r.attachments || []).some(a => a.name === "qa-problems.json")) {
        const msg = (r.errors || [r.error]).filter(Boolean).map(e => e.message || "").join("\n");
        if (/snapshot doesn't exist|writing actual/i.test(msg) && !/pixels .* different/.test(msg)) continue; // first run: baseline just written
        const visual = /toHaveScreenshot|screenshot/i.test(msg);
        if (visual) {
          for (const e of (r.errors || [r.error]).filter(Boolean)) {
            const m = (e.message || "").replace(/\u001b\[\d+m/g, "");
            if (/snapshot doesn't exist|writing actual/i.test(m)) continue;
            const name = (m.match(/([\w-]+?)-(\d+)-(light|dark)(-full)?\.png/) || []);
            const px = (m.match(/(\d+) pixels \(ratio [\d.]+/) || [""])[0];
            out.push({ check: "visual-diff", screen: name[1] ? name[1].replace(LANGRX, "") : sp.title, sel: name[0] || "", detail: px || m.split("\n")[0].slice(0, 200), lang: name[1]?.match(LANGRX)?.[1], width: name[2] && +name[2], theme: name[3] });
          }
          continue;
        }
        out.push({ check: "screen-failed", screen: sp.title, sel: "", detail: (r.error?.message || r.status).split("\n")[0].replace(/\u001b\[\d+m/g, "").slice(0, 300), suite: sp.file });
      }
    }
  };
  for (const s of report.suites || []) walk(s);
  return out;
}

const all = [];
for (const f of files) {
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, "utf8"));
  // a plain {meta, problems} file (data checks, AI review) or a Playwright JSON report
  const got = Array.isArray(j.problems) ? j.problems.map(p => ({ ...p, ...j.meta })) : collect(j);
  for (const p of got) all.push(p);
}
const combo = p => [p.lang, p.width && p.width + "px", p.theme].filter(Boolean).join(" ");

const groups = new Map();
for (const p of all) {
  const gk = groupKey(p), ik = itemKey(p);
  let g = groups.get(gk);
  if (!g) groups.set(gk, g = { key: gk, fp: fp(gk), check: p.check, screen: p.screen, title: `${LABEL[p.check] || p.check}: ${p.screen}`, items: new Map() });
  let it = g.items.get(ik);
  if (!it) g.items.set(ik, it = { key: ik, fp: fp(ik), sel: p.sel, detail: p.detail, combos: new Set(), known: !!known.items[fp(ik)] });
  if (combo(p)) it.combos.add(combo(p));
}
const findings = [...groups.values()].map(g => {
  const items = [...g.items.values()].map(i => ({ ...i, combos: [...i.combos].sort() }));
  const fresh = items.filter(i => !i.known);
  const blocks = BLOCKING.has(g.check) || (g.check === "visual-diff" && !!process.env.QA_VISUAL_BLOCKS);
  return { ...g, items, blocking: blocks, new: fresh.length, newBlocking: blocks ? fresh.length : 0 };
}).sort((a, b) => b.newBlocking - a.newBlocking || +b.blocking - +a.blocking || b.items.length - a.items.length);

mkdirSync(here + "results", { recursive: true });
writeFileSync(here + "results/findings.json", JSON.stringify({ at: new Date().toISOString(), total: all.length, findings }, null, 1));

const nb = findings.reduce((n, g) => n + g.newBlocking, 0);
const md = [`## Plenty Map QA`, "",
  nb ? `**${nb} new blocking problem${nb > 1 ? "s" : ""}.** Fix them, or if one is expected, add its id to \`qa/known-issues.json\`.` : `**No new blocking problems.**`, "",
  `| | Problem | Screen | Places | New | Where (sample) |`, `|---|---|---|---|---|---|`,
  ...findings.slice(0, 60).map(g => {
    const ex = g.items[0];
    const where = [...new Set(g.items.flatMap(i => i.combos))];
    return `| ${g.newBlocking ? "🛑" : g.blocking ? "⚠️" : "·"} | ${LABEL[g.check] || g.check} | ${g.screen} | ${g.items.length} | ${g.new} | ${(ex.sel ? "`" + ex.sel.slice(0, 60) + "` " : "") + String(ex.detail).slice(0, 80).replace(/\|/g, "/")} (${where.length > 4 ? where.slice(0, 4).join(", ") + ` +${where.length - 4}` : where.join(", ")}) |`;
  }),
  findings.length > 60 ? `\n…and ${findings.length - 60} more groups in findings.json` : ""].join("\n");
writeFileSync(here + "results/summary.md", md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log(md);
if (process.argv.includes("--write-known")) {
  // record everything seen now as known (used once to start the ratchet, or to accept a reviewed state)
  for (const g of findings) for (const i of g.items) known.items[i.fp] ||= { key: i.key.slice(0, 200), since: new Date().toISOString().slice(0, 10) };
  writeFileSync(here + "known-issues.json", JSON.stringify(known, null, 1) + "\n");
  console.log(`known-issues.json now lists ${Object.keys(known.items).length} items`);
}
process.exit(nb && !process.argv.includes("--no-fail") ? 1 : 0);
