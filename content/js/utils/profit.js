export function profitClass(value) {
    if (!Number.isFinite(value) || value === 0) {
        return '';
    }
    return value > 0 ? ' is-profit' : ' is-loss';
}
