import { choiceState } from '../core/choice-selection.mjs';
import { escapeHtml } from '../utils/utils.js';
export const fieldLabel = label => escapeHtml(String(label).toLocaleUpperCase('tr-TR'));
export function fieldAllButtonHtml({ label, attributes = '', active = false }) {
    return `<button type="button" class="filter-selection-button form-field-all" ${attributes} aria-pressed="${active}" aria-label="${escapeHtml(label)}: tümü" data-app-tooltip="Tümünü seç"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg><span>Tümü</span></button>`;
}
export function fieldHeadingHtml(label, action = '', attributes = '') {
    return `<div class="form-field-heading"><div class="form-field-label" ${attributes} title="${escapeHtml(label)}">${fieldLabel(label)}</div>${action}</div>`;
}

// Filters with an explicit all value keep that action in the heading.
// Attributes and optional option content belong to the consuming domain.
export function filterChoiceFieldHtml({ label, options, selected, allValue, attributes, className = '', after = '', isActive, content = option => escapeHtml(option.shortLabel ?? option.label) }) {
    const active = isActive ?? (value => choiceState(selected, value, allValue).active);
    const excluded = value => choiceState(selected, value, allValue).excluded;
    const all = fieldAllButtonHtml({ label, attributes: attributes(allValue), active: active(allValue) });
    const buttons = options.filter(option => String(option.value) !== String(allValue)).map(option =>
        `<button type="button" class="segmented-choice-button segmented-choice-button--short${active(option.value) ? ' is-active' : ''}${excluded(option.value) ? ' is-excluded' : ''}" data-choice-label="${escapeHtml(option.label)}" ${attributes(option.value)} aria-pressed="${active(option.value)}" aria-label="${escapeHtml(option.label)}${excluded(option.value) ? ' (hariç tutuldu)' : ''}" title="${escapeHtml(option.label)}">${content(option)}</button>`
    ).join('');
    return `<div class="choice-field form-field ${escapeHtml(className)}">${fieldHeadingHtml(label, all)}<div class="segmented-choice segmented-choice--filter" role="group" aria-label="${escapeHtml(label)}">${buttons}</div>${after}</div>`;
}
