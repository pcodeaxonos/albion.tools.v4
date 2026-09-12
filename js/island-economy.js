/**
 * Island plot planner: crop / herb / pasture / kennel economics + opportunity-cost feed search.
 * Livestock feed qty uses wiki (18). Mount feed/hours from community breeding tables.
 */

import { purchaseCost, saleProceeds } from './market-fees.js';
import { quoteFromRow } from './price-side.js';
import { cityRow } from './market.js';

export const ISLAND_PLOTS_BY_LEVEL = {
    1: 1,
    2: 3,
    3: 6,
    4: 9,
    5: 12,
    6: 16
};

export const PLANT_SLOTS = 9;
export const PASTURE_PENS = 9;
export const KENNEL_PENS = 4;
/** In-game crop cycle (Albion “day”). */
export const CROP_HOURS = 22;
/** Livestock base cycle = 2 Albion days. */
export const LIVESTOCK_HOURS = 44;
export const LIVESTOCK_FEED = 18;
export const MEAT_QTY = 18;
export const PRODUCT_QTY = 18;
/** Game day length; +2h slack keeps a clean 24h real-day loop. */
export const ALBION_DAY_HOURS = 22;
export const PLAN_DAY_HOURS = 24;

/**
 * Convert in-game cycle hours to planning hours (22h → 24h = 1 gün).
 * Fractional days are rounded up: &lt;24 → 1 gün, &lt;48 → 2 gün, …
 */
export function planCycleHours(albionHours) {
    if (!Number.isFinite(albionHours) || albionHours <= 0) {
        return null;
    }
    const raw = (albionHours / ALBION_DAY_HOURS) * PLAN_DAY_HOURS;
    const days = Math.max(1, Math.ceil(raw / PLAN_DAY_HOURS - 1e-9));
    return days * PLAN_DAY_HOURS;
}

const BASE_YIELD = 4.5;
const PREMIUM_YIELD = 9;
const CITY_YIELD_BONUS = 0.1;

const YIELD_LADDER = [
    { seedReturn: 0, waterBonus: 2 },
    { seedReturn: 0.3333, waterBonus: 1.33 },
    { seedReturn: 0.6, waterBonus: 0.8 },
    { seedReturn: 0.7333, waterBonus: 0.53 },
    { seedReturn: 0.8, waterBonus: 0.4 },
    { seedReturn: 0.8667, waterBonus: 0.27 },
    { seedReturn: 0.9111, waterBonus: 0.18 },
    { seedReturn: 0.9333, waterBonus: 0.13 }
];

/** Non-premium grow hours for riding animals by tier. */
const MOUNT_HOURS = {
    3: 44,
    4: 92,
    5: 140,
    6: 188,
    7: 236,
    8: 284
};

/** Total plant/meat units per riding animal cycle. */
const MOUNT_FEED = {
    3: 10,
    4: 20,
    5: 90,
    6: 270,
    7: 810,
    8: 2430
};

const FEED_CROPS = {
    wheat: { stem: 'WHEAT', label: 'Sheaf of Wheat', bonusCities: ['Martlock', 'Brecilien'] },
    turnip: { stem: 'TURNIP', label: 'Turnips', bonusCities: ['Fort Sterling', 'Brecilien'] },
    cabbage: { stem: 'CABBAGE', label: 'Cabbage', bonusCities: ['Thetford', 'Brecilien'] },
    potato: { stem: 'POTATO', label: 'Potatoes', bonusCities: ['Martlock', 'Brecilien'] },
    corn: { stem: 'CORN', label: 'Bundle of Corn', bonusCities: ['Bridgewatch', 'Brecilien'] },
    pumpkin: { stem: 'PUMPKIN', label: 'Pumpkin', bonusCities: ['Lymhurst', 'Brecilien'] }
};

function ladder(tier) {
    return YIELD_LADDER[Math.min(YIELD_LADDER.length, Math.max(1, tier)) - 1];
}

function crop(key, tier, stem, label, vendor, bonusCities) {
    const y = ladder(tier);
    return {
        id: `crop-${key}`,
        key,
        kind: 'crop',
        plotType: 'farm',
        tier,
        label,
        vendor,
        bonusCities,
        seedId: `T${tier}_FARM_${stem}_SEED`,
        plantId: `T${tier}_${stem}`,
        seedReturn: y.seedReturn,
        waterBonus: y.waterBonus
    };
}

