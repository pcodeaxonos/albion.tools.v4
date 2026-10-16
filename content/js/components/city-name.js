import { escapeHtml } from '../utils/utils.js';
import { getAll } from '../db/store.js';

const identity = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const inputName = city => String(typeof city === 'object' && city ? city.marketApiName || city.name || city.displayName || '' : city || '').trim();

// Match known city facilities exactly; arbitrary zones must not inherit a city
// merely because their names share a prefix. Keep Black Market independent.
export function cityRecord(city) {
    const key = identity(inputName(city));
    if (!key) return undefined;
    const records = getAll('cities');
    const find = target => records.find(row => [row.marketApiName, row.name, row.displayName]
        .some(value => identity(value) === target));
    return find(key) || find(key.replace(/^bankof/, '').replace(/(?:market(?:place)?|portal|bank)$/, ''));
}

// Market identity is the English name; displayName may be localized.
export function cityName(city) {
    const name = inputName(city);
    const record = cityRecord(city);
    return record?.marketApiName || name.replace(/[_-]+/g, ' ');
}

export function cityDataKey(city) {
    return cityName(city).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function cityNameAttributes(city) {
    return `data-city="${escapeHtml(cityDataKey(city))}" lang="en"`;
}

export function cityNameHtml(city) {
    return `<span class="city-name" ${cityNameAttributes(city)}>${escapeHtml(cityName(city))}</span>`;
}
