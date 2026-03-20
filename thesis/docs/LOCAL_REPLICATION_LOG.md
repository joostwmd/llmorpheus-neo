# Local Replication Log — Thesis Documentation

This document records the exact steps taken to replicate LLMorpheus mutation testing results locally. Use it to retrace and document the replication process for the thesis.

---

## Overview

**Goal:** Reproduce the LLMorpheus paper’s mutation testing results using pre-recorded data (replay) and the custom StrykerJS fork.

**Outcome:** Full replication of Stryker results for Complex.js when using:
- Original `mutants.json` from run358
- Custom StrykerJS (neu-se fork)
- Node 20 (not Node 22)
- Same benchmark at exact commit

---

## Environment

| Component        | Version / Notes                                 |
|-----------------|--------------------------------------------------|
| OS              | macOS (darwin 24.3.0)                            |
| Node.js         | **v20.18.1** (via nvm; Node 22 gives different results) |
| Project path    | `.../llmorpheus-neo`                             |

---

## Prerequisites (one-time setup)

### 1. Clone benchmark repositories

```sh
./thesis/code/benchmarks/clone-benchmarks.sh
```

Clones all 13 benchmarks at exact commits into `thesis/code/benchmarks/libs/`.

### 2. Build LLMorpheus

```sh
cd source/llmorpheus
npm install
npm run build
```

### 3. Build modified StrykerJS

```sh
cd source/stryker-js
npm install
npm run build
```

### 4. Ensure mutation-testing-data exists

The `source/mutation-testing-data/` folder must contain the pre-recorded runs (e.g. from the paper’s repository).

---

## Step-by-Step Replication: Complex.js

### Step 1: Use Node 20

```sh
nvm use 20
# Now using node v20.18.1
```

**Important:** Node 22 produces different Stryker results (23 extra survived mutants). Node 20 matches the original.

### Step 2: Apply edits and prepare benchmark

From project root:

```sh
./thesis/code/benchmarks/run-one-benchmark.sh Complex.js
```

This script:
- Applies edits from `thesis/code/benchmarks/benchmarks-macos.json` (macOS-compatible `sed`)
- Runs `npm install` and `npm run build` in the benchmark
- Runs replay: `createMutants.js --replay` using source/mutation-testing-data

Alternatively, for Stryker-only replication, skip replay and use the original mutants file (see Step 5).

### Step 3: Install modified Stryker into benchmark

```sh
cd thesis/code/benchmarks/libs/Complex.js
npm install install-local
printf 'legacy-peer-deps=true\n' >> .npmrc
npx install-local ../../../../source/stryker-js/packages/{core,util,api,instrumenter,*-runner}
npm install @cucumber/cucumber@^10 --no-save
```

**Note:** Do **not** use `npx stryker run`; that downloads the wrong (old) Stryker. Use the local binary.

### Step 4: Run Stryker with original mutants file

```sh
cd thesis/code/benchmarks/libs/Complex.js

export MUTANTS_FILE="$(cd ../../../../.. && pwd)/source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js/mutants.json"
# Or use absolute path: /path/to/llmorpheus-neo/source/mutation-testing-data/.../mutants.json

./node_modules/.bin/stryker run --usePrecomputed --mutate complex.js --concurrency 1 2>&1 | tee StrykerOutput.txt
```

**Expected result:**

| Metric        | Value   |
|---------------|---------|
| Mutation score| 58.01%  |
| Killed        | 553     |
| Timeout       | 1       |
| Survived      | 401     |
| Total mutants | 955     |

### Step 5: Compare against original

```sh
node thesis/code/benchmarks/compare-stryker-results.js \
  thesis/code/benchmarks/libs/Complex.js/StrykerOutput.txt \
  source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js/StrykerOutput.txt
```

**Expected:** `100.0% of mutants have matching status`

---

## Key Fixes Applied During Replication

### 1. `maxLinesInPlaceHolder` in replay

**Problem:** Replay produced only 79 prompts instead of 490 because `metaInfo.maxLinesInPlaceHolder` was `undefined` when loaded from replay `summary.json`, causing call-expression specs to be skipped.

**Fix:** In `source/llmorpheus/benchmark/createMutants.ts`, set `metaInfo.maxLinesInPlaceHolder = 1` when missing in replay mode.

### 2. Replay without LLM API

**Problem:** `createMutants.js --replay` still required `LLMORPHEUS_LLM_API_ENDPOINT` (Model.ts loads env at startup).

**Fix:** In `thesis/code/benchmarks/run-one-benchmark.sh`, export dummy env vars before replay:
- `LLMORPHEUS_LLM_API_ENDPOINT=https://replay.invalid`
- `LLMORPHEUS_LLM_AUTH_HEADERS='{}'`

### 3. macOS `sed` compatibility

**Problem:** `benchmarks.json` uses Linux-style `sed -i -e`; macOS needs `sed -i '' -e`.

**Fix:** `thesis/code/benchmarks/benchmarks-macos.json` with macOS-compatible edits. Scripts use this file.

### 4. Wrong Stryker when using `npx stryker`

**Problem:** `npx stryker run` fetches the old `stryker@1.0.1` package from npm.

**Fix:** Use `./node_modules/.bin/stryker run` so the locally installed modified Stryker is used.

---

## Files Reference

| File | Purpose |
|------|---------|
| `thesis/code/benchmarks/clone-benchmarks.sh` | Clone all benchmarks at exact commits |
| `thesis/code/benchmarks/benchmarks-macos.json` | macOS-compatible benchmark config |
| `thesis/code/benchmarks/run-one-benchmark.sh` | Apply edits, install, build, replay for one benchmark |
| `thesis/code/benchmarks/run-all-benchmarks.sh` | Run for all benchmarks |
| `thesis/code/benchmarks/compare-stryker-results.js` | Compare StrykerOutput.txt between two runs |
| `thesis/code/benchmarks/compare-mutant-counts.js` | Compare/filter mutants.json (`--filter` for exact 955) |
| `thesis/docs/REPLICATION_GUIDE.md` | General replication instructions |
| `source/mutation-testing-data/.../run358/projects/Complex.js/mutants.json` | Original 955 mutants for Complex.js |

---

## Summary for Thesis

- **Stryker replication:** With Node 20, original mutants, and the modified StrykerJS, results match the original run358 for Complex.js (58.01% mutation score, 553 killed, 401 survived).
- **Environment sensitivity:** Node 22 yields 23 additional survived mutants; Node 20 is required for exact replication.
- **Replay pipeline:** Replay produces 490 prompts and ~1024 mutants (vs original 955) due to slightly different filtering; using the original `mutants.json` avoids this and gives exact reproduction.
- **69 extra mutants:** All 69 extras are call/callee mutations that pass @babel/parser validation locally but were rejected in the original run. Even on Node 20 with matching @babel/parser/espree versions, the difference persists. Likely cause: platform (macOS vs Ubuntu in original CI). For exact Stryker replication without the paper’s mutants file, filter replay output: `node thesis/code/benchmarks/compare-mutant-counts.js --filter <orig> <replay> mutants-955.json` and run Stryker with `mutants-955.json`.

---

*Last updated: March 2025*