function herb(key, tier, stem, label, vendor, bonusCities) {
    const y = ladder(tier);
    return {
        id: `herb-${key}`,
        key,
        kind: 'herb',
        plotType: 'herb',
        tier,
        label,
        vendor,
        bonusCities,
        seedId: `T${tier}_FARM_${stem}_SEED`,
        plantId: `T${tier}_${stem}`,
        seedReturn: y.seedReturn,
        waterBonus: y.waterBonus
    };
}

function livestock(key, tier, stem, label, vendor, feedKey, productStem, bonusCities) {
    const y = ladder(tier);
    const feed = FEED_CROPS[feedKey];
    return {
        id: `livestock-${key}`,
        key,
        kind: 'livestock',
        plotType: 'pasture',
        pens: PASTURE_PENS,
        tier,
        label,
        vendor,
        baseHours: LIVESTOCK_HOURS,
        feedQty: LIVESTOCK_FEED,
        feedDiet: 'plants',
        feedKey,
        feedFixed: true,
        seedReturn: y.seedReturn,
        waterBonus: y.waterBonus,
        babyId: `T${tier}_FARM_${stem}_BABY`,
        grownId: `T${tier}_FARM_${stem}_GROWN`,
        meatId: `T${tier}_MEAT`,
        productId: productStem ? `T${tier}_${productStem}` : null,
        feedSeedId: `T${tier}_FARM_${feed.stem}_SEED`,
        feedPlantId: `T${tier}_${feed.stem}`,
        feedLabel: feed.label,
        feedBonusCities: feed.bonusCities,
        /** Local production bonus: +10% butcher / milk-egg yield on this island city. */
        bonusCities: bonusCities ?? []
    };
}

function mount(key, tier, stem, label, plotType, feedDiet, vendor, seedReturn, waterBonus) {
    return {
        id: `mount-${key}-t${tier}`,
        key: `${key}-t${tier}`,
        kind: 'mount',
        plotType,
        pens: plotType === 'kennel' ? KENNEL_PENS : PASTURE_PENS,
        tier,
        label: `${label} T${tier}`,
        vendor: vendor ?? null,
        baseHours: MOUNT_HOURS[tier],
        feedQty: MOUNT_FEED[tier],
        feedDiet,
        feedFixed: false,
        seedReturn,
        waterBonus,
        babyId: `T${tier}_FARM_${stem}_BABY`,
        grownId: `T${tier}_FARM_${stem}_GROWN`,
        meatId: null,
        productId: null,
        feedSeedId: null,
        feedPlantId: null,
        feedLabel: feedDiet === 'meat' ? 'Meat' : 'Plants',
        feedBonusCities: [],
        bonusCities: []
    };
}

export const CROPS = [
    crop('carrot', 1, 'CARROT', 'Carrots', 2312, ['Lymhurst', 'Brecilien']),
    crop('bean', 2, 'BEAN', 'Beans', 3468, ['Bridgewatch', 'Brecilien']),
    crop('wheat', 3, 'WHEAT', 'Sheaf of Wheat', 5780, ['Martlock', 'Brecilien']),
    crop('turnip', 4, 'TURNIP', 'Turnips', 8670, ['Fort Sterling', 'Brecilien']),
    crop('cabbage', 5, 'CABBAGE', 'Cabbage', 11560, ['Thetford', 'Brecilien']),
    crop('potato', 6, 'POTATO', 'Potatoes', 17340, ['Martlock', 'Brecilien']),
    crop('corn', 7, 'CORN', 'Bundle of Corn', 26010, ['Bridgewatch', 'Brecilien']),
    crop('pumpkin', 8, 'PUMPKIN', 'Pumpkin', 34680, ['Lymhurst', 'Brecilien'])
];

export const HERBS = [
    herb('agaric', 2, 'AGARIC', 'Arcane Agaric', 3468, ['Thetford']),
    herb('comfrey', 3, 'COMFREY', 'Brightleaf Comfrey', 5780, ['Caerleon']),
    herb('burdock', 4, 'BURDOCK', 'Crenellated Burdock', 8670, ['Lymhurst']),
    herb('teasel', 5, 'TEASEL', 'Dragon Teasel', 11560, ['Bridgewatch', 'Caerleon']),
    herb('foxglove', 6, 'FOXGLOVE', 'Elusive Foxglove', 17340, ['Martlock']),
    herb('mullein', 7, 'MULLEIN', 'Firetouched Mullein', 26010, ['Thetford', 'Caerleon']),
    herb('yarrow', 8, 'YARROW', 'Ghoul Yarrow', 34680, ['Fort Sterling'])
];

