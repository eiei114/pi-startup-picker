import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const recentStore = await import("../lib/recent-store.ts");

test("loadRecentCombinations returns empty list for malformed JSON and non-array payloads", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");
	await writeFile(path, "not json", "utf8");

	assert.deepEqual(await recentStore.loadRecentCombinations(path), []);

	await writeFile(path, JSON.stringify({ provider: "openai" }), "utf8");
	assert.deepEqual(await recentStore.loadRecentCombinations(path), []);
});

test("readRecentCombinations keeps the first valid label for each provider/model pair", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const path = join(dir, "recents.json");
	const first = { provider: "openai", modelId: "shared", modelName: "First label" };
	const otherProvider = { provider: "anthropic", modelId: "shared", modelName: "Other provider" };
	const otherModel = { provider: "openai", modelId: "different", modelName: "Other model" };
	const content = JSON.stringify([
		{ ...first, modelName: 123 },
		first,
		otherProvider,
		{ ...first, modelName: "Later label" },
		otherModel,
	]);
	await writeFile(path, content, "utf8");

	assert.deepEqual(await recentStore.readRecentCombinations(path), {
		status: "loaded",
		recents: [first, otherProvider, otherModel],
	});
	assert.equal(await readFile(path, "utf8"), content);
});

test("saveRecentCombination fills all three slots despite duplicates in the existing file", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const path = join(dir, "recents.json");
	const first = { provider: "openai", modelId: "gpt-5", modelName: "GPT-5" };
	const second = { provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" };
	const older = { provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" };
	const selection = { provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" };
	await writeFile(path, JSON.stringify([first, { ...first, modelName: "Later label" }, second, older]), "utf8");

	const expected = [selection, first, second];
	assert.deepEqual(await recentStore.saveRecentCombination(selection, path), expected);
	assert.deepEqual(JSON.parse(await readFile(path, "utf8")), expected);
});

test("saveRecentCombination recovers a malformed store file on next save", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");
	await writeFile(path, "{not valid json", "utf8");

	const saved = await recentStore.saveRecentCombination(
		{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" },
		path,
	);

	assert.deepEqual(saved, [{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }]);
	assert.deepEqual(await recentStore.loadRecentCombinations(path), saved);

	const raw = await readFile(path, "utf8");
	assert.equal(raw, `${JSON.stringify(saved, null, 2)}\n`);
});

test("saveRecentCombination preserves valid neighbors around malformed rows", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");
	await writeFile(
		path,
		JSON.stringify([
			{ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" },
			{ provider: "broken", modelId: 123 },
			{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" },
		]),
		"utf8",
	);

	const saved = await recentStore.saveRecentCombination(
		{ provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" },
		path,
	);

	assert.deepEqual(saved, [
		{ provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" },
		{ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" },
		{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" },
	]);
	assert.deepEqual(await recentStore.loadRecentCombinations(path), saved);
});

test("saveRecentCombination persists pretty-printed JSON with trailing newline", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");

	const saved = await recentStore.saveRecentCombination(
		{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" },
		path,
	);

	const raw = await readFile(path, "utf8");
	assert.equal(raw, `${JSON.stringify(saved, null, 2)}\n`);
	assert.deepEqual(JSON.parse(raw), saved);
});

test("saveRecentCombination leaves no temp files after successful atomic save", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");

	await recentStore.saveRecentCombination({ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" }, path);
	await recentStore.saveRecentCombination(
		{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" },
		path,
	);

	const leftovers = (await readdir(dir)).filter((name) => name.endsWith(".tmp"));
	assert.deepEqual(leftovers, []);
});

test("saveRecentCombination dedupes and caps to 3", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");

	await recentStore.saveRecentCombination({ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" }, path);
	await recentStore.saveRecentCombination({ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" }, path);
	await recentStore.saveRecentCombination({ provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" }, path);
	await recentStore.saveRecentCombination({ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" }, path);
	await recentStore.saveRecentCombination({ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }, path);

	const recents = await recentStore.loadRecentCombinations(path);
	assert.deepEqual(recents, [
		{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" },
		{ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" },
		{ provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" },
	]);

	const persisted = JSON.parse(await readFile(path, "utf8"));
	assert.equal(persisted.length, 3);
});

test("normalizeRecentCombinations drops invalid rows", () => {
	assert.deepEqual(
		recentStore.normalizeRecentCombinations([
			{ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" },
			{ provider: 123, modelId: "bad" },
			null,
		]),
		[{ provider: "openai", modelId: "gpt-5", modelName: "GPT-5" }],
	);
});

test("saveRecentCombination removes the temp file when rename fails", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	const path = join(dir, "recents.json");
	const initial = [{ provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" }];
	const initialContent = `${JSON.stringify(initial, null, 2)}\n`;
	await writeFile(path, initialContent, "utf8");

	// A directory destination makes rename(temp, path) fail after a
	// successful temp write, exercising the failure-path cleanup.
	const destDir = join(dir, "destdir");
	await mkdir(destDir, { recursive: true });

	await assert.rejects(
		recentStore.saveRecentCombination({ provider: "openai", modelId: "gpt-5" }, destDir),
	);

	// saveRecentCombination writes its temp file into dirname(path), so the
	// leak check has to scan the parent directory rather than destDir itself.
	const leftovers = (await readdir(dir)).filter((name) => name.endsWith(".tmp"));
	assert.deepEqual(leftovers, []);

	// Atomic save must not corrupt an unrelated existing store file.
	assert.equal(await readFile(path, "utf8"), initialContent);
	assert.deepEqual(await recentStore.loadRecentCombinations(path), initial);
});

test("saveRecentCombination removes the temp file when the temp write fails", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-recents-"));
	// A NUL byte rejects the temp write before any file is created.
	const path = join(dir, "recents.json\0");

	await assert.rejects(recentStore.saveRecentCombination({ provider: "openai", modelId: "gpt-5" }, path));

	const leftovers = (await readdir(dir)).filter((name) => name.endsWith(".tmp"));
	assert.deepEqual(leftovers, []);
});
