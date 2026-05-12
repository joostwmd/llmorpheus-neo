"""JSON Schema for OpenAI structured outputs.

Extended beyond the original {classification, reasoning} to capture diagnostic
intermediates that the GEPA reflection LM can analyze:

- confidence            : self-reported certainty (catches lucky guesses vs systematic errors)
- mutation_category     : coarse type of edit (helps spot category-specific failures)
- key_differences       : concrete semantic differences considered
- edge_cases_considered : inputs/conditions checked (NaN, undefined, empty, ...)
- distinguishing_input  : concrete input under which original vs mutant differ (null if EQUIVALENT)

All fields are required and additionalProperties is forbidden so the model
emits a stable, indexable record per evaluation.
"""

CLASSIFICATION_SCHEMA_NAME = "mutant_classification"

CLASSIFICATION_SCHEMA_DESCRIPTION = (
    "Classify the code mutation as equivalent or behavior-changing and produce structured "
    "diagnostic intermediates that downstream tooling can analyze across many mutants."
)

CLASSIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "classification": {
            "type": "string",
            "enum": ["EQUIVALENT", "BEHAVIORAL_CHANGE"],
            "description": (
                "Whether the mutant is semantically equivalent to the original or changes behavior."
            ),
        },
        "confidence": {
            "type": "string",
            "enum": ["LOW", "MEDIUM", "HIGH"],
            "description": (
                "Self-reported certainty in the classification. LOW = guess; HIGH = confident."
            ),
        },
        "mutation_category": {
            "type": "string",
            "enum": [
                "operator_swap",
                "constant_change",
                "method_swap",
                "boundary_change",
                "branch_flip",
                "deletion",
                "other",
            ],
            "description": "Coarse-grained category of the edit between original and replacement.",
        },
        "key_differences": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Concrete semantic differences identified between original and mutant. "
                "Use [] only if the two are textually identical or differ only in whitespace."
            ),
        },
        "edge_cases_considered": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Inputs/conditions explicitly considered: e.g. NaN, undefined, null, empty array, "
                "negative numbers, integer overflow, short-circuit evaluation, type coercion."
            ),
        },
        "distinguishing_input": {
            "type": ["string", "null"],
            "description": (
                "A concrete input or call site under which original and mutant produce different "
                "observable behavior. Null if and only if classification == EQUIVALENT."
            ),
        },
        "reasoning": {
            "type": "string",
            "description": "Short prose justification (1-3 sentences).",
        },
    },
    "required": [
        "classification",
        "confidence",
        "mutation_category",
        "key_differences",
        "edge_cases_considered",
        "distinguishing_input",
        "reasoning",
    ],
    "additionalProperties": False,
}
