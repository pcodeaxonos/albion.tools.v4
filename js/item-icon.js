import { escapeHtml } from './utils.js';
import { getItemLocalizedName, getItemByUniqueName } from './db/relations.js';

const ICON_BASE = 'https://render.albiononline.com/v1/item';
const DEFAULT_SIZE = 64;

/** Label from items table (localizedName). No duplicate map. */
export function itemLabel(uniqueName, fallback = uniqueName) {
    if (!uniqueName) {
        return fallback;
    }
    return getItemLocalizedName(uniqueName, fallback || uniqueName);
}

export function itemIconUrl(uniqueName, size = DEFAULT_SIZE) {
    const safeSize = Number.isFinite(size) ? Math.min(217, Math.max(1, Math.round(size))) : DEFAULT_SIZE;
    return `${ICON_BASE}/${encodeURIComponent(uniqueName)}.png?size=${safeSize}`;
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
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(itemIconUrl(uniqueName, size))}" alt="${escapeHtml(alt)}" width="36" height="36" loading="lazy" decoding="async" onerror="this.hidden=true">`;
}
