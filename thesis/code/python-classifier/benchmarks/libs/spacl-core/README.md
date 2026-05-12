<div align="center">
  <img width="135" src="https://gitlab.com/uploads/-/system/project/avatar/14558167/logo-gitlab.png">
</div>

@spacl/core
======
[![npm version][npm-image]][npm-url]
[![pipeline status][pipeline-image]][pipeline-url]
[![coverage status][coverage-image]][coverage-url]
[![standard-js][standard-image]][standard-url]

Simple path-based access control.

## Installation
```
npm install @spacl/core
```

### Additional Packages
This package contains only the core implementation; while it can be used standalone
it was intended to be paired with one or more of the following companion packages:

* [@spacl/yaml](https://www.npmjs.com/package/@spacl/yaml) - YAML parser and validator for SPACL policies.
* [@spacl/express](https://www.npmjs.com/package/@spacl/express) - Express middleware for SPACL policies.

## Documentation
API documentation is available [here](https://cptpackrat.gitlab.io/spacl-core).

### Introduction
SPACL policies provide a declarative method of granting users permission to perform specific
actions on specific paths within a hierarchy. A policy is made up of one or more rules, each
of which declares a set of allowed and/or denied actions for a single path specification.

```ts
import { Rule, Policy } from '@spacl/core'

/* Create a policy describing a standard user who can
   view other user's profiles, and edit their own. */
const user = Policy.for('user',
  Rule.for('/user/+').allow('get'),
  Rule.for('/user/:name').allow('put'))

/* Create a derived policy describing an admin user who
   can also create, edit and delete any user's profile,
   but for safety reasons, cannot delete themselves. */
const admin = user.clone('admin').push(
  Rule.for('/user/+').allow('put', 'post', 'delete'),
  Rule.for('/user/:name').deny('delete'))
```

These policies can then be queried to see what access they grant for a particular combination
of path, action, and optional query context, e.g. user name associated with the request). The
response to a query can be `true` (explicitly allowed), `false` (explicitly denied) or `null`
(implicitly denied; not governed by this policy).

```ts
/* Query context for our hypothetical user, 'foo'. */
const ctx = { name: 'foo' }

/* What can 'foo' access if they are granted 'user' rights? */
user.query('/user/foo', 'get',    ctx) /* true; explicitly allowed */
user.query('/user/foo', 'put',    ctx) /* true; explicitly allowed */
user.query('/user/foo', 'delete', ctx) /* null; implicitly denied */
user.query('/user/bar', 'get',    ctx) /* true; explicitly allowed */
user.query('/user/bar', 'put',    ctx) /* null; implicitly denied */
user.query('/user/bar', 'delete', ctx) /* null; implicitly denied */

/* Alternatively, what if 'foo' is granted 'admin' rights? */
admin.query('/user/foo', 'get',    ctx) /* true; explicitly allowed */
admin.query('/user/foo', 'put',    ctx) /* true; explicitly allowed */
admin.query('/user/foo', 'delete', ctx) /* false; explicitly denied */
admin.query('/user/bar', 'get',    ctx) /* true; explicitly allowed */
admin.query('/user/bar', 'put',    ctx) /* true; explicitly allowed */
admin.query('/user/bar', 'delete', ctx) /* true; explicitly allowed */
```

### Path Specifications
Each rule in a policy is associated with a path specification, and will only apply to queries
matching that specification. A path specification can be either an explicit, literal path, or
a pattern matching multiple paths. The following substitutions can be used to represent one or
more whole path segments:

* `+` - Match-one wildcard; accepts exactly one path segment.
* `*` - Match-many wildcard; accepts one or more path segments.
* `++` - Match-one-or-none wildcard; accepts zero or one path segments.
* `**` - Match-many-or-none wildcard; accepts zero or more path segments.
* `:<prop>` - Capture segment; accepts exactly one path segment matching the
              value of the named property within the current query context.

Substitutions can be combined as needed and placed anywhere within a path specification,
not just at the end. Here are some basic examples:

* `/user/foo` - Matches the exact path `/user/foo`.
* `/user/+` - Matches any path immediately under `/user`, e.g. `/user/foo` or `/user/bar`.
* `/user/*` - Matches any path at any depth under `/user`, e.g. `/user/foo` or `/user/bar/boo/baz`.
* `/user/**/admin` - Matches any path at any depth under `/user`, provided the final path
                     segment is `admin`, e.g. `/user/foo/admin`.
* `/user/:id` - Matches any path immediately under `/user`, provided the final path segment
                is equal to the value of the property `id` within the current query context,
                e.g. `/user/foo` given a query context of `{ id: 'foo' }`.

### Implicit Denial
Policies and rules are deny-by-default; if no rule within a policy applies to a particular
combination of path and action, that combination is considered to be implicitly denied. By
extension, an empty policy grants no permissions.

### Explicit Denial
Policies and rules prioritise explicit denials; if multiple rules within a policy apply to
a particular combination of path and action and one of them explicitly denies access that
rule will override all others, regardless of their order within the policy.

[npm-image]: https://img.shields.io/npm/v/@spacl/core.svg
[npm-url]: https://www.npmjs.com/package/@spacl/core
[pipeline-image]: https://gitlab.com/cptpackrat/spacl-core/badges/master/pipeline.svg
[pipeline-url]: https://gitlab.com/cptpackrat/spacl-core/commits/master
[coverage-image]: https://gitlab.com/cptpackrat/spacl-core/badges/master/coverage.svg
[coverage-url]: https://gitlab.com/cptpackrat/spacl-core/commits/master
[standard-image]: https://img.shields.io/badge/code%20style-standard-brightgreen.svg
[standard-url]: http://standardjs.com/
