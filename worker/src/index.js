/* Plenty Map report endpoint (report.plentymap.com), a Cloudflare Worker with a D1 database.

   What it keeps, per report: our listing id, the problem picked, an optional short note, the app
   language and the day. Never the IP address, User-Agent, location, device, cookies or any cf-*
   header: the code below reads none of them. Abuse limits count reports per listing and per day
   instead of per person, so nothing about the sender is needed.

   Routes
     POST /r              {id, k, note?, lang?}  -> 204
     GET  /summary.json   open reports from the last 60 days, grouped by listing, no notes
     GET  /               a one-line description
   Cron (daily): erase notes after 90 days, delete reports after 180 days. */

const KINDS = new Set(["closed", "nofood", "hours", "address", "phone", "deal_ended", "other"]);
const LANGS = new Set(["en", "es", "zh-Hans", "zh-Hant", "vi", "fil", "ko", "ar", "fa-AF", "ps", "ru", "uk", "so", "ht", "pt"]);
const ORIGINS = new Set(["https://plentymap.com", "https://www.plentymap.com", "capacitor://localhost", "https://localhost", "http://localhost", "http://localhost:8080", "http://localhost:8081"]);
const ID_RE = /^[a-z0-9][a-z0-9_.:-]{1,79}$/i;
const PER_LISTING_DAY = 20;   // more than this for one listing in one day is noise
const PER_DAY = 3000;         // the whole site, per day; far above real use
const NOTE_MAX = 280;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function cors(req) {
  const o = req.headers.get("Origin");
  const h = { "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };
  if (o && ORIGINS.has(o)) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
const res = (req, status, body, extra = {}) => new Response(body ?? null, { status, headers: { ...cors(req), ...extra } });

/* Notes are for "the pantry moved to the church hall", not for contact details: drop anything that
   looks like an email address, a phone number or a web link, and control characters. */
export function cleanNote(s) {
  if (typeof s !== "string") return null;
  let t = s.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ");
  t = t.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[removed]")
       .replace(/https?:\/\/\S+|www\.\S+/gi, "[removed]")
       .replace(/\+?\d[\d\s().-]{6,}\d/g, "[removed]")
       .replace(/\s+/g, " ").trim();
  return t ? t.slice(0, NOTE_MAX) : null;
}

async function add(req, env) {
  if (!ORIGINS.has(req.headers.get("Origin") || "")) return res(req, 403);
  if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return res(req, 415);
  const raw = await req.text();
  if (raw.length > 2000) return res(req, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return res(req, 400); }
  const lid = String(b?.id || ""), kind = String(b?.k || "");
  if (!ID_RE.test(lid) || !KINDS.has(kind)) return res(req, 400);
  const lang = LANGS.has(b.lang) ? b.lang : null;
  const note = cleanNote(b.note);
  const day = today();
  const { results } = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM reports WHERE day = ?1) AS d, (SELECT COUNT(*) FROM reports WHERE day = ?1 AND lid = ?2) AS l"
  ).bind(day, lid).all();
  const c = results?.[0] || { d: 0, l: 0 };
  // Over a limit: say "thanks" anyway (204), so a flood learns nothing, but keep nothing.
  if (c.d >= PER_DAY || c.l >= PER_LISTING_DAY) return res(req, 204);
  await env.DB.prepare("INSERT INTO reports (lid, kind, note, lang, day) VALUES (?1, ?2, ?3, ?4, ?5)").bind(lid, kind, note, lang, day).run();
  return res(req, 204);
}

/* Open reports from the last 60 days, grouped by listing: {built, listings: {id: {kind: [count, first, last, days]}}}.
   Public on purpose (the nightly re-check on GitHub reads it). Never includes note text. */
async function summary(req, env) {
  const { results } = await env.DB.prepare(
    "SELECT lid, kind, COUNT(*) AS n, MIN(day) AS a, MAX(day) AS b, COUNT(DISTINCT day) AS dd, SUM(note IS NOT NULL) AS nn FROM reports WHERE day >= ?1 GROUP BY lid, kind"
  ).bind(daysAgo(60)).all();
  const out = {};
  for (const r of results || []) (out[r.lid] ||= {})[r.kind] = [r.n, r.a, r.b, r.dd, r.nn];
  return res(req, 200, JSON.stringify({ built: new Date().toISOString(), days: 60, listings: out }), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" });
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === "OPTIONS") return res(req, 204);
    if (u.pathname === "/r" && req.method === "POST") {
      try { return await add(req, env); } catch { return res(req, 503); }
    }
    if (u.pathname === "/summary.json" && req.method === "GET") return summary(req, env);
    if (u.pathname === "/" && req.method === "GET") return res(req, 200, "Plenty Map listing reports. See https://plentymap.com/privacy/\n", { "Content-Type": "text/plain; charset=utf-8" });
    return res(req, 404);
  },
  async scheduled(_ev, env) {
    await env.DB.batch([
      env.DB.prepare("UPDATE reports SET note = NULL WHERE note IS NOT NULL AND day < ?1").bind(daysAgo(90)),
      env.DB.prepare("DELETE FROM reports WHERE day < ?1").bind(daysAgo(180)),
    ]);
  },
};
