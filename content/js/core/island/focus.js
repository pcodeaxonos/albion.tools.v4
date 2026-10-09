import { planDayHours } from './economy-config.js';
import { getAll } from '../../db/store.js';

const validCost = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

// Focus is a character/item observation, independent of city and Premium.
export function resolveFocus(item, rows = getAll('islandYieldLogs')) {
    const itemType = item?.seedId ? 'plant' : 'animal';
    const latest = rows.filter(row => (row.itemKey || row.plantKey) === item?.key
        && (row.itemType || 'plant') === itemType && (row.water === true || row.water === 1 || row.water === 'true')
        && validCost(row.focusPerUse) && Number.isFinite(Date.parse(row.date)))
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)
            || Date.parse(b.focusObservedAt || b.date) - Date.parse(a.focusObservedAt || a.date)
            || Number(b.id) - Number(a.id))[0];
    const focusPerUse = latest ? Number(latest.focusPerUse)
        : validCost(item?.defaultFocusPerUse) ? Number(item.defaultFocusPerUse) : null;
    const uses = Number(item?.maxNurtureCount);
    return { focusPerUse, focusSource: latest ? 'observed' : focusPerUse != null ? 'default' : 'unknown',
        focusObservedAt: latest?.date ?? null,
        focusUsesPerCycle: Number.isInteger(uses) && uses > 0 ? uses : null };
}

export function focusRequirement(item, { focused, capacity, hours }, rows) {
    const resolved = resolveFocus(item, rows);
    const cycleFocus = !focused ? 0 : resolved.focusPerUse != null && resolved.focusUsesPerCycle != null
        && Number.isFinite(capacity) && capacity >= 0 ? resolved.focusPerUse * resolved.focusUsesPerCycle * capacity : null;
    return { ...resolved, cycleFocus, focusPerDay: !focused ? 0
        : cycleFocus != null && hours > 0 ? cycleFocus * planDayHours() / hours : null };
}

export function dailyFocusRequirement(item, options) {
    return focusRequirement(item, options).focusPerDay;
}

export function focusSourceLabel(source) {
    return source === 'observed' ? 'ÖLÇÜLEN' : source === 'default' ? 'DEFAULT' : 'BİLİNMİYOR';
}

export function focusSourceSummary(slots) {
    const counts = { observed: 0, default: 0, unknown: 0 };
    for (const value of slots) if (value.effectiveFocus) counts[value.focusSource || 'unknown']++;
    return Object.entries(counts).filter(([, count]) => count).map(([source, count]) =>
        `${count} slot ${source === 'observed' ? 'ölçülen' : source}`).join(' · ');
}
