/* Canada: food help and benefits. Data only; the Help tab renders it.
   Federal benefits are paid by the Canada Revenue Agency from your tax return, so the single most
   useful step is to file a return every year, even with no income. Provinces and territories run
   social assistance. Every figure has a source and an as-of date. Checked 2026-11-19.
   Update every July (CCB and CGEB amounts reset with the July–June benefit year).
   Region codes: two-letter province and territory codes (same as the data packs). */

export const AS_OF = "2026-11";
export const CURRENCY = "CAD";

export const HELPLINE = {
  name: "211", ph: "211", free: true, langs: "English, French and 150+ languages by interpreter",
  does: "Free, confidential help finding food banks, meal programs, income support and other services near you. Call 211 or search 211.ca.",
  url: "https://211.ca/", src: "https://211.ca/",
};
export const FOOD_BANKS = {
  referral: false,
  how: "Most food banks in Canada don't need a referral, but many ask for ID and proof of address, and serve set neighbourhoods. Call ahead or call 211.",
  finder: { name: "Food Banks Canada", url: "https://foodbankscanada.ca/find-a-food-bank/" },
};
export const FILE_TAXES = {
  what: "File a tax return every year, even with little or no income. The Canada Child Benefit and the Canada Groceries and Essentials Benefit are worked out from it and paid automatically.",
  free: { name: "Free tax clinics (CVITP)", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/community-volunteer-income-tax-program.html" },
};

/* ---------- Canada Child Benefit (CRA), July 2026 to June 2027, from 2025 income ----------
   Source: canada.ca "How we calculate your CCB" (modified 2026-10-22). Tax-free, paid monthly. */
export const CCB = {
  src: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
  period: "2026-07/2027-06",
  max: { under6: 8157, age6to17: 6883 },              // per child, per year
  t1: 38237, t2: 82847,                                // adjusted family net income thresholds
  // reduction above t1 (and the extra rate above t2), by number of children 1, 2, 3, 4+
  r1: [0.07, 0.135, 0.19, 0.23], r2: [0.032, 0.057, 0.08, 0.095],
  apply: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-apply.html",
  phone: "1-800-387-1193",
};
/* Yearly CCB estimate. Doesn't include the Child Disability Benefit or provincial child benefits. */
export function ccbEstimate({ under6 = 0, age6to17 = 0, afni = 0 }) {
  const n = under6 + age6to17;
  if (!n) return 0;
  const i = Math.min(n, 4) - 1, base = under6 * CCB.max.under6 + age6to17 * CCB.max.age6to17;
  const cut = afni <= CCB.t1 ? 0 : afni <= CCB.t2 ? (afni - CCB.t1) * CCB.r1[i] : (CCB.t2 - CCB.t1) * CCB.r1[i] + (afni - CCB.t2) * CCB.r2[i];
  return Math.max(0, Math.round(base - cut));
}

/* ---------- Canada Groceries and Essentials Benefit (formerly the GST/HST credit) ----------
   Renamed and raised 25% from July 2026 for five years. Maximums for July 2026 to June 2027, paid
   quarterly (July, October, January, April), worked out from the 2025 return. A one-time top-up was
   paid in June 2026. Sources: canada.ca CGEB "How much you can get" (modified 2026-07-15); Finance
   Canada backgrounder, January 2026. */
export const CGEB = {
  name: "Canada Groceries and Essentials Benefit", formerly: "GST/HST credit",
  src: ["https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit/how-much.html",
    "https://www.canada.ca/en/department-finance/news/2026/01/the-new-canada-groceries-and-essentials-benefit.html"],
  period: "2026-07/2027-06",
  max: { single: 679, couple: 890, child: 234 },        // per year; child = each child under 19
  apply: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-groceries-essentials-benefit.html",
  note: "No form: file your taxes and the CRA pays it automatically if you qualify.",
};

/* Pregnancy: the Canada Prenatal Nutrition Program runs local groups with food, coupons and vitamins */
export const PRENATAL = {
  name: "Canada Prenatal Nutrition Program", url: "https://www.canada.ca/en/public-health/services/health-promotion/childhood-adolescence/programs-initiatives/canada-prenatal-nutrition-program-cpnp.html",
  what: "Free local programs for pregnant people and new parents: food or grocery coupons, prenatal vitamins and support. Ask 211 for the one near you.",
};

/* ---------- Provinces and territories: social assistance (income help when you can't cover basics) ----------
   n: program name people know · url: official page · fr: French name where the program is bilingual.
   Phones are left to the official pages and 211 until each is checked. */
export const PROVINCES = {
  AB: { n: "Alberta", p: "Income Support", url: "https://www.alberta.ca/income-support" },
  BC: { n: "British Columbia", p: "Income Assistance", url: "https://www2.gov.bc.ca/gov/content/family-social-supports/income-assistance" },
  MB: { n: "Manitoba", p: "Employment and Income Assistance", url: "https://www.gov.mb.ca/fs/eia/index.html" },
  NB: { n: "New Brunswick", p: "Social Assistance", fr: "Aide sociale", url: "https://www2.gnb.ca/content/gnb/en/departments/social_development/social_assistance.html" },
  NL: { n: "Newfoundland and Labrador", p: "Income Support", url: "https://www.gov.nl.ca/cssd/income-support/" },
  NS: { n: "Nova Scotia", p: "Employment Support and Income Assistance", url: "https://novascotia.ca/coms/employment/income_assistance/" },
  NT: { n: "Northwest Territories", p: "Income Assistance", url: "https://www.ece.gov.nt.ca/en/services/income-assistance" },
  NU: { n: "Nunavut", p: "Income Assistance", url: "https://www.gov.nu.ca/en/family-services/income-assistance" },
  ON: { n: "Ontario", p: "Ontario Works", url: "https://www.ontario.ca/page/ontario-works", apply: "https://www.ontario.ca/page/apply-ontario-works" },
  PE: { n: "Prince Edward Island", p: "Social Assistance Program", url: "https://www.princeedwardisland.ca/en/information/social-development-and-seniors/social-assistance-program" },
  QC: { n: "Quebec", p: "Social Assistance Program", fr: "Programme d'aide sociale", url: "https://www.quebec.ca/en/family-and-support-for-individuals/social-assistance-social-solidarity", lang: "fr" },
  SK: { n: "Saskatchewan", p: "Saskatchewan Income Support", url: "https://www.saskatchewan.ca/residents/family-and-social-support/financial-help/saskatchewan-income-support" },
  YT: { n: "Yukon", p: "Social Assistance", url: "https://yukon.ca/en/social-assistance" },
};

/* Quick check (runs on the phone, never saved) */
export function quickCheck({ reg = "ON", adults = 1, under6 = 0, age6to17 = 0, kidsUnder19 = null, afni = 0, filedTaxes = true, pregnant = false }) {
  const out = [];
  if (!filedTaxes) out.push({ id: "file_taxes", url: FILE_TAXES.free.url });
  const ccb = ccbEstimate({ under6, age6to17, afni });
  if (ccb) out.push({ id: "ccb", yearly: ccb, monthly: Math.round(ccb / 12), apply: CCB.apply, est: true });
  const kids = kidsUnder19 ?? under6 + age6to17;
  out.push({ id: "cgeb", upTo: (adults > 1 ? CGEB.max.couple : CGEB.max.single) + kids * CGEB.max.child, apply: CGEB.apply, maybe: true });
  if (pregnant) out.push({ id: "prenatal", url: PRENATAL.url });
  const p = PROVINCES[reg];
  if (p) out.push({ id: "social_assistance", name: p.p, url: p.apply || p.url, maybe: true });
  return out;
}
