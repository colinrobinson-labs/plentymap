/* United Kingdom: food help and benefits, by nation. Data only; the Help tab renders it.
   Every figure has its source and an as-of date. Checked 2026-11-19.
   Update every April (benefit uprating, Healthy Start, Best Start Foods) and every September
   (free school meal rules change with the school year).

   Region codes: ENG England, SCT Scotland, WLS Wales, NIR Northern Ireland (same as the data packs). */

export const AS_OF = "2026-11";
export const CURRENCY = "GBP";

/* Who to call when someone can't afford food. There is no 211 in the UK. */
export const HELPLINES = {
  ENG: { name: "Help through Hardship", by: "Citizens Advice and Trussell", ph: "0808 208 2138", hours: "Mon–Fri 9am–5pm", free: true,
    does: "Free, confidential advice on money and benefits, and a referral to a food bank if you need one. Interpreters on request.",
    url: "https://www.trussell.org.uk/help-and-advice/help-through-hardship-helpline", src: "https://www.trussell.org.uk/help-and-advice/help-through-hardship-helpline" },
  WLS: "ENG",
  SCT: { name: "Money Talk Team", by: "Citizens Advice Scotland", ph: "0800 028 1456", free: true,
    does: "A free check that you're getting all the money you're entitled to, from your local Citizens Advice.",
    url: "https://www.citizensadvice.org.uk/scotland/debt-and-money/other-resources-related-to-debt-and-money/money-talk-team-s/",
    src: "https://www.citizensadvice.org.uk/scotland/debt-and-money/other-resources-related-to-debt-and-money/money-talk-team-s/" },
  NIR: { name: "Make the Call", by: "Department for Communities", ph: "0800 232 1271", hours: "Mon–Fri 9am–5pm", free: true,
    text: { to: "07984 405248", body: "ADVICE" },
    does: "Checks which benefits, support and services you can get. Text ADVICE and they'll call you back.",
    url: "https://www.communities-ni.gov.uk/contacts/make-call-wraparound-service", src: "https://www.communities-ni.gov.uk/contacts/make-call-wraparound-service" },
};
/* Per-nation tables point to another nation with its code ("SCT: 'ENG'" = same as England) */
export const pickReg = (t, reg) => { let v = reg in t ? t[reg] : t.ENG; if (typeof v === "string" && v in t) v = t[v]; return v; };
export const helpline = reg => { const h = HELPLINES[reg] || HELPLINES.ENG; return typeof h === "string" ? HELPLINES[h] : h; };

/* Food banks. Most UK food banks give food against a referral (an e-voucher) from Citizens Advice,
   a GP, a school, a housing officer or a support worker. The helpline above can refer people. */
export const FOOD_BANKS = {
  referral: true,
  how: "Most food banks give food with a referral. Ask Citizens Advice, your GP, school, housing officer or support worker, or call the helpline. Some community pantries and larders don't need one; check with them.",
  finder: { name: "Give Food", url: "https://www.givefood.org.uk/" },
};

/* ---------- Universal Credit (England, Scotland, Wales: DWP; Northern Ireland: DfC) ----------
   Monthly amounts for 6 April 2026 to 5 April 2027.
   Source: DWP, "Benefit and pension rates 2026 to 2027" (published Feb 2026). */
export const UC = {
  src: "https://www.gov.uk/government/publications/benefit-and-pension-rates-2026-to-2027",
  period: "2026-04-06/2027-04-05",
  standard: { single_u25: 338.58, single_25: 424.90, couple_u25: 528.34, couple_25: 666.97 },
  child: { first_pre2017: 351.88, each: 303.94 },
  disabled_child: { lower: 164.79, higher: 514.71 },
  work_allowance: { no_housing: 710.00, with_housing: 427.00 },
  taper: 0.55,   // 55p less UC for each £1 earned above the work allowance (unchanged since 2021)
  apply: { ENG: "https://www.gov.uk/universal-credit/how-to-claim", SCT: "ENG", WLS: "ENG", NIR: "https://www.nidirect.gov.uk/campaigns/universal-credit" },
  // helpline Mon–Fri 8am–6pm (gov.uk/universal-credit/contact-universal-credit). Welsh-language line for Wales.
  // Northern Ireland: the Universal Credit Service Centre; number on the contact page (not yet checked by us).
  phone: { ENG: "0800 328 5644", SCT: "ENG", WLS: "0800 328 1744", NIR: null },
  contact: { NIR: "https://www.communities-ni.gov.uk/contacts/universal-credit-service-centre" },
};

