import { quantile, strategyEconomics } from './market-opportunity-quality.mjs';
import { quotedBookPrice } from './market-primitives.mjs';
import { purchaseCostFromRates, saleProceedsFromRates } from './market-fees.mjs';
import { ORDER_HISTORY_POLICY } from './market-history-config.mjs';
import { OBSERVATION_POLICY } from './market-observation.mjs';

const OUTER_FENCE_MULTIPLIER = 3; // Tukey outer fence; descriptive, never a trade or fill-probability gate.

export const SPREAD_CLASSES = Object.freeze({
    'historical-price-supported': { label: 'Tarihsel emir desteği', note: 'Tarihsel fiyat desteği var; emirlerin dolması bilinmiyor.' },
    'current-orders-only': { label: 'Görünen emirler', note: 'Görünen emirler doğrulandı; iki emrin dolması bilinmiyor.' },
    'extreme-wide-uncertain': { label: 'Geniş ve belirsiz makas', note: 'Makas aşırı geniş; bu satış değeri ve dolum kanıtı değil.' },
    'data-calculation-inconsistent': { label: 'Tutarsız makas', note: 'Fiyat veya hesap kanıtında tutarsızlık var.' }
});

export const SPREAD_REVIEW_CLASSES = Object.freeze({
    unusual: { label: 'Olağandışı makas', action: 'Emir fırsatını incele', note: 'Kendi tarihsel makas aralığının üzerinde. Emirlerin dolacağı bilinmiyor.' },
    normal: { label: 'Normal makas', action: 'Makası incele', note: 'Tarihsel makas aralığında; işlem önerisi değildir.' },
    insufficient: { label: 'Veri yetersiz', action: 'Makası incele', note: 'Eşleşmiş tarihsel makas kanıtı yetersiz; işlem önerisi değildir.' }
});

/** Only same-time, accepted quotes form a historical spread. Never subtract unrelated side medians. */
export function assessHistoricalSpread(row, buy = [], sell = []) {
    const currentAt = Math.min(Date.parse(row.buy?.at), Date.parse(row.sell?.at));
    const eligible = point => point.validationStatus === 'accepted' && point.sourceTimeKnown
        && ['reported-top', 'complete'].includes(point.coverage) && point.price > 0
        && point.at < currentAt && point.at >= currentAt - OBSERVATION_POLICY.windowMs;
    const sells = new Map(sell.filter(eligible).map(point => [point.at, point]));
    const hours = new Map();
    for (const point of buy.filter(eligible)) {
        const other = sells.get(point.at);
        if (!other) continue;
        // At most one independent vote per hour, matching the existing reference granularity.
        hours.set(Math.floor(point.at / ORDER_HISTORY_POLICY.bucketMs), { at: point.at, ratio: other.price / point.price });
    }
    const pairs = [...hours.values()].sort((a, b) => a.at - b.at);
    const spanMs = pairs.length ? pairs.at(-1).at - pairs[0].at : 0;
    const [samplesRequired, spanRequired] = OBSERVATION_POLICY.levels[2];
    const q1 = quantile(pairs.map(point => point.ratio), .25), q3 = quantile(pairs.map(point => point.ratio), .75);
    const upperFence = q1 === null ? null : q3 + OUTER_FENCE_MULTIPLIER * (q3 - q1);
    const supported = pairs.length >= samplesRequired && spanMs >= spanRequired;
    const ratio = row.sell?.price / row.buy?.price;
    return { classification: !supported || !Number.isFinite(ratio) ? 'insufficient' : ratio > upperFence ? 'unusual' : 'normal',
        samples: pairs.length, spanMs, samplesRequired, spanRequired, q1, q3, upperFence,
        median: quantile(pairs.map(point => point.ratio), .5), ratio,
        method: 'Same-source-time accepted Buy/Sell pairs; hourly votes; existing L3 sample/span; own-series Tukey upper outer fence',
        reason: supported ? 'own-paired-spread-distribution' : 'insufficient-paired-history',
        fillProbability: null };
}

export function opportunityEvidenceClass(row) {
    if (row.primary?.id === 'local-make') return row.spreadRealism?.classification || 'unclassified';
    if (!row.primary?.evidence?.eligible) return 'unclassified';
    const inputs = Object.values(row.primary.evidence.inputs || {}).filter(Boolean);
    return inputs.length && inputs.every(side => side.referenceLevel >= 3 && side.reference > 0 && (Math.abs(side.deviation) <= OBSERVATION_POLICY.flatBand || side.confirmed))
        ? 'historical-price-supported' : 'current-orders-only';
}

