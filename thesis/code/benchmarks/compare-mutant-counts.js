#!/usr/bin/env node
// Compare mutant counts between original and replay mutants.json to identify differences.
// Usage:
//   node thesis/code/benchmarks/compare-mutant-counts.js <original-mutants.json> <replay-mutants.json>
//   node thesis/code/benchmarks/compare-mutant-counts.js --filter <original> <replay> <output.json>
//     Writes replay mutants that exist in original (exact 955 match) to output.json

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const filterMode = args[0] === '--filter';
const [origPath, replayPath, outPath] = filterMode ? args.slice(1) : args;

if (!origPath || !replayPath) {
  console.error('Usage: node compare-mutant-counts.js [--filter] <original-mutants.json> <replay-mutants.json> [output.json]');
  process.exit(1);
}
if (filterMode && !outPath) {
  console.error('--filter requires output path: ... <output.json>');
  process.exit(1);
}

const orig = JSON.parse(fs.readFileSync(origPath, 'utf8'));
const replay = JSON.parse(fs.readFileSync(replayPath, 'utf8'));

function key(m) {
  return `${m.file}:${m.startLine},${m.startColumn}-${m.endLine},${m.endColumn}`;
}

function sig(m) {
  const orig = m.originalCode || m.original || '';
  const repl = m.replacement || '';
  return `${key(m)} ||| ${orig} -> ${repl}`;
}

const origSet = new Set(orig.map(sig));
const replaySet = new Set(replay.map(sig));

const onlyInReplay = replay.filter(m => !origSet.has(sig(m)));
const onlyInOrig = orig.filter(m => !replaySet.has(sig(m)));

console.log('Original:', orig.length, 'mutants');
console.log('Replay:', replay.length, 'mutants');
console.log('Only in replay (extra):', onlyInReplay.length);
console.log('Only in original (missing):', onlyInOrig.length);

if (onlyInReplay.length > 0) {
  console.log('\n--- Sample of EXTRA mutants (in replay, not original): ---');
  onlyInReplay.slice(0, 5).forEach((m, i) => {
    console.log(`${i + 1}. ${key(m)}`);
    const o = (m.originalCode || m.original || '').slice(0, 50);
    const r = (m.replacement || '').slice(0, 50);
    console.log(`   "${o}..." -> "${r}..."`);
    console.log(`   reason: ${m.reason || m.feature || '?'}`);
  });
}

if (onlyInOrig.length > 0) {
  console.log('\n--- Sample of MISSING mutants (in original, not replay): ---');
  onlyInOrig.slice(0, 5).forEach((m, i) => {
    console.log(`${i + 1}. ${key(m)}`);
    const o = (m.originalCode || m.original || '').slice(0, 50);
    const r = (m.replacement || '').slice(0, 50);
    console.log(`   "${o}..." -> "${r}..."`);
    console.log(`   reason: ${m.reason || m.feature || '?'}`);
  });
}

// --filter: write only mutants that exist in original
if (filterMode) {
  const inBoth = replay.filter(m => origSet.has(sig(m)));
  fs.writeFileSync(outPath, JSON.stringify(inBoth, null, 2));
  console.log(`\nWrote ${inBoth.length} matching mutants to ${outPath}`);
}
