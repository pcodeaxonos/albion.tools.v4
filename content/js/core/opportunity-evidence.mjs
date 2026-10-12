import { opportunityTradePrices } from './market-trade-scenario.mjs';

export const OPPORTUNITY_EVIDENCE_API = '/api/v1/opportunity-evidence';
export const CHECK_RESULTS = Object.freeze({
    correct: 'Fiyat doğru', changed: 'Fiyat değişmiş', quantity: 'Emir miktarı yetersiz',
    missing: 'Emir bulunamadı', executable: 'İşlem yapılabilir', unchecked: 'Kontrol edilemedi'
});
export const TRADE_EVENTS = Object.freeze({ buy: 'Gerçek alış', sell: 'Gerçek satış',
    order: 'Açık emir', cancel: 'Emir iptali', expense: 'Ek gider', complete: 'İşlemi tamamla', abandon: 'İşlemi iptal et' });
export const emptyEvidence = () => ({ version: 1, signals: {}, checks: [], trades: {} });
export const evidenceCanonical = value => JSON.stringify(canonicalValue(value));
function canonicalValue(value) { return Array.isArray(value) ? value.map(canonicalValue) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])])) : value; }
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const text = (value, name) => typeof value === 'string' && value.length > 0 && value.length <= 300 ? value : fail(`${name} gerekli/geçersiz.`);
const date = value => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('Tarih geçersiz.'); return new Date(value).toISOString(); };
const amount = (value, name, positive = false) => {
    if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) <= 0) || Number(value) > 1e12) fail(`${name} geçersiz.`);
    return Number(value);
};
const quantity = value => { const n = amount(value, 'Miktar', true); if (!Number.isSafeInteger(n) || n > 1e9) fail('Miktar pozitif tam sayı olmalı.'); return n; };
const fees = event => ({ tax: amount(event.tax ?? 0, 'Vergi'), fee: amount(event.fee ?? 0, 'Emir ücreti'), extra: amount(event.extra ?? 0, 'Ek gider') });
export function signalSnapshot(row, { server, observedAt, productGroup = 'Bilinmiyor', name = row.itemId } = {}) {
    const prices = opportunityTradePrices(row.primary), inputs = row.primary?.evidence?.inputs || {};
    const legs = {};
    const buyEvidence = prices.buySetup ? inputs.buy : inputs.sell;
    const sellEvidence = prices.sellSetup ? inputs.sell : (inputs.destination || inputs.buy);
    if (prices.buyPrice != null) legs.buy = { direction: 'buy', city: row.city, marketSide: prices.buySetup ? 'Buy' : 'Sell', mode: prices.buySetup ? 'order' : 'instant', price: prices.buyPrice, evidence: buyEvidence || null };
    if (prices.sellPrice != null) legs.sell = { direction: 'sell', city: row.primary?.toCity || row.city, marketSide: prices.sellSetup ? 'Sell' : 'Buy', mode: prices.sellSetup ? 'order' : 'instant', price: prices.sellPrice, evidence: sellEvidence || null };
    return clone({ server: server || row.server, observedAt: observedAt || row.scannedAt || new Date().toISOString(),
        itemId: row.itemId, name, quality: row.quality, city: row.city, toCity: row.primary?.toCity || row.city,
        strategy: row.primary?.id, productGroup, candidateId: row.id, legs,
        signal: { primary: row.primary, confidence: row.confidence ?? null, review: row.review ?? null,
            commercial: row.commercial ?? null, references: { buy: row.buy, sell: row.sell }, outcome: row.outcome ?? null } });
}
export function validateSnapshot(snapshot) {
    const s = clone(snapshot);
    for (const key of ['server', 'itemId', 'name', 'city', 'toCity', 'strategy', 'productGroup', 'candidateId']) text(s[key], key);
    s.observedAt = date(s.observedAt);
    if (!Number.isInteger(s.quality) || s.quality < 1 || s.quality > 5) fail('Kalite geçersiz.');
    if (!s.legs || !Object.keys(s.legs).length || Object.keys(s.legs).some(side => !['buy', 'sell'].includes(side))) fail('Fiyat kanıtı yok.');
    for (const [side, leg] of Object.entries(s.legs)) {
        if (leg.direction !== side || !['Buy', 'Sell'].includes(leg.marketSide) || !['order', 'instant'].includes(leg.mode)) fail('İşlem yönü geçersiz.');
        text(leg.city, 'Şehir'); amount(leg.price, 'Kanıt fiyatı', true);
    }
    return s;
}
export const opportunityKey = s => JSON.stringify([s.server, s.itemId, s.quality, s.city, s.toCity, s.strategy]);
export function verification(state, signalId) {
    const signal = state.signals[signalId];
    if (!signal) return { sides: {}, verified: 0, required: 0, complete: false };
    const chronological = [...state.checks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const sides = Object.fromEntries(Object.keys(signal.legs).map(side => [side, chronological.filter(c => c.signalId === signalId && c.side === side && c.result !== 'unchecked').at(-1) || null]));
    const verified = Object.values(sides).filter(c => ['correct', 'executable'].includes(c?.result)).length;
    return { sides, verified, required: Object.keys(sides).length, complete: verified === Object.keys(sides).length };
}

/** FIFO landed acquisition cost; unfilled orders never create stock or receipts.
 * Buy-fill tax/fees/extra are capitalized; all order fees and independent expenses
 * are recognized when incurred. Sales consume FIFO lots, with no future repricing. */
export function tradeAccounting(trade) {
    const lots = [], orders = new Map();
    let purchaseGross = 0, salesGross = 0, saleNet = 0, costOfSales = 0, expenses = 0, tax = 0, fee = 0, extra = 0, bought = 0, sold = 0;
    for (const e of trade.events) {
        tax += e.tax || 0; fee += e.fee || 0; extra += e.extra || 0;
        if (e.type === 'order') { orders.set(e.id, { ...e, filled: 0, cancelled: false }); expenses += e.tax + e.fee + e.extra; }
        else if (e.type === 'cancel') { orders.get(e.orderId).cancelled = true; expenses += e.tax + e.fee + e.extra; }
        else if (e.type === 'expense') expenses += e.tax + e.fee + e.extra;
        else if (e.type === 'buy') {
            const gross = e.price * e.quantity, cost = gross + e.tax + e.fee + e.extra;
            lots.push({ remaining: e.quantity, unitCost: cost / e.quantity }); purchaseGross += gross; bought += e.quantity;
            if (e.orderId) orders.get(e.orderId).filled += e.quantity;
        } else if (e.type === 'sell') {
            let remaining = e.quantity;
            for (const lot of lots) { const used = Math.min(remaining, lot.remaining); costOfSales += used * lot.unitCost; lot.remaining -= used; remaining -= used; if (!remaining) break; }
            if (remaining) fail('Satış miktarı eldeki stoktan fazla.');
            const gross = e.price * e.quantity;
            salesGross += gross; saleNet += gross - e.tax - e.fee - e.extra; sold += e.quantity;
            if (e.orderId) orders.get(e.orderId).filled += e.quantity;
        }
    }
    const openOrders = [...orders.values()].filter(o => !o.cancelled && o.filled < o.quantity).map(o => ({ ...o, remaining: o.quantity - o.filled }));
    const inventoryCost = lots.reduce((sum, lot) => sum + lot.remaining * lot.unitCost, 0);
    const reservedPurchase = openOrders.filter(o => o.side === 'buy').reduce((sum, o) => sum + o.remaining * o.price, 0);
    const reservedStock = openOrders.filter(o => o.side === 'sell').reduce((sum, o) => sum + o.remaining, 0);
    const realizedNet = saleNet - costOfSales - expenses;
    const cashFlow = salesGross - purchaseGross - tax - fee - extra;
    return { bought, sold, remaining: bought - sold, purchaseGross, salesGross, saleNet, costOfSales, expenses,
        tax, fee, extra, realizedNet, cashFlow, inventoryCost, reservedPurchase, reservedStock, openOrders,
        tiedCapital: inventoryCost + reservedPurchase, lots };
}
function normalizeEvent(input, id, at) {
    if (!Object.hasOwn(TRADE_EVENTS, input.type)) fail('İşlem olayı geçersiz.');
    const e = { id, at, type: input.type, ...fees(input) };
    if (['buy', 'sell', 'order'].includes(e.type)) {
        e.price = amount(input.price, 'Gerçek fiyat', true); e.quantity = quantity(input.quantity);
        if (!Number.isSafeInteger(Math.ceil(e.price * e.quantity)) || e.price * e.quantity > 1e15) fail('İşlem tutarı çok büyük.');
    }
    if (e.type === 'order') { if (!['buy', 'sell'].includes(input.side)) fail('Emir yönü gerekli.'); e.side = input.side; }
    if (input.orderId) e.orderId = text(input.orderId, 'Emir');
    if (e.type === 'cancel' && !e.orderId) fail('İptal edilecek emir gerekli.');
    if (['complete', 'abandon'].includes(e.type) && e.tax + e.fee + e.extra !== 0) fail('Kapanış giderini ayrı gider olarak kaydedin.');
    return e;
}
function appendEvent(trade, event) {
    if (trade.status !== 'open') fail('Kapanmış işleme olay eklenemez.');
    const before = tradeAccounting(trade);
    if (event.orderId) {
        const order = before.openOrders.find(o => o.id === event.orderId);
        if (!order) fail('Açık emir bulunamadı.');
        if (event.type !== 'cancel' && (!['buy', 'sell'].includes(event.type) || order.side !== event.type || event.quantity > order.remaining)) fail('Dolum emir yönü/miktarıyla uyuşmuyor.');
    }
    if (event.type === 'sell') {
        const available = before.remaining - before.reservedStock + (event.orderId ? before.openOrders.find(o => o.id === event.orderId)?.remaining || 0 : 0);
        if (event.quantity > available) fail('Satış miktarı serbest stoktan fazla.');
    }
    if (event.type === 'order' && event.side === 'sell' && event.quantity > before.remaining - before.reservedStock) fail('Emir miktarı serbest stoktan fazla.');
    if (event.type === 'complete' && (!before.bought || before.remaining || before.openOrders.length)) fail('Tamamlama için stok satılmalı ve açık emirler kapatılmalı.');
    if (event.type === 'abandon' && before.openOrders.length) fail('Önce açık emirleri iptal edin.');
    trade.events.push(event);
    if (event.type === 'complete') trade.status = 'completed';
    if (event.type === 'abandon') trade.status = 'cancelled';
    tradeAccounting(trade);
}
/** Returns a new state. Repository supplies stable IDs and canonical snapshot ID. */
export function applyEvidenceCommand(current, command, { signalId, requestId, recordedAt }) {
    const state = clone(current), at = date(command.at || recordedAt);
    if (Date.parse(at) > Date.parse(recordedAt) + 60000) fail('Gelecekteki kontrol/işlem tarihi kabul edilmez.');
    if (command.type === 'check' || command.type === 'start') {
        const s = validateSnapshot(command.snapshot);
        if (command.type === 'check' && Date.parse(s.observedAt) > Date.parse(at) + 60000) fail('Kayıt sinyal anından önce olamaz.');
        if (state.signals[signalId] && JSON.stringify(state.signals[signalId]) !== JSON.stringify(s)) fail('Tarihsel sinyal değiştirilemez.');
        state.signals[signalId] = s;
    }
    if (command.type === 'check') {
        if (!Object.hasOwn(CHECK_RESULTS, command.result) || !state.signals[signalId].legs[command.side]) fail('Kontrol sonucu/tarafı geçersiz.');
        if (command.availableQuantity != null && command.availableQuantity !== '' && !Number.isSafeInteger(Number(command.availableQuantity))) fail('Gözlenen miktar tam sayı olmalı.');
        state.checks.push({ id: requestId, signalId, side: command.side, result: command.result, at, recordedAt,
            observedPrice: command.observedPrice == null || command.observedPrice === '' ? null : amount(command.observedPrice, 'Gözlenen fiyat', true),
            availableQuantity: command.availableQuantity == null || command.availableQuantity === '' ? null : amount(command.availableQuantity, 'Gözlenen miktar'),
            note: String(command.note || '').slice(0, 1000) });
    } else if (command.type === 'start') {
        const check = state.checks.find(c => c.id === command.checkId && c.signalId === signalId);
        const latest = check && verification(state, signalId).sides[check.side];
        if (!check || !['correct', 'executable'].includes(check.result) || latest?.id !== check.id) fail('İşlem başlangıcı için güncel olumlu taraf kontrolü gerekli.');
        const trade = { id: requestId, signalId, checkId: check.id, at, recordedAt, status: 'open', verificationAtStart: verification(state, signalId), events: [] };
        if (!command.initial || !['buy', 'order'].includes(command.initial.type) || (command.initial.type === 'order' && command.initial.side !== 'buy')) fail('Başlangıç gerçek alış veya alış emri gerektirir.');
        appendEvent(trade, normalizeEvent(command.initial, `${requestId}:initial`, at));
        state.trades[requestId] = trade;
    } else if (command.type === 'event') {
        const trade = state.trades[command.tradeId];
        if (!trade) fail('İşlem bulunamadı.');
        if (Date.parse(at) < Date.parse(trade.events.at(-1)?.at || trade.at)) fail('Olay tarihi önceki gerçekleşmeden önce olamaz.');
        appendEvent(trade, normalizeEvent(command.event, requestId, at));
    } else fail('Komut geçersiz.');
    return state;
}
export function freshnessBand(snapshot) {
    const ages = Object.values(snapshot.legs).map(l => Date.parse(snapshot.observedAt) - Date.parse(l.evidence?.at)).filter(Number.isFinite);
    if (ages.length !== Object.keys(snapshot.legs).length) return 'Bilinmiyor';
    const age = Math.max(0, ...ages) / 3600000;
    return age <= 1 ? '0–1 saat' : age <= 6 ? '1–6 saat' : age <= 24 ? '6–24 saat' : '24+ saat';
}
export function evidenceReport(state, filters = {}) {
    const match = s => (!filters.strategy || s.strategy === filters.strategy) && (!filters.city || [s.city, s.toCity].includes(filters.city)) && (!filters.productGroup || s.productGroup === filters.productGroup) && (!filters.freshness || freshnessBand(s) === filters.freshness) && (!filters.server || s.server === filters.server);
    const checks = state.checks.filter(c => match(state.signals[c.signalId]));
    // Latest actual observation per opportunity AND side. Unable-to-check is not a failure or a new observation.
    const latest = new Map();
    for (const c of [...checks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) if (c.result !== 'unchecked') latest.set(`${opportunityKey(state.signals[c.signalId])}|${c.side}`, c);
    const observations = [...latest.values()], priceLatest = new Map(), quantityLatest = new Map();
    for (const c of [...checks].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
        const key = opportunityKey(state.signals[c.signalId]) + '|' + c.side;
        if (['correct', 'changed'].includes(c.result)) priceLatest.set(key, c);
        if (['quantity', 'executable'].includes(c.result)) quantityLatest.set(key, c);
    }
    const priceChecks = [...priceLatest.values()];
    const count = result => (['correct', 'changed'].includes(result) ? priceChecks : result === 'quantity' ? [...quantityLatest.values()] : observations).filter(c => c.result === result).length;
    const trades = Object.values(state.trades).filter(t => match(state.signals[t.signalId]));
    return { checked: new Set(observations.map(c => opportunityKey(state.signals[c.signalId]))).size,
        attempts: checks.length, priceChecks: priceChecks.length, accuracy: priceChecks.length ? count('correct') / priceChecks.length : null,
        correct: count('correct'), changed: count('changed'), insufficient: count('quantity'), missing: count('missing'), executable: count('executable'),
        converted: new Set(trades.map(t => opportunityKey(state.signals[t.signalId]))).size, completed: trades.filter(t => t.status === 'completed').length,
        realizedNet: trades.reduce((sum, t) => sum + tradeAccounting(t).realizedNet, 0),
        tiedCapital: trades.reduce((sum, t) => sum + tradeAccounting(t).tiedCapital, 0),
        checks, trades, observations };
}
