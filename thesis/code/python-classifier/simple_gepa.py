#!/usr/bin/env python3
"""GEPA prompt optimization with LiteLLM/OpenRouter classification option.

Artifacts written under ``experiments/<experiment_id>/`` for CI upload and local cross-run analysis:

- ``run_metadata.json`` — inputs, models, subset seed, optional GitHub context
- ``manifest.json`` — file checksums for reproducibility
- ``seed_prompt_used.txt`` — exact starting prompt for chaining runs
- ``best_candidate.json`` — ``{\"prompt\": \"...\"}`` (consumable by ``window_sensitivity --candidate``)
- ``best_prompt.txt`` — same prompt, plain text
- ``results.json`` — scores before / after
- ``generations.jsonl`` — one JSON object per GEPA metric call (for offline plots)

Chain runs locally or in CI: pass ``--seed-prompt-file`` pointing to ``best_prompt.txt``
from a previous artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import gepa.optimize_anything as oa
from gepa.optimize_anything import (
    optimize_anything,
    GEPAConfig as GepaLibConfig,
    EngineConfig,
    ReflectionConfig,
)

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))

from classifier import (
    ClassifierProtocol,
    fill_template,
    extract_context,
    get_hardcoded_prompt,
    make_classifier,
    require_env_for_task_model,
)
from evaluation import (
    ConfusionMatrix,
    accuracy,
    build_confusion_matrix,
    cohens_kappa,
    confusion_total,
    f1_score,
    kappa_with_fp_penalty,
    mcc,
    normalize_ground_truth_label,
    normalize_prediction_label,
    precision_behavioral,
    precision_equiv,
    recall_behavioral,
    recall_equiv,
)
from sampling import stratified_subset


_SCORE_MODE_CHOICES = frozenset({
    "kappa_minus_fp",
    "kappa",
    "mcc",
    "accuracy",
    "macro_f1",
})


def _prompt_score(
    cm: ConfusionMatrix,
    *,
    score_mode: str,
    lambda_fp: float,
) -> tuple[float, float]:
    """Return (optimization_score, macro_f1_for_logging).

    ``optimization_score`` is what GEPA maximizes; macro_f1 is always computed for logs.
    """
    if score_mode not in _SCORE_MODE_CHOICES:
        raise ValueError(f"Unknown score_mode: {score_mode!r}")

    n = confusion_total(cm)
    kappa_val = cohens_kappa(cm) or 0.0

    pe = precision_equiv(cm)
    re = recall_equiv(cm)
    pb = precision_behavioral(cm)
    rb = recall_behavioral(cm)
    f1_e = f1_score(pe, re)
    f1_b = f1_score(pb, rb)
    macro_f1 = (((f1_e or 0.0) + (f1_b or 0.0)) / 2.0) if n else 0.0

    if score_mode == "kappa_minus_fp":
        opt = kappa_with_fp_penalty(cm, lam=lambda_fp)
    elif score_mode == "kappa":
        opt = kappa_val
    elif score_mode == "mcc":
        opt = mcc(cm) or 0.0
    elif score_mode == "accuracy":
        opt = accuracy(cm) or 0.0
    else:  # macro_f1
        opt = macro_f1

    return opt, macro_f1


def _gepa_objective_instruction(score_mode: str, lambda_fp: float) -> str:
    base = (
        "Optimize this JavaScript mutation testing prompt for structured JSON classification. "
        "Preserve {{original}}, {{replacement}}, {{context}} placeholders and schema requirements."
    )
    if score_mode == "kappa_minus_fp":
        return (
            base + f" Maximize Cohen's kappa agreement with human labels minus "
            f"{lambda_fp}×(false_equivalents/N); penalize calling behavioral mutants EQUIVALENT."
        )
    if score_mode == "kappa":
        return base + " Maximize Cohen's kappa vs gold labels (chance-corrected)."
    if score_mode == "mcc":
        return base + " Maximize Matthews correlation coefficient vs gold labels."
    if score_mode == "accuracy":
        return base + " Maximize plain classification accuracy vs gold labels."
    return (
        base + " Maximize macro-averaged F1 across EQUIVALENT and BEHAVIORAL_CHANGE — "
        "treat both classes equally vs gold."
    )


def evaluate_prompt(
    prompt_text: str,
    validation_subset: list[dict[str, str]],
    classifier: ClassifierProtocol,
    context_window: int | str,
    *,
    score_mode: str,
    lambda_fp: float = 0.5,
) -> tuple[float, dict[str, Any]]:
    """Evaluate a prompt string against the validation subset.

    Rows that raise during classify or lack a usable gold label are omitted from the
    confusion matrix: they do **not** affect the optimization ``score``.
    Metrics include ``kappa_basis_rows`` (= TP+FP+FN+TN) vs ``total`` subset rows attempted.
    ``score_mode`` selects the scalar GEPA maximizes (see ``--score-mode``).
    """
    cases: list[dict[str, Any]] = []

    for row in validation_subset:
        mutant_id = str(row.get("id"))
        project = str(row.get("project", ""))
        file_ = str(row.get("file", ""))
        try:
            line = int(row.get("line", 0))
        except (TypeError, ValueError):
            line = 0

        gold = normalize_ground_truth_label(row.get("coding")) or ""
        original = row.get("original", "") or ""
        replacement = row.get("replacement", "") or ""

        try:
            ctx = extract_context(project, file_, line, context_window)
            vars_ = {
                "original": original,
                "replacement": replacement,
                "context": ctx.get("annotatedText", ""),
            }
            user_prompt = fill_template(prompt_text, vars_)
            result = classifier.classify("", user_prompt)
            pred = normalize_prediction_label(result.classification)

            cases.append({
                "mutant_id": mutant_id,
                "ground_truth": gold,
                "predicted": pred,
                "structured": result.to_dict() if result else {},
                "error": None,
            })
        except Exception as e:  # noqa: BLE001
            cases.append({
                "mutant_id": mutant_id,
                "ground_truth": gold,
                "predicted": None,
                "structured": {},
                "error": f"{type(e).__name__}: {e}",
            })

    pairs = [(c["ground_truth"], c["predicted"])
             for c in cases if c["ground_truth"] and c["predicted"]]

    if not pairs:
        return 0.0, {"error": "No valid predictions", "cases": cases, "score_mode": score_mode}

    cm = build_confusion_matrix(pairs)
    k = cohens_kappa(cm) or 0.0
    score, macro_f1 = _prompt_score(cm, score_mode=score_mode, lambda_fp=lambda_fp)

    fps = [c for c in cases
           if c["ground_truth"] == "BEHAVIORAL_CHANGE" and c["predicted"] == "EQUIVALENT"]
    fns = [c for c in cases
           if c["ground_truth"] == "EQUIVALENT" and c["predicted"] == "BEHAVIORAL_CHANGE"]

    scored_rows = n  # TP+FP+FN+TN — κ, MCC, accuracy, and λ·FP/N use only these rows
    subset_attempted = len(cases)
    metrics: dict[str, Any] = {
        "score_mode": score_mode,
        "score": score,
        "kappa": k,
        "mcc": mcc(cm) or 0.0,
        "macro_f1": macro_f1,
        "accuracy": accuracy(cm) or 0.0,
        "precision": precision_equiv(cm) or 0.0,
        "recall": recall_equiv(cm) or 0.0,
        "tp": cm.TP, "fp": cm.FP, "fn": cm.FN, "tn": cm.TN,
        "total": subset_attempted,
        "kappa_basis_rows": scored_rows,
        "errors": len([c for c in cases if c["error"]]),
        "false_positives": fps[:5],
        "false_negatives": fns[:5],
    }

    return score, metrics


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Simple GEPA optimization")
    parser.add_argument("--test-run", action="store_true", help="10 generations")
    parser.add_argument("--quick", action="store_true", help="50 generations")
    parser.add_argument("--full", action="store_true", help="150 generations")
    parser.add_argument("--custom", type=int, help="Custom generation count")
    parser.add_argument("--n-equivalent", type=int, default=20)
    parser.add_argument("--n-behavioral", type=int, default=60)
    parser.add_argument("--validation-csv", default="data/validation.csv")
    parser.add_argument("--window", default="10", help="Context window")
    parser.add_argument("--seed", type=int, default=42, help="Stratified subset RNG seed")
    parser.add_argument("--lambda-fp", type=float, default=0.5)
    parser.add_argument(
        "--score-mode",
        choices=sorted(_SCORE_MODE_CHOICES),
        default="kappa_minus_fp",
        help=(
            "Objective GEPA maximizes on the stratified subset. "
            "kappa_minus_fp: κ−λ·FP/N (legacy). macro_f1 / mcc / kappa / accuracy: "
            "closer symmetric alignment with gold labels."
        ),
    )
    parser.add_argument(
        "--task-model",
        default=os.environ.get("GEPA_TASK_MODEL", "openrouter/openai/gpt-4o-mini"),
        help="Classifier model (openrouter/... uses OPENROUTER_API_KEY; else OpenAI SDK)",
    )
    parser.add_argument(
        "--reflection-model",
        default=os.environ.get("GEPA_REFLECTION_MODEL", "openrouter/openai/gpt-4o-mini"),
        help="GEPA reflection LM (LiteLLM routing; set OPENROUTER_API_KEY if needed)",
    )
    parser.add_argument(
        "--seed-prompt-file",
        type=str,
        default=None,
        help="Path to text file with starting prompt (from prior run best_prompt.txt). "
             "If omitted, uses get_hardcoded_prompt().",
    )
    parser.add_argument(
        "--run-label",
        default=os.environ.get("GEPA_RUN_LABEL", ""),
        help="Human-readable label stored in metadata (e.g. baseline-1)",
    )
    parser.add_argument(
        "--global-generation-offset",
        type=int,
        default=0,
        help="Added to each logged generation index for merging logs across chained runs",
    )
    args = parser.parse_args()

    try:
        require_env_for_task_model(args.task_model)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.test_run:
        max_gens = 10
    elif args.quick:
        max_gens = 50
    elif args.custom:
        max_gens = args.custom
    else:
        max_gens = 150

    try:
        window = int(args.window) if args.window != "full" else "full"
    except ValueError:
        print(f"Invalid window: {args.window}", file=sys.stderr)
        return 1

    subset = stratified_subset(
        csv_path=args.validation_csv,
        n_equivalent=args.n_equivalent,
        n_behavioral=args.n_behavioral,
        seed=args.seed,
    )

    if args.seed_prompt_file:
        seed_path = Path(args.seed_prompt_file).expanduser().resolve()
        if not seed_path.is_file():
            print(f"Seed prompt file not found: {seed_path}", file=sys.stderr)
            return 1
        seed_prompt = seed_path.read_text(encoding="utf-8")
        seed_source = str(seed_path)
    else:
        seed_prompt = get_hardcoded_prompt()
        seed_source = "get_hardcoded_prompt()"

    classifier = make_classifier(args.task_model)

    experiment_id = f"simple_gepa_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    experiment_dir = Path("experiments") / experiment_id
    experiment_dir.mkdir(parents=True, exist_ok=True)

    generations_path = experiment_dir / "generations.jsonl"

    run_metadata: dict[str, Any] = {
        "experiment_id": experiment_id,
        "run_label": args.run_label or None,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "task_model": args.task_model,
        "reflection_model": args.reflection_model,
        "validation_csv": args.validation_csv,
        "n_equivalent": args.n_equivalent,
        "n_behavioral": args.n_behavioral,
        "subset_size": len(subset),
        "subset_seed": args.seed,
        "context_window": window,
        "score_mode": args.score_mode,
        "lambda_fp": args.lambda_fp,
        "max_generations_requested": max_gens,
        "global_generation_offset": args.global_generation_offset,
        "seed_prompt_source": seed_source,
        "seed_prompt_sha256": _sha256_text(seed_prompt),
        "github": {
            "run_id": os.environ.get("GITHUB_RUN_ID"),
            "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
            "repository": os.environ.get("GITHUB_REPOSITORY"),
            "sha": os.environ.get("GITHUB_SHA"),
            "ref": os.environ.get("GITHUB_REF"),
            "workflow": os.environ.get("GITHUB_WORKFLOW"),
        },
    }
    (experiment_dir / "run_metadata.json").write_text(json.dumps(run_metadata, indent=2), encoding="utf-8")
    (experiment_dir / "seed_prompt_used.txt").write_text(seed_prompt, encoding="utf-8")

    print("Simple GEPA Optimization")
    print("=" * 50)
    print(f"Experiment: {experiment_id}")
    print(f"Generations: {max_gens}")
    print(f"Subset size: {len(subset)}")
    print(f"Window: {window}")
    print(f"Task model: {args.task_model}")
    print(f"Reflection model: {args.reflection_model}")
    print(f"Seed prompt: {len(seed_prompt)} chars from {seed_source}")
    print(f"Score mode: {args.score_mode}")
    print("=" * 50)

    print("Evaluating seed prompt...")
    seed_score, seed_metrics = evaluate_prompt(
        seed_prompt,
        subset,
        classifier,
        window,
        score_mode=args.score_mode,
        lambda_fp=args.lambda_fp,
    )
    print(
        f"Seed score: {seed_score:.3f} "
        f"(kappa={seed_metrics.get('kappa', 0):.3f}, macro_f1={seed_metrics.get('macro_f1', 0):.3f})"
    )

    generation_count = 0

    def append_generation_line(payload: dict[str, Any]) -> None:
        with generations_path.open("a", encoding="utf-8") as gf:
            gf.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def gepa_evaluator(prompt_dict: dict[str, str]) -> float:
        nonlocal generation_count
        generation_count += 1
        prompt_text = prompt_dict.get("prompt", "")
        global_gen = args.global_generation_offset + generation_count

        try:
            score, metrics = evaluate_prompt(
                prompt_text,
                subset,
                classifier,
                window,
                score_mode=args.score_mode,
                lambda_fp=args.lambda_fp,
            )

            append_generation_line({
                "global_generation": global_gen,
                "local_generation": generation_count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "score": score,
                **metrics,
            })

            diagnostics = f"""Generation {generation_count} (global {global_gen}) Results:
