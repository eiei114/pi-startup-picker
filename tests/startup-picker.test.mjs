import assert from "node:assert/strict";
import test from "node:test";

const { runStartupPicker } = await import("../lib/startup-picker.ts");

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

function createHarness({
	models,
	selectAnswers = [],
	setModelSuccess = true,
	currentModel,
	recents = [],
} = {}) {
	const selections = [...selectAnswers];
	const selectCalls = [];
	const notifications = [];
	const savedSelections = [];
	const setModelCalls = [];

	const ctx = {
		hasUI: true,
		model: currentModel,
		modelRegistry: {
			getAvailable: () => models,
			getProviderDisplayName: (provider) => provider.toUpperCase(),
		},
		ui: {
			select: async (title, options) => {
				selectCalls.push({ title, options });
				return selections.shift();
			},
			notify: (message, level) => {
				notifications.push({ message, level });
			},
		},
	};

	const pi = {
		setModel: async (model) => {
			setModelCalls.push(model);
			return setModelSuccess;
		},
	};

	return {
		ctx,
		pi,
		selectCalls,
		notifications,
		savedSelections,
		setModelCalls,
		options: {
			storePath: "ignored.json",
			loadRecents: async () => recents,
			saveRecent: async (selection) => {
				savedSelections.push(selection);
				return savedSelections;
			},
		},
	};
}

test("startup picker skips non-startup reasons", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model] });

	for (const reason of ["resume", "fork", "reload", "new"]) {
		const result = await runStartupPicker(harness.pi, { type: "session_start", reason }, harness.ctx, harness.options);

		assert.deepEqual(result, { action: "skipped", reason: `reason:${reason}` });
	}

	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls.length, 0);
});

test("startup picker skips when UI is unavailable", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model] });
	harness.ctx.hasUI = false;

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.deepEqual(result, { action: "skipped", reason: "no-ui" });
	assert.equal(harness.selectCalls.length, 0);
});

test("startup picker falls back when no models are available", async () => {
	const harness = createHarness({ models: [] });

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "fallback");
	assert.equal(result.reason, "no-available-models");
	assert.equal(harness.selectCalls.length, 0);
	assert.match(harness.notifications[0].message, /No configured models are available/);
});

test("startup picker falls back silently on cancel", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model], selectAnswers: [undefined] });

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "fallback");
	assert.equal(harness.setModelCalls.length, 0);
	assert.deepEqual(harness.notifications, []);
});

test("startup picker supports provider -> model selection when no recents exist", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: claude,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls.length, 2);
	assert.equal(harness.setModelCalls[0].provider, "openai");
	assert.deepEqual(harness.savedSelections, [
		{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" },
	]);
});

test("startup picker can select from recents", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["Recent: OPENAI (openai) -> GPT-5.4 (gpt-5.4)"],
		recents: [{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }],
		currentModel: claude,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls.length, 1);
	assert.equal(harness.setModelCalls[0].id, "gpt-5.4");
});

test("startup picker falls back when setModel fails", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: claude,
		setModelSuccess: false,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "fallback");
	assert.equal(harness.savedSelections.length, 0);
	assert.equal(harness.notifications.length, 1);
	assert.match(harness.notifications[0].message, /Could not switch to/);
});

test("startup picker can browse all providers from recents", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["Browse all providers", "ANTHROPIC (anthropic)", "Claude Sonnet 4 (claude-sonnet-4)"],
		recents: [{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }],
		currentModel: gpt,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls.length, 3);
	assert.equal(harness.setModelCalls[0].provider, "anthropic");
});

test("startup picker ignores recents that are no longer available", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [gpt],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		recents: [{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" }],
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls.length, 2);
	assert.equal(harness.selectCalls[0].title, "Choose a provider");
});

test("startup picker falls back when provider/model selection is cancelled", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [gpt],
		selectAnswers: ["OPENAI (openai)", undefined],
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "fallback");
	assert.equal(result.reason, "cancelled-provider-model");
	assert.equal(harness.setModelCalls.length, 0);
});

test("startup picker keeps current model and still saves recent when selected model already matches current model", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [gpt],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: gpt,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "selected");
	assert.equal(harness.setModelCalls.length, 0);
	assert.deepEqual(harness.savedSelections, [
		{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" },
	]);
});

test("startup picker uses searchable pickModel when provided", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		currentModel: gpt,
		recents: [{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }],
	});

	let receivedRecents;
	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, {
		...harness.options,
		pickModel: async (_ctx, models, recents) => {
			receivedRecents = recents;
			return models.find((model) => model.id === "claude-sonnet-4");
		},
	});

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls[0].id, "claude-sonnet-4");
	assert.deepEqual(receivedRecents, [{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }]);
});

test("startup picker prefers custom searchable UI when available", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: gpt,
	});

	harness.ctx.ui.custom = async (factory) => {
		const doneResults = [];
		const done = (value) => doneResults.push(value);
		const component = factory(
			{ requestRender() {} },
			{
				fg: (_color, text) => text,
				bold: (text) => text,
			},
			{},
			done,
		);

		assert.equal(typeof component.handleInput, "function");
		done(claude);
		return doneResults.at(-1);
	};

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls[0].id, "claude-sonnet-4");
});

test("startup picker falls back when custom searchable UI is cancelled", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: gpt,
	});

	harness.ctx.ui.custom = async (factory) => {
		const doneResults = [];
		const done = (value) => doneResults.push(value);
		const component = factory(
			{ requestRender() {} },
			{
				fg: (_color, text) => text,
				bold: (text) => text,
			},
			{},
			done,
		);

		assert.equal(typeof component.handleInput, "function");
		done(undefined);
		return doneResults.at(-1);
	};

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "startup" }, harness.ctx, harness.options);

	assert.equal(result.action, "fallback");
	assert.equal(result.reason, "cancelled-provider-model");
	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls.length, 0);
	assert.deepEqual(harness.notifications, []);
});
