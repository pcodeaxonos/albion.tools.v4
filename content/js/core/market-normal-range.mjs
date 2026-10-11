import { quantile } from './market-primitives.mjs';
import { OBSERVATION_REFERENCE_LEVELS, TRUSTED_REFERENCE_LEVEL } from './market-history-config.mjs';
const [rangeSamples, rangeSpanMs] = OBSERVATION_REFERENCE_LEVELS[TRUSTED_REFERENCE_LEVEL - 1];
export const ASSISTANT_POLICY = Object.freeze({ rangeSamples, rangeSpanMs, lowerQuantile: .1, upperQuantile: .9 });
export function normalPriceRange(history, level, spanMs) {
    if (!(level >= TRUSTED_REFERENCE_LEVEL) || history.length < ASSISTANT_POLICY.rangeSamples || !(spanMs >= ASSISTANT_POLICY.rangeSpanMs)) return null;
    const prices = history.map(p => p.price).filter(p => Number.isFinite(p) && p > 0).sort((a,b) => a-b);
    if (prices.length < ASSISTANT_POLICY.rangeSamples) return null;
    return { low: quantile(prices, ASSISTANT_POLICY.lowerQuantile), high: quantile(prices, ASSISTANT_POLICY.upperQuantile), samples: prices.length, spanMs };
}
