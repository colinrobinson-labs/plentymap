/* Budget: a week of meals for your household, what it costs, and a shopping list by aisle. */
import { S, save, t, esc, $, $$, ico, mark, money, num, rt, dayName, shareThing, toast, announce, activeCuisine, openOut, ingNameEn } from "./core.js";
import { food, canCook, dietOk, perServing, price, name, pkgLabel, cuisineMatch, facts } from "./food.js";
import { SNAP } from "./benefits.js";
import { stateOf } from "./region.js";
import { foot } from "./app.js";

let FD;
const AISLES = ["prod", "pantry", "cans", "dairy", "meat", "frozen", "bread", "spice"];
const portions = () => S.hh.a + S.hh.k * 0.7;
const people = () => S.hh.a + S.hh.k;
const planKey = () => [3, S.hh.a, S.hh.k, S.diet, [...S.avoid].sort().join("+"), S.kit.join("+"), S.comfort, activeCuisine(), S.meals.b, S.meals.l, S.meals.d].join("|");

function pools() {
  const ok = r => canCook(r) && dietOk(r) && r.lvl <= S.comfort;
  const dinner = r => r.serves >= 4 && !FD.slotB.has(r.id);
  return {
    b: FD.slots.b.map(i => FD.byId[i]).filter(Boolean).filter(ok),
    l: FD.slots.l.map(i => FD.byId[i]).filter(Boolean).filter(ok),
    d: FD.recipes.filter(dinner).filter(ok),
  };
}
/* Cheaper meals, home cooking, and meals that reuse what's already on the list come up more often. */
function pick(pool, avoid, onList = new Set()) {
  if (!pool.length) return null;
  let cand = pool.filter(r => !avoid.has(r.id)); if (!cand.length) cand = pool;
  const sorted = [...cand].sort((a, b) => perServing(a) - perServing(b));
  const overlap = r => { const main = r.ing.filter(([id]) => FD.ing[id].aisle !== "spice"); return main.length ? main.filter(([id]) => onList.has(id)).length / main.length : 0; };
  const w = sorted.map((r, i) => (1 / (i + 1.6)) * (cuisineMatch(r) ? 2.2 : 1) * (1 + 2 * overlap(r)));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < sorted.length; i++) { x -= w[i]; if (x <= 0) return sorted[i].id; }
  return sorted[0].id;
}
/* Cook once, eat twice: a dinner pot feeds the next day's lunch and sometimes a second dinner.
   Each slot is {id, pot, lo}: pot numbers a cooked batch, lo marks leftovers. */
function makePlan(keep = true) {
  const locked = keep ? S.plan?.locked || {} : {};
  const p = pools(), por = portions(), days = [], onList = new Set(), used = { b: new Set(), l: new Set(), d: new Set() };
  const note = id => FD.byId[id]?.ing.forEach(([i]) => onList.add(i));
  let pots = [], potN = 0;
  const bfast = [];
  for (let i = 0; i < 2 && p.b.length; i++) { const id = pick(p.b, new Set(bfast), onList); if (id) { bfast.push(id); note(id); } }
  for (let i = 0; i < 7; i++) {
    const day = {};
    if (S.meals.b && bfast.length) day.b = { id: bfast[i % bfast.length] };
    if (S.meals.l) {
      const lp = pots.find(x => x.left >= por);
      if (lp) { day.l = { id: lp.id, pot: lp.n, lo: 1 }; lp.left -= por; }
      else if (p.l.length) {
        const avoid = new Set([...used.l, ...pots.map(x => x.id)]);
        if (used.l.size >= p.l.length) used.l.clear();
        const id = pick(p.l, avoid, onList); if (id) { day.l = { id }; used.l.add(id); note(id); }
      }
    }
    if (S.meals.d) {
      const dp = pots.find(x => x.left >= por && x.dinners < 2 && x.id !== day.l?.id && x.id !== days[i - 1]?.d?.id);
      if (dp) { day.d = { id: dp.id, pot: dp.n, lo: 1 }; dp.left -= por; dp.dinners++; }
      else if (p.d.length) {
        if (used.d.size >= p.d.length) used.d.clear();
        const avoid = new Set([...used.d, day.l?.id, days[i - 1]?.d?.id, ...pots.map(x => x.id)].filter(Boolean));
        const id = pick(p.d, avoid, onList);
        if (id) {
          const r = FD.byId[id], batch = r.serves * Math.max(1, Math.ceil(por / r.serves));
          const pot = { id, n: ++potN, left: batch - por, dinners: 1, batch };
          pots.push(pot); day.d = { id, pot: pot.n, batch }; used.d.add(id); note(id);
        }
      }
    }
    days.push(day);
    pots = pots.filter(x => x.left >= por);
  }
  S.plan = { v: 3, days, key: planKey(), locked: {} };
  // meals someone picked by hand stay, when they still fit the new choices
  for (const [k, id] of Object.entries(locked)) {
    const i = +k[0], m = k[1];
    if (days[i]?.[m] && !days[i][m].lo && poolFor(i, m).some(r => r.id === id)) { swapTo(i, m, id); S.plan.locked[k] = id; }
  }
  save("plan");
}

