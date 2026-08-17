# Examples

This repository ships the startup-only provider/model picker vertical slice.

## Extension

`extensions/index.ts` registers:

- automatic startup picker on normal `session_start`
- `/startup-picker:about`

Try it with:

```bash
pi -e .
```

Then run:

```txt
/startup-picker:about
```

On a normal Pi startup, the picker appears before the session begins.

## Recent store

Recent combinations are persisted to:

```txt
~/.pi/agent/pi-startup-picker-recents.json
```

The store keeps the three most recent provider/model combinations, deduped and most-recent-first. Malformed files are treated as empty and rewritten on the next successful save.
