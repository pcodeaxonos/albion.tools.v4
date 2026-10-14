import { escapeHtml } from '../utils/utils.js';
import { cityName, cityNameAttributes } from './city-name.js';

export function cityBadgeHtml(city) {
    return `<span class="badge city-badge" ${cityNameAttributes(city)}>${escapeHtml(cityName(city))}</span>`;
}

export function cityRouteHtml(source, target) {
    return `<span class="city-route">${cityBadgeHtml(source)}<span aria-hidden="true">→</span>${cityBadgeHtml(target)}</span>`;
}
