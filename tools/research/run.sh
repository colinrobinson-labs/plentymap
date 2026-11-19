#!/bin/sh
# Which research probe the workflow runs this time (research only, not part of the app build)
mkdir -p "$1"
node tools/research/probe3.mjs > "$1/probe3.txt" 2>&1 || true
node tools/fetch-pantries.mjs "$1"
