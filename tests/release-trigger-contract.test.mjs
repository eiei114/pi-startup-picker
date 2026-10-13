import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseRequestWorkflow = await readFile(new URL("../.github/workflows/release-request.yml", import.meta.url), "utf8");
const releaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

function assertProtectedReleaseSeparation(request, release, publish) {
  const requestTriggers = request.split("permissions:")[0];
  const releaseTriggers = release.split("jobs:")[0];
  const publishTriggers = publish.split("permissions:")[0];
  assert.match(requestTriggers, /on:\r?\n\s+workflow_dispatch:/, "manual release request must remain available");
  assert.doesNotMatch(requestTriggers, /^\s+(push|pull_request):/m, "merges must not start a release request");
  assert.doesNotMatch(request, /actions:\s*write|contents:\s*write/, "untrusted request workflow must not get write permissions");
  assert.match(releaseTriggers, /on:\r?\n\s+workflow_run:\r?\n\s+workflows:\s+\[\"Release Request\"\]/);
  assert.match(releaseTriggers, /types:\s*\[completed\]/);
  assert.doesNotMatch(releaseTriggers, /workflow_dispatch|^\s+push:/m, "privileged workflow must not run directly from a selected ref or merge");
  assert.match(release, /if: github\.event\.workflow_run\.event == 'workflow_dispatch' && github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.head_branch == 'main' && github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(release, /ref: main/, "protected workflow must check out trusted main");
  assert.match(release, /permissions:\r?\n\s+actions: write\r?\n\s+contents: write/, "write permissions must be scoped to the protected release job");
  assert.doesNotMatch(release.split("jobs:")[0], /permissions:/, "protected permissions must not be workflow-wide");
  assert.match(publishTriggers, /push:\r?\n\s+tags:/, "publishing must remain version-tag gated");
  assert.doesNotMatch(publishTriggers, /branches:|paths:/, "main branch/package edits must not publish");
  assert.match(publishTriggers, /workflow_dispatch:/, "explicit manual publishing remains available");
  assert.match(publish, /npm publish/);
}

test("release writes are isolated from selected-ref manual workflows and merges", () => {
  assert.doesNotThrow(() => assertProtectedReleaseSeparation(releaseRequestWorkflow, releaseWorkflow, publishWorkflow));
  assert.throws(() => assertProtectedReleaseSeparation(
    releaseRequestWorkflow.replace("contents: read", "contents: write"), releaseWorkflow, publishWorkflow));
  assert.throws(() => assertProtectedReleaseSeparation(
    releaseRequestWorkflow, releaseWorkflow.replace("head_branch == 'main'", "head_branch == 'feature'"), publishWorkflow));
  assert.throws(() => assertProtectedReleaseSeparation(
    releaseRequestWorkflow, releaseWorkflow.replace("workflows: [\"Release Request\"]", "workflows: [\"CI\"]"), publishWorkflow));
  assert.throws(() => assertProtectedReleaseSeparation(
    releaseRequestWorkflow, releaseWorkflow, publishWorkflow.replace("    tags:", "    branches: [main]\n    tags:")));
});

test("manual release rejects malformed SemVer without leading zeros", () => {
  const pattern = releaseWorkflow.match(/grep -Eq '([^']+)'/)?.[1];
  assert.ok(pattern, "manual release must validate stable SemVer");
  const stableSemver = new RegExp(pattern);
  for (const version of ["0.0.0", "1.4.2", "10.20.300"]) assert.match(version, stableSemver);
  for (const version of ["01.4.2", "1.04.2", "1.4.02", "1.4", "1.4.2-beta"]) assert.doesNotMatch(version, stableSemver);
});
