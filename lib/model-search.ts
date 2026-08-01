import type { Model } from "@earendil-works/pi-ai";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import type { RecentCombination } from "./recent-store.ts";

export interface SearchableModelItem {
	model: Model<any>;
	isRecent: boolean;
	searchText: string;
}

function modelKey(model: Pick<Model<any>, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

function recentKey(recent: Pick<RecentCombination, "provider" | "modelId">): string {
	return `${recent.provider}/${recent.modelId}`;
}

export function buildSearchText(model: Pick<Model<any>, "provider" | "id" | "name">): string {
	const name = model.name ?? "";
	return [model.id, model.provider, `${model.provider}/${model.id}`, name, model.provider, model.id]
		.filter(Boolean)
		.join(" ");
}

export function buildSearchableItems(
	models: Model<any>[],
	recents: RecentCombination[] = [],
): SearchableModelItem[] {
	const availableByKey = new Map(models.map((model) => [modelKey(model), model]));
	const recentKeys = new Set<string>();
	const items: SearchableModelItem[] = [];

	for (const recent of recents) {
		const key = recentKey(recent);
		const model = availableByKey.get(key);
		if (!model || recentKeys.has(key)) continue;
		recentKeys.add(key);
		items.push({
			model,
			isRecent: true,
			searchText: buildSearchText(model),
		});
	}

	const remaining = [...models]
		.filter((model) => !recentKeys.has(modelKey(model)))
		.sort((a, b) => {
			const providerCmp = a.provider.localeCompare(b.provider);
			if (providerCmp !== 0) return providerCmp;
			return a.id.localeCompare(b.id);
		});

	for (const model of remaining) {
		items.push({
			model,
			isRecent: false,
			searchText: buildSearchText(model),
		});
	}

	return items;
}

export function filterSearchableItems(items: SearchableModelItem[], query: string): SearchableModelItem[] {
	const trimmed = query.trim();
	if (!trimmed) return items;

	return fuzzyFilter(items, trimmed, (item) => item.searchText);
}
