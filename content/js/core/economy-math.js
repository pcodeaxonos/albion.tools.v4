/** Converts Albion's additive production bonus percent to material return rate. */
export function returnRateFromProductionBonus(productionBonus) {
    return productionBonus / (100 + productionBonus);
}
