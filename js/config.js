/* Where the big map files live. On the website they sit next to the app. The phone apps carry
   everything except the 85 MB map tiles, which they read from our own site (never a third party). */
export const SITE = "https://plentymap.com/";
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
