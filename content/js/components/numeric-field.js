import { escapeHtml } from '../utils/utils.js';

export function compactAmount(value) {
    if (!Number.isFinite(value)) return '—';
    const unit = Math.abs(value) >= 1e6 ? [1e6, 'm'] : Math.abs(value) >= 1e3 ? [1e3, 'k'] : [1, ''];
    return `${Number((value / unit[0]).toFixed(2)).toLocaleString('tr-TR')}${unit[1]}`;
}
export function numericInputValue(input) {
    const text = input.value;
    if (!text.trim()) return NaN;
    if (!input.hasAttribute('data-grouped-integer')) return Number(text);
    if (!/^[\d.\s]+$/.test(text)) return NaN;
    const value = Number(text.replace(/[.\s]/g, ''));
    return Number.isSafeInteger(value) && value >= 0 ? value : NaN;
}
export function groupedIntegerFieldHtml({ key, label, value }) {
    return `<div class="form-value-row"><div class="form-floating"><input class="form-control" type="text" inputmode="numeric" data-grouped-integer data-filter="${escapeHtml(key)}" value="${value.toLocaleString('tr-TR')}" placeholder="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><label>${escapeHtml(label)}</label><output class="form-value-hint" data-compact-amount aria-label="${escapeHtml(label)} kısa gösterim">${compactAmount(value)}</output></div></div>`;
}
export function bindGroupedIntegerFields(root) {
    root.querySelectorAll('[data-grouped-integer]').forEach(input => {
        if (input.dataset.groupedBound) return;
        input.dataset.groupedBound = 'on';
        const sync = () => {
            const value = numericInputValue(input);
            const digitsBefore = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/[^\d]/g, '').length;
            if (Number.isFinite(value)) {
                input.value = value.toLocaleString('tr-TR');
                let cursor = 0, digits = 0;
                while (cursor < input.value.length && digits < digitsBefore) if (/\d/.test(input.value[cursor++])) digits++;
                if (document.activeElement === input) input.setSelectionRange(cursor, cursor);
            }
            input.setCustomValidity(Number.isFinite(value) ? '' : 'Geçerli bir tam sayı girin.');
            input.closest('.form-value-row').querySelector('[data-compact-amount]').textContent = compactAmount(value);
        };
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
        sync();
    });
}
