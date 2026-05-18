# UniXCoder equivalent-mutant classifier (JS)

Fine-tunes [`microsoft/unixcoder-base`](https://huggingface.co/microsoft/unixcoder-base) on the **same labeled mutant CSV** used by [`python-classifier`](../python-classifier/) (GEPA experiments). Outputs metrics aligned with `python-classifier/evaluation.py`: macro-F1 (mean of per-class F1), Cohen's κ, MCC, accuracy, confusion matrix.

## Prerequisites

- macOS **12.3+** (Apple Silicon MPS), or Linux with CUDA optional.
- Python **3.10+** recommended (matches PyTorch wheels).

Check GPU backend:

```bash
python -c "import torch; print(torch.__version__, torch.backends.mps.is_available())"
```

Some Hugging Face ops fall back on CPU unless:

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
```

(Add to `~/.zshrc` if you want it permanent.)

## Setup

```bash
cd thesis/code/unixcoder-classifier
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

First training run downloads UniXCoder (~500MB) from Hugging Face into the HF cache.

## Data layout

| File | Purpose |
|------|---------|
| [`prepare_data.py`](prepare_data.py) | Reads gold CSV from `python-classifier`, writes stratified splits here |
| [`data/all.csv`](data/all.csv) | Full labeled set + numeric `label` (1 = Equivalent, 0 = Behavioral Change) |
| [`data/training.csv`](data/training.csv) | ~80% stratified train (~763 rows) |
| [`data/validation.csv`](data/validation.csv) | ~20% stratified validation (~191 rows) |

**Naming note:** `validation.csv` is your held-out split for comparing **different UniXCoder runs or window sizes**. There is no separate third test split in this folder (same trade-off as tuning on validation — acceptable for comparing models; document it in the thesis).

Regenerate splits:

```bash
python prepare_data.py
```

## Benchmark source trees

[`benchmarks/libs`](benchmarks/libs) is a **symlink** to [`../python-classifier/benchmarks/libs`](../python-classifier/benchmarks/libs). Context windows (`--window 10`, `--window full`) need those sources present.

## Train

Frozen encoder + MLP head (default; safest on ~763 train rows):

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
python train.py --window 0              # fragments only (original / replacement strings)
python train.py --window 10             # ±10 lines around anchor (matches GEPA ``window 10``)
python train.py --window full           # whole file (still truncated at ``--max-length``)
```

### New encoding / head / loss flags

| Flag | Default | What it does |
|------|---------|-------------|
| `--input-format {pair,split_diff,diff}` | `split_diff` | `pair` = `(original_window, mutant_window)`; `split_diff` = `(original_window, "- orig\n+ repl")` — explicit diff in the second segment; `diff` = single-segment unified diff with `// ORIGINAL / // MUTANT / // DIFF` markers. |
| `--pooling {cls,cls_mean_max}` | `cls_mean_max` | `cls` uses just the `<s>` vector; `cls_mean_max` concatenates `[CLS, masked_mean, masked_max]` (3× wider head). |
| `--loss {ce,ce_weighted,focal}` | `focal` | `focal` down-weights easy examples; `--focal-gamma` (default 2.0) controls focus. |
| `--balanced-sampler` | off | Uses `WeightedRandomSampler` so each minibatch is roughly class-balanced. |
| `--best-on {macro_f1,f1_equiv,mcc,kappa,tuned_macro_f1,tuned_f1_equiv}` | `macro_f1` | Metric for saving the checkpoint. `tuned_macro_f1` / `tuned_f1_equiv` re-sweep θ on validation each epoch; latter targets **equivalent** F1. |
| `--label-smoothing` | `0` | Soft CE targets — try `0.05` if probabilities look overconfident. |
| `--equiv-weight-mult` | `1` | Extra multiplier on loss weight for label 1 (equivalent); try **1.5–2.0** to chase recall_equiv (may add FPs). |
| `--thresh-min-recall-equiv` | unset | Adds `precision_if_recall_ge` to `thresholds.json`: best θ maximizing precision-equiv subject to recall-equiv ≥ given value (e.g. `0.56`). |

After each run finishes, validation predictions are swept across decision thresholds and `thresholds.json` is written with the best threshold per objective (`macro_f1`, `equiv_f1`, `kappa`, `mcc`). `evaluate.py` / `predict.py` pick the `macro_f1` threshold by default — override with `--threshold 0.42`.

Optional full encoder fine-tune (may overfit):

```bash
python train.py --window 10 --full-finetune --epochs 5
```

Artifacts under `runs/` use a descriptive folder name:

`<UTC-timestamp>-window-<w|full>-ep<N>-{frozen|full-ft}-<input-format>-<pooling>-<loss>[-bs][-ck-…][-lsN]-ml<L>-bs<B>-lr<scientific>[-seed<S>][-<run-label>]`

Example: `20260516-194512Z-window-w0-ep15-frozen-isplitdiff-pclsmm-focal2-ck-tmf1-ls5-ml512-bs8-lr2e-04`.

Optional `--run-label my-ablation` appends a sanitized suffix when two configs share the same hyperparameters.

Old runs keep their original shorter names; new trainings use this scheme.

| Artifact | Notes |
|----------|-------|
| `config.json` | Hyperparameters + best epoch (`checkpoint_metric`, `best_checkpoint_score`) |
| `classifier_head.pt` | Trained head |
| `tokenizer/` | Saved tokenizer |
| `encoder/` | Only when `--full-finetune`; otherwise reload base model name from config |
| `metrics.json` | macro_f1, kappa, mcc, confusion_matrix, … |
| `thresholds.json` | Best threshold per objective on the held-out split; optional `precision_if_recall_ge` |
| `predictions.csv` | Validation predictions vs gold (`pred_eval`, `gold_eval`, `equiv_prob`) |
| `training_log.jsonl` | Per-epoch metrics |

**OOM on M1:** reduce `--batch-size` (e.g. 4).

### K-fold × multi-seed ensemble (`train_cv.py`)

Reuses *all* labeled rows (`data/all.csv`) via stratified K-fold cross-validation. Each (fold, seed) trains a fresh classifier head on top of the same frozen UniXCoder encoder; each model predicts on its held-out fold, giving **out-of-fold (OOF) probabilities for every row**. OOF probabilities are then averaged across seeds and used to pick a decision threshold — no leakage.

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
python train_cv.py --window 0 --folds 5 --seeds 3 --epochs 18 \
  --input-format split_diff --pooling cls_mean_max --loss focal --balanced-sampler \
  --best-on tuned_f1_equiv --label-smoothing 0.05 --equiv-weight-mult 1.75 \
  --thresh-min-recall-equiv 0.56 \
  --run-label equiv-focused-v2
```

Use **`--best-on f1_equiv`** (argmax) or **`tuned_f1_equiv`** (sweep θ on each fold’s val split when picking the epoch) to bias training toward **equivalent** detection; **`--equiv-weight-mult`** further up-weights loss on label 1. Default remains `--best-on macro_f1` for fair comparison with earlier runs.

Thresholds on the **full OOF** set are still computed the same way; optional **`--thresh-min-recall-equiv`** adds `precision_if_recall_ge` to `thresholds.json`.

Artifacts under `runs/ensemble-...`:

| Artifact | Notes |
|----------|-------|
| `folds/foldI_seedS/classifier_head.pt` | Per-(fold, seed) trained head |
| `oof_predictions.csv` | Averaged equivalent prob + chosen pred per row |
| `metrics.json` | OOF metrics at the chosen threshold + `model_count` |
| `thresholds.json` | Best threshold per objective (chosen: `macro_f1`) |
| `per_fold_metrics.json` | Diagnostic — individual fold/seed metrics |
| `training_log.jsonl` | One JSON object per (fold, seed) training end |

`evaluate.py --run-dir runs/ensemble-...` and `predict.py --run-dir runs/ensemble-...` auto-detect ensemble dirs (they average all `N = folds × seeds` heads through one shared encoder pass per batch, then apply the saved threshold).

## Compare runs

```bash
python compare_runs.py
```

Prints a Markdown table sorted by validation macro-F1.

## Evaluate / predict

Rescore an existing checkpoint on any CSV with `coding` or `label` + mutant columns. Both single-model and ensemble run dirs are accepted; the tuned `macro_f1` threshold is loaded automatically from `thresholds.json` (override with `--threshold`).

```bash
python evaluate.py --run-dir runs/<id> --csv data/validation.csv
python evaluate.py --run-dir runs/<id> --csv data/validation.csv --output rescored.csv
python evaluate.py --run-dir runs/<id> --csv data/validation.csv --threshold 0.40
```

Batch inference on unlabeled CSV (must include columns compatible with `--window`; windowed mode needs `project`, `file`, `line`, `original`, `replacement`):

```bash
python predict.py --run-dir runs/<id> --csv path/to/mutants.csv
# Writes path/to/mutants.predictions.csv
```

Fragment-only sanity check:

```bash
python predict.py --run-dir runs/<id> --original "a + b" --replacement "a - b" --window 0
```

## Relation to GEPA (`python-classifier`)

| Aspect | GEPA | This folder |
|--------|------|-------------|
| Labels | `coding` column | Same CSV → `label` in `data/*.csv` |
| Context | `extract_context(...)` + prompt | Same extraction → UniXCoder encoding pair |
| Metrics | `evaluation.py` | Reuses `evaluation.py` via `metrics.py` |

## Troubleshooting

| Issue | Mitigation |
|-------|------------|
| `Benchmark project directory not found` | Fix `benchmarks/libs` symlink; vendor libs under `python-classifier`. |
| MPS crash / unsupported op | `export PYTORCH_ENABLE_MPS_FALLBACK=1` |
| CUDA OOM / MPS OOM | Lower `--batch-size` or `--max-length` |
| HF download blocked | VPN / mirror (`HF_ENDPOINT`) |
| `pip install` / cache errors (`No space left on device`) | Free ~2GB+ for venv + HF cache; set `TRANSFORMERS_CACHE` / `HF_HOME` to a larger disk. |
