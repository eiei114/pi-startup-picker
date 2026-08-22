# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## Unreleased

## [0.3.2] - 2026-08-22

### Changed

- Merge the 2026-08-22 managed OSS dependency and maintenance PR batch.

## [0.3.0] - 2026-07-31

### Added

- Replace the two-stage provider/model `select` flow with a one-screen searchable startup picker (`type` to fuzzy-filter, recent combinations first).
- Add model-search helpers and regression coverage for fuzzy filtering and recent-first ordering.

### Changed

- Prefer `ctx.ui.custom` searchable UI when available; keep the legacy two-stage `select` path as a fallback for non-TUI environments.

## [0.2.2] - 2026-07-04

### Changed

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

## [0.2.1] - 2026-06-25

### Changed

- Aligned README with the current Pi extension template: canonical `Features` section, expanded install flows, and updated package contents.

## [0.2.0] - 2026-06-17

### Added

- Hardened startup-only provider/model picker flow with broader integration coverage.
- Added startup matrix tests for no-ui skip, unavailable models, browse-from-recents, unavailable recents filtering, and provider/model cancel fallback.
- Added malformed recent-store recovery tests, including self-heal on the next save.
- Added [ROADMAP.md](ROADMAP.md) documenting the shipped slice, startup-only boundary, and current non-goals.

### Changed

- Removed template scaffold extension and greeting tool so the package reflects the shipped startup picker slice.
- Updated README to describe startup-only behavior, fallback semantics, and non-goals consistently with the roadmap.

## [0.1.0] - 2026-06-11

### Added

- Bootstrapped the repository from `eiei114/pi-extension-template`.
- Added project identity, repository metadata, and startup-picker-specific README copy.
- Added initial smoke commands and project notes so implementation can begin cleanly.
- Added a startup-only provider/model picker flow with recent-combination persistence and cancel-to-default fallback.
- Added startup flow tests and recent-store regression tests.
