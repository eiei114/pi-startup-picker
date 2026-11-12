import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface PickerSettings {
	showOnNewSession: boolean;
}

export const DEFAULT_SETTINGS: PickerSettings = { showOnNewSession: false };

export function getSettingsStorePath(): string {
	return join(getAgentDir(), "pi-startup-picker-settings.json");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Missing, malformed and non-boolean values all mean "off". The settings file is
 * user-owned, so unknown keys are tolerated but never interpreted.
 */
export function normalizePickerSettings(input: unknown): PickerSettings {
	if (!isPlainObject(input)) return { ...DEFAULT_SETTINGS };

	return {
		showOnNewSession: typeof input.showOnNewSession === "boolean" ? input.showOnNewSession : false,
	};
}

/**
 * Reads the user-global settings file. A missing, unreadable or malformed file
 * means "off" and never throws, and reading never writes to the user's file.
 */
export async function loadPickerSettings(path = getSettingsStorePath()): Promise<PickerSettings> {
	try {
		const raw = await readFile(path, "utf8");
		return normalizePickerSettings(JSON.parse(raw));
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

async function readRawSettingsObject(path: string): Promise<Record<string, unknown>> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8"));
		return isPlainObject(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * Writes the settings file atomically (temp file + rename in the same directory).
 * Other keys already present in the file are preserved, and a write failure
 * rejects instead of reporting success.
 */
export async function savePickerSettings(
	settings: PickerSettings,
	path = getSettingsStorePath(),
): Promise<PickerSettings> {
	const normalized = normalizePickerSettings(settings);
	const next = { ...(await readRawSettingsObject(path)), ...normalized };

	const content = `${JSON.stringify(next, null, 2)}\n`;
	const dir = dirname(path);
	await mkdir(dir, { recursive: true });

	const tempPath = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
	try {
		await writeFile(tempPath, content, "utf8");
		await rename(tempPath, path);
	} catch (error) {
		await unlink(tempPath).catch(() => {});
		throw error;
	}

	return normalized;
}

export async function saveShowOnNewSession(
	showOnNewSession: boolean,
	path = getSettingsStorePath(),
): Promise<PickerSettings> {
	return savePickerSettings({ showOnNewSession }, path);
}
