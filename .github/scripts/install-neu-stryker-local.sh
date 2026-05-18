#!/usr/bin/env bash
# Install neu-se/stryker-js packages into the current directory (benchmark root).
# Run from the subject package directory after npm install / build.
#
# Required env: STRYKER_JS_ROOT — absolute path to the built stryker-js checkout
#   (e.g. "$GITHUB_WORKSPACE/stryker-js").
#
# Matches upstream workflows: install-local + legacy-peer-deps in cwd .npmrc +
# @cucumber/cucumber for cucumber-runner load-time imports.

set -euo pipefail

ROOT="${STRYKER_JS_ROOT:?STRYKER_JS_ROOT must be set}"

npm install install-local
# install-local does not forward flags to its inner `npm i`; cwd .npmrc applies to nested `npm i`
printf 'legacy-peer-deps=true\n' >> .npmrc
npx install-local "$ROOT"/packages/{core,util,api,instrumenter,*-runner}
npm install @cucumber/cucumber@^10 --no-save

STRYKER_CLI="node_modules/@stryker-mutator/core/bin/stryker.js"
if [[ ! -f "$STRYKER_CLI" ]]; then
  echo "::error::Expected local modified Stryker CLI at $(pwd)/$STRYKER_CLI"
  echo "::error::install-local likely failed to place @stryker-mutator/core in benchmark node_modules"
  exit 1
fi


