import { purchaseCostFromRates, saleProceedsFromRates } from './market-fees.mjs';
import { BOOK_PRICE_FIELDS, normalizePriceDate } from './market-primitives.mjs';
import { PRICE_STALE_MS } from './market-history-config.mjs';

export const DECISION_POLICY = Object.freeze({ staleMs: PRICE_STALE_MS, anomalyRatio: 3, tieRatio: 0.005, maxDepth: 8, maxConversions: 20 });
export const STATUS = Object.freeze({ confirmed: 'AVAILABLE_CONFIRMED', order: 'CONDITIONAL_ORDER', missing: 'INCOMPLETE_DATA', na: 'NOT_APPLICABLE', anomaly: 'ANOMALOUS' });
const finite = n => typeof n === 'number' && Number.isFinite(n);
const positive = n => finite(n) && n > 0;
const nonnegative = n => finite(n) && n >= 0;
const result = (id, status, reasons, extra = {}) => ({ id, status, total: null, reasons, ...extra });

/** sourceQuoteAt is the book observation, never the fetch/seen time. */
export function assessQuote(row, side, reference, { now = Date.now(), policy = DECISION_POLICY } = {}) {
    const field = BOOK_PRICE_FIELDS[side];
    const price = row?.[field];
    const sourceQuoteAt = normalizePriceDate(row?.[`${field}_date`]);
    const at = Date.parse(sourceQuoteAt);
    const metadata = { price, sourceQuoteAt, reference: reference?.source === 'quote-history' ? reference : null };
    if (!positive(price)) return { ...metadata, status: STATUS.missing, reason: `${side}: fiyat eksik` };
    if (!Number.isFinite(at) || at > now || now - at > policy.staleMs) return { ...metadata, status: STATUS.missing, reason: `${side}: gözlem zamanı eksik veya fiyat eski` };
    if (positive(metadata.reference?.price) && (price / reference.price >= policy.anomalyRatio || reference.price / price >= policy.anomalyRatio)) return { ...metadata, status: STATUS.anomaly, reason: `${side}: 28 günlük referanstan uç sapma` };
    return { ...metadata, status: STATUS.confirmed, reason: null };
}

function validFees(fees) {
    return nonnegative(fees?.taxRate) && nonnegative(fees?.setupFeeRate) && fees.taxRate + fees.setupFeeRate < 1;
}
function cost(price, fees, setup = false) { return purchaseCostFromRates(price, { ...fees, setup }); }
function proceeds(price, fees, setup = false) { return saleProceedsFromRates(price, { ...fees, setup }); }

