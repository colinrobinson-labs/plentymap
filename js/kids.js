/* Kids eat free (or for a dollar or two): restaurant deals from published sources, by day of the week.
   Every deal keeps its source and the day we last checked it. Deals past their end date, or not
   re-checked for STALE_DAYS, are left out. Deals change by location, so the page says to call ahead. */
import { S, t, esc, $, $$, ico, money, num, dateFmt, dayName, timeFmt, fetchJSON, safeUrl, openOut } from "./core.js";
import { reportUI, bindReport } from "./report.js";

const STALE_DAYS = 120;
const PAGE = 8;
let K = null;
const V = { day: "today", shown: PAGE };

const todayIn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const wdToday = () => new Date(todayIn() + "T12:00:00Z").getUTCDay();
const dayFmt = iso => dateFmt(new Date(iso + "T12:00:00Z"), { month: "short", day: "numeric", year: "numeric" });

export async function loadKids() {
  if (K) return K;
  const k = await fetchJSON("data/kids.json").catch(() => null);
  if (k) for (const x of k.deals) x.k = "kid";
  return (K = k);
}

function live(st) {
  if (!K) return [];
  const td = todayIn();
  if ((Date.parse(td) - Date.parse(K.checked)) / 864e5 > STALE_DAYS) return [];
  return K.deals.filter(x => !x.hide && !(x.until && x.until < td) && (!st || !x.st || x.st.includes(st)));
}
const onDay = (x, wd) => x.slots.some(s => s.d.includes(wd));

function slotText(s) {
  const days = s.d.length === 7 ? t("kd_daily") : s.d.map(d => dayName(d, "short")).join(", ");
  const nth = s.nth ? t("kd_first", { d: dayName(s.d[0]) }) : "";
  const [a, b] = s.t || [];
  const time = a && b ? t("time_range", { a: timeFmt(a), b: timeFmt(b) }) : a ? t("kd_after", { a: timeFmt(a) }) : "";
  return [nth || days, time].filter(Boolean).join(" · ");
}

function dealCard(x) {
  const isEn = S.lang === "en";
  const head = x.what === "price" ? t("kd_price", { p: money(x.price, x.price % 1 !== 0) }) : t("kd_free");
  const terms = [
    x.age && t(x.age2 ? "kd_age2" : "kd_age", { n: x.age, m: num(x.age2 || 0) }),
    x.per && t("kd_per_" + x.per, { m: money(x.min || 0, (x.min || 0) % 1 !== 0) }),
    x.min && !["purchase", "item"].includes(x.per) && t("kd_min", { m: money(x.min, x.min % 1 !== 0) }),
    x.lim && t("kd_lim", { n: x.lim }),
    x.dine && t("kd_dine"),
    x.app && t("kd_app"),
    x.code && t("kd_code", { c: x.code }),
  ].filter(Boolean);
  const where = t({ all: "kd_w_all", many: "kd_w_lots" }[x.where] || "kd_w_some");
  const src = x.src.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-out>${esc(K.sources[u]?.name || new URL(u).hostname)}</a> (${esc(dayFmt(K.sources[u]?.date || K.checked))})`).join(", ");
  const web = safeUrl(x.w);
  return `<li class="card kid" id="d-${esc(x.id)}">
    <div class="row between"><h3 class="sname">${esc(x.n)}</h3><span class="badge ${x.what === "price" ? "yolk" : "ok"}">${esc(head)}</span></div>
    ${x.rep ? `<p class="notice stale">${ico("alert", "i sm")}<span>${esc(t("rep_flag_ended"))}</span></p>` : ""}
    <p class="when">${ico("clock", "i sm")}<span>${x.slots.map(s => esc(slotText(s))).join("<br>")}</span></p>
    <ul class="kterms">${terms.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
    ${x.note ? `<p class="small"${isEn ? "" : ' lang="en"'}>${esc(x.note)}</p>` : ""}
    <p class="small mute">${ico("alert", "i sm")} ${esc(where)}${x.until ? " · " + esc(t("kd_until", { d: dayFmt(x.until) })) : ""}</p>
    ${web ? `<div class="acts"><a class="btn sm ghost" href="${esc(web)}" target="_blank" rel="noopener noreferrer" data-out>${ico("ext", "i sm")} ${esc(t("website"))}</a></div>` : ""}
    <p class="src">${esc(t("kd_checked", { d: dayFmt(K.checked) }))} · ${esc(t("kd_src"))} ${src}</p>
    ${reportUI(x)}
  </li>`;
}

function paint(root, st) {
  const all = live(st);
  const wd = V.day === "today" ? wdToday() : V.day === "any" ? null : +V.day;
  let list = wd == null ? all : all.filter(x => onDay(x, wd));
  // free before cheap, then chains with the most locations first
  const w = { all: 0, many: 1, some: 2 };
  list = [...list].sort((a, b) => (a.what === "price") - (b.what === "price") || (b.st ? 1 : 0) - (a.st ? 1 : 0) || w[a.where] - w[b.where] || a.n.localeCompare(b.n));
  const box = $("#kidlist", root);
  $("#kidcount", root).textContent = t("results", { n: list.length });
  box.innerHTML = list.length ? list.slice(0, V.shown).map(dealCard).join("")
    : `<li class="card empty"><p>${esc(t(K ? "kd_none" : "kd_unavail"))}</p></li>`;
  $("#kidmore", root).innerHTML = list.length > V.shown ? `<button class="btn" type="button" id="kmore">${esc(t("show_more", { n: Math.min(PAGE, list.length - V.shown) }))}</button>` : "";
  $("#kmore", root)?.addEventListener("click", () => { V.shown += PAGE; paint(root, st); });
  $$("a[data-out]", box).forEach(a => a.addEventListener("click", e => { e.preventDefault(); openOut(a.href); }));
  bindReport(box);
}

/* The section on the Benefits tab. st: the person's state, so regional chains elsewhere stay out. */
export async function kidsSection(st) {
  await loadKids();
  const wd = wdToday();
  const chips = [["today", t("today")], ...[1, 2, 3, 4, 5, 6, 0].filter(d => d !== wd).map(d => [String(d), dayName(d, "short")]), ["any", t("kd_any")]];
  return `<section class="kids" id="kids" aria-labelledby="kids-h">
    <div class="sec"><h2 id="kids-h">${ico("kidmeal")} ${esc(t("kd_h"))}</h2></div>
    <p>${esc(t("kd_p"))}</p>
    <div class="notice warn">${ico("alert")}<p>${esc(t("kd_disclaimer"))}</p></div>
    <div class="chips wrap" role="group" aria-label="${esc(t("kd_day"))}" id="kiddays">
      ${chips.map(([v, l]) => `<button class="chip" type="button" data-kday="${v}" aria-pressed="${V.day === v}">${esc(l)}</button>`).join("")}
    </div>
    <p class="mute small" id="kidcount" role="status"></p>
    <ul class="list" id="kidlist"></ul>
    <div class="more" id="kidmore"></div>
  </section>`;
}
export function bindKids(root, st) {
  const sec = $("#kids", root);
  if (!sec) return;
  $$("[data-kday]", sec).forEach(b => b.onclick = () => {
    V.day = b.dataset.kday; V.shown = PAGE;
    $$("[data-kday]", sec).forEach(x => x.setAttribute("aria-pressed", x === b));
    paint(sec, st);
  });
  paint(sec, st);
}
