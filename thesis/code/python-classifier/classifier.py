"""
Extract context from benchmark libs and call OpenAI with JSON-schema structured output.
Behavior matches thesis/code/equivalent-classifier (contextExtractor + OpenAIClassifier).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from dotenv import load_dotenv
from openai import OpenAI

import litellm

from schema import (
    CLASSIFICATION_SCHEMA,
    CLASSIFICATION_SCHEMA_DESCRIPTION,
    CLASSIFICATION_SCHEMA_NAME,
)

PACKAGE_ROOT = Path(__file__).resolve().parent
BENCHMARK_LIBS = PACKAGE_ROOT / "benchmarks" / "libs"
# Prompts are now hardcoded - no more template files

CLONE_HINT = (
    "Benchmark sources are vendored under thesis/code/python-classifier/benchmarks/libs. "
    "If a project directory is missing, restore it from thesis/code/benchmarks/."
)

ALLOWED_OPENAI_MODELS = frozenset({"gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-4"})
# Template system removed — prompts live in get_hardcoded_prompt() unless overridden via CLI.


class ClassifierProtocol(Protocol):
    """Anything that implements classify(...) with our structured JSON schema."""

    def classify(self, system_prompt: str, user_prompt: str) -> ClassifyResult: ...


def load_package_env() -> None:
    """Load OPENAI_API_KEY from package .env if present."""
    env_path = PACKAGE_ROOT / ".env"
    if env_path.is_file():
        load_dotenv(env_path)


def create_prompt_hash(system_prompt: str, user_prompt: str) -> str:
    return hashlib.sha256(f"{system_prompt}\0{user_prompt}".encode("utf-8")).hexdigest()


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


def context_log_label(ctx: dict[str, Any]) -> str:
    if ctx["scope"] == "full":
        return "full"
    return f"lines-{len(ctx['lines'])}"


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


def get_hardcoded_prompt() -> str:
    """Return the hardcoded single prompt for mutation classification."""
    return """You are an expert JavaScript software engineer specializing in mutation testing and program semantics. Analyze code mutations and decide whether they are behaviorally equivalent to the original, prioritizing precision: avoid labeling a real behavioral change as equivalent. Respond strictly in the JSON schema format; do not emit prose outside the schema.

Determine whether the following code mutation is behaviorally EQUIVALENT to the original code, or whether it represents a BEHAVIORAL CHANGE, then populate every field of the response schema.

Definitions:
- EQUIVALENT: No input or execution path can produce a different observable result compared to the original.
- BEHAVIORAL CHANGE: There exists at least one input or execution path under which behavior could differ observably (return value, thrown exception, side effect, console/network/file output).

Original fragment:
```
{{original}}
```

Mutant fragment:
```
{{replacement}}
```

Surrounding source context (line marked >>> is the anchor line from the benchmark):
```
{{context}}
```

Analyze the mutation systematically. For each field of the response schema, follow these rules:

- classification: "EQUIVALENT" or "BEHAVIORAL_CHANGE".
- confidence: "HIGH" only when you can name a concrete distinguishing input (or prove none exists). "LOW" when the reasoning is uncertain or relies on assumptions you cannot verify from the visible context.
- mutation_category: one of operator_swap, constant_change, method_swap, boundary_change, branch_flip, deletion, other.
- key_differences: list the concrete semantic differences between original and mutant. Use [] only if the two are textually identical or differ only in whitespace.
- edge_cases_considered: list at least three relevant input/condition types that JavaScript developers typically need to consider for this kind of code (e.g. NaN, undefined, null, empty array, negative number, integer overflow, short-circuit evaluation, type coercion, Unicode case folding). Be specific to the code shown.
- distinguishing_input: a concrete input value or call site (e.g. "tokens = ['2','j']", "n = NaN", "arr = []") under which original and mutant produce different observable behavior. Required when classification == "BEHAVIORAL_CHANGE". Must be null when classification == "EQUIVALENT".
- reasoning: 1-3 sentences explaining the decision, referencing the key difference that drove it.

