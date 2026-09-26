import { initFloatingLabels } from './forms.js';
import { parsePrice } from '../core/manual-pricing.js';
import { formatSilver } from '../utils/format.js';

function fieldKey(input, dataKey) {
    return typeof dataKey === 'function' ? dataKey(input) : input.dataset[dataKey];
}

/**
 * Binds the repeated manual-price input lifecycle used by calculator tools.
 * Tool-specific state, key lookup and fetched-price fallback stay in the caller.
 */
export function bindManualPriceFields(container, {
    fields,
    onRefresh,
    afterChange
}) {
    initFloatingLabels(container);

    for (const field of fields) {
        container.querySelectorAll(field.selector).forEach((input) => {
            if (input.dataset.priceBound === 'on') {
                return;
            }
            input.dataset.priceBound = 'on';

            input.addEventListener('input', () => {
                const key = fieldKey(input, field.dataKey);
                const parsed = parsePrice(input.value);
                field.values[key] = field.validOnlyOnInput
                    ? (parsed != null ? input.value : null)
                    : input.value;

                if (field.syncFilledOnInput) {
                    input.classList.toggle('is-filled', input.value.length > 0);
                }
                onRefresh?.();
            });

            input.addEventListener('change', () => {
                const key = fieldKey(input, field.dataKey);
                if (parsePrice(input.value) == null) {
                    field.values[key] = null;
                    if (field.restoreInvalid !== false) {
                        const fallbackPrice = field.resolveFallbackPrice?.(key, input);
                        input.value = Number.isFinite(fallbackPrice)
                            ? formatSilver(fallbackPrice)
                            : '';
                        input.classList.toggle('is-filled', input.value.length > 0);
                    }
                }
                field.afterChange?.(key, input);
                afterChange?.(key, input, field);
                onRefresh?.();
            });
        });
    }
}
