import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
	Container,
	type Focusable,
	getKeybindings,
	Input,
	Spacer,
	Text,
	type TUI,
} from "@earendil-works/pi-tui";
import {
	buildSearchableItems,
	filterSearchableItems,
	type SearchableModelItem,
} from "./model-search.ts";
import type { RecentCombination } from "./recent-store.ts";

type PickerUI = Pick<ExtensionUIContext, "custom">;

export interface SearchableModelPickerArgs {
	models: Model<any>[];
	recents?: RecentCombination[];
	currentModel?: Pick<Model<any>, "provider" | "id">;
	providerLabel: (provider: string) => string;
	modelLabel: (model: Pick<Model<any>, "id" | "name">) => string;
}

function sameModel(
	a: Pick<Model<any>, "provider" | "id"> | undefined,
	b: Pick<Model<any>, "provider" | "id">,
): boolean {
	return a !== undefined && a.provider === b.provider && a.id === b.id;
}

class SearchableModelPickerComponent extends Container implements Focusable {
	private searchInput: Input;
	private listContainer: Container;
	private items: SearchableModelItem[];
	private filteredItems: SearchableModelItem[] = [];
	private selectedIndex = 0;
	private tui: TUI;
	private theme: Theme;
	private currentModel?: Pick<Model<any>, "provider" | "id">;
	private providerLabel: (provider: string) => string;
	private modelLabel: (model: Pick<Model<any>, "id" | "name">) => string;
	private onSelectCallback: (model: Model<any>) => void;
	private onCancelCallback: () => void;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		tui: TUI,
		theme: Theme,
		args: SearchableModelPickerArgs,
		onSelect: (model: Model<any>) => void,
		onCancel: () => void,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.currentModel = args.currentModel;
		this.providerLabel = args.providerLabel;
		this.modelLabel = args.modelLabel;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;
		this.items = buildSearchableItems(args.models, args.recents ?? []);
		this.filteredItems = this.items;

		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold("Choose a startup model")), 0, 0));
		this.addChild(new Text(theme.fg("dim", "Type to filter by provider or model id"), 0, 0));
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		this.searchInput.onSubmit = () => {
			const selected = this.filteredItems[this.selectedIndex];
			if (selected) this.onSelectCallback(selected.model);
		};
		this.searchInput.onEscape = () => this.onCancelCallback();
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "↑↓ navigate • type to filter • enter select • esc cancel"), 0, 0));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		this.updateList();
	}

	private filterModels(query: string): void {
		this.filteredItems = filterSearchableItems(this.items, query);
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredItems.length - 1));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		const maxVisible = 10;
		const total = this.filteredItems.length;

		if (total === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching models"), 0, 0));
			return;
		}

		const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), total - maxVisible));
		const endIndex = Math.min(startIndex + maxVisible, total);

		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i];
			if (!item) continue;

			const isSelected = i === this.selectedIndex;
			const isCurrent = sameModel(this.currentModel, item.model);
			const recentBadge = item.isRecent ? this.theme.fg("success", " recent") : "";
			const currentBadge = isCurrent ? this.theme.fg("success", " ✓") : "";
			const providerBadge = this.theme.fg("muted", `[${this.providerLabel(item.model.provider)}]`);
			const modelText = this.modelLabel(item.model);

			if (isSelected) {
				const prefix = this.theme.fg("accent", "→ ");
				this.listContainer.addChild(
					new Text(`${prefix}${this.theme.fg("accent", modelText)} ${providerBadge}${recentBadge}${currentBadge}`, 0, 0),
				);
			} else {
				this.listContainer.addChild(new Text(`  ${modelText} ${providerBadge}${recentBadge}${currentBadge}`, 0, 0));
			}
		}

		if (startIndex > 0 || endIndex < total) {
			this.listContainer.addChild(
				new Text(this.theme.fg("muted", `  (${this.selectedIndex + 1}/${total})`), 0, 0),
			);
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();

		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredItems.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
			this.updateList();
			this.tui.requestRender();
			return;
		}

		if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredItems.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
			this.tui.requestRender();
			return;
		}

		if (kb.matches(keyData, "tui.select.confirm")) {
			const selected = this.filteredItems[this.selectedIndex];
			if (selected) this.onSelectCallback(selected.model);
			return;
		}

		if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
			return;
		}

		this.searchInput.handleInput(keyData);
		this.filterModels(this.searchInput.getValue());
		this.tui.requestRender();
	}
}

export async function openSearchableModelPicker(
	ui: PickerUI,
	args: SearchableModelPickerArgs,
): Promise<Model<any> | undefined> {
	if (typeof ui.custom !== "function") {
		return undefined;
	}

	const result = await ui.custom<Model<any> | undefined>((tui, theme, _keybindings, done) => {
		return new SearchableModelPickerComponent(
			tui,
			theme,
			args,
			(model) => done(model),
			() => done(undefined),
		);
	});

	return result;
}
