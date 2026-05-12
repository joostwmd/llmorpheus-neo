/* eslint-disable no-multi-spaces */

import { strictEqual } from 'assert'
import { describe, it } from '@jest/globals'
import { Policy, PolicyMap, Rule } from '../src'

describe('policymap', () => {
  it('matches queries correctly', () => {
    const ctx = { maybe: 'yeah' }
    const map = PolicyMap.for(
      Policy.for('static',
        Rule.for('/yeah'),
        Rule.for('/nah/yeah')),
      Policy.for('dynamic',
        Rule.for('/yeah'),
        Rule.for('/nah/+'))).push(
      Policy.for('context',
        Rule.for('/:maybe'),
        Rule.for('/nah/:maybe')))
    const tests: Array<[string, string, boolean]> = [
      ['static', '/',          false],
      ['static', '/nah',       false],
      ['static', '/nah/yeah',  true],
      ['static', '/yeah',      true],
      ['static', '/yeah/nah',  false],
      ['dynamic', '/',         false],
      ['dynamic', '/nah',      false],
      ['dynamic', '/nah/yeah', true],
      ['dynamic', '/yeah',     true],
      ['dynamic', '/yeah/nah', false],
      ['context', '/',         false],
      ['context', '/nah',      false],
      ['context', '/nah/yeah', true],
      ['context', '/yeah',     true],
      ['context', '/yeah/nah', false],
      ['unknown', '/',         false],
      ['unknown', '/nah',      false],
      ['unknown', '/nah/yeah', false],
      ['unknown', '/yeah',     false],
      ['unknown', '/yeah/nah', false]
    ]
    for (const test of tests) {
      strictEqual(map.matches(test[0], test[1], ctx), test[2],
        `unexpected result from matches('${test[0]}', '${test[1]}')`)
    }
  })
  it('answers queries correctly', () => {
    const ctx = { maybe: 'yeah' }
    const map = PolicyMap.for(
      Policy.for('static',
        Rule.for('/nah').deny('get'),
        Rule.for('/yeah').allow('get'),
        Rule.for('/nah/yeah').allow('get')),
      Policy.for('dynamic',
        Rule.for('/nah').deny('get'),
        Rule.for('/yeah').allow('get'),
        Rule.for('/nah/+').allow('get'))).push(
      Policy.for('context',
        Rule.for('/nah').deny('get'),
        Rule.for('/:maybe').allow('get'),
        Rule.for('/nah/:maybe').allow('get')))
    const tests: Array<[string, string, string, boolean | null]> = [
      ['static', '/',          'get', null],
      ['static', '/nah',       'get', false],
      ['static', '/nah/yeah',  'get', true],
      ['static', '/yeah',      'get', true],
      ['static', '/yeah/nah',  'get', null],
      ['dynamic', '/',         'get', null],
      ['dynamic', '/nah',      'get', false],
      ['dynamic', '/nah/yeah', 'get', true],
      ['dynamic', '/yeah',     'get', true],
      ['dynamic', '/yeah/nah', 'get', null],
      ['context', '/',         'get', null],
      ['context', '/nah',      'get', false],
      ['context', '/nah/yeah', 'get', true],
      ['context', '/yeah',     'get', true],
      ['context', '/yeah/nah', 'get', null],
      ['unknown', '/',         'get', null],
      ['unknown', '/nah',      'get', null],
      ['unknown', '/nah/yeah', 'get', null],
      ['unknown', '/yeah',     'get', null],
      ['unknown', '/yeah/nah', 'get', null]
    ]
    for (const test of tests) {
      strictEqual(map.query(test[0], test[1], test[2], ctx), test[3],
        `unexpected result from query('${test[0]}', '${test[1]}', '${test[2]}')`)
    }
  })
})
