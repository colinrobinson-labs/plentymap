#!/usr/bin/env bash
# Saves files to the extradata branch without losing another job's write.
#   tools/save-extradata.sh "<commit message>" <dir> [folder-to-replace ...]
# <dir> mirrors the branch layout (e.g. <dir>/flags/kids.json). Folders named after <dir> are emptied
# first (places replaces extra/ and raw/ as a whole). The branch stays a single commit; the push is a
# compare-and-swap (--force-with-lease on the commit it started from), so when two jobs save at once the
# later one starts over from the newer branch instead of overwriting it.
set -euo pipefail
msg=$1; src=$(cd "$2" && pwd); shift 2
url="${EXTRADATA_URL:-https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
for i in 1 2 3 4 5 6; do
  w=$(mktemp -d); cd "$w"
  git init -q -b extradata
  git config user.name "plenty-map-data"; git config user.email "actions@users.noreply.github.com"
  if git fetch -q --depth=1 "$url" extradata 2>/dev/null; then
    lease="--force-with-lease=extradata:$(git rev-parse FETCH_HEAD)"
    git archive FETCH_HEAD | tar -x -C .
  else
    lease="--force-with-lease=extradata:"   # the branch must still not exist
  fi
  for d in "$@"; do rm -rf "./$d"; done
  cp -a "$src"/. .
  git add -A
  git commit -q -m "$msg"
  if git push -q "$lease" "$url" extradata; then echo "[save-extradata] saved: $msg"; exit 0; fi
  echo "[save-extradata] the branch changed while saving; trying again ($i)"
  cd /; rm -rf "$w"; sleep $((i * 5 + RANDOM % 5))
done
echo "[save-extradata] could not save after 6 tries"; exit 1
