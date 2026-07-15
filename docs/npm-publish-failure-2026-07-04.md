# npm publish failure investigation (2026-07-04)

## Scope

This report records evidence for the failed `Publish to npm` GitHub Actions run:

- Failed run: <https://github.com/eiei114/pi-startup-picker/actions/runs/28704558891>
- Workflow: `Publish to npm`
- Job: `Publish package`
- Conclusion: failure
- Created at: 2026-07-04 11:20:01 UTC

No release workflow, package version, changelog, npm registry state, or release was changed for this investigation.

## Run evidence

The failed run was a manual `workflow_dispatch` run against ref `v0.2.2`:

- Event: `workflow_dispatch`
- Head branch/ref shown by GitHub: `v0.2.2`
- Checked-out ref in the log: `refs/tags/v0.2.2`
- Head SHA: `3a021df2625cae1ad092b1972193c26fe7434ac5`
- `package.json` at that SHA declared `pi-startup-picker@0.2.2`.

The same commit also triggered a nearby automatic push run:

- Successful run: <https://github.com/eiei114/pi-startup-picker/actions/runs/28704554969>
- Event: `push`
- Head branch: `main`
- Head SHA: `3a021df2625cae1ad092b1972193c26fe7434ac5`
- Created at: 2026-07-04 11:19:49 UTC
- `Publish to npm` step completed successfully at 11:20:21 UTC.

## npm public state

Current public registry state confirms that `0.2.2` is published:

```sh
npm view pi-startup-picker version versions --json
```

Observed result during investigation:

```json
{
  "version": "0.2.2",
  "versions": ["0.1.0", "0.2.2"]
}
```

## Failure output

The failed manual run validated and packed `pi-startup-picker@0.2.2`, then attempted to publish. Its publish step failed with npm `E403`:

```text
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=2069648552
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/pi-startup-picker - You cannot publish over the previously published versions: 0.2.2.
npm error 403 In most cases, you or one of your dependencies are requesting a package version that is forbidden by your security policy, or on a server you do not have access to.
npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-07-04T11_20_25_554Z-debug-0.log
```

## Classification

Cause classification: **duplicate-version**.

The manual run started while the automatic push run for the same commit was already in progress. Both runs saw `pi-startup-picker@0.2.2` as unpublished during their preflight checks, but the push run published `0.2.2` first. The manual run then attempted to publish the same immutable npm version and npm correctly rejected it.

This is not classified as a Trusted Publishing/authentication failure because the failing run reached npm publish, signed provenance, and received a duplicate-version `E403` from the registry. It is not a package-version content problem; the same package version was successfully published by the adjacent push run.

## Current workflow behavior

`.github/workflows/publish.yml` currently publishes on:

- pushes to `main` when `package.json`, `package-lock.json`, or the publish workflow changes;
- version tags matching `v*.*.*`;
- published GitHub releases;
- manual `workflow_dispatch` with optional `ref` input.

It uses this concurrency group:

```yaml
concurrency:
  group: npm-publish-${{ github.event.inputs.ref || github.ref }}
  cancel-in-progress: false
```

For the 2026-07-04 duplicate, the automatic push run grouped by `refs/heads/main`, while the manual run grouped by `v0.2.2`. Those are different groups even though both resolved to the same commit/package version, so GitHub Actions allowed the publish jobs to overlap.

The workflow already has a `Skip already published version` guard based on `npm view "${name}@${version}" version`. That guard is useful for later re-runs after the package is visible in npm, but it cannot prevent a race where two publish jobs both check before either one finishes publishing.

## Reproducible non-publish check

Use this check before any human-owned publish or workflow re-run. It does not publish or mutate registry state:

```sh
npm ci
npm run ci
node -e "const p=require('./package.json'); console.log(`${p.name}@${p.version}`)"
npm view "$(node -p "require('./package.json').name")@$(node -p "require('./package.json').version")" version
```

Expected duplicate-version result for the current repository state:

```text
0.2.2
```

If `npm view` prints the package version, the exact package version is already public and any `npm publish` for that version should be skipped.

## Smallest safe correction options

Do not rerun the failed workflow for `v0.2.2`; the package is already public.

Small safe follow-up options, from least to most invasive:

1. Operational guard: document that maintainers should not manually dispatch `Publish to npm` for a version while a push/tag/release publish run for the same version is in progress.
2. Workflow guard: add an early check that detects an in-progress publish run for the same package version before reaching `npm publish`, then exits cleanly or waits and rechecks `npm view`.
3. Concurrency normalization: compute the package version first and route all publish attempts for the same package version through one shared concurrency key. This requires restructuring because GitHub Actions job-level concurrency cannot directly use values read from `package.json` before checkout.
4. Trigger simplification: reduce overlapping publish entry points so one release path owns publication, with manual dispatch kept only for explicit recovery after checking the npm public state.
