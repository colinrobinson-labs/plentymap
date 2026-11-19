// Food bank pantry lists outside San Diego County that the weekly US build reads.
// Each one is the public list behind the food bank's own "find food" map on its own website,
// read the same way that map reads it. Before adding one, check:
//   - robots.txt allows the page and the data call (tools/fetch-pantries.mjs checks again every run)
//   - the website's terms don't forbid reuse, and the platform's terms don't either
//     (Vivery and Plentiful forbid it: those need a partnership, see docs/pantry-sources.md)
// Fields: id (short, stable, used in listing ids), name, st (main state); the main phone comes from Feeding America's list each run,
//   page (the find-food page), platform, and options: ignoreHours (the structured hours are office hours, not food hours),
//   notFood (a regex of listing names that aren't food sites).
export const SOURCES = [
  // ---- Storepoint (the same platform as the San Diego food banks) ----
  { id: "lafb", name: "Los Angeles Regional Food Bank", st: "CA", page: "https://www.lafoodbank.org/find-food/pantry-locator/", platform: "storepoint" },
  { id: "shoc", name: "Second Harvest Food Bank of Orange County", st: "CA", page: "https://feedoc.org/need-food/", platform: "storepoint" },
  // ---- WP Store Locator (WordPress plugin on the food bank's own site) ----
  { id: "phila", name: "Philabundance", st: "PA", page: "https://www.philabundance.org/find-food/", platform: "wpsl" },
  { id: "gsfb", name: "Good Shepherd Food Bank", st: "ME", page: "https://www.gsfb.org/food-map/", platform: "wpsl" },
  { id: "cbfb", name: "Coastal Bend Food Bank", st: "TX", page: "https://coastalbendfoodbank.org/get-help/find-food/", platform: "wpsl" },
  { id: "ftv", name: "Feeding the Valley Food Bank", st: "GA", page: "https://feedingthevalley.org/locate-a-food-pantry-near-you/", platform: "wpsl" },
  { id: "fbnela", name: "Food Bank of Northeast Louisiana", st: "LA", page: "https://foodbanknela.org/find-food-now/", platform: "wpsl" },
  { id: "fbwm", name: "Food Bank of Western Massachusetts", st: "MA", page: "https://www.foodbankwma.org/get-help/food-finder/", platform: "wpsl" },
  { id: "wcfb", name: "Worcester County Food Bank", st: "MA", page: "https://foodbank.org/find-food/", platform: "wpsl", ignoreHours: true },   // its hours field is office hours; the description has the pantry hours
  { id: "shlv", name: "Second Harvest Food Bank of Lehigh Valley and NE Pennsylvania", st: "PA", page: "https://secondharvestlv.org/find-food/", platform: "wpsl" },
  { id: "fh", name: "Forgotten Harvest", st: "MI", page: "https://www.forgottenharvest.org/find-food/", platform: "wpsl" },
  // ---- Store Locator Plus ----
  { id: "ghfb", name: "Golden Harvest Food Bank", st: "GA", page: "https://goldenharvest.org/find-help/food-pantry-finder/", platform: "slp" },
  { id: "tcfb", name: "Treasure Coast Food Bank", st: "FL", page: "https://stophunger.org/food-finder/", platform: "slp" },
  { id: "rvrfb", name: "River Valley Regional Food Bank", st: "AR", page: "https://www.rvrfoodbank.org/get-help/pantry-locator/", platform: "slp" },
  { id: "shsga", name: "Second Harvest of South Georgia", st: "GA", page: "https://feedingsga.org/find-help/", platform: "slp" },
  { id: "fbem", name: "Food Bank of Eastern Michigan", st: "MI", page: "https://www.fbem.org/find-food/", platform: "slp" },
  { id: "shsenc", name: "Second Harvest Food Bank of Southeast North Carolina", st: "NC", page: "https://hungercantwait.org/find-help/find-food/", platform: "slp" },
  { id: "fbrgv", name: "Food Bank of the Rio Grande Valley", st: "TX", page: "https://foodbankrgv.com/findfood/", platform: "slp" },
  // ---- Agile Store Locator ----
  { id: "fulfill", name: "Fulfill", st: "NJ", page: "https://fulfillnj.org/get-help/locate-a-pantry-or-soup-kitchen/", platform: "agile" },
  { id: "foodshare", name: "Food Share", st: "CA", page: "https://foodshare.com/find-help/", platform: "agile" },
  { id: "idfb", name: "The Idaho Foodbank", st: "ID", page: "https://idahofoodbank.org/getfood/", platform: "agile" },
  { id: "lcfb", name: "Lowcountry Food Bank", st: "SC", page: "https://lowcountryfoodbank.org/find-food/pantry/", platform: "agile" },
  { id: "foodlink", name: "Foodlink", st: "NY", page: "https://foodlinkny.org/find-food/", platform: "agile" },
  { id: "shecin", name: "Second Harvest Food Bank of East Central Indiana", st: "IN", page: "https://curehunger.org/get-help/", platform: "agile" },
  // ---- StoreRocket ----
  { id: "shmt", name: "Second Harvest Food Bank of Middle Tennessee", st: "TN", page: "https://www.secondharvestmidtn.org/find-resources/find-food/", platform: "storerocket" },
  { id: "ih", name: "Island Harvest", st: "NY", page: "https://www.islandharvest.org/find-help/find-a-food-pantry/", platform: "storerocket" },
  // ---- Google My Maps ----
  { id: "hfb", name: "Hawaii Foodbank", st: "HI", page: "https://hawaiifoodbank.org/get-help/find-food/", platform: "mymaps" },
  { id: "iffs", name: "Inter-Faith Food Shuttle", st: "NC", page: "https://foodshuttle.org/findfood/", platform: "mymaps" },
  { id: "gpfb", name: "Great Plains Food Bank", st: "ND", page: "https://greatplainsfoodbank.org/get-help/partner-food-pantries/", platform: "mymaps" },
];
