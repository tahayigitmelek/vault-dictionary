import { Extension, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { DictionaryMatcher } from './dictionary-match';
import { App } from 'obsidian';

export const dictionaryUpdateEffect = StateEffect.define<null>();

export function buildDictionaryLivePreview(app: App, matcher: DictionaryMatcher): Extension[] {

    const dictionaryMarkPlugin = ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const hasUpdateEffect = update.transactions.some(tr => tr.effects.some(e => e.is(dictionaryUpdateEffect)));
            if (update.docChanged || update.viewportChanged || hasUpdateEffect) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        destroy() { }

        private buildDecorations(view: EditorView): DecorationSet {
            const builder = new decorationsBuilder();
            for (let { from, to } of view.visibleRanges) {
                const text = view.state.doc.sliceString(from, to);
                const matches = matcher.getMatches(text);
                for (const match of matches) {
                    builder.add(
                        from + match.start,
                        from + match.end,
                        Decoration.mark({
                            class: "dict-highlight dict-live-preview-mark",
                            attributes: { "data-dict-desc": match.description }
                        })
                    );
                }
            }
            return builder.finish();
        }
    }, {
        decorations: v => v.decorations
    });

    const dictionaryClickPlugin = EditorView.domEventHandlers({
        click(event, view) {
            const target = event.target as HTMLElement;
            if (target && target.hasClass("dict-live-preview-mark") && target.dataset.dictDesc) {
                const desc = target.dataset.dictDesc;
                import('./tooltip').then(({ showDictionaryTooltip }) => {
                    showDictionaryTooltip(app, target, desc);
                }).catch(console.error);

                event.preventDefault();
                return true;
            }
            return false;
        }
    });

    return [dictionaryMarkPlugin, dictionaryClickPlugin];
}

class decorationsBuilder {
    private marks: { from: number, to: number, value: Decoration }[] = [];

    add(from: number, to: number, value: Decoration) {
        this.marks.push({ from, to, value });
    }

    finish(): DecorationSet {
        this.marks.sort((a, b) => a.from - b.from);
        return Decoration.set(this.marks);
    }
}
