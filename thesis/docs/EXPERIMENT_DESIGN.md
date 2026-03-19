# LLMorpheus Replication and Extension — Experimental Design

This document records the experimental design, configurations, and cost calculations for replicating and extending the LLMorpheus paper.

**Pricing source:** OpenRouter (openrouter.ai/models). Prices as of March 2025; verify before running experiments.

---

## Part 1: Replication Phase

### Purpose

Validate that the experimental pipeline produces results consistent with the original paper.

### Configuration

| Parameter | Value |
|-----------|-------|
| Prompt template | FULL |
| Temperature | 0.0 |
| Models | gpt-4o-mini, llama-3.3-70b-instruct |
| Packages | All 13 |
| Runs per model | 3 |
| Total runs | 2 × 13 × 3 = 78 |

### Prerequisites

- Clone all 13 benchmark packages at exact commits from `llmorpheus/.github/benchmarks.json`
- Apply package edits from benchmarks.json
- Build LLMorpheus and modified Stryker (neu-se/stryker-js)

### Estimated cost

~$16

---

## Part 2: New-Model Benchmark Phase

### Purpose

Compare modern models under controlled conditions. Reasoning models (o-series, Claude thinking, Gemini with thinking) appeared after the original paper was published and represent an extension of the benchmark.

### Cost assumptions

- Paper reports ~22.7M tokens for 13 packages (~19.5M input, ~3.2M output)
- For 8 packages: ~14M tokens per run (~11.5M input, ~2M output)
- Pricing source: OpenRouter (prices as of March 2025; verify at openrouter.ai/models)

### OpenRouter pricing — standard models (OpenAI, Anthropic, Google)

| Model | OpenRouter ID | Input $/M | Output $/M | Cost per run (8 pkg) |
|-------|---------------|-----------|------------|----------------------|
| GPT-4o Mini | openai/gpt-4o-mini | $0.15 | $0.60 | ~$2.50 |
| GPT-4o | openai/gpt-4o | $2.50 | $10.00 | ~$50 |
| Claude 3.5 Sonnet | anthropic/claude-3.5-sonnet | $3.00 | $15.00 | ~$65 |
| Claude Sonnet 4.5 | anthropic/claude-sonnet-4.5 | $3.00 | $15.00 | ~$65 |
| Claude Opus 4.5 | anthropic/claude-opus-4.5 | $5.00 | $25.00 | ~$108 |
| Gemini 2.5 Pro | google/gemini-2.5-pro | $1.25 | $10.00 | ~$24 |
| Gemini 2.0 Flash | google/gemini-2.0-flash-001 | $0.10 | $0.40 | ~$1.90 |
| Gemini 2.0 Flash (free) | google/gemini-2.0-flash-exp:free | $0 | $0 | $0 (rate limited) |
| Llama 3.3-70B | meta-llama/llama-3.3-70b-instruct | $0.10–0.13 | $0.32–0.40 | ~$2.40 |
| Codestral | mistralai/codestral-2501 | ~$0.20 | ~$0.60 | ~$3.50 |

### OpenRouter pricing — reasoning models (post-paper)

Reasoning models use extended "thinking" or chain-of-thought before output. Some charge for internal reasoning tokens; actual cost may exceed input+output when reasoning is enabled.

| Model | OpenRouter ID | Input $/M | Output $/M | Notes | Cost per run (8 pkg, est.) |
|-------|---------------|-----------|------------|-------|----------------------------|
| o4 Mini | openai/o4-mini | $1.10 | $4.40 | OpenAI reasoning; no separate reasoning token charge | ~$21 |
| Claude 3.7 Sonnet (thinking) | anthropic/claude-3.7-sonnet:thinking | $3.00 | $15.00 | Hybrid reasoning; may have internal reasoning tokens | ~$65+ |
| Gemini 2.5 Pro | google/gemini-2.5-pro | $1.25 | $10.00 | "Thinking" capabilities; context-dependent pricing | ~$24 |
| Claude Opus 4.5 | anthropic/claude-opus-4.5 | $5.00 | $25.00 | Frontier reasoning; may have internal reasoning tokens | ~$108+ |

