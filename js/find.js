/* Find food: free groceries, senior boxes, meals, fridges, cheap grocery stores, farmers markets
   and SNAP restaurants near a ZIP or the phone's location. All from our own area files. */
import { S, save, t, esc, $, $$, ico, mark, money, num, dateFmt, timeFmt, miles, dist, tidyCaps, telHref, safeUrl, shareThing, openOut, activeCuisine, announce, store, locLabel, DESK } from "./core.js";
import { region } from "./region.js";
import { nextTimes, todayISO } from "./hours.js";
import { locForm, bindLoc, foot } from "./app.js";
import { CONFIG } from "./config.js";
import { kindIcon } from "./glyphs.js";
import * as reportMod from "./report.js";

const FREE = ["pantry", "senior", "meal", "fridge", "summer", "garden", "givebox"];
// the combined "Free food" list: everything free except gardens (not a place to pick up food on a schedule)
const FREE_ALL = ["pantry", "senior", "meal", "fridge", "summer", "givebox"];
const CATS = [
  { id: "store", kinds: ["store"], icon: "store" },
  { id: "market", kinds: ["market"], icon: "market" },
  { id: "free", kinds: FREE_ALL, icon: "pantry" },
  { id: "pantry", kinds: ["pantry"], icon: "pantry" },
  { id: "senior", kinds: ["senior"], icon: "senior" },
  { id: "meal", kinds: ["meal"], icon: "meal" },
  { id: "summer", kinds: ["summer"], icon: "summer" },
  { id: "fridge", kinds: ["fridge"], icon: "fridge" },
  { id: "givebox", kinds: ["givebox"], icon: "givebox" },
  { id: "garden", kinds: ["garden"], icon: "garden" },
  { id: "bakery", kinds: ["bakery"], icon: "bakery" },
  { id: "rmp", kinds: ["rmp"], icon: "rmp" },
];
// ways to sort, by kind of list; the first is the default
const SORTS = { store: ["value", "cheap", "near"], sched: ["near", "soon"], plain: ["near"] };
const SCHED = ["pantry", "senior", "meal", "summer"];
const sortsFor = cat => cat.id === "store" ? SORTS.store : cat.kinds.some(k => SCHED.includes(k)) ? SORTS.sched : SORTS.plain;
const TIER = { budget: 1, standard: 2, premium: 3 };
const PAGE = 20;
const FA_URL = "https://www.feedingamerica.org/find-your-local-foodbank";
// county middle, used only to sort when no location is set
const MID = { lat: 32.85, lon: -117.0 };

const F = {
  cat: store.get("fcat", "store"),
  today: false, walk: false, drive: false,
  sort: "",
  shown: PAGE,
  view: "list",
};

