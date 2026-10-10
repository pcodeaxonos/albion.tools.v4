/** Fee arithmetic with explicit rates. `market-fees.js` supplies the catalog rates. */

export function purchaseCostFromRates(price, { setup, setupFeeRate }) {
    return setup ? price * (1 + setupFeeRate) : price;
}

export function saleProceedsFromRates(price, { taxRate, setup, setupFeeRate }) {
    return price * (1 - taxRate - (setup ? setupFeeRate : 0));
}
