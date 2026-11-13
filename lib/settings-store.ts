import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** New settings files get owner-only permissions; existing ones keep their mode. */
export const SETTINGS_FILE_MODE = 0o600;

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

async function existingMode(path: string): Promise<number | undefined> {
	try {
		return (await stat(path)).mode & 0o777;
	} catch {
		return undefined;
	}
}

/**
 * The temp file is written with the mode the final file must have. Otherwise the
 * rename would replace a user-owned 0600 file with Node's default creation mode.
 */
async function writeTempWithMode(tempPath: string, content: string, mode: number): Promise<void> {
	await writeFile(tempPath, content, { encoding: "utf8", mode });
	// An existing temp file keeps its old mode, and a filesystem or platform that
	// ignores the creation mode would otherwise widen the file.
	await chmod(tempPath, mode).catch(() => {});
}

/**
 * Writes the settings file atomically (temp file + rename in the same directory).
 * Other keys already present in the file are preserved, the existing file mode is
 * kept (a new file is created owner-only), and a write failure rejects instead of
 * reporting success.
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
	const targetMode = (await existingMode(path)) ?? SETTINGS_FILE_MODE;
	try {
		await writeTempWithMode(tempPath, content, targetMode);
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