/** Direct recipes only: returned materials are valued at executable buy bids, not acquisition asks. */
export function craftCost({ recipe, quantity, quotes, fees, mechanics, orders = {}, inventory = {}, heldItem, heldQuantity = 0 }) {
    if (!recipe?.lines?.length) return result('craft', STATUS.na, ['Doğrulanmış tarif yok']);
    const missing = [];
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || !validFees(fees)) missing.push('Adet veya market ücretleri geçersiz');
    if (Object.values(inventory).some(n => !nonnegative(n) || !Number.isSafeInteger(n))) missing.push('Envanter adedi geçersiz');
    if (Object.values(orders).some(n => !positive(n))) missing.push('Malzeme emir limiti geçersiz');
    if (!Number.isSafeInteger(mechanics?.batchYield) || mechanics.batchYield <= 0) missing.push('Üretim adedi / batch doğrulanmalı');
    if (!nonnegative(mechanics?.feePerBatch)) missing.push('İstasyon ücreti / batch eksik');
    if (nonnegative(mechanics?.baseSilverPerBatch) && mechanics.feePerBatch < mechanics.baseSilverPerBatch) missing.push('Toplam craft ücreti oyun sabit ücretinden küçük olamaz');
    if (!nonnegative(mechanics?.rr) || mechanics.rr >= 1) missing.push('Malzeme geri dönüş oranı eksik');
    if (mechanics?.focus && (!nonnegative(mechanics.focusPerBatch) || !nonnegative(mechanics.focusSilver))) missing.push('Focus tüketimi veya fırsat maliyeti eksik');
    if (missing.length) return result('craft', STATUS.missing, missing);
    const batches = Math.ceil(quantity / mechanics.batchYield);
    if (!Number.isSafeInteger(batches) || batches <= 0) return result('craft', STATUS.missing, ['Geçersiz batch sayısı']);
    let gross = 0, returns = 0, opportunity = 0, heldUsed = 0, conditional = false, anomalous = false;
    const materials = [];
    for (const line of recipe.lines) {
        if (!positive(line.qty)) { missing.push(`${line.uniqueName}: geçersiz tarif miktarı`); continue; }
        const qty = line.qty * batches;
        if (!Number.isSafeInteger(qty)) { missing.push(`${line.uniqueName}: malzeme adedi güvenli tam sayı sınırını aşıyor`); continue; }
        const owned = line.uniqueName === heldItem ? Math.min(qty, heldQuantity) : Math.min(qty, Math.max(0, inventory[line.uniqueName] || 0));
        if (line.uniqueName === heldItem) heldUsed += owned;
        const buy = quotes[line.uniqueName]?.buy, sell = quotes[line.uniqueName]?.sell;
        const ordered = Object.hasOwn(orders, line.uniqueName);
        const limit = orders[line.uniqueName];
        const check = (quote, label) => {
            if (quote?.status === STATUS.anomaly) anomalous = true;
            else if (quote?.status !== STATUS.confirmed) missing.push(`${line.uniqueName}: ${label} eksik / eski`);
        };
        if (owned) check(buy, 'envanter fırsat fiyatı');
        if (qty > owned) {
            if (ordered) { if (!positive(limit)) missing.push(`${line.uniqueName}: emir limiti geçersiz`); conditional = true; }
            else check(sell, 'anında alış fiyatı');
        }
        const returned = line.appliesRr === false ? 0 : qty * mechanics.rr;
        if (returned) check(buy, 'geri dönüş satış fiyatı');
        const ownValue = owned ? proceeds(buy?.price, fees) * owned : 0;
        const purchase = qty > owned ? cost(ordered ? limit : sell?.price, fees, ordered) * (qty - owned) : 0;
        const returnValue = returned ? proceeds(buy?.price, fees) * returned : 0;
        gross += purchase + ownValue; opportunity += ownValue; returns += returnValue;
        materials.push({ itemId: line.uniqueName, qty, owned, returned, purchase, opportunity: ownValue, returnValue, ordered });
    }
    if (missing.length) return result('craft', STATUS.missing, missing, { batches, materials });
    const fee = batches * mechanics.feePerBatch;
    const focusCost = mechanics.focus ? batches * mechanics.focusPerBatch * mechanics.focusSilver : 0;
    const total = gross + fee + focusCost;
    if (!finite(total)) return result('craft', STATUS.missing, ['Maliyet taşması / geçersiz girdi']);
    // Rank the funded craft without uncertain return liquidation; show its conditional net separately.
    return result('craft', anomalous ? STATUS.anomaly : conditional ? STATUS.order : STATUS.confirmed,
        [returns > 0 ? 'Toplam, geri dönüş satış geliri düşülmeden hesaplandı' : 'Doğrudan tarif; malzemeler anında temin edilir', ...(conditional ? ['Malzeme emirlerinin dolumu bilinmiyor'] : [])],
        { total, conditionalTotal: total - returns, batches, outputQuantity: batches * mechanics.batchYield, materials, gross, fee, returns, opportunity, focusCost, heldUsed, formula: 'Malzeme alış + envanter fırsat maliyeti + istasyon + focus; koşullu efektif maliyet = toplam − geri dönüş net değeri' });
}

