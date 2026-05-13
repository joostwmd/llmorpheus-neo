# Python equivalent-mutant classifier (simplified)

Python implementation of the equivalent-mutant classifier with GEPA-driven prompt optimization.
**Simplified version with hardcoded prompt** - no template files or versioning system.

## Setup

```bash
cd thesis/code/python-classifier
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

API keys (match your model id — see `make_classifier` in `classifier.py`):

- **Native OpenAI** (`gpt-4o-mini`, …): `OPENAI_API_KEY`
- **OpenRouter via LiteLLM** (`openrouter/openai/gpt-4o-mini`, …): `OPENROUTER_API_KEY`

Set in `.env` or export in the shell. GEPA **reflection** uses LiteLLM strings too — use `openrouter/...` reflection models with `OPENROUTER_API_KEY`.

Optional: **`CLASSIFIER_MAX_OUTPUT_TOKENS`** (default **8192**) — caps completion length for classify calls so structured JSON (`reasoning`, diagnostics) is rarely truncated by provider defaults. Increase if you still see cut-off text; decrease to save cost.

## Key Files

```
python-classifier/
├── benchmarks/libs/        Vendored source code for the 13 benchmark projects
├── data/                   Labeled CSV splits (validation.csv, test.csv, ...)
├── classifier.py           Context extraction + OpenAI / OpenRouter classifiers
├── evaluation.py           Confusion matrix + kappa / MCC / kappa-FP-penalty metrics
├── sampling.py             Deterministic stratified subset utility
├── schema.py               JSON schema for OpenAI structured outputs
├── gepa_types.py           Basic GEPAConfig dataclass
├── simple_gepa.py          Streamlined GEPA optimization (main tool)
├── window_sensitivity.py   Context-window sweep tool
├── run_validation.py       CLI for batch classification (non-GEPA)
├── aggregate_gepa_runs.py Merge `generations.jsonl` across runs for offline plots
└── test_classifier.py      Basic smoke test
```

## Usage

### 1. Test the classifier
```bash
python test_classifier.py                    # Smoke test (no API key needed)
python run_validation.py --limit 5           # Classify 5 mutants
```

### 2. Window sensitivity analysis
```bash
python window_sensitivity.py --windows 3 5 10 20 full
```

### 3. GEPA optimization (main tool)
```bash
python simple_gepa.py --test-run --window 10        # 10 generations (~$0.50)
python simple_gepa.py --quick --window 10           # 50 generations (~$1.50)  
python simple_gepa.py --full --window 10            # 150 generations (~$3.00)
```

Models and chaining (no lost progress between machines):

- `--task-model` — classifier (e.g. `openrouter/openai/gpt-4o-mini`)
- `--reflection-model` — GEPA reflection LM (same routing rules)
- `--seed-prompt-file path/to/best_prompt.txt` — continue from a prior run
- `--run-label` — stored in `run_metadata.json`
- `--global-generation-offset N` — shift logged generation indices when merging JSONL offline

Each run writes under `experiments/simple_gepa_*`:

| Artifact | Purpose |
|----------|---------|
| `run_metadata.json` | Models, labels, offsets, paths |
| `seed_prompt_used.txt` | Actual starting prompt text |
| `best_prompt.txt` | Best prompt found (use as next `--seed-prompt-file`) |
| `best_candidate.json` | `{"prompt": ...}` for `window_sensitivity.py --candidate` |
| `generations.jsonl` | One record per metric call (merge with `aggregate_gepa_runs.py`) |
| `results.json` | Final scores and diagnostics |
| `manifest.json` | SHA-256 of key outputs |

Optional live smoke test: `CLASSIFIER_MODEL=openrouter/openai/gpt-4o-mini python test_classifier.py`

### GitHub Actions

Repo workflows (manual dispatch):

- `.github/workflows/gepa-prompt-optimization.yml` — runs `simple_gepa.py`, uploads the latest `experiments/simple_gepa_*` folder. Optional **`seed_prompt`**: paste full **`best_prompt.txt`** as plain multiline text (leave empty for hardcoded seed). Very long prompts may exceed UI limits — commit a file or use a local run with `--seed-prompt-file` instead.
- `.github/workflows/window-sensitivity.yml` — runs `window_sensitivity.py` **after** you have a prompt; optional **`prompt_text`** (plain text of `best_prompt.txt`, or JSON of `best_candidate.json` if **`prompt_is_candidate_json`** is checked).

Configure repository secrets: `OPENROUTER_API_KEY` (and `OPENAI_API_KEY` if you use native OpenAI ids). Download artifacts from each run for local cross-run analysis.

**Metrics note:** In `results.json` / `generations.jsonl`, **`kappa_basis_rows`** is TP+FP+FN+TN — the rows used for Cohen's κ and the FP penalty. **`total`** is rows attempted in the subset; rows that fail classification are excluded from κ (see `evaluate_prompt` in `simple_gepa.py`).

## How it works

### Hardcoded Prompt
The classifier uses a single hardcoded prompt (see `get_hardcoded_prompt()` in `classifier.py`) that:
- Contains system instructions + task description in one string
- Uses `{{original}}`, `{{replacement}}`, `{{context}}` placeholders
- Requests structured JSON output with diagnostic fields

### GEPA Integration
`simple_gepa.py` optimizes the prompt string directly:
- Uses stratified validation subset (configurable EQ/BEH ratio)
- Score = Cohen's kappa - λ × (FP/N) to penalize false equivalents
- Logs detailed diagnostics (FP/FN examples) for GEPA's reflection
- Saves best prompt + metrics to `experiments/simple_gepa_*/`

### Scoring Logic
- **Cohen's kappa** rewards agreement with human labels above chance
- **FP penalty** (λ × FP/N) makes false equivalents explicitly costly
- Default λ=0.5; increase to be more conservative about false equivalents

## Example Workflow

```bash
# 1. Pick context window
python window_sensitivity.py --windows 5 10 20

# 2. Run GEPA at chosen window
python simple_gepa.py --full --window 10 --lambda-fp 0.5

# 3. Test evolved prompt
python run_validation.py --split test --window 10
```

Results go to `experiments/simple_gepa_TIMESTAMP/results.json` with before/after scores and the optimized prompt text.

## Differences from Original

**Removed:**
- Template system (`prompts/` directory)
- Versioning (v1, v2, v3...)
- `PromptCandidate` classes
- Complex GEPA experiment orchestration

**Simplified to:**
- Single hardcoded prompt string
- Direct GEPA optimization on the string
- Minimal configuration via CLI args
- Same scoring (κ - λ×FP/N) and stratified sampling