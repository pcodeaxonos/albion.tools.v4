import { assessQuote, STATUS, DECISION_POLICY } from './decision-engine.mjs';
import { saleProceedsFromRates } from './market-fees.mjs';
export const BLACK_MARKET = 'Black Market';
export const FLIPPER_SPIKE_RATIO = 1.35;
export const FLIPPER_SORTS = Object.freeze([
    { id: 'balanced', shortLabel: 'Dengeli', label: 'Dengeli puan ↓', field: 'score', direction: -1 },
    { id: 'net', shortLabel: 'Net', label: 'Net kâr / adet ↓', field: 'net', direction: -1 },
    { id: 'roi', shortLabel: 'ROI', label: 'ROI ↓', field: 'roi', direction: -1 },
    { id: 'recent', shortLabel: 'Güncel', label: 'En güncel veri', field: 'ageMs', direction: 1 },
    { id: 'cost', shortLabel: 'Maliyet', label: 'Alış maliyeti ↑', field: 'cost', direction: 1 },
    { id: 'confidence', shortLabel: 'Güven', label: 'Veri güveni ↓', field: 'confidence', direction: -1 }
]);
export function sortFlips(rows, sort = 'balanced') {
    const spec = FLIPPER_SORTS.find(option => option.id === sort) || FLIPPER_SORTS[0];
    const compare = (a, b, field, direction) => {
        const left = a[field], right = b[field];
        if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
        if (!Number.isFinite(right)) return -1;
        return (left - right) * direction;
    };
    return [...rows].sort((a, b) => compare(a, b, spec.field, spec.direction)
        || compare(a, b, 'net', -1) || compare(a, b, 'ageMs', 1)
        || String(a.id).localeCompare(String(b.id)));
}
const positive = n => Number.isFinite(n) && n > 0;
export function evaluateFlip({ item, source, target, sourceReference, targetReference, taxRate, transport = 0, now = Date.now(), maxAgeMs = DECISION_POLICY.staleMs }) {
    const reasons = [];
    if (!item || source?.item_id !== item.uniqueName || target?.item_id !== item.uniqueName || source.city === target.city) return null;
    const quality = Number(source.quality);
    if (![1,2,3,4,5].includes(quality) || quality !== Number(target.quality)) return null;
    if (target.city === BLACK_MARKET && !item.isEquipable) return null;
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1 || !Number.isFinite(transport) || transport < 0) return null;
    const policy = { ...DECISION_POLICY, staleMs: maxAgeMs };
    const ask = assessQuote(source, 'sell', sourceReference, { now, policy });
    const bid = assessQuote(target, 'buy', targetReference, { now, policy });
    if (!positive(ask.price) || !positive(bid.price)) return null;
    for (const quote of [ask, bid]) if (quote.reason) reasons.push(quote.reason);
    const referenceKnown = Boolean(ask.reference && bid.reference);
    const spikes = [[ask, source.city, 'Sell Min'], [bid, target.city, 'Buy Max']].filter(([quote]) => positive(quote.reference?.price) && quote.price / quote.reference.price >= FLIPPER_SPIKE_RATIO).map(([quote, city, side]) => ({city, side, price:quote.price, reference:quote.reference.price, ratio:quote.price / quote.reference.price}));
    spikes.forEach(spike => reasons.push(`${spike.city} ${spike.side}: tarihsel teklif referansına göre fiyat sıçraması`));
    if (!referenceKnown) reasons.push('Tarihsel kontrol eksik');
    if (bid.price / ask.price >= DECISION_POLICY.anomalyRatio) reasons.push('Şehirler arasında uç fiyat farkı');
    const netSale = saleProceedsFromRates(bid.price, { taxRate, setup: false, setupFeeRate: 0 });
    const cost = ask.price + transport, net = netSale - cost, roi = net / cost;
    const ageMs = Math.max(now - Date.parse(ask.sourceQuoteAt), now - Date.parse(bid.sourceQuoteAt));
    const safe = !spikes.length && ask.status === STATUS.confirmed && bid.status === STATUS.confirmed && bid.price / ask.price < DECISION_POLICY.anomalyRatio;
    const confidence = safe ? (referenceKnown ? .85 : .55) : .1;
    return { id: `${item.uniqueName}|${source.city}|${target.city}|${quality}`, itemId: item.uniqueName, source: source.city, target: target.city, quality, buy: ask.price, sell: bid.price, tax: bid.price * taxRate, transport, cost, netSale, net, roi, ageMs, reasons, spikes, safe, confidence,
        // Snapshot prices contain no reliable depth. Never infer quantity from timestamps or price counts.
        expiresAt: now + maxAgeMs - ageMs, quantityLimit: null, weight: positive(item.weight) ? item.weight : null,
        score: safe && net > 0 ? confidence * Math.sqrt(net) * Math.log1p(roi) : 0 };
}
/** Exact bounded integer search with Pareto pruning; explicit resource limit fails rather than returning a greedy 'optimum'. */
export function optimizeLoad(rows, { budget, capacity, limits, maxStates = 10000, now = Date.now() }) {
    if (!positive(budget) || !positive(capacity)) throw new Error('Bütçe ve kapasite pozitif olmalı');
    const candidates = rows.filter(row => row.safe && row.expiresAt >= now && row.net > 0 && positive(limits[row.id]?.weight) && Number.isSafeInteger(limits[row.id]?.quantity) && limits[row.id].quantity > 0);
    const destinations = new Set();
    for (const row of candidates) {
        const key = JSON.stringify([row.itemId, row.target, row.quality]);
        if (destinations.has(key)) throw new Error('Aynı hedef emir için bir kaynak seçin; emir derinliği iki kez kullanılamaz');
        destinations.add(key);
    }
    let states = [{ cost: 0, weight: 0, net: 0, lines: [] }];
    for (const row of candidates) {
        const { weight, quantity } = limits[row.id];
        const expanded = [];
        for (const state of states) {
            const max = Math.min(quantity, Math.floor((budget - state.cost) / row.cost), Math.floor((capacity - state.weight) / weight));
            if (expanded.length + max + 1 > maxStates) throw new Error('Kesin optimizasyon sınırı aşıldı; adetleri veya adayları azaltın');
            for (let qty = 0; qty <= max; qty++) expanded.push({ cost: state.cost + qty * row.cost, weight: state.weight + qty * weight, net: state.net + qty * row.net, lines: qty ? [...state.lines, { row, qty, weight }] : state.lines });
        }
        expanded.sort((a,b) => a.cost-b.cost || a.weight-b.weight || b.net-a.net);
        states = [];
        for (const state of expanded) if (!states.some(other => other.cost <= state.cost && other.weight <= state.weight && other.net >= state.net)) states.push(state);
    }
    const best = states.reduce((a,b) => b.net > a.net ? b : a);
    return { ...best, roi: best.cost ? best.net / best.cost : 0, scenario: true, excluded: rows.length-candidates.length };
}
