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

        matches.sort((a, b) => b.start - a.start);

        const parent = textNode.parentNode;
        if (!parent) continue;

        let currentText = text;
        let nextSibling: Node | null = textNode.nextSibling;

        for (const match of matches) {
            const beforeText = currentText.substring(0, match.start);
            const matchedWord = currentText.substring(match.start, match.end);
            const afterText = currentText.substring(match.end);

            const afterNode = document.createTextNode(afterText);
            if (afterText.length > 0) {
                parent.insertBefore(afterNode, nextSibling);
            }
            nextSibling = afterNode;

            const span = document.createElement('span');
            span.addClass('dict-highlight');
            span.setText(matchedWord);

            span.addEventListener('click', (e) => {
                showDictionaryTooltip(app, span, match.description);
            });

            parent.insertBefore(span, nextSibling);
            nextSibling = span;

            currentText = beforeText;
        }

        textNode.nodeValue = currentText;
    }
}