export const LIVESTOCK = [
    livestock('chicken', 3, 'CHICKEN', 'Chicken', 5780, 'wheat', 'EGG', ['Fort Sterling']),
    livestock('goat', 4, 'GOAT', 'Goat', 8670, 'turnip', 'MILK', ['Bridgewatch']),
    livestock('goose', 5, 'GOOSE', 'Goose', 11560, 'cabbage', 'EGG', ['Lymhurst']),
    livestock('sheep', 6, 'SHEEP', 'Sheep', 17340, 'potato', 'MILK', ['Fort Sterling']),
    livestock('pig', 7, 'PIG', 'Pig', 26010, 'corn', null, ['Thetford']),
    livestock('cow', 8, 'COW', 'Cow', 34680, 'pumpkin', 'MILK', ['Martlock'])
];

const HORSE_YIELD = [
    { t: 3, sr: 0.84, wb: 0.2 },
    { t: 4, sr: 0.7867, wb: 0.1333 },
    { t: 5, sr: 0.7867, wb: 0.0889 },
    { t: 6, sr: 0.814, wb: 0.0593 },
    { t: 7, sr: 0.842, wb: 0.0395 },
    { t: 8, sr: 0.8736, wb: 0.0263 }
];

export const PASTURE_MOUNTS = HORSE_YIELD.flatMap(({ t, sr, wb }) => [
    mount('horse', t, 'HORSE', 'Horse', 'pasture', 'plants', null, sr, wb),
    mount('ox', t, 'OX', 'Ox', 'pasture', 'plants', null, sr, wb)
]);

/** Common kennel mounts (meat diet). Island feed self-sufficiency skipped for meat. */
export const KENNEL_MOUNTS = [
    mount('swiftclaw', 5, 'COUGAR', 'Swiftclaw', 'kennel', 'meat', null, 0, 0.1),
    mount('direwolf', 6, 'DIREWOLF', 'Direwolf', 'kennel', 'meat', null, 0, 0.08),
    mount('direboar', 7, 'DIREBOAR', 'Direboar', 'kennel', 'meat', null, 0, 0.06),
    mount('direbear', 8, 'DIREBEAR', 'Direbear', 'kennel', 'meat', null, 0, 0.05),
    mount('swampdragon', 7, 'SWAMPDRAGON', 'Swamp Dragon', 'kennel', 'meat', null, 0, 0.06),
    mount('mammoth', 8, 'MAMMOTH', 'Mammoth', 'kennel', 'meat', null, 0, 0.05)
];

export const ALL_ANIMALS = [...LIVESTOCK, ...PASTURE_MOUNTS, ...KENNEL_MOUNTS];
export const ALL_PLANTS = [...CROPS, ...HERBS];

export function plotsForLevel(level) {
    const n = ISLAND_PLOTS_BY_LEVEL[level];
    return Number.isFinite(n) ? n : ISLAND_PLOTS_BY_LEVEL[6];
}

export function allPriceItemIds() {
    const ids = new Set();
    for (const item of ALL_PLANTS) {
        ids.add(item.seedId);
        ids.add(item.plantId);
    }
    for (const item of ALL_ANIMALS) {
        ids.add(item.babyId);
        ids.add(item.grownId);
        if (item.meatId) {
            ids.add(item.meatId);
        }
        if (item.productId) {
            ids.add(item.productId);
        }
        if (item.feedSeedId) {
            ids.add(item.feedSeedId);
        }
        if (item.feedPlantId) {
            ids.add(item.feedPlantId);
        }
    }
    for (let t = 3; t <= 8; t += 1) {
        ids.add(`T${t}_MEAT`);
    }
    return [...ids];
}

function quoteAt(priceIndex, itemId, city, side, intent) {
    if (!priceIndex || !itemId || !city) {
        return null;
    }
    return quoteFromRow(cityRow(priceIndex, itemId, city), side, intent);
}

function hasBonus(bonusCities, city) {
    return Array.isArray(bonusCities) && bonusCities.includes(city);
}

function harvestPerSeed(plant, islandCity, premium) {
    const base = premium ? PREMIUM_YIELD : BASE_YIELD;
    return hasBonus(plant.bonusCities, islandCity) ? base * (1 + CITY_YIELD_BONUS) : base;
}

function seedReturnRate(item, watered) {
    return watered ? item.seedReturn + item.waterBonus : item.seedReturn;
}

