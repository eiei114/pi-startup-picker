import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
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

export function buildAboutMessage(showOnNewSession: boolean): string {
	return `Pi Startup Picker is loaded. On normal startup it will offer a searchable provider/model picker before the session begins. Ask on /new (opt-in, default off): ${stateLabel(showOnNewSession)}.`;
}

export interface AboutCommandOptions {
	settingsPath?: string;
	loadSettings?: (path: string) => Promise<PickerSettings>;
}

export async function runAboutCommand(
	ui: Pick<ExtensionUIContext, "notify">,
	options: AboutCommandOptions = {},
): Promise<PickerSettings> {
	const settingsPath = options.settingsPath ?? getSettingsStorePath();
	const loadSettings = options.loadSettings ?? loadPickerSettings;
	const settings = await loadSettings(settingsPath);
	ui.notify(buildAboutMessage(settings.showOnNewSession), "info");
	return settings;
}
