/* Benefit figures, with where each comes from. Checked 2026-11-18. Update every October (SNAP)
   and every spring (poverty guidelines, WIC). The quick check runs on the phone and is never saved. */

export const AS_OF = "2026-11";

/* ---------- every state ----------
   n: name · b: the state's own name for SNAP, used in text where people know it by that name
   · p: the program's official name in that state, shown once on the Help tab · ph: state SNAP line
   ap: where to apply · w: program page · g: gross income limit, % of poverty, under broad-based
   categorical eligibility (no g: the federal 130% test and the asset limit apply) · g2: [higher %, who]
   · as: asset limit when the state keeps one ("snap" = the federal limit)
   Sources: USDA FNA SNAP State Directory (fna.usda.gov/snap/state-directory) and the USDA BBCE chart,
   November 2026 (fna.usda.gov/snap/broad-based-categorical-eligibility). Checked 2026-11-18. */
export const STATES = {
  AK: { n: "Alaska", p: "Food Stamp Program", ph: "907-465-3347", ap: "https://alaskaconnect.ilinx.com/engage/dpa", w: "https://health.alaska.gov/en/division-of-public-assistance/", g: 200 },
  AL: { n: "Alabama", p: "Food Assistance Program", ph: "334-242-1700", ap: "https://mydhr.alabama.gov/", w: "https://dhr.alabama.gov/food-assistance/", g: 130 },
  AR: { n: "Arkansas", ph: "855-372-1084", ap: "https://access.arkansas.gov/Learn/Home", w: "https://humanservices.arkansas.gov/divisions-shared-services/county-operations/supplemental-nutrition-assistance-snap/", g: 130, g2: [165, "senior"], as: 5500 },
  AZ: { n: "Arizona", p: "Nutrition Assistance", ph: "855-777-8590", ap: "https://www.healthearizonaplus.gov/", w: "https://des.az.gov/na", g: 200 },
  CA: { n: "California", b: "CalFresh", ph: "877-847-3663", ap: "https://benefitscal.com/", w: "https://cdss.ca.gov/inforesources/calfresh", g: 200 },
  CO: { n: "Colorado", ph: "800-536-5298", ap: "https://peak.my.site.com/peak/s/benefit-information/benefit-detail?language=en_US&category=food-assistance-programs", w: "https://cdhs.colorado.gov/snap", g: 200 },
  CT: { n: "Connecticut", ph: "855-626-6632", ap: "https://www.connect.ct.gov/access/jsp/access/Home.jsp", w: "https://portal.ct.gov/DSS/SNAP/Supplemental-Nutrition-Assistance-Program---SNAP", g: 200 },
  DC: { n: "District of Columbia", ph: "202-724-5506", ap: "https://districtdirect.dc.gov/ua/", w: "https://dhs.dc.gov/service/supplemental-nutrition-assistance-program-snap", g: 200 },
  DE: { n: "Delaware", p: "Food Supplement Program", ph: "800-372-2022", ap: "https://assist.dhss.delaware.gov/", w: "https://dhss.delaware.gov/dss/division-of-social-services/snap/", g: 200 },
  FL: { n: "Florida", p: "Food Assistance Program", ph: "866-762-2237", ap: "https://www.myflfamilies.com/services/public-assistance/applying-for-assistance", w: "https://www.myflfamilies.com/services/public-assistance", g: 200 },
  GA: { n: "Georgia", p: "Georgia Food Stamp Program", ph: "877-423-4746", ap: "https://dfcs.georgia.gov/services/snap", w: "https://dfcs.georgia.gov/snap-food-stamps", g: 130 },
  GU: { n: "Guam", ph: "671-735-7245", ap: "https://mybenefits.guam.gov/#/home", g: 165 },
  HI: { n: "Hawaii", ph: "855-643-1643", ap: "https://pais-benefits.dhs.hawaii.gov/", w: "https://humanservices.hawaii.gov/bessd/snap/", g: 200 },
  IA: { n: "Iowa", p: "Food Assistance", ph: "877-347-5678", ap: "https://hhsservices.iowa.gov/apspssp/ssp.portal", w: "https://hhs.iowa.gov/assistance-programs/food-assistance/snap", g: 160 },
  ID: { n: "Idaho", p: "Food Stamps", ph: "877-456-1233", ap: "https://healthandwelfare.idaho.gov/services-programs/food-assistance/about-snap" },
  IL: { n: "Illinois", ph: "800-843-6154", ap: "https://abe.illinois.gov/access/", w: "https://www.dhs.state.il.us/page.aspx?item=30357", g: 165 },
  IN: { n: "Indiana", ph: "800-403-0864", ap: "https://fssabenefits.in.gov/bp/", w: "https://www.in.gov/fssa/dfr/snap-food-assistance/" },
  KS: { n: "Kansas", p: "Food Assistance Program", ph: "888-369-4777", ap: "https://cssp.kees.ks.gov/apspssp/sspNonMed.portal", w: "https://www.dcf.ks.gov/services/ees/Pages/Food/FoodAssistance.aspx" },
  KY: { n: "Kentucky", ph: "855-306-8959", ap: "https://kynect.ky.gov/benefits/s/?language=en_US", g: 200 },
  LA: { n: "Louisiana", ph: "888-524-3578", ap: "https://ldh.la.gov/page/how-to-apply", w: "https://ldh.la.gov/supplemental-nutrition-assistance-program", g: 200, as: "snap" },
  MA: { n: "Massachusetts", ph: "877-382-2363", ap: "https://dtaconnect.eohhs.mass.gov/apply", w: "https://www.mass.gov/snap-benefits-food-stamps", g: 200 },
  MD: { n: "Maryland", ph: "800-332-6347", ap: "https://mydhrbenefits.dhr.state.md.us/dashboardClient/#/register", w: "https://dhs.maryland.gov/supplemental-nutrition-assistance-program/", g: 200 },
  ME: { n: "Maine", ph: "800-442-6003", ap: "https://www.mymaineconnection.gov/benefits/s/?language=en_US", w: "https://www.maine.gov/dhhs/ofi/programs-services/food-supplement", g: 200 },
  MI: { n: "Michigan", p: "Food Assistance Program", ph: "844-464-3447", ap: "https://newmibridges.michigan.gov", w: "https://www.michigan.gov/en/mdhhs/assistance-programs/food", g: 200 },
  MN: { n: "Minnesota", ph: "800-657-3698", ap: "https://mnbenefits.mn.gov/", w: "https://mn.gov/dhs/mnfoodhelper/", g: 200 },
  MO: { n: "Missouri", ph: "855-373-4636", ap: "https://dss.mo.gov/food-assistance/apply-for-snap" },
  MS: { n: "Mississippi", ph: "800-948-3050", ap: "https://www.mdhs.ms.gov/help/snap/" },
  MT: { n: "Montana", ph: "888-706-1535", ap: "https://apply.mt.gov/", w: "https://dphhs.mt.gov/hcsd/SNAP", g: 200 },
  NC: { n: "North Carolina", p: "Food and Nutrition Services", ph: "866-719-0141", ap: "https://epass.nc.gov/", w: "https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps", g: 200 },
  ND: { n: "North Dakota", ph: "800-755-2716", ap: "https://www.hhs.nd.gov/applyforhelp", w: "https://www.hhs.nd.gov/applyforhelp/snap", g: 200 },
  NE: { n: "Nebraska", ph: "800-383-4278", ap: "https://accessnebraska.ne.gov/", w: "https://dhhs.ne.gov/Pages/SNAP.aspx", g: 165, as: 25000 },
  NH: { n: "New Hampshire", ph: "603-271-9700", ap: "https://nheasy.nh.gov/", w: "https://www.dhhs.nh.gov/programs-services/food-meals-assistance/supplemental-nutrition-assistance-program-snap", g: 200 },
  NJ: { n: "New Jersey", ph: "800-792-9773", ap: "https://mynjhelps.gov/home", w: "https://www.nj.gov/humanservices/dfd/programs/njsnap/", g: 185 },
  NM: { n: "New Mexico", ph: "855-309-3766", ap: "https://yes.nm.gov/nmhr/s/?language=en_US", w: "https://www.hsd.state.nm.us/lookingforassistance/supplemental_nutrition_assistance_program__snap/", g: 200 },
  NV: { n: "Nevada", ph: "800-992-0900", ap: "https://accessnevada.nv.gov/public/landing-page", w: "https://www.dss.nv.gov/programs/snap/", g: 200 },
  NY: { n: "New York", ph: "800-342-3009", ap: "https://mybenefits.ny.gov/", w: "https://otda.ny.gov/programs/snap/", g: 130, g2: [200, "care"] },
  OH: { n: "Ohio", ph: "866-244-0071", ap: "https://ssp.benefits.ohio.gov/apspssp/ssp.portal", g: 130 },
  OK: { n: "Oklahoma", ph: "405-487-5483", ap: "https://www.okdhslive.org/", w: "https://oklahoma.gov/okdhs/services/snap.html", g: 130 },
  OR: { n: "Oregon", ph: "800-723-3638", ap: "https://one.oregon.gov/", w: "https://www.oregon.gov/odhs/food/Pages/snap.aspx", g: 200 },
  PA: { n: "Pennsylvania", ph: "800-692-7462", ap: "https://www.compass.dhs.pa.gov/home/#/", w: "https://www.pa.gov/agencies/dhs/resources/snap", g: 200 },
  PR: { n: "Puerto Rico", ap: "https://www.adsef.pr.gov/", nap: 1 },
  RI: { n: "Rhode Island", ph: "855-697-4347", ap: "https://healthyrhode.ri.gov/", g: 185 },
  SC: { n: "South Carolina", ph: "800-616-1309", ap: "https://benefitsportal.dss.sc.gov/#/login", w: "https://dss.sc.gov/assistance-programs/snap/", g: 130 },
  SD: { n: "South Dakota", ph: "877-999-5612", ap: "https://eaportal.sd.gov/", w: "https://dss.sd.gov/economicassistance/snap.aspx" },
  TN: { n: "Tennessee", ph: "866-311-4287", ap: "https://onedhs.tn.gov/csp?id=start_snap_application" },
  TX: { n: "Texas", ph: "877-541-7905", ap: "https://www.yourtexasbenefits.com/Learn/Home#tab-apply", w: "https://www.hhs.texas.gov/services/food/snap-food-benefits", g: 165, as: 5000 },
  UT: { n: "Utah", p: "Food Stamps", ph: "866-526-3663", ap: "https://jobs.utah.gov/mycase-app/ui/home", w: "https://jobs.utah.gov/customereducation/services/foodstamps/index.html" },
  VA: { n: "Virginia", ph: "800-552-3431", ap: "https://commonhelp.virginia.gov/access/", g: 200 },
  VI: { n: "Virgin Islands", ph: "340-774-2399", ap: "https://www.fna.usda.gov/snap/snap-directory-entry/Virgin%20Islands", g: 200 },
  VT: { n: "Vermont", b: "3SquaresVT", ph: "800-479-6151", ap: "https://dcf.vermont.gov/esd/applicants/mybenefits", w: "https://dcf.vermont.gov/benefits/3SquaresVT", g: 185 },
  WA: { n: "Washington", p: "Basic Food", ph: "877-501-2233", ap: "https://www.washingtonconnection.org", w: "https://www.dshs.wa.gov/family-food-and-housing-services/food-assistance/basic-food-benefits", g: 200 },
  WI: { n: "Wisconsin", b: "FoodShare", ph: "800-362-3002", ap: "https://www.dhs.wisconsin.gov/forwardhealth/apply.htm", w: "https://www.dhs.wisconsin.gov/foodshare/index.htm", g: 200 },
  WV: { n: "West Virginia", ph: "877-716-1212", ap: "https://www.wvpath.wv.gov/", w: "https://bfa.wv.gov/snap", g: 200 },
  WY: { n: "Wyoming", ph: "307-777-7564", ap: "https://dfs.wyo.gov/assistance-programs/food-assistance/supplemental-nutrition-assistance-program-snap/snap-how-to-apply-and-frequently-used-forms/" },
};
/* The name to use in text: the state's own program name where people know it by that, else SNAP */
export const snapName = st => (st && STATES[st]?.b) || (st === "PR" ? "PAN" : "SNAP");
export const stateName = st => STATES[st]?.n || "";