/* ---------- Healthy Start (England, Wales, NI) / Best Start Foods (Scotland) ----------
   A prepaid card for milk, fruit, vegetables, pulses and infant formula, topped up every 4 weeks. */
export const HEALTHY_START = {
  regions: ["ENG", "WLS", "NIR"],
  // weekly, from 6 April 2026 (first rise since 2021). Source: DHSC / NHSBSA via Sustain, Mar 2026
  weekly: { pregnant: 4.65, child_1_to_4: 4.65, baby_under_1: 9.30 },
  // Universal Credit with the family's monthly take-home pay from work of £408 or less; or Pension
  // Credit; or under 18 and pregnant (no benefit needed); or no recourse to public funds with a
  // British child under 4 and earnings of £408 a month or less. Pregnant: from 10 weeks.
  uc_earned_max: 408,
  from_weeks_pregnant: 10,
  buys: ["plain cow's milk", "fresh, frozen and tinned fruit and veg", "fresh, dried and tinned pulses", "infant formula (cow's milk based)"],
  also: "Free Healthy Start vitamins for pregnancy, breastfeeding and children up to 4.",
  apply: "https://www.healthystart.nhs.uk/how-to-apply/",
  url: "https://www.healthystart.nhs.uk/",
  src: ["https://www.healthystart.nhs.uk/", "https://www.sustainweb.org/news/mar26-healthy-start-value-uplift/",
    "https://www.turn2us.org.uk/get-support/information-for-your-situation/healthy-start-scheme-england-wales-northern-ireland/am-i-eligible-for-healthy-start-scheme"],
};
export const BEST_START_FOODS = {
  regions: ["SCT"],
  // weekly, 2026-27. Source: Scottish Government, Social Security Assistance in Scotland: up-rating 2026-27
  weekly: { pregnant: 5.60, child_1_to_3: 5.60, baby_under_1: 11.20 },
  note: "For pregnant people and children under 3 in families on Universal Credit (with an income limit), Pension Credit, Child Tax Credit and some other benefits. Under 18 and pregnant: no benefit needed.",
  apply: "https://www.mygov.scot/best-start-grant-best-start-foods",
  phone: "0800 182 2222",   // Social Security Scotland
  src: "https://www.gov.scot/publications/social-security-assistance-scotland-up-rating-inflation-2026-27/pages/7/",
  related: [
    { name: "Scottish Child Payment", weekly: 28.20, who: "each child under 16, for families on Universal Credit and some other benefits", apply: "https://www.mygov.scot/scottish-child-payment" },
    { name: "Best Start Grant", who: "one-off payments at pregnancy (£796.65 for a first child), nursery age (£331.95) and school age (£331.95)", apply: "https://www.mygov.scot/best-start-grant-best-start-foods" },
  ],
};

/* ---------- Free school meals (a lunch every school day; the rules differ by nation) ----------
   Sources: gov.uk/apply-free-school-meals; Turn2us "Free school meals" (2026/27 rules). */
