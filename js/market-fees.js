export const SETUP_FEE = 0.025;
export const TAX_PREMIUM = 0.04;
export const TAX_FREE = 0.08;

export function salesTaxRate(premium) {
    return premium ? TAX_PREMIUM : TAX_FREE;
}

/** Posting a buy or sell order (not instant fill). */
export function placesOrder(intent, side) {
    return intent === side;
}

export function purchaseCost(price, { setup }) {
    return setup ? price * (1 + SETUP_FEE) : price;
}

export function saleProceeds(price, { premium, setup }) {
    const tax = salesTaxRate(premium);
    const fee = setup ? SETUP_FEE : 0;
    return price * (1 - tax - fee);
}

export function feeMetaText(premium) {
    const taxPct = Math.round(salesTaxRate(premium) * 100);
    const setupPct = (SETUP_FEE * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    return `Vergi ${taxPct}% · setup fee ${setupPct}% (emir koyunca) · vergi yalnızca satışta`;
}
