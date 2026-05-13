#!/usr/bin/env python3
"""
Aggregate RQ1-style metrics from repeated LLMorpheus + Stryker runs.

Expected layout (produced by rq1-five-runs-openrouter workflow):

  ROOT/
    run-1/<packageName>/mutants.json
    run-1/<packageName>/summary.json
    run-1/<packageName>/StrykerInfo.json
    run-2/...

Outputs under --out:
  - rq1_summary.json — per-run metrics, means/SDs, Jaccard pairs, union Levenshtein
  - mutation_score_by_run.png
  - valid_mutants_by_run.png
  - duplicate_rate_by_run.png
  - levenshtein_norm_by_run.png (bar: median + IQR)
  - jaccard_pairwise.png (heatmap)
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path
from typing import Any

# matplotlib imported lazily in main to allow --help without it


def levenshtein(a: str, b: str) -> int:
    a = a or ""
    b = b or ""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def norm_levenshtein(orig: str, repl: str) -> float:
    d = levenshtein(orig, repl)
    m = max(len(orig or ""), len(repl or ""), 1)
    return d / m


def mutant_identity_key(m: dict[str, Any]) -> str:
    payload = {
        "fileName": m.get("fileName"),
        "startLine": m.get("startLine"),
        "startColumn": m.get("startColumn"),
        "endLine": m.get("endLine"),
        "endColumn": m.get("endColumn"),
        "replacement": m.get("replacement"),
    }
    return json.dumps(payload, sort_keys=True)


def parse_mutation_score(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw)
    s = str(raw).strip().rstrip("%")
    try:
        return float(s)
    except ValueError:
        return None


def to_int(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except ValueError:
        return None


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def duplicate_rate(summary: dict[str, Any]) -> float | None:
    """Matches generateTable2 semantics: candidates column = nrCandidates + nrDuplicate."""
    nc = summary.get("nrCandidates")
    nd = summary.get("nrDuplicate")
    if nc is None or nd is None:
        return None
    try:
        nc = int(nc)
        nd = int(nd)
    except (TypeError, ValueError):
        return None
    denom = nc + nd
    if denom <= 0:
        return None
    return nd / denom


def discover_run_dirs(root: Path) -> list[tuple[int, Path]]:
    pairs: list[tuple[int, Path]] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        name = child.name
        if name.startswith("run-"):
            try:
                n = int(name.split("-", 1)[1])
            except ValueError:
                continue
            pairs.append((n, child))
    pairs.sort(key=lambda x: x[0])
    return pairs


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    u = len(a | b)
    if u == 0:
        return 1.0
    return len(a & b) / u


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("root", type=Path, help="Directory containing run-* folders")
    ap.add_argument("package_name", help="Package folder name inside each run-*")
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("rq1-report"),
        help="Output directory for JSON + figures",
    )
    args = ap.parse_args()

    import os
    os.environ.setdefault("MPLBACKEND", "Agg")

    import matplotlib.pyplot as plt
    import numpy as np

    runs = discover_run_dirs(args.root)
    if not runs:
        raise SystemExit(f"No run-* directories under {args.root}")

    per_run: list[dict[str, Any]] = []
    mutant_sets: list[set[str]] = []
    levens_by_run: list[list[float]] = []

    for run_idx, run_dir in runs:
        pkg_dir = run_dir / args.package_name
        m_path = pkg_dir / "mutants.json"
        s_path = pkg_dir / "summary.json"
        st_path = pkg_dir / "StrykerInfo.json"
        if not m_path.is_file() or not s_path.is_file() or not st_path.is_file():
            raise SystemExit(f"Missing artifacts in {pkg_dir} (need mutants, summary, StrykerInfo)")

        mutants: list[dict[str, Any]] = load_json(m_path)
        summary = load_json(s_path)
        stryker = load_json(st_path)

        killed = to_int(stryker.get("nrKilled"))
        survived = to_int(stryker.get("nrSurvived"))
        timed_out = to_int(stryker.get("nrTimedOut"))
        mut_score = parse_mutation_score(stryker.get("mutationScore"))

        valid = (
            summary.get("nrSyntacticallyValid")
            if summary.get("nrSyntacticallyValid") is not None
            else len(mutants)
        )
        try:
            valid_i = int(valid)
        except (TypeError, ValueError):
            valid_i = len(mutants)

        dr = duplicate_rate(summary)

        norms: list[float] = []
        for m in mutants:
            oc = m.get("originalCode")
            rep = m.get("replacement")
            if isinstance(oc, str) and isinstance(rep, str):
                norms.append(norm_levenshtein(oc, rep))

        ms = {mutant_identity_key(m) for m in mutants}
        mutant_sets.append(ms)
        levens_by_run.append(norms)

        per_run.append(
            {
                "run": run_idx,
                "summary": {
                    "nrPrompts": summary.get("nrPrompts"),
                    "nrCandidates": summary.get("nrCandidates"),
                    "nrSyntacticallyValid": summary.get("nrSyntacticallyValid"),
                    "nrSyntacticallyInvalid": summary.get("nrSyntacticallyInvalid"),
                    "nrIdentical": summary.get("nrIdentical"),
                    "nrDuplicate": summary.get("nrDuplicate"),
                    "nrLocations": summary.get("nrLocations"),
                    "duplicateRate": dr,
                },
                "stryker": {
                    "mutationScore": mut_score,
                    "nrKilled": killed,
                    "nrSurvived": survived,
                    "nrTimedOut": timed_out,
                },
                "levenshteinNormalized": {
                    "median": statistics.median(norms) if norms else None,
                    "mean": statistics.mean(norms) if norms else None,
                    "count": len(norms),
                },
                "mutantCountInFile": len(mutants),
            }
        )

    def mean_sd(vals: list[float | None]) -> dict[str, float | None]:
        xs = [float(x) for x in vals if x is not None and not math.isnan(x)]
        if not xs:
            return {"mean": None, "sd": None, "n": 0}
        if len(xs) == 1:
            return {"mean": xs[0], "sd": 0.0, "n": 1}
        return {"mean": statistics.mean(xs), "sd": statistics.stdev(xs), "n": len(xs)}

    scores = [r["stryker"]["mutationScore"] for r in per_run]
    valids = [
        float(r["summary"]["nrSyntacticallyValid"])
        if r["summary"]["nrSyntacticallyValid"] is not None
        else float(r["mutantCountInFile"])
        for r in per_run
    ]
    dups = [r["summary"]["duplicateRate"] for r in per_run]
    killeds = [float(r["stryker"]["nrKilled"]) if r["stryker"]["nrKilled"] is not None else float("nan") for r in per_run]

    jaccard_matrix: list[list[float]] = []
    for i in range(len(mutant_sets)):
        row: list[float] = []
        for j in range(len(mutant_sets)):
            if i == j:
                row.append(1.0)
            else:
                row.append(jaccard(mutant_sets[i], mutant_sets[j]))
        jaccard_matrix.append(row)

    union_keys: set[str] = set()
    for s in mutant_sets:
        union_keys |= s

    union_norms: list[float] = []
    seen_keys: set[str] = set()
    for _, run_dir in runs:
        for m in load_json(run_dir / args.package_name / "mutants.json"):
            k = mutant_identity_key(m)
            if k in seen_keys:
                continue
            seen_keys.add(k)
            oc = m.get("originalCode")
            rep = m.get("replacement")
            if isinstance(oc, str) and isinstance(rep, str):
                union_norms.append(norm_levenshtein(oc, rep))

    report = {
        "package": args.package_name,
        "runs": [r["run"] for r in per_run],
        "perRun": per_run,
        "aggregates": {
            "mutationScore": mean_sd([s if s is not None else None for s in scores]),
            "nrSyntacticallyValid": mean_sd([float(v) for v in valids]),
            "duplicateRate": mean_sd([d if d is not None else None for d in dups]),
            "nrKilled": mean_sd([k if not math.isnan(k) else None for k in killeds]),
        },
        "stability": {
            "unionUniqueMutants": len(union_keys),
            "pairwiseJaccard": jaccard_matrix,
            "levenshteinNormalizedUnion": {
                "median": statistics.median(union_norms) if union_norms else None,
                "mean": statistics.mean(union_norms) if union_norms else None,
                "count": len(union_norms),
            },
        },
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "rq1_summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    labels = [f"run-{r['run']}" for r in per_run]
    x = np.arange(len(labels))

    fig, ax = plt.subplots(figsize=(8, 4))
    ys = [s if s is not None else 0.0 for s in scores]
    ax.bar(x, ys, color="steelblue")
    m = report["aggregates"]["mutationScore"]["mean"]
    if m is not None:
        ax.axhline(m, color="red", linestyle="--", label=f"mean={m:.4f}")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Mutation score (from StrykerInfo)")
    ax.set_title("Mutation score by run")
    ax.legend()
    fig.tight_layout()
    fig.savefig(args.out / "mutation_score_by_run.png", dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(x, valids, color="seagreen")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("# syntactically valid (summary)")
    ax.set_title("Valid mutants by run")
    fig.tight_layout()
    fig.savefig(args.out / "valid_mutants_by_run.png", dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4))
    dup_ys = [d if d is not None else 0.0 for d in dups]
    ax.bar(x, dup_ys, color="coral")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Duplicate rate (nrDuplicate / (nrCandidates + nrDuplicate))")
    ax.set_title("Duplicate rate by run")
    fig.tight_layout()
    fig.savefig(args.out / "duplicate_rate_by_run.png", dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4))
    medians = [statistics.median(lv) if lv else 0.0 for lv in levens_by_run]
    q1s = []
    q3s = []
    for lv in levens_by_run:
        if not lv:
            q1s.append(0.0)
            q3s.append(0.0)
        else:
            q1s.append(float(np.percentile(lv, 25)))
            q3s.append(float(np.percentile(lv, 75)))
    ax.bar(x, medians, color="mediumpurple", label="median")
    ax.errorbar(
        x,
        medians,
        yerr=[np.array(medians) - np.array(q1s), np.array(q3s) - np.array(medians)],
        fmt="none",
        ecolor="black",
        capsize=4,
    )
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Normalized Levenshtein (orig vs replacement)")
    ax.set_title("Subtlety: median ± IQR by run")
    fig.tight_layout()
    fig.savefig(args.out / "levenshtein_norm_by_run.png", dpi=150)
    plt.close(fig)

    n = len(mutant_sets)
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(jaccard_matrix, vmin=0, vmax=1, cmap="viridis")
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(labels)
    ax.set_yticklabels(labels)
    ax.set_title("Pairwise Jaccard (mutant identity sets)")
    fig.colorbar(im, ax=ax, fraction=0.046)
    fig.tight_layout()
    fig.savefig(args.out / "jaccard_pairwise.png", dpi=150)
    plt.close(fig)

    print(f"Wrote report to {args.out}")


if __name__ == "__main__":
    main()
