import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { runStartupPicker } = await import("../lib/startup-picker.ts");
const settingsStore = await import("../lib/settings-store.ts");

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
		mode: "tui",
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
			settingsPath: "ignored-settings.json",
		loadSettings: async () => ({ showOnNewSession: false }),
		storePath: "ignored.json",
			loadRecents: async () => recents,
			saveRecent: async (selection) => {
				savedSelections.push(selection);
				return savedSelections;
			},
		},
	};
}

test("startup picker skips resume, fork and reload regardless of the /new setting", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model] });

	for (const reason of ["resume", "fork", "reload"]) {
		const result = await runStartupPicker(harness.pi, { type: "session_start", reason }, harness.ctx, harness.options);

		assert.deepEqual(result, { action: "skipped", reason: `reason:${reason}` });
	}

	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls.length, 0);
});

test("resume, fork and reload never show the picker even with the /new setting on", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model] });

	for (const reason of ["resume", "fork", "reload"]) {
		const result = await runStartupPicker(harness.pi, { type: "session_start", reason }, harness.ctx, {
			...harness.options,
			loadSettings: async () => ({ showOnNewSession: true }),
		});

		assert.deepEqual(result, { action: "skipped", reason: `reason:${reason}` });
	}

	assert.equal(harness.selectCalls.length, 0);
});

test("/new is a no-op when no settings file exists", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model], selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"] });

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		// Real loader against a path that does not exist: missing file means off.
		settingsPath: join(tmpdir(), "pi-startup-picker-missing-settings", "settings.json"),
		loadSettings: settingsStore.loadPickerSettings,
	});

	assert.equal(result.action, "skipped");
	assert.equal(result.reason, "new-session-disabled");
	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls.length, 0);
});
test("/new is a no-op when the setting is off", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model] });

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, harness.options);

	assert.deepEqual(result, { action: "skipped", reason: "new-session-disabled" });
	assert.equal(harness.selectCalls.length, 0);
	assert.equal(harness.setModelCalls.length, 0);
});
test("/new shows the picker and applies the chosen model when the setting is on", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: claude,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "selected");
	assert.equal(result.reason, "model-selected");
	assert.deepEqual(harness.setModelCalls, [gpt]);
	assert.deepEqual(harness.savedSelections, [{ provider: "openai", modelId: "gpt-5.4", modelName: "GPT-5.4" }]);
});
test("/new reuses the searchable recent-first picker", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		currentModel: gpt,
		recents: [{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" }],
	});
	let received;

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
		pickModel: async (_ctx, models, recents) => {
			received = { models, recents, currentModel: _ctx.model };
			return models.find((model) => model.id === "claude-sonnet-4");
		},
	});

	assert.equal(result.action, "selected");
	assert.deepEqual(received.recents, [{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" }]);
	assert.equal(received.currentModel, gpt);
});
test("/new cancel keeps the pre-picker current model without the startup fallback", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", undefined],
		currentModel: claude,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "kept-current");
	assert.equal(result.reason, "cancelled-provider-model");
	assert.equal(harness.setModelCalls.length, 0);
	assert.equal(harness.savedSelections.length, 0);
	assert.deepEqual(harness.notifications, []);
});
test("/new with no UI keeps the current model and does not fall back", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [model], currentModel: model });
	harness.ctx.hasUI = false;

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.deepEqual(result, { action: "skipped", reason: "no-ui" });
	assert.equal(harness.savedSelections.length, 0);
});
test("/new with an empty registry warns and keeps the current model", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({ models: [], currentModel: model });

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "kept-current");
	assert.equal(result.reason, "no-available-models");
	assert.equal(harness.notifications[0].level, "warning");
	assert.match(harness.notifications[0].message, /Continuing \/new with OPENAI \(openai\) -> GPT-5.4 \(gpt-5.4\)/);
	assert.equal(harness.savedSelections.length, 0);
});
test("/new setModel failure warns, keeps the current model and skips the recent store", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: claude,
		setModelSuccess: false,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "kept-current");
	assert.equal(result.reason, "set-model-failed");
	assert.equal(harness.notifications[0].level, "warning");
	assert.match(harness.notifications[0].message, /Continuing \/new with ANTHROPIC \(anthropic\) -> Claude Sonnet 4 \(claude-sonnet-4\)/);
	assert.equal(harness.savedSelections.length, 0);
});
test("/new treats a thrown setModel error as a kept-current warning", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
	const harness = createHarness({
		models: [gpt, claude],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: claude,
	});
	harness.pi.setModel = async () => {
		throw new Error("boom");
	};

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "kept-current");
	assert.equal(harness.notifications[0].level, "warning");
	assert.equal(harness.savedSelections.length, 0);
});
test("/new selecting the already current model writes no recent entry", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [gpt],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: gpt,
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "kept-current");
	assert.equal(result.reason, "already-current-model");
	assert.equal(harness.setModelCalls.length, 0);
	assert.equal(harness.savedSelections.length, 0);
});
test("/new ignores unknown recents and only offers available models", async () => {
	const gpt = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [gpt],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		recents: [{ provider: "anthropic", modelId: "claude-sonnet-4", modelName: "Claude Sonnet 4" }],
	});

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "selected");
	assert.equal(harness.selectCalls[0].title, "Choose a provider");
	assert.equal(harness.savedSelections.length, 1);
});
test("/new keeps the RPC select-dialog deferral path", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [model],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
		currentModel: createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4"),
	});
	harness.ctx.mode = "rpc";

	const result = await runStartupPicker(harness.pi, { type: "session_start", reason: "new" }, harness.ctx, {
		...harness.options,
		loadSettings: async () => ({ showOnNewSession: true }),
	});

	assert.equal(result.action, "selected");
	assert.deepEqual(harness.selectCalls.map((call) => call.title), ["Choose a provider", "Choose a model"]);
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

test("startup picker uses supported selection dialogs in RPC mode", async () => {
	const model = createModel("openai", "gpt-5.4", "GPT-5.4");
	const harness = createHarness({
		models: [model],
		selectAnswers: ["OPENAI (openai)", "GPT-5.4 (gpt-5.4)"],
	});
	harness.ctx.mode = "rpc";
	let customCalled = false;
	harness.ctx.ui.custom = async () => {
		customCalled = true;
		return undefined;
	};

	const result = await runStartupPicker(
		harness.pi,
		{ type: "session_start", reason: "startup" },
		harness.ctx,
		harness.options,
	);

	assert.equal(result.action, "selected");
	assert.equal(result.reason, "model-selected");
	assert.equal(customCalled, false);
	assert.deepEqual(harness.selectCalls.map((call) => call.title), ["Choose a provider", "Choose a model"]);
	assert.deepEqual(harness.setModelCalls, [model]);
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
