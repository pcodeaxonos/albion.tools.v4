import { getAll } from '../db/store.js';
import { getPlants, getAnimals } from './catalog.js';
import { baseYield, premiumYield, cityYieldBonus } from './island/economy-config.js';

const TABLE = 'islandYieldLogs';

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function bool(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}


function hasBonus(bonusCities, city) {
    return Array.isArray(bonusCities) && bonusCities.includes(city);
}

/** Standard game harvest qty (city bonus included). */
export function standardPlantYield(plant, islandCity, premium) {
    const base = premium ? premiumYield() : baseYield();
    if (!hasBonus(plant?.bonusCities, islandCity)) {
        return base;
    }
    // Ada Çıktı'nda premium şehir-bonuslu varsayılan hasat 9,5 olarak gösterilir.
    return premium ? 9.5 : base * (1 + cityYieldBonus());
}

/** Standard seed return rate from ladder / water. */
export function standardSeedReturn(plant, watered) {
    if (!plant) {
        return null;
    }
    const base = Number(plant.seedReturn) || 0;
    const bonus = Number(plant.waterBonus) || 0;
    return watered ? base + bonus : base;
}

function rowItemType(row) {
    return row.itemType || 'plant';
}

function rowItemKey(row) {
    return row.itemKey || row.plantKey;
}

export function yieldLogKey(islandCity, itemKey, premium, water, itemType = 'plant') {
    return `${itemType}|${islandCity}|${itemKey}|${premium ? 1 : 0}|${water ? 1 : 0}`;
}

export function listYieldLogs() {
    return getAll(TABLE).slice();
}

/**
 * Aggregate user observations for one island + item + premium/water-or-focus context.
 */
export function yieldAverage(islandCity, itemKey, {
    premium = true,
    water = false,
    itemType = 'plant'
} = {}) {
    if (!islandCity || !itemKey) {
        return null;
    }
    const wantPremium = bool(premium);
    const wantWater = bool(water);
    const rows = listYieldLogs().filter((row) =>
        row.islandCity === islandCity
        && rowItemType(row) === itemType
        && rowItemKey(row) === itemKey
        && bool(row.premium) === wantPremium
        && bool(row.water) === wantWater
        && row.isOutlier !== true
        && row.isOutlier !== 'true'
    );

    let planted = 0;
    let returned = 0;
    let harvested = 0;
    for (const row of rows) {
        const seeds = num(row.seedsPlanted);
        if (!(seeds > 0)) {
            continue;
        }
        planted += seeds;
        returned += Math.max(0, num(row.seedsReturned) ?? 0);
        harvested += Math.max(0, num(row.plantsHarvested) ?? 0);
    }

    if (!(planted > 0)) {
        return null;
    }

    return {
        n: rows.length,
        seedsPlanted: planted,
        avgPlantYield: harvested / planted,
        avgSeedReturn: returned / planted,
        source: 'user'
    };
}

export function plantYieldAverage(islandCity, plantKey, options = {}) {
    return yieldAverage(islandCity, plantKey, { ...options, itemType: 'plant' });
}

export function animalYieldAverage(islandCity, animalKey, options = {}) {
    return yieldAverage(islandCity, animalKey, { ...options, itemType: 'animal' });
}

/** Observed egg/milk yield per fed animal; product logs never affect offspring data. */
export function animalProductYieldAverage(islandCity, animalKey, options = {}) {
    return yieldAverage(islandCity, animalKey, { ...options, itemType: 'animalProduct' });
}

/**
 * Effective plant yield: user average if present, else standard (with city bonus).
 * User averages already include real city bonus — do not re-apply.
 */
export function effectivePlantYield(plant, islandCity, { premium = true, water = false } = {}) {
    const avg = plantYieldAverage(islandCity, plant?.key, { premium, water });
    if (avg && avg.avgPlantYield > 0) {
        return {
            qty: avg.avgPlantYield,
            source: 'user',
            n: avg.n,
            bonus: false,
            avg
        };
    }
    const qty = standardPlantYield(plant, islandCity, premium);
    return {
        qty,
        source: 'standard',
        n: 0,
        bonus: hasBonus(plant?.bonusCities, islandCity),
        avg: null
    };
}

/**
 * Effective seed return rate: user average if present, else ladder + water.
 */
