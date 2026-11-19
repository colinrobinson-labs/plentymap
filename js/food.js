/* Recipes and ingredients: costs, nutrition, kitchen and diet checks, amounts in plain units. */
import { S, fetchJSON, ingName, unitName, num, activeCuisine, t } from "./core.js";

let F = null;
export async function food() {
  if (F) return F;
  F = await fetchJSON("data/food.json");
  F.byId = Object.fromEntries(F.recipes.map(r => [r.id, r]));
  F.slotB = new Set(F.slots.b); F.slotL = new Set(F.slots.l);
  return F;
}
export const I = id => F.ing[id];
export const price = id => S.prices[id] ?? F.ing[id].p;

/* What a kitchen can do. kit holds any of: stove (stove + oven), hotplate, micro. Empty = no heat.
   Without a fridge, only recipes made entirely from things that keep at room temperature. */
export const needsCold = r => r._c ??= r.ing.some(([id]) => F.ing[id]?.cold);
export function canCook(r, kit = S.kit, fridge = S.fridge) {
  if (!fridge && needsCold(r)) return false;
  if (r.req === "none") return true;
  if (r.req === "micro") return kit.includes("micro");
  if (r.req === "burner") return kit.includes("stove") || kit.includes("hotplate");
  if (r.req === "oven") return kit.includes("stove");
  return false;
}

const flagsOf = r => r.ing.map(([id]) => F.ing[id]?.fl || "").join("");
export function facts(r) {
  if (r._f) return r._f;
  let k = 0, p = 0;
  for (const [id, q] of r.ing) { const x = F.ing[id]; k += x.g * q * x.kcal / 100; p += x.g * q * x.pro / 100; }
  const fl = flagsOf(r);
  const veg = !/[mf]/.test(fl), vegan = veg && !/[edx]/.test(fl);
  return (r._f = { kcal: Math.round(k / r.serves / 10) * 10, pro: Math.round(p / r.serves), veg, vegan });
}
/* Diet and allergen checks. Tags per ingredient (tools/diet-tags.py): G gluten, g gluten unless you buy the
   gluten-free kind, O oats (buy certified gluten-free), D dairy, E egg, P peanut, S soy, s often soy,
   F fish or shellfish, M meat, K often not kosher. */
const tagsOf = r => r._t ??= r.ing.map(([id]) => F.ing[id]?.al || "").join("");
const has = (r, id) => r.ing.some(([x]) => x === id);
export const LOW_NA = 600; // mg per serving, before any salt you add
export const sodium = r => r._na ??= Math.round(r.ing.reduce((s, [id, q]) => s + F.ing[id].g * q * F.ing[id].na / 100, 0) / r.serves);
export const AVOIDS = ["gluten", "dairy", "egg", "peanut", "soy", "fish", "salt"];
const AV = { gluten: "G", dairy: "D", egg: "E", peanut: "P", soy: "S", fish: "F" };
export function dietOk(r, d = S.diet, avoid = S.avoid) {
  const f = facts(r), tg = tagsOf(r);
  if (d === "veg" && !f.veg) return false;
  if (d === "vegan" && !f.vegan) return false;
  if (d === "kosher" && (tg.includes("K") || (tg.includes("M") && tg.includes("D")))) return false;
  for (const a of avoid) if (a === "salt" ? sodium(r) > LOW_NA : tg.includes(AV[a])) return false;
  return true;
}
/* What the recipe contains as written (i18n keys) */
export function contains(r) {
  const tg = tagsOf(r), out = [];
  if (tg.includes("G") || has(r, "soy")) out.push("al_gluten"); // soy sauce is brewed with wheat
  for (const [k, c] of [["al_dairy", "D"], ["al_egg", "E"], ["al_peanut", "P"], ["al_soy", "S"], ["al_fish", "F"]]) if (tg.includes(c)) out.push(k);
  return out;
}
/* Buying notes for the diet someone picked (i18n keys) */
export function dietNotes(r, d = S.diet, avoid = S.avoid) {
  const tg = tagsOf(r), out = [];
  if (avoid.has("gluten")) {
    if (has(r, "soy")) out.push("note_tamari");
    if (has(r, "bouil")) out.push("note_gf_bouil");
    if (tg.includes("O")) out.push("note_gf_oats");
  }
  if (avoid.has("soy") && tg.includes("s")) out.push("note_soy_label");
  if (d === "halal" && tg.includes("M")) out.push("note_halal_meat");
  if (d === "halal" && (has(r, "bouil") || has(r, "ramen"))) out.push("note_halal_bouil");
  if (d === "kosher") out.push("note_kosher");
  if (avoid.has("salt")) out.push("note_salt");
  return out;
}
/* Cost of what you actually eat, per serving */
export const perServing = r => r.ing.reduce((s, [id, q]) => s + price(id) * q, 0) / r.serves;
export const missing = r => r.ing.filter(([id]) => !S.have.has(id) && F.ing[id].aisle !== "spice" && id !== "oil" && id !== "salt").length;
export const cuisineMatch = r => r.cu.includes(activeCuisine());

