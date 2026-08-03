# Pi Startup Picker

[![Join dotfield.xyz on Discord](https://img.shields.io/badge/Join%20dotfield.xyz%20on%20Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/4945dXZVW5)

[![CI](https://github.com/eiei114/pi-startup-picker/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-startup-picker/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-startup-picker/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-startup-picker/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-startup-picker.svg)](https://www.npmjs.com/package/pi-startup-picker)
[![npm downloads](https://img.shields.io/npm/dm/pi-startup-picker.svg)](https://www.npmjs.com/package/pi-startup-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

> Choose your provider and model at Pi startup, before the session begins.

## What this is

Pi Startup Picker is a Pi extension for power users who switch models often and want that choice up front instead of launching Pi and then detouring to `/model`.

On normal startup, the extension shows a searchable provider/model picker before the session begins, remembers your last three combinations, and falls back to your existing default provider/model when you cancel or selection fails.

The package intentionally targets normal startup only: it runs on `session_start` when the reason is `startup`, no-ops cleanly for other session reasons such as `resume`, `fork`, `reload`, and `new`, and skips when UI is unavailable. See [ROADMAP.md](ROADMAP.md) for current non-goals and follow-up ideas.

## Features

- Show a searchable provider/model picker on `session_start` for normal startup only.
- Type to fuzzy-filter models by provider, id, or name and narrow the list live.
- Surface recent provider/model combinations at the top so repeated launches are faster.
- Fall back to the user's existing default provider/model when the picker is canceled or selection fails.
- Persist recent combinations in a small global JSON file across launches.
- Recover cleanly from malformed recent-store files by treating them as empty and rewriting on the next save.

## Install

Install the published npm package with Pi:

```bash
pi install npm:pi-startup-picker
```

Pin a specific version when you want reproducible installs:

```bash
pi install npm:pi-startup-picker@0.3.0
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-startup-picker -l
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-startup-picker
```

Try it without permanently installing:

```bash
pi -e npm:pi-startup-picker
```

## Quick start

Try this package locally:

```bash
pi -e .
```

Then run:

```txt
/startup-picker:about
```

The main behavior is automatic on normal Pi startup.

Recent combinations are stored at:

```txt
~/.pi/agent/pi-startup-picker-recents.json
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi extension entrypoint and smoke command |
| `lib/` | Searchable startup picker, model-search helpers, and recent-store |
| `docs/` | Release notes and supporting maintainer docs |
| `skills/` | Agent Skills placeholders (Pi package manifest) |
| `prompts/` | Prompt template placeholders (Pi package manifest) |
| `themes/` | Theme placeholders (Pi package manifest) |

## Development

```bash
npm install
npm run ci
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push --follow-tags
```

See [`docs/release.md`](docs/release.md) for setup details.

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-startup-picker
- GitHub: https://github.com/eiei114/pi-startup-picker
- Issues: https://github.com/eiei114/pi-startup-picker/issues
- Roadmap: [ROADMAP.md](ROADMAP.md)

## License

MIT