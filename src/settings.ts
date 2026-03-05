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

export class DictionarySettingTab extends PluginSettingTab {
	plugin: DictionaryPlugin;
	searchQuery: string = "";
	tableContainer: HTMLDivElement;

	constructor(app: App, plugin: DictionaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const infoBar = containerEl.createDiv({ cls: 'dict-settings-info-bar' });

		infoBar.createEl('span', { text: `Dictionary Path :  ` });
		infoBar.createEl('code', { text: `${this.plugin.app.vault.configDir}/vault-dictionary.json` });

		new Setting(containerEl).setName("Add New Entry").setHeading();

		let newWord = '';
		let newDesc = '';

		const formContainer = containerEl.createDiv({ cls: 'dict-add-form-container' });

		new Setting(formContainer)
			.setName('Word(s)')
			.setDesc('Comma separated list of aliases')
			.addText(text => text
				.setPlaceholder('spring, spring boot')
				.onChange(value => newWord = value)
			);

		new Setting(formContainer)
			.setName('Description')
			.setDesc('Description of the word')
			.addTextArea(text => {
				text.setPlaceholder('Meaning of the word...');
				text.inputEl.addClass('dict-desc-textarea', 'dict-bordered-input');
				text.onChange(value => newDesc = value);
			});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText("Add Entry")
				.setCta()
				.onClick(async () => {
					if (!newWord.trim() || !newDesc.trim()) {
						new Notice("Words and description cannot be empty.");
						return;
					}
					this.plugin.settings.dictionary.unshift({
						words: newWord.split(',').map(s => s.trim()).filter(s => s.length > 0),
						description: newDesc.trim()
					});
					await this.plugin.saveDictionaryData();
					this.plugin.updateDictionaryMatch();
					this.display();
				})
			);

		new Setting(containerEl).setName("Existing Dictionary Words").setHeading();

		this.plugin.settings.dictionary.sort((a, b) => (a.words[0] || '').localeCompare(b.words[0] || ''));

		const searchContainer = containerEl.createDiv({ cls: 'dict-search-container' });
		const searchInput = searchContainer.createEl('input', { cls: 'dict-search-input' });
		searchInput.type = 'text';
		searchInput.placeholder = 'Search words or descriptions...';
		searchInput.value = this.searchQuery;
		searchInput.oninput = (e: Event) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.renderTable(containerEl);
		};

		this.tableContainer = containerEl.createDiv();
		this.renderTable(containerEl);
	}

	renderTable(containerEl: HTMLElement) {
		this.tableContainer.empty();

		const filteredDictionary = this.plugin.settings.dictionary.filter(entry => {
			if (!this.searchQuery.trim()) return true;
			const q = this.searchQuery.toLowerCase();
			return entry.words.join(', ').toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
		});

		this.tableContainer.addClass('dict-table-container');

		const table = this.tableContainer.createEl('table', { cls: 'dict-table' });

		const trHead = table.createEl('tr');

		const thWords = trHead.createEl('th', { text: "Words/Aliases", cls: 'dict-th dict-th-words' });
		const thDesc = trHead.createEl('th', { text: "Description", cls: 'dict-th dict-th-desc' });
		const thAction = trHead.createEl('th', { text: "Action", cls: 'dict-th dict-th-action' });

		filteredDictionary.forEach((entry) => {
			const tr = table.createEl('tr');

			const tdWords = tr.createEl('td', { cls: 'dict-td' });
			const inputWords = tdWords.createEl('input', { cls: 'dict-word-input' });
			inputWords.type = 'text';
			inputWords.placeholder = 'spring, spring boot';
			inputWords.value = entry.words.join(', ');
			inputWords.onchange = async (e: Event) => {
				entry.words = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(s => s.length > 0);
				await this.plugin.saveDictionaryData();
				this.plugin.updateDictionaryMatch();
			};

			const tdDesc = tr.createEl('td', { cls: 'dict-td' });
			const inputDesc = tdDesc.createEl('textarea', { cls: 'dict-desc-textarea' });
			inputDesc.placeholder = 'A JavaScript framework...';
			inputDesc.value = entry.description;
			inputDesc.onchange = async (e: Event) => {
				entry.description = (e.target as HTMLTextAreaElement).value.trim();
				await this.plugin.saveDictionaryData();
			};

			const tdAction = tr.createEl('td', { cls: 'dict-td dict-td-action' });
			const delButton = tdAction.createEl('button');
			setIcon(delButton, 'trash');
			delButton.addClass('mod-warning');
			delButton.onclick = async () => {
				const actualIndex = this.plugin.settings.dictionary.indexOf(entry);
				if (actualIndex > -1) {
					this.plugin.settings.dictionary.splice(actualIndex, 1);
					await this.plugin.saveDictionaryData();
					this.plugin.updateDictionaryMatch();
					this.renderTable(containerEl);
				}
			};
		});

		if (filteredDictionary.length === 0) {
			const tr = table.createEl('tr');
			const textResult = this.plugin.settings.dictionary.length === 0 ? "Your dictionary is empty. Click 'Add Entry' above to start building your dictionary." : "No matching entries found.";
			const td = tr.createEl('td', { text: textResult, cls: 'dict-td-empty' });
			td.colSpan = 3;
		}
	}
}