/* Fit the week to the budget: trade the dearest meals (not ones picked by hand) for cheaper ones
   until the week fits or nothing cheaper is left. Returns true when it fits. */
function fitBudget(weekly) {
  for (let n = 0; n < 30 && totals().eat > weekly; n++) {
    let best = null;
    S.plan.days.forEach((d, i) => ["b", "l", "d"].forEach(m => {
      const x = d[m]; if (!x || x.lo || S.plan.locked?.[i + m]) return;
      const cur = perServing(FD.byId[x.id]);
      const inPlan = new Set(S.plan.days.flatMap(dd => Object.values(dd).map(v => v.id)));
      const alt = poolFor(i, m).filter(r => !inPlan.has(r.id) && perServing(r) < cur - 0.05).sort((a, b) => perServing(a) - perServing(b))[0];
      if (alt && (!best || cur - perServing(alt) > best.gain)) best = { i, m, id: alt.id, gain: cur - perServing(alt) };
    }));
    if (!best) break;
    swapTo(best.i, best.m, best.id);
  }
  S.plan.fitFor = weekly + "|" + S.plan.key;
  save("plan");
  return totals().eat <= weekly;
}

function totals() {
  const need = {}, por = portions();
  const addR = (r, servings) => { for (const [id, q] of r.ing) need[id] = (need[id] || 0) + q * servings / r.serves; };
  let eat = 0;
  for (const day of S.plan.days) for (const m in day) {
    const x = day[m], r = FD.byId[x.id]; if (!r) continue;
    eat += perServing(r) * por;
    if (x.lo) continue;                       // leftovers were bought with the pot
    addR(r, x.batch || por);
  }
  for (const [id, sv] of Object.entries(S.extra)) { const r = FD.byId[id]; if (r) { addR(r, sv); eat += perServing(r) * sv; } }
  let trip = 0; const items = [];
  for (const id in need) {
    const x = FD.ing[id]; if (!x) continue;
    const n = Math.max(1, Math.ceil(need[id] / x.per - 0.03));
    const have = S.have.has(id), c = n * x.per * price(id);
    if (!have) trip += c;
    items.push({ id, n, c, have, aisle: x.aisle });
  }
  return { eat, trip, items };
}

/* Swapping: a few other meals to choose from (with price, time and diet), not a blind reshuffle.
   Swapping a pot changes every meal made from it. */
