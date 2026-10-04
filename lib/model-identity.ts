export interface ModelIdentity {
	provider: string;
	id: string;
}

export interface RecentModelIdentity {
	provider: string;
	modelId: string;
}

export function modelKey(model: ModelIdentity): string {
	return `${model.provider}/${model.id}`;
}

export function recentKey(recent: RecentModelIdentity): string {
	return `${recent.provider}/${recent.modelId}`;
}
