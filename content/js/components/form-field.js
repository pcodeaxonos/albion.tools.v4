import { escapeHtml } from '../utils/utils.js';
export const fieldLabel = label => escapeHtml(String(label).toLocaleUpperCase('tr-TR'));
export function fieldAllButtonHtml({ label, attributes = '', active = false }) {
    return `<button type="button" class="filter-selection-button form-field-all" ${attributes} aria-pressed="${active}" aria-label="${escapeHtml(label)}: tümü" data-app-tooltip="Tümünü seç"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg><span>Tümü</span></button>`;
}
export function fieldHeadingHtml(label, action = '', attributes = '') {
    return `<div class="form-field-heading"><span class="form-field-label" ${attributes} title="${escapeHtml(label)}">${fieldLabel(label)}</span>${action}</div>`;
}
