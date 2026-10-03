// NPC hire is static game data, independent of prices, premium and progression.
export function hireTerms(data, type) {
    return data.acquisition?.byType?.[type] || data.acquisition;
}

export function acquisitionStartTier(data, state) {
    return state.acquisitionMode === 'new' ? hireTerms(data, state.type).tier : Number(state.startTier);
}

export function hireCost(data, type, quantity = 1) {
    const terms = hireTerms(data, type);
    if (!terms?.verified || !Number.isSafeInteger(quantity) || quantity < 1) return null;
    const cost = terms.cost * quantity;
    return Number.isSafeInteger(cost) && cost >= 0 ? cost : null;
}
