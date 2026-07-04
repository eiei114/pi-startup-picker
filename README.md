# Pi Startup Picker

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

Current state: the first vertical slice is implemented. On normal startup, the extension can show a provider/model picker, remember recent combinations, and fall back to the existing default model when canceled.

## Current features

- Show a provider and model picker on `session_start` for normal startup.
- Surface recent provider/model combinations so repeated launches are faster.
- Fall back to the user's existing default provider/model when the picker is canceled or selection fails.
- Persist recent combinations in a small global JSON file across launches.

## Install

Published package:

```bash
pi install npm:pi-startup-picker
```

From GitHub:

```bash
pi install git:github.com/eiei114/pi-startup-picker
```

Try locally during development:

```bash
pi -e .
```

## Quick start

Useful smoke commands:

```txt
/startup-picker:about
/startup-picker:hello
```

The main behavior is automatic on normal Pi startup.

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi extension entrypoints and early smoke commands |
| `lib/` | Shared TypeScript helpers |
| `skills/` | Agent Skills |
| `prompts/` | Prompt templates |
| `themes/` | Theme placeholders from the template |
| `docs/` | Supporting docs and bootstrap notes |

## Development

```bash
npm install
npm run ci
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md) for setup details.

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-startup-picker
- GitHub: https://github.com/eiei114/pi-startup-picker
- Issues: https://github.com/eiei114/pi-startup-picker/issues

## License

MIT