function babyChance(item, focused) {
    return focused ? item.seedReturn + item.waterBonus : item.seedReturn;
}

function cycleHours(baseHours, premium) {
    return premium ? baseHours / 2 : baseHours;
}

/** Hours used for ₺/gün and UI (24h day planning). */
function metricsHours(baseHours, premium) {
    return planCycleHours(cycleHours(baseHours, premium));
}

function perDay(profit, hours) {
    if (!Number.isFinite(profit) || !Number.isFinite(hours) || hours <= 0) {
        return null;
    }
    return (profit / hours) * PLAN_DAY_HOURS;
}

function cycleMetrics(profit, cost, hours) {
    const safeCost = Number.isFinite(cost) ? cost : null;
    const safeProfit = Number.isFinite(profit) ? profit : null;
    const profitPct = safeCost != null && safeCost > 0 && safeProfit != null
        ? safeProfit / safeCost
        : null;
    return {
        profit: safeProfit,
        cost: safeCost,
        revenue: safeProfit != null && safeCost != null ? safeProfit + safeCost : null,
        profitPct,
        hours: Number.isFinite(hours) ? hours : null,
        perDay: perDay(safeProfit, hours)
    };
}

function plantGrowUnitCost(plant, ctx) {
    const seed = quoteAt(ctx.priceIndex, plant.seedId, ctx.islandCity, ctx.buySide, 'buy');
    if (!seed) {
        return null;
    }
    const qty = harvestPerSeed(plant, ctx.islandCity, ctx.premium);
    const usedReturn = seedReturnRate(plant, ctx.water);
    const netSeed = purchaseCost(seed.price * (1 - usedReturn), { setup: seed.setup });
    if (!(qty > 0) || !Number.isFinite(netSeed)) {
        return null;
    }
    return {
        unit: netSeed / qty,
        seed,
        qty,
        usedReturn,
        bonus: hasBonus(plant.bonusCities, ctx.islandCity)
    };
}

function plantPlotYield(plant, ctx) {
    const qty = harvestPerSeed(plant, ctx.islandCity, ctx.premium);
    return PLANT_SLOTS * qty;
}

function cropSellActivity(plant, ctx) {
    const grow = plantGrowUnitCost(plant, ctx);
    const sell = quoteAt(ctx.priceIndex, plant.plantId, ctx.sellCity, ctx.sellSide, 'sell');
    if (!grow || !sell) {
        return null;
    }
    const yieldPlot = plantPlotYield(plant, ctx);
    const seedCost = grow.unit * yieldPlot;
    const revenue = saleProceeds(sell.price, { premium: ctx.premium, setup: sell.setup }) * yieldPlot;
    const profit = revenue - seedCost;
    const hours = planCycleHours(CROP_HOURS);
    const metrics = cycleMetrics(profit, seedCost, hours);
    if (metrics.perDay == null) {
        return null;
    }
    return {
        id: `sell-${plant.id}`,
        kind: plant.kind,
        plotType: plant.plotType,
        label: plant.label,
        pathLabel: 'Sat',
        item: plant,
        iconId: plant.plantId,
        ...metrics,
        feedDemand: 0,
        feedCrop: null,
        detail: grow.bonus ? 'şehir +10%' : null
    };
}

function resolveFeedCrop(animal, feedCropOverride) {
    if (animal.feedFixed && animal.feedKey) {
        const key = animal.feedKey;
        const meta = FEED_CROPS[key];
        const tier = animal.tier;
        return CROPS.find((c) => c.key === key) ?? crop(key, tier, meta.stem, meta.label, 0, meta.bonusCities);
    }
    return feedCropOverride ?? null;
}

function marketFeedUnit(animal, feedCrop, ctx) {
    if (animal.feedDiet === 'meat') {
        const meatId = `T${animal.tier}_MEAT`;
        const q = quoteAt(ctx.priceIndex, meatId, ctx.islandCity, ctx.buySide, 'buy');
        if (!q) {
            return null;
        }
        return {
            unit: purchaseCost(q.price, { setup: q.setup }),
            quote: q,
            label: `T${animal.tier} Meat`,
            plantId: meatId,
            source: 'market'
        };
    }
    const plant = feedCrop ?? resolveFeedCrop(animal, null);
    if (!plant) {
        return null;
    }
    const q = quoteAt(ctx.priceIndex, plant.plantId, ctx.islandCity, ctx.buySide, 'buy');
    if (!q) {
        return null;
    }
    return {
        unit: purchaseCost(q.price, { setup: q.setup }),
        quote: q,
        label: plant.label,
        plantId: plant.plantId,
        crop: plant,
        source: 'market'
    };
}

