/* Home: what Plenty Map is, with real things up front. Tonight's dinner with its price, places near
   you that are open now or soon, and a menu of the four tabs with what each one holds. */
import { S, t, esc, $, ico, dish, money, num, rt, miles, dist, timeFmt, dateFmt, tidyCaps, activeCuisine } from "./core.js";
import { food, canCook, dietOk, perServing, slotOf } from "./food.js";
import { region } from "./region.js";
import { nextTimes, todayISO } from "./hours.js";
import { locForm, bindLoc, foot } from "./app.js";
import { kindIcon } from "./glyphs.js";

const FREE = ["pantry", "senior", "meal", "fridge", "summer", "givebox"];
const NEAR_M = 16093;          // 10 miles
const DAY = 864e5;

/* ---------- dinner ---------- */
// The cheapest dinners you can make with your kitchen and diet. Tonight's pick turns over each day
// among the cheapest few, so the page isn't the same recipe every visit.
function dinners(FD) {
  const ok = FD.recipes.filter(r => slotOf(r) === "d" && canCook(r) && dietOk(r) && r.lvl <= S.comfort);
  const cu = activeCuisine();
  // a dish from your own cooking counts as a little cheaper here, so it wins ties
  const key = r => perServing(r) * (r.cu?.includes(cu) ? 0.85 : 1);
  return ok.sort((a, b) => key(a) - key(b));
}
function dayIndex() {
  const d = todayISO(new Date());
  return Math.floor(Date.parse(d + "T12:00:00Z") / DAY);
}
// the round price most recipes come in under, for the Cook line
function mostUnder(list) {
  if (!list.length) return null;
  const ps = list.map(perServing).sort((a, b) => a - b);
  for (const c of [1, 1.5, 2, 2.5, 3, 4]) if (ps.filter(p => p <= c).length / ps.length >= 0.6) return c;
  return null;
}

/* ---------- places ---------- */
function stale(R, s) {
  if (R.built && (Date.now() - Date.parse(R.built)) / DAY > R.staleAfter) return true;
  if (s.d?.some(d => d.src !== "osm")) return false;
  if (s.k === "givebox") return false;
  return !s.ed || (Date.now() - Date.parse(s.ed)) / DAY > 90;
}
function nextOf(s, at) {
  const td = s.tz ? todayISO(at, s.tz) : todayISO(at);
  let best = null;
  for (const d of s.d || []) {
    if (!d.sc || d.conf === "call" || d.conf === "none") continue;
    const x = nextTimes(d.sc, at, 1, 8, s.tz)[0];
    if (x && (!best || (x.date + (x.t[0] || "")) < (best.date + (best.t[0] || "")))) best = { ...x, td };
  }
  return best;
}
function whenText(x) {
  const tomorrow = new Date(Date.parse(x.td + "T12:00:00Z") + DAY).toISOString().slice(0, 10);
  const day = x.date === x.td ? t("today") : x.date === tomorrow ? t("tomorrow")
    : dateFmt(new Date(x.date + "T20:00:00Z"), { weekday: "long" });
  const [a, b] = x.t;
  const time = a && b ? t("time_range", { a: timeFmt(a), b: timeFmt(b) }) : a ? t("time_from", { a: timeFmt(a) }) : "";
  return [day, time].filter(Boolean).join(" · ");
}
/* Up to three free food places open now or soonest within ten miles, and the nearest low-price grocery store. */
function nearby(R) {
  const here = S.loc, at = new Date();
  const m = s => (s._hm ??= dist(here.lat, here.lon, s.lat, s.lon));
  for (const s of [...R.sites, ...R.stores]) s._hm = undefined;
  const free = R.sites.filter(s => FREE.includes(s.k) && (S.senior || s.k !== "senior") && m(s) <= NEAR_M && !stale(R, s))
    .sort((a, b) => m(a) - m(b)).slice(0, 40)
    .map(s => ({ s, x: nextOf(s, at) })).filter(o => o.x);
  // open now first, then today, then the soonest; nearer wins within the same hour
  const k = o => (o.x.now ? "0" : "1") + o.x.date + (o.x.t[0] || "99");
  free.sort((a, b) => k(a).localeCompare(k(b)) || m(a.s) - m(b.s));
  const stores = R.stores.filter(s => s.k === "store" && m(s) <= NEAR_M);
  const cheap = stores.filter(s => s.tier === "budget").sort((a, b) => m(a) - m(b))[0];
  const freeCount = R.sites.filter(s => FREE.includes(s.k) && (S.senior || s.k !== "senior") && m(s) <= NEAR_M).length;
  return { free: free.slice(0, 3), cheap, stores: stores.length, freeCount, m };
}

