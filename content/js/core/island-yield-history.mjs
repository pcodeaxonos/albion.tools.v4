import { isYieldOutlier } from './island-yield-stability.mjs';

export function yieldHistoryExtent(values) {
    const minimum = Math.min(...values), maximum = Math.max(...values);
    const padding = Math.max((maximum - minimum) * .15, Math.abs(maximum) * .03, .01);
    return { low: Math.max(0, minimum - padding), high: maximum + padding };
}

export function yieldHistoryKey(row) {
    const enabled = value => value === true || value === 'true' || value === 1 || value === '1';
    return JSON.stringify([row.islandCity, row.itemType || 'plant', row.itemKey || row.plantKey, enabled(row.premium), enabled(row.water)]);
}

/** Chronological, input-weighted running means, independent of visible filters. */
export function yieldHistory(rows) {
    const groups = new Map();
    const snapshots = new Map();
    for (const row of [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id))) {
        const key = yieldHistoryKey(row);
        const group = groups.get(key) || { planted: 0, harvested: 0, returned: 0, n: 0, points: [] };
        groups.set(key, group);
        const planted = Number(row.seedsPlanted);
        if (!isYieldOutlier(row) && Number.isFinite(planted) && planted > 0) {
            const quantity = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
            group.planted += planted;
            group.harvested += quantity(row.plantsHarvested);
            group.returned += quantity(row.seedsReturned);
            group.n++;
        }
        const point = { id: row.id, date: row.date, n: group.n,
            avgPlantYield: group.planted > 0 ? group.harvested / group.planted : null,
            avgSeedReturn: group.planted > 0 ? group.returned / group.planted : null };
        group.points.push(point);
        snapshots.set(String(row.id), point);
    }
    return { groups, snapshots };
}
