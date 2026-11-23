// Turns results/findings.json into GitHub issues, one per problem group, without spamming:
//   - an open issue for the same group is updated in place (no comment, so no notification)
//   - at most QA_MAX_NEW new issues per run, worst first
//   - issues for groups that a complete run no longer sees are closed with a short note
//   - nobody is @mentioned or assigned: Colin gets the weekly digest instead
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, QA_RUN_URL, QA_SCOPES (which suites this run covered fully, e.g. "layout,a11y,states")
// Usage: node scripts/file-issues.mjs [--dry]
import { readFileSync, existsSync } from "node:fs";
import { LABEL } from "../lib/labels.mjs";

const here = new URL("..", import.meta.url).pathname;
const DRY = process.argv.includes("--dry");
const repo = process.env.GITHUB_REPOSITORY || "colinrobinson-labs/plentymap";
const token = process.env.GITHUB_TOKEN;
const MAX_NEW = +(process.env.QA_MAX_NEW || 12);
const scopes = new Set((process.env.QA_SCOPES || "").split(",").filter(Boolean));
const runUrl = process.env.QA_RUN_URL || "";
if (!token && !DRY) { console.log("no GITHUB_TOKEN: nothing filed"); process.exit(0); }

const { findings = [] } = existsSync(here + "results/findings.json") ? JSON.parse(readFileSync(here + "results/findings.json", "utf8")) : {};
const api = async (path, opts = {}) => {
  if (DRY && opts.method && opts.method !== "GET") { console.log("[dry]", opts.method, path, opts.body ? JSON.parse(opts.body).title || "" : ""); return {}; }
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) } });
  if (!r.ok && r.status !== 422) throw new Error(`${opts.method || "GET"} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? {} : r.json();
};

const area = check => check.startsWith("data-") ? "data" : check.startsWith("axe-") ? "a11y" : check === "visual-diff" ? "visual"
  : /link/.test(check) ? "links" : check === "ux-review" ? "ux" : check === "user-report" ? "user-report" : "layout";
const owner = a => (a === "data" || a === "user-report" ? "owner:data" : "owner:app");
const COLORS = { qa: "5319e7", "qa:blocking": "b60205", "qa:layout": "1d76db", "qa:a11y": "0e8a16", "qa:data": "fbca04", "qa:visual": "c5def5", "qa:links": "bfd4f2", "qa:ux": "d4c5f9", "qa:user-report": "f9d0c4", "owner:app": "ededed", "owner:data": "ededed" };

// GitHub text from page content: never ping anyone, never break the table
const safe = s => String(s ?? "").replace(/@/g, "@​").replace(/\|/g, "/").replace(/[\r\n]+/g, " ").replace(/<!--/g, "<! --");

function body(g) {
  const items = g.items.slice(0, 40);
  const combos = [...new Set(g.items.flatMap(i => i.combos))];
  return [
    `<!-- qa:fp:${g.fp} -->`,
    `**${LABEL[g.check] || g.check}** on **${g.screen}**: ${g.items.length} place${g.items.length > 1 ? "s" : ""}${g.blocking ? " (this kind blocks a deploy when it's new)" : ""}.`,
    "",
    combos.length ? `Seen in: ${combos.length > 24 ? combos.slice(0, 24).join(", ") + ` and ${combos.length - 24} more` : combos.join(", ")}` : "",
    "",
    "| Where | What | Seen in |", "|---|---|---|",
    ...items.map(i => `| ${i.sel ? "`" + safe(i.sel).slice(0, 90) + "`" : ""} | ${safe(i.detail).slice(0, 220)} | ${i.combos.length > 6 ? i.combos.slice(0, 6).join(", ") + ` +${i.combos.length - 6}` : i.combos.join(", ")} |`),
    g.items.length > 40 ? `\n…and ${g.items.length - 40} more (see the run's findings.json).` : "",
    "",
    runUrl ? `Latest run: ${runUrl}` : "",
    "",
    `<sub>Filed by the Plenty Map QA checks (\`qa/\`). This issue updates itself on each run and closes when a full run no longer sees the problem. If it's expected, add the item ids to \`qa/known-issues.json\` and close it.</sub>`,
    `<!-- qa:items:${g.items.map(i => i.fp).join(",")} -->`,
  ].join("\n");
}

async function ensureLabels() {
  for (const [name, color] of Object.entries(COLORS)) await api("/labels", { method: "POST", body: JSON.stringify({ name, color }) }).catch(() => {});
}
async function openIssues() {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const list = DRY && !token ? [] : await api(`/issues?state=open&labels=qa&per_page=100&page=${page}`);
    out.push(...list.filter(i => !i.pull_request));
    if (list.length < 100) break;
  }
  return out;
}

// recently closed ones, so a problem that comes back reopens its old issue instead of filing a twin
async function closedIssues() {
  if (DRY && !token) return [];
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const list = await api(`/issues?state=closed&labels=qa&sort=updated&direction=desc&per_page=100&page=${page}`);
    out.push(...list.filter(i => !i.pull_request));
    if (list.length < 100) break;
  }
  return out;
}
const fpOf = i => (i.body || "").match(/qa:fp:(\w+)/)?.[1];

await ensureLabels().catch(e => console.log("labels:", e.message));
const open = await openIssues();
const byFp = new Map(open.map(i => [fpOf(i), i]).filter(([k]) => k));
const closedByFp = new Map();
for (const i of await closedIssues().catch(() => [])) { const k = fpOf(i); if (k && !closedByFp.has(k) && i.state_reason !== "not_planned") closedByFp.set(k, i); }
let created = 0, updated = 0, closed = 0, reopened = 0;
const seen = new Set();
for (const g of findings) {
  const a = area(g.check);
  if (a === "visual" && process.env.GITHUB_EVENT_NAME === "pull_request") continue;
  seen.add(g.fp);
  const title = `QA: ${LABEL[g.check] || g.check} (${g.screen})`;
  const labels = ["qa", "qa:" + a, owner(a), ...(g.newBlocking ? ["qa:blocking"] : [])];
  const ex = byFp.get(g.fp);
  if (ex) {
    const b = body(g);
    if (ex.body !== b) { await api(`/issues/${ex.number}`, { method: "PATCH", body: JSON.stringify({ body: b, labels }) }); updated++; }
  } else if (closedByFp.has(g.fp)) {
    const old = closedByFp.get(g.fp);
    await api(`/issues/${old.number}`, { method: "PATCH", body: JSON.stringify({ state: "open", body: body(g), labels }) }); reopened++;
  } else if (created < MAX_NEW) {
    await api("/issues", { method: "POST", body: JSON.stringify({ title, body: body(g), labels }) }); created++;
  }
}
// close what a complete run of that suite no longer sees
for (const [fp, iss] of byFp) {
  if (seen.has(fp)) continue;
  const labels = (iss.labels || []).map(l => l.name || l);
  const a = (labels.find(l => l.startsWith("qa:") && l !== "qa:blocking") || "").slice(3);
  const covered = a === "layout" ? scopes.has("layout") && scopes.has("states") : scopes.has(a);
  if (!covered || a === "ux" || a === "user-report") continue; // people close review notes and visitor reports themselves
  await api(`/issues/${iss.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Not seen in the latest full run${runUrl ? ` (${runUrl})` : ""}, so closing. It reopens if it comes back.\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_` }) });
  await api(`/issues/${iss.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
  closed++;
}
console.log(`issues: ${created} new, ${reopened} reopened, ${updated} updated, ${closed} closed, ${findings.length - created - updated - reopened} unchanged or over the limit`);
