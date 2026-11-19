/* Help: urgent numbers, a private quick check for SNAP (CalFresh in California), WIC and more, and
   plain-language program cards. San Diego County gets its local programs and numbers; everywhere else
   gets the state's own SNAP office, limits and links, plus the national programs. */
import { S, t, esc, $, $$, ico, money, num, telHref, openOut, announce } from "./core.js";
import { SNAP, WIC, SUN_BUCKS, LINKS, PHONES, AS_OF, STATES, ASSETS, fplMonth, stateName } from "./benefits.js";
import { region, stateOf } from "./region.js";
import { foot } from "./app.js";

/* National links (USDA FNA, HHS ACL, United Way, Feeding America). Checked 2026-11-18. */
const US = {
  wic: "https://www.fna.usda.gov/wic",
  sunbucks: "https://www.fna.usda.gov/summer/sunbucks",
  csfp: "https://www.fna.usda.gov/csfp/applicant-recipient",
  rmp: "https://www.fna.usda.gov/snap/retailer/restaurant-meals-program",
  work: "https://www.fna.usda.gov/snap/work-requirements",
  rules: "https://www.fna.usda.gov/working-families-tax-cuts/snap/implementation",
  dir: "https://www.fna.usda.gov/snap/state-directory",
  eldercare: "https://eldercare.acl.gov/",
  foodbank: "https://www.feedingamerica.org/find-your-local-foodbank",
};
const ELDERCARE = "800-677-1116";
let A = null;   // the area (partner San Diego, or a state) for this render

// Kept in memory only. Income is never written to the phone's storage.
let Q = null;