/* FY2027 SNAP maximum allotments (Oct 1 2026 to Sep 30 2027), USDA COLA memo. Alaska shows the urban
   (Anchorage) table; rural Alaska gets more, and the Help tab says so. */
const MAXES = {
  us: [[306, 562, 808, 1023, 1217, 1463, 1616, 1841], 225],
  AK: [[392, 718, 1032, 1306, 1555, 1868, 2064, 2352], 287],
  HI: [[496, 910, 1307, 1655, 1969, 2367, 2615, 2979], 364],
};
/* HHS 2026 poverty guidelines (annual): 48 states + DC, Alaska, Hawaii */
const FPL = { us: [15960, 5680], AK: [19950, 7100], HI: [18360, 6530] };
/* FY2027 SNAP asset limits, for states that keep the asset test */
export const ASSETS = { base: 3000, older: 4750 };

/* USDA FNS, SNAP FY2027 cost-of-living adjustments, 48 states + DC (Oct 1 2026 to Sep 30 2027)
   https://www.usda.gov/sites/default/files/guidance-documents/fna.snap-cola2027.pdf */

/* HHS 2026 poverty guidelines, 48 states + DC: $15,960 plus $5,680 per extra person (annual). */
export const fplMonth = (n, st) => { const [b, a] = FPL[st] || FPL.us; return (b + a * (Math.max(1, n) - 1)) / 12; };

