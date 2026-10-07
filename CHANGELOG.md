# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.0.1](https://github.com/janesenaj42/init-react/compare/v1.0.0...v1.0.1) (2026-10-07)

## [1.0.0](https://github.com/janesenaj42/init-react/compare/v0.2.0...v1.0.0) (2026-10-07)

### ⚠ BREAKING CHANGES

* **cli:** `--ci` and the `ci` tool name are gone. Projects set up by an earlier
  release keep their init-react CI files, which the CLI no longer updates.
* projects that bump to this version fail `lint` wherever their code
  breaks one of the three rules.

### Features

* add --skip and --registry; enforce no any, 30-line functions, no magic numbers ([#5](https://github.com/janesenaj42/init-react/issues/5)) ([4c02165](https://github.com/janesenaj42/init-react/commit/4c02165cbf699ec3601617e86ecf204d41b52932))
* **cli:** stop writing CI; pipelines belong to the CI team ([#6](https://github.com/janesenaj42/init-react/issues/6)) ([046a087](https://github.com/janesenaj42/init-react/commit/046a08746938c2349b02250d8f271155aa4d745e))

## [0.2.0](https://github.com/janesenaj42/init-react/compare/v0.1.2...v0.2.0) (2026-09-30)

### ⚠ BREAKING CHANGES

* **cli:** the `husky` tool is now `lefthook` in --force, and
  .husky/ hooks are no longer written.

### Features

* **cli:** wire git hooks through lefthook instead of husky ([e323fc1](https://github.com/janesenaj42/init-react/commit/e323fc18e840ba595e4ef4151d652b871fbb7428))

## [0.1.2](https://github.com/janesenaj42/init-react/compare/v0.1.1...v0.1.2) (2026-09-29)

### Bug Fixes

* stop test hardcoding the release version ([9ff8290](https://github.com/janesenaj42/init-react/commit/9ff82906f803b82df8b3c30c225f4e796470106e))

## [0.1.1](https://github.com/janesenaj42/init-react/compare/v0.1.0...v0.1.1) (2026-09-29)

### Bug Fixes

* add missing prerelease scripts to release pipeline ([#3](https://github.com/janesenaj42/init-react/issues/3)) ([43b8272](https://github.com/janesenaj42/init-react/commit/43b827273e136fcda96d6ab12ded9539c47f8dfa))
