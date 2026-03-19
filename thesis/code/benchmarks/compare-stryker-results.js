#!/usr/bin/env node
/**
 * Deep-compare Stryker results between two runs.
 * Parses StrykerOutput.txt format and compares per-mutant status (Killed/Survived/Timeout).
 *
 * Usage: node benchmarks/compare-stryker-results.js <your-StrykerOutput.txt> <original-StrykerOutput.txt>
 *
 * Example:
 *   node thesis/code/benchmarks/compare-stryker-results.js \
 *     thesis/code/benchmarks/libs/Complex.js/StrykerOutput.txt \
 *     source/mutation-testing-data/codellama-13b-instruct/template-full-0.0/run358/projects/Complex.js/StrykerOutput.txt
 */

const fs = require('fs');
const path = require('path');

function parseStrykerOutput(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const results = new Map(); // key -> status

  // Split by status blocks: [Killed], [Survived], [Timeout]
  const blocks = content.split(/\n\[(Killed|Survived|Timeout)\] PrecomputedMutator\n/);
  // blocks[0]=preamble, blocks[1]=status, blocks[2]=block, blocks[3]=status, ...
  for (let i = 1; i < blocks.length - 1; i += 2) {
    const status = blocks[i];
    const block = blocks[i + 1];
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const locMatch = lines[0].match(/^(\S+):(\d+):(\d+)$/);
    if (!locMatch) continue;

    const [, file, line, col] = locMatch;
    const originalLines = [];
    const replacementLines = [];
    let phase = null;

    for (let j = 1; j < lines.length; j++) {
      const lineStr = lines[j];
      if (lineStr.startsWith('-')) {
        phase = 'original';
        originalLines.push(lineStr.replace(/^\s*-\s*/, ''));
      } else if (lineStr.startsWith('+')) {
        phase = 'replacement';
        replacementLines.push(lineStr.replace(/^\s*\+\s*/, ''));
      } else if (phase && lineStr.trim() === '') {
        // empty line within block, keep in current phase
        if (phase === 'original') originalLines.push('');
        else replacementLines.push('');
      }
    }

    const original = originalLines.join('\n').trim();
    const replacement = replacementLines.join('\n').trim();
    const key = JSON.stringify({ file, line: parseInt(line), col: parseInt(col), original, replacement });
    results.set(key, status);
  }

  return results;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node compare-stryker-results.js <your-StrykerOutput.txt> <original-StrykerOutput.txt>');
    process.exit(1);
  }

  const [yoursPath, originalPath] = args;
  const root = path.resolve(__dirname, '..');

  const yoursFile = path.isAbsolute(yoursPath) ? yoursPath : path.join(root, yoursPath);
  const originalFile = path.isAbsolute(originalPath) ? originalPath : path.join(root, originalPath);

  if (!fs.existsSync(yoursFile)) {
    console.error(`Your file not found: ${yoursFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(originalFile)) {
    console.error(`Original file not found: ${originalFile}`);
    process.exit(1);
  }

  const yours = parseStrykerOutput(yoursFile);
  const original = parseStrykerOutput(originalFile);

  console.log('=== Stryker Results Comparison ===\n');
  console.log(`Your run:     ${yours.size} mutants`);
  console.log(`Original run: ${original.size} mutants\n`);

  const allKeys = new Set([...yours.keys(), ...original.keys()]);
  let matchCount = 0;
  let mismatchCount = 0;
  const onlyYours = [];
  const onlyOriginal = [];
  const mismatches = [];

  for (const key of allKeys) {
    const y = yours.get(key);
    const o = original.get(key);

    if (y && o) {
      if (y === o) {
        matchCount++;
      } else {
        mismatchCount++;
        const parsed = JSON.parse(key);
        mismatches.push({ ...parsed, yoursStatus: y, originalStatus: o });
      }
    } else if (y) {
      onlyYours.push(JSON.parse(key));
    } else {
      onlyOriginal.push(JSON.parse(key));
    }
  }

  console.log('--- Summary ---');
  console.log(`Matching status:    ${matchCount}`);
  console.log(`Different status:   ${mismatchCount}`);
  console.log(`Only in your run:   ${onlyYours.length}`);
  console.log(`Only in original:   ${onlyOriginal.length}`);

  if (mismatchCount > 0) {
    console.log('\n--- Mutants with different status (first 20) ---');
    mismatches.slice(0, 20).forEach((m, i) => {
      console.log(`\n${i + 1}. ${m.file}:${m.line}:${m.col}`);
      console.log(`   Original:  "${m.original}"`);
      console.log(`   Replace:   "${m.replacement.substring(0, 60)}${m.replacement.length > 60 ? '...' : ''}"`);
      console.log(`   You: ${m.yoursStatus} | Original: ${m.originalStatus}`);
    });
    if (mismatches.length > 20) {
      console.log(`\n... and ${mismatches.length - 20} more`);
    }
  }

  if (onlyYours.length > 0) {
    console.log('\n--- Sample mutants only in your run ---');
    onlyYours.slice(0, 5).forEach(m => console.log(`  ${m.file}:${m.line}:${m.col} "${m.original}" -> "${m.replacement.substring(0, 40)}..."`));
  }

  if (onlyOriginal.length > 0) {
    console.log('\n--- Sample mutants only in original ---');
    onlyOriginal.slice(0, 5).forEach(m => console.log(`  ${m.file}:${m.line}:${m.col} "${m.original}" -> "${m.replacement.substring(0, 40)}..."`));
  }

  const pctMatch = allKeys.size > 0 ? ((matchCount / allKeys.size) * 100).toFixed(1) : 0;
  console.log(`\n=== ${pctMatch}% of mutants have matching status ===`);

  if (onlyYours.length > 0) {
    console.log('\nNote: "Only in your run" = survived locally but killed/timeout in original.');
    console.log('      Likely due to Node version or test-environment differences.');
  }
}

main();
