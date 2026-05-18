"""Surrounding-source context extraction — mirrors thesis/code/python-classifier/classifier.py."""

from __future__ import annotations

from pathlib import Path
from typing import Any


PACKAGE_ROOT = Path(__file__).resolve().parent
BENCHMARK_LIBS = PACKAGE_ROOT / "benchmarks" / "libs"

CLONE_HINT = (
    "Benchmark sources are vendored under thesis/code/python-classifier/benchmarks/libs. "
    "Ensure benchmarks/libs symlink resolves (run from unixcoder-classifier)."
)


def normalize_coding_to_eval_label(raw: object) -> str | None:
    """Map CSV ``coding`` column to evaluation labels."""
    if raw is None:
        return None
    t = str(raw).strip().lower().replace(" ", "_")
    if t == "equivalent":
        return "EQUIVALENT"
    if t in ("behavioral_change", "behavioralchange", "behavior_change"):
        return "BEHAVIORAL_CHANGE"
    return None


def label_int_to_eval(label: int) -> str:
    return "EQUIVALENT" if int(label) == 1 else "BEHAVIORAL_CHANGE"


def eval_label_from_row(row: dict[str, Any]) -> str | None:
    if "label" in row and row["label"] != "":
        try:
            return label_int_to_eval(int(row["label"]))
        except (TypeError, ValueError):
            pass
    return normalize_coding_to_eval_label(row.get("coding"))


def resolve_benchmark_file_path(project: str, file: str) -> Path:
    project_dir = BENCHMARK_LIBS / project
    if not project_dir.is_dir():
        raise FileNotFoundError(
            f"Benchmark project directory not found: {project_dir}\n{CLONE_HINT}"
        )
    file_path = project_dir / file
    if not file_path.is_file():
        extra = ""
        if project == "Complex.js":
            extra = f' The "{project}" checkout may be empty.\n{CLONE_HINT}'
        raise FileNotFoundError(f"Source file not found: {file_path}{extra}")
    return file_path


def _build_annotated_text(slice_lines: list[str], anchor_line: int, start_line: int) -> str:
    end_line = start_line + len(slice_lines) - 1
    width = len(str(end_line))
    parts: list[str] = []
    for i, line in enumerate(slice_lines):
        ln = start_line + i
        marker = ">>>" if ln == anchor_line else "   "
        parts.append(f"{marker} {str(ln).rjust(width)} | {line}")
    return "\n".join(parts)


def is_full_file_mode(window_or_full: Any) -> bool:
    return isinstance(window_or_full, str) and window_or_full.strip().lower() == "full"


def context_config_label(window_or_full: Any = 10) -> str:
    if is_full_file_mode(window_or_full):
        return "full"
    try:
        w = float(window_or_full)
    except (TypeError, ValueError):
        return "window-unknown"
    if not (w >= 0 and w == int(w)):
        return "window-unknown"
    return f"window-{int(w)}"


def extract_context(
    project: str,
    file: str,
    line: int | str,
    window_or_full: int | str = 10,
) -> dict[str, Any]:
    anchor_line = int(line)
    if anchor_line < 1:
        raise ValueError(f"extract_context: invalid line number: {line}")

    file_path = resolve_benchmark_file_path(project, file)
    raw = file_path.read_text(encoding="utf-8", errors="replace")
    all_lines = raw.splitlines()

    idx = anchor_line - 1
    if idx >= len(all_lines):
        raise ValueError(
            f"Line {anchor_line} is past end of file ({len(all_lines)} lines): {file_path}"
        )

    if is_full_file_mode(window_or_full):
        annotated = _build_annotated_text(all_lines, anchor_line, 1)
        return {
            "filePath": str(file_path),
            "anchorLine": anchor_line,
            "startLine": 1,
            "endLine": len(all_lines),
            "lines": all_lines,
            "annotatedText": annotated,
            "scope": "full",
        }

    window = int(window_or_full)
    if window < 0:
        raise ValueError(f"extract_context: invalid window: {window_or_full!r}")

    start_idx = max(0, idx - window)
    end_idx = min(len(all_lines) - 1, idx + window)
    start_line = start_idx + 1
    slice_lines = all_lines[start_idx : end_idx + 1]
    annotated = _build_annotated_text(slice_lines, anchor_line, start_line)

    return {
        "filePath": str(file_path),
        "anchorLine": anchor_line,
        "startLine": start_line,
        "endLine": end_idx + 1,
        "lines": slice_lines,
        "annotatedText": annotated,
        "scope": "window",
    }


