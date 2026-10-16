import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const examples = await readFile(new URL("../docs/examples.md", import.meta.url), "utf8");
const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");
const autoReleaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

test("package declares pi extension entrypoint only", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
  assert.equal(packageJson.pi.skills, undefined);
  assert.equal(packageJson.pi.prompts, undefined);
  assert.equal(packageJson.pi.themes, undefined);
});

test("README pinned install example matches package version", () => {
  const pinMatch = readme.match(/pi install npm:pi-startup-picker@([\d.]+)/);
  assert.ok(pinMatch, "README should include a pinned npm install example");
  assert.equal(pinMatch[1], packageJson.version);
});

test("examples doc includes npm install and local dev flows", () => {
  assert.match(examples, /pi install npm:pi-startup-picker@([\d.]+)/);
  assert.match(examples, /pi -e npm:pi-startup-picker/);
  assert.match(examples, /pi -e \./);
  assert.match(examples, /\/startup-picker:about/);
});

test("examples pinned install example matches package version", () => {
  const pinMatch = examples.match(/pi install npm:pi-startup-picker@([\d.]+)/);
  assert.ok(pinMatch, "docs/examples.md should include a pinned npm install example");
  assert.equal(pinMatch[1], packageJson.version);
});

test("ROADMAP distinguishes latest published version and PR candidate", () => {
  const publishedMatch = roadmap.match(/\*\*Latest published package version\*\*: `pi-startup-picker@([\d.]+)`/);
  assert.ok(publishedMatch, "ROADMAP should declare the latest published package version");
  assert.ok(roadmap.includes(`| ${publishedMatch[1]} |`), "release history should include the latest published version");

  const candidateMatch = roadmap.match(/\*\*Pending candidate\*\*: `pi-startup-picker@([\d.]+)` in the current compatibility PR; it is not published\./);
  assert.ok(candidateMatch, "ROADMAP should identify the unpublished compatibility PR candidate");
  assert.equal(candidateMatch[1], packageJson.version);
  assert.notEqual(publishedMatch[1], candidateMatch[1]);
});

test("ROADMAP keeps maintenance seed structure intact", () => {
  const seedHeadings = [...roadmap.matchAll(/^### S-\d+\b.*$/gm)];
  assert.ok(seedHeadings.length >= 3, "ROADMAP should list at least three maintenance seeds");

  for (const [index, heading] of seedHeadings.entries()) {
    const sectionStart = heading.index;
    const headingAfterSeed = roadmap.slice(sectionStart + heading[0].length).match(/^#{1,3}\s/m);
    const sectionEnd = headingAfterSeed
      ? sectionStart + heading[0].length + headingAfterSeed.index
      : roadmap.length;
    const section = roadmap.slice(sectionStart, sectionEnd);
    assert.match(section, /\(~\d+-\d+ min\)/, `${heading[0]} should include a time estimate`);
  }
});

test("package is discoverable as a Pi package", () => {
  assert.ok(packageJson.keywords.includes("pi-package"));
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("template includes npm release workflow handoff", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /npm publish --access public/);
});
