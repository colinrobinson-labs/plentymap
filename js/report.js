/* "Something wrong here?" on every listing and every kids-eat-free deal.
   Sends only: the listing id, the problem picked, an optional short note and the app language,
   to our own report.plentymap.com. No location, device details or contact details. A nightly check
   on GitHub reads the totals (never the notes) and hides or marks listings on its own. */
import { S, t, esc, $, $$, ico, announce } from "./core.js";
import { CONFIG } from "./config.js";

const ENDPOINT = CONFIG.reportUrl || "https://report.plentymap.com/r";
const FREE = new Set(["pantry", "senior", "meal", "fridge", "summer", "garden", "givebox"]);
const sent = new Set();   // this visit only, so a second tap doesn't send twice

/* Which problems make sense for this kind of listing */
function kindsFor(s) {
  if (s.k === "kid") return ["deal_ended", "hours", "other"];
  if (FREE.has(s.k)) return ["closed", "nofood", "hours", "address", "phone", "other"];
  return ["closed", "address", "phone", "other"];
}

export function reportUI(s) {
  if (!s?.id) return "";
  const id = esc(s.id), kinds = kindsFor(s);
  if (sent.has(s.id)) return `<details class="report" open><summary>${ico("flag", "i sm")} ${esc(t("report_q"))}</summary><p class="small ok-t" role="status">${ico("check", "i sm")} ${esc(t("rep_thanks"))}</p></details>`;
  return `<details class="report" data-rep="${id}"><summary>${ico("flag", "i sm")} ${esc(t("report_q"))}</summary>
    <form class="repform" novalidate data-rep-form="${id}">
      <fieldset class="chips wrap"><legend class="small">${esc(t("rep_what"))}</legend>
        ${kinds.map((k, i) => `<label class="chip ck"><input type="radio" name="rk-${id}" value="${k}"${i ? "" : " required"}><span>${esc(t("rep_" + k))}</span></label>`).join("")}
      </fieldset>
      <label class="field"><span class="small">${esc(t("rep_note_l"))}</span>
        <textarea class="in" rows="2" maxlength="280" autocomplete="off" data-rep-note></textarea>
        <small>${esc(t("rep_note_h"))}</small></label>
      <p class="tiny mute">${ico("lock", "i sm")} ${esc(t("rep_sends"))}</p>
      <div class="row"><button class="btn sm pri" type="submit">${esc(t("rep_send"))}</button></div>
      <p class="small" role="status" data-rep-msg></p>
    </form></details>`;
}

function mailtoFor(id, kind, note) {
  const subj = `Plenty Map report: ${kind} - ${id}`;
  const body = `Listing ID: ${id}\nProblem: ${kind}\n${note ? "\n" + note + "\n" : ""}`;
  return `mailto:${CONFIG.contact}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
}

export async function sendReport(id, k, note) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, k, note: note || undefined, lang: S.lang }),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
}

export function bindReport(root = document) {
  $$("form[data-rep-form]", root).forEach(f => {
    if (f.dataset.bound) return;
    f.dataset.bound = "1";
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const id = f.dataset.repForm;
      const k = $("input[type=radio]:checked", f)?.value;
      const msg = $("[data-rep-msg]", f);
      if (!k) { msg.textContent = t("rep_pick"); $("input[type=radio]", f)?.focus(); return; }
      const note = $("[data-rep-note]", f).value.trim().slice(0, 280);
      const btn = $("button[type=submit]", f);
      btn.disabled = true; msg.textContent = t("rep_sending");
      try {
        await sendReport(id, k, note);
        sent.add(id);
        f.outerHTML = `<p class="small ok-t" role="status">${ico("check", "i sm")} ${esc(t("rep_thanks"))}</p>`;
        announce(t("rep_thanks"));
      } catch {
        btn.disabled = false;
        msg.innerHTML = `${esc(t("rep_failed"))} <a href="${esc(mailtoFor(id, k, note))}">${esc(t("rep_email"))}</a>`;
      }
    });
  });
}