export const SNAP = {
  max: (n, st) => { const [m, add] = MAXES[st] || MAXES.us; return n <= 8 ? m[Math.max(1, n) - 1] : m[7] + (n - 8) * add; },
  /* California uses broad-based categorical eligibility: gross income up to 200% of poverty.
     (CDSS CalFresh income guidelines.) Households with someone 60+ or disabled who are over that
     can still qualify on the net income test, so we say "maybe" instead of "no". */
  grossLimit: (n, st = "CA") => Math.round(fplMonth(n, st) * (STATES[st]?.g || 130) / 100),
  /* a higher limit some homes get (NY: dependent care costs; AR: someone 60+ or disabled) */
  grossLimit2: (n, st) => STATES[st]?.g2 ? Math.round(fplMonth(n, st) * STATES[st].g2[0] / 100) : 0,
};
/* WIC: 185% of poverty, May 1 2026 to Jun 30 2027 (USDA WIC income eligibility guidelines).
   Anyone on Medi-Cal, CalFresh or CalWORKs meets the income rule automatically. */
export const WIC = { limit: (n, st) => Math.round(fplMonth(n, st) * 1.85) };
/* SUN Bucks (Summer EBT), California 2026: $120 per child. CDSS SUN Bucks FAQ. */
export const SUN_BUCKS = 120;

