import { escapeHtml } from '../utils/utils.js';

export function cityBadgeHtml(city) {
    const name = String(city || '').trim();
    const key = name.toLowerCase().replace(/[\s_]+/g, '-');
    return `<span class="badge city-badge" data-city="${escapeHtml(key)}">${escapeHtml(name.toLocaleUpperCase('en-US'))}</span>`;
}

export function cityRouteHtml(source, target) {
    return `<span class="city-route">${cityBadgeHtml(source)}<span aria-hidden="true">→</span>${cityBadgeHtml(target)}</span>`;
}
