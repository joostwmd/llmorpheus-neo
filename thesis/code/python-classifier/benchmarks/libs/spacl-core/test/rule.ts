/* eslint-disable no-multi-spaces */

import { strictEqual } from 'assert'
import { describe, it } from '@jest/globals'
import { QueryContext, Rule } from '../src'

describe('rule', () => {
  it('matches paths correctly', () => {
    runTests({
      rule: Rule.for('/yeah'),
      tests: [
        ['/',     false],
        ['/nah',  false],
        ['/yeah', true]
      ]
    })
    runTests({
      rule: Rule.for('/+'),
      tests: [
        ['/',         false],
        ['/yeah',     true],
        ['/yeah/nah', false]
      ]
    })
    runTests({
      rule: Rule.for('/*/*'),
      tests: [
        ['/',         false],
        ['/nah',      false],
        ['/nah/yeah', true]
      ]
    })
  })
  it('matches context-dependent paths correctly', () => {
    runTests({
      rule: Rule.for('/:maybe'),
      tests: [
        ['/',     false],
        ['/nah',  false]
      ]
    })
    runTests({
      rule: Rule.for('/:maybe'),
      ctx: {
        maybe: 'yeah'
      },
      tests: [
        ['/',     false],
        ['/nah',  false],
        ['/yeah', true]
      ]
    })
  })
  it('answers queries correctly', () => {
    runTests({
      rule: Rule
        .for('/test')
        .deny('foo')
        .allow('bar'),
      tests: [
        ['/',     false, 'foo', null],
        ['/',     false, 'bar', null],
        ['/',     false, 'boo', null],
        ['/test', true,  'foo', false],
        ['/test', true,  'bar', true],
        ['/test', true,  'boo', null]
      ]
    })
  })
  it('answers context-dependent queries correctly', () => {
    runTests({
      rule: Rule
        .for('/:maybe')
        .deny('foo')
        .allow('bar'),
      tests: [
        ['/nah', false, 'foo', null],
        ['/nah', false, 'bar', null],
        ['/nah', false, 'boo', null]
      ]
    })
    runTests({
      rule: Rule
        .for('/:maybe')
        .deny('foo')
        .allow('bar'),
      ctx: {
        maybe: 'yeah'
      },
      tests: [
        ['/nah',  false, 'foo', null],
        ['/nah',  false, 'bar', null],
        ['/nah',  false, 'boo', null],
        ['/yeah', true,  'foo', false],
        ['/yeah', true,  'bar', true],
        ['/yeah', true,  'boo', null]
      ]
    })
  })
  it('prioritises deny over allow', () => {
    strictEqual(
      Rule
        .for('/test')
        .deny('foo')
        .allow('foo')
        .query('/test', 'foo'),
      false)
    strictEqual(
      Rule
        .for('/test')
        .allow('foo')
        .deny('foo')
        .query('/test', 'foo'),
      false)
  })
  it('clones itself correctly', () => {
    runTests({
      rule: Rule
        .for('/nah')
        .deny('foo')
        .allow('bar')
        .clone('/yeah'),
      tests: [
        ['/',     false, 'foo', null],
        ['/',     false, 'bar', null],
        ['/',     false, 'boo', null],
        ['/nah',  false, 'foo', null],
        ['/nah',  false, 'bar', null],
        ['/nah',  false, 'boo', null],
        ['/yeah', true,  'foo', false],
        ['/yeah', true,  'bar', true],
        ['/yeah', true,  'boo', null]
      ]
    })
  })
})

function runTests (opts: {
  rule: Rule
  ctx?: QueryContext
  tests: Array<[
    string,
    boolean,
    string?,
    (boolean | null)?
  ]>
}): void {
  for (const test of opts.tests) {
    strictEqual(opts.rule.matches(test[0], opts.ctx), test[1],
      `unexpected result from matches('${test[0]}') for rule '${opts.rule.regex.spec}'`)
    if (test.length === 4 && typeof test[2] === 'string') {
      strictEqual(opts.rule.query(test[0], test[2], opts.ctx), test[3],
        `unexpected result from query('${test[0]}', '${test[2]}') for rule '${opts.rule.regex.spec}'`)
    }
  }
}
