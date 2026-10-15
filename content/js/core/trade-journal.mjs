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
                city: row.locationName || row.clusterIndex || 'Bilinmeyen ÅŸehir', cityId: city, quality,
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
export const JOURNAL_STORY_RULES = Object.freeze({
    maxEvents: 3, maxPerCategory: 2, minimumDayFills: 5,
    large: Object.freeze({ total: 500000, share: .25, absoluteTotal: 5000000 }),
    repeated: Object.freeze({ fills: 5, fillShare: .30, share: .10 }),
    paired: Object.freeze({ fills: 4, share: .20, total: 300000 }), dominantShare: .70
});
const baseKey = g => JSON.stringify([g.itemId, g.cityId, g.quality, g.character]);
export function journalHighlights(model) {
    const r = JOURNAL_STORY_RULES, volume = model.sales + model.buys, bases = new Map(), candidates = [];
    const add = (category, groups, priority) => {
        const total = groups.reduce((n,g) => n + g.total, 0), fills = groups.reduce((n,g) => n + g.trades.length, 0);
        candidates.push({ category, groups, group: groups[0], priority, id: baseKey(groups[0]), total,
            share: volume > 0 ? total / volume : 0, fills, fillShare: fills / model.count, last: Math.max(...groups.map(g => g.last)) });
    };
    for (const g of model.groups) {
        const key = baseKey(g), share = volume > 0 ? g.total / volume : 0;
        if (!bases.has(key)) bases.set(key, []);
        bases.get(key).push(g);
        if (g.total >= r.large.absoluteTotal || (model.count >= r.minimumDayFills && g.total >= r.large.total && share >= r.large.share)) add('large', [g], 0);
        if (model.count >= r.minimumDayFills && g.trades.length >= r.repeated.fills && g.trades.length / model.count >= r.repeated.fillShare && share >= r.repeated.share) add('repeated', [g], 2);
    }
    for (const groups of bases.values()) {
        const total = groups.reduce((n,g) => n + g.total, 0), fills = groups.reduce((n,g) => n + g.trades.length, 0);
        if (model.count >= r.minimumDayFills && groups.some(g => g.side === 'buy') && groups.some(g => g.side === 'sell') && fills >= r.paired.fills && total >= r.paired.total && volume > 0 && total / volume >= r.paired.share) add('paired', groups.slice().sort((a,b) => a.id.localeCompare(b.id)), 1);
    }
    candidates.sort((a,b) => a.priority - b.priority || b.share - a.share || b.total - a.total || b.fills - a.fills || b.last - a.last || a.id.localeCompare(b.id) || a.group.id.localeCompare(b.group.id));
    const selected = [], used = new Set(), counts = new Map();
    for (const e of candidates) {
        if (used.has(e.id) || (counts.get(e.category) || 0) >= r.maxPerCategory) continue;
        selected.push(e); used.add(e.id); counts.set(e.category, (counts.get(e.category) || 0) + 1);
        if (selected.length === r.maxEvents) break;
    }
    return selected;
}
const storyNumber = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
export function journalEventText(e) {
    const share = `Günlük hacmin %${storyNumber(e.share * 100)}'i`;
    if (e.category === 'large') return { title: `Günün yüksek hacimli ${e.group.side === 'sell' ? 'satışı' : 'alışı'}`, detail: `${storyNumber(e.group.quantity)} adet · ${storyNumber(e.total)} Silver`, reason: share };
    if (e.category === 'repeated') return { title: 'Bu üründe yoğun işlem gerçekleşti', detail: `${e.fills} gerçekleşme · ${storyNumber(e.group.quantity)} adet · ${storyNumber(e.total)} Silver`, reason: `${share} · Gerçekleşmelerin %${storyNumber(e.fillShare * 100)}'i` };
    const direction = side => { const g = e.groups.find(g => g.side === side); return `${side === 'buy' ? 'Alış' : 'Satış'}: ${storyNumber(g.total)} Silver / ${storyNumber(g.quantity)} adet`; };
    return { title: 'Aynı üründe alış ve satış gerçekleşti', detail: `${direction('buy')} · ${direction('sell')}`, reason: `${share} · ${e.fills} gerçekleşme` };
}
export function journalSummary(model) {
    if (!model.count) return 'Bugün gerçekleşmiş alış veya satış bulunmuyor.';
    const volume = model.sales + model.buys, r = JOURNAL_STORY_RULES;
    const dominant = (volume > 0 && model.sales / volume >= r.dominantShare) || model.groups.every(g => g.side === 'sell') ? 'Satış ağırlıklı gün' : (volume > 0 && model.buys / volume >= r.dominantShare) || model.groups.every(g => g.side === 'buy') ? 'Alış ağırlıklı gün' : 'Alış ve satışın birlikte gerçekleştiği gün';
    const parts = ['sell','buy'].flatMap(side => { const count = model.groups.filter(g => g.side === side).reduce((n,g) => n + g.trades.length, 0); return count ? [`${count} ${side === 'sell' ? 'satış' : 'alış'}, ${storyNumber(side === 'sell' ? model.sales : model.buys)} Silver`] : []; });
    return `${dominant}. ${parts.join('; ')}.`;
}
