/* One glyph per kind of place, used by the list tiles, the category tabs and the map pins.
   The drawings live with the rest of the icon set (icons.js, KIND_GLYPH: plain paths on a 24 grid, so the
   map can draw them with canvas Path2D). KCOL = pin fill on the map. */
import { ico, KIND_GLYPH } from "./icons.js";
export { KIND_GLYPH };
export const KCOL = {
  pantry: "#E0664F", senior: "#6FA3DE", meal: "#B987C7", fridge: "#3FB8BC", store: "#7FC796", market: "#F5C04A",
  rmp: "#D9A3E3", summer: "#F7A35C", garden: "#5FAE6E", givebox: "#E8857A", bakery: "#D9B38C",
};
export const kindIcon = (k, cls = "i") => ico("k_" + (KIND_GLYPH[k] ? k : "pantry"), cls);
