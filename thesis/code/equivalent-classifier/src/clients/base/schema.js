/**
 * Shared structured-output schema for all classification providers.
 * Maps to human labels: EQUIVALENT ↔ "Equivalent", BEHAVIORAL_CHANGE ↔ "Behavioral Change".
 */

/** JSON Schema object for OpenAI `response_format.json_schema.schema` (strict mode). */
export const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    classification: {
      type: "string",
      enum: ["EQUIVALENT", "BEHAVIORAL_CHANGE"],
      description:
        "Whether the mutant is semantically equivalent to the original or changes behavior.",
    },
    reasoning: {
      type: "string",
      description: "Short justification for the classification.",
    },
  },
  required: ["classification", "reasoning"],
  additionalProperties: false,
};

export const CLASSIFICATION_SCHEMA_NAME = "mutant_classification";

export const CLASSIFICATION_SCHEMA_DESCRIPTION =
  "Classify the code mutation as equivalent or behavior-changing and give a brief reason.";

/**
 * @typedef {{ classification: 'EQUIVALENT' | 'BEHAVIORAL_CHANGE', reasoning: string }} ClassificationResult
 */

/**
 * @param {unknown} data
 * @returns {data is ClassificationResult}
 */
export function isClassificationResult(data) {
  if (!data || typeof data !== "object") return false;
  const c = /** @type {{ classification?: unknown; reasoning?: unknown }} */ (data);
  return (
    (c.classification === "EQUIVALENT" ||
      c.classification === "BEHAVIORAL_CHANGE") &&
    typeof c.reasoning === "string"
  );
}
