# Replicating LLMorpheus Results

This guide explains how to replicate the results from the LLMorpheus paper using the data and tools in this repository.

## Overview

There are **two main ways** to replicate results:

1. **Replay mode** – Regenerate mutants deterministically from recorded prompts/completions (no LLM needed)
2. **Re-run Stryker** – Re-execute mutation testing on existing mutants (regenerates kill/survive/timeout status)

You can also **run full experiments** (generate new mutants with an LLM + run Stryker), but results will differ due to non-determinism.

---

## Prerequisites

1. **Node.js 20+**

2. **Build LLMorpheus:**
   ```sh
   cd source/llmorpheus
   npm install
   npm run build
   ```

3. **Build the modified StrykerJS:**
   ```sh
   cd source/stryker-js
   npm install
   npm run build
   ```

---

## Option 1: Replay LLMorpheus (Deterministic Mutant Generation)

Replay uses recorded prompts and completions from a previous run. No LLM API is required.

For each subject project in `source/mutation-testing-data`, you need to:

1. **Clone the subject project** at the exact commit used in the paper (from `benchmarks.json` or `thesis/code/benchmarks/benchmarks-macos.json`; or use `./thesis/code/benchmarks/clone-benchmarks.sh`)

2. **Run createMutants with `--replay`** pointing to the project folder from mutation-testing-data:

   ```sh
   cd source/llmorpheus
   node benchmark/createMutants.js \
     --path /path/to/Complex.js \
     --mutate "complex.js" \
     --replay /path/to/llmorpheus-neo/source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js
   ```

   This writes to `<Complex.js>/MUTATION_TESTING/template-full_codellama-13b-instruct_0.0/` (prompts, mutants.json, summary.json, etc.).

### Subject Projects & Commits

From `llmorpheus/.github/benchmarks.json`:

| Project | Clone URL | Files to mutate |
|---------|-----------|------------------|
| Complex.js | `https://github.com/infusion/Complex.js` @ `d995ca105e8adef4c38d0ace50643daf84e0dd1c` | `complex.js` |
| countries-and-timezones | `https://github.com/manuelmhtr/countries-and-timezones` @ `241dd0f56dfc527bcd87779ae14ed67bd25c1c0e` | `src/**.js` |
| crawler-url-parser | `https://gitlab.com/autokent/crawler-url-parser` @ `202c5b25...` | `./crawler-url-parser.js` |
| delta | `https://github.com/quilljs/delta` @ `5ffb853d...` | `./src/*.ts` |
| image-downloader | `https://gitlab.com/demsking/image-downloader` @ `19a53f65...` | `./{index,lib/*}.js` |
| node-dirty | `https://github.com/felixge/node-dirty` @ `d7fb4d4e...` | `./lib/**/*.js` |
| node-geo-point | `https://github.com/rainder/node-geo-point` @ `c839d477...` | `src/{geo-point,index}.ts` |
| node-jsonfile | `https://github.com/jprichardson/node-jsonfile` @ `9c6478a8...` | `./*.js` |
| plural | `https://github.com/swang/plural` @ `f0027d66...` | `./index.js` |
| pull-stream | `https://github.com/pull-stream/pull-stream` @ `29b4868b...` | `{index,pull,throughs/*,...}.js` |
| q | `https://github.com/kriskowal/q` @ `6bc7f524...` | `./{q,queue}.js` |
| spacl-core | `https://gitlab.com/cptpackrat/spacl-core` @ `fcb8511a...` | `./src/*.ts` |
| zip-a-folder | `https://github.com/maugenst/zip-a-folder` @ `d2ea465b...` | `lib/*.ts` |

### Replay structure

`--replay` expects a directory with:

- `summary.json` (includes `metaInfo` with model, temperature, etc.)
- `prompts/` with files like `promptN.txt` and `promptN_completion_M.txt`

The replay directory in `source/mutation-testing-data` uses this structure.

---

## Option 2: Re-run Stryker on Existing Mutants

To reproduce kill/survive/timeout results on the same mutants:

1. **Clone the subject project** at the exact commit (see table above).

2. **Apply package edits** (if any) from `benchmarks.json` (or `thesis/code/benchmarks/benchmarks-macos.json` on macOS; or use `./thesis/code/benchmarks/run-one-benchmark.sh`), then:
   ```sh
   npm install
   npm run build  # if the project has a build script
   ```

3. **Point Stryker at the existing mutants:**
   ```sh
   cd /path/to/Complex.js
   npm install install-local
   npx install-local /path/to/llmorpheus-neo/source/stryker-js/packages/{core,util,api,instrumenter,*-runner} --legacy-peer-deps

   export MUTANTS_FILE="/path/to/llmorpheus-neo/source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js/mutants.json"

   STRYKER_FILES="complex.js"  # from expandGlob or benchmarks.json
   npx stryker run --usePrecomputed --mutate $STRYKER_FILES --concurrency 1
   ```

4. **View the report:** `reports/mutation/mutation.html`

---

## Option 3: Run Full Experiments (New Mutants + Stryker)

For new mutant generation with an LLM:

