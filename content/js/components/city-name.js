import { escapeHtml } from '../utils/utils.js';
import { getAll } from '../db/store.js';

const identity = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Market identity is the English name; displayName may be localized.
export function cityName(city) {
    const name = String(typeof city === 'object' && city ? city.marketApiName || city.name || city.displayName || '' : city || '').trim();
    const key = identity(name);
    const marketKey = key.replace(/market(?:place)?$/, '');
    const record = key && getAll('cities').find(row => [row.marketApiName, row.name, row.displayName].some(value => {
        const candidate = identity(value);
        return candidate && (candidate === key || candidate === marketKey);
    }));
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