export function effectiveSeedReturn(plant, islandCity, { premium = true, water = false } = {}) {
    const avg = plantYieldAverage(islandCity, plant?.key, { premium, water });
    if (avg && Number.isFinite(avg.avgSeedReturn)) {
        return {
            rate: Math.min(1, Math.max(0, avg.avgSeedReturn)),
            source: 'user',
            n: avg.n,
            avg
        };
    }
    return {
        rate: standardSeedReturn(plant, water),
        source: 'standard',
        n: 0,
        avg: null
    };
}

/**
 * Standard offspring return from the curated animal record.
 * Records with nurture metadata apply the per-nurture bonus independently from
 * their base chance. Legacy records retain the existing focus/waterBonus value.
 */
export function standardAnimalReturn(animal, { focus = false, nurtureCount = null } = {}) {
    const base = Number(animal?.seedReturn) || 0;
    if (!focus) {
        return Math.max(0, base);
    }
    const perNurture = Number(animal?.offspringChancePerNurture);
    const maximumNurtures = Number(animal?.maxNurtureCount);
    if (Number.isFinite(perNurture) && perNurture >= 0 && Number.isFinite(maximumNurtures) && maximumNurtures >= 0) {
        const requested = nurtureCount == null ? maximumNurtures : Number(nurtureCount);
        const applied = Math.min(maximumNurtures, Math.max(0, Number.isFinite(requested) ? requested : 0));
        return Math.max(0, base + (perNurture * applied));
    }
    return Math.max(0, base + (Number(animal?.waterBonus) || 0));
}

/** Effective offspring return: observed average if present, else the game ladder. */
export function effectiveAnimalReturn(animal, islandCity, { premium = true, focus = false, nurtureCount = null } = {}) {
    const avg = animalYieldAverage(islandCity, animal?.key, { premium, water: focus });
    if (avg && Number.isFinite(avg.avgSeedReturn)) {
        return {
            rate: Math.max(0, avg.avgSeedReturn),
            source: 'user',
            n: avg.n,
            avg
        };
    }
    return {
        rate: standardAnimalReturn(animal, { focus, nurtureCount }),
        source: 'standard',
        n: 0,
        avg: null
    };
}

/** Effective egg/milk yield, using the separate feeding log when present. */
export function effectiveAnimalProductYield(animal, islandCity, { premium = true, focus = false } = {}) {
    const avg = animalProductYieldAverage(islandCity, animal?.key, { premium, water: focus });
    if (avg && avg.avgPlantYield > 0) {
        return { qty: avg.avgPlantYield, source: 'user', n: avg.n, avg };
    }
    const base = getEconomyConstant('product_qty', 18);
    const bonus = hasBonus(animal?.bonusCities, islandCity) ? cityYieldBonus() : 0;
    return { qty: base * (1 + bonus), source: 'standard', n: 0, avg: null };
}

/** Summary rows for UI: one line per island×item×premium×water-or-focus with data. */
export function summarizeYieldAverages({ islandCity = null } = {}) {
    const groups = new Map();
    for (const row of listYieldLogs()) {
        if (islandCity && row.islandCity !== islandCity) {
            continue;
        }
        const itemType = rowItemType(row);
        const itemKey = rowItemKey(row);
        const key = yieldLogKey(row.islandCity, itemKey, row.premium, row.water, itemType);
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
    }

    const itemByKey = new Map([
        ...getPlants().map((item) => [`plant|${item.key}`, item]),
        ...getAnimals().flatMap((item) => [['animal', item], ['animalProduct', item]].map(([type, row]) => [`${type}|${row.key}`, row]))
    ]);
    const out = [];
    for (const [key, rows] of groups) {
        const sample = rows[0];
        const itemType = rowItemType(sample);
        const itemKey = rowItemKey(sample);
        const avg = yieldAverage(sample.islandCity, itemKey, {
            premium: sample.premium,
            water: sample.water,
            itemType
        });
        if (!avg) {
            continue;
        }
        const item = itemByKey.get(`${itemType}|${itemKey}`);
        out.push({
            key,
            islandCity: sample.islandCity,
            itemType,
            itemKey,
            itemLabel: item?.label || itemKey,
            itemId: itemType === 'plant' ? item?.plantId : (itemType === 'animalProduct' ? item?.productId : item?.grownId),
            premium: bool(sample.premium),
            water: bool(sample.water),
            ...avg,
            thin: avg.n < 3
        });
    }

    out.sort((a, b) =>
        a.islandCity.localeCompare(b.islandCity, 'tr')
        || a.itemLabel.localeCompare(b.itemLabel, 'tr')
        || Number(b.premium) - Number(a.premium)
        || Number(b.water) - Number(a.water)
    );
    return out;
}
