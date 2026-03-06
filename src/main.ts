import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, normalizePath } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, DictionaryPluginSettings, DictionarySettingTab, DictionaryEntry } from "./settings";
import { DictionaryMatcher } from "./dictionary-match";
import { dictionaryReadingModeProcessor } from "./reading-mode";
import { buildDictionaryLivePreview, dictionaryUpdateEffect } from "./live-preview";
export default class DictionaryPlugin extends Plugin {
	settings: DictionaryPluginSettings;
	matcher: DictionaryMatcher;
	private isSaving: boolean = false;

	async onload() {
		await this.loadSettings();

		this.matcher = new DictionaryMatcher();

		await this.loadDictionaryData();

		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				const configFilePath = normalizePath(`${this.app.vault.configDir}/vault-dictionary.json`);
				if (file.path === configFilePath && !this.isSaving) {
					await this.loadDictionaryData();
					this.updateDictionaryMatch();
				}
			})
		);

		this.updateDictionaryMatch();

		this.registerMarkdownPostProcessor((element, context) => {
			dictionaryReadingModeProcessor(this.app, element, this.matcher);
		});

		this.registerEditorExtension(buildDictionaryLivePreview(this.app, this.matcher));

		this.addCommand({
			id: 'refresh-dictionary',
			name: 'Refresh dictionary',
			callback: async () => {
				await this.loadDictionaryData();
				this.updateDictionaryMatch();
				new Notice('Dictionary references refreshed!');
			}
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const selection = editor.getSelection();
				if (selection && selection.trim().length > 0) {
					menu.addItem((item) => {
						item
							.setTitle("Add to dictionary")
							.setIcon("book-plus")
							.onClick(() => {
								new AddWordModal(this.app, this, selection.trim()).open();
							});
					});
				}
			})
		);

		this.addSettingTab(new DictionarySettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		 
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DictionaryPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadDictionaryData() {
		const filePath = normalizePath(`${this.app.vault.configDir}/vault-dictionary.json`);
		const oldFilePath = normalizePath(`${this.app.vault.configDir}/tym-dictionary.json`);
		const legacyFilePath = normalizePath('tym-dictionary.json');

		const existsLegacy = await this.app.vault.adapter.exists(legacyFilePath);
		const existsOld = await this.app.vault.adapter.exists(oldFilePath);
		const existsNew = await this.app.vault.adapter.exists(filePath);

		if (existsLegacy && !existsNew) {
			const content = await this.app.vault.adapter.read(legacyFilePath);
			await this.app.vault.adapter.write(filePath, content);
			await this.app.vault.adapter.remove(legacyFilePath);
		} else if (existsOld && !existsNew) {
			const oldContent = await this.app.vault.adapter.read(oldFilePath);
			await this.app.vault.adapter.write(filePath, oldContent);
			await this.app.vault.adapter.remove(oldFilePath);
		}

		const exists = await this.app.vault.adapter.exists(filePath);
		if (exists) {
			const content = await this.app.vault.adapter.read(filePath);
			try {
				 
				const parsed = JSON.parse(content) as unknown;
				if (Array.isArray(parsed)) {
					 
					this.settings.dictionary = parsed as DictionaryEntry[];
				}
			} catch (e) {
				console.error("Failed to parse dictionary JSON", e);
			}
		} else {
			await this.app.vault.adapter.write(filePath, JSON.stringify(this.settings.dictionary || [], null, 2));
		}
	}

	async saveDictionaryData() {
		this.isSaving = true;
		const filePath = normalizePath(`${this.app.vault.configDir}/vault-dictionary.json`);
		await this.app.vault.adapter.write(filePath, JSON.stringify(this.settings.dictionary, null, 2));

		const settingsCopy = { ...this.settings, dictionary: [] };
		await this.saveData(settingsCopy);

		setTimeout(() => {
			this.isSaving = false;
		}, 500);
	}

	updateDictionaryMatch() {
		this.matcher.buildRegex(this.settings.dictionary);

		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			const view = leaf.view as MarkdownView;
			if (view) {
				if (view.previewMode) {
					view.previewMode.rerender(true);
				}
				const editor = view.editor as Editor & { cm?: EditorView };
				if (editor && editor.cm) {
					const cm = editor.cm;
					try {
						cm.dispatch({
							effects: [dictionaryUpdateEffect.of(null)]
						});
					} catch (e) {
						console.error(e);
					}
				}
			}
		});
	}
}

class AddWordModal extends Modal {
	plugin: DictionaryPlugin;
	initialWord: string;

	words: string;
	description: string;

	constructor(app: App, plugin: DictionaryPlugin, initialWord: string) {
		super(app);
		this.plugin = plugin;
		this.initialWord = initialWord;
		this.words = initialWord;
		this.description = '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add new dictionary entry" });

		new Setting(contentEl)
			.setName('Word(s)')
			.setDesc('Comma separated list of aliases')
			.addText(text => {
				text.setValue(this.words)
					.onChange(value => {
						this.words = value;
					});
				text.inputEl.addClass('dict-modal-input');
				return text;
			});

		new Setting(contentEl)
			.setName('Description')
			.addTextArea(text => {
				text.setValue(this.description)
					.onChange(value => {
						this.description = value;
					});
				text.inputEl.addClass('dict-modal-textarea');
				return text;
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					if (!this.words.trim() || !this.description.trim()) {
						new Notice("Words and description cannot be empty.");
						return;
					}

					const wordList = this.words.split(',').map(s => s.trim()).filter(s => s.length > 0);

					this.plugin.settings.dictionary.unshift({
						words: wordList,
						description: this.description.trim()
					});

					await this.plugin.saveDictionaryData();
					this.plugin.updateDictionaryMatch();

					new Notice(`Added dictionary entry for ${wordList[0]}`);
					this.close();
				})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
