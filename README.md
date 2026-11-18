# Plenty Map

Find food. Cook cheap. Get help. In your language.

Plenty Map is a free web app and phone app for San Diego County. It shows free food (food banks, pantries, senior boxes, community fridges), stores and farmers markets that take CalFresh, cheap recipes that fit your kitchen, a weekly meal plan with a shopping list, and a quick check for CalFresh, WIC and other help. It works in 15 languages, with no accounts, no ads and no tracking.

Live at **https://plentymap.com**.

## How it is built

- Plain HTML, CSS and JavaScript modules. No build step for the website.
- Everything the phone loads comes from plentymap.com. Food listings, map tiles, fonts and recipes are static files, so no third party sees what people look at.
- Works offline after the first visit (service worker in `sw.js`).

| Folder | What is in it |
| --- | --- |
| `js/`, `css/`, `index.html` | The app |
| `i18n/` | Screen text and recipes per language (`tools/check-i18n.mjs` checks them) |
| `data/regions/` | The San Diego listings file, rebuilt every night |
| `pages/` | Privacy policy and support page (built to `privacy/` and `support/` by `tools/build-pages.py`) |
| `tools/` | Data fetchers, region builder, phone app helpers |

## Automation (GitHub Actions)

| Workflow | When | What it does |
| --- | --- | --- |
| `data.yml` | Nightly | Pulls public listings (San Diego Food Bank, Feeding San Diego, USDA SNAP retailers, OpenStreetMap), saves raw data and map tiles to the `data` branch, rebuilds `data/regions/san-diego.json` |
| `site.yml` | Every change to `main` | Publishes the site, with map tiles, to the `gh-pages` branch that GitHub Pages serves |
| `apps.yml` | Every change to `main` | Builds the Android and iPhone apps with Capacitor. Signed store builds run once signing secrets are added (listed at the top of the file) |

## Run it on a computer

```
node tools/dev-server.mjs 8080
```

Then open http://localhost:8080. Map tiles come from the `data` branch (`tiles/`); copy them into `data/tiles/` to see the map locally.

## Contact

hello@plentymap.com