### Other options

| Model | Notes |
|-------|-------|
| Llama 3.1-8B (Ollama) | $0 if run locally |
| Llama 3.1-8B (API) | ~$0.20/M via OpenRouter |

---

## Part 3: Scenario Definitions and Cost Calculations

### Scenario A: Baseline — Models Only

| Parameter | Value |
|-----------|-------|
| Prompt template | FULL (fixed) |
| Temperature | 0.0 (fixed) |
| Models | 4–8 |
| Packages | 8 |
| Runs | 3 per config |
| Total runs | 96–192 |

| Model set | Models | Total runs | Estimated cost |
|-----------|--------|------------|----------------|
| 4 models (standard) | gpt-4o-mini, Llama 3.3-70B, Gemini 2.0 Flash, Codestral | 96 | ~$240 |
| 6 models (+ gpt-4o, Claude Sonnet 4.5) | + gpt-4o, Claude Sonnet 4.5 | 144 | ~$2,800 |
| 4 models + 2 reasoning | + o4 Mini, Claude 3.7 Sonnet (thinking) | 144 | ~$680 |
| 8 models (standard + reasoning) | gpt-4o-mini, gpt-4o, Claude Sonnet 4.5, Claude Opus 4.5, Gemini 2.0 Flash, Gemini 2.5 Pro, o4 Mini, Llama 3.3-70B | 192 | ~$4,500+ |

---

### Scenario B: Temperature Variation

| Parameter | Value |
|-----------|-------|
| Prompt template | FULL (fixed) |
| Temperature | 0.0, 0.25, 0.5 |
| Models | 4 |
| Packages | 8 |
| Runs | 3 per config |
| Total runs | 288 |

Estimated cost: ~$400–450

---

### Scenario C: Prompt Template Variation

| Parameter | Value |
|-----------|-------|
| Prompt template | FULL, NOEXPLANATION, BASIC |
| Temperature | 0.0 (fixed) |
| Models | 4 |
| Packages | 8 |
| Runs | 3 per config |
| Total runs | 288 |

Estimated cost: ~$400–450

---

### Scenario D: Sensitivity Check (Single Model)

| Parameter | Value |
|-----------|-------|
| Model | gpt-4o-mini |
| Prompt template | FULL, NOEXPLANATION, BASIC |
| Temperature | 0.0, 0.5 |
| Packages | 3 |
| Runs | 3 per config |
| Total runs | 54 |

Estimated cost: ~$20

---

### Scenario E: Full Factorial — Temperatures × Prompt Templates × All Models

| Parameter | Value |
|-----------|-------|
| Models | 4–6 |
| Packages | 8 |
| Prompt templates | FULL, NOEXPLANATION, BASIC |
| Temperatures | 0.0, 0.25, 0.5 |
| Runs | 3 per config |
| Total runs | 4 × 8 × 3 × 3 × 3 = 864 (4 models); 1,296 (6 models) |

**Calculation:**

- Configurations per model: 3 templates × 3 temperatures = 9
- Pipeline runs per config: 3 (repetitions)
- Total pipeline runs per model: 9 × 3 = 27
- Cost per pipeline run = cost for 8 packages (from Part 2 tables)

**Variant E1 — 4 standard models:**

| Model | Pipeline runs | Cost per run | Total cost |
|-------|---------------|---------------|------------|
| gpt-4o-mini | 27 | ~$2.50 | ~$68 |
| Llama 3.3-70B | 27 | ~$2.40 | ~$65 |
| Gemini 2.0 Flash | 27 | ~$1.90 | ~$51 |
| Codestral | 27 | ~$3.50 | ~$95 |
| **Total** | **108** | — | **~$279** |

**Variant E2 — 4 models including 2 reasoning:**