Be precise: false equivalents (calling a real behavior change "EQUIVALENT") are more harmful than missed equivalents."""


def fill_template(template: str, vars_: dict[str, str]) -> str:
    out = template
    for key, value in vars_.items():
        out = out.replace(f"{{{{{key}}}}}", value if value is not None else "")
    return out


def build_prompt(row: dict[str, str], context_result: dict[str, Any]) -> tuple[str, str]:
    """Build the classification prompt from hardcoded template."""
    vars_ = {
        "original": row.get("original") or "",
        "replacement": row.get("replacement") or "",
        "context": context_result.get("annotatedText") or "",
    }
    
    user_prompt = fill_template(get_hardcoded_prompt(), vars_)
    return ("", user_prompt)  # Empty system, full prompt as user


_VALID_CONFIDENCE = {"LOW", "MEDIUM", "HIGH"}
_VALID_MUTATION_CATEGORY = {
    "operator_swap",
    "constant_change",
    "method_swap",
    "boundary_change",
    "branch_flip",
    "deletion",
    "other",
}


def normalize_classification_payload(data: Any) -> dict[str, Any]:
    """Normalize casing/whitespace on the structured fields; do not silently coerce missing data."""
    if not isinstance(data, dict):
        raise TypeError("expected dict payload")
    o = dict(data)

    c = o.get("classification")
    if isinstance(c, str):
        u = c.strip().upper().replace(" ", "_")
        if u in ("BEHAVIORAL_CHANGE", "BEHAVIORALCHANGE"):
            o["classification"] = "BEHAVIORAL_CHANGE"
        elif u == "EQUIVALENT":
            o["classification"] = "EQUIVALENT"

    conf = o.get("confidence")
    if isinstance(conf, str):
        o["confidence"] = conf.strip().upper()

    cat = o.get("mutation_category")
    if isinstance(cat, str):
        o["mutation_category"] = cat.strip().lower()

    return o


def is_classification_result(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if data.get("classification") not in ("EQUIVALENT", "BEHAVIORAL_CHANGE"):
        return False
    if data.get("confidence") not in _VALID_CONFIDENCE:
        return False
    if data.get("mutation_category") not in _VALID_MUTATION_CATEGORY:
        return False
    if not isinstance(data.get("key_differences"), list):
        return False
    if not isinstance(data.get("edge_cases_considered"), list):
        return False
    dist = data.get("distinguishing_input")
    if dist is not None and not isinstance(dist, str):
        return False
    if not isinstance(data.get("reasoning"), str):
        return False
    return True


@dataclass
class ClassifyResult:
    """All structured fields the model emits, plus usage / timing metadata."""

    classification: str
    confidence: str
    mutation_category: str
    key_differences: list[str]
    edge_cases_considered: list[str]
    distinguishing_input: str | None
    reasoning: str
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    latency_ms: int
    prompt_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "classification": self.classification,
            "confidence": self.confidence,
            "mutation_category": self.mutation_category,
            "key_differences": list(self.key_differences),
            "edge_cases_considered": list(self.edge_cases_considered),
            "distinguishing_input": self.distinguishing_input,
            "reasoning": self.reasoning,
        }


class OpenAIClassifier:
    """OpenAI chat classifier with JSON-schema structured output (GPT-4 family)."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini", max_retries: int = 5):
        load_package_env()
        key = api_key or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError(
                "Set OPENAI_API_KEY in the environment or thesis/code/python-classifier/.env"
            )
        if model not in ALLOWED_OPENAI_MODELS:
            raise ValueError(f'Unsupported model "{model}". Allowed: {sorted(ALLOWED_OPENAI_MODELS)}')

        self._client = OpenAI(api_key=key)
        self._model = model
        self._max_retries = max_retries

    def classify(self, system_prompt: str, user_prompt: str) -> ClassifyResult:
        prompt_hash = create_prompt_hash(system_prompt, user_prompt)
        t0 = time.perf_counter()

        delay_ms = 1000
        last_err: Exception | None = None
        completion = None
        for attempt in range(self._max_retries + 1):
            try:
                completion = self._client.chat.completions.create(
                    model=self._model,
                    temperature=0,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": CLASSIFICATION_SCHEMA_NAME,
                            "description": CLASSIFICATION_SCHEMA_DESCRIPTION,
                            "strict": True,
                            "schema": CLASSIFICATION_SCHEMA,
                        },
                    },
                )
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
                msg = str(e).lower()
                if attempt >= self._max_retries or ("429" not in msg and "rate" not in msg):
                    raise
                time.sleep(delay_ms / 1000.0)
                delay_ms = min(delay_ms * 2, 32000)

        if completion is None:
            raise last_err or RuntimeError("OpenAI classify failed")

        latency_ms = int((time.perf_counter() - t0) * 1000)
        raw = completion.choices[0].message.content or ""
        if not raw.strip():
            raise RuntimeError("OpenAIClassifier: empty completion content")

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"OpenAIClassifier: response is not valid JSON (prefix): {raw[:200]!r}") from None

        normalized = normalize_classification_payload(parsed)
        if not is_classification_result(normalized):
            raise RuntimeError("OpenAIClassifier: response does not match classification schema")

        usage = completion.usage
        dist = normalized.get("distinguishing_input")
        return ClassifyResult(
            classification=str(normalized["classification"]),
            confidence=str(normalized["confidence"]),
            mutation_category=str(normalized["mutation_category"]),
            key_differences=[str(x) for x in normalized.get("key_differences", [])],
            edge_cases_considered=[str(x) for x in normalized.get("edge_cases_considered", [])],
            distinguishing_input=None if dist is None else str(dist),
            reasoning=str(normalized["reasoning"]),
            input_tokens=getattr(usage, "prompt_tokens", None) if usage else None,
            output_tokens=getattr(usage, "completion_tokens", None) if usage else None,
            total_tokens=getattr(usage, "total_tokens", None) if usage else None,
            latency_ms=latency_ms,
            prompt_hash=prompt_hash,
        )