function islandFeedUnit(feedCrop, ctx) {
    const grow = plantGrowUnitCost(feedCrop, ctx);
    if (!grow) {
        return null;
    }
    return {
        unit: grow.unit,
        quote: grow.seed,
        label: feedCrop.label,
        plantId: feedCrop.plantId,
        crop: feedCrop,
        source: 'island',
        harvestPerSeed: grow.qty,
        bonus: grow.bonus
    };
}

function hasAnimalCityBonus(animal, city) {
    return hasBonus(animal.bonusCities, city);
}

function butcherQty(animal, ctx) {
    const base = MEAT_QTY;
    return hasAnimalCityBonus(animal, ctx.islandCity) ? base * (1 + CITY_YIELD_BONUS) : base;
}

function productQty(animal, ctx) {
    const base = PRODUCT_QTY;
    return hasAnimalCityBonus(animal, ctx.islandCity) ? base * (1 + CITY_YIELD_BONUS) : base;
}

function animalPathProfits(animal, feedUnit, ctx) {
    const baby = quoteAt(ctx.priceIndex, animal.babyId, ctx.islandCity, ctx.buySide, 'buy');
    const grown = quoteAt(ctx.priceIndex, animal.grownId, ctx.sellCity, ctx.sellSide, 'sell');
    if (!baby || feedUnit == null || !Number.isFinite(feedUnit)) {
        return [];
    }

    const chance = babyChance(animal, ctx.focus);
    const babyNet = purchaseCost(baby.price, { setup: baby.setup });
    const feedCost = animal.feedQty * feedUnit;
    const growCost = babyNet + feedCost;
    const babyCredit = chance * baby.price;
    const cityBonus = hasAnimalCityBonus(animal, ctx.islandCity);
    const paths = [];

    if (grown) {
        const rev = saleProceeds(grown.price, { premium: ctx.premium, setup: grown.setup }) + babyCredit;
        paths.push({
            id: 'grow',
            label: 'Büyüt',
            profit: rev - growCost,
            cost: growCost,
            revenue: rev,
            iconId: animal.grownId,
            cityBonus: false
        });
    }

    if (animal.meatId) {
        const meat = quoteAt(ctx.priceIndex, animal.meatId, ctx.sellCity, ctx.sellSide, 'sell');
        if (meat) {
            const qty = butcherQty(animal, ctx);
            const rev = saleProceeds(meat.price, { premium: ctx.premium, setup: meat.setup }) * qty + babyCredit;
            paths.push({
                id: 'butcher',
                label: 'Kes',
                profit: rev - growCost,
                cost: growCost,
                revenue: rev,
                iconId: animal.meatId,
                cityBonus
            });
        }
    }

    if (animal.productId) {
        const product = quoteAt(ctx.priceIndex, animal.productId, ctx.sellCity, ctx.sellSide, 'sell');
        if (product) {
            const onlyFeed = feedCost;
            const qty = productQty(animal, ctx);
            const rev = saleProceeds(product.price, { premium: ctx.premium, setup: product.setup }) * qty;
            paths.push({
                id: 'feed',
                label: 'Besle',
                profit: rev - onlyFeed,
                cost: onlyFeed,
                revenue: rev,
                iconId: animal.productId,
                cityBonus
            });
        }
    }

    return paths.filter((p) => Number.isFinite(p.profit));
}

function bestAnimalPath(animal, feedUnit, ctx) {
    const paths = animalPathProfits(animal, feedUnit, ctx);
    let best = null;
    for (const path of paths) {
        if (!best || path.profit > best.profit) {
            best = path;
        }
    }
    return best;
}

function animalActivityFromPath(animal, path, feed, feedCrop, ctx) {
    const hours = metricsHours(animal.baseHours, ctx.premium);
    const plotProfit = path.profit * animal.pens;
    const plotCost = path.cost * animal.pens;
    const metrics = cycleMetrics(plotProfit, plotCost, hours);
    if (metrics.perDay == null) {
        return null;
    }
    const feedKey = feedCrop?.key ?? (animal.feedDiet === 'meat' ? 'meat' : 'x');
    const notes = [`yem pazar · ${feed.label}`];
    if (path.cityBonus) {
        notes.push('şehir +10%');
    }
    return {
        id: `${animal.id}-${path.id}-mkt-${feedKey}`,
        kind: animal.kind,
        plotType: animal.plotType,
        label: animal.label,
        pathLabel: path.label,
        item: animal,
        iconId: path.iconId,
        ...metrics,
        feedDemand: animal.pens * animal.feedQty,
        feedCrop: feedCrop ?? null,
        feedMode: 'market',
        feedLabel: feed.label,
        path,
        detail: notes.join(' · ')
    };
}

