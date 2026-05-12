#!/bin/bash
# Run setup (edits + npm install + build) and replay for a single benchmark.
# Run from project root: ./thesis/code/benchmarks/run-one-benchmark.sh <benchmark-name>
#
# Prerequisites:
#   - thesis/code/benchmarks/libs/ populated (run clone-benchmarks.sh first)
#   - source/llmorpheus built (cd source/llmorpheus && npm run build)
#   - source/mutation-testing-data with replay data
#
# Optional env:
#   REPLAY_SUBDIR  Default: codellama-13b-instruct/template-full-0.0/run358
#                  Path under mutation-testing-data/.../projects/<name>

set -e
NAME="${1:?Usage: ./thesis/code/benchmarks/run-one-benchmark.sh <benchmark-name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIBS_DIR="${SCRIPT_DIR}/libs"
BENCHMARKS_JSON="${SCRIPT_DIR}/benchmarks-macos.json"
REPLAY_SUBDIR="${REPLAY_SUBDIR:-codellama-13b-instruct/template-full-0.0/run358}"
REPLAY_PATH="${ROOT}/source/mutation-testing-data/${REPLAY_SUBDIR}/projects/${NAME}"

if [ ! -d "$LIBS_DIR/$NAME" ]; then
  echo "Error: $LIBS_DIR/$NAME not found. Run clone-benchmarks.sh first."
  exit 1
fi

if [ ! -f "$BENCHMARKS_JSON" ]; then
  echo "Error: $BENCHMARKS_JSON not found."
  exit 1
fi

if [ ! -d "$REPLAY_PATH" ]; then
  echo "Error: Replay path not found: $REPLAY_PATH"
  echo "Set REPLAY_SUBDIR if using different run, e.g. REPLAY_SUBDIR=codellama-13b-instruct/template-full-0.0/run354"
  exit 1
fi

# Get edits and files from benchmarks-macos.json
BENCH_INFO=$(node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const b = j.find(x => x.name === process.argv[2]);
if (!b) { console.error('Unknown benchmark:', process.argv[2]); process.exit(1); }
console.log(JSON.stringify({ edits: b.edits, files: b.files }));
" "$BENCHMARKS_JSON" "$NAME")

EDITS=$(echo "$BENCH_INFO" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.edits);")
FILES=$(echo "$BENCH_INFO" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.files);")

echo "=== $NAME: applying edits ==="
cd "$LIBS_DIR/$NAME"
eval "$EDITS"

echo "=== $NAME: npm install ==="
npm install

echo "=== $NAME: npm run build ==="
npm run build 2>/dev/null || echo "(no build script or build failed)"

echo "=== $NAME: replay ==="
cd "$ROOT/source/llmorpheus"
# Replay doesn't call the LLM, but Model.ts reads these at load time - set dummy values
export LLMORPHEUS_LLM_API_ENDPOINT="${LLMORPHEUS_LLM_API_ENDPOINT:-https://replay.invalid}"
export LLMORPHEUS_LLM_AUTH_HEADERS='{}'
node benchmark/createMutants.js \
  --path "$LIBS_DIR/$NAME" \
  --mutate "$FILES" \
  --replay "$REPLAY_PATH"

echo ""
echo "=== $NAME: done. Mutants written to $LIBS_DIR/$NAME/MUTATION_TESTING/"
