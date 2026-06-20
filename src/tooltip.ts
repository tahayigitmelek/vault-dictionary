import { App, Component, MarkdownRenderer } from "obsidian";

export function showDictionaryTooltip(app: App, targetEl: HTMLElement, description: string) {
    closeDictionaryTooltip();

    const tooltip = createDiv();
    tooltip.addClass('dict-custom-tooltip');
    tooltip.id = 'dict-custom-tooltip-id';

    const component = new Component();
    void MarkdownRenderer.render(app, description, tooltip, '', component);

    activeDocument.body.appendChild(tooltip);

    const targetRect = targetEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = targetRect.bottom + 5;
    let left = targetRect.left;

    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
    }

    if (top + tooltipRect.height > window.innerHeight) {
        top = targetRect.top - tooltipRect.height - 5;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.setCssStyles({ opacity: '1' });

    const removeTooltip = (e: MouseEvent) => {
        const toElement = e.relatedTarget as Node | null;
        if (toElement && (targetEl.contains(toElement) || tooltip.contains(toElement))) {
            return;
        }

        closeDictionaryTooltip();
        targetEl.removeEventListener('mouseout', removeTooltip);
        tooltip.removeEventListener('mouseout', removeTooltip);
    };

    targetEl.addEventListener('mouseout', removeTooltip);
    tooltip.addEventListener('mouseout', removeTooltip);
}

export function closeDictionaryTooltip() {
    const existing = activeDocument.getElementById('dict-custom-tooltip-id');
    if (existing) {
        existing.remove();
    }
}
