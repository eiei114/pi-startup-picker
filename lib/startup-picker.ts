import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { modelKey, recentKey } from "./model-identity.ts";
import {
	getRecentStorePath,
	loadRecentCombinations,
	saveRecentCombination,
	type RecentCombination,
} from "./recent-store.ts";
import { openSearchableModelPicker } from "./searchable-model-picker.ts";
import { getSettingsStorePath, loadPickerSettings, type PickerSettings } from "./settings-store.ts";

type StartupPickerAction =
	| { action: "skipped"; reason: string }
	| { action: "fallback"; reason: string }
	| { action: "kept-current"; reason: string }
	| { action: "selected"; reason: string; selection: RecentCombination };

type PickerContext = Pick<ExtensionContext, "hasUI" | "mode" | "modelRegistry" | "ui" | "model">;

interface StartupPickerOptions {
	storePath?: string;
	loadRecents?: (path: string) => Promise<RecentCombination[]>;
	saveRecent?: (selection: RecentCombination, path: string) => Promise<RecentCombination[]>;
	settingsPath?: string;
	loadSettings?: (path: string) => Promise<PickerSettings>;
	pickModel?: (
		ctx: PickerContext,
		models: Model<any>[],
		recents: RecentCombination[],
	) => Promise<Model<any> | undefined>;
}

function notifySafely(ctx: PickerContext, message: string, type: "info" | "warning" | "error"): void {
	try {
		ctx.ui.notify(message, type);
	} catch {
		// A session replacement can invalidate the captured ctx. The model switch this
		// notice describes already happened, so the notice stays best-effort.
	}
}

/**
 * The recent store is written after the model is already active, so a failure there
 * must not surface as a "could not offer the picker / continuing with your current
 * model" error. It gets its own notice and leaves the selection in place.
 */
async function saveRecentAfterActivation(
	ctx: PickerContext,
	selectedModel: Pick<Model<any>, "provider" | "id" | "name">,
	selection: RecentCombination,
	saveRecent: (selection: RecentCombination, path: string) => Promise<RecentCombination[]>,
	storePath: string,
): Promise<boolean> {
	try {
		await saveRecent(selection, storePath);
		return true;
	} catch (error) {
		// Labels come from the selected model and selection only: the captured ctx may
		// already be stale, and a modelRegistry access would throw here again.
		notifySafely(
			ctx,
			`Selected ${selectedModel.provider} -> ${modelLabel(selectedModel)} is active but its recent entry was not saved: ${String(error)}.`,
			"warning",
		);
		return false;
	}
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

function currentModelLabel(ctx: PickerContext): string {
	if (!ctx.model) return "your current model";
	return `${providerLabel(ctx, ctx.model.provider)} -> ${modelLabel(ctx.model)}`;
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
	// The searchable component needs a real terminal. RPC clients support select
	// dialogs, so use those instead of calling the no-op ui.custom implementation.
	if (ctx.mode !== "tui") {
		return chooseWithLegacySelect(ctx, models, recents);
	}

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

/**
 * `/new` keeps the model that was current when the picker opened. Every non-selection
 * outcome returns to that baseline instead of the startup default fallback.
 */
function keepCurrentForNew(ctx: PickerContext, reason: string, notice?: string): StartupPickerAction {
	if (notice) {
		ctx.ui.notify(notice, "warning");
	}

	return { action: "kept-current", reason };
}

export async function runStartupPicker(
	pi: Pick<ExtensionAPI, "setModel">,
	event: SessionStartEvent,
	ctx: PickerContext,
	options: StartupPickerOptions = {},
): Promise<StartupPickerAction> {
	if (event.reason === "resume" || event.reason === "fork" || event.reason === "reload") {
		return { action: "skipped", reason: `reason:${event.reason}` };
	}

	const isNewSession = event.reason === "new";

	if (isNewSession) {
		const settingsPath = options.settingsPath ?? getSettingsStorePath();
		const loadSettings = options.loadSettings ?? loadPickerSettings;
		const settings = await loadSettings(settingsPath);

		if (!settings.showOnNewSession) {
			return { action: "skipped", reason: "new-session-disabled" };
		}
	}

	if (!ctx.hasUI) {
		return { action: "skipped", reason: "no-ui" };
	}

	const storePath = options.storePath ?? getRecentStorePath();
	const loadRecents = options.loadRecents ?? loadRecentCombinations;
	const saveRecent = options.saveRecent ?? saveRecentCombination;
	const availableModels = ctx.modelRegistry.getAvailable();

	if (availableModels.length === 0) {
		if (isNewSession) {
			return keepCurrentForNew(
				ctx,
				"no-available-models",
				`No configured models are available for the /new picker. Continuing /new with ${currentModelLabel(ctx)}.`,
			);
		}

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
		if (isNewSession) {
			return keepCurrentForNew(ctx, "cancelled-provider-model");
		}

		return continueWithDefault(ctx, "cancelled-provider-model");
	}

	const selection = selectionFromModel(selectedModel);

	if (sameModel(ctx.model, selectedModel)) {
		// The model is unchanged, so the recent store is only touched when a
		// selection actually switched the model.
		if (isNewSession) {
			return { action: "kept-current", reason: "already-current-model" };
		}

		await saveRecentAfterActivation(ctx, selectedModel, selection, saveRecent, storePath);
		return { action: "selected", reason: "already-current-model", selection };
	}

	let changed = false;
	try {
		changed = await pi.setModel(selectedModel);
	} catch {
		changed = false;
	}

	if (!changed) {
		if (isNewSession) {
			return keepCurrentForNew(
				ctx,
				"set-model-failed",
				`Could not switch to ${providerLabel(ctx, selectedModel.provider)} -> ${modelLabel(selectedModel)}. Continuing /new with ${currentModelLabel(ctx)}.`,
			);
		}

		return continueWithDefault(
			ctx,
			"set-model-failed",
			`Could not switch to ${providerLabel(ctx, selectedModel.provider)} -> ${modelLabel(selectedModel)}. Continuing with your default model.`,
		);
	}

	const recentSaved = await saveRecentAfterActivation(ctx, selectedModel, selection, saveRecent, storePath);

	return {
		action: "selected",
		reason: recentSaved ? "model-selected" : "model-selected-recent-save-failed",
		selection,
	};
}
