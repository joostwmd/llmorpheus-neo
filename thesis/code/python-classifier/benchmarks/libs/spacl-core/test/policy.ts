/* eslint-disable no-multi-spaces */

import { strictEqual } from 'assert'
import { describe, it } from '@jest/globals'
import { Policy, QueryContext, Rule } from '../src'

describe('policy', () => {
  it('matches paths correctly', () => {
    runTests({
      policy: Policy.for('static'),
      tests: [
        ['/',         false],
        ['/nah',      false],
        ['/yeah/nah', false]
      ]
    })
    runTests({
      policy: Policy.for('dynamic',
        Rule.for('/yeah'),
        Rule.for('/nah/+')),
      tests: [
        ['/yeah',     true],
        ['/yeah/nah', false],
        ['/nah',      false],
        ['/nah/yeah', true]
      ]
    })
  })
  it('matches context-dependent paths correctly', () => {
    runTests({
      policy: Policy.for('without context',
        Rule.for('/:maybe')),
      tests: [
        ['/',     false],
        ['/nah',  false]
      ]
    })
    runTests({
      policy: Policy.for('with context',
        Rule.for('/:maybe'),
        Rule.for('/nah/:maybe')),
      ctx: {
        maybe: 'yeah'
      },
      tests: [
        ['/nah',      false],
        ['/yeah',     true],
        ['/yeah/nah', false],
        ['/nah/yeah', true]
      ]
    })
  })
  it('answers queries correctly', () => {
    runTests({
      policy: Policy.for('test',
        Rule.for('/foo').allow('foo'),
        Rule.for('/bar').allow('bar'),
        Rule.for('/*').deny('boo')),
      tests: [
        ['/',    false, 'foo', null],
        ['/',    false, 'bar', null],
        ['/',    false, 'boo', null],
        ['/',    false, 'baz', null],
        ['/foo', true,  'foo', true],
        ['/foo', true,  'bar', null],
        ['/foo', true,  'boo', false],
        ['/foo', true,  'baz', null],
        ['/bar', true,  'foo', null],
        ['/bar', true,  'bar', true],
        ['/bar', true,  'boo', false],
        ['/bar', true,  'baz', null]
      ]
    })
  })
  it('answers context-dependent queries correctly', () => {
    runTests({
      policy: Policy.for('test',
        Rule.for('/:foo').allow('foo'),
        Rule.for('/:bar').allow('bar'),
        Rule.for('/:boo').deny('boo')),
      ctx: {
        foo: 'foo',
        bar: 'bar'
      },
      tests: [
        ['/foo', true,  'foo', true],
        ['/foo', true,  'bar', null],
        ['/foo', true,  'boo', null],
        ['/foo', true,  'baz', null],
        ['/bar', true,  'foo', null],
        ['/bar', true,  'bar', true],
        ['/bar', true,  'boo', null],
        ['/bar', true,  'baz', null]
      ]
    })
  })
  it('prioritises deny over allow', () => {
    runTests({
      policy: Policy.for('deny first',
        Rule.for('/*').deny('foo'),
        Rule.for('/foo').allow('foo')),
      tests: [
        ['/foo', true, 'foo', false],
        ['/bar', true, 'foo', false]
      ]
    })
    runTests({
      policy: Policy.for('allow first',
        Rule.for('/foo').allow('foo'),
        Rule.for('/*').deny('foo')),
      tests: [
        ['/foo', true, 'foo', false],
        ['/bar', true, 'foo', false]
      ]
    })
  })
  it('clones itself correctly', () => {
    const rule = Rule.for('/test').allow('foo', 'bar')
    const original = Policy.for('original', rule)
    const shallow = original.clone('shallow', false)
    const deep = original.clone('deep', true)
    original.push(Rule.for('/test').allow('baz'))
    rule.deny(
      'foo',
      'bar',
      'boo')
    runTests({
      policy: original.clone(),
      tests: [
        ['/test', true,  'foo', false],
        ['/test', true,  'bar', false],
        ['/test', true,  'boo', false],
        ['/test', true,  'baz', true]
      ]
    })
    runTests({
      policy: shallow,
      tests: [
        ['/test', true,  'foo', false],
        ['/test', true,  'bar', false],
        ['/test', true,  'boo', false],
        ['/test', true,  'baz', null]
      ]
    })
    runTests({
      policy: deep,
      tests: [
        ['/test', true,  'foo', true],
        ['/test', true,  'bar', true],
        ['/test', true,  'boo', null],
        ['/test', true,  'baz', null]
      ]
    })
  })
})

function runTests (opts: {
  policy: Policy
  ctx?: QueryContext
  tests: Array<[
    string,
    boolean,
    string?,
    (boolean | null)?
  ]>
}): void {
  for (const test of opts.tests) {
    strictEqual(opts.policy.matches(test[0], opts.ctx), test[1],
      `unexpected result from matches('${test[0]}') for policy '${opts.policy.name}'`)
    if (test.length === 4 && typeof test[2] === 'string') {
      strictEqual(opts.policy.query(test[0], test[2], opts.ctx), test[3],
        `unexpected result from query('${test[0]}', '${test[2]}') for policy '${opts.policy.name}'`)
    }
  }
}
