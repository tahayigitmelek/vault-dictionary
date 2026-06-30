import { App, PluginSettingTab, Setting, setIcon, Notice } from "obsidian";
import DictionaryPlugin from "./main";

export interface DictionaryEntry {
	words: string[];
	description: string;
}

export interface DictionaryPluginSettings {
	dictionary: DictionaryEntry[];
}

export const DEFAULT_SETTINGS: DictionaryPluginSettings = {
	dictionary: []
}

export function parseDictionaryWords(value: string): string[] {
	return value
		.split(/[,\n]/)
		.map(word => word.trim())
		.filter(word => word.length > 0);
}

export class DictionarySettingTab extends PluginSettingTab {
	plugin: DictionaryPlugin;
	searchQuery: string = "";
	listContainer: HTMLDivElement;

	constructor(app: App, plugin: DictionaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass('dict-settings-root');

		this.plugin.settings.dictionary.sort((a, b) => (a.words[0] || '').localeCompare(b.words[0] || ''));

		this.renderHeader(containerEl);
		this.renderAddForm(containerEl);
		this.renderEntryBrowser(containerEl);
	}

	renderHeader(containerEl: HTMLElement) {
		const header = containerEl.createDiv({ cls: 'dict-settings-header' });
		const titleGroup = header.createDiv({ cls: 'dict-settings-title-group' });
		new Setting(titleGroup)
			.setName('Dictionary')
			.setDesc('Manage highlighted terms and definitions.')
			.setHeading();

		const stats = header.createDiv({ cls: 'dict-settings-stats' });
		const entryCount = stats.createDiv({ cls: 'dict-stat-card' });
		entryCount.createSpan({ text: String(this.plugin.settings.dictionary.length), cls: 'dict-stat-value' });
		entryCount.createSpan({ text: 'entries', cls: 'dict-stat-label' });

		const infoBar = containerEl.createDiv({ cls: 'dict-settings-info-bar' });
		infoBar.createSpan({ text: `Dictionary path: ` });
		infoBar.createEl('code', { text: `${this.plugin.app.vault.configDir}/vault-dictionary.json` });
	}

