# Adding a region or a country

Plenty Map is built so a new place is mostly data, not code. This note covers what a new US
region needs, then what a new country needs on top of that.

## How money works today

- Every price, budget and benefit amount goes through `money()` in `js/core.js`. It formats with
  `Intl.NumberFormat` in the reader's language, using the active market's currency from
  `js/config.js` (`MARKETS`). The code never writes a currency symbol.
- Amounts inside translated sentences use a placeholder, for example `{m}` in `mm_p`, filled with
  `money(...)`. Never type "$10" into a translation.
- `data/food.json` and `data/regions/index.json` record `country` and `currency`.
- Live: `US` / `USD`. Data built, app wiring in progress: `GB` / `GBP`, `CA` / `CAD`.

## A new US region (county or metro)

1. **Food sites.** Use the food bank's own published pantry list as the main source. A partner
   feed is the most trusted: the food bank's locator export, or a file they send us. Add a reader
   in `tools/fetch-sources.mjs` with the source's name, URL and phone in `sources`. Other sources,
   such as OpenStreetMap, rank below partner feeds and are flagged "call first" by default.
2. **Freshness.** Each listing keeps the date the source last changed it, or the date we last saw
   it unchanged. Listings past the stale limit get flagged and sorted lower. Every card names its
   source and has a call-ahead number: the site's own, or the source food bank's, or 211.
3. **Stores.** SNAP and EBT stores come from the USDA retailer data, which covers every state.
4. **Places.** ZIPs come from the Census ZCTA gazetteer. Neighborhood names come from
   OpenStreetMap.
5. **Benefits.** SNAP amounts are federal, with Alaska and Hawaii set separately. Income limits,
   apply links, phone numbers, WIC and Summer EBT are per state. Keep them in a state table with
   the source URL and an "as of" date next to every figure.
6. **Map.** Use per-region tile files (PMTiles) built from the Protomaps daily build.
7. **Check.** Run the audit scripts (layout, accessibility, offline) before the region goes live.

## A new country

On top of the region steps:

| Area | What changes | Where |
|---|---|---|
| Currency | Add `{ currency: "CAD" }` (ISO 4217) to `MARKETS` and pick the market from the region file | `js/config.js`, region index |
| Prices | A price file per country with the same ingredient ids, a source for every price, and an as-of date | `data/prices/<country>.json`, loaded in place of `food.json` prices |
| Units | Metric markets show g, kg, ml and l instead of lb, oz and cups. `units` in `MARKETS` switches `qty()` and `pkgLabel()` | `js/food.js` |
| Package sizes | Local typical packs (400 g tins, 1 kg rice) | price file |
| Ingredients | Some swaps (for example canned beans are less common in some countries) | `data/food.json` plus recipe notes |
| Benefits | A benefits module per country: programs, eligibility, amounts, phones, links, as-of dates. The Help tab reads from it, and the US module is `js/benefits.js` | `js/benefits/<country>.js` |
| Emergency help line | 211 is the US and Canada. Use the local equivalent | benefits module |
| Food sites | National food bank networks (for example Food Banks Canada, the Trussell Trust in the UK) as partner feeds | `tools/fetch-sources.mjs` |
| Languages | Add any languages common in that country, and review existing translations for local wording | `i18n/` |
| Privacy | Check local privacy law (GDPR, PIPEDA). The app stores nothing on servers, but the policy must name the country's rules | `pages/privacy.md` |
| Dates, numbers | Already locale-aware through `Intl` | no change |

## Order of work for a new country

1. Pick the pilot city and a partner food bank.
2. Price file with sources, and the metric units switch.
3. Benefits module, reviewed by someone who helps people apply locally.
4. Food-site feed and freshness rules.
5. Map tiles.
6. Translation review, privacy review, full audit, then launch.

## What's built for the United Kingdom and Canada (Nov 2026)

| Piece | Where | Notes |
|---|---|---|
| Country registry | `js/country.js` | Currency, distance unit (mi in US/UK, km in Canada), time zone, help line, food bank finder, postcode parsing, regions, `countriesAt()` for GPS, `countriesOfPostcode()` for search |
| Fetch | `tools/fetch-intl.mjs GB\|CA <raw>` | GB: Give Food API. CA: DataBC Food Banks, City of Vancouver free and low cost food programs. Both: OpenStreetMap (food banks, fridges, soup kitchens, branded supermarkets), GeoNames postcodes and places |
| Build | `tools/build-intl.mjs GB\|CA <raw> <out>` | Same 0.5° cell format as `data/us`, plus `cc` and `tz` in every cell, `pc/` postcode files and `places/` |
| Workflow | `.github/workflows/intl-data.yml` | Daily (Give Food's terms ask for fresh data). OpenStreetMap is cached and re-asked weekly. Saves to the `intldata` branch from `main` only; `site.yml` copies `gb/` and `ca/` into `/data/` |
| Benefits | `js/benefits/gb.js`, `js/benefits/ca.js` | Data with a source and as-of date for every figure, plus a `quickCheck()` each. `.github/workflows/links.yml` checks every link monthly |
| Map tiles | `.github/workflows/tiles.yml` | One job per country. `TILE_COUNTRIES` repository variable picks which (default `us`). Files `gb-<day>-z14.pmtiles`, `ca-<day>-z13.pmtiles`, pointers `tiles-gb.json`, `tiles-ca.json` |
| Outlines | `tools/regions/gb.geojson`, `tools/regions/ca.geojson` | Rough polygons for the tile cut (leave out Ireland, France, the Channel Islands) |

### Postcodes and privacy

- **UK:** GeoNames lists every postcode; the build keeps only sector ("SW2 3") and district ("SW2")
  centres. A full postcode typed on the phone is matched to its sector. Northern Ireland is included.
- **Canada:** only the first three characters (the FSA) are kept and looked up. Full postal codes are
  Canada Post's data and aren't needed: an FSA is a neighbourhood in cities.
- Jersey, Guernsey and the Isle of Man are left out: Give Food lists them, but they're not in the UK
  benefits system.

### Differences the app has to handle

1. **Referrals (UK).** Most UK food banks give food against a referral. UK pantry listings carry
   `ref: 1`; cards should say "usually needs a referral" and point to the nation's help line.
2. **No 211 in the UK.** Use `helpline(reg)` from `js/benefits/gb.js`: Help through Hardship (England,
   Wales), Money Talk Team (Scotland), Make the Call (Northern Ireland). Canada has 211 everywhere.
3. **Time zones.** Canada spans six. Each cell file has `tz`; opening hours and "open now" must use it,
   not `America/Los_Angeles`.
4. **Distance.** Kilometres in Canada (`distText()` in `js/country.js`; needs a `dist_km` string).
5. **Regions, not states.** `zips` entries in cells are `[lat, lon, town, region]` where region is
   `ENG/SCT/WLS/NIR` or a province code, so the existing nearest-ZIP logic finds the region.
6. **Stores.** No SNAP list. Stores are branded supermarkets from OpenStreetMap with a price tier from
   the brand (discounters first). In the UK, Healthy Start cards work in any shop that takes Mastercard
   and sells the eligible foods, so it's a note, not a per-store badge.
7. **Partner sources.** None yet in either country (Give Food, DataBC and Vancouver are open data, not
   partners), so every listing is "call first".
8. **Languages.** Quebec needs French (`i18n/fr.json`). The UK list in `js/country.js` names Welsh,
   Polish, Urdu and others for later.
