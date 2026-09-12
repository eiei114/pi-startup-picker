# Examples

This repository ships the startup-only provider/model picker vertical slice.

## Install from npm

Install the published package with Pi:

```bash
pi install npm:pi-startup-picker
```

Pin the current release when you want a reproducible install:

```bash
pi install npm:pi-startup-picker@0.3.2
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-startup-picker -l
```

Try it once without permanently installing:

```bash
pi -e npm:pi-startup-picker
```

On a normal Pi startup, the picker appears before the session begins.

## Local development

From a clone of this repository:

```bash
npm install
pi -e .
```

Then run:

```txt
/startup-picker:about
```

The main behavior is automatic on normal Pi startup.

## Extension surface

`extensions/index.ts` registers:

- automatic startup picker on normal `session_start`
- `/startup-picker:about`

## Recent store

Recent combinations are persisted to:

```txt
~/.pi/agent/pi-startup-picker-recents.json
```

The store keeps the three most recent provider/model combinations, deduped and most-recent-first. Malformed files are treated as empty and rewritten on the next successful save.
