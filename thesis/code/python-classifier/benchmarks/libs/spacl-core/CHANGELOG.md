# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.2.1](https://gitlab.com/cptpackrat/spacl-core/compare/v1.2.0...v1.2.1) (2022-01-09)


### Housekeeping

* Switched from mocha/nyc to jest. ([3ae7a82](https://gitlab.com/cptpackrat/spacl-core/commit/3ae7a821721c30f682594cfeba8fe29a8ec05cba))
* Switched from standardx to ts-standard. ([33f01a8](https://gitlab.com/cptpackrat/spacl-core/commit/33f01a8afdf01685427a60bd7ec333c1904da2c8))
* Fixed issues reported by linter. ([55f9aed](https://gitlab.com/cptpackrat/spacl-core/commit/55f9aed5da8dd6d6cd778625e2e0ccb54787a243))
* Updated dependencies. ([eb371cd](https://gitlab.com/cptpackrat/spacl-core/commit/eb371cd1fadae53ea063bafd9cd396ca168d054a))
* Updated documentation. ([70162c5](https://gitlab.com/cptpackrat/spacl-core/commit/70162c54035c1d8dee88ccc5a97d89222573ba0f))
* Updated project configuration and copyright notice. ([ec9ea1f](https://gitlab.com/cptpackrat/spacl-core/commit/ec9ea1f37a169c5f6d66f4578c3c2c71dd169f1f))

## [1.2.0](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.6...v1.2.0) (2020-04-02)


### Features

* Added PolicyMap, a policy collection that implements QueryableMap. ([f693183](https://gitlab.com/cptpackrat/spacl-core/commit/f693183f62826b309239988c83483239ce74bdaf))


### Housekeeping

* **deps:** Updated dependencies. ([5fd0335](https://gitlab.com/cptpackrat/spacl-core/commit/5fd0335eee16e3b7a5c4f691941b962168a0699f))

## [1.1.6](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.5...v1.1.6) (2020-03-29)


### Housekeeping

* Fix npm complaining about permissions in CI. ([bfa0208](https://gitlab.com/cptpackrat/spacl-core/commit/bfa02081fd9076d9276966d694a68156fd759bc3))

## [1.1.5](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.4...v1.1.5) (2020-03-29)


### Housekeeping

* Added CI step to publish on release tags. ([3b70335](https://gitlab.com/cptpackrat/spacl-core/commit/3b703358bf5c3c5cd4191cf2a2a93a3301d8d9f6))
* Fixed CI audit failing on dev dependencies; switched to using 'npm ci'. ([ca304d1](https://gitlab.com/cptpackrat/spacl-core/commit/ca304d17734d4a16b40472732752163e10e00e27))
* Fixed linter missing files; renamed lint script to 'lint'. ([931c783](https://gitlab.com/cptpackrat/spacl-core/commit/931c78389b1b4cc32ce81e49d0b3faac1508295f))
* Fixed issues reported by linter. ([b90e35f](https://gitlab.com/cptpackrat/spacl-core/commit/b90e35f9a53929b277cd3217511d88b20597c411))
* Relaxed timing requirements during CI, because reality. ([8561e21](https://gitlab.com/cptpackrat/spacl-core/commit/8561e21a0b0514532ddd8d298b9a70d77ef0bea6))
* Updated dependencies. ([69ad376](https://gitlab.com/cptpackrat/spacl-core/commit/69ad376c6e25782bbbb35d97c953059cb9209b95))

## [1.1.4](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.3...v1.1.4) (2020-01-26)


### Bug Fixes

* Added mitigation for potential regex DOS using trailing slashes. ([c3436ab](https://gitlab.com/cptpackrat/spacl-core/commit/c3436abc57883730dd6c07461125cc2d05955c66))


### Improvements

* Added the beginnings of a set of tests to identity regex vulnerabilities like c3436abc. ([9b70d5b](https://gitlab.com/cptpackrat/spacl-core/commit/9b70d5bf8a02396c6425187351720561f7019269))


### Housekeeping

* Added timing test to CI script. ([58c406a](https://gitlab.com/cptpackrat/spacl-core/commit/58c406a5297af63dc49fffa9136f4be7c920c348))
* Switched linter to standardx for better TS support. ([b02d745](https://gitlab.com/cptpackrat/spacl-core/commit/b02d745d55a29ccacff299493e28242d6501908e))
* Updated typescript target to ES2018. ([cc1d9f4](https://gitlab.com/cptpackrat/spacl-core/commit/cc1d9f48a8e8b0c910d4ae4e47fd1b1d6a0644f1))
* Updated dependencies. ([ce96b6c](https://gitlab.com/cptpackrat/spacl-core/commit/ce96b6c7814c0cbdbcce1b2eecead6d4413c1e2b))

## [1.1.3](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.2...v1.1.3) (2020-01-01)


### Bug Fixes

* Removed redundant 'use strict' from source files. ([8511dbb](https://gitlab.com/cptpackrat/spacl-core/commit/8511dbb680c19e9371682da318fd73623a21161e))


### Housekeeping

* Added basic typedoc support. ([0140d8a](https://gitlab.com/cptpackrat/spacl-core/commit/0140d8a06f074ce95bb36c08577516edb66a9795))
* Added CI step to deploy typedoc output to GitLab Pages. ([3c34349](https://gitlab.com/cptpackrat/spacl-core/commit/3c34349ffad5118b7ab96b091059c7dd80e34586))

## [1.1.2](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.1...v1.1.2) (2020-01-01)


### Housekeeping

* Updated dependencies. ([648b22c](https://gitlab.com/cptpackrat/spacl-core/commit/648b22cecd5eb2c3a21b871a7fe28e79cf4e69ec))

## [1.1.1](https://gitlab.com/cptpackrat/spacl-core/compare/v1.1.0...v1.1.1) (2019-10-19)


### Improvements

* Changed visibility of Rule.verbs from private to readonly. ([06baa8e](https://gitlab.com/cptpackrat/spacl-core/commit/06baa8e947976402705c70aee75a0998676413af))

## [1.1.0](https://gitlab.com/cptpackrat/spacl-core/compare/v1.0.0...v1.1.0) (2019-10-13)


### Features

* Added '**' and '++' as 'or-none' variants of existing wildcards. ([1a77d9e](https://gitlab.com/cptpackrat/spacl-core/commit/1a77d9e))
* Bumped path specification version to '1.1' per changes in 1a77d9e31; added logic for downgrading. ([89568a9](https://gitlab.com/cptpackrat/spacl-core/commit/89568a9))


### Improvements

* Reintroduced optimisations for compiled regex length. ([694c497](https://gitlab.com/cptpackrat/spacl-core/commit/694c497))
