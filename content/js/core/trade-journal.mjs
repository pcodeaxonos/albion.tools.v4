export const JOURNAL_ZONE = 'Europe/Istanbul';
const sides = { mail_buy: 'buy', instant_buy: 'buy', mail_sell: 'sell', instant_sell: 'sell' };
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: JOURNAL_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const journalDay = value => dayFormat.format(new Date(value));
export function shiftJournalDay(day, delta) {
    return new Date(Date.parse(day + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
}
export function mergeJournalTrades(previous, rows, reset = false) {
    const result = reset ? new Map() : new Map(previous);
    // ID-less fills cannot safely be reconciled across reconnects. Preserve them
    // for diagnostics, but never guess that two similar fills are identical.
    if (reset) result.set('_unidentified', []);
    for (const row of rows || []) {
        if (row.sourceId == null || row.sourceId === '') {
            result.set('_unidentified', [...(result.get('_unidentified') || []), row]);
        } else result.set(JSON.stringify([row.characterGuid, row.sourceId]), row);
    }
    return result;
}
export function journalGroups(records, day) {
    const groups = new Map();
    let skipped = 0, excluded = 0;
    for (const row of records.values()) {
        if (Array.isArray(row)) { skipped += row.length; continue; }
        const side = sides[row.kind];
        if (!side) { excluded++; continue; }
        const ts = Date.parse(row.occurredAt);
        if (!Number.isFinite(ts)) { skipped++; continue; }
        const quantity = row.quantity, total = row.totalPriceSilver, price = row.unitPriceSilver;
        if (!row.itemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(total) || total < 0
            || !Number.isFinite(price) || price < 0) { skipped++; continue; }
        const quality = row.quality == null ? null : Number(row.quality);
        if (quality !== null && (!Number.isInteger(quality) || quality < 1 || quality > 5)) { skipped++; continue; }
        if (journalDay(ts) !== day) continue;
        const city = row.clusterIndex || row.locationName || null;
        const id = JSON.stringify([day, 'flow', row.characterGuid || null, row.itemId, city, quality, side]);
        let group = groups.get(id);
        if (!group) {
            group = { id, day, side, itemId: row.itemId, name: row.itemName || row.itemId,
                city: row.locationName || row.clusterIndex || 'Bilinmeyen şehir', cityId: city, quality,
                character: row.characterGuid || null, quantity: 0, total: 0, last: ts, trades: [] };
            groups.set(id, group);
        }
        group.quantity += quantity; group.total += total; group.last = Math.max(group.last, ts); group.trades.push(row);
    }
    const list = [...groups.values()];
    for (const group of list) {
        group.average = group.total / group.quantity;
        group.trades.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || String(a.sourceId).localeCompare(String(b.sourceId)));
        // References and render state deliberately do not enter the content version.
        group.version = JSON.stringify(group.trades.map(t => [t.sourceId, t.occurredAt, t.quantity, t.totalPriceSilver, t.unitPriceSilver]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
    }
    list.sort((a,b) => b.total - a.total || b.quantity - a.quantity || a.id.localeCompare(b.id));
    const sales = list.filter(g => g.side === 'sell').reduce((sum,g) => sum + g.total, 0);
    const buys = list.filter(g => g.side === 'buy').reduce((sum,g) => sum + g.total, 0);
    return { groups: list, sales, buys, net: sales - buys, count: list.reduce((sum,g) => sum + g.trades.length, 0), skipped, excluded };
}
// Deliberate, conservative thresholds: repeated fills (>=5), or a >=25%
// share of a day with >=5 fills. A solitary normal trade is never a highlight.
export function journalHighlights(model, isUnread) {
    const total = model.sales + model.buys;
    const pairKey = group => JSON.stringify([group.itemId, group.cityId, group.quality, group.character]);
    const directions = new Map();
    for (const group of model.groups) {
        const key = pairKey(group);
        directions.set(key, (directions.get(key) || 0) | (group.side === 'buy' ? 1 : 2));
    }
    return model.groups.map(group => {
        const opposite = directions.get(pairKey(group)) === 3;
        const reason = opposite ? 'Bugün hem alındı hem satıldı' : group.trades.length >= 5 ? 'Yoğun işlem grubu'
            : model.count >= 5 && total > 0 && group.total / total >= .25 ? 'Günün yüksek hacmi' : null;
        return reason ? { group, reason } : null;
    }).filter(Boolean).sort((a,b) => Number(isUnread(b.group)) - Number(isUnread(a.group)) || b.group.total - a.group.total || b.group.last - a.group.last || a.group.id.localeCompare(b.group.id));
}
