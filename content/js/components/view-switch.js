import { escapeHtml } from '../utils/utils.js';

const VIEWS = [
    ['list', 'Liste görünümü', '<path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/>'],
    ['cards', 'Kart görünümü', '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>']
];

export function viewSwitchHtml(value = 'list') {
    const active = VIEWS.some(([key]) => key === value) ? value : 'list';
    return '<div class="view-switch" data-view-switch role="group" aria-label="Görünüm">' + VIEWS.map(([key, label, path]) => '<button type="button" class="view-switch-button' + (key === active ? ' is-active' : '') + '" data-view="' + key + '" aria-pressed="' + (key === active) + '" aria-label="' + escapeHtml(label) + '" data-app-tooltip="' + escapeHtml(label) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg></button>').join('') + '</div>';
}

// Assigning onclick makes rebinding safe after a consumer updates its content.
export function bindViewSwitch(root, onChange) {
    root.querySelectorAll('[data-view-switch]').forEach((group, index) => {
        group.onclick = event => {
            const button = event.target.closest('button[data-view]');
            if (!button || !group.contains(button) || button.getAttribute('aria-pressed') === 'true') return;
            const value = button.dataset.view;
            if (!VIEWS.some(([key]) => key === value)) return;
            group.querySelectorAll('button[data-view]').forEach(choice => {
                const active = choice === button;
                choice.classList.toggle('is-active', active);
                choice.setAttribute('aria-pressed', String(active));
            });
            const restoreFocus = button === button.ownerDocument.activeElement;
            onChange(value);
            if (restoreFocus) root.querySelectorAll('[data-view-switch]')[index]?.querySelector(`[data-view="${value}"]`)?.focus({ preventScroll: true });
        };
    });
}

// Shared placement immediately above the associated list or cards.
export function viewSwitchToolbarHtml(value, content = '', sorting = '') {
    return `<div class="view-switch-toolbar">${content}<div class="result-view-actions">${sorting}${viewSwitchHtml(value)}</div></div>`;
}

const SORT_ICONS = {
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    name: '<path d="m3 17 4-11 4 11M5 12h4M15 6h6l-6 11h6"/>',
    value: '<path d="M4 20h16M6 16v-4M12 16V8M18 16V4"/>',
    ratio: '<path d="m5 19 14-14"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
    cost: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6"/>',
    confidence: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6"/>',
    balanced: '<path d="M12 3v18M4 7h16M7 7l-4 8h8L7 7ZM17 7l-4 8h8l-4-8Z"/>',
    asc: '<path d="M4 7h12M4 12h8M4 17h4m7-8 4-4 4 4M19 5v14"/>',
    desc: '<path d="M4 7h12M4 12h8M4 17h4m7-2 4 4 4-4M19 5v14"/>'
};

export function sortChoicesHtml(options, selected, attributes = value => `data-sort="${escapeHtml(value)}"`) {
    return `<div class="sort-switch" role="group" aria-label="Sıralama">${options.map(({ id, label, tooltip = label, icon = 'value' }) => {
        const explanation = label;
        return `<button type="button" class="view-switch-button${id === selected ? ' is-active' : ''}" ${attributes(id)} aria-pressed="${id === selected}" aria-label="${escapeHtml(explanation)}" data-app-tooltip="${escapeHtml(tooltip)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SORT_ICONS[icon] || SORT_ICONS.value}</svg></button>`;
    }).join('')}</div>`;
}
