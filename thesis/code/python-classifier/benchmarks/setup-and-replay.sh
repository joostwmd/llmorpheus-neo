#!/bin/bash
# Step 2: Apply edits, npm install, npm run build for all benchmarks.
# Run from project root: ./thesis/code/benchmarks/setup-and-replay.sh
# Requires: thesis/code/benchmarks/libs/ already populated (run clone-benchmarks.sh first)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBS_DIR="${SCRIPT_DIR}/libs"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# In-place edit (works on both macOS and Linux)
sed_inplace() { perl -i -pe "$1" "$2"; }
del_line() { perl -i -ne "print unless /$1/" "$2"; }

echo "=== Applying edits and building each project ==="

for dir in "$LIBS_DIR"/*/; do
  name=$(basename "$dir")
  echo ""
  echo "--- $name ---"
  cd "$dir"
  
  case "$name" in
    countries-and-timezones)
      sed_inplace 's/ && yarn run test:types//' package.json
      sed_inplace 's/rollup -c && //' package.json
      [ -f .fixTypes.sh ] && sed_inplace 's/sed -i .\?/sed -i /g' .fixTypes.sh 2>/dev/null || true
      ;;
    crawler-url-parser)
      sed_inplace 's/"mocha": "\^4.0.1"/"mocha": "\^7.2.0"/' package.json
      ;;
    delta)
      sed_inplace 's/"@types\/node": "\^17.0.21"/"@types\/node": "20.0"/' package.json
      ;;
    node-jsonfile)
      sed_inplace 's/npm run lint && //' package.json
      ;;
    plural)
      sed_inplace 's/"mocha": "~2.0.0"/"mocha": "~7.2.0"/' package.json
      ;;
    pull-stream)
      sed_inplace 's/npm run lint && //' package.json
      ;;
    q)
      sed_inplace 's/ && npm run -s lint//' package.json
      ;;
    spacl-core)
      sed_inplace 's/"@types\/node": "\^17.0.8"/"@types\/node": "\^18.9.0"/' package.json
      del_line "typedoc" package.json
      ;;
    zip-a-folder)
      sed_inplace 's/ && npm run lint//' package.json
      ;;
    Complex.js|image-downloader|node-dirty|node-geo-point)
      # no edits
      ;;
    *)
      echo "Unknown project $name, skipping edits"
      ;;
  esac
  
  npm install
  npm run build 2>/dev/null || echo "(no build script or build failed)"
  cd "$ROOT"
done

echo ""
echo "=== Done. Projects are ready. ==="
echo ""
echo "Next: Run replay for each project, e.g.:"
echo "  cd source/llmorpheus && npm run build"
echo "  node benchmark/createMutants.js --path $LIBS_DIR/Complex.js --mutate complex.js --replay $ROOT/source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js"
