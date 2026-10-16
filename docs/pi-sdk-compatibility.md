# Pi SDK 1.2.0 compatibility

`pi-startup-picker` is verified with these exact development/test pins:

- `@earendil-works/pi-agent-core`: `1.2.0`
- `@earendil-works/pi-ai`: `1.2.0`
- `@earendil-works/pi-coding-agent`: `1.2.0`
- `@earendil-works/pi-tui`: `1.2.0`

The published Pi peer dependency ranges remain `*`; the exact versions are not
runtime dependencies.

## API compatibility

The [Pi 1.2.0 release notes](https://github.com/earendil-works/pi/releases/tag/v1.2.0)
change `before_agent_start` for extension-triggered runs: its event is now a
`messageType` union, and the session is busy while a run starts. This extension
uses `session_start`, not `before_agent_start`, and does not call the affected
session methods, so it needs no migration for those changes. The release notes
do not deprecate or remove the APIs used here: `session_start`,
`modelRegistry`, `setModel`, `ui.select`, `ui.custom`, `DynamicBorder`, and Pi
TUI components.

The searchable picker uses `ctx.ui.custom()` only in TUI mode. RPC and other
non-TUI modes use supported `select()` dialogs. In RPC mode, the startup dialog
is deferred until the initial `session_start` handler settles so the host can
bind RPC input and receive dialog responses. These package-specific paths are
verified in an actual Pi 1.2.0 process; no API substitutions were made
speculatively. The verified template baseline and reusable 1.2.0 migration
notes are in [pi-extension-template PR #131](https://github.com/eiei114/pi-extension-template/blob/4b0554151161eae665aa2cdc845a2d7df40e4781/docs/pi-sdk-compatibility.md).

## Verification

`npm run ci` runs typecheck, regression tests, the actual-host smoke harness
(`npm run smoke:pi`), and `npm pack --dry-run`. The harness checks the four exact
SDK pins, starts the installed Pi CLI with an isolated temporary agent
directory, and exercises extension registration, startup model selection and
the handled `/startup-picker:about` command, malformed RPC input, a second Pi
process selecting the persisted recent model, clean process shutdown, and the
native host-shell boundary (PowerShell on Windows, `/bin/sh` on POSIX).

The smoke uses a deterministic offline-only model definition and sends no
inference requests. Pi's CLI, extension loader, RPC handling, lifecycle, and
feature paths are real, not mocked. The committed observations are in
`docs/verification/pi-sdk-smoke.json`; refresh them with
`node scripts/pi-sdk-smoke.mjs --update-curated-report`. CI separately executes
the same smoke harness on every pull request. Contract tests require semantic
responses and verify that missing responses fail assertions.
