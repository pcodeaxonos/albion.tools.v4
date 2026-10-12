import { quotedBookPrice } from './market-primitives.mjs';
import { purchaseCostFromRates, saleProceedsFromRates } from './market-fees.mjs';

/** Only consumed quotes supply defaults. A historical reference is not a resale price. */
export function opportunityTradePrices(strategy) {
    const { buy, sell, destination } = strategy?.evidence?.inputs || {};
    switch (strategy?.id) {
    case 'cross-city-instant': return { buyPrice: sell?.price ?? null, sellPrice: destination?.price ?? null, buySetup: false, sellSetup: false };
    case 'local-flip': return { buyPrice: sell?.price ?? null, sellPrice: buy?.price ?? null, buySetup: false, sellSetup: false };
    case 'local-make': return { buyPrice: quotedBookPrice(buy?.price, 'buy', 'buy'), sellPrice: quotedBookPrice(sell?.price, 'sell', 'sell'), buySetup: true, sellSetup: true };
    case 'place-buy-order-sales':
    case 'place-buy-order': return { buyPrice: quotedBookPrice(buy?.price, 'buy', 'buy'), sellPrice: null, buySetup: true, sellSetup: false };
    case 'instant-buy-from-sell': return { buyPrice: sell?.price ?? null, sellPrice: null, buySetup: false, sellSetup: false };
    case 'place-sell-order': return { buyPrice: null, sellPrice: quotedBookPrice(sell?.price, 'sell', 'sell'), buySetup: false, sellSetup: true };
    case 'instant-sell-to-buy': return { buyPrice: null, sellPrice: buy?.price ?? null, buySetup: false, sellSetup: false };
    default: return { buyPrice: null, sellPrice: null, buySetup: false, sellSetup: false };
    }
}
const number = value => value === '' || value === null || value === undefined ? null : Number(value);

export function calculateTradeScenario({ quantity, buyPrice, sellPrice, buySetup = false, sellSetup = false,
    fixedCost = 0, perUnitCost = 0, fees, premium = true }) {
    const q = number(quantity), purchase = number(buyPrice), sale = number(sellPrice), fixed = number(fixedCost), perUnit = number(perUnitCost);
    const empty = { theoretical: true, executionVerified: false, quantity: q, purchaseTotal: null, salesGross: null,
        buySetupFee: null, sellSetupFee: null, tax: null, feesTotal: null, salesNet: null, extraTotal: null,
        capital: null, net: null, roi: null, unitMargin: null, breakEvenQuantity: null };
    if (![fees?.setupFeeRate, fees?.taxPremiumRate, fees?.taxFreeRate].every(rate => Number.isFinite(rate) && rate >= 0 && rate < 1)) return { ...empty, status: 'fees-required' };
    if (!(purchase !== null && Number.isFinite(purchase) && purchase >= 0 && sale !== null && Number.isFinite(sale) && sale > 0)) return { ...empty, status: 'prices-required' };
    if (![fixed, perUnit].every(value => value !== null && Number.isFinite(value) && value >= 0)) return { ...empty, status: 'invalid-cost' };
    const taxRate = premium ? fees.taxPremiumRate : fees.taxFreeRate;
    const unitPurchase = purchaseCostFromRates(purchase, { setup: buySetup, setupFeeRate: fees.setupFeeRate });
    const unitSales = saleProceedsFromRates(sale, { setup: sellSetup, setupFeeRate: fees.setupFeeRate, taxRate });
    const unitMargin = unitSales - unitPurchase - perUnit;
    let breakEvenQuantity = fixed > 0 && unitMargin > 0 ? Math.ceil(fixed / unitMargin) : null;
    if (!Number.isSafeInteger(breakEvenQuantity) || breakEvenQuantity <= 0) breakEvenQuantity = null;
    // Floating-point fee arithmetic can otherwise add one unit at an exact boundary.
    if (breakEvenQuantity && breakEvenQuantity > 1 && (breakEvenQuantity - 1) * unitMargin >= fixed - Number.EPSILON * Math.max(1, fixed) * 8) breakEvenQuantity--;
    const base = { ...empty, unitMargin, breakEvenQuantity };
    if (!Number.isSafeInteger(q) || q <= 0) return { ...base, status: q === null ? 'quantity-required' : 'invalid-quantity' };
    const purchaseTotal = q * unitPurchase, salesGross = q * sale;
    const buySetupFee = buySetup ? q * purchase * fees.setupFeeRate : 0;
    const sellSetupFee = sellSetup ? salesGross * fees.setupFeeRate : 0;
    const tax = salesGross * taxRate, salesNet = q * unitSales, extraTotal = fixed + q * perUnit;
    const capital = purchaseTotal + sellSetupFee + extraTotal;
    const net = salesNet - purchaseTotal - extraTotal;
    if (![purchaseTotal, salesGross, salesNet, extraTotal, capital, net].every(value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)) return { ...empty, status: 'overflow' };
    return { ...base, status: 'calculated', purchaseTotal, salesGross, buySetupFee, sellSetupFee, tax,
        feesTotal: buySetupFee + sellSetupFee + tax, salesNet, extraTotal, capital, net, roi: capital > 0 ? net / capital : null };
}
