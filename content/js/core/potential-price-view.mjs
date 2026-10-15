import { itemVariant } from './item-variant.mjs';
import { SALE_HORIZONS } from './potential-sale-horizon.mjs';

export const POTENTIAL_FILTERS = [
    ['tier', 'Tier'], ['enchant', 'Enchant'],
    ['city', 'Şehir'], ['server', 'Sunucu'], ['side', 'Yön'],
    ['quality', 'Kalite'], ['days', 'Satış süresi'], ['decision', 'Fiyat kararı'], ['status', 'Durum']
];
export const potentialFilterValue = (row, key) => String(
    key === 'tier' || key === 'enchant' ? itemVariant(row.itemId)[key] : row[key] ?? '');
export const POTENTIAL_SORTS = [
    ['savedAt', 'Karar zamanı'], ['itemName', 'Eşya adı'], ['price', 'Tahmin edilen fiyat'], ['days', 'Satış süresi']
];
export const potentialDefaults = () => ({ search: '', itemId: '', sort: 'savedAt', direction: 'desc', view: 'list', page: 1,
    ...Object.fromEntries(POTENTIAL_FILTERS.map(([key]) => [key, ''])) });
export function potentialPreferences(saved) {
    const state = potentialDefaults();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return state;
    for (const key of ['search', 'itemId', ...POTENTIAL_FILTERS.map(([key]) => key)]) {
        if (typeof saved[key] === 'string') state[key] = saved[key];
    }
    if (POTENTIAL_SORTS.some(([key]) => key === saved.sort)) state.sort = saved.sort;
    if (['asc', 'desc'].includes(saved.direction)) state.direction = saved.direction;
    if (['list', 'cards'].includes(saved.view)) state.view = saved.view;
    if (Number.isSafeInteger(saved.page) && saved.page > 0) state.page = saved.page;
    if (!SALE_HORIZONS.some(period => String(period.days) === state.days)) state.days = '';
    return state;
}
export function filterPotentialRows(rows, filters) {
    const search = String(filters.search || '').trim().toLocaleLowerCase('tr-TR');
    const result = rows.filter(row => (row.days == null || SALE_HORIZONS.some(period => period.days === Number(row.days)))
        && POTENTIAL_FILTERS.every(([key]) => !filters[key] || potentialFilterValue(row, key) === filters[key])
        && (!filters.itemId || row.itemId === filters.itemId)
        && (!search || [row.itemName, row.itemId].some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(search))));
    const key = POTENTIAL_SORTS.some(([key]) => key === filters.sort) ? filters.sort : 'savedAt';
    const direction = filters.direction === 'asc' ? 1 : -1;
    return result.sort((a, b) => {
        const value = row => key === 'savedAt' ? (Date.parse(row[key]) || null) : row[key];
        const left = value(a), right = value(b);
        if (left == null || right == null) return left == null && right == null ? 0 : left == null ? 1 : -1;
        return direction * (typeof left === 'number' ? left - right : String(left).localeCompare(String(right), 'tr', { numeric: true }))
            || String(a.id).localeCompare(String(b.id));
    });
}
export const potentialTone = row => row.freshness === 'delayed' || row.decision === 'İnceleme gerekli' ? 'warning' : row.price > 0 ? 'success' : 'secondary';
