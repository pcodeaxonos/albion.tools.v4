import { aodpLongTermReference } from './long-term-price.mjs';
import { DAY_MS } from './market-history-config.mjs';
import { purchaseCostFromRates } from './market-fees.mjs';
import { quotedBookPrice } from './market-primitives.mjs';

export const SALES_REFERENCE_POLICY = Object.freeze({ minDays: 7, maxAgeMs: 3 * DAY_MS });

/** Sales prices are a valuation benchmark, never Buy history or proof of fills. */
export function salesOpportunityReference(anchor, { now = Date.now(), policy = SALES_REFERENCE_POLICY } = {}) {
    const reference = aodpLongTermReference(anchor && { ...anchor,
        data: anchor.data?.filter(point => Number.isSafeInteger(Number(point.item_count)) && Number(point.item_count) > 0)
    }, { now });
    const ageMs = now - Date.parse(reference.lastObservationAt);
    return { ...reference, ageMs, sufficient: reference.validDays >= policy.minDays,
        fresh: Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= policy.maxAgeMs,
        confidenceScore: Math.min(1, reference.validDays / policy.minDays) };
}

export function salesBuyOpportunity(buy, fees) {
    const reference = buy?.salesReference;
    const orderPrice = quotedBookPrice(buy?.price, 'buy', 'buy');
    const cost = purchaseCostFromRates(orderPrice, { setup: true, setupFeeRate: fees.setupFeeRate });
    const advantageSilver = reference?.price > 0 ? reference.price - cost : null;
    return { orderPrice, cost, advantageSilver,
        deviation: reference?.price > 0 ? (cost - reference.price) / reference.price : null };
}
