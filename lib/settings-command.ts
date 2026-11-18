import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
	getRecentStorePath,
	readRecentCombinations,
	type RecentStoreReadResult,
} from "./recent-store.ts";
import {
	getSettingsStorePath,
	loadPickerSettings,
	saveShowOnNewSession,
	type PickerSettings,
} from "./settings-store.ts";

type SettingsCommandUI = Pick<ExtensionUIContext, "select" | "notify">;

type SettingsCommandAction =
	| { action: "unchanged"; reason: string; showOnNewSession: boolean }
	| { action: "saved"; reason: string; showOnNewSession: boolean }
	| { action: "write-failed"; reason: string; showOnNewSession: boolean; error: string };

export interface SettingsCommandOptions {
	settingsPath?: string;
	loadSettings?: (path: string) => Promise<PickerSettings>;
	saveShowOnNewSession?: (showOnNewSession: boolean, path: string) => Promise<PickerSettings>;
}

export const SETTINGS_DIALOG_TITLE = "Pi Startup Picker settings";

function stateLabel(showOnNewSession: boolean): string {
	return showOnNewSession ? "on" : "off";
}

function optionLabel(enabled: boolean, current: boolean): string {
	return `Ask on /new: ${enabled ? "on" : "off"}${enabled === current ? " (current)" : ""}`;
}

export function settingsOptions(current: boolean): string[] {
	return [optionLabel(true, current), optionLabel(false, current)];
}

/**
 * Argument-free toggle for the opt-in `/new` model picker.
 *
 * Cancel keeps the current value without writing anything, and a failed write is
 * reported as an error instead of being shown as saved.
 */
export async function runSettingsCommand(
	ui: SettingsCommandUI,
	options: SettingsCommandOptions = {},
): Promise<SettingsCommandAction> {
	const settingsPath = options.settingsPath ?? getSettingsStorePath();
	const loadSettings = options.loadSettings ?? loadPickerSettings;
	const saveShow = options.saveShowOnNewSession ?? saveShowOnNewSession;

	const before = await loadSettings(settingsPath);
	const current = before.showOnNewSession;
	const choice = await ui.select(SETTINGS_DIALOG_TITLE, settingsOptions(current));

	const keepMessage = `Ask on /new stays ${stateLabel(current)}.`;

	if (choice === undefined) {
		ui.notify(keepMessage, "info");
		return { action: "unchanged", reason: "cancelled", showOnNewSession: current };
	}

	const selected = choice === optionLabel(true, current) ? true : choice === optionLabel(false, current) ? false : undefined;

	if (selected === undefined) {
		ui.notify(keepMessage, "info");
		return { action: "unchanged", reason: "unknown-choice", showOnNewSession: current };
	}

	if (selected === current) {
		ui.notify(`Ask on /new is already ${stateLabel(current)}.`, "info");
		return { action: "unchanged", reason: "already-set", showOnNewSession: current };
	}

	try {
		await saveShow(selected, settingsPath);
	} catch (error) {
		ui.notify(
			`Could not save the Pi Startup Picker settings: ${String(error)}. ${keepMessage}`,
			"error",
		);
		return { action: "write-failed", reason: "settings-write-failed", showOnNewSession: current, error: String(error) };
	}

	ui.notify(
		selected
			? "Ask on /new is now on. The model picker will appear when you start /new."
			: "Ask on /new is now off. /new keeps your current model.",
		"info",
	);
	return { action: "saved", reason: selected ? "enabled" : "disabled", showOnNewSession: selected };
}

export interface AboutCommandOptions {
	settingsPath?: string;
	loadSettings?: (path: string) => Promise<PickerSettings>;
	recentStorePath?: string;
	loadRecentStore?: (path: string) => Promise<RecentStoreReadResult>;
}

export function buildAboutMessage(
	showOnNewSession: boolean,
	recentStorePath = getRecentStorePath(),
	recentStore: RecentStoreReadResult = { status: "loaded", recents: [] },
): string {
	const recentCount =
		recentStore.status === "unreadable"
			? "unavailable (store could not be read)"
			: `${recentStore.recents.length}${recentStore.status === "missing" ? " (store does not exist yet)" : ""}`;
	return `Pi Startup Picker is loaded. Startup flow: the searchable provider/model picker runs on normal startup, before the session begins (startup-only). Ask on /new (separate opt-in, default off): ${stateLabel(showOnNewSession)}. Recent store path: ${recentStorePath}. Recent entries: ${recentCount}.`;
}

export async function runAboutCommand(
	ui: Pick<ExtensionUIContext, "notify">,
	options: AboutCommandOptions = {},
): Promise<PickerSettings> {
	const settingsPath = options.settingsPath ?? getSettingsStorePath();
	const loadSettings = options.loadSettings ?? loadPickerSettings;
	const recentStorePath = options.recentStorePath ?? getRecentStorePath();
	const loadRecentStore = options.loadRecentStore ?? readRecentCombinations;
	const settings = await loadSettings(settingsPath);
	const recentStore = await loadRecentStore(recentStorePath).catch(
		(): RecentStoreReadResult => ({ status: "unreadable", recents: [] }),
	);
	ui.notify(buildAboutMessage(settings.showOnNewSession, recentStorePath, recentStore), "info");
	return settings;
}