export const LINKS = {
  calfresh_apply: "https://benefitscal.com/",
  getcalfresh: "https://www.getcalfresh.org/",
  wic: "https://myfamily.wic.ca.gov/",
  sunbucks: "https://www.cdss.ca.gov/sunbucks",
  sd211: "https://211sandiego.org/",
  sdfb: "https://www.sandiegofoodbank.org/get-food/",
  fsd: "https://feedingsandiego.org/find-food/",
  ais: "https://www.sandiegocounty.gov/content/sdc/hhsa/programs/ais/Older-Adults/Meals-Senior-Dining.html",
  marketmatch: "https://marketmatch.org/",
  rmp: "https://www.sandiegocounty.gov/hhsa/programs/ssp/restaurant_meals_program/",
  hr1: "https://cdss.ca.gov/benefits-services/food-nutrition-services/calfresh/frequently-asked-questions",
};
export const PHONES = {
  sd211: "211",
  sdfb: "866-350-3663",
  fsd: "858-452-3663",
  county: "866-262-9881",   // San Diego County Access Customer Service Center (CalFresh)
  ais: "800-339-4661",      // Aging & Independence Services (meals for 60+)
  wic: "888-942-9675",      // California WIC
  sunbucks: "877-328-9677", // SUN Bucks helpline
};