/* Friendly amounts: ¾ cup, 2 cans, 6 oz */
const FR = [[0, ""], [.125, "⅛"], [.25, "¼"], [.333, "⅓"], [.5, "½"], [.667, "⅔"], [.75, "¾"], [1, ""]];
export function frac(q) {
  if (q >= 10) return num(Math.round(q));
  let w = Math.floor(q), f = q - w, best = FR[0], d = 9;
  for (const x of FR) { const dd = Math.abs(f - x[0]); if (dd < d) { d = dd; best = x; } }
  if (d > .07) return num(Math.round(q * 10) / 10, 1);
  if (best[0] === 1) { w += 1; best = FR[0]; }
  if (!w && !best[1]) return num(Math.round(q * 100) / 100, 2);
  return (w ? num(w) : "") + best[1];
}
const CUPS = { rice: 2.25, lentils: 2.3, flour: 3.6, oats: 5.3, dbeans: 2.3, peas_d: 2.25, mungb: 2.2, buckwheat: 2.6 };
// counted things: "2 eggs" reads as "2" next to the name "Eggs"
const COUNT = new Set(["egg", "banana", "onion", "lime", "pepper", "tortilla"]);
export function qty(id, q) {
  const u = F.ing[id].u;
  if (CUPS[id]) { const c = q * CUPS[id]; return `${frac(c)} ${unitName("cup", c)}`; }
  if (u === "lb" && q < 0.5) return `${frac(q * 16)} ${unitName("oz", 2)}`;
  if (u === "cup" && q < 0.24) return `${frac(q * 16)} ${unitName("tbsp", 2)}`;
  if (u === "tbsp" && q < 1) return `${frac(q * 3)} ${unitName("tsp", 2)}`;
  if (u === "tsp" && q >= 3 && Math.abs(q / 3 - Math.round(q / 3 * 2) / 2) < 0.05) return `${frac(q / 3)} ${unitName("tbsp", 2)}`;
  if (COUNT.has(u)) return frac(q);
  return `${frac(q)} ${unitName(u, q)}`;
}
/* Package label for the shopping list: "2 lb bag", "15 oz can" */
export function pkgLabel(id) {
  const [n, u] = F.ing[id].pkg;
  return `${frac(n)} ${unitName(u, n)}`;
}
export const name = ingName;

/* Which meal a recipe suits */
export const slotOf = r => F.slotB.has(r.id) ? "b" : F.slotL.has(r.id) && r.serves <= 2 ? "l" : "d";

/* Rank for the Cook tab: your cuisine first, then fewest things to buy, then cheapest */
export function rank(list) {
  return [...list].sort((a, b) => (cuisineMatch(b) - cuisineMatch(a)) || (S.have.size ? missing(a) - missing(b) : 0) || perServing(a) - perServing(b));
}
export const CUISINES = ["american", "latin", "chinese", "vietnamese", "filipino", "middleeast", "haitian", "korean", "easteuro", "brazilian", "afghan", "somali"];
export const tr = t;
