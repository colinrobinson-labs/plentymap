/* Countries Plenty Map covers, and everything the app needs to know that changes between them.
   One entry per country (ISO 3166-1 alpha-2). The data packs for a country live under its `data`
   folder, built by tools/build-intl.mjs (US: tools/build-us.mjs), and use the same cell format:
     <data>/index.json           sources, build date, cells with data, regions (nations, provinces)
     <data>/cells/<y>_<x>.json   free food sites, stores and postcode areas in one 0.5° cell
     <data>/pc/<key>.json        postcode areas for search (see `postcode` below)
     <data>/places/<a>.json      towns and cities by first letter: [name, region, lat, lon, weight]
   Nothing here calls a third party: help lines are tel: links and finders are plain links out. */

export const COUNTRIES = {
  US: {
    name: "United States", currency: "USD", units: "us", dist: "mi", data: "data/us/", tiles: "us",
    tz: "America/Los_Angeles",             // San Diego default; US packs don't carry time zones yet
    helpline: { ph: "211", name: "211" },
    finder: { name: "Feeding America", url: "https://www.feedingamerica.org/find-your-local-foodbank" },
    benefits: "us",
  },
  GB: {
    name: "United Kingdom", currency: "GBP", units: "metric", dist: "mi", data: "data/gb/", tiles: "gb",
    tz: "Europe/London",
    // No 211 in the UK. Help through Hardship (Citizens Advice + Trussell) covers England and Wales;
    // Scotland and Northern Ireland have their own lines, set per nation in js/benefits/gb.js.
    helpline: { ph: "0808 208 2138", name: "Help through Hardship", regions: ["ENG", "WLS"] },
    finder: { name: "Give Food", url: "https://www.givefood.org.uk/needs/" },
    // Most UK food banks hand out food against a referral (a voucher from Citizens Advice, a GP,
    // a school, a support worker). Cards say so instead of implying people can just walk in.
    referral: true,
    benefits: "gb",
    // Postcodes: search by full postcode, sector ("SW2 3") or district ("SW2"). Files are keyed by
    // the letters at the start (the postcode area): pc/sw.json holds every SW sector and district.
    postcode: {
      re: /^([A-Z]{1,2}\d[A-Z\d]?)(?:\s*(\d)([A-Z]{2})?)?$/,
      parse(q) {
        const m = String(q).toUpperCase().replace(/\s+/g, " ").trim().match(this.re);
        if (!m) return null;
        const file = m[1].match(/^[A-Z]+/)[0].toLowerCase();
        if (!m[2]) return { file, keys: [m[1]], label: m[1] };
        return { file, keys: [`${m[1]} ${m[2]}`, m[1]], label: m[3] ? `${m[1]} ${m[2]}${m[3]}` : `${m[1]} ${m[2]}` };
      },
    },
    regions: { ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland" },
    langs: ["en", "cy", "pl", "ur", "pa", "bn", "ar", "ro", "pt", "uk", "so"],   // later: Welsh, Polish, Urdu...
  },
  CA: {
    name: "Canada", currency: "CAD", units: "metric", dist: "km", data: "data/ca/", tiles: "ca",
    tz: "America/Toronto",                 // each cell carries its own zone; this is the fallback
    helpline: { ph: "211", name: "211" },  // 211 answers in every province and territory
    finder: { name: "Food Banks Canada", url: "https://foodbankscanada.ca/find-a-food-bank/" },
    benefits: "ca",
    // Postal codes: we keep only the first three characters (the FSA, about a neighbourhood in
    // cities). A full code like "M5V 2T6" is cut to "M5V" on the phone before anything is looked up.
    postcode: {
      re: /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s*(\d[ABCEGHJ-NPRSTV-Z]\d)?$/,
      parse(q) {
        const m = String(q).toUpperCase().replace(/\s+/g, "").match(this.re);
        return m ? { file: m[1][0].toLowerCase(), keys: [m[1]], label: m[1] } : null;
      },
    },
    regions: { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
      NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island",
      QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" },
    langs: ["en", "fr", "zh-Hans", "zh-Hant", "pa", "ar", "es", "fil", "uk", "fa-AF"],
  },
};

/* Coarse boxes, only to narrow down which countries' files to read for a GPS point. Near a border
   more than one country comes back (Detroit and Windsor, Seattle and Victoria); the app then reads
   both and keeps the country whose nearest postcode area is closer (see nearestCountry below). */
const BOXES = {
  GB: [[-8.7, 49.8, 1.8, 61.0]],
  CA: [[-141.0, 48.2, -52.6, 83.2], [-83.3, 41.6, -59.6, 48.3]],
  US: [[-125.0, 24.3, -66.8, 49.5], [-179.9, 51.0, -129.9, 71.6], [-160.4, 18.8, -154.7, 22.4], [-67.4, 17.6, -64.5, 18.6]],
};
const IRELAND = [-10.7, 51.3, -5.9, 55.45], NI = [-8.2, 54.0, -5.4, 55.35];
const inB = (b, lat, lon) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
export function countriesAt(lat, lon) {
  if (lat == null || lon == null) return [];
  return Object.keys(BOXES).filter(cc => BOXES[cc].some(b => inB(b, lat, lon))
    && !(cc === "GB" && inB(IRELAND, lat, lon) && !inB(NI, lat, lon)));   // Republic of Ireland: not covered
}
/* Given each candidate country's nearest postcode area to the point ({cc: metres}), pick one */
export const nearestCountry = near => Object.entries(near).filter(([, d]) => d != null).sort((a, b) => a[1] - b[1])[0]?.[0] || null;

/* Which countries a typed postcode could belong to, most likely first: a US ZIP (5 digits), a UK
   postcode, a Canadian postal code. "M5V" fits both a Canadian FSA and a UK district shape, so the
   person's current country (if any) goes first and the app tries each in turn. */
export function countriesOfPostcode(q, here = null) {
  const s = String(q || "").trim();
  if (/^\d{5}(-\d{4})?$/.test(s)) return ["US"];
  const out = ["CA", "GB"].filter(cc => COUNTRIES[cc].postcode.parse(s));
  return here && out.includes(here) ? [here, ...out.filter(c => c !== here)] : out;
}

export const country = cc => COUNTRIES[cc] || COUNTRIES.US;

/* Distance in the country's own unit: miles in the US and UK, kilometres in Canada */
export function distText(m, cc, t, num) {
  const c = country(cc);
  if (c.dist === "km") { const km = m / 1000; return km < 0.15 ? t("dist_here") : t("dist_km", { d: num(km, km < 10 ? 1 : 0) }); }
  const mi = m / 1609.34;
  return mi < 0.1 ? t("dist_here") : t("dist_mi", { d: num(mi, mi < 10 ? 1 : 0) });
}
