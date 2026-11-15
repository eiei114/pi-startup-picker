import assert from "node:assert/strict";
import test from "node:test";

const { openSearchableModelPicker } = await import("../lib/searchable-model-picker.ts");

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

function createPicker(models) {
	const doneResults = [];
	let component;
	let resolveDone;
	const result = new Promise((resolve) => {
		resolveDone = resolve;
	});
	const pickerResult = openSearchableModelPicker(
		{
			custom: async (factory) => {
				component = factory(
					{ requestRender() {} },
					{
						fg: (_color, text) => text,
						bold: (text) => text,
					},
					{},
					(value) => {
						doneResults.push(value);
						resolveDone(value);
					},
				);
				return result;
			},
		},
		{
			models,
			providerLabel: (provider) => provider,
			modelLabel: (model) => model.name,
		},
	);

	return { component, doneResults, pickerResult };
}

function renderPicker(component) {
	return component.render(120).join("\n");
}

const claude = createModel("anthropic", "claude-sonnet-4", "Claude Sonnet 4");
const gpt41 = createModel("openai", "gpt-4.1", "GPT-4.1");
const gpt42 = createModel("openai", "gpt-4.2", "GPT-4.2");
const models = [claude, gpt41, gpt42];

test("Enter after typing selects the first matching model", async () => {
	const picker = createPicker(models);

	picker.component.handleInput("gpt");
	assert.match(renderPicker(picker.component), /→ GPT-4\.1/);
	picker.component.handleInput("\r");

	assert.equal(await picker.pickerResult, gpt41);
	assert.deepEqual(picker.doneResults, [gpt41]);
});

test("typing after navigating down resets selection to the first match", async () => {
	const picker = createPicker(models);

	picker.component.handleInput("\u001b[B");
	assert.match(renderPicker(picker.component), /→ GPT-4\.1/);
	picker.component.handleInput("gpt");
	assert.match(renderPicker(picker.component), /→ GPT-4\.1/);
	picker.component.handleInput("\r");

	assert.equal(await picker.pickerResult, gpt41);
	assert.deepEqual(picker.doneResults, [gpt41]);
});

test("an unchanged query preserves selection when cursor keys are pressed", async () => {
	const picker = createPicker(models);

	picker.component.handleInput("\u001b[B");
	picker.component.handleInput("\u001b[D");
	assert.match(renderPicker(picker.component), /→ GPT-4\.1/);
	picker.component.handleInput("\r");

	assert.equal(await picker.pickerResult, gpt41);
});

test("arrow-down wraps from the last model to the first", async () => {
	const picker = createPicker(models);

	picker.component.handleInput("\u001b[B");
	picker.component.handleInput("\u001b[B");
	picker.component.handleInput("\u001b[B");
	assert.match(renderPicker(picker.component), /→ Claude Sonnet 4/);
	picker.component.handleInput("\r");

	assert.equal(await picker.pickerResult, claude);
});

test("Enter on a no-match query selects nothing", async () => {
	const picker = createPicker(models);

	picker.component.handleInput("zzzz-no-match");
	assert.match(renderPicker(picker.component), /No matching models/);
	picker.component.handleInput("\r");
	assert.deepEqual(picker.doneResults, []);

	picker.component.handleInput("\u001b");
	assert.equal(await picker.pickerResult, undefined);
});

test("Esc cancels with undefined", async () => {
	const picker = createPicker(models);

	picker.component.handleInput("\u001b");

	assert.equal(await picker.pickerResult, undefined);
	assert.deepEqual(picker.doneResults, [undefined]);
});