| Model | Pipeline runs | Cost per run | Total cost |
|-------|---------------|---------------|------------|
| gpt-4o-mini | 27 | ~$2.50 | ~$68 |
| Llama 3.3-70B | 27 | ~$2.40 | ~$65 |
| o4 Mini | 27 | ~$21 | ~$567 |
| Claude 3.7 Sonnet (thinking) | 27 | ~$65+ | ~$1,755+ |
| **Total** | **108** | — | **~$2,455+** |

**Variant E3 — 6 models (standard + reasoning):**

| Model | Pipeline runs | Cost per run | Total cost |
|-------|---------------|---------------|------------|
| gpt-4o-mini | 27 | ~$2.50 | ~$68 |
| Gemini 2.0 Flash | 27 | ~$1.90 | ~$51 |
| Gemini 2.5 Pro | 27 | ~$24 | ~$648 |
| Llama 3.3-70B | 27 | ~$2.40 | ~$65 |
| o4 Mini | 27 | ~$21 | ~$567 |
| Claude Sonnet 4.5 | 27 | ~$65 | ~$1,755 |
| **Total** | **162** | — | **~$3,154** |

---

## Part 4: Prompt Template Definitions (from paper RQ4)

| Template | Description |
|----------|-------------|
| FULL | Complete prompt: system prompt, code with placeholder, instructions, explanation request |
| ONEMUTATION | Asks for one mutant instead of multiple |
| NOEXPLANATION | Removes reasoning/explanation request |
| NOINSTRUCTIONS | Removes mutation testing instructions |
| GEN.SYSTEM PROMPT | Generic system prompt instead of mutation-specific |
| BASIC | Minimal: only asks for replacement, no context |

---

## Part 5: Provider Information

| Model | Original paper provider | Current options |
|-------|------------------------|-----------------|
| gpt-4o-mini | OpenAI | OpenAI API |
| codellama-34b-instruct | OctoAI | OctoAI ceased operations |
| codellama-13b-instruct | OctoAI | OctoAI ceased operations |
| mixtral-8x7b-instruct | OctoAI | OctoAI ceased operations |
| llama-3.3-70b-instruct | OpenRouter | OpenRouter (e.g. AkashML fp16) |

---

## Part 6: Cost Summary by Scenario

| Scenario | Total runs | Estimated cost |
|----------|------------|----------------|
| Replication | 78 | ~$16 |
| A (4 standard models) | 96 | ~$240 |
| A (6 models, + gpt-4o, Claude) | 144 | ~$2,800 |
| A (4 standard + 2 reasoning) | 144 | ~$680 |
| B (temperature variation) | 288 | ~$400–450 |
| C (prompt template variation) | 288 | ~$400–450 |
| D (sensitivity, 1 model) | 54 | ~$20 |
| E1 (full factorial, 4 standard models) | 864 | ~$279 |
| E2 (full factorial, 4 models incl. 2 reasoning) | 864 | ~$2,455+ |
| E3 (full factorial, 6 models) | 1,296 | ~$3,154 |

---

## Part 7: Paper Findings (RQ3, RQ4)

- FULL prompt yields the most and best mutants
- BASIC is most creative but noisiest; many low-quality mutants
- Removing the explanation reduces mutant quality
- Temperature 1.0: more syntactically invalid mutants
- Temperature 0.0: nearly identical mutants across runs, low variety
- Prompt variations were tested only on codellama-34b-instruct in the original paper

---

## Part 8: Reasoning Models (Post-Paper)

Reasoning models (OpenAI o-series, Claude thinking variants, Gemini with thinking) were released after the LLMorpheus paper. They use extended chain-of-thought or internal reasoning before producing output. Including them in benchmarks is a natural extension because:

- The original paper did not evaluate reasoning-capable models
- Mutation generation may benefit from explicit reasoning about code transformations
- Cost structures differ (some charge for internal reasoning tokens)

Candidates for the reasoning-model benchmark: o4 Mini, Claude 3.7 Sonnet (thinking), Claude Opus 4.5, Gemini 2.5 Pro.
