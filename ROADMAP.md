# ROADMAP

Status: **startup-only vertical slice shipped; latest package version 0.3.2 (searchable picker)**

This roadmap tracks current release status, short-term priorities, and a backlog of
bounded maintenance seeds (30-90 minutes each) that the weekly maintenance seed planner
can promote into individual issues. It is a living document — update it as releases ship.

Last refreshed: **2026-09-05** (DOT-1003 — re-enabled roadmap-driven seeding).

## Project goal

Ship a thin startup picker that lets Pi power users choose provider/model **before** the
session begins, on normal startup only. Keep the surface area small, fall back safely, and
avoid intercepting non-startup session reasons.

## Current release status

| Release | Date | Highlights |
| --- | --- | --- |
| 0.3.2 | 2026-08-22 | Cleared template placeholder skills/prompts/themes from shipped package (S-3) |
| 0.3.1 | 2026-08-04 | Discord community badge in README (patch release bookkeeping) |
| 0.3.0 | 2026-07-31 | Searchable one-screen startup picker with fuzzy filter + recent-first |
| 0.2.3 | 2026-07-20 | Patch release bookkeeping |
| 0.2.2 | 2026-07-04 | Sponsor (Buy Me a Coffee) button + native GitHub funding link |
| 0.2.1 | 2026-06-26 | README aligned with the current Pi extension template |
| 0.2.0 | 2026-06-17 | Hardened startup-only picker slice + ROADMAP.md |
| 0.1.0 | 2026-06-11 | Bootstrap + initial startup picker flow |

- **Package version**: `pi-startup-picker@0.3.2`
- **Shipped behavior**: startup-only trigger on `session_start` where `reason === "startup"`,
  no-op for other reasons (`resume`, `fork`, `reload`, `new`); skip when UI is unavailable.
- **Open backlog**: no open issues and no open Dependabot PRs (as of 2026-09-05).

## Shipped behavior recap (0.3.x line)

- Startup-only trigger on normal `session_start`.
- One-screen searchable model picker (`type` to fuzzy-filter by provider / id / name).
- Recent 3 provider/model combinations shown first, deduped and most-recent-first.
- Cancel or selection failure → default provider/model fallback.
- Legacy two-stage `select` kept as fallback when custom TUI is unavailable.
- Malformed recent-store recovery with empty fallback and self-heal on next save.
- Integration, search, and store regression tests for the startup matrix.
- Shipped package contains only extension + lib + docs (no template placeholder artifacts).

## Short-term goals (next 1-2 releases)

Keep releases small and independently shippable. Each item below maps to one or more of the
maintenance seeds in the next section.

1. **Surface real status (minor or patch)** — give users a useful `/startup-picker:about`
   that reports store path, recent count, and startup-only scope (seed S-4).
2. **Harden the store (minor)** — atomic recent-store writes to remove the torn-read window
   (seed S-5).
3. **Keep maintenance guardrails green (patch)** — add a ROADMAP structure smoke check and
   triage devDependency audit noise (seeds S-6, S-7).

Beyond the next 1-2 releases, candidate larger work (kept out of scope here, see non-goals):
decide whether `/new` should reuse the picker; richer recent labels or availability hints;
optional non-startup triggers after real usage feedback.

## Current non-goals

- Launch hub / multi-panel custom UI beyond the searchable picker.
- Auth-aware live availability probe.
- Interception of `/resume`, `/fork`, `/reload`, `/new`, or other non-startup session reasons.
- Preset routing, policy routing, or scheduled model switching.

## Recently shipped seeds

