#!/bin/bash
# Run setup (edits + npm install + build) and replay for all benchmarks.
# Run from project root: ./thesis/code/benchmarks/run-all-benchmarks.sh
#
# Prerequisites:
#   - thesis/code/benchmarks/libs/ populated (run clone-benchmarks.sh first)
#   - source/llmorpheus built (cd source/llmorpheus && npm run build)
#   - source/mutation-testing-data with replay data
#
# Optional env:
#   REPLAY_SUBDIR  Default: codellama-13b-instruct/template-full-0.0/run358
#   BENCHMARKS     Space-separated list to run (default: all from benchmarks-macos.json)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BENCHMARKS_JSON="${SCRIPT_DIR}/benchmarks-macos.json"

if [ -n "$BENCHMARKS" ]; then
  NAMES=($BENCHMARKS)
else
  NAMES=($(node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    console.log(j.map(b => b.name).join(' '));
  " "$BENCHMARKS_JSON"))
fi

echo "Running ${#NAMES[@]} benchmarks: ${NAMES[*]}"
echo ""

for name in "${NAMES[@]}"; do
  if "$SCRIPT_DIR/run-one-benchmark.sh" "$name"; then
    echo "--- $name: OK ---"
  else
    echo "--- $name: FAILED ---"
    exit 1
  fi
  echo ""
done

echo "=== All benchmarks done ==="
