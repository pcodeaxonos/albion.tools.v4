// Shared fixed-price source for every calculator and market-facing tool.
export const FIXED_PRICE_TABLE = 'fixedPrices';
export const LEGACY_FIXED_PRICE_TABLE = 'islandPlannerV2FixedPrices';

export function fixedPriceKey({ itemId, role }) {
    return `${String(itemId ?? '')}:${String(role ?? '')}`;
}