| Seed | Shipped in | Notes |
| --- | --- | --- |
| S-3 · Clear template placeholders | 0.3.2 (#32) | Removed placeholder skills/prompts/themes from the published tarball |

## Maintenance seeds (30-90 minutes each)

Each seed is intentionally bounded so it can be promoted into a single backlog issue and
landed in one focused session. Seeds are **not** committed work — they are vetted candidates.
Pick one, open an issue, and link it back here when started.

> Time band is an estimate for a maintainer or AI agent already familiar with the repo.
> Every seed must keep `npm run ci` (typecheck + tests + `npm pack --dry-run`) green and must
> not change published behavior unless the seed explicitly calls for a feature.

### S-4 · Make `/startup-picker:about` report real status (~45-75 min)

- **Why**: The command currently emits a static info message. Users cannot see the recent-store
  path, how many recents are stored, or confirm the startup-only boundary.
- **Scope**: Enhance the handler to report the recent-store path, the current recent count, and
  a one-line reminder that the picker runs on normal startup only. Keep it dependency-light and
  failure-tolerant (missing store → count 0).
- **Acceptance criteria**:
  - `/startup-picker:about` prints store path + recent count + startup-only scope.
  - A missing/malformed store reports count 0 without throwing.
  - `npm run ci` passes; add or extend a test if feasible.

### S-5 · Atomic recent-store write (~30-60 min)

- **Why**: `saveRecentCombination` writes the JSON file directly. A crash mid-write can let readers
  observe a truncated destination file. The store self-heals on the next load, but a temp-write +
  atomic `rename` removes the torn-read window at the destination path.
- **Scope**: Write to a temp file in the same directory and `rename` it into place; keep the existing
  `JSON.stringify(next, null, 2)` shape and trailing newline. This targets **atomicity** (readers
  never see a partially-written destination), not power-loss durability.
- **Acceptance criteria**:
  - Before a successful `rename`, readers of the destination path continue to see the previous valid
    file (never a partial JSON).
  - After a successful `rename`, the destination file is complete and valid.
  - Do **not** imply protection across power loss, or cleanup of an interrupted temp file, unless
    durability is explicitly added; `fsync` is only required if power-loss durability becomes a goal.
  - Existing `recent-store` tests still pass (dedupe/cap, malformed recovery, normalize).
  - `npm run ci` passes.

### S-6 · ROADMAP structure smoke guard (~30-45 min)

- **Why**: The weekly maintenance seed planner depends on `ROADMAP.md` listing bounded candidates
  with time estimates. A silent drift (fewer than three seeds, missing time bands) blocks automated
  triage until someone notices manually.
- **Scope**: Extend `tests/smoke.test.mjs` to assert that `ROADMAP.md` contains at least three
  `### S-*` seed headings and that each active seed section includes a `(~NN-NN min)` time band.
  Do not hard-code seed titles — match structure only.
- **Acceptance criteria**:
  - Smoke test fails if fewer than three seed headings or missing time bands.
  - `npm run ci` passes.
  - No change to published runtime behavior.

### S-7 · DevDependency audit triage (~30-60 min)

- **Why**: `npm install` currently reports moderate/high vulnerabilities in transitive dev
  dependencies. Unchecked drift makes it harder to spot regressions introduced by intentional
  dependency bumps.
- **Scope**: Run `npm audit`, apply safe patch/minor updates where available, document any
  accepted residual risk in a short maintainer note (e.g. `docs/repository-settings.md` or
  CHANGELOG Unreleased). Do not force major upgrades that break `npm run ci`.
- **Acceptance criteria**:
  - Audit output reviewed; safe fixes applied or explicitly documented.
  - `npm run ci` passes after any dependency changes.
  - Residual accepted risks are noted for the next maintainer.

## Improvement areas

- **Docs**: keep README pin and CHANGELOG in sync with each release.
- **Tests**: searchable picker and startup matrix coverage is in place; keep cancel/fallback paths green.
- **Robustness**: the recent store self-heals today but can avoid the corruption window (S-5).
- **User experience**: the about command is the only user-facing surface today and is minimal (S-4).
- **Maintenance automation**: ROADMAP structure guard (S-6) keeps seed planner inputs honest.

## Links

- README: [README.md](README.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- npm: https://www.npmjs.com/package/pi-startup-picker
- Issues: https://github.com/eiei114/pi-startup-picker/issues
