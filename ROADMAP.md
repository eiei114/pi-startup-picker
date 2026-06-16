# ROADMAP

Status: **startup-only vertical slice shipped in 0.2.0**

Goal: ship a thin startup picker that lets Pi power users choose provider/model before the session begins.

## Shipped in 0.2.0

- startup-only trigger on normal `session_start`
- recent 3 provider/model combinations, deduped and most-recent-first
- cancel or selection failure -> default provider/model fallback
- malformed recent-store recovery with empty fallback and self-heal on next save
- integration and store regression tests for the startup matrix

## Current non-goals

- launch hub or one-screen custom UI
- auth-aware live availability probe
- interception of `/resume`, `/fork`, `/reload`, or other non-startup session reasons
- preset routing, policy routing, or scheduled model switching

## Next candidates

These are intentionally out of scope for the first shipped slice:

- decide whether `/new` should reuse the startup picker
- richer recent labels or availability hints
- optional non-startup triggers after real usage feedback

## Links

- README: [README.md](README.md)
- Issues: https://github.com/eiei114/pi-startup-picker/issues
