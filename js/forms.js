import { initAutocompleteSelects } from './autocomplete.js';

/**
 * Sync `.is-filled` on floating-label fields so pre-filled edit forms
 * and programmatic values float labels without relying on :placeholder-shown alone.
 */
export function initFloatingLabels(root = document) {
    initAutocompleteSelects(root);

    const fields = root.querySelectorAll(
        '.form-floating .form-control, .form-floating > .form-select:not(.autocomplete-native)'
    );

    const syncFilledState = (field) => {
        const hasValue = field.tagName === 'SELECT'
            ? field.value !== ''
            : String(field.value ?? '').length > 0;

        field.classList.toggle('is-filled', hasValue);
        field.closest('.autocomplete')?.classList.toggle('is-filled', hasValue);
    };

    fields.forEach((field) => {
        if (field.dataset.floatingBound === 'on') {
            syncFilledState(field);
            return;
        }

        field.dataset.floatingBound = 'on';
        syncFilledState(field);
        field.addEventListener('input', () => syncFilledState(field));
        field.addEventListener('change', () => syncFilledState(field));
    });
}

export function initForms(root = document) {
    initFloatingLabels(root);
}