// reportMod (imported above): the private "report a problem" form, reportUI(s) and bindReport(root)
let R, mapApi = null, mapMod = null, focusId = null, openId = null;
const catOf = id => CATS.find(c => c.id === id) || CATS[0];
// The category picker shows every option at once, no sideways scrolling: the main kinds of place as equal tiles,
// and the kinds inside the chosen one as chips under them (only when there is more than one to pick from)
const GROUPS = [
  { id: "store", subs: ["bakery"] },
  { id: "market", subs: [] },
  { id: "free", subs: ["pantry", "senior", "meal", "summer", "fridge", "givebox", "garden"] },
  { id: "rmp", subs: [] },
];
const groupOf = id => GROUPS.find(g => g.id === id || g.subs.includes(id)) || GROUPS[0];
const isFreeCat = cat => cat.kinds.some(k => FREE.includes(k));
const phone = () => !matchMedia(DESK).matches;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function dirUrl(s) {
  const q = `${s.lat},${s.lon}`;
  return /iPhone|iPad|Macintosh/.test(navigator.userAgent)
    ? `https://maps.apple.com/?daddr=${q}&q=${encodeURIComponent(s.n)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/* ---------- next open times ---------- */
const nowCache = { at: 0, today: "" };
function soon(s) {
  if (s._soonAt === nowCache.at) return s._soon;
  let all = [];
  const at = new Date(nowCache.at), td = s.tz ? todayISO(at, s.tz) : nowCache.today;
  for (const d of s.d || []) {
    if (!d.sc || d.conf === "call" || d.conf === "none") continue;
    for (const x of nextTimes(d.sc, at, 3, 45, s.tz)) all.push({ ...x, d, td });
  }
  all.sort((a, b) => (a.date + (a.t[0] || "")).localeCompare(b.date + (b.t[0] || "")));
  s._soonAt = nowCache.at; s._soon = all.slice(0, 3);
  return s._soon;
}
function whenText(x) {
  const today = x.td || nowCache.today;   // "today" in the site's own time zone
  const [y, m, d] = x.date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 20));
  const tomorrow = new Date(Date.UTC(...today.split("-").map((v, i) => i === 1 ? v - 1 : +v), 20) + 864e5).toISOString().slice(0, 10);
  const day = x.date === today ? t("today") : x.date === tomorrow ? t("tomorrow") : dateFmt(dt, { weekday: "short", month: "short", day: "numeric" });
  const [a, b] = x.t;
  const time = a && b ? t("time_range", { a: timeFmt(a), b: timeFmt(b) }) : a ? t("time_from", { a: timeFmt(a) }) : "";
  return [day, time].filter(Boolean).join(" · ");
}

/* ---------- filtering and ranking ---------- */
function pool(cat) {
  const p = isFreeCat(cat) ? R.sites : R.stores;
  let list = p.filter(s => cat.kinds.includes(s.k));
  if (cat.id === "free" && !S.senior) list = list.filter(s => s.k !== "senior");
  return list;
}
function candidates() {
  const cat = catOf(F.cat);
  const here = S.loc || MID;
  const sort = sortsFor(cat).includes(F.sort) ? F.sort : sortsFor(cat)[0];
  let list = pool(cat);
  for (const s of list) s._m = dist(here.lat, here.lon, s.lat, s.lon);
  const freeCat = isFreeCat(cat);
  if (freeCat) {
    if (F.today) list = list.filter(s => soon(s).some(x => x.today));
    if (F.walk) list = list.filter(s => s.d.some(d => d.f?.includes("walk")));
    if (F.drive) list = list.filter(s => s.d.some(d => d.f?.includes("drive")));
    if (sort === "soon") {
      const key = s => { const x = soon(s)[0]; return x ? x.date + (x.t[0] || "99") : "9999"; };
      list.sort((a, b) => key(a).localeCompare(key(b)) || a._m - b._m);
    } else list.sort((a, b) => a._m - b._m);
    list = [...list.filter(s => !stale(s)), ...list.filter(stale)];
  } else if (F.cat === "store" && sort === "value") {
    // cheaper stores a little farther away beat pricier ones close by; stores with your cuisine get a nudge
    const cu = activeCuisine();
    const w = { budget: 1, standard: 1.35, premium: 2.2 };
    for (const s of list) s._score = s._m * (w[s.tier] || 1.5) * (s.cu?.includes(cu) ? 0.6 : 1);
    list.sort((a, b) => a._score - b._score);
  } else if (F.cat === "store" && sort === "cheap") {
    // cheapest kind of store first, nearest first within each; only stores within about 15 miles
    const near = list.filter(s => s._m <= 24000);
    list = (near.length >= 5 ? near : list).sort((a, b) => (TIER[a.tier] || 2) - (TIER[b.tier] || 2) || a._m - b._m);
  } else list.sort((a, b) => a._m - b._m);
  return list;
}

/* ---------- rendering ---------- */
function flagBadges(d) {
  const f = d.f || [];
  const order = ["open", "walk", "drive", "senior", "student", "military", "income", "fbid", "id", "area", "appt", "register", "call", "diapers", "produce"];
  const tone = { open: "ok", walk: "", drive: "", senior: "warn", student: "warn", military: "warn", income: "", fbid: "", id: "", area: "warn", appt: "warn", register: "", call: "warn", diapers: "yolk", produce: "yolk" };
  return order.filter(k => f.includes(k)).map(k => `<span class="badge ${tone[k]}">${esc(t("f_" + k))}</span>`).join("");
}
const srcName = src => R.sources?.[src]?.name || "";

/* ---------- freshness ---------- */
// Food bank lists are rebuilt every night, so a listing they still carry counts as current.
// Other sources (OpenStreetMap) count as stale once their last edit is older than STALE_DAYS,
// and everything does if our nightly rebuild itself has stopped for a week.
const STALE_DAYS = 90, DAY = 864e5;
const PARTNER = src => src !== "osm";
const ageDays = iso => (Date.now() - new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).getTime()) / DAY;
const dayFmt = iso => dateFmt(new Date(iso.slice(0, 10) + "T12:00:00Z"), { month: "short", day: "numeric", year: "numeric" });
function stale(s) {
  if (!FREE.includes(s.k)) return false;
  if (R.built && ageDays(R.built) > R.staleAfter) return true;
  if (s.d.some(d => PARTNER(d.src))) return false;
  if (s.k === "garden" || s.k === "givebox") return false; // rarely edited on OpenStreetMap; the nightly check drops closed ones
  return !s.ed || ageDays(s.ed) > STALE_DAYS;
}
/* Who to call before going: the site, else the food bank that listed it, else 211 */
function callAhead(s) {
  if (s.ph) return { ph: s.ph, who: "" };
  const src = s.d.map(d => R.sources?.[d.src]).find(x => x?.phone);
  return src ? { ph: src.phone, who: src.name } : { ph: "211", who: "211" };
}
const REPORTS = ["closed", "nofood", "hours", "other"];
function reportBlock(s) {
  if (reportMod?.reportUI) return reportMod.reportUI(s);
  if (!FREE.includes(s.k)) return "";
  return `<details class="report"><summary>${ico("flag", "i sm")} ${esc(t("report_q"))}</summary><div class="acts">${reportLinks(s)}</div><p class="tiny mute">${esc(t("report_note"))}</p></details>`;
}
function reportLinks(s) {
  const to = CONFIG.contact;
  return REPORTS.map(k => {
    const subj = `Plenty Map report: ${k} - ${s.n}`;
    const body = `Site: ${s.n}\nAddress: ${[s.a, s.c].filter(Boolean).join(", ")}\nListing ID: ${s.id}\nProblem: ${k}\n\nAnything else (optional, any language):\n`;
    return `<a class="btn sm ghost" href="mailto:${to}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}">${esc(t("report_" + k))}</a>`;
  }).join("");
}

function fresh(s) {
  const partners = [...new Set(s.d.filter(d => PARTNER(d.src)).map(d => srcName(d.src)))].filter(Boolean);
  const parts = partners.length
    ? [t("listed_by", { s: partners.join(", "), d: dayFmt(R.built) })]
    : [s.ed ? t("osm_edited", { d: dayFmt(s.ed) }) : t("src_by", { s: "OpenStreetMap" })];
  if (s.chg) parts.push(t("changed_on", { d: dayFmt(s.chg) }));
  return parts.join(" · ");
}

/* What sets this place apart in this list: a price level for stores, your cuisine, a match program, who it's for */
function tags(s, free, flags) {
  if (free) return flagBadges({ f: flags.filter(f => !["walk", "drive", "open"].includes(f)) });
  const cu = activeCuisine();
  const out = [];
  if (s.inc) out.push(`<span class="badge yolk">${esc(t("inc_badge"))}</span>`);
  if (s.k === "market" && R.partner) out.push(`<span class="badge yolk">${esc(t("market_match"))}</span>`);
  if (s.k === "store" && cu && s.cu?.includes(cu)) out.push(`<span class="badge">${esc(t("cu_" + cu))}</span>`);
  return out.join("");
}
function priceLevel(s) {
  const n = TIER[s.tier];
  if (!n) return "";
  return `<span class="plevel" title="${esc(t("price_" + n))}"><span aria-hidden="true">${"$".repeat(n)}<span class="off">${"$".repeat(3 - n)}</span></span><span class="sr">${esc(t("price_" + n))}</span></span>`;
}
function statusLine(s, next, free, showKind) {
  const parts = [];
  if (showKind) parts.push(`<span>${esc(t("kind_" + s.k))}</span>`);
  if (S.loc) parts.push(`<span class="dist">${esc(miles(s._m))}</span>`);
  if (s.k === "store") { const p = priceLevel(s); if (p) parts.push(p); }
  return parts.join(`<span class="sep" aria-hidden="true">·</span>`);
}
/* For free food: when it's open next, on its own line, since that's what decides whether to go */
function whenLine(s, next) {
  const x = next[0];
  return x ? `<p class="pwhen ${x.now ? "open" : ""}">${ico("clock", "i sm")}<span>${x.now ? `<b>${esc(t("open_now"))}</b> · ` : ""}${esc(whenText(x))}</span></p>`
    : `<p class="pwhen call">${ico("phone", "i sm")}<span>${esc(t(s.d?.some(d => d.when) ? "call_check" : "call_hours"))}</span></p>`;
}

function siteCard(s) {
  const free = FREE.includes(s.k);
  const next = free ? soon(s) : [];
  const callFirst = free && !next.length;
  const isEn = S.lang === "en";
  const addr = [tidyCaps(s.a), tidyCaps(s.c)].filter(Boolean).join(", ");
  const showKind = catOf(F.cat).kinds.length > 1;
  const details = free ? s.d.map(d => {
    const rows = [
      d.prog && [t("prog"), t("prog_" + d.prog)],
      d.food && [t("d_food"), d.food, true],
      d.who && [t("d_who"), d.who, true],
      d.tips && [t("d_tips"), d.tips, true],
      d.notes && [t("d_notes"), d.notes, true],
      d.when && [t("d_when"), d.when, true],
    ].filter(Boolean);
    return `${s.d.length > 1 ? `<p class="small"><b>${esc(srcName(d.src))}</b></p>` : ""}<dl>${rows.map(([k, v, en]) => `<div><dt>${esc(k)}</dt><dd${en && !isEn ? ' lang="en"' : ""}>${esc(v)}</dd></div>`).join("")}</dl>`;
  }).join("") : "";
  let flags = free ? [...new Set(s.d.flatMap(d => d.f || []))] : [];
  // a 60+ box at a pantry that also serves everyone shouldn't mark the whole place "60+ only"
  if (free && s.d.some(d => !(d.f || []).includes("senior") && d.prog !== "csfp")) flags = flags.filter(f => f !== "senior");
  const tel = telHref(s.ph), web = safeUrl(s.w);
  const tg = tags(s, free, flags);
  const open = s.id === openId;
  const id = esc(s.id);
  const times = next.length > 1
    ? `<ul class="times">${next.map(x => `<li>${ico("clock", "i sm")}<span>${esc(whenText(x))}${s.d.length > 1 && (x.d.prog === "csfp" || x.d.f?.includes("senior")) ? " · " + esc(t("f_senior")) : ""}${x.now ? ` <span class="badge ok">${esc(t("open_now"))}</span>` : ""}</span></li>`).join("")}</ul>` : "";
  const call = free ? (() => { const c = callAhead(s), h = telHref(c.ph); return h ? `<p class="callahead">${ico("phone", "i sm")}<span>${esc(t("call_first"))}${s.ph ? "" : ` <bdi dir="ltr"><a href="${esc(h)}">${esc(c.ph)}</a></bdi>`}${c.who && c.who !== "211" ? ` <span class="mute">(${esc(c.who)})</span>` : ""}</span></p>` : ""; })() : "";
  const access = free ? ["walk", "drive"].filter(f => flags.includes(f)).map(f => `<span class="badge">${esc(t("f_" + f))}</span>`).join("") : "";
  return `<li class="place${s.id === focusId ? " hl" : ""}${open ? " open" : ""}" id="s-${id}" data-id="${id}">
    <span class="ktile kt-${esc(s.k)}" aria-hidden="true">${kindIcon(s.k)}</span>
    <div class="pmain">
      <h2 class="pname"><button type="button" class="ptap" aria-expanded="${open}" aria-controls="sx-${id}"><span>${esc(s.n)}</span><span class="pchev" aria-hidden="true">${ico("chev", "i sm")}</span></button></h2>
      <p class="pline">${statusLine(s, next, free, showKind)}</p>
      ${free ? whenLine(s, next) : ""}
      ${addr ? `<p class="addr"><bdi dir="ltr">${esc(addr)}</bdi></p>` : ""}
      ${s.rep === "closed" || s.rep === "hours" ? `<p class="notice stale">${ico("flag", "i sm")}<span>${esc(t("rep_flag_" + s.rep))}</span></p>` : ""}
      ${free && stale(s) ? `<p class="notice stale">${ico("alert", "i sm")}<span>${esc(t("stale"))}</span></p>` : ""}
      ${tg ? `<div class="ptags">${tg}</div>` : ""}
    </div>
    <a class="pdir" href="${esc(dirUrl(s))}" target="_blank" rel="noopener noreferrer" data-out aria-label="${esc(t("directions") + ": " + s.n)}">${ico("route", "i sm")}<span class="lbl" aria-hidden="true">${esc(t("directions"))}</span></a>
    <div class="pmore" id="sx-${id}"${open ? "" : " hidden"}>
      ${times}${call}
      ${access ? `<div class="ptags">${access}</div>` : ""}
      <div class="acts">
        ${tel ? `<a class="btn sm" href="${esc(tel)}">${ico("phone", "i sm")} ${esc(t("call"))}</a>` : ""}
        ${web ? `<a class="btn sm" href="${esc(web)}" target="_blank" rel="noopener noreferrer" data-out>${ico("ext", "i sm")} ${esc(t("website"))}</a>` : ""}
        <button class="btn sm ghost" type="button" data-share="${id}">${ico("share", "i sm")} ${esc(t("share"))}</button>
      </div>
      ${details ? `<details><summary>${ico("chev", "i sm")} ${esc(t("details"))}</summary>${!isEn ? `<p class="src">${esc(t("src_english"))}</p>` : ""}${details}</details>` : ""}
      ${free ? `<p class="src">${esc(fresh(s))}${callFirst ? "" : " · " + esc(t("times_change"))}</p>` : ""}
      ${reportBlock(s)}
    </div>
  </li>`;
}

/* Holiday weeks: the six days before a major US holiday through the day after. Pantries and meal sites
   often close or move their days then, so the free food lists say to call first. */
const DAYMS = 864e5;
function nthDow(y, m, dow, n) { // n-th weekday of a month (n = -1 for the last), as a UTC midnight
  if (n > 0) { const d = new Date(Date.UTC(y, m, 1)); return Date.UTC(y, m, 1 + ((dow - d.getUTCDay() + 7) % 7) + 7 * (n - 1)); }
  const last = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m + 1, 0) - ((last.getUTCDay() - dow + 7) % 7) * DAYMS;
}
export function holidayWeek(iso) {
  const now = Date.parse(iso + "T00:00:00Z"), y = +iso.slice(0, 4);
  const days = [Date.UTC(y, 0, 1), nthDow(y, 4, 1, -1), Date.UTC(y, 6, 4), nthDow(y, 8, 1, 1), nthDow(y, 10, 4, 4), Date.UTC(y, 11, 25), Date.UTC(y + 1, 0, 1)];
  return days.some(d => now >= d - 6 * DAYMS && now <= d + DAYMS);
}

function catNote() {
  const n = {
    store: t("note_store"),
    market: t(R.partner ? "note_market" : "us_note_market"),
    rmp: t("note_rmp"),
    senior: t("note_senior"),
    meal: t(R.partner ? "note_meal" : "us_note_meal"),
    fridge: t("note_fridge"),
    summer: t("note_summer"), garden: t("note_garden"), givebox: t("note_givebox"), bakery: t("note_bakery"),
  }[F.cat];
  // where we list only a few free food places nearby, say the list may be missing some, and where to find the rest
  const extra = thinHere() && CATS.find(c => c.id === F.cat)?.kinds.some(k => FREE.includes(k))
    ? `<div class="notice info">${ico("info")}<p>${esc(t("us_listings_note"))} <a href="${esc(FA_URL)}" target="_blank" rel="noopener noreferrer" data-out>${esc(t("us_fb_find"))}</a> · <a href="tel:211">${esc(t("call_211"))}</a></p></div>` : "";
  const freeCat = CATS.find(c => c.id === F.cat)?.kinds.some(k => SCHED.includes(k));
  const hol = freeCat && holidayWeek(todayISO(new Date())) ? `<p class="notice stale" id="fhol">${ico("clock", "i sm")}<span>${esc(t("holiday_week"))}</span></p>` : "";
  return hol + (n ? `<div class="notice info">${ico("info")}<p>${esc(n)}</p></div>` : "") + extra;
}

/* Fewer than 8 free food places within about 15 miles: the list is probably missing some */
function thinHere() {
  if (R.partner || S.loc?.lat == null) return !R.partner;
  let n = 0;
  for (const x of R.sites) if (FREE.includes(x.k) && dist(S.loc.lat, S.loc.lon, x.lat, x.lon) <= 24000 && ++n >= 8) return false;
  return true;
}

function dataNote() {
  const d = dateFmt(new Date(R.built), { month: "long", day: "numeric" });
  return `${ico("info")}<p>${esc(t(R.partner ? "data_note" : "us_data_note", { d }))}</p>`;
}

function paintList() {
  nowCache.at = Math.floor(Date.now() / 60000) * 60000; nowCache.today = todayISO(new Date(nowCache.at));
  const list = candidates();
  const box = $("#flist");
  if (!box) return;
  if (focusId) { const i = list.findIndex(x => x.id === focusId); if (i >= F.shown) F.shown = Math.ceil((i + 1) / PAGE) * PAGE; }
  const shown = list.slice(0, F.shown);
  const freeCat = isFreeCat(catOf(F.cat));
  $("#fcount").textContent = t("results", { n: list.length });
  // outside San Diego County, an empty free-food list points to the people who know every pantry
  const helpBtns = freeCat && !R.partner ? `<div class="row center"><a class="btn sm pri" href="${esc(FA_URL)}" target="_blank" rel="noopener noreferrer" data-out>${ico("ext", "i sm")} ${esc(t("us_fb_find"))}</a><a class="btn sm" href="tel:211">${ico("phone", "i sm")} ${esc(t("call_211"))}</a></div>` : "";
  box.innerHTML = shown.length ? shown.map(siteCard).join("") :
    `<li class="card empty">${ico("search")}<p><b>${esc(t("none_h"))}</b></p><p class="mute">${esc(t(freeCat && (F.today || F.walk || F.drive) ? "none_filters" : "none_p"))}</p>${helpBtns}</li>`;
  $("#fmore").innerHTML = list.length > F.shown ? `<button class="btn" type="button" id="more">${esc(t("show_more", { n: Math.min(PAGE, list.length - F.shown) }))}</button>` : "";
  $("#more")?.addEventListener("click", () => { F.shown += PAGE; paintList(); $(`#flist li:nth-child(${F.shown - PAGE + 1}) .ptap`)?.focus(); });
  bindRows(box);
  reportMod?.bindReport?.(box);
  if (mapApi) { mapApi.update(list.slice(0, 150), S.loc); mapApi.select(focusId); }
}

