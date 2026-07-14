# ROADMAP

Status: **startup-only vertical slice shipped; latest release 0.2.2 on npm**

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
| 0.2.2 | 2026-07-04 | Sponsor (Buy Me a Coffee) button + native GitHub funding link |
| 0.2.1 | 2026-06-26 | README aligned with the current Pi extension template |
| 0.2.0 | 2026-06-17 | Hardened startup-only picker slice + ROADMAP.md |
| 0.1.0 | 2026-06-11 | Bootstrap + initial startup picker flow |

- **Published on npm**: `pi-startup-picker@0.2.2`
- **Shipped behavior**: startup-only trigger on `session_start` where `reason === "startup"`,
  no-op for other reasons (`resume`, `fork`, `reload`, `new`); skip when UI is unavailable.
- **Open backlog**: no open issues; one open Dependabot PR (npm dev group).

## Shipped behavior recap (0.2.x line)

- Startup-only trigger on normal `session_start`.
- Recent 3 provider/model combinations, deduped and most-recent-first.
- Cancel or selection failure → default provider/model fallback.
- Malformed recent-store recovery with empty fallback and self-heal on next save.
- Integration and store regression tests for the startup matrix.

## Short-term goals (next 2-3 releases)

Keep releases small and independently shippable. Each item below maps to one or more of the
maintenance seeds in the next section.

1. **Bookkeeping release (patch)** — reconcile the changelog and README with the already-published
   0.2.2 line (see seeds S-1, S-2). No behavior change.
2. **Surface real status (minor or patch)** — make the package ship only intentional content and
   give users a useful `/startup-picker:about` (seeds S-3, S-4).
3. **Harden the store + test matrix (minor)** — atomic recent-store writes and close the remaining
   cancel-path test gaps (seeds S-5, S-6).

Beyond the next 2-3 releases, candidate larger work (kept out of scope here, see non-goals):
decide whether `/new` should reuse the picker; richer recent labels or availability hints;
optional non-startup triggers after real usage feedback.

## Current non-goals

- Launch hub or one-screen custom UI.
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

### S-1 · Reconcile CHANGELOG with the 0.2.2 release (~20-30 min)

- **Why**: `CHANGELOG.md` has no `[0.2.2]` entry even though `pi-startup-picker@0.2.2` is
  published on npm and tagged `v0.2.2` (sponsor funding patch). The sponsor change still sits
  under `## Unreleased`.
- **Scope**: Add a `## [0.2.2] - 2026-07-04` section describing the sponsor button + funding link,
  and leave `## Unreleased` empty/ready.
- **Acceptance criteria**:
  - `CHANGELOG.md` documents `0.2.2` with the correct date and content.
  - `## Unreleased` contains no stale entries.
  - `npm run ci` passes; `npm pack --dry-run` output unchanged.

### S-2 · Fix README version-pin example drift (~15-30 min)

- **Why**: `README.md` pins the install example at `npm:pi-startup-picker@0.2.1` while the
  latest published version is `0.2.2`.
- **Scope**: Bump the pinned example to `0.2.2` (or document the pin as an example and keep it
  current at release time).
- **Acceptance criteria**:
  - The pinned version in the install example matches the latest published version.
  - `npm run ci` passes.

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

- **Why**: `saveRecentCombination` writes the JSON file directly. A crash mid-write can leave a
  truncated file. The store self-heals on the next load, but an atomic temp-write + rename avoids
  the corruption window entirely.
- **Scope**: Write to a temp file in the same directory and `rename` into place; keep the existing
  `JSON.stringify(next, null, 2)` shape and trailing newline.
- **Acceptance criteria**:
  - A write produces a complete, valid file even if interrupted (no partial JSON on disk after rename).
  - Existing `recent-store` tests still pass (dedupe/cap, malformed recovery, normalize).
  - `npm run ci` passes.

### S-6 · Close the `cancelled-recent` test gap (~30 min)

- **Why**: `runStartupPicker` returns `{ action: "fallback", reason: "cancelled-recent" }` when the
  user cancels at the recents menu, but no test exercises that path (current cancel tests cover the
  no-recents / provider menu path).
- **Scope**: Add a regression test: recents present, `ui.select` returns `undefined` at the recents
  menu → fallback `cancelled-recent`, `setModel` not called, no warning notifications.
- **Acceptance criteria**:
  - New test asserts `action === "fallback"`, `reason === "cancelled-recent"`.
  - `setModel` is not called; no notifications.
  - `npm run ci` passes.

## Improvement areas

- **Docs**: keep README pin and CHANGELOG in sync with each release (S-1, S-2); revisit
  `docs/examples.md` once placeholders are resolved (S-3).
- **Tests**: the startup matrix is strong; the remaining gap is the cancel-at-recents path (S-6).
- **Robustness**: the recent store self-heals today but can avoid the corruption window (S-5).
- **User experience**: the about command is the only user-facing surface today and is minimal (S-4).

## Links

- README: [README.md](README.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- npm: https://www.npmjs.com/package/pi-startup-picker
- Issues: https://github.com/eiei114/pi-startup-picker/issues