export const SCHOOL_MEALS = {
  ENG: {
    all: "Every child in Reception, Year 1 and Year 2 at a state school. All primary school children in London.",
    means: "From the 2026/27 school year: every child in a family on Universal Credit, whatever your earnings. Also: income-related ESA, the guarantee part of Pension Credit, or asylum support.",
    apply: "https://www.gov.uk/apply-free-school-meals", how: "Apply to your local council (the link finds it from your postcode).",
    extra: "Children on free school meals also get the Holiday Activities and Food programme in the holidays.",
  },
  WLS: {
    all: "Every primary school child.",
    means: "Years 7 and 8: every child in a family on Universal Credit. From Year 9: Universal Credit with household income after tax under £7,400 a year, the guarantee part of Pension Credit, or asylum support.",
    apply: "https://www.gov.wales/free-school-meals-information-parents-and-carers", how: "Apply to your local council.",
  },
  SCT: {
    all: "Every child in Primary 1 to Primary 5.",
    means: "Primary 6 and 7: Universal Credit with monthly earnings of £995 or less, Scottish Child Payment, Pension Credit or asylum support. Secondary school: the same, except Scottish Child Payment.",
    apply: "https://www.mygov.scot/primary-school-meals", how: "Apply to your council. Many councils also pay a clothing grant with the same form.",
  },
  NIR: {
    all: null,
    means: "Universal Credit with household take-home pay of £15,900 a year or less, the guarantee part of Pension Credit, or asylum support.",
    apply: "https://www.eani.org.uk/financial-help/free-school-meals", how: "Apply to the Education Authority (the same form covers the uniform grant).",
  },
  src: ["https://www.gov.uk/apply-free-school-meals", "https://www.turn2us.org.uk/get-support/information-for-your-situation/free-school-meals"],
};

/* Other money help worth a mention on the Help tab */
export const OTHER = [
  { id: "hsf", name: "Household Support Fund", regions: ["ENG"], what: "Help with food and energy bills from your local council (vouchers or cash). Each council sets its own rules.",
    url: "https://www.gov.uk/cost-of-living" },
  { id: "daf", name: "Discretionary Assistance Fund", regions: ["WLS"], what: "Emergency payments for food, gas or electricity from the Welsh Government.", url: "https://www.gov.wales/discretionary-assistance-fund-daf" },
  { id: "swf", name: "Scottish Welfare Fund", regions: ["SCT"], what: "Crisis grants from your council for food, heating and other essentials.", url: "https://www.mygov.scot/scottish-welfare-fund" },
  { id: "fsp", name: "Finance Support Service", regions: ["NIR"], what: "Short-term help from the Department for Communities in an emergency.", url: "https://www.nidirect.gov.uk/campaigns/finance-support" },
  { id: "calc", name: "Benefits calculators", regions: ["ENG", "WLS", "SCT", "NIR"], what: "Free, anonymous calculators that show what you could get.", url: "https://www.gov.uk/benefits-calculators" },
];

/* Quick check (runs on the phone, never saved): which of these might apply. Inputs mirror the US check
   where they can: household size, kids' ages, pregnant, on Universal Credit, monthly take-home pay. */
export function quickCheck({ reg = "ENG", pregnant = false, under1 = 0, age1to4 = 0, schoolKids = 0, uc = false, earnedMonth = 0, pensionCredit = false, under18 = false }) {
  const out = [];
  const scot = reg === "SCT";
  const hsOk = pregnant || under1 || age1to4;
  if (hsOk && !scot && ((uc && earnedMonth <= HEALTHY_START.uc_earned_max) || pensionCredit || (pregnant && under18))) {
    const w = HEALTHY_START.weekly;
    out.push({ id: "healthy_start", weekly: (pregnant ? w.pregnant : 0) + under1 * w.baby_under_1 + age1to4 * w.child_1_to_4, apply: HEALTHY_START.apply });
  }
  if (hsOk && scot && (uc || pensionCredit || (pregnant && under18))) {
    const w = BEST_START_FOODS.weekly;
    out.push({ id: "best_start_foods", weekly: (pregnant ? w.pregnant : 0) + under1 * w.baby_under_1 + Math.min(age1to4, 3) * w.child_1_to_3, apply: BEST_START_FOODS.apply, maybe: uc });
  }
  if (schoolKids) out.push({ id: "school_meals", ...SCHOOL_MEALS[reg] && { apply: SCHOOL_MEALS[reg].apply }, maybe: !uc });
  if (!uc) out.push({ id: "uc", apply: pickReg(UC.apply, reg), maybe: true });
  return out;
}
