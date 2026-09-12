import { getEconomyConstant } from './catalog.js';

export function setupFeeRate() {
    return getEconomyConstant('setup_fee', 0.025);
}

export function taxPremiumRate() {
    return getEconomyConstant('tax_premium', 0.04);
}

export function taxFreeRate() {
    return getEconomyConstant('tax_free', 0.08);
}

/** @deprecated use setupFeeRate() — kept for existing imports */
export const SETUP_FEE = 0.025;
export const TAX_PREMIUM = 0.04;
export const TAX_FREE = 0.08;

export function salesTaxRate(premium) {
    return premium ? taxPremiumRate() : taxFreeRate();
}

/** Posting a buy or sell order (not instant fill). */
export function placesOrder(intent, side) {
    return intent === side;
}

export function purchaseCost(price, { setup }) {
    return setup ? price * (1 + setupFeeRate()) : price;
}

export function saleProceeds(price, { premium, setup }) {
    const tax = salesTaxRate(premium);
    const fee = setup ? setupFeeRate() : 0;
    return price * (1 - tax - fee);
}

export function feeMetaText(premium) {
    const taxPct = Math.round(salesTaxRate(premium) * 100);
    const setupPct = (setupFeeRate() * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    return `Vergi ${taxPct}% · setup fee ${setupPct}% (emir koyunca) · vergi yalnızca satışta`;
}
