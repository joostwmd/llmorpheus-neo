/* eslint-disable no-multi-spaces */

import { Matcher } from '../src'
import { describe, it } from '@jest/globals'
import { deepStrictEqual, strictEqual } from 'assert'

describe('matcher', () => {
  itAccepts('valid paths',
    '/',
    '/+',
    '/+/+',
    '/+/*',
    '/+/foo',
    '/*',
    '/*/+',
    '/*/*',
    '/*/foo',
    '/foo',
    '/foo/+',
    '/foo/*',
    '/foo/bar',
    '/foo/+/+',
    '/foo/+/*',
    '/foo/+/bar',
    '/foo/+/bar/+',
    '/foo/+/bar/*',
    '/foo/*/+',
    '/foo/*/*',
    '/foo/*/bar',
    '/foo/*/bar/+',
    '/foo/*/bar/*',
    '/abcdefghijklmnopqrstuvwxyz',
    '/ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '/0123456789',
    '/_~.$-',
    '/:foo',
    '/:foo/:bar',
    '/:foo/:foo',
    '/++',
    '/++/foo',
    '/**',
    '/**/foo',
    '/foo/++',
    '/foo/++/bar',
    '/foo/**',
    '/foo/**/bar')
  itRejects('empty paths', '1.1',
    '')
  itRejects('paths without leading slashes', '1.1',
    '+',
    '+/foo',
    '*',
    '*/foo',
    'foo',
    'foo/+',
    'foo/*',
    'foo/bar')
  itRejects('paths with trailing slashes', '1.1',
    '/+/',
    '/+/foo/',
    '/*/',
    '/*/foo/',
    '/foo/',
    '/foo/+/',
    '/foo/*/',
    '/foo/bar/')
  itRejects('paths with empty segments', '1.1',
    '//',
    '//+',
    '//*',
    '//foo',
    '/+//',
    '/*//',
    '/foo//',
    '/foo//+',
    '/foo//*',
    '/foo//bar')
  itRejects('paths with invalid characters', '1.1',
    '/ ',
    '/!',
    '/@',
    '/#',
    '/%',
    '/^',
    '/&',
    '/(',
    '/)',
    '/=',
    '/{',
    '/}',
    '/[',
    '/]',
    '/<',
    '/>',
    '/|',
    '/?',
    '/,',
    '/;',
    '/`',
    '/"',
    '/\'',
    '/\\',
    '/\n',
    '/\r',
    '/\t',
    '/\0')
  itRejects('paths with malformed wildcards', '1.1',
    '/+*',
    '/*+',
    '/+**',
    '/*++',
    '/+++',
    '/***',
    '/foo+',
    '/foo*',
    '/+foo',
    '/*foo',
    '/foo++',
    '/foo**',
    '/++foo',
    '/**foo')
  itRejects('paths with malformed captures', '1.1',
    '/:',
    '/::',
    '/:foo:',
    '/:foo+',
    '/:foo*',
    '/foo:')
  itCompiles('literal path segments',
    ['/',          /^\/$/],
    ['/foo',       /^\/foo$/],
    ['/foo/bar',   /^\/foo\/bar$/],
    ['/.foo',      /^\/\.foo$/],
    ['/.foo/bar$', /^\/\.foo\/bar\$$/])
  itCompiles('match-one wildcard segments',
    ['/+',         /^\/[^/]+$/],
    ['/+/foo',     /^\/[^/]+\/foo$/],
    ['/foo/+',     /^\/foo\/[^/]+$/],
    ['/foo/+/bar', /^\/foo\/[^/]+\/bar$/])
  itCompiles('match-many wildcard segments',
    ['/*',         /^(?:\/[^/]+)+$/],
    ['/*/foo',     /^(?:\/[^/]+)+\/foo$/],
    ['/foo/*',     /^\/foo(?:\/[^/]+)+$/],
    ['/foo/*/bar', /^\/foo(?:\/[^/]+)+\/bar$/])
  itCompiles('match-one-or-none wildcard segments',
    ['/++',         /^\/$|^\/[^/]+$/],
    ['/++/foo',     /^(?:\/[^/]+)?\/foo$/],
    ['/foo/++',     /^\/foo(?:\/[^/]+)?$/],
    ['/foo/++/bar', /^\/foo(?:\/[^/]+)?\/bar$/])
  itCompiles('match-many-or-none wildcard segments',
    ['/**',         /^\/$|^(?:\/[^/]+)+$/],
    ['/**/foo',     /^(?:\/[^/]+)*\/foo$/],
    ['/foo/**',     /^\/foo(?:\/[^/]+)*$/],
    ['/foo/**/bar', /^\/foo(?:\/[^/]+)*\/bar$/])
  itCompiles('combinations of wildcard segments',
    ['/+',       /^\/[^/]+$/],
    ['/+/*',     /^(?:\/[^/]+){2,}$/],
    ['/+/*/*',   /^(?:\/[^/]+){3,}$/],
    ['/+/+',     /^(?:\/[^/]+){2}$/],
    ['/+/+/+',   /^(?:\/[^/]+){3}$/],
    ['/+/+/*',   /^(?:\/[^/]+){3,}$/],
    ['/+/+/*/*', /^(?:\/[^/]+){4,}$/],
    ['/+/foo/+', /^\/[^/]+\/foo\/[^/]+$/],
    ['/+/foo/*', /^\/[^/]+\/foo(?:\/[^/]+)+$/],
    ['/*',       /^(?:\/[^/]+)+$/],
    ['/*/+',     /^(?:\/[^/]+){2,}$/],
    ['/*/+/+',   /^(?:\/[^/]+){3,}$/],
    ['/*/*',     /^(?:\/[^/]+){2,}$/],
    ['/*/*/*',   /^(?:\/[^/]+){3,}$/],
    ['/*/foo/+', /^(?:\/[^/]+)+\/foo\/[^/]+$/],
    ['/*/foo/*', /^(?:\/[^/]+)+\/foo(?:\/[^/]+)+$/],
    ['/++',      /^\/$|^\/[^/]+$/],
    ['/++/+',    /^(?:\/[^/]+){1,2}$/],
    ['/++/+/+',  /^(?:\/[^/]+){2,3}$/],
    ['/++/*',    /^(?:\/[^/]+)+$/],
    ['/**',      /^\/$|^(?:\/[^/]+)+$/],
    ['/**/+',    /^(?:\/[^/]+)+$/],
    ['/**/+/+',  /^(?:\/[^/]+){2,}$/],
    ['/**/*',    /^(?:\/[^/]+)+$/])
  itCompiles('capture segments',
    ['/:foo',          /^\/([^/]+)$/,                             'foo'],
    ['/:foo/:bar',     /^\/([^/]+)\/([^/]+)$/,                    'foo', 'bar'],
    ['/:foo/:foo',     /^\/([^/]+)\/([^/]+)$/,                    'foo', 'foo'],
    ['/+/:foo/*/:bar', /^\/[^/]+\/([^/]+)(?:\/[^/]+)+\/([^/]+)$/, 'foo', 'bar']
  )
  itMatches('literal path segments', {
    spec: '/foo',
    paths: [
      [false, ''],
      [false, '/'],
      [false, '/fo'],
      [true,  '/foo'],
      [false, '/food'],
      [false, '/foo/bar'],
      [false, 'foo']
    ]
  }, {
    spec: '/foo/bar',
    paths: [
      [false, ''],
      [false, '/'],
      [false, '/foo'],
      [false, '/foo/ba'],
      [true,  '/foo/bar'],
      [false, '/foo/bard'],
      [false, 'foo'],
      [false, 'foo/bar']
    ]
  }, {
    spec: '/.foo',
    paths: [
      [false, '/foo'],
      [true,  '/.foo'],
      [false, '/Afoo']
    ]
  }, {
    spec: '/foo$',
    paths: [
      [false, '/foo'],
      [true,  '/foo$'],
      [false, '/fooA']
    ]
  })
  itMatches('match-one wildcard segments', {
    spec: '/+',
    paths: [
      [false, ''],
      [false, '/'],
      [true,  '/foo'],
      [false, '/foo/bar']
    ]
  }, {
    spec: '/+/+',
    paths: [
      [false, '/foo'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo']
    ]
  }, {
    spec: '/foo/+',
    paths: [
      [false, '/foo'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/+/bar',
    paths: [
      [false, '/foo'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/foo/+/boo',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [false, '/foo/boo'],
      [true,  '/foo/bar/boo'],
      [false, '/foo/boo/bar'],
      [false, '/bar/foo/boo']
    ]
  }, {
    spec: '/+/bar/+',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [false, '/foo/boo/bar']
    ]
  })
  itMatches('match-many wildcard segments', {
    spec: '/*',
    paths: [
      [false, ''],
      [false, '/'],
      [true,  '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo']
    ]
  }, {
    spec: '/*/*',
    paths: [
      [false, '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo']
    ]
  }, {
    spec: '/foo/*',
    paths: [
      [false, '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/*/bar',
    paths: [
      [false, '/foo'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo'],
      [true,  '/foo/boo/bar'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/foo/*/boo',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [false, '/foo/boo'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/baz/boo'],
      [false, '/foo/boo/bar'],
      [false, '/bar/foo/boo']
    ]
  }, {
    spec: '/*/bar/*',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz'],
      [true,  '/foo/baz/bar/boo']
    ]
  })
  itMatches('match-one-or-none wildcard segments', {
    spec: '/++',
    paths: [
      [false, ''],
      [true,  '/'],
      [false, '//'],
      [true,  '/foo'],
      [false, '/foo/'],
      [false, '/foo/bar']
    ]
  }, {
    spec: '/++/++',
    paths: [
      [false, ''],
      [true,  '/'],
      [false, '//'],
      [false, '//foo'],
      [true,  '/foo'],
      [false, '/foo/'],
      [false, '/foo//'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/'],
      [false, '/foo/bar/boo']
    ]
  }, {
    spec: '/foo/++',
    paths: [
      [false, '/'],
      [true,  '/foo'],
      [false, '/foo/'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo'],
      [false, '/bar'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/++/bar',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [true,  '/bar'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/foo/++/boo',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/boo'],
      [true,  '/foo/bar/boo'],
      [false, '/foo/boo/bar'],
      [false, '/bar/foo/boo']
    ]
  }, {
    spec: '/++/bar/++',
    paths: [
      [false, '/foo'],
      [true,  '/bar'],
      [true,  '/foo/bar'],
      [true,  '/bar/boo'],
      [true,  '/foo/bar/boo'],
      [false, '/foo/boo/bar'],
      [false, '/bar/foo/boo']
    ]
  })
  itMatches('match-many-or-none wildcard segments', {
    spec: '/**',
    paths: [
      [false, ''],
      [true,  '/'],
      [false, '//'],
      [true,  '/foo'],
      [false, '/foo/'],
      [true,  '/foo/bar']
    ]
  }, {
    spec: '/**/**',
    paths: [
      [false, ''],
      [true,  '/'],
      [false, '//'],
      [false, '//foo'],
      [true,  '/foo'],
      [false, '/foo/'],
      [false, '/foo//'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/'],
      [true,  '/foo/bar/boo']
    ]
  }, {
    spec: '/foo/**',
    paths: [
      [false, '/'],
      [true,  '/foo'],
      [false, '/foo/'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [false, '/bar'],
      [false, '/bar/foo']
    ]
  }, {
    spec: '/**/boo',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [true,  '/boo'],
      [true,  '/foo/boo'],
      [true,  '/foo/bar/boo'],
      [false, '/boo/foo']
    ]
  }, {
    spec: '/foo/**/baz',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/baz'],
      [true,  '/foo/bar/baz'],
      [true,  '/foo/bar/boo/baz'],
      [false, '/foo/baz/bar'],
      [false, '/bar/foo/baz']
    ]
  }, {
    spec: '/**/bar/**',
    paths: [
      [false, '/foo'],
      [true,  '/bar'],
      [true,  '/foo/bar'],
      [false, '/foo/boo'],
      [true,  '/bar/boo'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz'],
      [true,  '/foo/boo/bar'],
      [true,  '/bar/boo/baz']
    ]
  })
  itMatches('combinations of wildcard segments', {
    spec: '/+/*',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/+/+/*',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/+/+/+',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [false,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/*/+',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/*/*/+',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/*/*/*',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [false, '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/++/+',
    paths: [
      [false, '/'],
      [true,  '/foo'],
      [true,  '/foo/bar'],
      [false, '/foo/bar/boo'],
      [false, '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/++/*',
    paths: [
      [false, '/'],
      [true,  '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/**/+',
    paths: [
      [false, '/'],
      [true,  '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/**/*',
    paths: [
      [false, '/'],
      [true,  '/foo'],
      [true,  '/foo/bar'],
      [true,  '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz']
    ]
  }, {
    spec: '/**/++',
    paths: [
      [true, '/'],
      [true, '/foo'],
      [true, '/foo/bar'],
      [true, '/foo/bar/boo'],
      [true, '/foo/bar/boo/baz']
    ]
  })
  itMatches('capture segments', {
    spec: '/:a',
    paths: [
      [false, '/'],
      [true,  '/foo', 'foo'],
      [false, '/foo/bar']
    ]
  }, {
    spec: '/:a/:b',
    paths: [
      [false, '/'],
      [false, '/foo'],
      [true,  '/foo/bar', 'foo', 'bar'],
      [false, '/foo/bar/boo']
    ]
  }, {
    spec: '/+/:a/*/:b',
    paths: [
      [false, '/foo'],
      [false, '/foo/bar'],
      [false, '/foo/bar/boo'],
      [true,  '/foo/bar/boo/baz', 'bar', 'baz'],
      [true,  '/foo/bar/boo/baz/wut', 'bar', 'wut']
    ]
  })
  describe('when using version 1', () => {
    itRejects('specs with match-one-or-none wildcards', '1',
      '/++',
      '/foo/++',
      '/++/bar')
    itRejects('specs with match-many-or-none wildcards', '1.0',
      '/**',
      '/foo/**',
      '/**/bar')
  })
})

function itAccepts (desc: string, ...specs: string[]): void {
  it('accepts ' + desc, () => {
    specs.forEach((spec) => {
      try {
        Matcher.for(spec)
      } catch (err: any) {
        /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
        throw new Error(`expected path spec '${spec}' to be accepted: ${err.message}`)
      }
    })
  })
}

function itRejects (desc: string, version: '1' | '1.0' | '1.1', ...specs: string[]): void {
  it('rejects ' + desc, () => {
    specs.forEach((spec) => {
      if (!itThrows(() => Matcher.for(spec, version))) {
        throw Error(`expected path spec '${spec}' to be rejected`)
      }
    })
  })
}

function itCompiles (desc: string, ...tests: Array<[
  spec: string,
  expected: RegExp,
  ...props: string[]
]>): void {
  it('compiles ' + desc + ' correctly', () => {
    tests.forEach((test) => {
      const [spec, expected, ...props] = test
      const regex = Matcher.for(spec)
      strictEqual(regex.source, expected.source,
        `path spec '${spec}' did not compile to expected pattern`)
      deepStrictEqual(regex.props, props,
        `path spec '${spec}' did not compile to expected capture set`)
    })
  })
}

function itMatches (desc: string, ...tests: Array<{
  spec: string
  paths: Array<[
    expected: boolean,
    value: string,
    ...props: string[]
  ]>
}>): void {
  it('matches ' + desc + ' correctly', () => {
    for (const test of tests) {
      const regex = Matcher.for(test.spec)
      for (const path of test.paths) {
        const [expected, value, ...props] = path
        const match = value.match(regex)
        strictEqual((match !== null), expected,
          `expected path spec '${test.spec}' to${expected ? '' : ' not'} match '${value}'`)
        if (match !== null) {
          deepStrictEqual(match.slice(1), props,
            `path spec '${test.spec}' did not capture expected values`)
        }
      }
    }
  })
}

function itThrows (fn: () => void): boolean {
  try {
    fn()
  } catch {
    return true
  }
  return false
}
