import { escapeHtml } from '../utils/utils.js';

/** Shared tab navigation; only ARIA relationships use generated element IDs. */
export function tabsHtml({ key, label = key, tabs, active = tabs[0]?.key }) {
    return `<div class="segmented-choice" role="tablist" aria-label="${escapeHtml(label)}" data-tabs-nav>${tabs.map(tab => `<button type="button" class="segmented-choice-button segmented-choice-button--compact${tab.key === active ? ' is-active' : ''}" role="tab" id="${key}-tab-${tab.key}" aria-controls="${key}-panel-${tab.key}" aria-selected="${tab.key === active}" tabindex="${tab.key === active ? 0 : -1}" data-tab="${tab.key}">${escapeHtml(tab.label)}</button>`).join('')}</div>${tabs.map(tab => `<section role="tabpanel" id="${key}-panel-${tab.key}" aria-labelledby="${key}-tab-${tab.key}" data-tab-panel="${tab.key}"${tab.key === active ? '' : ' hidden'}>${tab.html}</section>`).join('')}`;
}
export function bindTabs(host, onChange = () => {}) {
    const nav = host.querySelector('[data-tabs-nav]');
    if (!nav) return;
    const buttons = [...nav.querySelectorAll('[data-tab]')];
    const choose = button => {
        for (const candidate of buttons) {
            const active = candidate === button;
            candidate.setAttribute('aria-selected', String(active)); candidate.tabIndex = active ? 0 : -1;
            candidate.classList.toggle('is-active', active);
        }
        host.querySelectorAll('[data-tab-panel]').forEach(panel => { panel.hidden = panel.dataset.tabPanel !== button.dataset.tab; });
        onChange(button.dataset.tab);
    };
    nav.addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (button) choose(button); });
    nav.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); choose(buttons[next]); buttons[next].focus();
    });
}
