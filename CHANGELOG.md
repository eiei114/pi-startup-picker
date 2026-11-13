# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.4.0] - 2026-11-12

### Added

- Add an opt-in, default-off model picker on `/new`. Turn it on with
  `/startup-picker:settings` and it reuses the existing searchable, recent-first picker when
  `session_start` fires with reason `new`.
- Store the setting in the user-global `pi-startup-picker-settings.json` with a
  `showOnNewSession` boolean. Missing, malformed and non-boolean values mean off, and reading
  never rewrites the file.
- Show the current on/off state in `/startup-picker:about`.

### Changed

- On `/new`, the baseline is the model that was current before the picker opened: cancel, no UI,
  an empty registry, an unknown recent entry and a `setModel()` failure all keep that model and
  let `/new` continue, never the startup default fallback.
- Save to the recent store only after a successful model switch. A failed recent-store write now
  reports that the selected model is active but its recent entry was not saved, instead of
  claiming the picker could not be offered or that the previous model still applies.
- `resume`, `fork` and `reload` still never show the picker. Normal startup behavior and its
  cancel-to-default fallback are unchanged.
- The SDK smoke harness now covers `/new` with the setting missing, off and on, and the committed
  report was refreshed against an actual Pi 1.5.0 host. A `/new` dialog that arrives after the
  picker window is still tracked as a `/new` dialog, which invalidates an earlier state read.

### Fixed

- A deferred startup picker that loses its session no longer turns the stale-context `notify`
  into an unhandled rejection.
- Saving settings preserves the existing file mode through the temp-file rename, and a new
  settings file is created owner-only instead of with the default 0644.

## [0.3.12] - 2026-11-12

### Changed

- Update the exact development/test Pi SDK pins to 1.5.0 and record the 1.5.0
  TypeBox-removal migration review: this extension registers no tools and
  imports no TypeBox schemas, so the tool-argument validation change needs no
  code migration.
- Refresh the compatibility notes and the committed SDK smoke evidence for
  Pi SDK 1.5.0 (extension load, happy path, error path, reload/cleanup and the
  native host-shell boundary), all re-run against an actual Pi 1.5.0 host.

## [0.3.11] - 2026-11-07

### Changed

- Verify compatibility with Pi SDK 1.4.0 and make the SDK smoke check follow the exact versions pinned in the manifest.
- Refresh the committed smoke evidence and compatibility notes for Pi SDK 1.4.0, with a test that keeps the report aligned with the manifest pins.

## [0.3.10] - 2026-10-16

### Changed

- Verify compatibility with Pi SDK 1.2.0 and retain the existing public peer ranges.

## [0.3.9] - 2026-10-12

### Changed

- Verify Pi SDK 1.1.0 compatibility and preserve startup model selection in RPC mode.

## [0.3.8] - 2026-09-30

### Changed

- Update `@earendil-works/pi-*` dependencies to `0.99.1`.

## [0.3.7] - 2026-09-27

- chore: periodic patch bump after 7+ days without npm publish





All notable changes to this project will be documented in this file.

This project follows semantic versioning.
## [0.3.6] - 2026-09-28

- chore: periodic patch bump after 7+ days without npm publish
## [0.3.5] - 2026-09-28

- chore: periodic patch bump after 7+ days without npm publish
## [0.3.4] - 2026-09-28

- chore: periodic patch bump after 7+ days without npm publish
## [0.3.3] - 2026-09-28

- chore: periodic patch bump after 7+ days without npm publish
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
## Unreleased

