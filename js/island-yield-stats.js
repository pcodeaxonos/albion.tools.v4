import { getAll } from './db/store.js';
import { getEconomyConstant, getPlants } from './catalog.js';

const TABLE = 'islandYieldLogs';

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function bool(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function baseYield(premium) {
    return premium
        ? getEconomyConstant('premium_yield', 9)
        : getEconomyConstant('base_yield', 4.5);
}

function cityYieldBonus() {
    return getEconomyConstant('city_yield_bonus', 0.1);
}

function hasBonus(bonusCities, city) {
    return Array.isArray(bonusCities) && bonusCities.includes(city);
}

/** Standard game harvest qty (city bonus included). */
export function standardPlantYield(plant, islandCity, premium) {
    const base = baseYield(premium);
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

export function yieldLogKey(islandCity, plantKey, premium, water) {
    return `${islandCity}|${plantKey}|${premium ? 1 : 0}|${water ? 1 : 0}`;
}

export function listYieldLogs() {
    return getAll(TABLE).slice();
}

/**
 * Aggregate user observations for one island + plant + premium/water context.
 */
export function plantYieldAverage(islandCity, plantKey, { premium = true, water = false } = {}) {
    if (!islandCity || !plantKey) {
        return null;
    }
    const wantPremium = bool(premium);
    const wantWater = bool(water);
    const rows = listYieldLogs().filter((row) =>
        row.islandCity === islandCity
        && row.plantKey === plantKey
        && bool(row.premium) === wantPremium
        && bool(row.water) === wantWater
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

/** Summary rows for UI: one line per island×plant×premium×water with data. */
export function summarizeYieldAverages({ islandCity = null } = {}) {
    const groups = new Map();
    for (const row of listYieldLogs()) {
        if (islandCity && row.islandCity !== islandCity) {
            continue;
        }
        const key = yieldLogKey(row.islandCity, row.plantKey, row.premium, row.water);
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
    }

    const plantByKey = new Map(getPlants().map((p) => [p.key, p]));
    const out = [];
    for (const [key, rows] of groups) {
        const sample = rows[0];
        const avg = plantYieldAverage(sample.islandCity, sample.plantKey, {
            premium: sample.premium,
            water: sample.water
        });
        if (!avg) {
            continue;
        }
        const plant = plantByKey.get(sample.plantKey);
        out.push({
            key,
            islandCity: sample.islandCity,
            plantKey: sample.plantKey,
            plantLabel: plant?.label || sample.plantKey,
            plantId: plant?.plantId || null,
            premium: bool(sample.premium),
            water: bool(sample.water),
            ...avg,
            thin: avg.n < 3
        });
    }

    out.sort((a, b) =>
        a.islandCity.localeCompare(b.islandCity, 'tr')
        || a.plantLabel.localeCompare(b.plantLabel, 'tr')
        || Number(b.premium) - Number(a.premium)
        || Number(b.water) - Number(a.water)
    );
    return out;
}