function poolFor(i, m) {
  const p = pools(), x = S.plan.days[i][m];
  if (m === "b") return p.b;
  if (!x.pot) return p[m];
  // keep the same number of servings so the leftovers still work out
  const old = S.plan.days.map(d => d.d).find(v => v?.pot === x.pot && v.batch)?.batch || 0;
  const fits = p.d.filter(r => r.serves * Math.max(1, Math.ceil(portions() / r.serves)) >= old);
  return fits.length ? fits : p.d;
}
function options(i, m, skip = new Set(), n = 4) {
  const pool = poolFor(i, m), x = S.plan.days[i][m];
  const avoid = new Set([...S.plan.days.flatMap(d => Object.values(d).map(v => v.id)), ...skip]);
  let free = pool.filter(r => !avoid.has(r.id));
  if (free.length < n) free = pool.filter(r => r.id !== x.id && !skip.has(r.id));
  if (free.length < n) free = pool.filter(r => r.id !== x.id);
  const out = [];
  while (out.length < n && free.length) {
    const id = pick(free, new Set()); if (!id) break;
    out.push(id); free = free.filter(r => r.id !== id);
  }
  return out;
}
function swapTo(i, m, id) {
  const x = S.plan.days[i][m];
  if (m === "b") { const old = x.id; S.plan.days.forEach(d => { if (d.b?.id === old) d.b = { id }; }); }
  else if (x.pot) S.plan.days.forEach(d => ["l", "d"].forEach(k => { if (d[k]?.pot === x.pot) d[k] = { ...d[k], id, batch: d[k].batch ? FD.byId[id].serves * Math.max(1, Math.ceil(portions() / FD.byId[id].serves)) : undefined }; }));
  else S.plan.days[i][m] = { id };
  save("plan");
}
function chooser(i, m, from) {
  const x = S.plan.days[i][m], seen = new Set();
  const el = document.createElement("div");
  el.className = "sheet"; el.id = "swapsheet";
  const close = () => { el.remove(); document.body.style.overflow = ""; $("#app").inert = false; from?.isConnected ? from.focus() : $(`[data-swap="${i}${m}"]`)?.focus(); };
  const optCard = id => {
    const r = FD.byId[id], v = r && facts(r);
    return `<li><button class="swapopt" type="button" data-to="${id}">
      <span class="t">${esc(rt(id).t)}</span>
      <span class="meta"><b>${esc(money(perServing(r)))}</b> ${esc(t("per_serving"))} · ${esc(t("mins", { n: r.mins }))}${v.vegan ? ` · <span class="badge ok">${esc(t("diet_vegan"))}</span>` : v.veg ? ` · <span class="badge ok">${esc(t("diet_veg"))}</span>` : ""}</span>
      ${ico("arrow", "i go")}</button></li>`;
  };
  const paintOpts = () => {
    const ids = options(i, m, seen); ids.forEach(id => seen.add(id));
    $(".swaplist", el).innerHTML = ids.map(optCard).join("") || `<li class="mute">${esc(t("no_meals"))}</li>`;
    $$("[data-to]", el).forEach(b => b.onclick = () => { swapTo(i, m, b.dataset.to); (S.plan.locked ||= {})[i + m] = b.dataset.to; save("plan"); close(); paint(); $(`[data-swap="${i}${m}"]`)?.focus(); announce(rt(b.dataset.to).t); });
  };
  el.innerHTML = `<div class="panel swappanel" role="dialog" aria-modal="true" aria-labelledby="swap-h">
    <div class="bar">
      <h2 id="swap-h" tabindex="-1">${esc(t("swap_h", { r: rt(x.id).t }))}</h2>
      <button class="iconbtn" type="button" id="swclose" aria-label="${esc(t("close"))}">${ico("x")}</button>
    </div>
    <div class="body">
      <p class="small mute">${esc(dayName((i + 1) % 7))} · ${esc(t("meal_" + m))}</p>
      ${x.pot ? `<p class="small">${ico("info", "i sm")} ${esc(t("swap_pot"))}</p>` : ""}
      <ul class="swaplist"></ul>
      <button class="btn sm ghost" type="button" id="swmore">${ico("refresh", "i sm")} ${esc(t("swap_more"))}</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  $("#app").inert = true;
  paintOpts();
  $("#swap-h", el).focus();
  $("#swclose", el).onclick = close;
  $("#swmore", el).onclick = () => { paintOpts(); $(".swapopt", el)?.focus(); };
  el.addEventListener("click", e => { if (e.target === el) close(); });
  el.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
}

function stepper(k, v, label, min) {
  return `<div class="row between"><span id="lb-${k}"><b>${esc(label)}</b></span>
    <span class="stepper" role="group" aria-labelledby="lb-${k}"><button type="button" data-hh="${k}" data-v="-1" aria-label="${esc(t("fewer"))}" ${v <= min ? "disabled" : ""}>−</button><output aria-live="polite">${num(v)}</output><button type="button" data-hh="${k}" data-v="1" aria-label="${esc(t("more"))}">+</button></span></div>`;
}

function paint() {
  if (!S.plan || S.plan.key !== planKey()) makePlan();
  const n = Math.max(1, people());
  const snapMonth = SNAP.max(n, stateOf());
  const weekly = S.weekly ?? Math.round(snapMonth / 4.33);
  if (weekly && S.plan.fitFor !== weekly + "|" + S.plan.key && totals().eat > weekly) fitBudget(weekly);
  const tot = totals();
  const pct = weekly ? tot.trip / weekly : 0;
  const over = weekly && tot.trip - weekly >= 0.5;          // the first shop is more than the budget
  const tight = weekly && tot.eat - weekly >= 0.5;          // even the weekly cost is more than the budget
  $("#wkhint").textContent = t("weekly_hint", { m: money(Math.round(snapMonth / 4.33), false) });
  $("#kpis").innerHTML = `
    <div class="card kpi"><b>${esc(money(tot.trip, false))}</b><span>${esc(t("trip_cost"))}</span><span class="tiny mute">${esc(t("trip_note"))}</span></div>
    <div class="card kpi"><b>${esc(money(tot.eat, false))}</b><span>${esc(t("week_cost"))}</span></div>
    <div class="card kpi"><b>${esc(money(tot.eat / Math.max(1, n) / 7))}</b><span>${esc(t("per_person_day"))}</span></div>
    <div class="card kpi"><b>${esc(money(weekly, false))}</b><span>${esc(t(S.weekly == null ? "budget_suggest" : "your_budget"))}</span>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(1, pct) * 100)}" aria-label="${esc(t("of_budget", { p: num(Math.round(pct * 100)) }))}"><i class="${over ? "over" : ""}"></i></div>
      <span class="small">${esc(over ? t("over_budget", { m: money(tot.trip - weekly, false) }) : t("under_budget", { m: money(Math.max(0, weekly - tot.trip), false) }))}</span></div>`;
  $("#kpis .meter i").style.width = Math.min(100, Math.round(pct * 100)) + "%";
  $("#blow").innerHTML = tight ? `<div class="notice warn">${ico("alert")}<p>${esc(t("budget_low", { m: money(tot.eat, false) }))} <a href="#/find/in/free">${esc(t("free_near"))}</a></p></div>`
    : over ? `<div class="notice info">${ico("info")}<p>${esc(t("trip_over", { t: money(tot.trip, false), m: money(tot.eat, false) }))}</p></div>` : "";

  $("#week").innerHTML = S.plan.days.map((d, i) => `<div class="card day"><h3>${esc(dayName((i + 1) % 7))}</h3>
    ${["b", "l", "d"].filter(m => d[m]).map(m => { const x = d[m], nm = rt(x.id).t; return `<div class="meal"><span class="k">${esc(t("meal_" + m))}</span>
      <button class="name" type="button" data-open="${x.id}">${esc(nm)}${x.lo ? ` <span class="badge">${esc(t("leftovers"))}</span>` : x.batch ? ` <span class="badge yolk">${esc(t("cook_n", { n: x.batch }))}</span>` : ""}</button>
      <button class="swapbtn" type="button" data-swap="${i}${m}" aria-haspopup="dialog">${ico("swap", "i sm")}<span>${esc(t("swap_btn"))}</span><span class="sr">: ${esc(nm)}</span></button></div>`; }).join("") || `<p class="mute small">${esc(t("no_meals"))}</p>`}</div>`).join("");
  $$("[data-open]").forEach(b => b.onclick = () => { location.hash = "#/cook/" + b.dataset.open; });
  $$("[data-swap]").forEach(b => b.onclick = () => {
    const i = +b.dataset.swap[0], m = b.dataset.swap[1];
    chooser(i, m, b);
  });

  const by = {}; for (const it of tot.items) (by[it.aisle] ||= []).push(it);
  $("#shop").innerHTML = AISLES.filter(a => by[a]).map(a => `<h3>${esc(t("aisle_" + a))}</h3>${by[a].sort((x, y) => name(x.id).localeCompare(name(y.id), S.lang)).map(it => `
    <div class="check ${S.got.has(it.id) ? "done" : ""}">
      <input type="checkbox" id="g-${it.id}" data-got="${it.id}" ${S.got.has(it.id) ? "checked" : ""}>
      <div class="nm"><label for="g-${it.id}">${esc(name(it.id))}<small>${esc(it.have ? t("have_it") : `${num(it.n)} × ${pkgLabel(it.id)}`)}</small></label>
        <span class="ln"><button class="link small" type="button" data-have="${it.id}">${esc(it.have ? t("need_it") : t("have_it_btn"))}<span class="sr">: ${esc(name(it.id))}</span></button>${it.have ? "" : `<button class="link small tipbtn" type="button" data-tip="${it.id}" aria-expanded="false" aria-controls="tip-${it.id}">${ico("search", "i sm")}${esc(t("tips_btn"))}<span class="sr">: ${esc(name(it.id))}</span></button>`}</span></div>
      ${it.have ? "" : `<button class="price" type="button" data-price="${it.id}" aria-label="${esc(t("edit_price", { i: name(it.id), m: money(it.c) }))}"><bdi>${esc(money(it.c))}</bdi>${ico("pencil", "i sm")}</button>
      <div class="tip" id="tip-${it.id}" hidden></div>`}
    </div>`).join("")}`).join("") || `<p class="mute">${esc(t("list_empty"))}</p>`;
  $$("[data-got]").forEach(c => c.onchange = () => { c.checked ? S.got.add(c.dataset.got) : S.got.delete(c.dataset.got); save("got"); c.parentElement.classList.toggle("done", c.checked); });
  $$("[data-have]").forEach(b => b.onclick = () => { const id = b.dataset.have; S.have.has(id) ? S.have.delete(id) : S.have.add(id); save("have"); paint(); $(`[data-have="${id}"]`)?.focus(); });
  $$("[data-price]").forEach(b => b.onclick = () => editPrice(b.dataset.price, b));
  $$("[data-tip]").forEach(b => b.onclick = () => {
    const box = $("#tip-" + b.dataset.tip), open = box.hidden;
    if (open && !box.firstChild) {
      box.innerHTML = tipHtml(b.dataset.tip);
      $$("a[data-out]", box).forEach(a => a.addEventListener("click", e => { e.preventDefault(); openOut(a.href); }));
    }
    box.hidden = !open; b.setAttribute("aria-expanded", open);
  });
  $("#extras").innerHTML = Object.keys(S.extra).length ? `<p class="small">${esc(t("extras", { n: Object.keys(S.extra).length }))} <button class="link" type="button" id="clrx">${esc(t("clear"))}</button></p>` : "";
  $("#clrx")?.addEventListener("click", () => { S.extra = {}; save("extra"); paint(); });
}

/* ---------- buying tips and store search links ---------- */
// which money-saving tip fits each ingredient
const TIP = {};
for (const [k, ids] of Object.entries({
  bulk: "rice lentils peas_d potato onion chbr beef", dry: "dbeans",
  lowna: "cbeans chick ctom tsauce corn bouil beets",
  store: "pasta flour oats tpaste tuna coco eggs milk butter oil pb mayo tofu bread ftort ctort ramen salsa soy vinegar sugar bpowder",
  block: "cheddar", plain: "yogurt", bone: "chleg", whole: "carrot cabbage garlic celery",
  season: "sweetp pepper gonion cilantro lime ginger", frozen: "fmix fpeas fspin fbroc",
  intl: "cumin chili curry paprika italian garpow cinn mungb buckwheat kimchi",
})) for (const id of ids.split(" ")) TIP[id] = k;
// items where the store's own brand is the best value: the search asks for it by name
const OWN = new Set(["rice", "lentils", "peas_d", "dbeans", ...Object.keys(TIP).filter(id => ["store", "lowna", "frozen", "block", "plain"].includes(TIP[id]))]);
const QUERY = { onion: "yellow onions 3 lb bag", potato: "russet potatoes 5 lb bag", dbeans: "dried pinto beans", cbeans: "canned black beans", chleg: "bone-in chicken thighs", buckwheat: "buckwheat groats", peas_d: "dried split peas" };
const KROGER = { // state -> [store name, site]; all of them carry the Kroger store brand
  CA: ["Ralphs", "ralphs.com"], OR: ["Fred Meyer", "fredmeyer.com"], WA: ["Fred Meyer", "fredmeyer.com"], AK: ["Fred Meyer", "fredmeyer.com"], ID: ["Fred Meyer", "fredmeyer.com"],
  CO: ["King Soopers", "kingsoopers.com"], AZ: ["Fry's", "frysfood.com"], UT: ["Smith's", "smithsfoodanddrug.com"], NV: ["Smith's", "smithsfoodanddrug.com"],
  NM: ["Smith's", "smithsfoodanddrug.com"], MT: ["Smith's", "smithsfoodanddrug.com"], WY: ["Smith's", "smithsfoodanddrug.com"],
  NC: ["Harris Teeter", "harristeeter.com"], SC: ["Harris Teeter", "harristeeter.com"], MD: ["Harris Teeter", "harristeeter.com"], DE: ["Harris Teeter", "harristeeter.com"], DC: ["Harris Teeter", "harristeeter.com"],
  KS: ["Dillons", "dillons.com"], NE: ["Baker's", "bakersplus.com"], IL: ["Mariano's", "marianos.com"], WI: ["Pick 'n Save", "picknsave.com"],
  OH: 1, KY: 1, TN: 1, GA: 1, TX: 1, MI: 1, IN: 1, WV: 1, AL: 1, MS: 1, AR: 1, LA: 1, VA: 1, SD: 0,
};
function shops() {
  const k = KROGER[stateOf()];
  const kr = Array.isArray(k) ? [k[0], `https://www.${k[1]}/search?query=`, "Kroger"] : k === 1 ? ["Kroger", "https://www.kroger.com/search?query=", "Kroger"] : null;
  return [["Walmart", "https://www.walmart.com/search?q=", "Great Value"], kr, ["Target", "https://www.target.com/s?searchTerm=", "Good & Gather"]].filter(Boolean);
}
function tipHtml(id) {
  const q = QUERY[id] || ingNameEn(id).replace(/\s*\(.*?\)/g, "").toLowerCase();
  const links = shops().map(([n, u, own]) => `<a href="${esc(u + encodeURIComponent((OWN.has(id) ? own + " " : "") + q))}" target="_blank" rel="noopener noreferrer" data-out>${esc(n)} ${ico("ext", "i sm")}</a>`).join("");
  return `${TIP[id] ? `<p>${esc(t("tip_" + TIP[id]))}</p>` : ""}<p class="at"><span>${esc(t("find_at"))}</span>${links}</p>`;
}

