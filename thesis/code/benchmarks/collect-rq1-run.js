#!/usr/bin/env node
"use strict";

/**
 * Collect one completed run into a package->model->runs directory layout.
 *
 * Usage example:
 *   node thesis/code/benchmarks/collect-rq1-run.js \
 *     --project-dir thesis/code/benchmarks/libs/image-downloader \
 *     --package image-downloader \
 *     --model openai/gpt-4o-mini \
 *     --template template-full \
 *     --temperature 0.0 \
 *     --dest-root thesis/runs/rq1
 *
 * Output:
 *   <dest-root>/package=<pkg>/model=<modelSafe>/run-00N/
 *     mutants.json
 *     summary.json
 *     StrykerInfo.json
 *     StrykerOutput.txt
 *     LLMorpheusOutput.txt
 *     meta.json
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = value;
  }
  return out;
}

function must(args, key) {
  if (!args[key]) {
    throw new Error(`Missing required --${key}`);
  }
  return args[key];
}

function normalizeTemperature(raw) {
  const t = String(raw ?? "0.0").trim();
  if (t === "0") return "0.0";
  if (t === "1") return "1.0";
  return t;
}

function modelSafe(model) {
  return model.replaceAll("/", "_");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRequired(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error(`Required file not found: ${src}`);
  }
  fs.copyFileSync(src, dst);
}

function copyOptional(src, dst) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
}

function nextRunDir(baseRunsDir) {
  ensureDir(baseRunsDir);
  const existing = fs
    .readdirSync(baseRunsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^run-\d{3}$/.test(d.name))
    .map((d) => Number(d.name.slice(4)));
  const n = existing.length === 0 ? 1 : Math.max(...existing) + 1;
  return `run-${String(n).padStart(3, "0")}`;
}

function main() {
  const args = parseArgs(process.argv);

  const projectDir = path.resolve(must(args, "project-dir"));
  const packageName = must(args, "package");
  const model = must(args, "model");
  const template = args.template || "template-full";
  const temperature = normalizeTemperature(args.temperature || "0.0");
  const destRoot = path.resolve(args["dest-root"] || "thesis/runs/rq1");

  const modelDir = path.join(destRoot, `package=${packageName}`, `model=${modelSafe(model)}`);
  const runName = args.run || nextRunDir(modelDir);
  const runDir = path.join(modelDir, runName);
  ensureDir(runDir);

  const mutationSubDir = `${template}_${modelSafe(model)}_${temperature}`;
  const mutantsPath = path.join(projectDir, "MUTATION_TESTING", mutationSubDir, "mutants.json");
  const summaryPath = path.join(projectDir, "MUTATION_TESTING", mutationSubDir, "summary.json");
  const strykerInfoPath = path.join(projectDir, "StrykerInfo.json");
  const strykerOutPath = path.join(projectDir, "StrykerOutput.txt");
  const llmOutPath = path.join(projectDir, "LLMorpheusOutput.txt");

  copyRequired(mutantsPath, path.join(runDir, "mutants.json"));
  copyRequired(summaryPath, path.join(runDir, "summary.json"));
  copyRequired(strykerInfoPath, path.join(runDir, "StrykerInfo.json"));
  copyOptional(strykerOutPath, path.join(runDir, "StrykerOutput.txt"));
  copyOptional(llmOutPath, path.join(runDir, "LLMorpheusOutput.txt"));

  const meta = {
    collectedAt: new Date().toISOString(),
    package: packageName,
    model,
    template,
    temperature,
    run: runName,
    source: {
      projectDir,
      mutantsPath,
      summaryPath,
      strykerInfoPath,
      strykerOutPath: fs.existsSync(strykerOutPath) ? strykerOutPath : null,
      llmOutPath: fs.existsSync(llmOutPath) ? llmOutPath : null,
    },
  };
  fs.writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  console.log(`Collected run into: ${runDir}`);
}

if (require.main === module) {
  main();
}