/** Defensive recipe expansion for inspection; procurement optimization is deliberately direct-only. */
export function expandRecipe(itemId, quantity, recipes, policy = DECISION_POLICY, path = []) {
    if (path.includes(itemId)) throw new Error('Tarif döngüsü');
    if (path.length >= policy.maxDepth) throw new Error('Tarif derinlik sınırı');
    if (!positive(quantity)) throw new Error('Geçersiz miktar');
    const recipe = recipes[itemId];
    if (!recipe) return { itemId, quantity, children: [] };
    if (!positive(recipe.batchYield)) throw new Error('Batch verisi eksik');
    const batches = Math.ceil(quantity / recipe.batchYield);
    return { itemId, quantity, batches, children: recipe.lines.map(line => expandRecipe(line.uniqueName, line.qty * batches, recipes, policy, [...path, itemId])) };
}

export function decide(input) {
    const { mode, quantity, quotes = {}, itemId, fees, recipe, mechanics, inventory, materialOrders, conversions = [], policy = DECISION_POLICY } = input;
    if (!['need', 'have'].includes(mode) || !Number.isSafeInteger(quantity) || quantity <= 0 || !validFees(fees)) return { primary: 'NO_RELIABLE_DECISION', options: [], reasons: ['Mod, pozitif tam adet veya katalog ücretleri geçersiz'], advantage: null };
    const q = quotes[itemId] || {};
    const options = [];
    const instant = (id, quote, selling) => {
        const computed = quote?.status === STATUS.confirmed || quote?.status === STATUS.anomaly ? (selling ? proceeds(quote.price, fees) : quote.price) * quantity : null;
        const total = finite(computed) ? computed : null;
        return result(id, total == null ? STATUS.missing : quote?.status || STATUS.missing, [quote?.reason || (total == null ? 'Fiyat eksik veya toplam sayı sınırını aşıyor' : 'Güncel gözlemlenen teklif; miktar için order book derinliği bilinmiyor')], { total, formula: selling ? 'Buy teklif × adet × (1 − satış vergisi)' : 'Sell teklif × adet' });
    };
    const order = (id, selling) => positive(input.limitPrice) && finite(input.limitPrice * quantity)
        ? result(id, STATUS.order, ['Dolum süresi hesaplanamıyor; likidite bilinmiyor'], { total: (selling ? proceeds(input.limitPrice, fees, true) : cost(input.limitPrice, fees, true)) * quantity, formula: selling ? 'Limit × adet × (1 − vergi − emir ücreti)' : 'Limit × adet × (1 + emir ücreti)' })
        : result(id, STATUS.missing, ['Pozitif emir limit fiyatı girin']);
    if (mode === 'need') {
        options.push(instant('BUY_NOW', q.sell, false), order('BUY_ORDER', false));
        options.push({ ...craftCost({ recipe, quantity, quotes, fees, mechanics, inventory }), id: 'CRAFT_NOW' });
        options.push(Object.keys(materialOrders || {}).length
            ? { ...craftCost({ recipe, quantity, quotes, fees, mechanics, inventory, orders: materialOrders }), id: 'CRAFT_WITH_ORDERS' }
            : result('CRAFT_WITH_ORDERS', recipe ? STATUS.missing : STATUS.na, ['Malzeme emir limitlerini girin']));
    } else {
        options.push(instant('SELL_NOW', q.buy, true), order('SELL_ORDER', true));
        for (const conversion of conversions.slice(0, policy.maxConversions)) {
            const line = conversion.recipe.lines.find(line => line.uniqueName === itemId);
            if (!positive(line?.qty) || !positive(conversion.mechanics?.batchYield)) {
                options.push(result('CRAFT_INTO', STATUS.missing, ['Üst ürün batch verisi eksik'], { outputId: conversion.recipe.uniqueName })); continue;
            }
            const batches = Math.floor(quantity / line.qty);
            if (!batches) { options.push(result('CRAFT_INTO', STATUS.na, ['Bir batch için eldeki miktar yetersiz'], { outputId: conversion.recipe.uniqueName })); continue; }
            const crafted = craftCost({ recipe: conversion.recipe, quantity: batches * conversion.mechanics.batchYield, mechanics: conversion.mechanics, quotes, fees, heldItem: itemId, heldQuantity: quantity });
            const output = quotes[conversion.recipe.uniqueName]?.buy;
            const status = crafted.status !== STATUS.confirmed ? crafted.status : output?.status || STATUS.missing;
            const sale = positive(output?.price) ? proceeds(output.price, fees) * crafted.outputQuantity : null;
            const total = finite(sale) && finite(crafted.total) && q.buy?.status === STATUS.confirmed ? proceeds(q.buy.price, fees) * quantity + sale - crafted.total : null;
            options.push({ ...crafted, id: 'CRAFT_INTO', outputId: conversion.recipe.uniqueName, status: total == null && status === STATUS.confirmed ? STATUS.missing : status, total, additionalValue: finite(total) ? total - options[0].total : null, formula: 'Eldekinin net satış değeri + output net satış − craft efektif maliyeti' });
        }
        if (!conversions.length) options.push(result('CRAFT_INTO', input.conversionAvailable ? STATUS.missing : STATUS.na, [input.conversionAvailable ? 'Doğrudan üst ürünü seçin; batch ve istasyon girdileri gerekli' : 'Doğrulanmış doğrudan üst tarif yok']));
        options.push(result('HOLD', STATUS.na, ['Bekletmek için güvenilir sinyal yok; sermaye ve fiyat riski bilinmiyor']));
    }
    if ((input.craftCity && input.craftCity !== input.city) || (input.saleCity && input.saleCity !== input.city)) for (const option of options.filter(o => o.id.startsWith('CRAFT') || o.id.startsWith('SELL'))) Object.assign(option, { status: STATUS.missing, total: null, reasons: ['Şehirler arası taşıma maliyeti, risk ve süre bilinmiyor'] });
    const confirmed = options.filter(o => o.status === STATUS.confirmed && finite(o.total));
    const direction = mode === 'need' ? 1 : -1;
    confirmed.sort((a, b) => direction * (a.total - b.total));
    let best = confirmed[0];
    if (best) {
        const immediate = confirmed.find(o => o.id === (mode === 'need' ? 'BUY_NOW' : 'SELL_NOW'));
        if (immediate && Math.abs(immediate.total - best.total) <= Math.max(1, Math.abs(best.total)) * policy.tieRatio) best = immediate;
    }
    const second = confirmed.find(o => o !== best);
    if (best) for (const option of options.filter(o => o.status === STATUS.order && finite(o.total))) option.conditionalAdvantage = direction * (best.total - option.total);
    const advantage = second ? direction * (second.total - best.total) : null;
    const difference = second && advantage > 0 ? `İkinci tam verili seçeneğe ${advantage.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} gümüş avantaj` : null;
    const tieReason = second && Math.abs(advantage) <= Math.max(1, Math.abs(best.total)) * policy.tieRatio ? 'Maliyetler yakın; anında ve daha az adımlı yol tercih edildi' : null;
    return { primary: best?.id || 'NO_RELIABLE_DECISION', best, options, advantage,
        reasons: best ? [...(tieReason ? [tieReason] : difference ? [difference] : []), ...best.reasons, ...(input.urgency === 'now' ? ['Şimdi: dolumu bilinmeyen emirler birincil karara alınmadı'] : ['Emirler yalnızca koşullu fırsat olarak karşılaştırılır'])] : [...new Set(options.flatMap(o => o.reasons))],
        integrity: !best ? 'Eksik / doğrulanamayan veri' : best.id.startsWith('CRAFT') ? 'Manuel craft senaryosu; zorunlu hesap girdileri tam' : (mode === 'need' ? q.sell : q.buy)?.reference ? 'Güncel gözlem ve geçmiş referans mevcut' : 'Sınırlı kanıt: güncel gözlem var, geçmiş referans yok' };
}