Score ({metrics['score_mode']}): {score:.3f} (kappa={metrics['kappa']:.3f}, MCC={metrics['mcc']:.3f}, macro_f1={metrics['macro_f1']:.3f})
Confusion: TP={metrics['tp']} FP={metrics['fp']} FN={metrics['fn']} TN={metrics['tn']} (κ basis {metrics['kappa_basis_rows']}/{metrics['total']} rows)
Errors: {metrics['errors']}

False Positives (predicted EQUIVALENT, actually BEHAVIORAL_CHANGE):
{chr(10).join(f"- {fp['mutant_id']}: {fp.get('structured', {}).get('reasoning', 'no reasoning')}" for fp in metrics['false_positives'])}

False Negatives (predicted BEHAVIORAL_CHANGE, actually EQUIVALENT):
{chr(10).join(f"- {fn['mutant_id']}: {fn.get('structured', {}).get('reasoning', 'no reasoning')}" for fn in metrics['false_negatives'])}
"""
            oa.log(diagnostics)

            print(
                f"Generation {generation_count} (global {global_gen}): "
                f"score({metrics['score_mode']})={score:.3f} macro_f1={metrics['macro_f1']:.3f} "
                f"kappa={metrics['kappa']:.3f} (κ basis {metrics['kappa_basis_rows']}/"
                f"{metrics['total']} rows) TP={metrics['tp']} FP={metrics['fp']} "
                f"FN={metrics['fn']} TN={metrics['tn']}"
            )

            return score
        except Exception as e:  # noqa: BLE001
            print(f"Generation {generation_count} failed: {e}")
            oa.log(f"Evaluation failed: {e}")
            append_generation_line({
                "global_generation": global_gen,
                "local_generation": generation_count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": f"{type(e).__name__}: {e}",
                "score": 0.0,
            })
            return 0.0

    gepa_config = GepaLibConfig(
        engine=EngineConfig(max_metric_calls=max_gens, seed=args.seed),
        reflection=ReflectionConfig(reflection_lm=args.reflection_model),
    )

    print(f"\nRunning GEPA for {max_gens} generations...")
    start_time = time.time()

    result = optimize_anything(
        seed_candidate={"prompt": seed_prompt},
        evaluator=gepa_evaluator,
        objective=_gepa_objective_instruction(args.score_mode, args.lambda_fp),
        config=gepa_config,
    )

    runtime = time.time() - start_time

    best_prompt = result.best_candidate["prompt"]
    final_score, final_metrics = evaluate_prompt(
        best_prompt,
        subset,
        classifier,
        window,
        score_mode=args.score_mode,
        lambda_fp=args.lambda_fp,
    )

    results = {
        "experiment_id": experiment_id,
        "runtime_seconds": runtime,
        "generations_evaluated": generation_count,
        "score_mode": args.score_mode,
        "lambda_fp": args.lambda_fp,
        "task_model": args.task_model,
        "reflection_model": args.reflection_model,
        "seed": {"score": seed_score, "metrics": seed_metrics},
        "final": {"score": final_score, "metrics": final_metrics},
        "improvement": final_score - seed_score,
        "best_prompt_sha256": _sha256_text(best_prompt),
    }
    (experiment_dir / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    (experiment_dir / "best_prompt.txt").write_text(best_prompt, encoding="utf-8")
    (experiment_dir / "best_candidate.json").write_text(
        json.dumps({"prompt": best_prompt}, indent=2),
        encoding="utf-8",
    )

    manifest: dict[str, Any] = {
        "experiment_id": experiment_id,
        "files": {},
    }

    def _sha256_file(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    for name in ("run_metadata.json", "results.json", "seed_prompt_used.txt",
                 "best_prompt.txt", "best_candidate.json", "generations.jsonl"):
        p = experiment_dir / name
        if p.is_file():
            manifest["files"][name] = {
                "sha256": _sha256_file(p),
                "bytes": p.stat().st_size,
            }
    (experiment_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"\nOptimization complete in {runtime:.1f}s")
    print(f"Score: {seed_score:.3f} -> {final_score:.3f} (+{final_score - seed_score:.3f})")
    print(f"Saved to: {experiment_dir}/")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
