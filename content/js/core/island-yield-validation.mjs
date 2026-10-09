// Linear in log count; no confidence/bootstrap computation on the save path.
import { isYieldOutlier } from './island-yield-stability.mjs';
export function entryWarnings(entry, { rows, today, expectedOutput, expectedReturn, alternateReturn, alternatePremiumOutput, alternateCityOutput, modeLabel, flaggedMetrics = new Set() }) {
    const warnings = [];
    const input = entry.seedsPlanted;
    const output = entry.plantsHarvested / input;
    const returned = entry.seedsReturned / input;
    const product = entry.itemType === 'animalProduct';
    const plant = entry.itemType === 'plant';
    // Return rates are stochastic: allow three standard deviations and rounding.
    const returnTolerance = Math.max(0.20, 3 * Math.sqrt(0.25 / input), 1 / input);
    const outputTolerance = Math.max(0.18 * expectedOutput, 2 / Math.sqrt(input));
    const closer = (actual, expected, alternative, tolerance) => Number.isFinite(alternative)
        && Math.abs(actual - expected) > tolerance
        && Math.abs(actual - alternative) < Math.abs(actual - expected) / 2;
    if (entry.date > today) warnings.push('tarih gelecekte');
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(entry.seedsReturned) || !Number.isSafeInteger(entry.plantsHarvested)) warnings.push('miktarlar tam sayı sınırının dışında');
    if (!product && Math.abs(returned - expectedReturn) > returnTolerance) {
        flaggedMetrics.add('return');
        warnings.push(closer(returned, expectedReturn, alternateReturn, returnTolerance)
            ? `${modeLabel} seçimi dönüş miktarıyla uyuşmuyor olabilir`
            : 'dönüş miktarı beklenenden belirgin farklı');
    }
    if ((plant || product) && Math.abs(output - expectedOutput) > outputTolerance) {
        flaggedMetrics.add('output');
        if (closer(output, expectedOutput, alternatePremiumOutput, outputTolerance)) warnings.push('premium seçimi hasat miktarıyla uyuşmuyor olabilir');
        else warnings.push('çıktı miktarı beklenenden belirgin farklı; şehir, ürün ve girdi miktarını kontrol et');
    }
    // City differences are smaller than a general outlier: require a large batch
    // and a materially closer alternative to avoid warnings on ordinary variance.
    if ((plant || product) && input >= 45 && Number.isFinite(alternateCityOutput)
        && Math.abs(output - expectedOutput) > Math.max(0.25, 2 / Math.sqrt(input))
        && Math.abs(output - alternateCityOutput) < Math.abs(output - expectedOutput) / 2) {
        warnings.push('hasat başka bir şehir bonusuna daha yakın; ada şehri yanlış seçilmiş olabilir');
        flaggedMetrics.add('output');
    }
    let duplicate = false;
    let count = 0;
    let totalInput = 0;
    let totalOutput = 0;
    for (const row of rows) {
        if (entry.id != null && String(row.id) === String(entry.id)) continue;
        if ((row.itemType || 'plant') !== entry.itemType || (row.itemKey || row.plantKey) !== entry.itemKey
            || Boolean(row.premium) !== entry.premium || Boolean(row.water) !== entry.water) continue;
        if (row.date === entry.date && Number(row.seedsPlanted) === input
            && Number(row.seedsReturned) === entry.seedsReturned && Number(row.plantsHarvested) === entry.plantsHarvested) duplicate = true;
        if (row.islandCity !== entry.islandCity || isYieldOutlier(row) || !(Number(row.seedsPlanted) > 0)) continue;
        count++;
        totalInput += Number(row.seedsPlanted);
        totalOutput += Number(row.plantsHarvested);
    }
    if (duplicate) warnings.push('aynı gün aynı miktarlarla bir kayıt zaten var; şehir veya çift kayıt olabilir');
    if ((plant || product) && count >= 3 && totalInput >= 45 && totalOutput > 0
        && Math.abs(output - totalOutput / totalInput) > Math.max(outputTolerance, 0.25 * totalOutput / totalInput)) {
        warnings.push('çıktı önceki kayıtlarının ortalamasından belirgin farklı');
        flaggedMetrics.add('output');
    }
    return warnings;
}
