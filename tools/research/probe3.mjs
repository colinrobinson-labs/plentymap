// Debug: what the LA, Orange County and Philabundance find-food pages load.
const UA = "PlentyMapDataBot/1.0 (free food-help app; weekly US build; https://plentymap.com)";
for (const u of ["https://www.lafoodbank.org/find-food/pantry-locator/", "https://feedoc.org/need-food/", "https://www.philabundance.org/find-food/"]) {
  try {
    const t = await (await fetch(u, { headers: { "User-Agent": UA } })).text();
    console.log("=====", u, t.length);
    for (const rx of [/[^"'\s]*storepoint[^"'\s]*/g, /wpslSettings\s*=\s*\{[^;]{0,1500}/g, /wpsl[A-Za-z_]*\s*=\s*\{[^;]{0,600}/g, /data-[a-z-]*map[a-z-]*=["'][^"']+["']/g, /store_search[^"']{0,200}/g, /admin-ajax[^"']{0,100}/g])
      console.log(rx.source.slice(0, 30), [...new Set((t.match(rx) || []))].slice(0, 8));
  } catch (e) { console.log(u, e.message); }
}
