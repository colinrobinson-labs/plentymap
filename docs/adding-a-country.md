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
- Only `US` / `USD` is live.

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
