/**
 * Island plot planner: crop / herb / pasture / kennel economics + opportunity-cost feed search.
 * Scoring: stable gümüş/gün (history median × liquidity × vol penalty); dual simple/chain plans.
 * Catalog: plants / animals / economyConstants / islandPlots (relational DB).
 */

import { purchaseCost, saleProceeds } from './market-fees.js';
import { quoteFromRow } from './price-side.js';
import { cityRow } from './market.js';
import { historyAt } from './market-history.js';
import {
    getPlants,
    getAnimals,
    getEconomyConstant,
    getIslandPlotsByLevel
} from './catalog.js';
import { effectivePlantYield, effectiveSeedReturn } from './island-yield-stats.js';

export function islandPlotsByLevel() {
    return getIslandPlotsByLevel();
}

/** @deprecated use islandPlotsByLevel() — kept as live object for planners */
export const ISLAND_PLOTS_BY_LEVEL = new Proxy({}, {
    get(_target, prop) {
        if (prop === Symbol.toStringTag) {
            return 'Object';
        }
        if (prop === 'then') {
            return undefined;
        }
        const map = getIslandPlotsByLevel();
        if (prop === Symbol.iterator) {
            return undefined;
        }
        if (typeof prop === 'string' && prop in Object.prototype) {
            return undefined;
        }
        return map[prop];
    },
    ownKeys() {
        return Object.keys(getIslandPlotsByLevel());
    },
    getOwnPropertyDescriptor(_target, prop) {
        const map = getIslandPlotsByLevel();
        if (Object.prototype.hasOwnProperty.call(map, prop)) {
            return { configurable: true, enumerable: true, value: map[prop] };
        }
        return undefined;
    }
});

export function plantSlots() {
    return getEconomyConstant('plant_slots', 9);
}

export function pasturePens() {
    return getEconomyConstant('pasture_pens', 9);
}

export function kennelPens() {
    return getEconomyConstant('kennel_pens', 4);
}

export function cropHours() {
    return getEconomyConstant('crop_hours', 22);
}

export function livestockHours() {
    return getEconomyConstant('livestock_hours', 44);
}

export function livestockFeed() {
    return getAnimals({ kind: 'livestock' })[0]?.feedQtyIsland ?? 18;
}

export function meatQtyConst() {
    return getEconomyConstant('meat_qty', 18);
}

export function productQtyConst() {
    return getEconomyConstant('product_qty', 18);
}

export function albionDayHours() {
    return getEconomyConstant('albion_day_hours', 22);
}

export function planDayHours() {
    return getEconomyConstant('plan_day_hours', 24);
}

export const PLANT_SLOTS = 9;
export const PASTURE_PENS = 9;
export const KENNEL_PENS = 4;
export const CROP_HOURS = 22;
export const LIVESTOCK_HOURS = 44;
export const LIVESTOCK_FEED = 18;
export const MEAT_QTY = 18;
export const PRODUCT_QTY = 18;
export const ALBION_DAY_HOURS = 22;
export const PLAN_DAY_HOURS = 24;

export function planCycleHours(albionHours) {
    if (!Number.isFinite(albionHours) || albionHours <= 0) {
        return null;
    }
    const dayAlbion = albionDayHours();
    const dayPlan = planDayHours();
    const raw = (albionHours / dayAlbion) * dayPlan;
    const days = Math.max(1, Math.ceil(raw / dayPlan - 1e-9));
    return days * dayPlan;
}

function cityYieldBonus() {
    return getEconomyConstant('city_yield_bonus', 0.1);
}

function islandAnimal(row) {
    return {
        ...row,
        feedQty: row.feedQtyIsland
    };
}

export function listCrops() {
    return getPlants({ kind: 'crop' });
}

export function listHerbs() {
    return getPlants({ kind: 'herb' });
}

export function listLivestock() {
    return getAnimals({ kind: 'livestock' }).map(islandAnimal);
}

export function listPastureMounts() {
    return getAnimals({ kind: 'mount', plotType: 'pasture' }).map(islandAnimal);
}

export function listKennelMounts() {
    return getAnimals({ kind: 'mount', plotType: 'kennel' }).map(islandAnimal);
}

export function listFactionMounts() {
    return getAnimals({ kind: 'faction-mount' }).map(islandAnimal);
}

export function listAllAnimals() {
    return getAnimals().map(islandAnimal);
}

