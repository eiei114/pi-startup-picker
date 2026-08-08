# ROADMAP

Status: **startup-only vertical slice shipped; latest package version 0.3.1 (searchable picker)**

This roadmap tracks current release status, short-term priorities, and a backlog of
bounded maintenance seeds (30-90 minutes each) that the weekly maintenance seed planner
can promote into individual issues. It is a living document — update it as releases ship.

## Project goal

Ship a thin startup picker that lets Pi power users choose provider/model **before** the
session begins, on normal startup only. Keep the surface area small, fall back safely, and
avoid intercepting non-startup session reasons.

## Current release status

| Release | Date | Highlights |
| --- | --- | --- |
| 0.3.1 | 2026-08-04 | Discord community badge in README (patch release bookkeeping) |
| 0.3.0 | 2026-07-31 | Searchable one-screen startup picker with fuzzy filter + recent-first |
| 0.2.3 | 2026-07-20 | Patch release bookkeeping |
| 0.2.2 | 2026-07-04 | Sponsor (Buy Me a Coffee) button + native GitHub funding link |
| 0.2.1 | 2026-06-26 | README aligned with the current Pi extension template |
| 0.2.0 | 2026-06-17 | Hardened startup-only picker slice + ROADMAP.md |
| 0.1.0 | 2026-06-11 | Bootstrap + initial startup picker flow |

- **Package version**: `pi-startup-picker@0.3.1`
- **Shipped behavior**: startup-only trigger on `session_start` where `reason === "startup"`,
  no-op for other reasons (`resume`, `fork`, `reload`, `new`); skip when UI is unavailable.
- **Open backlog**: no open issues; one open Dependabot PR (npm dev group).

## Shipped behavior recap (0.3.x line)

- Startup-only trigger on normal `session_start`.
- One-screen searchable model picker (`type` to fuzzy-filter by provider / id / name).
- Recent 3 provider/model combinations shown first, deduped and most-recent-first.
- Cancel or selection failure → default provider/model fallback.
- Legacy two-stage `select` kept as fallback when custom TUI is unavailable.
- Malformed recent-store recovery with empty fallback and self-heal on next save.
- Integration, search, and store regression tests for the startup matrix.

## Short-term goals (next 2-3 releases)

Keep releases small and independently shippable. Each item below maps to one or more of the
maintenance seeds in the next section.

1. **Surface real status (minor or patch)** — make the package ship only intentional content and
   give users a useful `/startup-picker:about` (seeds S-3, S-4).
2. **Harden the store (minor)** — atomic recent-store writes (seed S-5).

Beyond the next 2-3 releases, candidate larger work (kept out of scope here, see non-goals):
decide whether `/new` should reuse the picker; richer recent labels or availability hints;
optional non-startup triggers after real usage feedback.

## Current non-goals

- Launch hub / multi-panel custom UI beyond the searchable picker.
- Auth-aware live availability probe.
- Interception of `/resume`, `/fork`, `/reload`, `/new`, or other non-startup session reasons.
- Preset routing, policy routing, or scheduled model switching.

## Maintenance seeds (30-90 minutes each)

Each seed is intentionally bounded so it can be promoted into a single backlog issue and
landed in one focused session. Seeds are **not** committed work — they are vetted candidates.
Pick one, open an issue, and link it back here when started.

> Time band is an estimate for a maintainer or AI agent already familiar with the repo.
> Every seed must keep `npm run ci` (typecheck + tests + `npm pack --dry-run`) green and must
> not change published behavior unless the seed explicitly calls for a feature.

### S-3 · Clear template placeholders from shipped content (~30-60 min)

- **Why**: The package manifest ships `./skills`, `./prompts`, `./themes`, but they only contain
  template placeholders (`skills/example-skill/SKILL.md`, `prompts/example.md`,
  `themes/example-theme.json`). `docs/examples.md` itself flags them as placeholders to replace or
  remove.
- **Scope**: Either (a) remove the placeholder files and drop the unused manifest entries, or
  (b) document them as intentional empty slots. Update `docs/examples.md` and `smoke.test.mjs` to
  match the chosen direction.
- **Acceptance criteria**:
  - `npm pack --dry-run` no longer ships example-placeholder content (unless intentionally kept
    and documented).
  - `docs/examples.md` and `smoke.test.mjs` reflect the final shape.
  - `npm run ci` passes.

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

## Improvement areas

- **Docs**: keep README pin and CHANGELOG in sync with each release; revisit `docs/examples.md`
  once placeholders are resolved (S-3).
- **Tests**: searchable picker and startup matrix coverage is in place; keep cancel/fallback paths green.
- **Robustness**: the recent store self-heals today but can avoid the corruption window (S-5).
- **User experience**: the about command is the only user-facing surface today and is minimal (S-4).

## Links

- README: [README.md](README.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- npm: https://www.npmjs.com/package/pi-startup-picker
- Issues: https://github.com/eiei114/pi-startup-picker/issues