def substitute_anchor_fragment(
    slice_lines: list[str],
    *,
    anchor_line: int,
    start_line: int,
    original_fragment: str,
    replacement_fragment: str,
) -> list[str]:
    """Return a copy of ``slice_lines`` with ``original_fragment`` → ``replacement_fragment`` on anchor."""
    i = anchor_line - start_line
    if i < 0 or i >= len(slice_lines):
        return list(slice_lines)
    line = slice_lines[i]
    frag = original_fragment or ""
    if frag and frag in line:
        new_line = line.replace(frag, replacement_fragment, 1)
    else:
        # Fallback: whole-line substitution when CSV fragment doesn't appear verbatim.
        new_line = replacement_fragment if replacement_fragment else line
    out = list(slice_lines)
    out[i] = new_line
    return out


def build_mutant_annotated_text(
    ctx: dict[str, Any],
    *,
    original_fragment: str,
    replacement_fragment: str,
) -> str:
    """Same window/full slice as ``ctx`` but mutant code at anchor line."""
    mutated = substitute_anchor_fragment(
        ctx["lines"],
        anchor_line=int(ctx["anchorLine"]),
        start_line=int(ctx["startLine"]),
        original_fragment=original_fragment,
        replacement_fragment=replacement_fragment,
    )
    return _build_annotated_text(
        mutated,
        int(ctx["anchorLine"]),
        int(ctx["startLine"]),
    )


INPUT_FORMATS = ("pair", "split_diff", "diff")


def pair_text_for_model(
    row: dict[str, Any],
    window_or_full: int | str,
    input_format: str = "pair",
) -> tuple[str, str]:
    """Build the (text_a, text_b) token-pair UniXCoder sees.

    input_format:
      - ``pair``       : (original_window, mutant_window)  [legacy default]
      - ``split_diff`` : (original_window, "- orig_frag\\n+ repl_frag")
      - ``diff``       : ("// ORIGINAL\\n... // MUTANT\\n... // DIFF\\n- ... + ...", "")
    """
    if input_format not in INPUT_FORMATS:
        raise ValueError(f"Unknown input_format {input_format!r}; expected one of {INPUT_FORMATS}")

    original_frag = str(row.get("original") or "")
    replacement_frag = str(row.get("replacement") or "")
    diff_block = f"- {original_frag}\n+ {replacement_frag}"

    if window_or_full == 0 or window_or_full == "0":
        if input_format == "pair":
            return original_frag, replacement_frag
        if input_format == "split_diff":
            return original_frag, diff_block
        unified = (
            "// ORIGINAL\n"
            f"{original_frag}\n"
            "// MUTANT\n"
            f"{replacement_frag}\n"
            "// DIFF\n"
            f"{diff_block}"
        )
        return unified, ""

    ctx = extract_context(
        str(row["project"]),
        str(row["file"]),
        int(row["line"]),
        window_or_full,
    )
    orig_ann = ctx["annotatedText"]
    mut_ann = build_mutant_annotated_text(
        ctx,
        original_fragment=original_frag,
        replacement_fragment=replacement_frag,
    )
    if input_format == "pair":
        return orig_ann, mut_ann
    if input_format == "split_diff":
        return orig_ann, diff_block
    unified = (
        "// ORIGINAL\n"
        f"{orig_ann}\n"
        "// MUTANT\n"
        f"{mut_ann}\n"
        "// DIFF\n"
        f"{diff_block}"
    )
    return unified, ""
