# Examples

This repository ships the startup provider/model picker vertical slice, plus the opt-in `/new` picker.

## Install from npm

Install the published package with Pi:

```bash
pi install npm:pi-startup-picker
```

Pin the latest published version when you want a reproducible install:

```bash
pi install npm:pi-startup-picker@0.3.8
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

## Opt-in picker on `/new`

`/new` behaves exactly as before until you turn the picker on:

```txt
/startup-picker:settings
```

Select `Ask on /new: on` to reuse the same searchable, recent-first picker when `/new` starts a
session. Cancelling the dialog keeps the current value, and a failed write is reported as an
error instead of being shown as saved. `/startup-picker:about` reports the current state.

With the setting on, the baseline for `/new` is the model that was current before the picker
opened. Cancel, no UI, an empty registry, an unknown recent entry and a failed model switch all
keep that model and let `/new` continue; only a successful switch reaches the recent store.

## Extension surface

`extensions/index.ts` registers:

- automatic startup picker on normal `session_start`
- opt-in picker on `/new` (`showOnNewSession`)
- `/startup-picker:about`
- `/startup-picker:settings`

## Recent store

Recent combinations are persisted to:

```txt
~/.pi/agent/pi-startup-picker-recents.json
```

The store keeps the three most recent provider/model combinations, deduped and most-recent-first. Malformed files are treated as empty and rewritten on the next successful save.

## Settings store

The `/new` opt-in setting lives next to the recent store:

```txt
~/.pi/agent/pi-startup-picker-settings.json
```

```json
{
  "showOnNewSession": true
}
```

Missing, malformed and non-boolean values all mean `false`. Reading the file never rewrites it.
