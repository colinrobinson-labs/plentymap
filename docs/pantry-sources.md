# Food bank pantry lists (outside San Diego County)

The weekly US build (`.github/workflows/us-data.yml`) adds food banks' own pantry lists to the
OpenStreetMap pins. The phone never calls any of these sites; GitHub Actions reads them once a week.

| Step | File |
|---|---|
| Which food banks, and how each one's map is read | `tools/pantry-sources.mjs` |
| Download each list (checks robots.txt for every page and data call) | `tools/fetch-pantries.mjs` |
| Turn the lists into map listings (hours, filters, de-duplication) | `tools/build-pantries.mjs` |
| Merge into the US packs, drop OpenStreetMap pins for the same place | `tools/build-us.mjs` |

## Rules for adding a food bank

1. The list must be the public one behind the food bank's own "find food" map, on its own website.
2. robots.txt must allow the page and the data call. The fetcher checks again every run and skips a
   list it isn't allowed to read.
3. Neither the website's terms nor the map platform's terms may forbid reuse.
   **Vivery and Plentiful forbid it.** Food banks on those platforms need a partnership
   (drafts in the project files: `plenty-map/pantry-sources/partnership-asks.md`).
4. Every listing names the food bank ("Listed by …") and links to its find-food page.
   Its main phone comes from Feeding America's list each run.

## Accuracy safeguards

- Health clinics, farms, farmers markets, clothing and diaper banks, offices and warehouses are dropped.
- Meals only for people already in a program (group homes, camps, scout troops) are dropped.
- Listings marked closed are dropped. Listings placed in the wrong state are dropped.
- A locator's default hours (the same 7-day hours on most rows) are treated as unknown, so the
  listing says to call first.
- Office hours are ignored where a food bank's hours field holds them (`ignoreHours`).
- Schedules the parser can't read fully show as "call first", never as a guessed time.
- A list that shrinks by more than half in a week is treated as a broken page: last week's list is kept.
  A food bank whose site fails keeps last week's list for up to 4 weeks, then drops out.
- KML maps with no coordinates are placed by the U.S. Census geocoder (cached on the usdata branch).

## Platforms supported

Storepoint, WP Store Locator, Store Locator Plus, Agile Store Locator, StoreRocket, Google My Maps (KML).
Still to do: ArcGIS, FreshTrak, custom Mapbox maps, state open-data portals.