function editPrice(id, btn) {
  const x = FD.ing[id];
  const f = document.createElement("form"); f.className = "pedit";
  const cur = money(0).replace(/[\d.,\s\u00a0\u200f\u200e]/g, "");
  f.innerHTML = `<label class="sr" for="pe">${esc(t("price_for", { p: pkgLabel(id) }))}</label>
    <span class="pbox" dir="ltr"><span class="cur" aria-hidden="true">${esc(cur)}</span><input class="in" id="pe" inputmode="decimal" autocomplete="off" value="${(price(id) * x.per).toFixed(2)}"></span>
    <button class="btn sm" type="submit">${esc(t("save"))}</button>
    ${S.prices[id] != null ? `<button class="link small" type="button" id="prs">${esc(t("reset"))}</button>` : ""}`;
  btn.replaceWith(f); const inp = $("#pe", f); inp.focus(); inp.select();
  f.onsubmit = e => { e.preventDefault(); const v = parseFloat(inp.value.replace(/[^0-9.]/g, "")); if (v > 0 && v < 500) { S.prices[id] = v / x.per; save("prices"); } paint(); $(`[data-price="${id}"]`)?.focus(); };
  $("#prs", f)?.addEventListener("click", () => { delete S.prices[id]; save("prices"); paint(); });
  inp.onkeydown = e => { if (e.key === "Escape") { done = true; paint(); $(`[data-price="${id}"]`)?.focus(); } };
  // leaving the box keeps what was typed (unless they pressed Reset or Escape)
  let done = false;
  f.addEventListener("pointerdown", e => { if (e.target.id === "prs") done = true; });
  inp.onblur = () => setTimeout(() => { if (!done && f.isConnected && !f.contains(document.activeElement)) f.requestSubmit(); }, 0);
}

