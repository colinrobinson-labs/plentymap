// Shared helpers for the region and US data builders.
export const r5 = x => Math.round(x * 1e5) / 1e5;
export const clean = s => (s ?? "").toString().replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
export const none = s => !s || /^(none|n\/a|na|-)$/i.test(s.trim());

// Title-case names that arrive in ALL CAPS ("FOOD 4 LESS 318" -> "Food 4 Less")
export function tidyName(n) {
  n = clean(n).replace(/\s+(#?\s?[A-Z]{0,3}-?\d{2,6}|\d{1,3})(\s+\d+)*$/i, "").replace(/\s+(Llc|Inc\.?|LLC|INC\.?)$/i, "").replace(/\s+NAFMNP$/i, "").replace(/\s+CFM\s*\d*$/i, "").trim();
  if (n === n.toUpperCase() && /[A-Z]{3}/.test(n)) n = n.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Of|And|De|La|Del)\b/g, w => w === "La" || w === "De" || w === "Del" ? w : w.toLowerCase());
  return n.replace(/^Ralph'?s Grocery$/i, "Ralphs").replace(/^Vons$/i, "Vons").replace(/'S\b/g, "'s").replace(/\bMkt\b/i, "Market");
}
export const phoneOf = s => { const d = (s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : ""; };
export const firstPhoneIn = s => { const m = (s || "").match(/\(?\b(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})\b/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };
export const urlOk = u => { try { const x = new URL(/^https?:/i.test(u) ? u : "https://" + u); return /\./.test(x.hostname) ? x.href : ""; } catch { return ""; } };


/* Short, translatable facts pulled from the food banks' English notes. The English stays visible too. */
export function flagsFrom(...texts) {
  const s = texts.filter(Boolean).join(" ").toLowerCase();
  const f = [];
  if (/all are welcome|open to (the )?(public|all)|no eligibility|anyone/.test(s)) f.push("open");
  if (/appointment/.test(s)) f.push("appt");
  if (/call first|call ahead|call before/.test(s)) f.push("call");
  if (/\bid\b|identification/.test(s) && !/food bank id card/.test(s.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ")) || /\bid (and|is|required)|photo id|id required/.test(s)) f.push("id");
  if (/proof of (address|residen)|utility bill|residents of|residents only|serves zip|zip codes?:/.test(s)) f.push("area");
  if (/income guidelines|proof of income|income/.test(s)) f.push("income");
  if (/senior|60\+|60 and older|65 and older/.test(s) && /only|senior food program/.test(s)) f.push("senior");
  if (/student/.test(s) && /only|current students|enrollment/.test(s)) f.push("student");
  if (/military|veteran/.test(s) && /only|required|families only/.test(s)) f.push("military");
  if (/drive[- ]?thr(u|ough)/.test(s)) f.push("drive");
  if (/walk[- ]?up/.test(s)) f.push("walk");
  if (/register|registration|intake/.test(s)) f.push("register");
  if (/food bank id card/.test(s)) f.push("fbid");
  if (/produce/.test(s)) f.push("produce");
  if (/diaper/.test(s)) f.push("diapers");
  return [...new Set(f)];
}

