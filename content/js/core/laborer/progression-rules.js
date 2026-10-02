// The sole production rule boundary. A future verified rules source can populate
// byType in this manifest without changes to price/economics/planner code.
export function progressionRules(data, type) {
    return data.mechanics.byType?.[type] || data.mechanics;
}
