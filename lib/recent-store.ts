import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface RecentCombination {
	provider: string;
	modelId: string;
	modelName?: string;
}

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

export async function loadRecentCombinations(path = getRecentStorePath()): Promise<RecentCombination[]> {
	try {
		const raw = await readFile(path, "utf8");
		return normalizeRecentCombinations(JSON.parse(raw));
	} catch {
		return [];
	}
}

export async function saveRecentCombination(
	selection: RecentCombination,
	path = getRecentStorePath(),
	limit = RECENT_LIMIT,
): Promise<RecentCombination[]> {
	const next = mergeRecentCombinations(await loadRecentCombinations(path), selection, limit);

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");

	return next;
}