// Diagnostic distribution marker only: never a confidence gate, ROI cap or rank penalty.
export function spreadCalibration(rows) {
    const ratios = rows.map(row => row.sell?.price / row.buy?.price).filter(value => Number.isFinite(value) && value > 0);
    const q1 = quantile(ratios, .25), q3 = quantile(ratios, .75);
    return { samples: ratios.length, q1, q3, outerFence: q1 === null ? null : q3 + OUTER_FENCE_MULTIPLIER * (q3 - q1), method: 'sell/buy Tukey upper outer fence; descriptive only' };
}
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
export function assessSpreadRealism({ row, buyIdentity, sellIdentity, fees, premium = true, calibration }) {
    const strategy = row.strategies?.find(value => value.id === 'local-make');
    const reasons = [];
    if (!strategy) reasons.push('missing-local-make');
    for (const key of ['server', 'itemId', 'city', 'quality']) {
        if (buyIdentity?.[key] === undefined || buyIdentity[key] !== sellIdentity?.[key]) reasons.push(`identity-mismatch:${key}`);
    }
    for (const side of ['buy', 'sell']) {
        const value = row[side];
        if (!(value?.price > 0) || !value.sourceTimeKnown || value.stale || value.executionConfidence !== 1 || value.validationStatus !== 'accepted'
            || !['reported-top', 'complete'].includes(value.coverage)) reasons.push(`${side}:unverified-visible-price`);
        const identity = side === 'buy' ? buyIdentity : sellIdentity;
        if (identity && value?.evidenceId && !value.evidenceId.startsWith(`${identity.server}|${identity.itemId}|${identity.city}|${identity.quality}|${side}|`)) reasons.push(`${side}:evidence-identity-mismatch`);
    }
    const postedBuy = quotedBookPrice(row.buy?.price, 'buy', 'buy');
    const postedSell = quotedBookPrice(row.sell?.price, 'sell', 'sell');
    const capital = purchaseCostFromRates(postedBuy, { setup: true, setupFeeRate: fees.setupFeeRate });
    const proceeds = saleProceedsFromRates(postedSell, { setup: true, setupFeeRate: fees.setupFeeRate, taxRate: premium ? fees.taxPremiumRate : fees.taxFreeRate });
    const net = proceeds - capital;
    const economics = strategy && strategyEconomics(strategy, { buy: row.buy, sell: row.sell }, { premium, fees });
    if (!close(strategy?.netSilver, net) || !close(economics?.capitalSilver, capital) || !close(strategy?.economics?.returnRatio, net / capital)) reasons.push('calculation-inconsistent');
    const supported = side => side?.referenceLevel >= 3 && side.reference > 0 && (Math.abs(side.deviation) <= OBSERVATION_POLICY.flatBand || side.confirmed);
    const historicalSupport = supported(row.buy) && supported(row.sell);
    const ratio = row.sell?.price / row.buy?.price;
    const extreme = Number.isFinite(calibration?.outerFence) && ratio > calibration.outerFence;
    const classification = reasons.length ? 'data-calculation-inconsistent' : historicalSupport ? 'historical-price-supported' : extreme ? 'extreme-wide-uncertain' : 'current-orders-only';
    return { classification, reasons, extreme, historicalSupport, visibleTwoSidedPrices: !reasons.some(value => value.includes('identity') || value.includes('unverified')),
        realizedTradeEvidence: null, depth: null, liquidity: null, fillProbability: null,
        ratio, postedBuy, postedSell, capitalSilver: capital, proceedsSilver: proceeds, netSilver: net, returnRatio: net / capital,
        unitQuantity: 1, priceTimestampGapMs: Math.abs(Date.parse(row.buy?.at) - Date.parse(row.sell?.at)),
        assumptions: ['both-new-orders-fill-once', 'prices-remain-available', 'no-repricing-or-extra-setup-fees'],
        unknown: ['fill-time', 'fill-probability', 'order-quantity', 'queue-position', 'depth', 'realized-sale-value'],
        recommendationEvidence: historicalSupport ? 'historical-quotes-only; execution-unproven' : 'visible-quotes-only; execution-unproven' };
}
