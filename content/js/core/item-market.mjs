import { isMarketCatalogItem } from './market-catalog.mjs';
import { normalizePriceDate, ORDER_PRICE_FIELDS } from './market-primitives.mjs';
import { DAY_MS, PRICE_STALE_MS } from './market-history-config.mjs';

export const MARKET_QUALITIES = Object.freeze(['Normal', 'Good', 'Outstanding', 'Excellent', 'Masterpiece']);
export const MARKET_PERIODS = Object.freeze([7, 30, 90]);
export const familyKey = item => String(item.uniqueName).replace(/^T\d+_/, '').replace(/@\d+$/, '');
// Names use Turkish casing; ASCII item IDs must also match a typed lowercase i.
export const normalizeMarketSearch = value => String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/ı/g,'i');
export function searchedFamilyItem(family, query) {
    const id = normalizeMarketSearch(query);
    return family.variants.find(item => normalizeMarketSearch(item.uniqueName) === id) || family.item;
}
export const supportedQualities = item => Number.isInteger(item?.maxQualityLevel) && item.maxQualityLevel >= 1 && item.maxQualityLevel <= 5
    ? Array.from({length:item.maxQualityLevel},(_,i)=>i+1) : [1];
export const variationKey = ({ server, itemId, quality }) => JSON.stringify([server, itemId, quality]);
export function uniqueWatches(rows) {
    return [...new Map((Array.isArray(rows) ? rows : []).filter(r => r?.server && r.itemId && Number.isInteger(r.quality) && r.quality >= 1 && r.quality <= 5).map(r => [variationKey(r), r])).values()];
}
export function itemFamilies(items) {
    const groups = new Map();
    for (const item of items.filter(isMarketCatalogItem)) {
        const key = familyKey(item);
        if (!groups.has(key)) groups.set(key, { key, variants: [] });
        groups.get(key).variants.push(item);
    }
    return [...groups.values()].map(group => {
        group.variants.sort((a,b) => a.tier-b.tier || a.enchantment-b.enchantment);
        return { ...group, item: group.variants.find(x => x.tier === 4 && !x.enchantment) || group.variants[0] };
    });
}
export function orderValue(row, field, now = Date.now()) {
    if (!ORDER_PRICE_FIELDS.includes(field) || row?.quality == null) return null;
    // The Black Market buys equipment; it has no public sell-order book.
    if (row.city === 'Black Market' && field.startsWith('sell')) return null;
    const price = Number(row[field]), date = row[`${field}_date`];
    if (!(price > 0) || !Number.isFinite(price) || !date || String(date).startsWith('0001')) return null;
    const at = Date.parse(normalizePriceDate(date));
    return Number.isFinite(at) && at > 0 && at <= now ? { price, at, stale: now-at > PRICE_STALE_MS } : null;
}
export function historyPoints(points, days, now = Date.now()) {
    return (points || []).map(p => { const quantity=Number(p.item_count); return { time: Date.parse(normalizePriceDate(p.timestamp)), price: Number(p.avg_price), quantity: p.item_count != null && Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null }; })
        .filter(p => p.time >= now-days*DAY_MS && p.time <= now && Number.isFinite(p.price) && p.price > 0)
        .sort((a,b) => a.time-b.time);
}
export function weightedHistory(points, days, now = Date.now()) {
    const rows = historyPoints(points, days, now).filter(p => Number.isSafeInteger(p.quantity) && p.quantity > 0);
    const quantity = rows.reduce((s,p) => s+p.quantity,0);
    return quantity > 0 && Number.isSafeInteger(quantity) ? { price: rows.reduce((s,p) => s+p.price*p.quantity,0)/quantity, quantity, samples: rows.length } : null;
}
export function personalTradeSeries(snapshot, scope, now = Date.now()) {
    if (snapshot?.scope !== 'personal' || snapshot.server !== scope.server) return [];
    const kinds = { mail_buy:'buy', instant_buy:'buy', mail_sell:'sell', instant_sell:'sell' }, seen = new Set();
    return (Array.isArray(snapshot.trades)?snapshot.trades:[]).flatMap(t => {
        if (!kinds[t.kind] || t.itemId !== scope.itemId || t.quality == null || Number(t.quality) !== scope.quality || (t.server ?? snapshot.server) !== scope.server || (t.scope ?? snapshot.scope) !== 'personal') return [];
        const time = Date.parse(normalizePriceDate(t.occurredAt)), price = Number(t.unitPriceSilver), quantity = Number(t.quantity);
        const identity = JSON.stringify([t.sourceId ?? [t.kind,t.locationName,t.occurredAt,t.itemId,t.quantity,t.totalPriceSilver]]);
        if (seen.has(identity) || !t.locationName || !Number.isFinite(time) || time <= 0 || time > now || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return [];
        seen.add(identity);
        return [{ time, price, quantity, city:t.locationName, side:kinds[t.kind], source:'SAT · kişisel gerçekleşme' }];
    });
}
export function evidenceTradeSeries(evidence, scope, now = Date.now()) {
    return Object.values(evidence?.trades || {}).flatMap(trade => {
        const s = evidence.signals?.[trade.signalId];
        if (!s || s.server !== scope.server || s.itemId !== scope.itemId || s.quality !== scope.quality) return [];
        return (Array.isArray(trade.events)?trade.events:[]).filter(e => ['buy','sell'].includes(e.type)).flatMap(e => {
            const time = Date.parse(normalizePriceDate(e.at));
            const city = e.city || s.legs?.[e.type]?.city;
            return time > 0 && time <= now && Number.isFinite(e.price) && e.price > 0 && Number.isSafeInteger(e.quantity) && e.quantity > 0 && city
                ? [{ time, price:e.price, quantity:e.quantity, city, side:e.type, source:'V6/FIFO · kayıtlı gerçekleşme' }] : [];
        });
    });
}