function animalMarketActivities(animal, ctx) {
    const feedCrops = animal.feedDiet === 'plants' && !animal.feedFixed
        ? CROPS
        : [resolveFeedCrop(animal, null)].filter(Boolean);

    if (animal.feedDiet === 'meat') {
        const feed = marketFeedUnit(animal, null, ctx);
        if (!feed) {
            return [];
        }
        const path = bestAnimalPath(animal, feed.unit, ctx);
        if (!path) {
            return [];
        }
        const act = animalActivityFromPath(animal, path, feed, null, ctx);
        return act ? [act] : [];
    }

    const out = [];
    const crops = feedCrops.length ? feedCrops : [null];
    for (const cropItem of crops) {
        const feed = marketFeedUnit(animal, cropItem, ctx);
        if (!feed) {
            continue;
        }
        const path = bestAnimalPath(animal, feed.unit, ctx);
        if (!path) {
            continue;
        }
        const act = animalActivityFromPath(animal, path, feed, feed.crop ?? cropItem, ctx);
        if (act) {
            out.push(act);
        }
    }

    if (!animal.feedFixed && out.length > 1) {
        out.sort((a, b) => b.perDay - a.perDay);
        return [out[0]];
    }
    return out;
}

function standaloneActivities(ctx) {
    const list = [];
    for (const plant of ALL_PLANTS) {
        const act = cropSellActivity(plant, ctx);
        if (act) {
            list.push(act);
        }
    }
    for (const animal of ALL_ANIMALS) {
        list.push(...animalMarketActivities(animal, ctx));
    }
    list.sort((a, b) => b.perDay - a.perDay);
    return list;
}

function slotFromActivity(activity, index, role = 'cash') {
    return {
        index,
        plotType: activity.plotType,
        label: activity.label,
        pathLabel: activity.pathLabel,
        perDay: activity.perDay,
        profit: activity.profit,
        cost: activity.cost,
        revenue: activity.revenue,
        profitPct: activity.profitPct,
        hours: activity.hours,
        iconId: activity.iconId,
        detail: activity.detail,
        activityId: activity.id,
        role
    };
}

function fillPlots(count, activity) {
    if (!activity || count <= 0) {
        return [];
    }
    return Array.from({ length: count }, (_, i) => slotFromActivity(activity, i + 1));
}

function bestStandaloneFill(n, activities, excludeIds = new Set()) {
    const usable = activities.filter((a) => !excludeIds.has(a.id) && Number.isFinite(a.perDay));
    if (!usable.length || n <= 0) {
        return { slots: [], total: 0, activity: null };
    }
    const best = usable[0];
    const slots = fillPlots(n, best).map((s, i) => ({ ...s, index: i + 1 }));
    return { slots, total: best.perDay * n, activity: best };
}

function farmSupplyPerCycle(feedCrop, animalAlbionHours, ctx) {
    const yieldPlot = plantPlotYield(feedCrop, ctx);
    return yieldPlot * (animalAlbionHours / CROP_HOURS);
}

function blendedAnimalPlotProfit(animal, pathId, islandUnit, marketUnit, islandShare, ctx) {
    if (!Number.isFinite(islandUnit) || !Number.isFinite(marketUnit)) {
        return null;
    }
    const share = Math.min(1, Math.max(0, islandShare));
    const unit = islandUnit * share + marketUnit * (1 - share);
    const paths = animalPathProfits(animal, unit, ctx);
    const path = paths.find((p) => p.id === pathId) ?? paths.sort((a, b) => b.profit - a.profit)[0];
    if (!path) {
        return null;
    }
    const plotProfit = path.profit * animal.pens;
    const plotCost = path.cost * animal.pens;
    const hours = metricsHours(animal.baseHours, ctx.premium);
    return {
        path,
        ...cycleMetrics(plotProfit, plotCost, hours),
        unit
    };
}

/**
 * Search island-feed plans for one animal activity + one feed crop.
 */