_RESPONSE_FORMAT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": CLASSIFICATION_SCHEMA_NAME,
        "description": CLASSIFICATION_SCHEMA_DESCRIPTION,
        "strict": True,
        "schema": CLASSIFICATION_SCHEMA,
    },
}


def _parse_classification_completion(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if not raw:
        raise RuntimeError("Classifier: empty completion content")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        if "```" in raw:
            inner = raw.split("```", 2)
            if len(inner) >= 2:
                chunk = inner[1].removeprefix("json").strip()
                try:
                    parsed = json.loads(chunk)
                except json.JSONDecodeError:
                    raise RuntimeError(f"Classifier: response is not valid JSON (prefix): {raw[:200]!r}") from None
            else:
                raise RuntimeError(f"Classifier: response is not valid JSON (prefix): {raw[:200]!r}") from None
        else:
            raise RuntimeError(f"Classifier: response is not valid JSON (prefix): {raw[:200]!r}") from None

    normalized = normalize_classification_payload(parsed)
    if not is_classification_result(normalized):
        raise RuntimeError("Classifier: response does not match classification schema")
    return normalized


class OpenRouterClassifier:
    """Classification via OpenRouter using LiteLLM (model id must start with ``openrouter/``).

    Set ``OPENROUTER_API_KEY`` (see https://openrouter.ai/). Example model id:
    ``openrouter/openai/gpt-4o-mini``.
    """

    def __init__(self, api_key: str | None = None, model: str = "openrouter/openai/gpt-4o-mini", max_retries: int = 5):
        load_package_env()
        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            raise RuntimeError(
                "Set OPENROUTER_API_KEY in the environment or thesis/code/python-classifier/.env "
                "when using OpenRouterClassifier."
            )
        mid = model.strip()
        if not mid.startswith("openrouter/"):
            raise ValueError(
                f'OpenRouterClassifier expects model starting with "openrouter/", got "{model}". '
                'Example: openrouter/openai/gpt-4o-mini'
            )
        self._model = mid
        self._api_key = key
        self._max_retries = max_retries

    def classify(self, system_prompt: str, user_prompt: str) -> ClassifyResult:
        prompt_hash = create_prompt_hash(system_prompt, user_prompt)
        t0 = time.perf_counter()
        messages: list[dict[str, str]] = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        delay_ms = 1000
        last_err: Exception | None = None
        raw = ""
        usage_prompt: int | None = None
        usage_completion: int | None = None
        usage_total: int | None = None

        for attempt in range(self._max_retries + 1):
            try:
                base_kw: dict[str, Any] = {
                    "model": self._model,
                    "messages": messages,
                    "api_key": self._api_key,
                    "temperature": 0,
                }
                resp = None
                last_schema_err: Exception | None = None
                for use_schema in (True, False):
                    kw = dict(base_kw)
                    if use_schema:
                        kw["response_format"] = _RESPONSE_FORMAT_JSON_SCHEMA
                    try:
                        resp = litellm.completion(**kw)
                        break
                    except Exception as err:  # noqa: BLE001
                        last_schema_err = err
                        if not use_schema:
                            raise
                        continue
                if resp is None:
                    raise last_schema_err or RuntimeError("OpenRouterClassifier: no completion response")

                choice = resp.choices[0].message
                raw = (choice.content or "").strip()

                u = getattr(resp, "usage", None)
                if u:
                    usage_prompt = getattr(u, "prompt_tokens", None)
                    usage_completion = getattr(u, "completion_tokens", None)
                    usage_total = getattr(u, "total_tokens", None)

                normalized = _parse_classification_completion(raw)
                dist = normalized.get("distinguishing_input")
                latency_ms = int((time.perf_counter() - t0) * 1000)
                return ClassifyResult(
                    classification=str(normalized["classification"]),
                    confidence=str(normalized["confidence"]),
                    mutation_category=str(normalized["mutation_category"]),
                    key_differences=[str(x) for x in normalized.get("key_differences", [])],
                    edge_cases_considered=[str(x) for x in normalized.get("edge_cases_considered", [])],
                    distinguishing_input=None if dist is None else str(dist),
                    reasoning=str(normalized["reasoning"]),
                    input_tokens=usage_prompt,
                    output_tokens=usage_completion,
                    total_tokens=usage_total,
                    latency_ms=latency_ms,
                    prompt_hash=prompt_hash,
                )
            except Exception as e:  # noqa: BLE001
                last_err = e
                msg = str(e).lower()
                if attempt >= self._max_retries or ("429" not in msg and "rate" not in msg):
                    raise
                time.sleep(delay_ms / 1000.0)
                delay_ms = min(delay_ms * 2, 32000)

        raise last_err or RuntimeError("OpenRouterClassifier: classify failed")


def make_classifier(model: str, max_retries: int = 5) -> ClassifierProtocol:
    """Route to OpenAI SDK or OpenRouter (LiteLLM) based on model id."""
    m = model.strip()
    if m.startswith("openrouter/"):
        return OpenRouterClassifier(model=m, max_retries=max_retries)
    return OpenAIClassifier(model=m, max_retries=max_retries)


def require_env_for_task_model(model: str) -> None:
    """Abort early with a clear message if the API key for ``model`` is missing."""
    if model.strip().startswith("openrouter/"):
        load_package_env()
        if not os.environ.get("OPENROUTER_API_KEY"):
            raise RuntimeError(
                "OPENROUTER_API_KEY is required for OpenRouter models "
                "(thesis/code/python-classifier/.env or environment)."
            )
    else:
        load_package_env()
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError(
                "OPENAI_API_KEY is required for native OpenAI models "
                "(thesis/code/python-classifier/.env or environment)."
            )


def classify_row(
    classifier: ClassifierProtocol,
    row: dict[str, str],
    window_or_full: int | str,
) -> tuple[ClassifyResult, dict[str, Any]]:
    ctx = extract_context(row["project"], row["file"], int(row["line"]), window_or_full)
    system, user = build_prompt(row, ctx)
    result = classifier.classify(system, user)
    return result, ctx
