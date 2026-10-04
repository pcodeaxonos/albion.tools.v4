export const SALES_VOLUME = Object.freeze({ min: 0, max: 10000, step: 10, default: 100, days: 14 });

export function normalizeSalesVolume(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(SALES_VOLUME.max, Math.max(0, Math.round(number))) : SALES_VOLUME.default;
}

export function filterSalesVolume(candidates, minimum, volumeFor) {
    const accepted = [];
    let low = 0;
    let unknown = 0;
    for (const candidate of candidates) {
        if (minimum > 0) {
            const volume = volumeFor(candidate);
            if (!Number.isFinite(volume)) { unknown++; continue; }
            if (volume < minimum) { low++; continue; }
        }
        accepted.push(candidate);
    }
    return { candidates: accepted, low, unknown };
}
