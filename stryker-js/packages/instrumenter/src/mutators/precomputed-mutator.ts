import fs from 'fs';

import { parseExpression, parse } from '@babel/parser';

import { NodeMutator } from './node-mutator.js';

/*
 * A mutator that loads mutants from a JSON file.
 *
 * The location of the JSON file is specified by the MUTANTS_FILE environment
 * variable. It should contain an array of objects with the following fields:
 *
 *   - file: the file name
 *   - startLine: the start line of the mutant (1-based)
 *   - startColumn: the start column of the mutant (0-based)
 *   - endLine: the end line of the mutant (1-based)
 *   - endColumn: the end column of the mutant (0-based, exclusive)
 *   - replacement: the replacement code
 */

interface Loc {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

function mkKey(loc: Loc): string {
  return `${loc.file}:${loc.startLine}:${loc.startColumn}:${loc.endLine}:${loc.endColumn}`;
}

const mutantsFile = process.env.MUTANTS_FILE;
const mutants = new Map<string, string[]>();
let initialized = false;
let packagePath = '';

export function initializePrecomputedMutator(pPath: string): void {
  if (initialized) {
    // avoid reinitialization (this function is invoked for each file)
    return;
  }
  packagePath = pPath;
  initialized = true;
  if (!mutantsFile) {
    throw new Error('MUTANTS_FILE env variable is not defined');
  }
  let i = 1;
  for (const loc of JSON.parse(fs.readFileSync(mutantsFile, 'utf8')) as Array<Loc & { replacement: string }>) {
    i++;
    if (loc.file.startsWith('./')) {
      loc.file = loc.file.substring(2);
    }
    const replacements = mutants.get(mkKey(loc));
    if (replacements === undefined) {
      mutants.set(mkKey(loc), [loc.replacement]);
    } else {
      replacements.push(loc.replacement);
    }
  }
  console.log(`*** retrieving ${i - 1} mutants from ${mutantsFile} ***`);
}

export const precomputedMutator: NodeMutator = {
  name: 'PrecomputedMutator',

  *mutate(fileName, path) {
    const { loc } = path.node;
    if (loc) {
      const key = mkKey({
        file: fileName.substring(packagePath.length + 1),
        startLine: loc.start.line,
        startColumn: loc.start.column,
        endLine: loc.end.line,
        endColumn: loc.end.column,
      });
      const replacements = mutants.get(key);
      if (replacements !== undefined) {
        for (const replacement of replacements) {
          try {
            if (path.isExpression()) {

              // apparently, the parser does not always detect invalid RegExp literals
              // check if the replacement contains a RegExp, and if so validate it
              const startOfRegExp = replacement.indexOf('/');
              if (startOfRegExp !== -1) {
                const endOfRegExp = replacement.indexOf('/', startOfRegExp + 1);
                if (endOfRegExp !== -1) {
                  const regExp = replacement.substring(startOfRegExp, endOfRegExp + 1);
                  new RegExp(regExp); // validate RegExp -- will throw an exception if invalid
                }
              }

              // parse replacement as expression
              yield parseExpression(replacement);
            } else {
              // parse replacement as program and extract the first statement
              yield parse(replacement, {
                allowAwaitOutsideFunction: true,
                allowImportExportEverywhere: true,
                allowReturnOutsideFunction: true,
                allowSuperOutsideMethod: true,
                allowUndeclaredExports: true,
                allowNewTargetOutsideFunction: true,
              }).program.body[0];
            }
          } catch (e) {
            console.error(`failed to parse replacement ${replacement}: ${e}`);
          }
        }
      }
    }
  },
};