	renderAddForm(containerEl: HTMLElement) {
		let newWord = '';
		let newDesc = '';

		const addEntry = async () => {
			const words = parseDictionaryWords(newWord);
			const description = newDesc.trim();

			if (words.length === 0 || !description) {
				new Notice("Words and description cannot be empty.");
				return;
			}

			this.plugin.settings.dictionary.unshift({
				words,
				description
			});
			await this.plugin.saveDictionaryData();
			this.plugin.updateDictionaryMatch();
			new Notice(`Added dictionary entry for ${words[0]}`);
			this.display();
		};

		const formContainer = containerEl.createDiv({ cls: 'dict-add-card' });
		const formHeader = formContainer.createDiv({ cls: 'dict-section-header' });
		new Setting(formHeader)
			.setName('Quick add')
			.setHeading();
		formHeader.createEl('span', { text: 'New entry', cls: 'dict-section-kicker' });

		const fields = formContainer.createDiv({ cls: 'dict-add-fields' });

		const wordsField = fields.createDiv({ cls: 'dict-field dict-field-words' });
		wordsField.createEl('label', { text: 'Words / aliases' });
		const wordInput = wordsField.createEl('textarea', { cls: 'dict-input dict-alias-input' });
		wordInput.placeholder = 'Spring, spring boot';
		wordInput.oninput = (event: Event) => {
			newWord = (event.target as HTMLTextAreaElement).value;
		};

		const descField = fields.createDiv({ cls: 'dict-field dict-field-desc' });
		descField.createEl('label', { text: 'Definition' });
		const descInput = descField.createEl('textarea', { cls: 'dict-input dict-definition-input' });
		descInput.placeholder = 'Meaning of the word...';
		descInput.oninput = (event: Event) => {
			newDesc = (event.target as HTMLTextAreaElement).value;
		};

		[wordInput, descInput].forEach(input => {
			input.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					void addEntry();
				}
			});
		});

		const actions = formContainer.createDiv({ cls: 'dict-add-actions' });
		const addButton = actions.createEl('button', { cls: 'mod-cta dict-add-button' });
		setIcon(addButton, 'plus');
		addButton.appendText(' Add entry');
		addButton.onclick = () => {
			void addEntry();
		};
	}

	renderEntryBrowser(containerEl: HTMLElement) {
		const browser = containerEl.createDiv({ cls: 'dict-browser' });
		const browserHeader = browser.createDiv({ cls: 'dict-browser-header' });
		const titleGroup = browserHeader.createDiv({ cls: 'dict-section-header' });
		new Setting(titleGroup)
			.setName('Dictionary entries')
			.setHeading();
		titleGroup.createEl('span', { text: `${this.plugin.settings.dictionary.length} total`, cls: 'dict-section-kicker' });

		const searchContainer = browserHeader.createDiv({ cls: 'dict-search-container' });
		setIcon(searchContainer.createSpan({ cls: 'dict-search-icon' }), 'search');
		const searchInput = searchContainer.createEl('input', { cls: 'dict-search-input' });
		searchInput.type = 'text';
		searchInput.placeholder = 'Search entries...';
		searchInput.value = this.searchQuery;
		searchInput.oninput = (e: Event) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.renderEntries();
		};

		this.listContainer = browser.createDiv({ cls: 'dict-entry-list' });
		this.renderEntries();
	}

	renderEntries() {
		this.listContainer.empty();

		const filteredDictionary = this.plugin.settings.dictionary.filter(entry => {
			if (!this.searchQuery.trim()) return true;
			const q = this.searchQuery.toLowerCase();
			return entry.words.join(', ').toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
		});

		filteredDictionary.forEach((entry) => {
			const row = this.listContainer.createDiv({ cls: 'dict-entry-card' });

			const wordsField = row.createDiv({ cls: 'dict-entry-field dict-entry-words' });
			wordsField.createEl('label', { text: 'Words' });
			const inputWords = wordsField.createEl('textarea', { cls: 'dict-input dict-entry-word-input' });
			inputWords.placeholder = 'Spring, spring boot';
			inputWords.value = entry.words.join(', ');
			inputWords.onchange = async (e: Event) => {
				const words = parseDictionaryWords((e.target as HTMLTextAreaElement).value);
				if (words.length === 0) {
					new Notice("Entry needs at least one word.");
					inputWords.value = entry.words.join(', ');
					return;
				}
				entry.words = words;
				await this.plugin.saveDictionaryData();
				this.plugin.updateDictionaryMatch();
			};

			const descField = row.createDiv({ cls: 'dict-entry-field dict-entry-desc' });
			descField.createEl('label', { text: 'Definition' });
			const inputDesc = descField.createEl('textarea', { cls: 'dict-input dict-entry-desc-input' });
			inputDesc.placeholder = 'Meaning of the word...';
			inputDesc.value = entry.description;
			inputDesc.onchange = async (e: Event) => {
				entry.description = (e.target as HTMLTextAreaElement).value.trim();
				await this.plugin.saveDictionaryData();
				this.plugin.updateDictionaryMatch();
			};

			const actions = row.createDiv({ cls: 'dict-entry-actions' });
			const delButton = actions.createEl('button', { cls: 'dict-delete-button mod-warning' });
			setIcon(delButton, 'trash');
			delButton.setAttribute('aria-label', 'Delete entry');
			delButton.setAttribute('title', 'Delete entry');
			delButton.onclick = async () => {
				const actualIndex = this.plugin.settings.dictionary.indexOf(entry);
				if (actualIndex > -1) {
					this.plugin.settings.dictionary.splice(actualIndex, 1);
					await this.plugin.saveDictionaryData();
					this.plugin.updateDictionaryMatch();
					this.renderEntries();
				}
			};
		});

		if (filteredDictionary.length === 0) {
			const textResult = this.plugin.settings.dictionary.length === 0 ? "Your dictionary is empty." : "No matching entries found.";
			this.listContainer.createDiv({ text: textResult, cls: 'dict-empty-state' });
		}
	}
}
