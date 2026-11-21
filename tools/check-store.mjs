// Store text must fit each store's limits, or the upload is refused. Runs in the apps workflow.
// Usage: node tools/check-store.mjs
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const root = new URL("../store", import.meta.url).pathname;
const LIMITS = {
  apple: { "name.txt": 30, "subtitle.txt": 30, "keywords.txt": 100, "promotional_text.txt": 170, "description.txt": 4000,
           "review_notes.txt": 4000, "testflight_what_to_test.txt": 4000, "support_url.txt": 255, "marketing_url.txt": 255, "privacy_url.txt": 255 },
  play:  { "title.txt": 30, "short_description.txt": 80, "full_description.txt": 4000 },
};
const len = s => [...s].length; // stores count characters, not bytes
let bad = 0;
for (const [store, lim] of Object.entries(LIMITS)) {
  for (const loc of await readdir(join(root, store))) {
    for (const [f, max] of Object.entries(lim)) {
      let s; try { s = (await readFile(join(root, store, loc, f), "utf8")).replace(/\n+$/, ""); } catch { if (loc === "en-US") { console.error(`missing ${store}/${loc}/${f}`); bad++; } continue; }
      const n = len(s);
      if (!n || n > max) { console.error(`${store}/${loc}/${f}: ${n} characters (limit ${max})`); bad++; }
      if (f === "keywords.txt" && /,\s|\s,/.test(s)) { console.error(`${store}/${loc}/${f}: no spaces around commas (they count against the limit)`); bad++; }
      if (/_url\.txt$/.test(f) && !/^https:\/\/\S+$/.test(s)) { console.error(`${store}/${loc}/${f}: not an https link`); bad++; }
      if ((f === "title.txt" || f === "name.txt") && /\b(free|best|#1|top)\b/i.test(s)) { console.error(`${store}/${loc}/${f}: stores refuse words like "free" or "best" in the name`); bad++; }
    }
  }
}
if (bad) process.exit(1);
console.log("store text OK");