function listText() {
  const tot = totals(), by = {};
  for (const it of tot.items) if (!it.have && !S.got.has(it.id)) (by[it.aisle] ||= []).push(it);
  return `Plenty Map · ${t("shop_h")}\n` + AISLES.filter(a => by[a]).map(a => `\n${t("aisle_" + a)}\n` + by[a].map(it => `☐ ${name(it.id)}: ${num(it.n)} × ${pkgLabel(it.id)} (${money(it.c)})`).join("\n")).join("\n") + `\n\n${t("total")}: ${money(tot.trip)}`;
}

export async function render(main) {
  FD = await food();
  main.innerHTML = `
    <h1 class="disp">${esc(t("budget_h"))}</h1>
    <p class="lead">${esc(t("budget_p"))}</p>
    <div class="grid2 gap-t">
      <div class="card pad stack">
        ${stepper("a", S.hh.a, t("adults"), 1)}
        ${stepper("k", S.hh.k, t("kids"), 0)}
        <div class="fg" role="group" aria-labelledby="l-meals"><div class="fg-h" id="l-meals">${esc(t("meals_q"))}</div>
          <div class="chips wrap">${["b", "l", "d"].map(m => `<button class="chip ck" type="button" data-m="${m}" aria-pressed="${!!S.meals[m]}">${mark("ck")}${esc(t("meal_" + m))}</button>`).join("")}</div></div>
        <label class="field"><span>${esc(t("weekly_q"))}</span>
          <input class="in" id="wk" inputmode="decimal" aria-describedby="wkhint" value="${S.weekly ?? ""}">
          <small id="wkhint"></small></label>
      </div>
      <div class="kpis" id="kpis"></div>
    </div>
    <div id="blow" role="status"></div>
    <div class="sec"><h2>${esc(t("week_h"))}</h2><button class="btn sm ghost" type="button" id="shuf">${ico("refresh", "i sm")} ${esc(t("reshuffle"))}</button></div>
    <div class="week grid2" id="week"></div>
    <div class="sec"><h2 id="shop-h" tabindex="-1">${esc(t("shop_h"))}</h2>
      <span class="row"><button class="btn sm ghost" type="button" id="sharel">${ico("share", "i sm")} ${esc(t("share"))}</button><button class="btn sm ghost" type="button" id="printl">${ico("print", "i sm")} ${esc(t("print"))}</button></span></div>
    <div id="extras"></div>
    <div class="card shop" id="shop"></div>
    <p class="tiny mute">${esc(t("price_note"))} ${esc(t("price_edit_hint"))}</p>
    <p class="soon">${ico("clock", "i sm")}<span>${esc(t("soon_prices"))}</span></p>
    ${foot()}`;
  $$("[data-hh]").forEach(b => b.onclick = () => {
    const k = b.dataset.hh; S.hh[k] = Math.max(k === "a" ? 1 : 0, Math.min(12, S.hh[k] + +b.dataset.v)); save("hh");
    const row = b.parentElement; row.querySelector("output").textContent = num(S.hh[k]); row.querySelector('[data-v="-1"]').disabled = S.hh[k] <= (k === "a" ? 1 : 0);
    paint();
  });
  $$("[data-m]").forEach(b => b.onclick = () => {
    const m = b.dataset.m; S.meals[m] = S.meals[m] ? 0 : 1;
    if (!S.meals.b && !S.meals.l && !S.meals.d) S.meals[m] = 1;
    save("meals"); $$("[data-m]").forEach(x => x.setAttribute("aria-pressed", !!S.meals[x.dataset.m])); paint();
  });
  // the week follows the budget as it's typed (a short pause, so it doesn't jump on every digit)
  let wt = 0;
  const setWeekly = (el, tidy) => { const v = parseFloat(el.value.replace(/[^0-9.]/g, "")); S.weekly = v > 0 ? Math.round(v) : null; save("weekly"); if (tidy) el.value = S.weekly ?? ""; paint(); };
  $("#wk").oninput = e => { clearTimeout(wt); wt = setTimeout(() => setWeekly(e.target, false), 450); };
  $("#wk").onchange = e => { clearTimeout(wt); setWeekly(e.target, true); };
  if (S.jumpList) { S.jumpList = false; requestAnimationFrame(() => { const h = $("#shop-h"); h?.scrollIntoView({ block: "start" }); h?.focus({ preventScroll: true }); }); }
  $("#shuf").onclick = () => { makePlan(false); paint(); announce(t("reshuffled")); };
  $("#printl").onclick = () => window.print();
  $("#sharel").onclick = () => shareThing({ title: t("shop_h"), text: listText() });
  paint();
}