/* ---------- markup ---------- */
function dinnerBlock(list) {
  if (!list.length) return `<p class="hm-none">${esc(t("home_no_dinner"))} <a href="#/cook">${esc(t("tab_cook"))}</a></p>`;
  const pool = list.slice(0, Math.min(7, list.length));
  const i = dayIndex() % pool.length;
  const r = pool[i], others = [pool[(i + 1) % pool.length], pool[(i + 2) % pool.length]].filter(x => x && x !== r);
  const per = perServing(r);
  return `<section class="hm-dinner" aria-labelledby="hm-dh">
    <h2 id="hm-dh" class="hm-label">${esc(t("home_tonight"))}</h2>
    <a class="hm-dish" href="#/cook/${esc(r.id)}">
      <span class="hm-plate" aria-hidden="true">${dish(r.id, r.icon)}</span>
      <span class="hm-dtext">
        <span class="hm-dname">${esc(rt(r.id).t)}</span>
        <span class="hm-price"><b>${esc(money(per))}</b> ${esc(t("per_serving"))}</span>
        <span class="hm-dmeta">${esc(t("home_feeds", { n: r.serves, m: money(per * r.serves) }))} · ${esc(t("mins", { n: r.mins }))}</span>
      </span>
    </a>
    ${others.length ? `<div class="hm-or"><p>${esc(t("home_or"))}</p><ul>${others.map(o => `<li><a href="#/cook/${esc(o.id)}"><span class="hm-oname">${esc(rt(o.id).t)}</span><span class="hm-lead" aria-hidden="true"></span><span class="hm-op">${esc(money(perServing(o)))}</span></a></li>`).join("")}</ul></div>` : ""}
  </section>`;
}

function placeRow(s, line, m) {
  return `<li><a class="hm-place" href="#/find/${esc(s.id)}">
    <span class="ktile kt-${esc(s.k)}" aria-hidden="true">${kindIcon(s.k)}</span>
    <span class="hm-ptext">
      <span class="hm-pname">${esc(tidyCaps(s.n))}</span>
      <span class="hm-pline">${line}<span class="hm-dist">${esc(miles(m(s)))}</span></span>
    </span>
  </a></li>`;
}
function nearBlock(N) {
  const rows = N.free.map(({ s, x }) => placeRow(s,
    `<span class="${x.now ? "hm-open" : ""}">${x.now ? `${esc(t("open_now"))} · ` : ""}${esc(whenText(x))}</span>`, N.m));
  if (N.cheap) rows.push(placeRow(N.cheap, `<span>${esc(t("home_cheap_store"))}</span>`, N.m));
  const total = N.freeCount + N.stores;
  return rows.length
    ? `<ul class="hm-places">${rows.join("")}</ul>
       <a class="hm-all" href="#/find">${esc(t("home_see_all", { n: total }))} ${ico("arrow", "i sm")}</a>`
    : `<p class="hm-none">${esc(t("home_none_near"))}</p><a class="hm-all" href="#/find">${esc(t("tab_find"))} ${ico("arrow", "i sm")}</a>`;
}

function menu(FD, N) {
  const cookable = FD.recipes.filter(r => canCook(r) && dietOk(r));
  const under = mostUnder(cookable);
  const rows = [
    ["cook", "pot", t("home_v_recipes", { n: cookable.length }), under ? t("home_d_cook", { m: money(under) }) : t("home_d_cook_any")],
    ["budget", "wallet", S.weekly ? t("home_v_week", { m: money(S.weekly, false) }) : t("home_v_days"), t("home_d_budget")],
    ["find", "basket", N ? t("home_v_near", { n: N.freeCount + N.stores }) : "", t("home_d_find")],
    ["help", "hand", "", t("home_d_help")],
  ];
  return `<nav class="hm-menu" aria-labelledby="hm-mh">
    <h2 id="hm-mh" class="hm-label">${esc(t("home_menu"))}</h2>
    <ol>${rows.map(([id, ic, v, d]) => `<li><a href="#/${id}">
      <span class="hm-mrow"><span class="hm-mico" aria-hidden="true">${ico(ic)}</span><span class="hm-mname">${esc(t("tab_" + id))}</span><span class="hm-lead" aria-hidden="true"></span>${v ? `<span class="hm-mval">${esc(v)}</span>` : `<span class="hm-mval hm-arrow">${ico("arrow", "i sm")}</span>`}</span>
      <span class="hm-mdesc">${esc(d)}</span>
    </a></li>`).join("")}</ol>
  </nav>`;
}

/* ---------- page ---------- */
export async function render(main) {
  main.classList.add("homemode");
  const [FD, R] = await Promise.all([food(), S.loc ? region().catch(() => null) : null]);
  const N = S.loc && R?.covered !== false && R ? nearby(R) : null;
  const where = S.loc?.label ? esc(S.loc.label) : "";
  const day = dateFmt(new Date(), { weekday: "long" });
  main.innerHTML = `<div class="home">
    <section class="hm-board">
      <p class="hm-kicker">${where ? `<span>${where}</span><span aria-hidden="true">·</span>` : ""}<span>${esc(day)}</span></p>
      <h1 class="hm-h">${esc(t("hm_h"))}</h1>
      <p class="hm-lede">${esc(t("home_lede"))}</p>
      ${dinnerBlock(dinners(FD))}
    </section>
    <section class="hm-near" aria-labelledby="hm-nh">
      <h2 id="hm-nh" class="hm-label">${esc(t(N ? "home_near" : "home_near_noloc"))}${N && where ? ` <a class="hm-change" href="#/find">${esc(t("home_change"))}</a>` : ""}</h2>
      ${N ? nearBlock(N) : `<p class="hm-ask">${esc(t("home_ask_loc"))}</p>${locForm("h")}<p class="small" id="h-msg" role="status"></p>`}
    </section>
    ${menu(FD, N)}
  </div>${foot()}`;
  if (!N) bindLoc("h", () => render(main));
  return () => main.classList.remove("homemode");
}
