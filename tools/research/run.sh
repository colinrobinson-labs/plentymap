#!/usr/bin/env bash
# Which research probe the workflow runs this time (research only, not part of the app build)
node tools/fetch-pantries.mjs "$1"