function searchIslandFeedPlan(animal, pathId, feedCrop, n, marketBaselinePerDay, ctx) {
    const albionHours = cycleHours(animal.baseHours, ctx.premium);
    const hours = planCycleHours(albionHours);
    const island = islandFeedUnit(feedCrop, ctx);
    const market = marketFeedUnit(animal, feedCrop, ctx);
    if (!island || !market || hours == null) {
        return null;
    }

    const sellQuote = quoteAt(ctx.priceIndex, feedCrop.plantId, ctx.sellCity, ctx.sellSide, 'sell');
    const sellUnit = sellQuote
        ? saleProceeds(sellQuote.price, { premium: ctx.premium, setup: sellQuote.setup })
        : null;

    const demandPerPlot = animal.pens * animal.feedQty;
    const supplyPerFarm = farmSupplyPerCycle(feedCrop, albionHours, ctx);
    if (!(supplyPerFarm > 0)) {
        return null;
    }

    const standalones = standaloneActivities(ctx).filter(
        (a) => !(a.kind === animal.kind && a.item?.id === animal.id)
    );

    let best = null;

    for (let a = 1; a <= n; a += 1) {
        for (let f = 0; f <= n - a; f += 1) {
            const demand = a * demandPerPlot;
            const supply = f * supplyPerFarm;
            const fromIsland = Math.min(demand, supply);
            const shortfall = demand - fromIsland;
            const surplus = supply - fromIsland;
            const islandShare = demand > 0 ? fromIsland / demand : 0;

            const blended = blendedAnimalPlotProfit(
                animal,
                pathId,
                island.unit,
                market.unit,
                islandShare,
                ctx
            );
            if (!blended) {
                continue;
            }

            let total = blended.profit * a;
            const animalDay = blended.perDay;

            let surplusDay = 0;
            let surplusProfitCycle = 0;
            if (surplus > 0 && sellUnit != null) {
                surplusProfitCycle = surplus * (sellUnit - island.unit);
                total += surplusProfitCycle;
                surplusDay = perDay(surplusProfitCycle, hours) ?? 0;
            }

            const rest = n - a - f;
            const fill = bestStandaloneFill(rest, standalones);
            total += (fill.total / PLAN_DAY_HOURS) * hours;

            const totalDay = perDay(total, hours);
            if (totalDay == null) {
                continue;
            }

            if (!best || totalDay > best.totalDay) {
                const slots = [];
                let idx = 1;
                for (let i = 0; i < a; i += 1) {
                    const feedNote = islandShare >= 0.999
                        ? `yem ada · ${feedCrop.label}`
                        : `yem karışık · ${feedCrop.label}`;
                    const notes = [feedNote];
                    if (blended.path.cityBonus) {
                        notes.push('şehir +10%');
                    }
                    if (island.bonus) {
                        notes.push('yem şehir +10%');
                    }
                    slots.push({
                        index: idx,
                        plotType: animal.plotType,
                        label: animal.label,
                        pathLabel: blended.path.label,
                        perDay: animalDay,
                        profit: blended.profit,
                        cost: blended.cost,
                        revenue: blended.revenue,
                        profitPct: blended.profitPct,
                        hours: blended.hours,
                        iconId: blended.path.iconId,
                        detail: notes.join(' · '),
                        activityId: `${animal.id}-${blended.path.id}-island`,
                        role: 'animal'
                    });
                    idx += 1;
                }
                const feedCostCycle = supplyPerFarm * island.unit;
                const feedMetrics = f > 0
                    ? cycleMetrics(surplusProfitCycle / f, feedCostCycle, hours)
                    : null;
                for (let i = 0; i < f; i += 1) {
                    slots.push({
                        index: idx,
                        plotType: 'farm',
                        label: feedCrop.label,
                        pathLabel: 'Yem',
                        perDay: feedMetrics?.perDay ?? (surplusDay / Math.max(f, 1)),
                        profit: feedMetrics?.profit ?? null,
                        cost: feedMetrics?.cost ?? null,
                        revenue: feedMetrics?.revenue ?? null,
                        profitPct: feedMetrics?.profitPct ?? null,
                        hours,
                        iconId: feedCrop.plantId,
                        detail: 'ada yemi (satılmaz / fazla satılır)',
                        activityId: `feed-${feedCrop.id}`,
                        role: 'feed'
                    });
                    idx += 1;
                }
                for (const s of fill.slots) {
                    slots.push({ ...s, index: idx });
                    idx += 1;
                }

                let feedNote;
                if (f === 0) {
                    feedNote = `Pazardan al: ${market.label}`;
                } else if (shortfall > 0.5) {
                    feedNote = `Adada ${f} Farm ${feedCrop.label} + pazardan tamamla → ${a} ${animal.plotType} ${animal.label} ${blended.path.label}`;
                } else {
                    feedNote = `Adada ${f} Farm ${feedCrop.label} → ${a} ${animal.plotType === 'kennel' ? 'Kennel' : 'Pasture'} ${animal.label} ${blended.path.label}`;
                }

                best = {
                    totalDay,
                    slots,
                    feedNote,
                    mode: f > 0 ? 'island-feed' : 'market',
                    vsMarket: totalDay - marketBaselinePerDay
                };
            }
        }
    }

    return best;
}

