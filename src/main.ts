import { App, Editor, MarkdownView, Modal, Notice, Plugin, normalizePath, setIcon } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, DictionaryPluginSettings, DictionarySettingTab, DictionaryEntry, parseDictionaryWords } from "./settings";
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

		this.registerMarkdownPostProcessor((element, _context) => {
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
			this.app.workspace.on("editor-menu", (menu, editor, _view) => {
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

		activeWindow.setTimeout(() => {
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
		contentEl.addClass('dict-add-modal');

		const header = contentEl.createDiv({ cls: 'dict-modal-header' });
		header.createEl("h2", { text: "Add dictionary entry" });
		header.createEl("p", { text: "Save the selected text as a highlighted term." });

		const form = contentEl.createDiv({ cls: 'dict-modal-form' });

		const wordsField = form.createDiv({ cls: 'dict-field' });
		wordsField.createEl('label', { text: 'Words / aliases' });
		const wordsInput = wordsField.createEl('textarea', { cls: 'dict-input dict-modal-input' });
		wordsInput.value = this.words;
		wordsInput.placeholder = 'Spring, spring boot';
		wordsInput.oninput = (event: Event) => {
			this.words = (event.target as HTMLTextAreaElement).value;
		};

		const descField = form.createDiv({ cls: 'dict-field' });
		descField.createEl('label', { text: 'Definition' });
		const descInput = descField.createEl('textarea', { cls: 'dict-input dict-modal-textarea' });
		descInput.value = this.description;
		descInput.placeholder = 'Meaning of the word...';
		descInput.oninput = (event: Event) => {
			this.description = (event.target as HTMLTextAreaElement).value;
		};

		const saveEntry = async () => {
			const wordList = parseDictionaryWords(this.words);
			const description = this.description.trim();

			if (wordList.length === 0 || !description) {
				new Notice("Words and description cannot be empty.");
				return;
			}

			this.plugin.settings.dictionary.unshift({
				words: wordList,
				description
			});

			await this.plugin.saveDictionaryData();
			this.plugin.updateDictionaryMatch();

			new Notice(`Added dictionary entry for ${wordList[0]}`);
			this.close();
		};

		[wordsInput, descInput].forEach(input => {
			input.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					void saveEntry();
				}
			});
		});

		const actions = contentEl.createDiv({ cls: 'dict-modal-actions' });
		const saveButton = actions.createEl('button', { cls: 'mod-cta' });
		setIcon(saveButton, 'check');
		saveButton.appendText(' Save');
		saveButton.onclick = () => {
			void saveEntry();
		};

		window.setTimeout(() => descInput.focus(), 50);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
