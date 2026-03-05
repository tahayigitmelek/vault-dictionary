import { DictionaryEntry } from "./settings";

export class DictionaryMatcher {
    private regex: RegExp | null = null;
    private wordToDescriptionTarget: Map<string, string> = new Map();

    public buildRegex(dictionary: DictionaryEntry[]) {
        this.wordToDescriptionTarget.clear();
        let allWords: string[] = [];

        for (const entry of dictionary) {
            const description = entry.description;
            for (const word of entry.words) {
                const lowerWord = word.toLowerCase();
                if (lowerWord.length > 0) {
                    this.wordToDescriptionTarget.set(lowerWord, description);
                    allWords.push(this.escapeRegExp(lowerWord));
                }
            }
        }

        if (allWords.length === 0) {
            this.regex = null;
            return;
        }

        allWords.sort((a, b) => b.length - a.length);

        const pattern = `\\b(${allWords.join('|')})\\b`;
        this.regex = new RegExp(pattern, 'giu');
    }

    public getMatches(text: string): { start: number, end: number, word: string, description: string }[] {
        if (!this.regex) return [];

        const excludedRanges: { start: number, end: number }[] = [];
        const linkRegex = /\[\[.*?\]\]/g;
        let linkMatch;
        while ((linkMatch = linkRegex.exec(text)) !== null) {
            excludedRanges.push({ start: linkMatch.index, end: linkMatch.index + linkMatch[0].length });
        }

        const matches = [];
        let match;
        this.regex.lastIndex = 0;

        while ((match = this.regex.exec(text)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;

            const isExcluded = excludedRanges.some(range => start >= range.start && end <= range.end);
            if (isExcluded) continue;

            const matchedText = match[1];
            if (!matchedText) continue;
            const lowerMatch = matchedText.toLowerCase();
            const description = this.wordToDescriptionTarget.get(lowerMatch);

            if (description) {
                matches.push({
                    start: start,
                    end: end,
                    word: matchedText,
                    description: description
                });
            }
        }

        return matches;
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
