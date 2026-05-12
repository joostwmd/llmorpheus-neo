/* eslint-disable no-multi-spaces */

import { hrtime } from 'process'
import { inspect } from 'util'
import { Matcher } from '../../src'
import { randomBytes } from 'crypto'
import { describe, jest, it } from '@jest/globals'

const goal = parseFloat(process.env.TIMING_GOAL ?? '1.0')
console.log(`timing goal is ${goal}`)

const specs = [
  '/',
  '/+',
  '/+/+',
  '/*',
  '/*/*',
  '/++',
  '/**',
  '/foo',
  '/foo/+',
  '/foo/+/+',
  '/foo/*',
  '/foo/*/*',
  '/foo/++',
  '/foo/**',
  '/+/bar',
  '/+/+/bar',
  '/*/bar',
  '/*/*/bar',
  '/++/bar',
  '/**/bar',
  '/foo/bar',
  '/foo/+/bar',
  '/foo/+/+/bar',
  '/foo/+/bar/+',
  '/foo/+/bar/*',
  '/foo/*/bar',
  '/foo/*/*/bar',
  '/foo/*/bar/+',
  '/foo/*/bar/*',
  '/foo/++/bar',
  '/foo/++/bar/+',
  '/foo/++/bar/*',
  '/foo/**/bar',
  '/foo/**/bar/+',
  '/foo/**/bar/*',
  '/:foo',
  '/:foo/bar',
  '/:foo/:bar',
  '/:foo/+/:bar',
  '/:foo/*/:bar',
  '/:foo/++/:bar',
  '/:foo/**/:bar'
]

const tests: Array<[string, (n: number) => string]> = [
  ['random bytes (plain)',                    (n: number) => randomBytes(n * 500).toString()],
  ['random bytes (leading slash)',            (n: number) => '/' + randomBytes(n * 500).toString()],
  ['random bytes (leading + trailing slash)', (n: number) => '/' + randomBytes(n * 500).toString() + '/'],
  ['random chars (plain)',                    (n: number) => randomBytes(n * 250).toString('hex')],
  ['random chars (leading slash)',            (n: number) => '/' + randomBytes(n * 250).toString('hex')],
  ['random chars (leading + trailing slash)', (n: number) => '/' + randomBytes(n * 250).toString('hex') + '/'],
  ['100 foos (valid)',                        (n: number) => '/foo'.repeat(n * 100)],
  ['100 foos (trailing slash)',               (n: number) => '/foo'.repeat(n * 100) + '/'],
  ['100 foobars (valid)',                     (n: number) => '/foo/bar'.repeat(n * 100)],
  ['100 foobars (trailing slash)',            (n: number) => '/foo/bar'.repeat(n * 100) + '/'],
  ['100 foobars + boo (valid)',               (n: number) => '/foo/bar'.repeat(n * 100) + '/boo'],
  ['100 foobars + boo (trailing slash)',      (n: number) => '/foo/bar'.repeat(n * 100) + '/boo/'],
  ['one big segment (valid)',                 (n: number) => '/' + 'a'.repeat(n * 500)],
  ['one big segment (trailing slash)',        (n: number) => '/' + 'a'.repeat(n * 500) + '/'],
  ['a few big segments (valid)',              (n: number) => ('/' + 'a'.repeat(500)).repeat(n)],
  ['a few big segments (trailing slash)',     (n: number) => ('/' + 'a'.repeat(500)).repeat(n) + '/'],
  ['many small segments (valid)',             (n: number) => ('/' + 'a'.repeat(10)).repeat(50 * n)],
  ['many small segments (trailing slash)',    (n: number) => ('/' + 'a'.repeat(10)).repeat(50 * n) + '/']
]

jest.setTimeout(10000)

describe('compiled regex for', () => {
  for (const spec of specs) {
    describe('path spec "' + spec + '"', () => {
      for (const test of tests) {
        it('is not vulnerable to ' + test[0], () => {
          runTest(Matcher.for(spec), test[1])
        })
      }
    })
  }
})

/** Time the execution of a matcher against a set of similar
  * but increasingly complex test inputs, checking that the
  * jump in execution time between each step is linear(ish)
  * or better. */
function runTest (matcher: Matcher, fn: (n: number) => string): void {
  const scores: Array<{
    n: number
    t: number
    m?: number
  }> = [{
    n: 1,
    t: runTestLoop(matcher, fn(1))
  }]
  for (let n = 2, s = 0; n < 16; n *= 2, s++) {
    const t = runTestLoop(matcher, fn(n))
    scores.push({
      n,
      t,
      m: t / (scores[s].t * 2)
    })
  }
  if (scores.filter((score) => score.m !== undefined && score.m > goal).length > 2) {
    throw new Error('non-linear increase in execution time: ' + inspect(scores))
  }
}

/** Time the execution of a matcher against a test input.
  * @returns Average execution time in nanoseconds. */
function runTestLoop (matcher: Matcher, path: string): number {
  const maxTime = BigInt(500000000)
  const maxIter = 20000
  const perStep = 1000
  const before = hrtime.bigint()
  for (let i = 0, k = 0; i < maxIter; i += k, k = 0) {
    for (; k < perStep; k++) {
      path.match(matcher)
    }
    /* Short-circuit if the test is taking too long. */
    const curTime = hrtime.bigint() - before
    if (curTime > maxTime) {
      return Number(curTime) / (i + k)
    }
  }
  return Number(hrtime.bigint() - before) / maxIter
}