const tel = (num, label, cls = "btn sm") => `<a class="${cls}" href="${telHref(num)}">${ico("phone", "i sm")} ${esc(label)}</a>`;
const out = (href, label, cls = "btn sm ghost") => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-out>${esc(label)} ${ico("ext", "i sm")}</a>`;
const odds = k => k ? `<span class="badge ${k === "likely" ? "ok" : k === "maybe" ? "warn" : ""}">${esc(t("odds_" + k))}</span>` : "";

function prog(id, title, odd, body, acts, note) {
  return `<article class="card prog" id="p-${id}">
    <h3>${esc(title)} ${odds(odd)}</h3>
    <p>${body}</p>
    ${note ? `<p class="small mute">${note}</p>` : ""}
    ${acts ? `<div class="row">${acts}</div>` : ""}
  </article>`;
}

function results() {
  if (!Q) return "";
  if (!A.partner) return resultsUS();
  const n = Math.max(1, Q.n), inc = Q.inc, w = Q.w;
  const gross = SNAP.grossLimit(n), max = SNAP.max(n);
  const older = w.senior || w.dis;
  const cf = inc <= gross ? "likely" : older ? "maybe" : "ask";
  const outp = [];
  outp.push(prog("calfresh", t("cf_h"), cf,
    esc(t(cf === "likely" ? "cf_likely" : cf === "maybe" ? "cf_maybe" : "cf_ask", { g: money(gross, false), n })) + " " + esc(t("cf_max", { m: money(max, false), n })),
    out(LINKS.calfresh_apply, t("apply_online"), "btn sm pri") + out(LINKS.getcalfresh, "GetCalFresh") + tel(PHONES.county, t("call_county")),
    esc(t(inc < 150 ? "cf_fast" : "cf_note"))));
  if (w.preg || w.baby) {
    const ok = inc <= WIC.limit(n) || cf === "likely";
    outp.push(prog("wic", t("wic_h"), ok ? "likely" : "ask", esc(t("wic_p", { g: money(WIC.limit(n), false) })), out(LINKS.wic, t("apply_online"), "btn sm pri") + tel(PHONES.wic, t("call"))));
  }
  if (w.school) {
    outp.push(prog("school", t("school_h"), "likely", esc(t("school_p"))));
    outp.push(prog("sunbucks", t("sun_h"), inc <= WIC.limit(n) ? "likely" : "ask", esc(t("sun_p", { m: money(SUN_BUCKS, false) })), out(LINKS.sunbucks, t("learn_more")) + tel(PHONES.sunbucks, t("call"))));
  }
  if (w.senior) {
    outp.push(prog("csfp", t("csfp_h"), inc <= Math.round(fplMonth(n) * 1.5) ? "likely" : "ask", esc(t("csfp_p")), `<a class="btn sm" href="#/find">${ico("basket", "i sm")} ${esc(t("cat_senior"))}</a>`));
    outp.push(prog("ais", t("ais_h"), "likely", esc(t("ais_p")), tel(PHONES.ais, t("call_ais")) + out(LINKS.ais, t("learn_more"))));
  }
  if (w.senior || w.dis || w.home) outp.push(prog("rmp", t("rmp_h"), cf === "ask" ? "maybe" : "likely", esc(t("rmp_p")), `<a class="btn sm" href="#/find">${esc(t("cat_rmp"))}</a>` + out(LINKS.rmp, t("learn_more"))));
  if (w.home) outp.push(prog("home", t("home_h"), "likely", esc(t("home_p")), tel(PHONES.sd211, t("call_211"), "btn sm pri")));
  outp.push(prog("pantry", t("pantry_h"), "likely", esc(t("pantry_p")), `<a class="btn sm" href="#/find">${ico("basket", "i sm")} ${esc(t("tab_find"))}</a>`));
  return `<div class="sec"><h2 id="res-h" tabindex="-1">${esc(t("results_h"))}</h2></div>
    <p class="notice">${ico("info")}<span>${esc(t("results_note"))}</span></p>
    <div class="grid2">${outp.join("")}</div>`;
}

/* ---------- everywhere outside San Diego County ---------- */
function resultsUS() {
  const n = Math.max(1, Q.n), inc = Q.inc, w = Q.w, st = A.st, S0 = STATES[st] || {};
  const outp = [];
  let cf = "ask";
  if (S0.nap) {
    outp.push(prog("pan", t("us_pr_h"), "", esc(t("us_pr_p")), out(S0.ap, t("learn_more"), "btn sm pri") + tel("211", t("call_211"))));
  } else {
    const gross = SNAP.grossLimit(n, st), g2 = SNAP.grossLimit2(n, st), max = SNAP.max(n, st);
    const older = w.senior || w.dis;
    cf = inc <= gross ? "likely" : (g2 && inc <= g2) || older ? "maybe" : "ask";
    const key = cf === "likely" ? "cf_likely" : cf === "ask" ? "cf_ask" : g2 && inc <= g2 ? "us_cf_alt" : "us_cf_maybe";
    const body = [t(key, { g: money(gross, false), g2: money(g2, false), n }), t("cf_max", { m: money(max, false), n })];
    if (st === "AK") body.push(t("us_ak_note"));
    const notes = [t(inc < 150 ? "cf_fast" : "cf_note")];
    if (!S0.g || S0.as === "snap") notes.push(t("us_assets", { a: money(ASSETS.base, false), b: money(ASSETS.older, false) }));
    else if (typeof S0.as === "number") notes.push(t("us_assets_n", { a: money(S0.as, false) }));
    if (S0.p) notes.push(t("us_snap_called", { st: S0.n, prog: S0.p }));
    outp.push(prog("snap", t("cf_h"), cf, esc(body.join(" ")),
      (S0.ap ? out(S0.ap, t("apply_online"), "btn sm pri") : "") + (S0.ph ? tel(S0.ph, t("us_call_snap")) : "") + out(S0.w || US.dir, t("learn_more")),
      esc(notes.join(" "))));
  }
  const wl = WIC.limit(n, st);
  if (w.preg || w.baby) outp.push(prog("wic", t("wic_h"), inc <= wl || cf === "likely" ? "likely" : "ask", esc(t("us_wic_p", { g: money(wl, false) })), out(US.wic, t("learn_more"))));
  if (w.school) {
    outp.push(prog("school", t("school_h"), "likely", esc(t("us_school_p"))));
    outp.push(prog("sunbucks", t("sun_h"), inc <= wl ? "likely" : "ask", esc(t("us_sun_p", { m: money(SUN_BUCKS, false) })), out(US.sunbucks, t("learn_more"))));
  }
  if (w.senior) {
    outp.push(prog("csfp", t("csfp_h"), inc <= Math.round(fplMonth(n, st) * 1.5) ? "likely" : "ask", esc(t("csfp_p")), out(US.csfp, t("learn_more"))));
    outp.push(prog("ais", t("ais_h"), "likely", esc(t("us_ais_p")), tel(ELDERCARE, t("us_call_eldercare")) + out(US.eldercare, t("learn_more"))));
  }
  if ((w.senior || w.dis || w.home) && A.stores.some(s => s.k === "rmp")) outp.push(prog("rmp", t("rmp_h"), cf === "ask" ? "maybe" : "likely", esc(t("us_rmp_p")), `<a class="btn sm" href="#/find">${esc(t("cat_rmp"))}</a>` + out(US.rmp, t("learn_more"))));
  if (w.home) outp.push(prog("home", t("home_h"), "likely", esc(t("home_p")), tel("211", t("call_211"), "btn sm pri")));
  outp.push(prog("pantry", t("pantry_h"), "likely", esc(t("pantry_p")), `<a class="btn sm" href="#/find">${ico("basket", "i sm")} ${esc(t("tab_find"))}</a>` + out(US.foodbank, t("us_fb_find"))));
  return `<div class="sec"><h2 id="res-h" tabindex="-1">${esc(t("results_h"))}</h2></div>
    <p class="notice">${ico("info")}<span>${esc(t("us_results_note"))}</span></p>
    <div class="grid2">${outp.join("")}</div>`;
}
function urgentUS() {
  const S0 = STATES[A.st] || {};
  return `<p>${esc(t("us_urgent_p"))}</p>
      <div class="row">
        ${tel("211", t("call_211"), "btn pri")}
        ${S0.ph ? tel(S0.ph, t("us_call_snap"), "btn") : ""}
        ${out(US.foodbank, t("us_fb_find"), "btn")}
        <a class="btn" href="#/find">${ico("basket", "i sm")} ${esc(t("free_near"))}</a>
      </div>`;
}
function moreUS() {
  return `${prog("mm", t("us_mm_h"), "", esc(t("us_mm_p")), `<a class="btn sm" href="#/find">${esc(t("cat_market"))}</a>`)}
      ${prog("imm", t("imm_h"), "", esc(t("us_imm_p")), tel("211", t("call_211")) + out(US.rules, t("learn_more")))}
      ${prog("work", t("work_h"), "", esc(t("us_work_p")), out(US.work, t("learn_more")))}
      ${prog("scam", t("scam_h"), "", esc(t("scam_p")))}`;
}

export async function render(main) {
  A = await region();
  if (!A.partner) A.st ||= stateOf();
  const q = Q || { n: Math.max(1, S.hh.a + S.hh.k), inc: "", w: { senior: S.senior } };
  const ck = k => `<label class="check"><input type="checkbox" data-w="${k}" ${q.w[k] ? "checked" : ""}><span>${esc(t("w_" + k))}</span></label>`;
  main.innerHTML = `
    <h1 class="disp">${esc(t("help_h"))}</h1>
    <p class="lead">${esc(t("help_p"))}</p>
    ${!A.partner && stateName(A.st) ? `<p class="small mute">${ico("pin", "i sm")} ${esc(t("us_help_in", { st: stateName(A.st) }))}</p>` : ""}
    <section class="urgent gap-t" aria-labelledby="urg-h">
      <h2 id="urg-h">${esc(t("urgent_h"))}</h2>
      ${A.partner ? `<p>${esc(t("urgent_p"))}</p>
      <div class="row">
        ${tel(PHONES.sd211, t("call_211"), "btn pri")}
        ${tel(PHONES.sdfb, t("call_sdfb"), "btn")}
        ${tel(PHONES.fsd, t("call_fsd"), "btn")}
        <a class="btn" href="#/find">${ico("basket", "i sm")} ${esc(t("free_near"))}</a>
      </div>` : urgentUS()}
    </section>

    <div class="sec"><h2>${esc(t("check_h"))}</h2></div>
    <form class="card qs" id="qs" novalidate>
      <p class="small mute">${ico("lock", "i sm")} ${esc(t("check_private"))}</p>
      <div class="row between"><span id="l-n"><b>${esc(t("hh_size"))}</b></span>
        <span class="stepper" role="group" aria-labelledby="l-n"><button type="button" data-n="-1" aria-label="${esc(t("fewer"))}">−</button><output id="qn" aria-live="polite">${num(q.n)}</output><button type="button" data-n="1" aria-label="${esc(t("more"))}">+</button></span></div>
      <label class="field"><span>${esc(t("income_q"))}</span>
        <input class="in" id="inc" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(q.inc)}">
        <small>${esc(t("income_hint"))}</small></label>
      <fieldset class="checks"><legend>${esc(t("who_q"))}</legend>
        ${["preg", "baby", "school", "senior", "dis", "home"].map(ck).join("")}
      </fieldset>
      <button class="btn pri block" type="submit">${esc(t("check_btn"))}</button>
    </form>
    <div id="res">${results()}</div>

    <div class="sec"><h2>${esc(t("more_h"))}</h2></div>
    <div class="grid2">
      ${A.partner ? `${prog("mm", t("mm_h"), "", esc(t("mm_p", { m: money(10, false) })), `<a class="btn sm" href="#/find">${esc(t("cat_market"))}</a>` + out(LINKS.marketmatch, t("learn_more")))}
      ${prog("imm", t("imm_h"), "", esc(t("imm_p")), tel(PHONES.sd211, t("call_211")) + out(LINKS.hr1, t("learn_more")))}
      ${prog("work", t("work_h"), "", esc(t("work_p")), out(LINKS.hr1, t("learn_more")))}
      ${prog("scam", t("scam_h"), "", esc(t("scam_p")))}` : moreUS()}
    </div>
    <p class="tiny mute gap-t">${esc(t("figures_asof", { d: AS_OF }))}</p>
    ${foot()}`;

  $$("[data-n]").forEach(b => b.onclick = () => { q.n = Math.max(1, Math.min(16, q.n + +b.dataset.n)); $("#qn").textContent = num(q.n); });
  $("#qs").onsubmit = e => {
    e.preventDefault();
    const raw = $("#inc").value;
    q.inc = raw; q.w = {};
    $$("[data-w]").forEach(c => { if (c.checked) q.w[c.dataset.w] = 1; });
    Q = { n: q.n, inc: parseFloat(String(raw).replace(/[^0-9.]/g, "")) || 0, w: q.w, raw };
    $("#res").innerHTML = results(); bindOut($("#res"));
    $("#res-h")?.focus(); announce(t("results_h"));
  };
  if (Q) $("#inc").value = Q.raw;
  bindOut(main);
}
function bindOut(root) {
  $$("a[data-out]", root).forEach(a => a.addEventListener("click", e => { e.preventDefault(); openOut(a.href); }));
}
