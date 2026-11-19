// Turns the food bank pantry lists fetched by fetch-pantries.mjs into site records in the app's schema:
//   {id, k: pantry|senior|meal, n, a, c, z, lat, lon, ph, w, tz, d: [{src, prog, when, notes, food, who, tips, f, sc, conf}]}
// and writes <rawDir>/pantry-sites.json for build-us.mjs to place in the map cells.
// Listings without coordinates are placed with the U.S. Census Geocoder (public domain), cached between runs.
// Usage: node build-pantries.mjs <rawDir>
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseSchedule, parseNotes, resolveYears } from "../js/hours.js";
import { r5, clean, none, phoneOf, firstPhoneIn, urlOk, flagsFrom } from "./lib-food.mjs";
import { SOURCES } from "./pantry-sources.mjs";

const raw = process.argv[2] || "raw-us";
const dir = join(raw, "pantries");
const log = (...a) => console.log("[pantry-build]", ...a);
const rdj = async f => existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : null;
const report = (await rdj(join(dir, "_report.json"))) || { sources: {} };
const REF = new Date(report.fetched || Date.now());

// ---------- text helpers ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…" };
const decode = s => String(s ?? "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = s => clean(decode(String(s ?? "").replace(/<br\s*\/?>|<\/p>|<\/li>|<\/tr>/gi, ". ").replace(/<[^>]+>/g, " ")).replace(/ /g, " ")).replace(/(\.\s*){2,}/g, ". ").replace(/^[.\s]+|[.\s]+$/g, "");
const ST = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "puerto rico": "PR", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const ST_CODES = new Set(Object.values(ST));
const stOf = s => { const x = clean(s).replace(/\.$/, ""); return /^[A-Za-z]{2}$/.test(x) ? x.toUpperCase() : ST[x.toLowerCase()] || ""; };
const zipOf = s => (String(s ?? "").match(/\b\d{5}\b/) || [""])[0];
// "99-312 Moanalua Rd.\nAiea, HI 96701" or "5193 Momeyer Way, Nashville, NC 27856"
function splitAddress(s) {
  const t = clean(decode(String(s ?? "")).replace(/\n/g, ", ")).replace(/,?\s*(USA|US|United States)$/i, "");
  const m = t.match(/^(.*?),\s*([^,]+?),?\s+([A-Za-z]{2})\.?\s*(\d{5})?(?:-\d{4})?$/);
  if (m && ST_CODES.has(m[3].toUpperCase())) return { a: m[1].trim(), c: m[2].trim(), st: m[3].toUpperCase(), z: m[4] || "" };
  const n = t.match(/^(.*?),\s*([^,\d]+?),?\s+(\d{5})(?:-\d{4})?$/);   // "street, city 12345" with no state
  if (n && ST_CODES.has(n[2].toUpperCase())) { const w = n[1].trim().match(/^(.*\S)\s+(\S+)$/); if (w) return { a: w[1], c: w[2], st: n[2].toUpperCase(), z: n[3] }; }
  return n ? { a: n[1].trim(), c: n[2].trim(), st: "", z: n[3] } : { a: t, c: "", st: "", z: zipOf(t) };
}

// ---------- hours ----------
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY3 = { sun: "sunday", mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday" };
// 24-hour "13:30" -> "1:30 PM" so the shared parser never has to guess am/pm
const to12 = hm => { const [h, m] = hm.split(":").map(Number); if (!(h >= 0 && h < 24)) return hm; return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const fix24 = s => String(s).replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*[ap]\.?m)/gi, (_, a, b, c, d) => `${to12(a + ":" + b)} - ${to12(c + ":" + d)}`);
// Food bank schedule text uses many shorthands the shared parser doesn't know; spell them out first.
const FULL = { m: "Monday", mo: "Monday", mon: "Monday", t: "Tuesday", tu: "Tuesday", tue: "Tuesday", tues: "Tuesday", w: "Wednesday", we: "Wednesday", wed: "Wednesday", weds: "Wednesday",
  r: "Thursday", th: "Thursday", thu: "Thursday", thur: "Thursday", thurs: "Thursday", f: "Friday", fr: "Friday", fri: "Friday", sa: "Saturday", sat: "Saturday", su: "Sunday", sun: "Sunday" };
const SHORT = "(?:mon|tues?|weds?|thurs?|thu|fri|sat|sun|mo|tu|we|th|fr|sa|su|m|t|w|r|f)";
function tidySchedule(s) {
  if (!s) return "";
  let t = fix24(String(s).replace(/\s*-{2,}\s*/g, " - ")).replace(/[–—]/g, "-")
    // phone numbers and street addresses in the text are not times
    .replace(/\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b(\s*(#|x|ext\.?)\s*\d+)?/gi, " ").replace(/\b\d{2,6}\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Highway|Hwy|Way|Court|Ct|Place|Pl|Parkway|Pkwy)\b\.?/g, " ").replace(/\b[A-Z]{2}\s+\d{5}\b/g, " ")
    .replace(/\b([ap])\.\s?m\.?(?=\W|$)/gi, "$1m").replace(/\bnoon\b/gi, "12pm").replace(/\b(through|thru)\b/gi, "-")
    .replace(/[()]/g, " ").replace(/(\d):oo\b/gi, "$1:00").replace(/\b(\d{1,2})\s*o'?clock\b/gi, "$1:00");
  // "Monday Closed –" rows from weekday tables say nothing useful once the open days are listed
  t = t.replace(/\b(mon|tues|wednes|thurs|fri|satur|sun)day\s*:?\s*closed\b\s*-?\s*\.?/gi, " ");
  t = t.replace(/\b(every ?day|daily|7 days a week|seven days a week)\b/gi, "Sunday - Saturday").replace(/\b(weekdays|week ?days)\b/gi, "Monday - Friday");
  t = t.replace(new RegExp(`\\b(${SHORT})\\.?\\s*-\\s*(${SHORT})\\b\\.?`, "gi"), (m, a, b) => FULL[a.toLowerCase()] && FULL[b.toLowerCase()] ? `${FULL[a.toLowerCase()]} - ${FULL[b.toLowerCase()]}` : m);
  // lists of short day names: "M/W/F", "T/TH", "Tu & Th", "Mon, Wed, Fri"
  t = t.replace(new RegExp(`\\b${SHORT}\\.?(?:\\s*[/&,]\\s*(?:and\\s+)?${SHORT}\\b\\.?)+`, "gi"), m => m.split(/\s*[/&,]\s*(?:and\s+)?/).map(x => FULL[x.replace(/\./g, "").toLowerCase()] || x).join(", "));
  // single short day names before times or words: "Tues. 10am", "Thurs 4-6"
  t = t.replace(/\b(mon|tues?|weds?|thurs?|thu|fri|sat|sun)\.?(?=\s|$|[,:;])/gi, m => FULL[m.replace(/\./g, "").toLowerCase()] || m);
  // "Pantry: Monday 10-1, Meal: Saturday 8:30-10" is two schedules, not one
  t = t.replace(/,\s*(?=(meal|pantry|soup kitchen|lunch|dinner|breakfast|produce|mobile)\s*:)/gi, "; ");
  // "1ST/3RD Wednesday", "2nd & 4th" -> "1st and 3rd"
  t = t.replace(/\b(\d)(st|nd|rd|th)\s*[/&,]\s*(\d)(st|nd|rd|th)\b/gi, (m, a, x, b, y) => `${a}${x.toLowerCase()} and ${b}${y.toLowerCase()}`).replace(/\b(\d)(ST|ND|RD|TH)\b/g, (m, a, x) => a + x.toLowerCase());
  // "10-12 am" means 10 am to noon
  t = t.replace(/\b(\d{1,2})(:\d\d)?\s*-\s*12(:\d\d)?\s*am\b/gi, (m, a, b, c) => +a < 12 ? `${a}${b || ""} am - 12${c || ""} pm` : m);
  // "12:00 AM - 2:00 PM" is a typo for noon
  t = t.replace(/\b12:00\s*AM\s*-\s*(\d{1,2}(:\d\d)?\s*PM)/gi, "12:00 PM - $1");
  return t.replace(/\s+/g, " ").trim();
}
// "Monday, March 9, 2026 -- 4 PM Monday, April 13, 2026 -- 4 PM": dated one-off events
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function datedEvents(s) {
  const out = [];
  const rx = /\b(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\s*(?:-+|at|,)?\s*((\d{1,2})(?::(\d\d))?\s*(?:([ap])\.?m\.?)?)?(?:\s*-\s*(\d{1,2})(?::(\d\d))?\s*([ap])\.?m\.?)?/gi;
  let m;
  const hm = (h, mi, ap) => { h = +h % 12 + (ap.toLowerCase() === "p" ? 12 : 0); return `${String(h).padStart(2, "0")}:${mi || "00"}`; };
  while ((m = rx.exec(s))) {
    const mo = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1;
    const date = `${m[3]}-${String(mo).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
    const ap1 = m[7] || m[10];
    if (m[5] && !ap1) { out.push({ date, t: [[null, null]] }); continue; }
    out.push({ date, t: [[m[5] ? hm(m[5], m[6], m[7] || (m[10] && +m[5] > +m[8] && m[10].toLowerCase() === "p" ? "a" : m[10])) : null, m[8] ? hm(m[8], m[9], m[10]) : null]] });
  }
  return out;
}
// weekday -> times text, from a "Monday 10:30 AM – 2:00 PM Tuesday Closed ..." table or a {mon: "..."} object.
// A day listed as open with no real time ("00:00 - 00:00", "open") goes in noTime.
function dayFields(src) {
  const fields = {}, noTime = [];
  const put = (day, v) => {
    v = clean(fix24(strip(v)));
    if (!v || /^(closed|0|no|n\/a|-|null)$/i.test(v)) return;
    if (/^(12:00 AM - 12:00 AM|00:00 - 00:00|1|open|yes)$/i.test(v) || /^12:00 AM - 12:00 AM$/i.test(fix24(v))) { noTime.push(day); return; }
    fields[day] = v.replace(/[–—]/g, "-");
  };
  if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src)) { const day = DAY3[k.slice(0, 3).toLowerCase()]; if (day && v != null) put(day, Array.isArray(v) ? v.join(", ") : String(v)); }
  } else if (typeof src === "string" && src) {
    const t = strip(src);
    const rx = new RegExp(`\\b(${DAYS.join("|")})\\b\\s*:?\\s*(.*?)(?=\\b(?:${DAYS.join("|")})\\b|$)`, "gi");
    let m, any = false;
    while ((m = rx.exec(t))) { any = true; put(m[1].toLowerCase(), m[2].replace(/[.;,\s]+$/, "")); }
    if (!any) return null;   // free text, not a weekday table
    // a table must look like one: most days named, each followed by times or "Closed"
    if ((t.match(new RegExp(`\\b(${DAYS.join("|")})\\b`, "gi")) || []).length < 5) return null;
  }
  return { fields, noTime };
}
const dayList = days => days.map(d => d[0].toUpperCase() + d.slice(1)).join(", ");
const fieldsText = f => DAYS.filter(d => f[d]).map(d => `${d[0].toUpperCase() + d.slice(1, 3)} ${f[d]}`).join("; ");

// ---------- what a listing is ----------
// Not food help, or not open to the public as a food site: left out rather than shown as a pantry.
const NOT_FOOD = /\b(health ?(care|center|centre)|medical|medicine|hospital|clinic|primary care|family practice|surgery|urology|neurology|orthopedic|oncology|cancer|hospice|pediatric|gastroenterology|vascular|allergy|pain management|dental|pharmacy|farm|orchard|farmers'? market|marketplace|co-?op|warehouse|headquarters|corporate office|administrative office|baby item|diaper|pet food|animal|clothing|thrift|furniture|agency name)\b/i;
// meals and snacks only for people already in a program (a group home, a camp, a scout troop) aren't open to anyone who needs food
const NOT_PUBLIC = /\b(for )?program participants( only)?\b|\bafter[- ]?school snacks?\b/i;
const CLOSED = /\b(permanently closed|temporarily closed|closed until further notice|no longer (operating|open|distributing))\b|^closed\b/i;
const MEAL = /\b(soup kitchen|community meals?|meal (site|program)s?|meals program|hot meals?|free meals?|congregate meal|dinner|lunch program|breakfast program|kitchen)\b/i;
const SENIOR = /\b(csfp|commodity supplemental|senior (food )?(box|kits?|boxes)|senior brown bag|seniors? only|60\+ only|senior food program)\b/i;
function kindOf(name, cat, text) {
  if (MEAL.test(name) || MEAL.test(cat)) return "meal";
  if (SENIOR.test(name) || SENIOR.test(cat) || (SENIOR.test(text) && !/pantry|everyone|all (are )?welcome/i.test(text))) return "senior";
  return "pantry";
}
function progOf(name, cat, text) {
  const s = [name, cat, text].join(" ");
  if (/\bcsfp\b|commodity supplemental|senior (food )?box/i.test(s)) return "csfp";
  if (/\btefap\b/i.test(s)) return "tefap";
  return "";
}

// ---------- platform record readers ----------
// Each returns {rid, n, a, c, st, z, lat, lon, ph, w, hours (table/object), when (free text), notes, cat, tz}
const READ = {
  storepoint: data => (data?.results?.locations || []).map(l => {
    const cf = (() => { try { return JSON.parse(l.custom_fields || "{}"); } catch { return {}; } })();
    const ad = splitAddress(l.streetaddress);
    const hours = Object.fromEntries(DAYS.map(d => [d, l[d] || ""]));
    return { rid: l.id, n: l.name, ...ad, lat: +l.loc_lat, lon: +l.loc_long, ph: l.phone, w: l.website, hours, when: "", notes: [l.description, ...Object.values(cf)].filter(x => typeof x === "string").map(strip).filter(Boolean).join(". "), cat: l.tags || "" };
  }),
  wpsl: data => data.map(l => ({ rid: l.id, n: l.store, a: [l.address, l.address2].filter(Boolean).join(", "), c: l.city, st: stOf(l.state), z: zipOf(l.zip), lat: +l.lat, lon: +l.lng, ph: l.phone, w: l.url, hours: l.hours || "", when: "", notes: strip(l.description), cat: l.terms || l.category || "" })),
  slp: data => data.map(l => ({ rid: l.id, n: l.name, a: [l.address, l.address2].filter(Boolean).join(", "), c: l.city, st: stOf(l.state), z: zipOf(l.zip), lat: +l.lat, lon: +l.lng, ph: l.phone, w: l.url, hours: "", when: strip(l.hours), notes: strip(l.description), cat: l.category_names || "" })),
  agile: data => data.map(l => {
    let oh = {}; try { oh = JSON.parse(l.open_hours || "{}"); } catch { }
    return { rid: l.id, n: l.title, a: l.street, c: l.city, st: stOf(l.state), z: zipOf(l.postal_code), lat: +l.lat, lon: +l.lng, ph: l.phone, w: l.website, hours: oh, when: [strip(l.description_2), Object.values(oh).some(v => v && v !== "0") ? "" : strip(l.days_str)].filter(Boolean).join(". "), notes: strip(l.description), cat: "" };
  }),
  storerocket: data => (data?.results?.locations || data?.results || []).map(l => {
    const f = Object.fromEntries((l.fields || []).filter(x => x.pivot_field_value).map(x => [x.name.toLowerCase().replace(/:$/, ""), strip(x.pivot_field_value)]));
    const hrs = l.hours && Object.values(l.hours).some(v => v && v !== "closed") ? l.hours : {};
    return { rid: l.id, n: l.name, a: [l.address_line_1, l.address_line_2].filter(Boolean).join(", "), c: l.city, st: stOf(l.state), z: zipOf(l.postcode), lat: +l.lat, lon: +l.lng, ph: l.phone, w: l.url, hours: hrs,
      when: [f["hours of operation"], f["hours"], f["notes"]?.replace(/^hours:\s*/i, "")].filter(Boolean).join(". "), notes: [f["service notes"], f["additional languages"] && "Languages: " + f["additional languages"]].filter(Boolean).join(". "), cat: l.location_type_name === "Standard" ? "" : l.location_type_name || "", tz: l.timezone };
  }),
  mymaps: data => data.flatMap(({ mid, kml }) => {
    const out = [];
    for (const folder of kml.split(/<Folder>/).slice(1).length ? kml.split(/<Folder>/).slice(1) : [kml]) {
      const fname = strip((folder.match(/^\s*<name>([\s\S]*?)<\/name>/) || [])[1] || "");
      for (const [, p] of folder.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
        const tag = t => strip(((p.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || "").replace(/<!\[CDATA\[|\]\]>/g, ""));
        const data = {};
        for (const [, k, v] of p.matchAll(/<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>/g)) data[decode(k).toLowerCase()] = strip(v.replace(/<!\[CDATA\[|\]\]>/g, ""));
        const pick = (...ks) => { for (const k of Object.keys(data)) if (ks.some(x => k.includes(x)) && data[k]) return data[k]; return ""; };
        const co = (p.match(/<coordinates>\s*([-\d.]+),([-\d.]+)/) || []);
        const rawAddr = ((p.match(/<address>([\s\S]*?)<\/address>/) || [])[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "") || pick("address");
        const ad = splitAddress(rawAddr);
        const desc = tag("description");
        const days = pick("days of operation", "distribution day", "day"), hrs = pick("hours of operation", "hours", "time");
        out.push({ rid: mid.slice(0, 6) + ":" + (tag("name") + "|" + rawAddr), n: tag("name"), ...ad, lat: co[2] ? +co[2] : null, lon: co[1] ? +co[1] : null,
          ph: pick("contact", "phone") || firstPhoneIn(desc), w: "", hours: "", when: days && hrs && !days.includes(hrs) ? `${days} ${hrs}` : days || hrs,
          notes: Object.keys(data).length ? "" : desc.replace(/^phone:\s*[\d().\s-]+$/i, ""), cat: [fname, pick("program type", "program")].filter(Boolean).join(" ") });
      }
    }
    return out;
  }),
};

// ---------- time zones (the phone shows "open now" in the site's own zone) ----------
const TZ1 = { AL: "Chicago", AR: "Chicago", IL: "Chicago", IA: "Chicago", LA: "Chicago", MN: "Chicago", MS: "Chicago", MO: "Chicago", OK: "Chicago", WI: "Chicago",
  CT: "New_York", DE: "New_York", DC: "New_York", GA: "New_York", ME: "New_York", MD: "New_York", MA: "New_York", NH: "New_York", NJ: "New_York", NY: "New_York", NC: "New_York", OH: "New_York", PA: "New_York", RI: "New_York", SC: "New_York", VT: "New_York", VA: "New_York", WV: "New_York",
  CO: "Denver", MT: "Denver", NM: "Denver", UT: "Denver", WY: "Denver", AZ: "Phoenix", CA: "Los_Angeles", NV: "Los_Angeles", WA: "Los_Angeles", HI: "Pacific/Honolulu", AK: "Anchorage", PR: "America/Puerto_Rico" };
function tzOf(st, lat, lon) {
  let z = TZ1[st];
  if (st === "FL") z = lon < -85.0 && lat > 29.6 ? "Chicago" : "New_York";
  else if (st === "TN") z = lon > -85.25 ? "New_York" : "Chicago";
  else if (st === "KY") z = lon < -85.9 ? "Chicago" : "New_York";
  else if (st === "IN") z = lon < -86.8 && (lat > 41.0 || lat < 38.3) ? "Chicago" : "Indiana/Indianapolis";
  else if (st === "MI") z = lon < -87.6 && lat > 45.4 ? "Chicago" : "Detroit";
  else if (st === "TX") z = lon < -104.9 ? "Denver" : "Chicago";
  else if (st === "KS") z = lon < -101.5 ? "Denver" : "Chicago";
  else if (st === "NE") z = lon < -101.2 ? "Denver" : "Chicago";
  else if (st === "SD") z = lon < -100.6 ? "Denver" : "Chicago";
  else if (st === "ND") z = lon < -101.3 && lat < 47.6 ? "Denver" : "Chicago";
  else if (st === "ID") z = lat > 45.6 ? "Los_Angeles" : "Boise";
  else if (st === "OR") z = lon > -117.9 && lat < 44.6 ? "Boise" : "Los_Angeles";
  if (!z) return undefined;
  return z.includes("/") ? (z.startsWith("Pacific") || z.startsWith("America") ? z : "America/" + z) : "America/" + z;
}

// ---------- state check: a listing must sit in (or right next to) the state its address names ----------
const placeGrid = new Map();
if (existsSync(join(raw, "place.tsv"))) {
  const lines = (await readFile(join(raw, "place.tsv"), "utf8")).split(/\r?\n/), head = lines[0].split("|").map(h => h.trim());
  const iS = head.indexOf("USPS"), iLa = head.findIndex(h => /INTPTLAT/.test(h)), iLo = head.findIndex(h => /INTPTLONG/.test(h));
  for (const l of lines.slice(1)) { const c = l.split("|"); const la = +c[iLa], lo = +c[iLo]; if (!la) continue; const k = `${Math.floor(la)}_${Math.floor(lo)}`; (placeGrid.get(k) || placeGrid.set(k, []).get(k)).push([la, lo, c[iS].trim()]); }
}
function statesNear(lat, lon) {
  const found = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const p of placeGrid.get(`${Math.floor(lat) + dy}_${Math.floor(lon) + dx}`) || []) found.push([(p[0] - lat) ** 2 + ((p[1] - lon) * Math.cos(lat * Math.PI / 180)) ** 2, p[2]]);
  found.sort((a, b) => a[0] - b[0]);
  return new Set(found.slice(0, 6).map(f => f[1]));
}
const inUS = (lat, lon) => lat > 17.5 && lat < 71.6 && lon > -179.5 && lon < -64.5;

// ---------- Census geocoder for listings that come without coordinates ----------
const cacheFile = join(raw, "geocache.json");
const geocache = (await rdj(cacheFile)) || {};
async function geocode(recs) {
  const need = recs.filter(r => !(r.lat && r.lon) && r.a && (r.z || (r.c && r.st)));
  const key = r => [r.a, r.c, r.st, r.z].join("|").toLowerCase();
  const todo = [...new Map(need.filter(r => !(key(r) in geocache)).map(r => [key(r), r])).values()];
  for (let i = 0; i < todo.length; i += 2000) {
    const chunk = todo.slice(i, i + 2000);
    const csv = chunk.map((r, j) => [j, r.a, r.c, r.st, r.z].map(v => `"${String(v).replace(/"/g, "'")}"`).join(",")).join("\n");
    const fd = new FormData();
    fd.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    fd.append("benchmark", "Public_AR_Current");
    try {
      const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: fd, signal: AbortSignal.timeout(600000), headers: { "User-Agent": "PlentyMapDataBot/1.0 (free food-help app; https://plentymap.com)" } });
      const text = await r.text();
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^"?(\d+)"?,.*?,"?(Match|No_Match|Tie)"?(?:,"?(Exact|Non_Exact)"?,"[^"]*","([-\d.]+),([-\d.]+)")?/);
        if (!m) continue;
        const rec = chunk[+m[1]]; if (!rec) continue;
        geocache[key(rec)] = m[2] === "Match" ? [r5(+m[5]), r5(+m[4])] : null;
      }
      log(`geocoded ${chunk.length} addresses`);
    } catch (e) { log("geocoder failed: " + e.message); }
  }
  for (const r of need) { const g = geocache[key(r)]; if (g) { r.lat = g[0]; r.lon = g[1]; r.geo = 1; } }
  await writeFile(cacheFile, JSON.stringify(geocache));
}

// ---------- build ----------
const fa = (await rdj(join(dir, "_feedingamerica.json"))) || [];
const hostOf = u => { try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const sources = {}, sites = [], stats = {};
for (const src of SOURCES) {
  const f = join(dir, src.id + ".json");
  if (!report.sources?.[src.id]?.ok || !existsSync(f)) { stats[src.id] = { skipped: report.sources?.[src.id]?.error || "not fetched" }; continue; }
  const j = JSON.parse(await readFile(f, "utf8"));
  const bank = fa.find(b => hostOf(b.url) && hostOf(b.url) === hostOf(src.page)) || fa.find(b => clean(b.name).toLowerCase().replace(/,? inc\.?$/, "") === src.name.toLowerCase());
  sources[src.id] = { name: src.name, url: src.page, phone: phoneOf(bank?.phone || "") || undefined };
  const recs = READ[src.platform](j.data).map(r => ({ ...r, n: strip(r.n), a: strip(r.a), c: strip(r.c), st: r.st || src.st }));
  await geocode(recs);
  const st = { raw: recs.length, kept: 0, notFood: 0, closed: 0, noPlace: 0, wrongState: 0, dup: 0, conf: {} };
  const seen = new Map();
  // a locator's default hours ("every day 9:30-6:30" on most rows) are the plugin's placeholder, not food hours
  const hk = r => typeof r.hours === "string" ? r.hours : r.hours ? JSON.stringify(r.hours) : "";
  const hc = new Map(); for (const r of recs) if (hk(r)) hc.set(hk(r), (hc.get(hk(r)) || 0) + 1);
  const [topH, topN] = [...hc].sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const placeholder = topN >= 5 && topN >= recs.length * 0.5 && (dayFields(recs.find(r => hk(r) === topH).hours)?.fields ? Object.keys(dayFields(recs.find(r => hk(r) === topH).hours).fields).length >= 6 : false);
  if (placeholder) { st.placeholderHours = topN; for (const r of recs) if (hk(r) === topH) r.hours = ""; }
  for (const r of recs) {
    if (!r.n || r.n.length < 3) { st.noPlace++; continue; }
    const text = [r.when, r.notes].join(" ");
    if (NOT_FOOD.test(r.n) || (src.notFood && src.notFood.test(r.n))) { st.notFood++; continue; }
    if (NOT_PUBLIC.test([r.notes, r.when, r.cat].join(" "))) { st.notFood++; continue; }
    if (CLOSED.test(r.n) || CLOSED.test(r.notes || "") || CLOSED.test(r.when || "")) { st.closed++; continue; }
    if (!(r.lat && r.lon) || !inUS(r.lat, r.lon)) { st.noPlace++; continue; }
    if (placeGrid.size && r.st && !statesNear(r.lat, r.lon).has(r.st)) { st.wrongState++; continue; }
    // hours: a weekday table or object becomes weekday fields; free text goes through the shared parser
    if (src.ignoreHours && r.notes) { r.hours = ""; }
    const df = dayFields(r.hours) || (typeof r.hours === "string" && r.hours ? { fields: {}, noTime: [], text: strip(r.hours) } : { fields: {}, noTime: [] });
    // many lists keep the schedule in the description ("3rd Saturday 8am-10am"): use it as the schedule text
    const SCHED = /\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?s?\b[^.]{0,80}?\d|\b(daily|weekdays|every day)\b[^.]{0,40}\d/i;
    let notesText = r.notes || "";
    if (!r.when && !Object.keys(df.fields).length && !df.text && SCHED.test(notesText)) { r.when = notesText; notesText = ""; }
    // notes that say which weeks ("2nd Friday of each month", "every other Monday") decide the pattern;
    // the weekday fields then only give the times
    const MONTHLY = /\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last|every other|alternate|bi-?weekly|each month|of the month|monthly)\b/i;
    const DAYNAME = /\b(mon|tues|wednes|thurs|fri|satur|sun)days?\b/i;
    if (notesText && MONTHLY.test(notesText) && DAYNAME.test(notesText)) r.when = [r.when, notesText].filter(Boolean).join(". ");
    const whenParts = [r.when, df.text, df.noTime.length ? dayList(df.noTime) : ""].filter(Boolean);
    let when = clean(whenParts.join(". "));
    const events = datedEvents(when);
    const sch = parseSchedule(tidySchedule(when), df.fields, REF);
    if (events.length) { sch.once = events; sch.rules = sch.rules.filter(x => x.nth); sch.conf = events.some(e => e.t[0][0]) ? "ok" : "notime"; }
    // a weekly rule that came only from the weekday table, while the notes name certain weeks, is not trustworthy
    if (MONTHLY.test(notesText || "") && DAYNAME.test(notesText || "") && sch.rules.some(x => !x.nth) && !/\b(every|each)\s+(mon|tue|wed|thu|fri|sat|sun)/i.test(notesText)) sch.conf = sch.rules.some(x => x.nth) ? sch.conf : "partial";
    // the same weekday both weekly and on certain weeks ("WEEKLY Thursday, 3RD Thursday") can't be told apart: call first
    { const W = "(mon|tues|wednes|thurs|fri|satur|sun)day"; const weekly = new Set([...when.matchAll(new RegExp(`\\b(?:weekly|every|each)\\s+${W}`, "gi"))].map(m => m[1].toLowerCase()));
      const nth = new Set([...when.matchAll(new RegExp(`\\b(?:\\d(?:st|nd|rd|th)|first|second|third|fourth|last)\\s+${W}`, "gi"))].map(m => m[1].toLowerCase()));
      if ([...weekly].some(d => nth.has(d))) sch.conf = "partial"; }
    const nt = resolveYears(parseNotes(notesText, src.id, REF), sch, REF);
    if (nt.unclear && sch.conf === "ok") sch.conf = "notes";
    const shown = [when, Object.keys(df.fields).length ? fieldsText(df.fields) : ""].filter(Boolean).join(". ").slice(0, 400);
    const kind = kindOf(r.n, r.cat, text);
    const prog = progOf(r.n, r.cat, text);
    const notes = none(notesText) ? "" : notesText.slice(0, 400);
    const site = {
      id: `${src.id}-${typeof r.rid === "string" && r.rid.length > 24 ? hash(r.rid) : r.rid}`,
      k: kind, n: r.n, a: r.a, c: r.c, z: r.z || "", lat: r5(r.lat), lon: r5(r.lon),
      ph: phoneOf(r.ph) || firstPhoneIn(text), w: urlOk(r.w || ""), tz: (r.tz && /^America\/|^Pacific\//.test(r.tz) ? r.tz : tzOf(r.st, r.lat, r.lon)),
      d: [{ src: src.id, prog, when: shown, notes, food: "", who: "", tips: "",
        f: flagsFrom(text, r.cat, prog === "csfp" ? "senior food program only" : ""),
        sc: { rules: sch.rules, once: sch.once, except: sch.except, skip: nt.skip, add: nt.add, moved: nt.moved, skipMonths: nt.skipMonths }, conf: !shown ? "call" : sch.conf === "partial" ? "call" : sch.conf }],
    };
    if (r.geo) site.geo = 1;   // placed from its street address by the Census geocoder
    // the same place twice in one list (e.g. one row per program): keep one place, both schedules
    const k2 = `${site.lat.toFixed(4)},${site.lon.toFixed(4)}|${site.n.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
    const prev = seen.get(k2);
    if (prev) { if (!prev.d.some(d => d.when === site.d[0].when)) prev.d.push(site.d[0]); prev.ph ||= site.ph; prev.w ||= site.w; if (site.k === "pantry") prev.k = "pantry"; st.dup++; continue; }
    seen.set(k2, site);
    sites.push(site);
    st.kept++; st.conf[site.d[0].conf] = (st.conf[site.d[0].conf] || 0) + 1;
  }
  stats[src.id] = st;
  log(src.id, JSON.stringify(st));
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// the same place listed by two food banks (border areas): one place with both schedules
const merged = [];
const grid = new Map();
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const s of sites) {
  const gk = `${Math.round(s.lat * 500)}_${Math.round(s.lon * 500)}`;
  const near = [-1, 0, 1].flatMap(dy => [-1, 0, 1].flatMap(dx => grid.get(`${Math.round(s.lat * 500) + dy}_${Math.round(s.lon * 500) + dx}`) || []))
    .find(m => m.d[0].src !== s.d[0].src && Math.abs(m.lat - s.lat) < 0.0008 && Math.abs(m.lon - s.lon) < 0.001 && (norm(m.a).slice(0, 6) === norm(s.a).slice(0, 6) || norm(m.n).slice(0, 8) === norm(s.n).slice(0, 8)));
  if (near) { near.d.push(...s.d); near.ph ||= s.ph; near.w ||= s.w; continue; }
  (grid.get(gk) || grid.set(gk, []).get(gk)).push(s);
  merged.push(s);
}
await writeFile(join(raw, "pantry-sites.json"), JSON.stringify({ built: report.fetched, sources, sites: merged, stats }));
log(`${merged.length} food bank sites from ${Object.keys(sources).length} food banks`);