function bindRows(box) {
  $$("[data-share]", box).forEach(b => b.onclick = () => shareSite(R.byId.get(b.dataset.share)));
  $$("a[data-out]", box).forEach(a => a.addEventListener("click", e => { e.preventDefault(); openOut(a.href); }));
  $$(".ptap", box).forEach(b => b.onclick = () => toggleRow(b.closest(".place").dataset.id));
  // a tap anywhere on the row that isn't a link, button or text being selected works like tapping the name
  box.onclick = e => {
    const li = e.target.closest(".place");
    if (!li || e.target.closest("a,button,summary,details,input,select,.pmore") || getSelection()?.toString()) return;
    toggleRow(li.dataset.id); li.querySelector(".ptap").focus({ preventScroll: true });
  };
  if (matchMedia("(hover: hover)").matches) {
    box.onmouseover = e => { const li = e.target.closest(".place"); mapApi?.hover(li ? li.dataset.id : null); };
    box.onmouseleave = () => mapApi?.hover(null);
  }
}
function setOpen(id, on) {
  const li = $(`#s-${CSS.escape(id)}`); if (!li) return;
  li.classList.toggle("open", on);
  li.querySelector(".ptap").setAttribute("aria-expanded", on);
  li.querySelector(".pmore").hidden = !on;
}
function toggleRow(id) {
  const on = openId !== id;
  if (openId && openId !== id) setOpen(openId, false);
  openId = on ? id : null;
  setOpen(id, on);
  select(id, { fly: true });
}
function select(id, { fly = false, scroll = false } = {}) {
  focusId = id;
  $$(".place.hl").forEach(x => x.classList.remove("hl"));
  const el = id && $(`#s-${CSS.escape(id)}`);
  if (el) { el.classList.add("hl"); if (scroll) el.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" }); }
  mapApi?.select(id, { fly });
}
/* On a phone, tapping a pin shows a small card over the map instead of jumping away from it */
function mapCard(id) {
  const box = $("#fmap"); if (!box) return;
  let c = $("#fmapcard", box);
  const s = id && R.byId.get(id);
  if (!s) { c?.remove(); return; }
  if (!c) { c = document.createElement("div"); c.id = "fmapcard"; c.className = "mapcard"; box.appendChild(c); }
  const free = FREE.includes(s.k), next = free ? soon(s) : [];
  c.innerHTML = `<span class="ktile kt-${esc(s.k)}" aria-hidden="true">${kindIcon(s.k)}</span>
    <div class="pmain"><p class="pname">${esc(s.n)}</p><p class="pline">${statusLine(s, next, free, catOf(F.cat).kinds.length > 1)}</p>${free ? whenLine(s, next) : ""}</div>
    <button type="button" class="iconbtn mcx" aria-label="${esc(t("close"))}">${ico("x")}</button>
    <div class="acts">
      <a class="btn sm pri" href="${esc(dirUrl(s))}" target="_blank" rel="noopener noreferrer" data-out>${ico("route", "i sm")} ${esc(t("directions"))}</a>
      <button class="btn sm" type="button" data-more>${ico("list", "i sm")} ${esc(t("details"))}</button>
    </div>`;
  $(".mcx", c).onclick = () => { c.remove(); select(null); };
  $("[data-more]", c).onclick = () => { c.remove(); setView("list"); if (openId !== id) toggleRow(id); requestAnimationFrame(() => { const el = $(`#s-${CSS.escape(id)}`); el?.scrollIntoView({ block: "center" }); el?.querySelector(".ptap").focus({ preventScroll: true }); }); };
  $("a[data-out]", c).addEventListener("click", e => { e.preventDefault(); openOut(e.currentTarget.href); });
}

function shareSite(s) {
  if (!s) return;
  const next = FREE.includes(s.k) ? soon(s)[0] : null;
  const text = [s.n, [s.a, s.c].filter(Boolean).join(", "), next ? whenText(next) : "", s.ph].filter(Boolean).join("\n");
  shareThing({ title: s.n, text, url: location.origin + location.pathname + "#/find/" + encodeURIComponent(s.id) });
}

function chip(id, label, on, attr = "data-cat", kind = "") {
  return `<button class="chip ${kind}" type="button" ${attr}="${id}" aria-pressed="${on}">${kind ? mark(kind) : ""}${label}</button>`;
}
function tile(c, on, n) {
  return `<button class="kpick kt-${c.icon}" type="button" data-cat="${c.id}" aria-pressed="${on}"><span class="kic" aria-hidden="true">${kindIcon(c.icon, "i sm")}</span><span class="kpl">${esc(t("cat_" + c.id))}</span><span class="n">${esc(num(n))}</span></button>`;
}
function subChip(id, label, on, n, icon) {
  return `<button class="chip ksub${icon ? " kt-" + icon : ""}" type="button" data-cat="${id}" aria-pressed="${on}">${icon ? `<span class="kic" aria-hidden="true">${kindIcon(icon, "i sm")}</span>` : ""}<span>${label}</span><span class="n">${esc(num(n))}</span></button>`;
}

async function loadMap() {
  const box = $("#fmap");
  if (!box || mapApi) return;
  box.hidden = false;
  box.innerHTML = `<div class="loading">${esc(t("map_loading"))}</div>`;
  try {
    mapMod ||= await import("./map.js");
    mapApi = await mapMod.mountMap(box, {
      center: S.loc || MID,
      onSelect: id => {
        if (phone()) { select(id); mapCard(id); return; }
        // on a computer, open the row beside the map
        let el = $(`#s-${CSS.escape(id)}`);
        if (!el) { focusId = id; paintList(); el = $(`#s-${CSS.escape(id)}`); }
        if (openId !== id) toggleRow(id); else select(id);
        el = $(`#s-${CSS.escape(id)}`);
        if (el) { el.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" }); el.querySelector(".ptap")?.focus({ preventScroll: true }); }
      },
      label: s => s.n,
    });
    paintList();
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="loading"><p>${esc(t("map_failed"))}</p></div>`;
  }
}
function setView(v) {
  F.view = v;
  $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v));
  const ph = phone();
  if (ph) { $("#fmap").hidden = v !== "map"; $("#flistwrap").hidden = v === "map"; if (v !== "map") mapCard(null); }
  $(".findapp")?.classList.toggle("mapview", ph && v === "map");
  if (v === "map") loadMap().then(() => { mapApi?.resize(); if (ph) $("#fmap").scrollIntoView({ block: "end" }); setTimeout(() => mapApi?.resize(), 300); });
}

export async function render(main, { args }) {
  main.innerHTML = `<p class="mute">${esc(t("loading"))}</p>`;
  R = await region();
  // #/find/in/<category> opens a category, e.g. links from Budget and Benefits to free food
  if (args[0] === "in" && CATS.some(c => c.id === args[1])) { F.cat = args[1]; store.set("fcat", F.cat); F.shown = PAGE; }
  else if (args[0]) {
    const s = R.byId.get(args[0]);
    if (s) { focusId = s.id; F.cat = !FREE.includes(s.k) ? s.k : s.k === "senior" && !S.senior ? "senior" : "free"; F.today = F.walk = F.drive = false; }
  }
  const wide = matchMedia(DESK);
  main.classList.add("findmode");
  main.innerHTML = `
  <div class="findapp">
    <div class="fside">
      <section class="hero findhero${S.loc ? " has-loc" : ""}" aria-labelledby="find-h">
        <h1 class="disp" id="find-h">${esc(S.loc ? t("find_h_near", { p: locLabel() }) : t("find_h"))}</h1>
        <p id="find-p">${esc(t(R.partner ? "find_p" : "us_find_p"))}</p>
        ${locForm("f", S.loc?.src === "gps" ? "" : S.loc?.label || "")}
        <p class="small" id="f-msg" role="status"></p>
      </section>
      <div class="kcats" id="fcats"></div>
      <div class="fbar">
        <p class="fcount" id="fcount" role="status"></p>
        <label class="fsort" id="fsortw"><span class="sr">${esc(t("sort_by"))}</span>${ico("swap", "i sm")}<select id="fsort"></select></label>
        <div class="viewtoggle seg" role="group" aria-label="${esc(t("view"))}">
          <button type="button" data-view="list" aria-pressed="true">${ico("list", "i sm")} ${esc(t("view_list"))}</button>
          <button type="button" data-view="map" aria-pressed="false">${ico("map", "i sm")} ${esc(t("view_map"))}</button>
        </div>
      </div>
      <div class="chips wrap fflt" role="group" aria-label="${esc(t("filters"))}" id="fflt"></div>
      <div id="flistwrap" class="stack">
        <div id="fnote"></div>
        <ul class="plist" id="flist"></ul>
        <div class="more" id="fmore"></div>
        <div class="notice info" id="fdata">${dataNote()}</div>
      </div>
      ${foot()}
    </div>
    <div class="mapbox" id="fmap" hidden></div>
  </div>`;
  // on a phone, the location button shrinks to its icon so the search box gets the room
  const gps = $("#f-gps");
  if (gps) { gps.setAttribute("aria-label", t("loc_gps")); gps.innerHTML = `${ico("locate")}<span class="lbl" aria-hidden="true">${esc(t("loc_gps"))}</span>`; }

  bindLoc("f", () => { $("#find-h").textContent = t("find_h_near", { p: locLabel() }); $(".findhero")?.classList.add("has-loc"); });
  const paintFilters = () => {
    const cat = catOf(F.cat);
    const freeCat = isFreeCat(cat) && cat.kinds.some(k => SCHED.includes(k));
    $("#fflt").innerHTML = freeCat ? [
      chip("today", esc(t("flt_today")), F.today, "data-flt", "ck"),
      chip("walk", esc(t("f_walk")), F.walk, "data-flt", "ck"),
      chip("drive", esc(t("f_drive")), F.drive, "data-flt", "ck"),
    ].join("") : "";
    $("#fflt").hidden = !freeCat;
    $$("[data-flt]").forEach(b => b.onclick = () => {
      const k = b.dataset.flt; F[k] = !F[k];
      b.setAttribute("aria-pressed", F[k]);
      F.shown = PAGE; paintList();
    });
    const sorts = sortsFor(cat);
    if (!sorts.includes(F.sort)) F.sort = sorts[0];
    $("#fsort").innerHTML = sorts.map(k => `<option value="${k}"${F.sort === k ? " selected" : ""}>${esc(t("sort_" + k))}</option>`).join("");
    $("#fsortw").hidden = sorts.length < 2;
    $("#fsort").onchange = e => { F.sort = e.target.value; F.shown = PAGE; paintList(); announce($("#fcount").textContent); };
    $("#fnote").innerHTML = catNote();
  };
  // categories this area has nothing for (no senior box sites, no restaurant program) are left out
  const paintCats = () => {
    const has = c => ["free", "pantry", "store"].includes(c.id) || pool(c).length;
    if (!CATS.some(c => c.id === F.cat && has(c))) F.cat = "store";
    const g = groupOf(F.cat), top = GROUPS.filter(x => has(catOf(x.id)));
    const total = pool(catOf(g.id)).length;
    const subs = g.subs.map(catOf).filter(c => pool(c).length);
    // one kind that is the whole list (a single pantry type) needs no second row
    const showSubs = subs.length > 1 || (subs.length === 1 && (pool(subs[0]).length !== total || F.cat !== g.id));
    $("#fcats").innerHTML = `<div class="kgrid" role="group" aria-label="${esc(t("show"))}" data-n="${top.length}">${top.map(x => tile(catOf(x.id), g.id === x.id, pool(catOf(x.id)).length)).join("")}</div>`
      + (showSubs ? `<div class="chips wrap ksubs" role="group" aria-label="${esc(t("cat_" + g.id))}">${subChip(g.id, esc(t("cat_all")), F.cat === g.id, total, "")}${subs.map(c => subChip(c.id, esc(t("cat_" + c.id)), F.cat === c.id, pool(c).length, c.icon)).join("")}</div>` : "");
    $$("#fcats [data-cat]").forEach(b => b.onclick = () => {
      const id = b.dataset.cat;
      if (F.cat === id) return;
      F.sort = ""; openId = null; focusId = null; mapCard(null);
      F.cat = id; store.set("fcat", F.cat); F.shown = PAGE;
      paintCats();
      $(`#fcats [data-cat="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      paintFilters(); paintList(); announce($("#fcount").textContent);
    });
  };
  paintCats();
  $$("[data-view]").forEach(b => b.onclick = () => setView(b.dataset.view));
  paintFilters(); paintList();
  mapApi = null;
  if (wide.matches) loadMap(); else setView(F.view);
  const onWide = () => { if (wide.matches) { $("#flistwrap").hidden = false; loadMap(); } else setView(F.view); };
  wide.addEventListener("change", onWide);
  // a new place can mean a new area: load it, then repaint everything that depends on it
  const onLoc = async () => {
    R = await region(); F.shown = PAGE;
    if (!$("#flist")) return;
    $("#find-p").textContent = t(R.partner ? "find_p" : "us_find_p");
    $("#fdata").innerHTML = dataNote();
    openId = null; focusId = null; mapCard(null);
    paintCats(); paintFilters(); paintList(); mapApi?.recenter(S.loc);
  };
  addEventListener("pm:loc", onLoc);
  if (focusId) { openId = focusId; requestAnimationFrame(() => { setOpen(focusId, true); const el = $(`#s-${CSS.escape(focusId)}`); el?.scrollIntoView({ block: "center" }); }); }
  const timer = setInterval(paintList, 5 * 60000); // "open now" stays honest if the app sits open
  return () => { clearInterval(timer); wide.removeEventListener("change", onWide); removeEventListener("pm:loc", onLoc); mapApi?.destroy(); mapApi = null; focusId = null; openId = null; main.classList.remove("findmode"); };
}
