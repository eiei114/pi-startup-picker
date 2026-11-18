import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface RecentCombination {
	provider: string;
	modelId: string;
	modelName?: string;
}

export type RecentStoreReadResult =
	| { status: "loaded"; recents: RecentCombination[] }
	| { status: "missing"; recents: RecentCombination[] }
	| { status: "unreadable"; recents: RecentCombination[] };

export const RECENT_LIMIT = 3;

export function getRecentStorePath(): string {
	return join(getAgentDir(), "pi-startup-picker-recents.json");
}

export function normalizeRecentCombinations(input: unknown): RecentCombination[] {
	if (!Array.isArray(input)) return [];

	return input
		.filter((item): item is RecentCombination => {
			return (
				item !== null &&
				typeof item === "object" &&
				typeof item.provider === "string" &&
				typeof item.modelId === "string" &&
				(item.modelName === undefined || typeof item.modelName === "string")
			);
		})
		.map((item) => ({
			provider: item.provider,
			modelId: item.modelId,
			modelName: item.modelName,
		}));
}

export function mergeRecentCombinations(
	recents: RecentCombination[],
	selection: RecentCombination,
	limit = RECENT_LIMIT,
): RecentCombination[] {
	const deduped = recents.filter(
		(item) => !(item.provider === selection.provider && item.modelId === selection.modelId),
	);

	return [selection, ...deduped].slice(0, limit);
}

export async function readRecentCombinations(path = getRecentStorePath()): Promise<RecentStoreReadResult> {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		const missing =
			error !== null &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT";
		return { status: missing ? "missing" : "unreadable", recents: [] };
	}

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return { status: "unreadable", recents: [] };
		return { status: "loaded", recents: normalizeRecentCombinations(parsed) };
	} catch {
		return { status: "unreadable", recents: [] };
	}
}

export async function loadRecentCombinations(path = getRecentStorePath()): Promise<RecentCombination[]> {
	return (await readRecentCombinations(path)).recents;
}

export async function saveRecentCombination(
	selection: RecentCombination,
	path = getRecentStorePath(),
	limit = RECENT_LIMIT,
): Promise<RecentCombination[]> {
	const next = mergeRecentCombinations(await loadRecentCombinations(path), selection, limit);

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

	return next;
}
