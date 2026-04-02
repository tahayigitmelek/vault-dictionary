import { App } from "obsidian";
import { DictionaryMatcher } from "./dictionary-match";
import { showDictionaryTooltip } from "./tooltip";

export function dictionaryReadingModeProcessor(app: App, element: HTMLElement, matcher: DictionaryMatcher) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const nodesToProcess: Text[] = [];

    let node;
    while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (parent) {
            const tag = parent.tagName.toLowerCase();
            if (tag === 'code' || tag === 'a' || parent.hasClass('dict-highlight')) {
                continue;
            }
        }
        if (node.nodeValue && node.nodeValue.trim().length > 0) {
            nodesToProcess.push(node as Text);
        }
    }

    for (const textNode of nodesToProcess) {
        const text = textNode.nodeValue || '';
        const matches = matcher.getMatches(text);

        if (matches.length === 0) continue;

        matches.sort((a, b) => a.start - b.start);

        const parent = textNode.parentNode;
        if (!parent || !textNode.parentNode) continue;

        try {
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            for (const match of matches) {
                if (match.start > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.start)));
                }

                const matchedWord = text.substring(match.start, match.end);
                const span = document.createElement('span');
                span.addClass('dict-highlight');
                span.setText(matchedWord);

                const description = match.description;
                span.addEventListener('click', () => {
                    showDictionaryTooltip(app, span, description);
                });

                fragment.appendChild(span);
                lastIndex = match.end;
            }

            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }

            if (textNode.parentNode) {
                textNode.parentNode.replaceChild(fragment, textNode);
            }
        } catch (e) {
            console.debug('vault-dictionary: Skipped DOM update due to concurrent modification', e);
        }
    }
}
