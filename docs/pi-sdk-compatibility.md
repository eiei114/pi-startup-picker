# Pi SDK 1.1.0 compatibility

`pi-startup-picker` is verified with this frozen development/test SDK set:

- `@earendil-works/pi-agent-core`: `1.1.0`
- `@earendil-works/pi-ai`: `1.1.0`
- `@earendil-works/pi-coding-agent`: `1.1.0`
- `@earendil-works/pi-tui`: `1.1.0`

The package's published Pi peer ranges remain unchanged. Exact SDK versions are
development/test pins only; no Pi SDK runtime dependency or package-major change
is introduced.

## Extension UI modes

The searchable picker uses `ctx.ui.custom()` and Pi TUI components only when
`ctx.mode === "tui"`. The Pi 1.1.0 RPC UI contract documents that `custom()`
returns `undefined` in RPC mode, while `select()` dialogs remain supported. The
startup picker therefore uses the provider/model `select()` flow for RPC and
other non-TUI modes instead of mistaking the unsupported custom UI for a user
cancellation. The normal TUI keeps its searchable picker and cancel behavior.

For RPC startup, the extension defers the dialog until `session_start` settles;
the actual 1.1.0 host binds RPC input afterward, so an awaited dialog inside the
initial handler cannot receive its response.

This follows the upstream Pi 1.1.0 extension/RPC UI guidance and the verified
template baseline notes at
[`pi-extension-template` PR #130](https://github.com/eiei114/pi-extension-template/blob/fc1286f52ca033f9f73fe7fc4af7662a9d1514a4/docs/pi-sdk-compatibility.md).
The APIs used here (`session_start`, `modelRegistry`,
`setModel`, `ui.select`, `ui.custom`, `DynamicBorder`, and Pi TUI components) are
supported by 1.1.0. No deprecated API was present in this package's surface, so
no speculative replacement was made.

## Verification

Run `npm run ci`. It typechecks and tests the package, runs `npm run smoke:pi`
against the installed local Pi CLI, and finishes with `npm pack --dry-run`.
The smoke uses an isolated `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`, and a local
offline-only model definition; it does not make inference requests. The real Pi
1.1.0 process loads the extension, handles RPC selection dialogs, selects the
configured model, exercises the about command and malformed-input path, then
repeats feature selection from persisted recents in a second process. It also
checks the native host shell's version output. It does not mock Pi's loader,
extension lifecycle, RPC handling, or selection feature path.

Machine-readable actual observations are committed in
`docs/verification/pi-sdk-smoke.json`. The harness includes strict assertions
for each response and regression tests proving that missing responses fail.
