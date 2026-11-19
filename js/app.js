/* Plenty Map: start-up, language picker, first-run setup, tabs and routing, settings and privacy. */
import { S, save, store, LANGS, LANG, loadLang, t, esc, $, $$, ico, MARK, toast, announce, getPosition, native, VERSION, VARS } from "./core.js";
import { CONFIG } from "./config.js";
import { region, findPlace, setLoc, covered, nearestZip, placeNames, programName } from "./region.js";

/* GitHub Pages can't send frame-ancestors, so refuse to run inside someone else's frame (clickjacking). */
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch { document.documentElement.textContent = ""; } }

const TABS = [
  { id: "cook", icon: "pot" },
  { id: "budget", icon: "wallet" },
  { id: "find", icon: "basket" },
  { id: "help", icon: "hand" },
];
const VIEWS = {
  find: () => import("./find.js"),
  cook: () => import("./cook.js"),
  budget: () => import("./budget.js"),
  help: () => import("./help.js"),
  settings: () => import("./pages.js"),
  privacy: () => import("./pages.js"),
  about: () => import("./pages.js"),
};

/* ---------- theme ---------- */
export function applyTheme() {
  const r = document.documentElement;
  if (S.theme === "light" || S.theme === "dark") r.dataset.theme = S.theme; else delete r.dataset.theme;
  const dark = S.theme === "dark" || (S.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#16291F" : "#1F3B2D");
}

/* ---------- language picker (always first) ---------- */
function guessLang() {
  for (const l of navigator.languages || [navigator.language || "en"]) {
    const x = l.toLowerCase();
    if (x.startsWith("zh")) return /hant|tw|hk|mo/.test(x) ? "zh-Hant" : "zh-Hans";
    if (x.startsWith("fa") || x.startsWith("prs")) return "fa-AF";
    if (x.startsWith("tl") || x.startsWith("fil")) return "fil";
    const c = x.split("-")[0];
    if (LANG[c]) return c;
  }
  return "en";
}
const EN_NAMES = { en: "English", es: "Spanish", "zh-Hans": "Chinese, Simplified", "zh-Hant": "Chinese, Traditional", vi: "Vietnamese", fil: "Tagalog", ar: "Arabic", ht: "Haitian Creole", ko: "Korean", ru: "Russian", pt: "Portuguese", "fa-AF": "Dari", ps: "Pashto", so: "Somali", uk: "Ukrainian" };

/* What Plenty Map is, said on the very first screen, before anyone has picked a language.
   Shown in the language the phone asks for, and in English under it when that's different. */
const INTRO = {
  en: ["Eat well for less", "Cheap recipes, a weekly meal plan that fits your budget, stores that take EBT, free food nearby, and help with benefits. All free.", "Choose your language"],
  es: ["Come bien gastando menos", "Recetas baratas, un plan de comidas semanal que cabe en tu presupuesto, tiendas que aceptan EBT, comida gratis cerca y ayuda con beneficios. Todo gratis.", "Elige tu idioma"],
  "zh-Hans": ["花更少，吃更好", "省钱食谱、符合预算的每周餐单、接受 EBT 的商店、附近的免费食物，还有福利申请帮助。全部免费。", "选择你的语言"],
  "zh-Hant": ["花更少，吃更好", "省錢食譜、符合預算的每週餐單、接受 EBT 的商店、附近的免費食物，還有福利申請協助。全部免費。", "選擇你的語言"],
  vi: ["Ăn ngon mà tốn ít hơn", "Công thức nấu ăn rẻ, thực đơn hằng tuần vừa túi tiền, cửa hàng nhận EBT, thực phẩm miễn phí gần bạn, và giúp xin trợ cấp. Tất cả đều miễn phí.", "Chọn ngôn ngữ của bạn"],
  fil: ["Kumain nang maayos sa mas mura", "Murang recipe, lingguhang meal plan na kasya sa budget mo, mga tindahang tumatanggap ng EBT, libreng pagkain sa malapit, at tulong sa benepisyo. Libre lahat.", "Piliin ang iyong wika"],
  ar: ["كُل جيدًا بتكلفة أقل", "وصفات رخيصة، وخطة وجبات أسبوعية تناسب ميزانيتك، ومتاجر تقبل EBT، وطعام مجاني قريب، ومساعدة في المعونات. كل ذلك مجانًا.", "اختر لغتك"],
  ht: ["Manje byen pou mwens lajan", "Resèt bon mache, yon plan manje pou semèn nan ki antre nan bidjè w, magazen ki aksepte EBT, manje gratis toupre, ak èd pou benefis. Tout gratis.", "Chwazi lang ou"],
  ko: ["적게 쓰고 잘 먹기", "저렴한 레시피, 예산에 맞는 주간 식단, EBT를 받는 가게, 근처 무료 식품, 혜택 신청 도움까지. 모두 무료예요.", "언어를 선택하세요"],
  ru: ["Хорошо питаться, тратя меньше", "Недорогие рецепты, план питания на неделю под ваш бюджет, магазины, где принимают EBT, бесплатная еда рядом и помощь с пособиями. Всё бесплатно.", "Выберите язык"],
  pt: ["Coma bem gastando menos", "Receitas baratas, um plano semanal de refeições que cabe no seu orçamento, lojas que aceitam EBT, comida grátis por perto e ajuda com benefícios. Tudo grátis.", "Escolha seu idioma"],
  "fa-AF": ["با پول کمتر خوب غذا بخورید", "دستور پخت‌های ارزان، برنامه غذایی هفته‌وار مطابق بودجه شما، دکان‌هایی که EBT قبول می‌کنند، غذای رایگان در نزدیکی، و کمک برای کمک‌های دولتی. همه رایگان.", "زبان خود را انتخاب کنید"],
  ps: ["په لږو پیسو ښه خواړه وخورئ", "ارزانه پخلي، اونیز د خوړو پلان چې ستاسو بودیجې ته برابر وي، هغه دوکانونه چې EBT مني، نږدې وړیا خواړه، او د ګټو په برخه کې مرسته. ټول وړیا.", "خپله ژبه وټاکئ"],
  so: ["Si fiican wax u cun, lacag yar", "Cunto karis jaban, qorshe cunto toddobaadle ah oo ku habboon miisaaniyaddaada, dukaamo aqbala EBT, cunto bilaash ah oo dhow, iyo caawimaad gargaarka. Dhammaan waa bilaash.", "Dooro luqaddaada"],
  uk: ["Добре харчуватися, витрачаючи менше", "Недорогі рецепти, план харчування на тиждень під ваш бюджет, магазини, де приймають EBT, безкоштовна їжа поруч і допомога з пільгами. Усе безкоштовно.", "Оберіть мову"],
};

let pickerOpen = false;
function closePicker(back = true) {
  if (!pickerOpen) return;
  pickerOpen = false; removeEventListener("popstate", onPickerPop);
  const w = $("#welcome"); w.hidden = true; w.innerHTML = ""; w.classList.remove("over");
  $("#app").inert = false; document.body.style.overflow = "";
  if (back && history.state?.pmLang) history.back();
  $("#langbtn")?.focus();
}
function onPickerPop() { closePicker(false); }
function showWelcome(changing = false) {
  const w = $("#welcome"), app = $("#app");
  if (changing) {
    pickerOpen = true; w.classList.add("over"); app.inert = true; document.body.style.overflow = "hidden";
    history.pushState({ pmLang: 1 }, ""); addEventListener("popstate", onPickerPop);
  } else app.hidden = true;
  w.hidden = false;
  const g = changing ? S.lang : guessLang();
  const L = LANG[g], I = INTRO[g] || INTRO.en, E = INTRO.en;
  const others = LANGS.filter(l => l.code !== g);
  const btn = l => `<li><button type="button" data-l="${l.code}"><span class="ln" lang="${l.code}" dir="${l.dir}">${esc(l.name)}</span>${l.name !== EN_NAMES[l.code] ? `<span class="le" lang="en">${EN_NAMES[l.code]}</span>` : ""}</button></li>`;
  w.innerHTML = `<div class="welcome${changing ? " changing" : ""}" ${changing ? `role="dialog" aria-modal="true" aria-labelledby="w-pick"` : ""}>
    ${changing ? `<button type="button" class="iconbtn wclose" id="wclose" aria-label="${esc(t("close"))}">${ico("x")}</button>` : ""}
    <div class="brandrow"><div class="mark">${MARK}</div><div><div class="name" lang="en" dir="ltr">Plenty Map</div>
      <p class="tagline" lang="en" dir="ltr">Find food. Cook cheap. Get help.</p></div></div>
    ${changing ? "" : `<section class="intro" aria-labelledby="w-h">
      <h1 id="w-h" tabindex="-1" lang="${g}" dir="${L.dir}">${esc(I[0])}</h1>
      <p lang="${g}" dir="${L.dir}">${esc(I[1])}</p>
      ${g !== "en" ? `<p class="en" lang="en" dir="ltr"><b>${esc(E[0])}.</b> ${esc(E[1])}</p>` : ""}
    </section>`}
    <h2 class="pick" id="w-pick"><span lang="${g}" dir="${L.dir}">${esc(I[2])}</span>${g !== "en" ? `<span class="en" lang="en" dir="ltr">${esc(E[2])}</span>` : ""}</h2>
    <button type="button" class="langmain" data-l="${g}"><span class="ln" lang="${g}" dir="${L.dir}">${esc(L.name)}</span>${ico("arrow", "i go")}</button>
    <ul class="langs" role="list" aria-labelledby="w-pick">${others.map(btn).join("")}</ul>
    <p class="note" lang="${g}" dir="${L.dir}">${esc(t("foot_a"))}</p>
    <p class="note agree" lang="${g}" dir="${L.dir}">${esc(t("welcome_terms")).replace("{terms}", legalA("terms", "terms")).replace("{privacy}", legalA("privacy", "privacy_policy"))}</p>
  </div>`;
  $$("[data-l]", w).forEach(b => b.onclick = async () => {
    await loadLang(b.dataset.l); save("lang");
    if (changing) { closePicker(); lastView = null; shell(); route(); return; }
    if (S.loc || store.get("setupDone")) { hideWelcome(); shell(); route(); } else showSetup();
  });
  if (changing) {
    $("#wclose", w).onclick = () => closePicker();
    w.onkeydown = e => { if (e.key === "Escape") closePicker(); };
    $(".langmain", w).focus({ preventScroll: true });
  } else $("#w-h", w)?.focus({ preventScroll: true });
}
function hideWelcome() { $("#welcome").hidden = true; $("#welcome").innerHTML = ""; $("#app").hidden = false; }

/* ---------- first run: where are you? ---------- */
async function showSetup() {
  const w = $("#welcome");
  w.innerHTML = `<div class="welcome">
    <div class="mark">${MARK}</div>
    <div class="setup stack">
      <h1 class="disp" id="setup-h" tabindex="-1">${esc(t("setup_h"))}</h1>
      <p class="mute">${esc(t("setup_p"))}</p>
      ${locForm("s")}
      <p class="mute small" id="s-msg" role="status"></p>
      <button class="link" type="button" id="s-skip">${esc(t("setup_skip"))}</button>
      <p class="tiny mute">${ico("lock", "i sm")} ${esc(t("setup_private"))}</p>
    </div>
  </div>`;
  $("#setup-h", w).focus();
  bindLoc("s", () => done());
  $("#s-skip", w).onclick = () => done();
  function done() { store.set("setupDone", true); hideWelcome(); shell(); location.hash = "#/cook"; route(); }
}

/* A ZIP / neighborhood box plus a GPS button. Used in setup and on Find food. */
export function locForm(p, value = "") {
  return `<div class="locbar">
    <form id="${p}-form" role="search" novalidate>
      <label class="sr" for="${p}-q">${esc(t("loc_label"))}</label>
      <div class="combo">
        <input class="in" id="${p}-q" name="q" type="text" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="search"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${p}-sug" placeholder="${esc(t("loc_ph"))}" value="${esc(value)}" maxlength="60">
        <ul class="sug" id="${p}-sug" role="listbox" aria-label="${esc(t("loc_label"))}" hidden></ul>
      </div>
      <button class="btn pri" type="submit">${esc(t("loc_go"))}</button>
    </form>
    <button class="btn" type="button" id="${p}-gps">${ico("locate")} ${esc(t("loc_gps"))}</button>
  </div>`;
}
/* When location is refused: say how to turn it on, for this phone or computer.
   If the site is allowed but it's still refused, the device itself has location off for the browser. */
async function locHelp() {
  if (native()) return "loc_help_app";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "loc_help_ios";
  if (/Android/.test(ua)) return "loc_help_android";
  let st = "";
  try { st = (await navigator.permissions?.query({ name: "geolocation" }))?.state || ""; } catch {}
  if (st === "denied") return "loc_help_site";
  if (/Mac OS X|Macintosh/.test(ua)) return "loc_help_mac";
  if (/Windows/.test(ua)) return "loc_help_win";
  return "loc_help_site";
}
export function bindLoc(p, after) {
  const form = $(`#${p}-form`), msg = () => $(`#${p}-msg`);
  // problems show as problems: an icon, warm red text, the box outlined, and tied to the box for screen readers
  const say = (m, ok = false) => {
    const el = msg(), inp = $(`#${p}-q`);
    const bad = !!m && !ok;
    if (el) { el.innerHTML = bad ? `${ico("alert", "i sm")}<span>${esc(m)}</span>` : esc(m); el.classList.toggle("err", bad); } else if (m) toast(m);
    if (inp) { inp.setAttribute("aria-invalid", bad ? "true" : "false"); if (el) inp.setAttribute("aria-describedby", el.id); }
    if (m) announce(m);
  };
  // suggestions follow what's typed (towns across the U.S. are loaded a letter at a time).
  // Our own list under the box, not a <datalist>: iPhones hide datalist choices in the keyboard bar.
  const inp = $(`#${p}-q`), box = $(`#${p}-sug`);
  let tmr = 0, seq = 0, items = [], act = -1;
  const close = () => { box.hidden = true; box.innerHTML = ""; items = []; act = -1; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); };
  const show = list => {
    items = list; act = -1;
    if (!list.length) return close();
    box.innerHTML = list.map((n, i) => {
      const m = n.match(/^(.*), ([A-Z]{2})$/);
      return `<li role="option" id="${p}-o${i}" aria-selected="false" data-i="${i}">${m ? `<b>${esc(m[1])}</b><span>${esc(m[2])}</span>` : `<b>${esc(n)}</b>`}</li>`;
    }).join("");
    box.hidden = false; inp.setAttribute("aria-expanded", "true");
  };
  const hilite = i => {
    act = i;
    box.querySelectorAll("[role=option]").forEach((o, j) => o.setAttribute("aria-selected", j === i));
    if (i >= 0) { inp.setAttribute("aria-activedescendant", `${p}-o${i}`); box.children[i]?.scrollIntoView({ block: "nearest" }); } else inp.removeAttribute("aria-activedescendant");
  };
  const pick = i => { inp.value = items[i]; close(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); };
  inp.addEventListener("input", () => {
    clearTimeout(tmr);
    const m0 = msg(); if (m0?.textContent) m0.textContent = "";
    const q = inp.value.trim();
    if (q.length < 2 || /^\d/.test(q)) return close();
    const my = ++seq;
    tmr = setTimeout(async () => {
      try { const list = await placeNames(q); if (my === seq && document.activeElement === inp) show(list.slice(0, 8)); } catch { close(); }
    }, 120);
  });
  inp.addEventListener("keydown", e => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); hilite((act + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); hilite(act <= 0 ? items.length - 1 : act - 1); }
    else if (e.key === "Enter" && act >= 0) { e.preventDefault(); pick(act); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  inp.addEventListener("blur", () => setTimeout(close, 150));
  // pointerdown, so the choice lands before the box loses focus
  box.addEventListener("pointerdown", e => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
  form.onsubmit = async e => {
    e.preventDefault(); close(); seq++;
    const q = inp.value;
    const r = await findPlace(q);
    if (r.error) return say(t(r.error === "outside" ? "loc_outside" : "loc_notfound"));
    const el = msg(); if (el) el.textContent = "";
    setLoc(r); after?.(r);
  };
  $(`#${p}-gps`).onclick = async () => {
    const btn = $(`#${p}-gps`); btn.disabled = true; say(t("loc_finding"), true);
    try {
      const pos = await getPosition();
      if (!(await covered(pos.lat, pos.lon))) { say(t("loc_outside")); return; }
      // round to about 100 m: plenty for "near me", and less exact than the phone's fix
      const lat = +pos.lat.toFixed(3), lon = +pos.lon.toFixed(3);
      const R = await region({ lat, lon });
      const z = nearestZip(lat, lon, R);
      const loc = { lat, lon, label: t("loc_here"), zip: z.zip, st: z.st || R.st, src: "gps" };
      setLoc(loc); say(""); after?.(loc);
    } catch (err) {
      if (err?.code === 1 || /denied|permission/i.test(err?.message || "")) say(t("loc_denied") + " " + t(await locHelp()));
      else say(t("loc_failed"));
    } finally { btn.disabled = false; }
  };
}

/* ---------- app shell ---------- */
function shell() {
  $("#brand").innerHTML = `${MARK}<span lang="en">Plenty Map</span>`;
  $("#brand").setAttribute("aria-label", "Plenty Map, " + t("home"));
  const tabHtml = TABS.map(x => `<a href="#/${x.id}" data-tab="${x.id}">${ico(x.icon)}<span>${esc(t("tab_" + x.id))}</span></a>`).join("");
  $("#tabs").innerHTML = tabHtml; $("#dtabs").innerHTML = tabHtml;
  $("#langbtn").innerHTML = `${ico("globe")}<span lang="${S.lang}">${esc(LANG[S.lang].name)}</span>`;
  $("#langbtn").setAttribute("aria-label", t("change_lang") + ": " + LANG[S.lang].name);
  $("#langbtn").onclick = () => showWelcome(true);
  $("#setbtn").innerHTML = `${ico("gear")}<span class="sr">${esc(t("settings"))}</span>`;
  $("#setbtn").setAttribute("aria-label", t("settings"));
  $("#skip").textContent = t("skip");
  $("#tabs").setAttribute("aria-label", t("nav_main")); $("#dtabs").setAttribute("aria-label", t("nav_main"));
  document.title = "Plenty Map: " + t("tagline");
}

let current = null, cleanup = null, lastView = null;
export async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  let view = parts[0] || "cook";
  if (!VIEWS[view]) view = "cook";
  $$("[data-tab]").forEach(a => a.dataset.tab === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const token = {}; current = token;
  try { cleanup?.(); } catch {}
  cleanup = null;
  const main = $("#main");
  let mod;
  const failed = err => {
    console.error(err);
    if (current !== token) return;
    lastView = null;
    main.innerHTML = `<div class="empty card">${ico("alert")}<p>${esc(t("load_failed"))}</p>
      <p class="row"><button class="btn sm pri" type="button" id="retry">${ico("refresh", "i sm")} ${esc(t("retry"))}</button>
      <a class="btn sm" href="tel:211">${ico("phone", "i sm")} ${esc(t("call_211"))}</a></p></div>${foot()}`;
    $("#retry").onclick = route;
  };
  try { mod = await VIEWS[view](); } catch (e) { return failed(e); }
  if (current !== token) return;
  const changedView = view !== lastView; lastView = view;
  try { cleanup = await mod.render(main, { view, args: parts.slice(1), changedView }); } catch (e) { return failed(e); }
  if (current !== token) return;
  if (changedView) {
    window.scrollTo(0, 0);
    const h = $("h1", main);
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
}

/* shared footer */
/* The full legal pages are static English pages on the site (the phone apps open them in the browser). */
export const legalUrl = p => `${CONFIG.dataBase}${p}/`;
const legalA = (p, k) => `<a href="${legalUrl(p)}" target="_blank" rel="noopener">${esc(t(k))}</a>`;
export const legalLinks = () => [legalA("terms", "terms"), legalA("attributions", "credits"), legalA("accessibility", "a11y")].join(" · ");
export function foot() {
  return `<footer class="foot">
    <p class="love">${ico("heart", "i sm")}<span>${esc(t("foot_love"))}</span></p>
    <p>${esc(t("foot_a"))} <a href="#/privacy">${esc(t("privacy"))}</a> · <a href="#/about">${esc(t("about"))}</a></p>
    <p>${esc(t("foot_b"))}</p>
    <p class="legal">${legalLinks()}</p>
  </footer>`;
}

/* ---------- offline notice ---------- */
function net() {
  const o = $("#offline"); if (!o) return;
  o.hidden = navigator.onLine;
  o.textContent = t("offline");
}

/* ---------- start ---------- */
// the name food money goes by where the person is (CalFresh in California, SNAP in most states)
const syncSnap = () => { VARS.snap = programName(); };
syncSnap(); addEventListener("pm:loc", syncSnap);
async function boot() {
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  if (!S.lang) { await loadLang(guessLang()); S.lang = null; showWelcome(); }
  else {
    await loadLang(S.lang);
    if (!S.loc && !store.get("setupDone")) showSetup();
    else { hideWelcome(); shell(); route(); }
  }
  addEventListener("hashchange", () => { if (!$("#app").hidden) route(); });
  addEventListener("online", net); addEventListener("offline", net); net();
  if ("serviceWorker" in navigator && !native() && (location.protocol === "https:" || location.hostname === "localhost")) {
    const hadSW = !!navigator.serviceWorker.controller;
    let touched = false, reloading = false;
    for (const ev of ["pointerdown", "keydown", "input"]) addEventListener(ev, () => { touched = true; }, { once: true, capture: true });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadSW || reloading) return;
      if (!touched) { reloading = true; location.reload(); return; }
      toast(t("updated"), { label: t("refresh"), stay: true, go: () => { reloading = true; location.reload(); } });
    });
    navigator.serviceWorker.register("sw.js").then(reg => {
      // check for a new version whenever the app comes back to the front
      addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
  }
}
boot().catch(err => {
  document.body.insertAdjacentHTML("beforeend", `<p class="pad">Something went wrong loading Plenty Map. Please reload. For food help now, call 2-1-1.</p>`);
  console.error(err);
});

export { shell, showWelcome, VERSION };
