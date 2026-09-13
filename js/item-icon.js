import { escapeHtml } from './utils.js';
import { getItemLocalizedName, getItemByUniqueName } from './db/relations.js';

const ICON_BASE = './icons';
const DEFAULT_SIZE = 64;

/** Label from items table (localizedName). No duplicate map. */
export function itemLabel(uniqueName, fallback = uniqueName) {
    if (!uniqueName) {
        return fallback;
    }
    return getItemLocalizedName(uniqueName, fallback || uniqueName);
}

export function itemIconUrl(uniqueName, _size = DEFAULT_SIZE) {
    return `${ICON_BASE}/${encodeURIComponent(uniqueName)}.png`;
}

export function stoneBlockId(tier) {
    return `T${tier}_STONEBLOCK`;
}

export function rawStoneId(tier) {
    return `T${tier}_ROCK`;
}

export function itemIconHtml(uniqueName, { size = DEFAULT_SIZE, className = 'item-icon' } = {}) {
    if (!uniqueName) {
        return '';
    }

    const alt = itemLabel(uniqueName, getItemByUniqueName(uniqueName)?.localizedName || uniqueName);
    const px = Number.isFinite(size) ? Math.min(217, Math.max(1, Math.round(size))) : DEFAULT_SIZE;
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(itemIconUrl(uniqueName, size))}" alt="${escapeHtml(alt)}" width="${px}" height="${px}" loading="lazy" decoding="async" onerror="this.hidden=true">`;
}
