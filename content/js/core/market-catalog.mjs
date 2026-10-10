const EXCLUDED_NAME = /NONTRADABLE|_SKIN|^SKIN_|^QUESTITEM_|^TUTORIAL|^DEBUG|UNIQUE_UNLOCK/;
const EXCLUDED_TYPE = new Set(['SKIN', 'VANITY', 'DEBUG', 'TUTORIAL']);

/**
 * A catalog row can be listed on the market. This is a structural filter:
 * tiered shop goods, excluding explicit non-tradable rows, skins and quest tokens.
 * It is not a list of item ids.
 */
export function isMarketCatalogItem(item) {
    const name = item?.uniqueName;
    if (!name || item.tradeable === false) return false;
    if (EXCLUDED_NAME.test(name)) return false;
    if (EXCLUDED_TYPE.has(item.itemType)) return false;
    if (!item.shopCategory || item.shopCategory === 'vanity') return false;
    return Number(item.tier) >= 1;
}

export function marketCatalogItemIds(items) {
    return [...new Set((items || []).filter(isMarketCatalogItem).map((item) => item.uniqueName))].sort();
}

/**
 * NATS LocationId values are market stalls ("Martlock Market"), not the city cluster id.
 * Caerleon is the exception: its city record is the market id.
 */
export function locationNamesByIndex(locations, cities = []) {
    const cityNames = new Set((cities || []).map((city) => city.marketApiName || city).filter(Boolean));
    const names = new Map();
    for (const row of locations || []) {
        if (row.locationType !== 'Market' || !/^\d+$/.test(String(row.index))) continue;
        if (typeof row.uniqueName === 'string' && row.uniqueName.endsWith(' Market')) {
            names.set(Number(row.index), row.uniqueName.slice(0, -' Market'.length));
        }
    }
    for (const row of locations || []) {
        if (row.locationType !== 'City' || !cityNames.has(row.uniqueName)) continue;
        if (/^\d+$/.test(String(row.index))) names.set(Number(row.index), row.uniqueName);
    }
    return names;
}