export function listAllPlants() {
    return getPlants();
}

export const CROPS = listCrops;
export const HERBS = listHerbs;
export const LIVESTOCK = listLivestock;
export const PASTURE_MOUNTS = listPastureMounts;
export const KENNEL_MOUNTS = listKennelMounts;
export const ALL_ANIMALS = listAllAnimals;
export const ALL_PLANTS = listAllPlants;

export function plotsForLevel(level) {
    const map = islandPlotsByLevel();
    const n = map[level];
    return Number.isFinite(n) ? n : map[6];
}

export function factionMountForCity(city, tier = 5) {
    const t = Number(tier) || 5;
    return listFactionMounts().find((animal) => animal.factionCity === city && animal.tier === t) ?? null;
}

export function allPriceItemIds() {
    const ids = new Set();
    for (const item of listAllPlants()) {
        ids.add(item.seedId);
        ids.add(item.plantId);
    }
    for (const item of listAllAnimals()) {
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

function babyChance(item, focused) {
    return focused ? item.seedReturn + item.waterBonus : item.seedReturn;
}

function cycleHours(baseHours, premium) {
    return premium ? baseHours / 2 : baseHours;
}

function metricsHours(baseHours, premium) {
    return planCycleHours(cycleHours(baseHours, premium));
}

function perDay(profit, hours) {
    if (!Number.isFinite(profit) || !Number.isFinite(hours) || hours <= 0) {
        return null;
    }
    return (profit / hours) * planDayHours();
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

/** Buy: max(spot, median) so costs are not understated. */
function buyQuote(itemId, city, ctx) {
    const spot = quoteAt(ctx.priceIndex, itemId, city, ctx.buySide, 'buy');
    if (!spot) {
        return null;
    }
    const hist = historyAt(ctx.historyIndex, itemId, city);
    const median = hist?.medianAvgPrice;
    if (Number.isFinite(median) && median > 0) {
        return { ...spot, price: Math.max(spot.price, median), history: hist };
    }
    return { ...spot, history: hist };
}

/** Sell: median when available, else spot. */
function sellQuote(itemId, city, ctx) {
    const spot = quoteAt(ctx.priceIndex, itemId, city, ctx.sellSide, 'sell');
    const hist = historyAt(ctx.historyIndex, itemId, city);
    const median = hist?.medianAvgPrice;
    if (Number.isFinite(median) && median > 0) {
        return {
            price: median,
            setup: spot?.setup ?? true,
            date: spot?.date ?? null,
            stale: spot?.stale ?? false,
            history: hist,
            spotPrice: spot?.price ?? null
        };
    }
    return spot ? { ...spot, history: hist } : null;
}

function spotBuyQuote(itemId, city, ctx) {
    return quoteAt(ctx.priceIndex, itemId, city, ctx.buySide, 'buy');
}

function spotSellQuote(itemId, city, ctx) {
    return quoteAt(ctx.priceIndex, itemId, city, ctx.sellSide, 'sell');
}

function stabilityFactors(sellItemId, sellCity, ctx) {
    const hist = historyAt(ctx.historyIndex, sellItemId, sellCity);
    const target = Number(ctx.targetVolume) || getEconomyConstant('farm_target_volume', 40);
    const k = Number(ctx.volK) || getEconomyConstant('farm_vol_penalty_k', 1.5);
    const minVolume = Number(ctx.minVolume) || 0;

    if (!hist) {
        return { liquidity: 1, volPenalty: 1, lowLiquidity: false, rejected: false, hist: null };
    }
    if (minVolume > 0 && (hist.avgItemCount || 0) < minVolume) {
        return { liquidity: 0, volPenalty: 0, lowLiquidity: true, rejected: true, hist };
    }
    const liquidity = Math.min(1, Math.max(0, (hist.avgItemCount || 0) / Math.max(1, target)));
    const volPenalty = 1 / (1 + k * (hist.cv || 0));
    return {
        liquidity,
        volPenalty,
        lowLiquidity: liquidity < 0.35,
        rejected: false,
        hist
    };
}

function withStability(metrics, sellItemId, sellCity, ctx, spotPerDay = null) {
    if (!metrics || metrics.perDay == null) {
        return null;
    }
    const factors = stabilityFactors(sellItemId, sellCity, ctx);
    if (factors.rejected) {
        return null;
    }
    const stablePerDay = metrics.perDay * factors.liquidity * factors.volPenalty;
    return {
        ...metrics,
        rawPerDay: metrics.perDay,
        perDay: stablePerDay,
        spotPerDay: spotPerDay ?? metrics.perDay,
        liquidity: factors.liquidity,
        volPenalty: factors.volPenalty,
        lowLiquidity: factors.lowLiquidity,
        historyN: factors.hist?.n ?? 0,
        avgItemCount: factors.hist?.avgItemCount ?? null
    };
}

function plantGrowUnitCost(plant, ctx, { spot = false } = {}) {
    const seed = spot
        ? spotBuyQuote(plant.seedId, ctx.islandCity, ctx)
        : buyQuote(plant.seedId, ctx.islandCity, ctx);
    if (!seed) {
        return null;
    }
    const yieldInfo = effectivePlantYield(plant, ctx.islandCity, {
        premium: ctx.premium,
        water: ctx.water
    });
    const seedInfo = effectiveSeedReturn(plant, ctx.islandCity, {
        premium: ctx.premium,
        water: ctx.water
    });
    const qty = yieldInfo.qty;
    const usedReturn = seedInfo.rate;
    const netSeed = purchaseCost(seed.price * (1 - usedReturn), { setup: seed.setup });
    if (!(qty > 0) || !Number.isFinite(netSeed)) {
        return null;
    }
    return {
        unit: netSeed / qty,
        seed,
        qty,
        usedReturn,
        bonus: yieldInfo.bonus,
        yieldSource: yieldInfo.source,
        yieldN: yieldInfo.n,
        seedSource: seedInfo.source
    };
}

function plantPlotYield(plant, ctx) {
    const yieldInfo = effectivePlantYield(plant, ctx.islandCity, {
        premium: ctx.premium,
        water: ctx.water
    });
    return plantSlots() * yieldInfo.qty;
}

function cropSellActivity(plant, ctx) {
    const grow = plantGrowUnitCost(plant, ctx);
    const sell = sellQuote(plant.plantId, ctx.sellCity, ctx);
    if (!grow || !sell) {
        return null;
    }
    const yieldPlot = plantPlotYield(plant, ctx);
    const seedCost = grow.unit * yieldPlot;
    const revenue = saleProceeds(sell.price, { premium: ctx.premium, setup: sell.setup }) * yieldPlot;
    const profit = revenue - seedCost;
    const hours = planCycleHours(cropHours());
    const metrics = cycleMetrics(profit, seedCost, hours);

    const spotGrow = plantGrowUnitCost(plant, ctx, { spot: true });
    const spotSell = spotSellQuote(plant.plantId, ctx.sellCity, ctx);
    let spotPerDay = null;
    if (spotGrow && spotSell) {
        const spotCost = spotGrow.unit * yieldPlot;
        const spotRev = saleProceeds(spotSell.price, { premium: ctx.premium, setup: spotSell.setup }) * yieldPlot;
        spotPerDay = cycleMetrics(spotRev - spotCost, spotCost, hours).perDay;
    }

    const scored = withStability(metrics, plant.plantId, ctx.sellCity, ctx, spotPerDay);
    if (!scored) {
        return null;
    }

    const notes = [];
    if (grow.bonus) {
        notes.push('şehir +10%');
    }
    if (grow.yieldSource === 'user') {
        notes.push(`ada ort. n=${grow.yieldN}`);
    }

    return {
        id: `sell-${plant.id}`,
        kind: plant.kind,
        plotType: plant.plotType,
        label: plant.label,
        pathLabel: 'Sat',
        item: plant,
        iconId: plant.plantId,
        sellItemId: plant.plantId,
        ...scored,
        feedDemand: 0,
        feedCrop: null,
        detail: notes.length ? notes.join(' · ') : null
    };
}

function resolveFeedCrop(animal, feedCropOverride) {
    if (animal.feedFixed && animal.feedKey) {
        return listCrops().find((crop) => crop.key === animal.feedKey) ?? null;
    }
    return feedCropOverride ?? null;
}

function marketFeedUnit(animal, feedCrop, ctx, { spot = false } = {}) {
    const buy = spot ? spotBuyQuote : buyQuote;
    if (animal.feedDiet === 'meat') {
        const meatId = `T${animal.tier}_MEAT`;
        const q = buy(meatId, ctx.islandCity, ctx);
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
    const q = buy(plant.plantId, ctx.islandCity, ctx);
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
        bonus: grow.bonus,
        yieldSource: grow.yieldSource,
        yieldN: grow.yieldN
    };
}

function hasAnimalCityBonus(animal, city) {
    return hasBonus(animal.bonusCities, city);
}

function butcherQty(animal, ctx) {
    const base = meatQtyConst();
    return hasAnimalCityBonus(animal, ctx.islandCity) ? base * (1 + cityYieldBonus()) : base;
}

function productQty(animal, ctx) {
    const base = productQtyConst();
    return hasAnimalCityBonus(animal, ctx.islandCity) ? base * (1 + cityYieldBonus()) : base;
}

function animalPathProfits(animal, feedUnit, ctx, { spot = false } = {}) {
    const buy = spot ? spotBuyQuote : buyQuote;
    const sell = spot ? spotSellQuote : sellQuote;
    const baby = buy(animal.babyId, ctx.islandCity, ctx);
    const grown = sell(animal.grownId, ctx.sellCity, ctx);
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
            sellItemId: animal.grownId,
            cityBonus: false
        });
    }

    if (animal.meatId) {
        const meat = sell(animal.meatId, ctx.sellCity, ctx);
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
                sellItemId: animal.meatId,
                cityBonus
            });
        }
    }

    if (animal.productId) {
        const product = sell(animal.productId, ctx.sellCity, ctx);
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
                sellItemId: animal.productId,
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

    const spotFeed = marketFeedUnit(animal, feedCrop, ctx, { spot: true });
    let spotPerDay = null;
    if (spotFeed) {
        const spotPaths = animalPathProfits(animal, spotFeed.unit, ctx, { spot: true });
        const spotPath = spotPaths.find((p) => p.id === path.id) ?? spotPaths[0];
        if (spotPath) {
            spotPerDay = cycleMetrics(spotPath.profit * animal.pens, spotPath.cost * animal.pens, hours).perDay;
        }
    }

    const scored = withStability(metrics, path.sellItemId, ctx.sellCity, ctx, spotPerDay);
    if (!scored) {
        return null;
    }

    const feedKey = feedCrop?.key ?? (animal.feedDiet === 'meat' ? 'meat' : 'x');
    const notes = [`yem pazar · ${feed.label}`];
    if (path.cityBonus) {
        notes.push('şehir +10%');
    }
    if (scored.lowLiquidity) {
        notes.push('satış zor');
    }
    return {
        id: `${animal.id}-${path.id}-mkt-${feedKey}`,
        kind: animal.kind,
        plotType: animal.plotType,
        label: animal.label,
        pathLabel: path.label,
        item: animal,
        iconId: path.iconId,
        sellItemId: path.sellItemId,
        ...scored,
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
        ? listCrops()
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
    for (const plant of listAllPlants()) {
        const act = cropSellActivity(plant, ctx);
        if (act) {
            list.push(act);
        }
    }
    for (const animal of listAllAnimals()) {
        if (animal.kind === 'faction-mount' && animal.factionCity && animal.factionCity !== ctx.islandCity) {
            continue;
        }
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
        spotPerDay: activity.spotPerDay ?? null,
        profit: activity.profit,
        cost: activity.cost,
        revenue: activity.revenue,
        profitPct: activity.profitPct,
        hours: activity.hours,
        iconId: activity.iconId,
        detail: activity.detail,
        activityId: activity.id,
        lowLiquidity: activity.lowLiquidity === true,
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
    return yieldPlot * (animalAlbionHours / cropHours());
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
    const metrics = cycleMetrics(plotProfit, plotCost, hours);
    const scored = withStability(metrics, path.sellItemId, ctx.sellCity, ctx);
    if (!scored) {
        return null;
    }
    return {
        path,
        ...scored,
        unit
    };
}

/**
 * Search island-feed plans for one animal activity + one feed crop.
 * @param {{ fixedAnimalPlots?: number|null }} opts
 */
function searchIslandFeedPlan(animal, pathId, feedCrop, n, marketBaselinePerDay, ctx, opts = {}) {
    const albionHours = cycleHours(animal.baseHours, ctx.premium);
    const hours = planCycleHours(albionHours);
    const island = islandFeedUnit(feedCrop, ctx);
    const market = marketFeedUnit(animal, feedCrop, ctx);
    if (!island || !market || hours == null) {
        return null;
    }

    const sellQ = sellQuote(feedCrop.plantId, ctx.sellCity, ctx);
    const sellUnit = sellQ
        ? saleProceeds(sellQ.price, { premium: ctx.premium, setup: sellQ.setup })
        : null;

    const demandPerPlot = animal.pens * animal.feedQty;
    const supplyPerFarm = farmSupplyPerCycle(feedCrop, albionHours, ctx);
    if (!(supplyPerFarm > 0)) {
        return null;
    }

    const standalones = standaloneActivities(ctx).filter(
        (a) => !(a.item?.id === animal.id)
    );

    const fixedA = opts.fixedAnimalPlots != null ? Math.round(Number(opts.fixedAnimalPlots)) : null;
    const aStart = fixedA != null ? fixedA : 1;
    const aEnd = fixedA != null ? fixedA : n;
    if (aStart < 1 || aStart > n) {
        return null;
    }

    let best = null;

    for (let a = aStart; a <= aEnd; a += 1) {
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
            total += (fill.total / planDayHours()) * hours;

            const totalDay = perDay(total, hours);
            if (totalDay == null) {
                continue;
            }

            // Re-score totalDay using animal stability already in blended.perDay:
            // fill.total is already stable; surplusDay is raw — apply mild liquidity of feed crop
            const feedStab = stabilityFactors(feedCrop.plantId, ctx.sellCity, ctx);
            const adjustedSurplusDay = surplusDay * feedStab.liquidity * feedStab.volPenalty;
            const stableTotalDay = (animalDay * a)
                + (f > 0 ? adjustedSurplusDay : 0)
                + fill.total;

            if (!best || stableTotalDay > best.totalDay) {
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
                    if (island.yieldSource === 'user') {
                        notes.push(`yem ada ort. n=${island.yieldN}`);
                    }
                    if (blended.lowLiquidity) {
                        notes.push('satış zor');
                    }
                    slots.push({
                        index: idx,
                        plotType: animal.plotType,
                        label: animal.label,
                        pathLabel: blended.path.label,
                        perDay: animalDay,
                        spotPerDay: blended.spotPerDay ?? null,
                        profit: blended.profit,
                        cost: blended.cost,
                        revenue: blended.revenue,
                        profitPct: blended.profitPct,
                        hours: blended.hours,
                        iconId: blended.path.iconId,
                        detail: notes.join(' · '),
                        activityId: `${animal.id}-${blended.path.id}-island`,
                        lowLiquidity: blended.lowLiquidity === true,
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
                        perDay: feedMetrics?.perDay != null
                            ? feedMetrics.perDay * feedStab.liquidity * feedStab.volPenalty
                            : (adjustedSurplusDay / Math.max(f, 1)),
                        spotPerDay: feedMetrics?.perDay ?? null,
                        profit: feedMetrics?.profit ?? null,
                        cost: feedMetrics?.cost ?? null,
                        revenue: feedMetrics?.revenue ?? null,
                        profitPct: feedMetrics?.profitPct ?? null,
                        hours,
                        iconId: feedCrop.plantId,
                        detail: island.yieldSource === 'user'
                            ? `ada yemi · ort. n=${island.yieldN}`
                            : 'ada yemi (satılmaz / fazla satılır)',
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
                    totalDay: stableTotalDay,
                    slots,
                    feedNote,
                    mode: f > 0 ? 'island-feed' : 'market',
                    vsMarket: stableTotalDay - marketBaselinePerDay,
                    animalKey: animal.key
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

function buildCtx(options) {
    return {
        premium: options.premium !== false,
        water: options.water === true,
        focus: options.focus === true,
        islandCity: options.islandCity,
        sellCity: options.sellCity,
        buySide: options.buySide === 'sell' ? 'sell' : 'buy',
        sellSide: options.sellSide === 'buy' ? 'buy' : 'sell',
        priceIndex: options.priceIndex,
        historyIndex: options.historyIndex || null,
        minVolume: Number(options.minVolume) || 0,
        targetVolume: Number(options.targetVolume) || getEconomyConstant('farm_target_volume', 40),
        volK: Number(options.volK) || getEconomyConstant('farm_vol_penalty_k', 1.5)
    };
}

function emptyResult() {
    return {
        slots: [],
        totalDay: 0,
        feedNote: '—',
        mode: 'empty',
        recommended: 'simple',
        simple: null,
        chain: null,
        marketOnly: null,
        runnersUp: [],
        comparison: null,
        cityCompare: [],
        plotTypeLabel
    };
}

function planPackage(plan, label) {
    if (!plan) {
        return null;
    }
    return {
        label,
        totalDay: plan.totalDay,
        slots: plan.slots,
        feedNote: plan.feedNote,
        mode: plan.mode,
        animalKey: plan.animalKey || null
    };
}

function bestChainPlan(n, marketBaseline, ctx, { onlyAnimal = null, fixedAnimalPlots = null } = {}) {
    let best = null;
    const animals = onlyAnimal ? [onlyAnimal] : listAllAnimals();

    for (const animal of animals) {
        if (animal.feedDiet === 'meat') {
            continue;
        }
        if (animal.kind === 'faction-mount' && animal.factionCity && animal.factionCity !== ctx.islandCity) {
            continue;
        }
        const feedCrops = animal.feedFixed
            ? [resolveFeedCrop(animal, null)].filter(Boolean)
            : listCrops();

        const marketFeed = marketFeedUnit(animal, feedCrops[0] ?? null, ctx);
        if (!marketFeed) {
            continue;
        }
        const path = bestAnimalPath(animal, marketFeed.unit, ctx);
        if (!path) {
            continue;
        }

        for (const feedCrop of feedCrops) {
            const plan = searchIslandFeedPlan(
                animal,
                path.id,
                feedCrop,
                n,
                marketBaseline,
                ctx,
                { fixedAnimalPlots }
            );
            if (plan && (!best || plan.totalDay > best.totalDay)) {
                best = plan;
            }
        }
    }
    return best;
}

function simpleFactionPlan(n, factionAnimal, activities, ctx) {
    const locked = Math.min(n, Math.max(0, Math.round(Number(ctx.factionPlots) || 0)));
    if (!factionAnimal || locked <= 0) {
        return null;
    }
    const feedCrops = listCrops();
    let bestAct = null;
    for (const crop of feedCrops) {
        const feed = marketFeedUnit(factionAnimal, crop, ctx);
        if (!feed) {
            continue;
        }
        const path = bestAnimalPath(factionAnimal, feed.unit, ctx);
        if (!path) {
            continue;
        }
        const act = animalActivityFromPath(factionAnimal, path, feed, crop, ctx);
        if (act && (!bestAct || act.perDay > bestAct.perDay)) {
            bestAct = act;
        }
    }
    if (!bestAct) {
        const feed = marketFeedUnit(factionAnimal, null, ctx);
        if (feed) {
            const path = bestAnimalPath(factionAnimal, feed.unit, ctx);
            if (path) {
                bestAct = animalActivityFromPath(factionAnimal, path, feed, feed.crop ?? null, ctx);
            }
        }
    }
    if (!bestAct) {
        return null;
    }

    const rest = n - locked;
    const fill = bestStandaloneFill(rest, activities.filter((a) => a.item?.id !== factionAnimal.id));
    const slots = [
        ...fillPlots(locked, bestAct),
        ...fill.slots.map((s, i) => ({ ...s, index: locked + i + 1 }))
    ].map((s, i) => ({ ...s, index: i + 1, role: i < locked ? 'animal' : s.role }));

    return {
        totalDay: bestAct.perDay * locked + fill.total,
        slots,
        feedNote: `Faction ${locked}× kennel · ${bestAct.feedLabel ? `yem pazar · ${bestAct.feedLabel}` : 'yem pazar'}`,
        mode: 'faction-simple',
        animalKey: factionAnimal.key
    };
}

/**
 * @param {object} options
 */
export function optimizeIsland(options) {
    const ctx = buildCtx(options);
    ctx.factionPlots = Math.max(0, Math.round(Number(options.factionPlots) || 0));
    ctx.factionTier = Number(options.factionTier) === 8 ? 8 : 5;

    const n = Math.max(0, Math.min(16, Math.round(Number(options.plots) || 0)));
    if (n === 0 || !ctx.priceIndex) {
        return emptyResult();
    }

    const activities = standaloneActivities(ctx);
    const chainBias = getEconomyConstant('island_chain_bias', 1.15);
    const factionAnimal = ctx.factionPlots > 0
        ? factionMountForCity(ctx.islandCity, ctx.factionTier)
        : null;

    let simple;
    let chain;

    if (factionAnimal && ctx.factionPlots > 0) {
        const locked = Math.min(n, ctx.factionPlots);
        simple = simpleFactionPlan(n, factionAnimal, activities, ctx)
            || bestStandaloneFill(n, activities);
        if (simple && !simple.mode) {
            simple = {
                totalDay: simple.total,
                slots: simple.slots,
                feedNote: simple.activity?.feedMode === 'market'
                    ? `Pazardan al: ${simple.activity.feedLabel}`
                    : (simple.activity ? 'Yem gerekmez (ekin/ot satışı)' : 'Uygun aday yok'),
                mode: 'market'
            };
        }
        chain = bestChainPlan(n, simple?.totalDay ?? 0, ctx, {
            onlyAnimal: factionAnimal,
            fixedAnimalPlots: locked
        });
    } else {
        const marketFill = bestStandaloneFill(n, activities);
        simple = {
            totalDay: marketFill.total,
            slots: marketFill.slots,
            feedNote: marketFill.activity?.feedMode === 'market'
                ? `Pazardan al: ${marketFill.activity.feedLabel}`
                : (marketFill.activity ? 'Yem gerekmez (ekin/ot satışı)' : 'Uygun aday yok'),
            mode: 'market',
            activity: marketFill.activity
        };
        chain = bestChainPlan(n, simple.totalDay, ctx);
    }

    const simplePkg = planPackage(simple, 'Sade');
    const chainPkg = planPackage(chain, 'Zincir');

    let recommended = 'simple';
    let best = simple;
    if (chain && simple && chain.totalDay > simple.totalDay * chainBias) {
        recommended = 'chain';
        best = chain;
    } else if (chain && (!simple || chain.totalDay > (simple.totalDay || 0))) {
        // Chain better but under bias — still keep simple as recommended
        recommended = 'simple';
        best = simple;
    } else if (!simple && chain) {
        recommended = 'chain';
        best = chain;
    }

    const marketOnly = simplePkg;

    const chosenIds = new Set((best?.slots || []).map((s) => s.activityId).filter(Boolean));
    const runnersUp = activities
        .filter((a) => !chosenIds.has(a.id))
        .slice(0, 5)
        .map((a) => ({
            plotType: a.plotType,
            label: a.label,
            pathLabel: a.pathLabel,
            iconId: a.iconId,
            perDay: a.perDay,
            spotPerDay: a.spotPerDay ?? null,
            profit: a.profit,
            cost: a.cost,
            profitPct: a.profitPct,
            hours: a.hours,
            detail: a.detail,
            lowLiquidity: a.lowLiquidity === true
        }));

    return {
        ...best,
        recommended,
        simple: simplePkg,
        chain: chainPkg,
        marketOnly,
        runnersUp,
        comparison: {
            marketDay: simplePkg?.totalDay ?? 0,
            chosenDay: best?.totalDay ?? 0,
            delta: (best?.totalDay ?? 0) - (simplePkg?.totalDay ?? 0),
            choseIslandFeed: best?.mode === 'island-feed',
            chainBias,
            recommended
        },
        faction: factionAnimal
            ? { key: factionAnimal.key, label: factionAnimal.label, plots: ctx.factionPlots, tier: ctx.factionTier }
            : null,
        cityCompare: [],
        plotTypeLabel
    };
}

/**
 * Lightweight per-city comparison for island cities.
 */
export function compareIslandCities(options, cities) {
    const list = (cities || []).filter(Boolean);
    const out = [];
    for (const city of list) {
        const plan = optimizeIsland({
            ...options,
            islandCity: city,
            sellCity: options.sellCity || city,
            // city compare: no faction lock unless this is the selected city with lock
            factionPlots: city === options.islandCity ? options.factionPlots : 0
        });
        const main = plan.slots?.[0];
        out.push({
            city,
            totalDay: plan.totalDay,
            recommended: plan.recommended,
            label: main?.label || '—',
            pathLabel: main?.pathLabel || '',
            mode: plan.mode,
            iconId: main?.iconId || null
        });
    }
    out.sort((a, b) => (b.totalDay || 0) - (a.totalDay || 0));
    return out;
}

export { plotTypeLabel };
