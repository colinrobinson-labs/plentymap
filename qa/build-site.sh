#!/usr/bin/env bash
# Builds the same folder site.yml publishes (app + tiles from `data` + US packs from `usdata`),
# so the QA suite tests exactly what visitors get. Usage: qa/build-site.sh <outDir>
set -euo pipefail
OUT="${1:?usage: build-site.sh <outDir>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf "${OUT:?}" && mkdir -p "$OUT"
cp -r index.html manifest.webmanifest sw.js favicon.ico css js i18n icons fonts vendor "$OUT"/
# keep in step with site.yml "Build the site folder"
mkdir -p "$OUT/data" && cp -r data/regions data/food.json "$OUT/data/"
[ -f data/kids.json ] && cp data/kids.json "$OUT/data/"
for d in privacy support terms attributions accessibility legal; do [ -d "$d" ] && cp -r "$d" "$OUT"/; done
cp robots.txt sitemap.xml 404.html "$OUT"/
TMP="$(mktemp -d)"
if git fetch -q --depth 1 origin data 2>/dev/null; then
  git archive FETCH_HEAD tiles | tar -x -C "$TMP"
  day=$(jq -r '.built' "$TMP/tiles/info.json" | cut -c1-10 | tr -d '-')
  mkdir -p "$OUT/data/tiles"
  cp "$TMP/tiles/san-diego.pmtiles" "$OUT/data/tiles/san-diego-$day.pmtiles"
  cp -r "$TMP/tiles/fonts" "$OUT/data/tiles/fonts"
  printf '{"file":"san-diego-%s.pmtiles","built":"%s"}\n' "$day" "$day" > "$OUT/data/tiles/tiles.json"
else echo "::warning::no data branch: map tiles missing"; fi
if git fetch -q --depth 1 origin usdata 2>/dev/null; then
  git archive FETCH_HEAD us | tar -x -C "$OUT/data"
else echo "::warning::no usdata branch: nationwide packs missing"; fi
if git fetch -q --depth 1 origin intldata 2>/dev/null; then
  for c in gb ca; do git archive FETCH_HEAD $c 2>/dev/null | tar -x -C "$OUT/data" || true; done
fi
if git fetch -q --depth 1 origin extradata 2>/dev/null; then
  mkdir -p "$TMP/x" && git archive FETCH_HEAD | tar -x -C "$TMP/x"
  [ -d "$TMP/x/extra" ] && cp -r "$TMP/x/extra" "$OUT/data/extra" && rm -f "$OUT/data/extra/report.json"
  [ -f tools/apply-flags.mjs ] && [ -f "$TMP/x/flags/flags.json" ] && node tools/apply-flags.mjs "$OUT/data" "$TMP/x/flags/flags.json"
fi
rm -rf "${TMP:?}"
du -sh "$OUT"