function plotTypeLabel(type) {
    switch (type) {
        case 'farm':
            return 'Farm';
        case 'herb':
            return 'Herb';
        case 'pasture':
            return 'Pasture';
        case 'kennel':
            return 'Kennel';
        default:
            return type;
    }
}

/**
 * @param {object} options
 * @param {number} options.plots
 * @param {boolean} options.premium
 * @param {boolean} options.water
 * @param {boolean} options.focus
 * @param {string} options.islandCity
 * @param {string} options.sellCity
 * @param {'buy'|'sell'} options.buySide
 * @param {'buy'|'sell'} options.sellSide
 * @param {object} options.priceIndex
 */
export function optimizeIsland(options) {
    const ctx = {
        premium: options.premium !== false,
        water: options.water === true,
        focus: options.focus === true,
        islandCity: options.islandCity,
        sellCity: options.sellCity,
        buySide: options.buySide === 'sell' ? 'sell' : 'buy',
        sellSide: options.sellSide === 'buy' ? 'buy' : 'sell',
        priceIndex: options.priceIndex
    };

    const n = Math.max(0, Math.min(16, Math.round(Number(options.plots) || 0)));
    if (n === 0 || !ctx.priceIndex) {
        return {
            slots: [],
            totalDay: 0,
            feedNote: '—',
            mode: 'empty',
            marketOnly: null,
            runnersUp: [],
            comparison: null,
            plotTypeLabel
        };
    }

    const activities = standaloneActivities(ctx);
    const marketFill = bestStandaloneFill(n, activities);
    const marketOnly = {
        totalDay: marketFill.total,
        slots: marketFill.slots,
        feedNote: marketFill.activity?.feedMode === 'market'
            ? `Pazardan al: ${marketFill.activity.feedLabel}`
            : (marketFill.activity ? 'Yem gerekmez (ekin/ot satışı)' : 'Uygun aday yok'),
        mode: 'market',
        activity: marketFill.activity
    };

    let best = {
        totalDay: marketOnly.totalDay,
        slots: marketOnly.slots,
        feedNote: marketOnly.feedNote,
        mode: marketOnly.mode,
        vsMarket: 0
    };

    for (const animal of ALL_ANIMALS) {
        if (animal.feedDiet === 'meat') {
            continue;
        }
        const feedCrops = animal.feedFixed
            ? [resolveFeedCrop(animal, null)].filter(Boolean)
            : CROPS;

        const marketFeed = marketFeedUnit(animal, feedCrops[0] ?? null, ctx);
        if (!marketFeed) {
            continue;
        }
        const path = bestAnimalPath(animal, marketFeed.unit, ctx);
        if (!path) {
            continue;
        }

        for (const feedCrop of feedCrops) {
            const plan = searchIslandFeedPlan(animal, path.id, feedCrop, n, marketOnly.totalDay, ctx);
            if (plan && plan.totalDay > best.totalDay) {
                best = plan;
            }
        }
    }

    const chosenIds = new Set(best.slots.map((s) => s.activityId).filter(Boolean));
    const runnersUp = activities
        .filter((a) => !chosenIds.has(a.id))
        .slice(0, 5)
        .map((a) => ({
            plotType: a.plotType,
            label: a.label,
            pathLabel: a.pathLabel,
            iconId: a.iconId,
            perDay: a.perDay,
            profit: a.profit,
            cost: a.cost,
            profitPct: a.profitPct,
            hours: a.hours,
            detail: a.detail
        }));

    return {
        ...best,
        marketOnly,
        runnersUp,
        comparison: {
            marketDay: marketOnly.totalDay,
            chosenDay: best.totalDay,
            delta: best.totalDay - marketOnly.totalDay,
            choseIslandFeed: best.mode === 'island-feed'
        },
        plotTypeLabel
    };
}

export { plotTypeLabel };
