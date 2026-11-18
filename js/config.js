/* Where the big files live. The app, data and label fonts sit next to the app (the phone apps carry
   them inside). The US street map is one large file on our own tiles host (Cloudflare R2), read in
   small ranges, never from a third party. The San Diego file on the site is the fallback. */
export const SITE = "https://plentymap.com/";
export const TILES = "https://tiles.plentymap.com/";
const isNative = !!window.Capacitor?.isNativePlatform?.();
export const CONFIG = {
  dataBase: isNative ? SITE : "",
  contact: "hello@plentymap.com",
};

/* Countries. Every price, budget and benefit amount is formatted through the active market's
   currency, never a hardcoded symbol. Only the US is live; see docs/adding-a-country.md. */
export const MARKETS = {
  US: { currency: "USD", units: "us", prices: "data/food.json", benefits: "us" },
};
export const MARKET = MARKETS.US;
