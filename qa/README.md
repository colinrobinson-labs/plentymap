# Plenty Map QA

Automatic checks that keep plentymap.com working in every language, on every screen size, with accurate listings.
Nobody has to run anything: GitHub Actions does it.

## When it runs

| When | What | Blocks? |
| --- | --- | --- |
| Before every publish (`site.yml` calls `qa.yml`, level `gate`) | All 15 languages at 280, 390 and 1440px (dark too at 390), every screen and state, accessibility, our own links | Yes, when a **new** problem of a blocking kind appears |
| Every pull request (`qa.yml`, level `full`) | The full grid: 15 languages x 280/320/390/768/1024/1440 x light/dark | Yes (the check fails) |
| Pull requests and pushes (`qa-visual.yml`) | Screenshots of every screen in every language compared with the approved ones | On pull requests, until someone adds the `visual-ok` label |
| Nightly ~4am Pacific (`qa.yml`, full) | Full grid, outside links, listing data checks, visitor reports | Files issues, never blocks |
| Weekly (scheduled Claude task) | A person-like review of the live site in several languages; files ease-of-use issues and sends Colin a short digest | No |

Emergency: run **Site** by hand with "Emergency only: publish without the QA checks" ticked.

## What it checks

**Every screen** (Cook, filters, a recipe, Budget, meal swap, Find food list/map/free/one place, Benefits and its result,
Settings, Privacy, About, the language picker), **first run** (welcome in the phone's language, "Where are you?", a bad ZIP),
and **trouble states** (listings fail to load, slow loading, unknown recipe, offline, a place outside San Diego, 404, privacy/support pages):

- page scrolls sideways; something sticks out past the edge
- text cut off (ellipsis or hidden overflow) on buttons, links, labels, headings, chips; search hints wider than the box
- text drawn on top of text or icons
- buttons and links smaller than 44x44px (links inside sentences are allowed, as in WCAG 2.5.8)
- Arabic, Dari, Pashto: page is right-to-left, and phone numbers, ZIPs, times and prices keep their digit groups in order (measured on screen, not guessed)
- English left in another language, raw keys (`tab_find`), unfilled `{placeholders}`, `undefined`/`NaN`
- wrong `<html lang>`, broken images, script errors, console errors, missing files
- any request to another company's server (the privacy promise)
- axe-core accessibility rules (WCAG 2.2 AA + best practice), light and dark, phone and desktop
- every link: our pages and files must load; phone links must dial; outside links nightly

**Listings** (`scripts/data-checks.mjs`): shape of every record; pins inside the region, in the right map cell, near their ZIP;
duplicates; phone/ZIP/web formats; schedules that couldn't be read; how old each source is (San Diego nightly, nationwide weekly,
tiles monthly); counts per source/kind/state compared with last night (a drop of 15%+ fails loudly); states that keep far fewer
USDA stores than the national rate; and a nightly spot-check of 15 listings per food bank against the food bank's own live list
(name, pin, street number) plus 25 listing websites.

## What blocks, what doesn't

`lib/labels.mjs` lists the kinds that block (sideways scroll, script errors, missing files, raw keys, RTL digit order,
serious accessibility problems, broken own links, malformed or missing data, and more). Cut-off text, overlaps, small tap targets,
leftover English and outside links are filed as issues but don't stop a publish (they're judged by a heuristic and need a person).

Problems that already existed when the checks started are listed in `known-issues.json`. They still get issues, but only a
**new** problem blocks, so an old flaw can't hold up an unrelated fix. Delete an entry once it's fixed (or let it be: it just stops matching).

## Issues

Each problem group gets one GitHub issue (labels `qa`, `qa:<area>`, `owner:app` or `owner:data`). Runs update it in place
(no comments, so no notification noise) and close it when a full run no longer sees it. Nobody is @mentioned or assigned.

Visitor "report a problem" submissions join the same queue from the report system itself: it re-checks reported listings
nightly and opens a Monday digest issue (labels `qa`, `qa:user-report`, `listing-reports`). Visitor notes never come here
(privacy policy); the nightly QA job only reads the public totals (`scripts/user-reports.mjs`) for the weekly digest.

## Running it on a computer (optional)

```
cd qa && npm ci && npx playwright install chromium
bash build-site.sh _site
QA_QUICK=1 npx playwright test      # 4 languages, 3 widths
npx playwright test                 # everything
node scripts/triage.mjs             # summary + exit code
```
