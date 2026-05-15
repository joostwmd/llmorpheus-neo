#!/usr/bin/env bash
# Run inside GitHub Actions after benchmark is built and LLMorpheus + stryker-js are ready.
# Env (required): GITHUB_WORKSPACE, PKG_NAME, LLM_ROOT, STRYKER_JS, MODEL, TEMPLATE,
#   TEMPERATURE, MAX_PROMPTS, MAX_TOKENS, SYSTEM_PROMPT_BASE, BENCHMARK_MODE, STRYKER_OPTIONS,
#   MUTATE_GLOB, IGNORE_GLOB, OUTPUT_ROOT
# Optional: NUM_RUNS (default 5)
# 

set -eu -o pipefail

NUM_RUNS="${NUM_RUNS:-5}"
BENCHMARK_DIR="${GITHUB_WORKSPACE}/${PKG_NAME}"

normalize_temp() {
  local t="${1:-0}"
  if [[ "${t}" == "0" || "${t}" == "0.0" ]]; then echo "0.0"; return; fi
  if [[ "${t}" == "1" || "${t}" == "1.0" ]]; then echo "1.0"; return; fi
  echo "${t}"
}



MUT_TEMP="$(normalize_temp "${TEMPERATURE}")"
MUTATION_SUBDIR="${TEMPLATE}_$(echo "${MODEL}" | sed 's/\//_/g')_${MUT_TEMP}"
MUTANTS_REL="MUTATION_TESTING/${MUTATION_SUBDIR}/mutants.json"
SUMMARY_REL="MUTATION_TESTING/${MUTATION_SUBDIR}/summary.json"
export MUTANTS_FILE="${MUTANTS_REL}"

mkdir -p "${OUTPUT_ROOT}"

for RUN in $(seq 1 "${NUM_RUNS}"); do
  echo "========== RQ1 run ${RUN}/${NUM_RUNS} =========="
  cd "${BENCHMARK_DIR}"
  rm -rf MUTATION_TESTING reports/mutation
  rm -f StrykerOutput.txt StrykerInfo.json

  cd "${LLM_ROOT}"
  LLMORPHEUS_OPTIONS=(
    "--temperature" "${MUT_TEMP}"
    "--maxNrPrompts" "${MAX_PROMPTS}"
    "--systemPrompt" "${SYSTEM_PROMPT_BASE}.txt"
    "--model" "${MODEL}"
    "--benchmark" "${BENCHMARK_MODE}"
    "--maxTokens" "${MAX_TOKENS}"
  )
  set +e
  ( time node --max-old-space-size=6144 benchmark/createMutants.js \
      --path "${BENCHMARK_DIR}" \
      --mutate "${MUTATE_GLOB}" \
      --ignore "${IGNORE_GLOB}" \
      --template "templates/${TEMPLATE}.hb" \
      --caching false \
      "${LLMORPHEUS_OPTIONS[@]}" ) 2>&1 | tee -a "${BENCHMARK_DIR}/LLMorpheusOutput.txt"
  GEN_EXIT="${PIPESTATUS[0]}"
  set -e
  if [[ "${GEN_EXIT}" -ne 0 ]]; then
    echo "::error::createMutants failed on run ${RUN} with exit ${GEN_EXIT}"
    exit "${GEN_EXIT}"
  fi

  cd "${BENCHMARK_DIR}"
  if [[ ! -f "${MUTANTS_REL}" ]]; then
    echo "::error::Expected ${MUTANTS_REL} after run ${RUN}"
    exit 1
  fi

  STRYKER_FILES="$(node "${LLM_ROOT}/.github/expandGlob.js" "$(pwd)" "${MUTATE_GLOB}" "${IGNORE_GLOB}")"
  STRYKER_CLI="${STRYKER_JS}/packages/core/bin/stryker.js"
  if [[ ! -f "${STRYKER_CLI}" ]]; then
    echo "::error::Missing modified Stryker CLI at ${STRYKER_CLI}"
    exit 1
  fi
  set +e
  # shellcheck disable=SC2086
  ( time node "${STRYKER_CLI}" run ${STRYKER_OPTIONS} --usePrecomputed --mutate "${STRYKER_FILES}" ) 2>&1 | tee -a StrykerOutput.txt
  STRYKER_EXIT="${PIPESTATUS[0]}"
  set -e
  if [[ "${STRYKER_EXIT}" -ne 0 ]]; then
    echo "::error::stryker run failed on run ${RUN} with exit ${STRYKER_EXIT}"
    exit "${STRYKER_EXIT}"
  fi

  node "${LLM_ROOT}/.github/parseStrykerReport.js" StrykerOutput.txt

  OUT="${OUTPUT_ROOT}/run-${RUN}/${PKG_NAME}"
  mkdir -p "${OUT}"
  cp "${MUTANTS_REL}" "${OUT}/mutants.json"
  cp "${SUMMARY_REL}" "${OUT}/summary.json"
  cp StrykerInfo.json "${OUT}/"
  cp StrykerOutput.txt "${OUT}/"
  cp LLMorpheusOutput.txt "${OUT}/"
  echo "Saved run ${RUN} artifacts to ${OUT}"
done

echo "RQ1 raw outputs complete under ${OUTPUT_ROOT}"
