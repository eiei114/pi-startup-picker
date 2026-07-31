import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import {
	getRecentStorePath,
	loadRecentCombinations,
	saveRecentCombination,
	type RecentCombination,
} from "./recent-store.ts";
import { openSearchableModelPicker } from "./searchable-model-picker.ts";

type StartupPickerAction =
	| { action: "skipped"; reason: string }
	| { action: "fallback"; reason: string }
	| { action: "selected"; reason: string; selection: RecentCombination };

type PickerContext = Pick<ExtensionContext, "hasUI" | "modelRegistry" | "ui" | "model">;

interface StartupPickerOptions {
	storePath?: string;
	loadRecents?: (path: string) => Promise<RecentCombination[]>;
	saveRecent?: (selection: RecentCombination, path: string) => Promise<RecentCombination[]>;
	pickModel?: (
		ctx: PickerContext,
		models: Model<any>[],
		recents: RecentCombination[],
	) => Promise<Model<any> | undefined>;
}

function modelKey(model: Pick<Model<any>, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

function recentKey(recent: Pick<RecentCombination, "provider" | "modelId">): string {
	return `${recent.provider}/${recent.modelId}`;
}

function sameModel(a: Pick<Model<any>, "provider" | "id"> | undefined, b: Pick<Model<any>, "provider" | "id">): boolean {
	return a !== undefined && a.provider === b.provider && a.id === b.id;
}

function providerLabel(ctx: PickerContext, provider: string): string {
	const displayName = ctx.modelRegistry.getProviderDisplayName(provider);
	return displayName === provider ? provider : `${displayName} (${provider})`;
}

function modelLabel(model: Pick<Model<any>, "id" | "name">): string {
	return model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id;
}

function selectionFromModel(model: Pick<Model<any>, "provider" | "id" | "name">): RecentCombination {
	return {
		provider: model.provider,
		modelId: model.id,
		modelName: model.name,
	};
}

async function continueWithDefault(
	ctx: PickerContext,
	reason: string,
	notice?: string,
): Promise<StartupPickerAction> {
	if (notice) {
		ctx.ui.notify(notice, "warning");
	}

	return { action: "fallback", reason };
}

async function chooseFromRecents(
	ctx: PickerContext,
	recents: RecentCombination[],
	availableByKey: Map<string, Model<any>>,
): Promise<Model<any> | "browse" | undefined> {
	const options = recents.map((recent) => {
		const model = availableByKey.get(recentKey(recent));
		if (!model) return `${recent.provider}/${recent.modelId}`;
		return `Recent: ${providerLabel(ctx, model.provider)} -> ${modelLabel(model)}`;
	});
	const browseLabel = "Browse all providers";
	const choice = await ctx.ui.select("Choose a startup model", [...options, browseLabel]);

	if (choice === undefined) return undefined;
	if (choice === browseLabel) return "browse";

	const index = options.indexOf(choice);
	if (index === -1) return undefined;

	return availableByKey.get(recentKey(recents[index]));
}

async function chooseByProvider(ctx: PickerContext, models: Model<any>[]): Promise<Model<any> | undefined> {
	const providerGroups = new Map<string, Model<any>[]>();

	for (const model of models) {
		const list = providerGroups.get(model.provider) ?? [];
		list.push(model);
		providerGroups.set(model.provider, list);
	}

	const providers = [...providerGroups.keys()].sort();
	const providerOptions = providers.map((provider) => providerLabel(ctx, provider));
	const selectedProviderLabel = await ctx.ui.select("Choose a provider", providerOptions);

	if (selectedProviderLabel === undefined) return undefined;

	const providerIndex = providerOptions.indexOf(selectedProviderLabel);
	if (providerIndex === -1) return undefined;

	const selectedProvider = providers[providerIndex];
	const providerModels = [...(providerGroups.get(selectedProvider) ?? [])].sort((a: Model<any>, b: Model<any>) => {
		return modelLabel(a).localeCompare(modelLabel(b));
	});
	const modelOptions = providerModels.map(modelLabel);
	const selectedModelLabel = await ctx.ui.select("Choose a model", modelOptions);

	if (selectedModelLabel === undefined) return undefined;

	const modelIndex = modelOptions.indexOf(selectedModelLabel);
	if (modelIndex === -1) return undefined;

	return providerModels[modelIndex];
}

async function chooseWithLegacySelect(
	ctx: PickerContext,
	models: Model<any>[],
	recents: RecentCombination[],
): Promise<Model<any> | undefined> {
	const availableByKey = new Map(models.map((model) => [modelKey(model), model]));

	if (recents.length > 0) {
		const recentChoice = await chooseFromRecents(ctx, recents, availableByKey);
		if (recentChoice === undefined) return undefined;
		if (recentChoice === "browse") return chooseByProvider(ctx, models);
		return recentChoice;
	}

	return chooseByProvider(ctx, models);
}

async function chooseWithSearchablePicker(
	ctx: PickerContext,
	models: Model<any>[],
	recents: RecentCombination[],
): Promise<Model<any> | undefined> {
	const selected = await openSearchableModelPicker(ctx.ui, {
		models,
		recents,
		currentModel: ctx.model,
		providerLabel: (provider) => providerLabel(ctx, provider),
		modelLabel,
	});

	if (selected) return selected;

	// Fall back when custom UI is unavailable (e.g. non-TUI / test harness without custom).
	if (typeof ctx.ui.custom !== "function") {
		return chooseWithLegacySelect(ctx, models, recents);
	}

	return undefined;
}

export async function runStartupPicker(
	pi: Pick<ExtensionAPI, "setModel">,
	event: SessionStartEvent,
	ctx: PickerContext,
	options: StartupPickerOptions = {},
): Promise<StartupPickerAction> {
	if (event.reason !== "startup") {
		return { action: "skipped", reason: `reason:${event.reason}` };
	}

	if (!ctx.hasUI) {
		return { action: "skipped", reason: "no-ui" };
	}

	const storePath = options.storePath ?? getRecentStorePath();
	const loadRecents = options.loadRecents ?? loadRecentCombinations;
	const saveRecent = options.saveRecent ?? saveRecentCombination;
	const availableModels = ctx.modelRegistry.getAvailable();

	if (availableModels.length === 0) {
		return continueWithDefault(
			ctx,
			"no-available-models",
			"No configured models are available for the startup picker. Continuing with your default model.",
		);
	}

	const availableByKey = new Map(availableModels.map((model) => [modelKey(model), model]));
	const recents = (await loadRecents(storePath)).filter((recent) => availableByKey.has(recentKey(recent)));
	const pickModel = options.pickModel ?? chooseWithSearchablePicker;
	const selectedModel = await pickModel(ctx, availableModels, recents);

	if (!selectedModel) {
		return continueWithDefault(ctx, "cancelled-provider-model");
	}

	const selection = selectionFromModel(selectedModel);

	if (sameModel(ctx.model, selectedModel)) {
		await saveRecent(selection, storePath);
		return { action: "selected", reason: "already-current-model", selection };
	}

	const changed = await pi.setModel(selectedModel);
	if (!changed) {
		return continueWithDefault(
			ctx,
			"set-model-failed",
			`Could not switch to ${providerLabel(ctx, selectedModel.provider)} -> ${modelLabel(selectedModel)}. Continuing with your default model.`,
		);
	}

	await saveRecent(selection, storePath);

	return { action: "selected", reason: "model-selected", selection };
}
