import assert from "node:assert/strict";
import test from "node:test";

const { buildSearchableItems, filterSearchableItems } = await import("../lib/model-search.ts");

function createModel(provider, id, name = id) {
	return {
		provider,
		id,
		name,
		api: "openai-completions",
		baseUrl: "https://example.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 32000,
	};
}

test("buildSearchableItems puts available recents first", () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const gemini = createModel("google", "gemini-2.5-pro", "Gemini 2.5 Pro");

	const items = buildSearchableItems([gpt, claude, gemini], [
		{ provider: "google", modelId: "gemini-2.5-pro", modelName: "Gemini 2.5 Pro" },
		{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" },
	]);

	assert.equal(items.length, 3);
	assert.equal(items[0].model.id, "gemini-2.5-pro");
	assert.equal(items[0].isRecent, true);
	assert.equal(items[1].model.id, "gpt-5.4");
	assert.equal(items[1].isRecent, true);
	assert.equal(items[2].model.id, "claude-sonnet-4");
	assert.equal(items[2].isRecent, false);
});

test("buildSearchableItems skips unavailable recents", () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const items = buildSearchableItems([gpt], [
		{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" },
	]);

	assert.equal(items.length, 1);
	assert.equal(items[0].model.id, "gpt-5.4");
	assert.equal(items[0].isRecent, false);
});

test("filterSearchableItems returns all items for empty query", () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const items = buildSearchableItems([gpt, claude]);

	assert.equal(filterSearchableItems(items, "   ").length, 2);
});

test("filterSearchableItems fuzzy-matches provider and model id", () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const items = buildSearchableItems([gpt, claude]);

	const byProvider = filterSearchableItems(items, "anth");
	assert.equal(byProvider.length, 1);
	assert.equal(byProvider[0].model.provider, "anthropic");

	const byId = filterSearchableItems(items, "gpt54");
	assert.equal(byId.length, 1);
	assert.equal(byId[0].model.id, "gpt-5.4");

	const byName = filterSearchableItems(items, "sonnet");
	assert.equal(byName.length, 1);
	assert.equal(byName[0].model.id, "claude-sonnet-4");
});

test("filterSearchableItems returns empty list when nothing matches", () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const items = buildSearchableItems([gpt]);

	assert.equal(filterSearchableItems(items, "zzzz-nope").length, 0);
});
