# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: this GitHub repository
- Workflow filename: `publish.yml`

## Publish

Prepare version and changelog changes in a reviewed PR. Merging a version change does not
start a release. When a human has authorized a release, manually dispatch **Release Request**
from GitHub Actions with the `main` branch selected.

The request workflow has read-only contents permission. `.github/workflows/auto-release.yml`
runs from the default branch on its completed `workflow_run` event and accepts only a
successful `workflow_dispatch` request whose source is this repository's `main` branch. It
checks `package.json`; if `v<version>` does not exist, it creates the tag and GitHub Release,
then explicitly dispatches `.github/workflows/publish.yml` for that tag.

The `v*.*.*` tag and a published GitHub Release trigger `.github/workflows/publish.yml`;
publishing can also be dispatched manually. These are release actions and remain human-owned.

The workflow skips `name@version` if that exact package version already exists on npm.

## Workflow guardrail

Do not ship a new Pi OSS package or version bump with only `package.json` changes.
The repository must keep this separated release workflow set:

- `.github/workflows/release-request.yml` is the read-only, manual entry point.
- `.github/workflows/auto-release.yml` handles only successful requests from `main` and checks out trusted `main` before using write permissions.
- `.github/workflows/publish.yml` publishes to npm through Trusted Publishing.

Important: tags or releases created by `GITHUB_TOKEN` do not reliably fan out into another workflow through normal `push.tags` or `release.published` triggers. `auto-release.yml` explicitly dispatches `publish.yml` after creating the tag/release. If changing the release flow, keep one explicit handoff path.

## GitHub Actions requirements

- `permissions: id-token: write`
- `permissions: actions: write` and `contents: write` only on the protected release job, to create the tag/release and dispatch `publish.yml`
- `release-request.yml` must stay read-only; `auto-release.yml` must stay on the `workflow_run` path and validate the successful request's source branch and repository
- `auto-release.yml` must call `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`, or `publish.yml` must have an equivalent explicit handoff trigger such as `workflow_run`
- GitHub-hosted runner
- Node.js 24, so the release job uses a current npm CLI for Trusted Publishing
- No `NPM_TOKEN`
- `npm publish` from the configured workflow file

## First release checklist

- [ ] `package.json` name is final
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] CHANGELOG.md has the release date