1. Set API credentials:
   ```sh
   export LLMORPHEUS_LLM_API_ENDPOINT='https://api.openai.com/v1/chat/completions'
   export LLMORPHEUS_LLM_AUTH_HEADERS='{"Authorization": "Bearer YOUR_API_KEY", "content-type": "application/json"}'
   ```

2. Generate mutants:
   ```sh
   cd source/llmorpheus
   node benchmark/createMutants.js \
     --path /path/to/Complex.js \
     --mutate "complex.js" \
     --model gpt-4o-mini \
     --template templates/template-full.hb \
     --temperature 0.0
   ```

3. Run Stryker as in Option 2, but set `MUTANTS_FILE` to the new `mutants.json` (e.g. inside `MUTATION_TESTING/...`).

**Note:** Results will differ between runs due to LLM non-determinism (except at temperature 0 with deterministic APIs).

---

## LLM API Providers

LLMorpheus uses `LLMORPHEUS_LLM_API_ENDPOINT` and `LLMORPHEUS_LLM_AUTH_HEADERS` for any OpenAI-compatible API.

### OpenAI

```sh
export LLMORPHEUS_LLM_API_ENDPOINT='https://api.openai.com/v1/chat/completions'
export LLMORPHEUS_LLM_AUTH_HEADERS='{"Authorization": "Bearer sk-...", "content-type": "application/json"}'
```

### Langdock

[Langdock](https://docs.langdock.com) provides an OpenAI-compatible API with EU/US regions and supports GPT, Claude, Mistral, Gemini.

- **Endpoint (EU):** `https://api.langdock.com/openai/eu/v1/chat/completions`
- **Endpoint (US):** `https://api.langdock.com/openai/us/v1/chat/completions`
- **Dedicated deployment:** `https://<your-domain>/api/public/openai/{eu|us}/v1/chat/completions`

```sh
export LLMORPHEUS_LLM_API_ENDPOINT='https://api.langdock.com/openai/eu/v1/chat/completions'
export LLMORPHEUS_LLM_AUTH_HEADERS='{"Authorization": "Bearer YOUR_LANGDOCK_API_KEY", "content-type": "application/json"}'
```

**GitHub Actions:** Use the `langdock-experiment.yml` workflow. Add secrets:
- `LANGDOCK_LLM_API_ENDPOINT` – full chat completions URL (with region)
- `LANGDOCK_LLM_AUTH_HEADERS` – JSON with `Authorization` and `content-type`

To see available models for your workspace: `GET https://api.langdock.com/openai/{region}/v1/models`

---

## Deep-Comparing Stryker Results

To compare your Stryker run against the original per-mutant:

1. Run Stryker with output saved: `2>&1 | tee StrykerOutput.txt`
2. Run the comparison script:

   ```sh
   node thesis/code/benchmarks/compare-stryker-results.js \
     thesis/code/benchmarks/libs/Complex.js/StrykerOutput.txt \
     source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js/StrykerOutput.txt
   ```

This reports: matching status, differing status, mutants only in one run. StrykerOutput only lists Survived mutants in detail. For full per-mutant comparison, run Stryker with `--reporters "html","json"` to get `reports/mutation/mutation.json`.

---

## macOS: benchmarks-macos.json

On macOS, BSD `sed` uses different syntax than GNU sed on Linux. Use `thesis/code/benchmarks/benchmarks-macos.json` instead of `benchmarks.json` when applying edits locally. It contains the same benchmark definitions with macOS-compatible `sed -i ''` commands. See `thesis/code/benchmarks/benchmarks-macos.README.md` for details.

**Convenience scripts** (run from project root after `clone-benchmarks.sh`):

```sh
./thesis/code/benchmarks/run-one-benchmark.sh Complex.js    # Single benchmark
./thesis/code/benchmarks/run-all-benchmarks.sh             # All benchmarks
```

---

## Data Layout

`source/mutation-testing-data` is structured as:

```
source/mutation-testing-data/
├── codellama-13b-instruct/
│   └── template-full-0.0/
│       ├── run354/ ... run359/
│       │   ├── projects/
│       │   │   ├── Complex.js/
│       │   │   │   ├── mutants.json
│       │   │   │   ├── prompts/
│       │   │   │   ├── summary.json
│       │   │   │   ├── promptSpecs.json
│       │   │   │   ├── mutation.html
│       │   │   │   └── StrykerOutput.txt
│       │   │   └── ...
│       │   ├── report.md
│       │   └── table.tex
│       └── ...
├── codellama-34b-instruct/
├── mixtral-8x7b-instruct/
└── ...
```

---

## Regenerating Reports

To recreate the aggregated report from multiple projects:

```sh
cd source/llmorpheus
node .github/generateReport.js "Report (Precomputed mutators)" \
  /path/to/results \
  /path/to/mutants \
  > report.md
```

`results` and `mutants` should each contain one subdirectory per project with the expected Stryker outputs and mutant data.

---

## References

- Paper: [arXiv:2404.09952](https://arxiv.org/abs/2404.09952)
- LLMorpheus: [github.com/neu-se/llmorpheus](https://github.com/neu-se/llmorpheus)
- Modified Stryker: [github.com/neu-se/stryker-js](https://github.com/neu-se/stryker-js)
- Mutation testing data: [github.com/neu-se/mutation-testing-data](https://github.com/neu-se/mutation-testing-data)
