/**
 * Island plot planner: crop / herb / pasture / kennel economics + island-feed mix search.
 * Primary score: raw silver/day (time-normalized profit). Liquidity / vol are labels only.
 * Catalog: plants / animals / economyConstants / islandPlots (relational DB).
 */

import { purchaseCost, saleProceeds, salesTaxRate } from './market-fees.js';
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

export function livestockFeedPasture() {
    return getAnimals({ kind: 'livestock' })[0]?.feedQtyPasture ?? 9;
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

export const PRICE_BASIS = {
    buy: 'Alış: max(spot, tarih medyanı) — maliyetin düşük görünmemesi için',
    sell: 'Satış: tarih medyanı (yoksa spot)'
};

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

function historyDays() {
    return getEconomyConstant('farm_history_days', 14);
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

function priceBasisNotes() {
    return [
        PRICE_BASIS.buy,
        PRICE_BASIS.sell,
        `Medyan penceresi ~${historyDays()}g (AODP)`
    ];
}

function feedQtyDiffNote(animal) {
    const island = Number(animal?.feedQtyIsland);
    const pasture = Number(animal?.feedQtyPasture);
    if (Number.isFinite(island) && Number.isFinite(pasture) && island !== pasture) {
        return `Ada yemi ×${island} (Pasture aracı ×${pasture})`;
    }
    if (Number.isFinite(island)) {
        return `Ada yemi ×${island}`;
    }
    return null;
}

function pathRankNote(best, bestPct) {
    if (!best || !bestPct || best.id === bestPct.id) {
        return 'Path = ham gümüş (aynı döngüde mutlak kâr). Pasture “en iyi” işareti kâr % kullanır.';
    }
    return `Path ham gümüşe göre ${best.label}; Pasture kâr % ile ${bestPct.label} işaretler.`;
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
        return { ...spot, price: Math.max(spot.price, median), history: hist, usedMedian: median > spot.price };
    }
    return { ...spot, history: hist, usedMedian: false };
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
            spotPrice: spot?.price ?? null,
            usedMedian: true
        };
    }
    return spot ? { ...spot, history: hist, usedMedian: false } : null;
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
    const avgItemCount = hist?.avgItemCount ?? null;

    if (!hist) {
        return {
            liquidity: 1,
            volPenalty: 1,
            lowLiquidity: false,
            thinMarket: minVolume > 0,
            hist: null,
            avgItemCount: null
        };
    }
    const liquidity = Math.min(1, Math.max(0, (hist.avgItemCount || 0) / Math.max(1, target)));
    const volPenalty = 1 / (1 + k * (hist.cv || 0));
    return {
        liquidity,
        volPenalty,
        lowLiquidity: liquidity < 0.35,
        thinMarket: minVolume > 0 && (avgItemCount == null || avgItemCount < minVolume),
        hist,
        avgItemCount
    };
}

/** Attach stability labels. Never reject or replace raw perDay. */
function withStability(metrics, sellItemId, sellCity, ctx, spotPerDay = null) {
    if (!metrics || metrics.perDay == null) {
        return null;
    }
    const factors = stabilityFactors(sellItemId, sellCity, ctx);
    const stablePerDay = metrics.perDay * factors.liquidity * factors.volPenalty;
    return {
        ...metrics,
        rawPerDay: metrics.perDay,
        perDay: metrics.perDay,
        stablePerDay,
        spotPerDay: spotPerDay ?? metrics.perDay,
        liquidity: factors.liquidity,
        volPenalty: factors.volPenalty,
        lowLiquidity: factors.lowLiquidity,
        thinMarket: factors.thinMarket === true,
        historyN: factors.hist?.n ?? 0,
        avgItemCount: factors.avgItemCount
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
        netSeed,
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

function stabilityExplain(scored) {
    return {
        liquidity: scored.liquidity ?? null,
        volPenalty: scored.volPenalty ?? null,
        stablePerDay: scored.stablePerDay ?? null,
        rawPerDay: scored.rawPerDay ?? scored.perDay ?? null,
        avgItemCount: scored.avgItemCount ?? null,
        historyN: scored.historyN ?? 0,
        lowLiquidity: scored.lowLiquidity === true,
        thinMarket: scored.thinMarket === true
    };
}

function plantExplain(plant, grow, sell, scored, ctx, { role = 'cash', pathLabel = 'Sat' } = {}) {
    const yieldPlot = plantPlotYield(plant, ctx);
    const tax = salesTaxRate(ctx.premium);
    const netUnit = sell
        ? saleProceeds(sell.price, { premium: ctx.premium, setup: sell.setup })
        : null;
    return {
        kind: 'plant',
        role,
        title: `${plant.label} · ${pathLabel}`,
        iconId: plant.plantId,
        pathLabel,
        priceBasis: PRICE_BASIS,
        diffs: [
            'Birim maliyet Farming ile aynı formül: net tohum / verim.',
            ...priceBasisNotes(),
            'Farming birim maliyete göre yetiştir/al sıralar; planlayıcı hasadı satıp ham gümüş/gün bakır.'
        ],
        chips: [
            grow.bonus ? { label: 'şehir', value: cityYieldBonus(), kind: 'pct', tone: 'city' } : null,
            grow.yieldSource === 'user' ? { label: 'ada ort.', value: grow.yieldN, kind: 'qty', tone: 'bonus' } : null,
            ctx.water ? { label: 'sulama', value: grow.usedReturn, kind: 'pct', tone: 'rr' } : null
        ].filter(Boolean),
        inputs: {
            seedId: plant.seedId,
            seedPrice: grow.seed?.price ?? null,
            seedSetup: grow.seed?.setup === true,
            usedReturn: grow.usedReturn,
            harvestQty: grow.qty,
            slots: plantSlots(),
            yieldPlot,
            yieldSource: grow.yieldSource,
            yieldN: grow.yieldN
        },
        costs: {
            netSeed: grow.netSeed ?? null,
            unit: grow.unit,
            plotCost: scored.cost
        },
        sale: {
            itemId: plant.plantId,
            price: sell?.price ?? null,
            setup: sell?.setup === true,
            tax,
            netUnit,
            qty: yieldPlot,
            babyCredit: 0,
            revenue: scored.revenue,
            usedMedian: sell?.usedMedian === true
        },
        cycle: {
            profit: scored.profit,
            cost: scored.cost,
            revenue: scored.revenue,
            profitPct: scored.profitPct,
            hours: scored.hours,
            rawPerDay: scored.rawPerDay ?? scored.perDay,
            pens: plantSlots()
        },
        stability: stabilityExplain(scored),
        notes: []
    };
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
    if (scored.thinMarket) {
        notes.push('ince pazar');
    } else if (scored.lowLiquidity) {
        notes.push('satış zor');
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
        detail: notes.length ? notes.join(' · ') : null,
        explain: plantExplain(plant, grow, sell, scored, ctx)
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
        netSeed: grow.netSeed,
        usedReturn: grow.usedReturn,
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
    const tax = salesTaxRate(ctx.premium);
    const paths = [];

    if (grown) {
        const netUnit = saleProceeds(grown.price, { premium: ctx.premium, setup: grown.setup });
        const rev = netUnit + babyCredit;
        paths.push({
            id: 'grow',
            label: 'Büyüt',
            profit: rev - growCost,
            cost: growCost,
            revenue: rev,
            profitPct: growCost > 0 ? (rev - growCost) / growCost : null,
            iconId: animal.grownId,
            sellItemId: animal.grownId,
            cityBonus: false,
            sellPrice: grown.price,
            sellSetup: grown.setup === true,
            sellQty: 1,
            netUnit,
            tax,
            babyCredit,
            babyPrice: baby.price,
            babyNet,
            babySetup: baby.setup === true,
            chance,
            feedCost,
            feedUnit,
            feedQty: animal.feedQty
        });
    }

    if (animal.meatId) {
        const meat = sell(animal.meatId, ctx.sellCity, ctx);
        if (meat) {
            const qty = butcherQty(animal, ctx);
            const netUnit = saleProceeds(meat.price, { premium: ctx.premium, setup: meat.setup });
            const rev = netUnit * qty + babyCredit;
            paths.push({
                id: 'butcher',
                label: 'Kes',
                profit: rev - growCost,
                cost: growCost,
                revenue: rev,
                profitPct: growCost > 0 ? (rev - growCost) / growCost : null,
                iconId: animal.meatId,
                sellItemId: animal.meatId,
                cityBonus,
                sellPrice: meat.price,
                sellSetup: meat.setup === true,
                sellQty: qty,
                netUnit,
                tax,
                babyCredit,
                babyPrice: baby.price,
                babyNet,
                babySetup: baby.setup === true,
                chance,
                feedCost,
                feedUnit,
                feedQty: animal.feedQty
            });
        }
    }

    if (animal.productId) {
        const product = sell(animal.productId, ctx.sellCity, ctx);
        if (product) {
            const onlyFeed = feedCost;
            const qty = productQty(animal, ctx);
            const netUnit = saleProceeds(product.price, { premium: ctx.premium, setup: product.setup });
            const rev = netUnit * qty;
            paths.push({
                id: 'feed',
                label: 'Besle',
                profit: rev - onlyFeed,
                cost: onlyFeed,
                revenue: rev,
                profitPct: onlyFeed > 0 ? (rev - onlyFeed) / onlyFeed : null,
                iconId: animal.productId,
                sellItemId: animal.productId,
                cityBonus,
                sellPrice: product.price,
                sellSetup: product.setup === true,
                sellQty: qty,
                netUnit,
                tax,
                babyCredit: 0,
                babyPrice: baby.price,
                babyNet,
                babySetup: baby.setup === true,
                chance,
                feedCost: onlyFeed,
                feedUnit,
                feedQty: animal.feedQty
            });
        }
    }

    return paths.filter((p) => Number.isFinite(p.profit));
}

function pickBestPath(paths) {
    let best = null;
    let bestPct = null;
    for (const path of paths) {
        if (!best || path.profit > best.profit) {
            best = path;
        }
        if (path.profitPct != null && (!bestPct || path.profitPct > bestPct.profitPct)) {
            bestPct = path;
        }
    }
    return { best, bestPct };
}

function bestAnimalPath(animal, feedUnit, ctx) {
    const { best } = pickBestPath(animalPathProfits(animal, feedUnit, ctx));
    return best;
}

function animalExplain(animal, path, feed, scored, ctx, { bestPct = null, islandShare = 0, opportunity = null } = {}) {
    const diffs = [
        pathRankNote(path, bestPct),
        feedQtyDiffNote(animal),
        ...priceBasisNotes(),
        path.cityBonus
            ? 'Ada planı et/ürün adedine şehir +10% uygular; Pasture aracı uygulamaz.'
            : 'Et/ürün adedi Pasture ile aynı taban (şehir bonusu yok).',
        opportunity
            ? 'Ada yemi birim maliyeti tohum (Farming grow). Yem için ayrılan farm plotlar bedava değil — o ekin satılsaydı ayrı ham gümüş/gün vardı.'
            : null,
        opportunity
            ? 'Zincir ortalama = pasture ham/gün ÷ (1 + farm/pasture). Önerici tüm adayı ham gümüş/güne göre doldurur; tek pasture tohum-PnL ada optimumu değildir.'
            : null
    ].filter(Boolean);
    return {
        kind: 'animal',
        role: 'animal',
        title: `${animal.label} · ${path.label}`,
        iconId: path.iconId,
        pathLabel: path.label,
        pathId: path.id,
        priceBasis: PRICE_BASIS,
        diffs,
        chips: [
            { label: 'yem', html: feed?.source === 'island' ? 'ada' : 'pazar' },
            feed?.label ? { label: feed.label, tone: 'city' } : null,
            islandShare > 0 && islandShare < 0.999
                ? { label: 'ada payı', value: islandShare, kind: 'pct', tone: 'bonus' }
                : null,
            path.cityBonus ? { label: 'şehir', value: cityYieldBonus(), kind: 'pct', tone: 'city' } : null,
            ctx.focus ? { label: 'focus iade', value: path.chance, kind: 'pct', tone: 'focus' } : null
        ].filter(Boolean),
        inputs: {
            babyId: animal.babyId,
            babyPrice: path.babyPrice ?? null,
            babySetup: path.babySetup === true,
            chance: path.chance ?? null,
            feedQty: path.feedQty ?? animal.feedQty,
            feedQtyIsland: animal.feedQtyIsland,
            feedQtyPasture: animal.feedQtyPasture,
            feedUnit: path.feedUnit ?? feed?.unit ?? null,
            feedLabel: feed?.label ?? null,
            feedSource: feed?.source ?? 'market',
            pens: animal.pens,
            islandShare
        },
        costs: {
            babyNet: path.babyNet ?? null,
            feedCost: path.feedCost ?? null,
            unitCost: path.cost,
            plotCost: scored.cost
        },
        sale: {
            itemId: path.sellItemId,
            price: path.sellPrice ?? null,
            setup: path.sellSetup === true,
            tax: path.tax ?? salesTaxRate(ctx.premium),
            netUnit: path.netUnit ?? null,
            qty: path.sellQty ?? 1,
            babyCredit: path.babyCredit ?? 0,
            revenue: path.revenue,
            usedMedian: true
        },
        cycle: {
            profit: scored.profit,
            cost: scored.cost,
            revenue: scored.revenue,
            profitPct: scored.profitPct,
            hours: scored.hours,
            rawPerDay: scored.rawPerDay ?? scored.perDay,
            pens: animal.pens,
            pathProfit: path.profit,
            pathCost: path.cost
        },
        stability: stabilityExplain(scored),
        opportunity: opportunity || null,
        notes: []
    };
}

function animalActivityFromPath(animal, path, feed, feedCrop, ctx, { bestPct = null } = {}) {
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
    if (scored.thinMarket) {
        notes.push('ince pazar');
    } else if (scored.lowLiquidity) {
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
        detail: notes.join(' · '),
        explain: animalExplain(animal, path, feed, scored, ctx, { bestPct })
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
        const ranked = pickBestPath(animalPathProfits(animal, feed.unit, ctx));
        if (!ranked.best) {
            return [];
        }
        const act = animalActivityFromPath(animal, ranked.best, feed, null, ctx, { bestPct: ranked.bestPct });
        return act ? [act] : [];
    }

    const out = [];
    const crops = feedCrops.length ? feedCrops : [null];
    for (const cropItem of crops) {
        const feed = marketFeedUnit(animal, cropItem, ctx);
        if (!feed) {
            continue;
        }
        const ranked = pickBestPath(animalPathProfits(animal, feed.unit, ctx));
        if (!ranked.best) {
            continue;
        }
        const act = animalActivityFromPath(
            animal,
            ranked.best,
            feed,
            feed.crop ?? cropItem,
            ctx,
            { bestPct: ranked.bestPct }
        );
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
    list.sort((a, b) => (b.perDay ?? -Infinity) - (a.perDay ?? -Infinity));
    return list;
}

function slotFromActivity(activity, index, role = 'cash') {
    return {
        index,
        plotType: activity.plotType,
        label: activity.label,
        pathLabel: activity.pathLabel,
        perDay: activity.perDay,
        rawPerDay: activity.rawPerDay ?? activity.perDay,
        stablePerDay: activity.stablePerDay ?? null,
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
        thinMarket: activity.thinMarket === true,
        avgItemCount: activity.avgItemCount ?? null,
        historyN: activity.historyN ?? 0,
        explain: activity.explain ?? null,
        role
    };
}

function fillPlots(count, activity, role) {
    if (!activity || count <= 0) {
        return [];
    }
    return Array.from({ length: count }, (_, i) => slotFromActivity(activity, i + 1, role ?? 'cash'));
}

function bestStandaloneFill(n, activities, excludeIds = new Set()) {
    const usable = activities.filter((a) => !excludeIds.has(a.id) && Number.isFinite(a.perDay));
    if (!usable.length || n <= 0) {
        return { slots: [], total: 0, totalStable: 0, activity: null };
    }
    usable.sort((a, b) => b.perDay - a.perDay);
    const best = usable[0];
    const slots = fillPlots(n, best).map((s, i) => ({ ...s, index: i + 1 }));
    return {
        slots,
        total: best.perDay * n,
        totalStable: (best.stablePerDay ?? 0) * n,
        activity: best
    };
}

function farmSupplyPerCycle(feedCrop, animalAlbionHours, ctx) {
    const yieldPlot = plantPlotYield(feedCrop, ctx);
    return yieldPlot * (animalAlbionHours / cropHours());
}

function feedPlotExplain(feedCrop, island, feedMetrics, scoredLike, ctx, { surplus = 0, demand = 0 } = {}) {
    const tax = salesTaxRate(ctx.premium);
    return {
        kind: 'feed',
        role: 'feed',
        title: `${feedCrop.label} · Yem`,
        iconId: feedCrop.plantId,
        pathLabel: 'Yem',
        priceBasis: PRICE_BASIS,
        diffs: [
            'Ada yemi birim maliyeti Farming grow formülüyle aynı (net tohum / verim).',
            ...priceBasisNotes(),
            surplus > 0
                ? 'Fazla hasat satış şehrinde satılır; kâr bu satırda.'
                : 'Hasat hayvan plotlarına yem olarak gider; kâr orada (daha ucuz yem) görünür.'
        ],
        chips: [
            island.bonus ? { label: 'yem şehir', value: cityYieldBonus(), kind: 'pct', tone: 'city' } : null,
            island.yieldSource === 'user' ? { label: 'ada ort.', value: island.yieldN, kind: 'qty', tone: 'bonus' } : null
        ].filter(Boolean),
        inputs: {
            seedId: feedCrop.seedId,
            seedPrice: island.quote?.price ?? null,
            seedSetup: island.quote?.setup === true,
            usedReturn: island.usedReturn ?? null,
            harvestQty: island.harvestPerSeed ?? null,
            slots: plantSlots(),
            yieldPlot: plantPlotYield(feedCrop, ctx),
            surplus,
            demand
        },
        costs: {
            unit: island.unit,
            netSeed: island.netSeed ?? null,
            plotCost: feedMetrics?.cost ?? null
        },
        sale: {
            itemId: feedCrop.plantId,
            price: null,
            setup: true,
            tax,
            netUnit: null,
            qty: surplus,
            babyCredit: 0,
            revenue: feedMetrics?.revenue ?? null
        },
        cycle: {
            profit: feedMetrics?.profit ?? null,
            cost: feedMetrics?.cost ?? null,
            revenue: feedMetrics?.revenue ?? null,
            profitPct: feedMetrics?.profitPct ?? null,
            hours: feedMetrics?.hours ?? scoredLike?.hours ?? null,
            rawPerDay: scoredLike?.rawPerDay ?? feedMetrics?.perDay ?? null,
            pens: plantSlots()
        },
        stability: stabilityExplain(scoredLike || {}),
        notes: []
    };
}

function animalModuleSlots(animal, blended, feedCrop, island, ctx, { a, f, islandShare, surplus, surplusProfitCycle, hours, demand, supply }) {
    const slots = [];
    const feedNote = islandShare >= 0.999
        ? `yem ada · ${feedCrop.label}`
        : islandShare > 0
            ? `yem karışık · ${feedCrop.label}`
            : `yem pazar · ${feedCrop.label}`;
    const notes = [feedNote];
    if (blended.path.cityBonus) {
        notes.push('şehir +10%');
    }
    if (island?.bonus) {
        notes.push('yem şehir +10%');
    }
    if (island?.yieldSource === 'user') {
        notes.push(`yem ada ort. n=${island.yieldN}`);
    }
    if (blended.thinMarket) {
        notes.push('ince pazar');
    } else if (blended.lowLiquidity) {
        notes.push('satış zor');
    }

    const feedObj = {
        unit: blended.unit,
        label: feedCrop.label,
        source: islandShare >= 0.999 ? 'island' : (islandShare > 0 ? 'mixed' : 'market'),
        plantId: feedCrop.plantId
    };
    const animalExplainRow = animalExplain(animal, blended.path, feedObj, blended, ctx, {
        bestPct: blended.bestPct,
        islandShare
    });

    for (let i = 0; i < a; i += 1) {
        slots.push({
            plotType: animal.plotType,
            label: animal.label,
            pathLabel: blended.path.label,
            perDay: blended.perDay,
            rawPerDay: blended.rawPerDay ?? blended.perDay,
            stablePerDay: blended.stablePerDay ?? null,
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
            thinMarket: blended.thinMarket === true,
            avgItemCount: blended.avgItemCount ?? null,
            historyN: blended.historyN ?? 0,
            explain: animalExplainRow,
            role: 'animal'
        });
    }

    if (f > 0) {
        const feedCostCycle = supply * island.unit;
        const feedMetrics = cycleMetrics(surplusProfitCycle / f, feedCostCycle / f, hours);
        const feedStab = stabilityFactors(feedCrop.plantId, ctx.sellCity, ctx);
        const feedScored = {
            ...feedMetrics,
            rawPerDay: feedMetrics.perDay,
            perDay: feedMetrics.perDay,
            stablePerDay: (feedMetrics.perDay ?? 0) * feedStab.liquidity * feedStab.volPenalty,
            liquidity: feedStab.liquidity,
            volPenalty: feedStab.volPenalty,
            lowLiquidity: feedStab.lowLiquidity,
            thinMarket: feedStab.thinMarket,
            historyN: feedStab.hist?.n ?? 0,
            avgItemCount: feedStab.avgItemCount
        };
        const feedExplainRow = feedPlotExplain(feedCrop, island, feedMetrics, feedScored, ctx, {
            surplus,
            demand
        });
        for (let i = 0; i < f; i += 1) {
            slots.push({
                plotType: 'farm',
                label: feedCrop.label,
                pathLabel: 'Yem',
                perDay: feedScored.perDay,
                rawPerDay: feedScored.rawPerDay,
                stablePerDay: feedScored.stablePerDay,
                spotPerDay: feedMetrics.perDay,
                profit: feedMetrics.profit,
                cost: feedMetrics.cost,
                revenue: feedMetrics.revenue,
                profitPct: feedMetrics.profitPct,
                hours,
                iconId: feedCrop.plantId,
                detail: island.yieldSource === 'user'
                    ? `ada yemi · ort. n=${island.yieldN}`
                    : (surplus > 0.5 ? 'ada yemi · fazla satılır' : 'ada yemi (kâr hayvan plotunda)'),
                activityId: `feed-${feedCrop.id}`,
                lowLiquidity: feedScored.lowLiquidity === true,
                thinMarket: feedScored.thinMarket === true,
                avgItemCount: feedScored.avgItemCount ?? null,
                historyN: feedScored.historyN ?? 0,
                explain: feedExplainRow,
                role: 'feed'
            });
        }
    }

    return slots;
}

function describeFeedNote(animal, blended, feedCrop, { a, f, shortfall }) {
    if (f === 0) {
        return `Pazardan al: ${feedCrop.label}`;
    }
    const plotWord = animal.plotType === 'kennel' ? 'Kennel' : 'Pasture';
    if (shortfall > 0.5) {
        return `Adada ${f} Farm ${feedCrop.label} + pazardan tamamla → ${a} ${plotWord} ${animal.label} ${blended.path.label}`;
    }
    return `Adada ${f} Farm ${feedCrop.label} → ${a} ${plotWord} ${animal.label} ${blended.path.label}`;
}

function blendedAnimalPlot(animal, islandUnit, marketUnit, islandShare, ctx) {
    if (!Number.isFinite(islandUnit) || !Number.isFinite(marketUnit)) {
        return null;
    }
    const share = Math.min(1, Math.max(0, islandShare));
    const unit = islandUnit * share + marketUnit * (1 - share);
    const ranked = pickBestPath(animalPathProfits(animal, unit, ctx));
    if (!ranked.best) {
        return null;
    }
    const plotProfit = ranked.best.profit * animal.pens;
    const plotCost = ranked.best.cost * animal.pens;
    const hours = metricsHours(animal.baseHours, ctx.premium);
    const metrics = cycleMetrics(plotProfit, plotCost, hours);
    const scored = withStability(metrics, ranked.best.sellItemId, ctx.sellCity, ctx);
    if (!scored) {
        return null;
    }
    return {
        path: ranked.best,
        bestPct: ranked.bestPct,
        ...scored,
        unit
    };
}

function animalEligible(animal, ctx) {
    if (animal.kind === 'faction-mount' && animal.factionCity && animal.factionCity !== ctx.islandCity) {
        return false;
    }
    return true;
}

function feedCropsFor(animal) {
    if (animal.feedDiet === 'meat') {
        return [null];
    }
    if (animal.feedFixed) {
        return [resolveFeedCrop(animal, null)].filter(Boolean);
    }
    return listCrops();
}

/**
 * Grouped knapsack: at most one (animal, crop, a, f) module per animal.
 * Leftover plots go to the best plant (or best unused standalone plant).
 * Mixing two island-feed chains can beat “all leftover on one cash crop”.
 */
function keepBestPerCost(bestByCost, module) {
    const prev = bestByCost.get(module.cost);
    if (!prev || module.value > prev.value + 1e-9) {
        bestByCost.set(module.cost, module);
    }
}

function collectAnimalModules(n, ctx, { minPlotsByAnimalId = new Map() } = {}) {
    const modulesByAnimal = new Map();

    for (const animal of listAllAnimals()) {
        if (!animalEligible(animal, ctx)) {
            continue;
        }
        const minA = Math.max(0, Math.round(Number(minPlotsByAnimalId.get(animal.id)) || 0));
        const bestByCost = new Map();
        const albionHours = cycleHours(animal.baseHours, ctx.premium);
        const hours = planCycleHours(albionHours);
        if (hours == null) {
            continue;
        }

        if (animal.feedDiet === 'meat') {
            const market = marketFeedUnit(animal, null, ctx);
            if (!market) {
                continue;
            }
            const blended = blendedAnimalPlot(animal, market.unit, market.unit, 0, ctx);
            if (!blended) {
                continue;
            }
            const dummyCrop = {
                id: `meat-${animal.tier}`,
                label: market.label,
                plantId: market.plantId,
                seedId: market.plantId,
                key: 'meat'
            };
            const aStart = Math.max(1, minA);
            for (let a = aStart; a <= n; a += 1) {
                keepBestPerCost(bestByCost, {
                    groupId: animal.id,
                    animalId: animal.id,
                    animalKey: animal.key,
                    cost: a,
                    a,
                    f: 0,
                    value: blended.perDay * a,
                    stableValue: (blended.stablePerDay ?? 0) * a,
                    feedNote: `Pazardan al: ${market.label}`,
                    mode: 'market',
                    buildSlots: () => animalModuleSlots(animal, blended, dummyCrop, null, ctx, {
                        a,
                        f: 0,
                        islandShare: 0,
                        surplus: 0,
                        surplusProfitCycle: 0,
                        hours,
                        demand: a * animal.pens * animal.feedQty,
                        supply: 0
                    })
                });
            }
            if (bestByCost.size) {
                modulesByAnimal.set(animal.id, [...bestByCost.values()]);
            }
            continue;
        }

        for (const feedCrop of feedCropsFor(animal)) {
            const island = islandFeedUnit(feedCrop, ctx);
            const market = marketFeedUnit(animal, feedCrop, ctx);
            if (!market) {
                continue;
            }
            const sellQ = sellQuote(feedCrop.plantId, ctx.sellCity, ctx);
            const sellUnit = sellQ
                ? saleProceeds(sellQ.price, { premium: ctx.premium, setup: sellQ.setup })
                : null;
            const demandPerPlot = animal.pens * animal.feedQty;
            const supplyPerFarm = island ? farmSupplyPerCycle(feedCrop, albionHours, ctx) : 0;
            const aStart = Math.max(1, minA);

            for (let a = aStart; a <= n; a += 1) {
                const fMax = island && supplyPerFarm > 0 ? (n - a) : 0;
                for (let f = 0; f <= fMax; f += 1) {
                    const demand = a * demandPerPlot;
                    const supply = f * supplyPerFarm;
                    const fromIsland = Math.min(demand, supply);
                    const shortfall = demand - fromIsland;
                    const surplus = supply - fromIsland;
                    const islandShare = demand > 0 ? fromIsland / demand : 0;
                    const islandUnit = island?.unit ?? market.unit;
                    const blended = blendedAnimalPlot(animal, islandUnit, market.unit, islandShare, ctx);
                    if (!blended) {
                        continue;
                    }

                    let surplusProfitCycle = 0;
                    let surplusDay = 0;
                    if (surplus > 0 && sellUnit != null && island) {
                        surplusProfitCycle = surplus * (sellUnit - island.unit);
                        surplusDay = perDay(surplusProfitCycle, hours) ?? 0;
                    }

                    const value = (blended.perDay * a) + surplusDay;
                    const feedStab = stabilityFactors(feedCrop.plantId, ctx.sellCity, ctx);
                    const stableValue = (blended.stablePerDay ?? 0) * a
                        + surplusDay * feedStab.liquidity * feedStab.volPenalty;

                    keepBestPerCost(bestByCost, {
                        groupId: animal.id,
                        animalId: animal.id,
                        animalKey: animal.key,
                        cost: a + f,
                        a,
                        f,
                        value,
                        stableValue,
                        feedNote: describeFeedNote(animal, blended, feedCrop, { a, f, shortfall }),
                        mode: f > 0 ? 'island-feed' : 'market',
                        buildSlots: () => animalModuleSlots(animal, blended, feedCrop, island, ctx, {
                            a,
                            f,
                            islandShare,
                            surplus,
                            surplusProfitCycle,
                            hours,
                            demand,
                            supply
                        })
                    });
                }
            }
        }

        if (bestByCost.size) {
            modulesByAnimal.set(animal.id, [...bestByCost.values()]);
        }
    }

    return modulesByAnimal;
}

function bestPlantActivity(activities) {
    const plants = activities.filter((a) => (a.kind === 'crop' || a.kind === 'herb') && Number.isFinite(a.perDay));
    plants.sort((a, b) => b.perDay - a.perDay);
    return plants[0] ?? null;
}

function knapsackPlans(n, modulesByAnimal, leftoverActivity, { requiredAnimalId = null, requiredMinA = 0, requiredDummy = null } = {}) {
    if (requiredAnimalId != null && !modulesByAnimal.has(requiredAnimalId) && requiredDummy) {
        modulesByAnimal.set(requiredAnimalId, [requiredDummy]);
    }
    if (requiredAnimalId != null && !modulesByAnimal.has(requiredAnimalId)) {
        return null;
    }
    const empty = { value: 0, stable: 0, picks: [] };
    let states = Array.from({ length: n + 1 }, () => null);
    states[0] = empty;

    const groups = [];
    if (requiredAnimalId != null && modulesByAnimal.has(requiredAnimalId)) {
        groups.push([requiredAnimalId, modulesByAnimal.get(requiredAnimalId)]);
    }
    for (const [id, options] of modulesByAnimal) {
        if (id === requiredAnimalId) {
            continue;
        }
        groups.push([id, options]);
    }

    let first = true;
    for (const [groupId, options] of groups) {
        const required = first && requiredAnimalId != null && groupId === requiredAnimalId;
        first = false;
        const next = required
            ? Array.from({ length: n + 1 }, () => null)
            : states.map((s) => (s ? { value: s.value, stable: s.stable, picks: s.picks } : null));

        for (const mod of options) {
            if (required && requiredMinA > 0 && mod.a < requiredMinA) {
                continue;
            }
            if (required) {
                if (mod.cost <= n && (!next[mod.cost] || mod.value > next[mod.cost].value)) {
                    next[mod.cost] = { value: mod.value, stable: mod.stableValue, picks: [mod] };
                }
                continue;
            }
            for (let j = 0; j <= n - mod.cost; j += 1) {
                const prev = states[j];
                if (!prev) {
                    continue;
                }
                const nj = j + mod.cost;
                const val = prev.value + mod.value;
                if (!next[nj] || val > next[nj].value + 1e-9) {
                    next[nj] = {
                        value: val,
                        stable: prev.stable + mod.stableValue,
                        picks: [...prev.picks, mod]
                    };
                }
            }
        }
        states = next;
    }

    let best = null;
    for (let j = 0; j <= n; j += 1) {
        const state = states[j];
        if (!state) {
            continue;
        }
        const rest = n - j;
        const useFill = leftoverActivity && rest > 0 && leftoverActivity.perDay > 0;
        const fillVal = useFill ? leftoverActivity.perDay * rest : 0;
        const fillStable = useFill ? (leftoverActivity.stablePerDay ?? 0) * rest : 0;
        const total = state.value + fillVal;
        if (!best || total > best.totalDay + 1e-9) {
            best = {
                totalDay: total,
                totalStable: state.stable + fillStable,
                used: j,
                rest: useFill ? rest : 0,
                unused: useFill ? 0 : rest,
                state
            };
        }
    }
    return best;
}

function slotsFromKnapsack(best, leftoverActivity) {
    if (!best) {
        return [];
    }
    const slots = [];
    let idx = 1;
    for (const mod of best.state.picks) {
        const built = typeof mod.buildSlots === 'function' ? mod.buildSlots() : (mod.slots || []);
        for (const slot of built) {
            slots.push({ ...slot, index: idx });
            idx += 1;
        }
    }
    if (best.rest > 0 && leftoverActivity) {
        for (const slot of fillPlots(best.rest, leftoverActivity)) {
            slots.push({ ...slot, index: idx });
            idx += 1;
        }
    }
    return slots;
}

function feedNoteFromPlan(best, leftoverActivity) {
    const notes = (best?.state.picks || []).map((mod) => mod.feedNote).filter(Boolean);
    if (best?.rest > 0 && leftoverActivity) {
        notes.push(`${best.rest}× ${leftoverActivity.label} ${leftoverActivity.pathLabel}`);
    }
    if (best?.unused > 0) {
        notes.push(`${best.unused} plot boş (kalan nakit ekin ham gümüş/gün ≤ 0)`);
    }
    return notes.length ? notes.join(' · ') : '—';
}

function planMode(best) {
    const picks = best?.state.picks || [];
    if (picks.some((m) => m.mode === 'island-feed')) {
        return picks.length > 1 || (best.rest > 0) ? 'mix' : 'island-feed';
    }
    if (picks.length > 1 || (picks.length === 1 && best.rest > 0)) {
        return 'mix';
    }
    return picks[0]?.mode || 'market';
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

export function ledgerGroupLabel(kind) {
    switch (kind) {
        case 'crop':
            return 'Ekin';
        case 'herb':
            return 'Ot';
        case 'livestock':
            return 'Hayvan';
        case 'mount':
            return 'Binek';
        case 'faction-mount':
            return 'Faction';
        default:
            return kind || '—';
    }
}

function conceptualAnimalPaths(animal) {
    const paths = [{
        id: 'grow',
        label: 'Büyüt',
        sellItemId: animal.grownId,
        iconId: animal.grownId
    }];
    if (animal.meatId) {
        paths.push({
            id: 'butcher',
            label: 'Kes',
            sellItemId: animal.meatId,
            iconId: animal.meatId
        });
    }
    if (animal.productId) {
        paths.push({
            id: 'feed',
            label: 'Besle',
            sellItemId: animal.productId,
            iconId: animal.productId
        });
    }
    return paths;
}

function pickCheapestMarketFeed(animal, ctx) {
    if (animal.feedDiet === 'meat') {
        const feed = marketFeedUnit(animal, null, ctx);
        return {
            feed,
            crop: null,
            missing: feed ? [] : ['yem']
        };
    }
    const crops = feedCropsFor(animal);
    if (!crops.length) {
        return { feed: null, crop: null, missing: ['yem ekin'] };
    }
    let best = null;
    for (const crop of crops) {
        const feed = marketFeedUnit(animal, crop, ctx);
        if (feed && (!best || feed.unit < best.unit)) {
            best = { feed, crop: feed.crop ?? crop };
        }
    }
    if (!best) {
        return { feed: null, crop: crops[0], missing: ['yem'] };
    }
    return { ...best, missing: [] };
}

function pickCheapestIslandFeed(animal, ctx) {
    if (animal.feedDiet === 'meat') {
        return null;
    }
    const crops = feedCropsFor(animal);
    if (!crops.length) {
        return { feed: null, crop: null, missing: ['ada yemi ekin'] };
    }
    let best = null;
    for (const crop of crops) {
        const feed = islandFeedUnit(crop, ctx);
        if (feed && (!best || feed.unit < best.unit)) {
            best = { feed, crop };
        }
    }
    if (!best) {
        return { feed: null, crop: crops[0], missing: ['ada yemi (tohum)'] };
    }
    return { ...best, missing: [] };
}

function islandFeedOpportunity(animal, feedCrop, ctx, animalPerDay, plantById) {
    if (!animal || !feedCrop) {
        return null;
    }
    const albionHours = cycleHours(animal.baseHours, ctx.premium);
    const demandPerPlot = animal.pens * animal.feedQty;
    const supplyPerFarm = farmSupplyPerCycle(feedCrop, albionHours, ctx);
    const farmsPerPasture = supplyPerFarm > 0 ? demandPerPlot / supplyPerFarm : null;
    const plantRow = plantById?.get(feedCrop.id) ?? null;
    const cropSellPerDay = Number.isFinite(plantRow?.perDay)
        ? plantRow.perDay
        : (cropSellActivity(feedCrop, ctx)?.perDay ?? null);
    const chainPlots = Number.isFinite(farmsPerPasture) ? 1 + farmsPerPasture : null;
    const chainAvgPerDay = Number.isFinite(animalPerDay) && chainPlots > 0
        ? animalPerDay / chainPlots
        : null;
    const oppCostPerDay = Number.isFinite(farmsPerPasture) && Number.isFinite(cropSellPerDay)
        ? farmsPerPasture * cropSellPerDay
        : null;
    return {
        feedCropId: feedCrop.id,
        feedCropLabel: feedCrop.label,
        farmsPerPasture,
        cropSellPerDay,
        chainPlots,
        chainAvgPerDay,
        oppCostPerDay,
        seedOnlyPerDay: Number.isFinite(animalPerDay) ? animalPerDay : null
    };
}

function plantWhy(plant, scored, missing) {
    if (missing.length) {
        return `Eksik fiyat: ${missing.join(', ')}. Satır öneride yok sayılır ama burada durur.`;
    }
    const bits = [
        plant.kind === 'herb' ? 'Ot hasadını sat' : 'Ekin hasadını sat',
        '1 plot = 1 döngü'
    ];
    if (Number.isFinite(scored?.profit) && scored.profit < 0) {
        bits.push('zarar: gelir < maliyet');
    }
    if (scored?.thinMarket) {
        bits.push('ince pazar (uyarı)');
    }
    return `${bits.join(' · ')}.`;
}

function animalWhy({ feedMode, feed, path, scored, missing, opportunity, feedFixed }) {
    if (missing.length) {
        return `Eksik fiyat: ${missing.join(', ')}. Satır öneride yok sayılır ama burada durur.`;
    }
    if (feedMode === 'island') {
        const farms = Number.isFinite(opportunity?.farmsPerPasture)
            ? opportunity.farmsPerPasture.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
            : '—';
        const crop = opportunity?.feedCropLabel || feed?.label || 'yem';
        return `Ada yemi tohum maliyeti (pasture-only, önerici skoru değil). ~${farms} farm ${crop} ayrılır; o plotlar satılsaydı ayrı ham/gün. Zincir ortalama = pasture ÷ (1+farm).`;
    }
    const feedName = feed?.label || 'yem';
    const pick = feedFixed === false ? `en ucuz pazar yemi ${feedName}` : `pazar yemi ${feedName}`;
    const bits = [
        pick,
        'ekstra farm plot yok',
        path?.label ? `path ${path.label}` : null
    ].filter(Boolean);
    if (Number.isFinite(scored?.profit) && scored.profit < 0) {
        bits.push('zarar: gelir < maliyet');
    }
    if (scored?.thinMarket) {
        bits.push('ince pazar (uyarı)');
    }
    return `${bits.join(' · ')}.`;
}

function plantLedgerRow(plant, ctx) {
    const grow = plantGrowUnitCost(plant, ctx);
    const sell = sellQuote(plant.plantId, ctx.sellCity, ctx);
    const missing = [];
    if (!grow) {
        missing.push('tohum');
    }
    if (!sell) {
        missing.push('satış');
    }
    const activity = missing.length ? null : cropSellActivity(plant, ctx);
    const hours = activity?.hours ?? planCycleHours(cropHours());
    const yieldPlot = plantPlotYield(plant, ctx);
    const cost = activity?.cost ?? (grow ? grow.unit * yieldPlot : null);
    const scored = activity || {
        cost,
        revenue: null,
        profit: null,
        profitPct: null,
        hours,
        perDay: null,
        rawPerDay: null,
        stablePerDay: null,
        thinMarket: false,
        lowLiquidity: false
    };
    const explain = activity?.explain || plantExplain(plant, grow || {
        unit: null,
        seed: null,
        qty: null,
        usedReturn: null,
        netSeed: null,
        bonus: false,
        yieldSource: 'standard',
        yieldN: 0
    }, sell, scored, ctx);
    if (missing.length && explain) {
        explain.diffs = [
            `Eksik fiyat: ${missing.join(', ')}.`,
            ...(explain.diffs || [])
        ];
    }
    return {
        id: `sell-${plant.id}`,
        group: plant.kind,
        groupLabel: ledgerGroupLabel(plant.kind),
        name: plant.label,
        label: plant.label,
        pathLabel: 'Sat',
        pathId: 'sell',
        plotType: plant.plotType,
        feedMode: 'none',
        feedLabel: null,
        iconId: plant.plantId,
        cost,
        revenue: activity?.revenue ?? null,
        profit: activity?.profit ?? null,
        profitPct: activity?.profitPct ?? null,
        hours,
        perDay: activity?.perDay ?? null,
        rawPerDay: activity?.rawPerDay ?? activity?.perDay ?? null,
        stablePerDay: activity?.stablePerDay ?? null,
        spotPerDay: activity?.spotPerDay ?? null,
        missing,
        why: plantWhy(plant, activity, missing),
        opportunity: null,
        thinMarket: activity?.thinMarket === true,
        lowLiquidity: activity?.lowLiquidity === true,
        avgItemCount: activity?.avgItemCount ?? null,
        historyN: activity?.historyN ?? 0,
        activityId: `sell-${plant.id}`,
        itemKey: plant.key,
        explain
    };
}

function animalLedgerRow({
    animal,
    spec,
    path,
    feed,
    crop,
    feedMode,
    extraMissing,
    ctx,
    plantById
}) {
    const missing = [...(extraMissing || [])];
    const baby = buyQuote(animal.babyId, ctx.islandCity, ctx);
    if (!baby) {
        missing.push('yavru');
    }
    if (!feed) {
        missing.push(feedMode === 'island' ? 'ada yemi (tohum)' : 'yem');
    }
    const sell = spec.sellItemId ? sellQuote(spec.sellItemId, ctx.sellCity, ctx) : null;
    if (!sell) {
        missing.push('satış');
    }
    const uniqueMissing = [...new Set(missing)];

    let activity = null;
    if (path && feed) {
        activity = animalActivityFromPath(animal, path, feed, crop, ctx);
    }

    const hours = activity?.hours ?? metricsHours(animal.baseHours, ctx.premium);
    const opportunity = feedMode === 'island'
        ? islandFeedOpportunity(animal, crop, ctx, activity?.perDay ?? null, plantById)
        : null;

    const stubPath = path || {
        id: spec.id,
        label: spec.label,
        iconId: spec.iconId,
        sellItemId: spec.sellItemId,
        cityBonus: hasAnimalCityBonus(animal, ctx.islandCity) && spec.id !== 'grow',
        profit: null,
        cost: null,
        revenue: null,
        babyPrice: baby?.price ?? null,
        babyNet: baby ? purchaseCost(baby.price, { setup: baby.setup }) : null,
        babySetup: baby?.setup === true,
        chance: babyChance(animal, ctx.focus),
        feedCost: null,
        feedUnit: feed?.unit ?? null,
        feedQty: animal.feedQty,
        sellPrice: sell?.price ?? null,
        sellSetup: sell?.setup === true,
        sellQty: spec.id === 'butcher' ? butcherQty(animal, ctx) : (spec.id === 'feed' ? productQty(animal, ctx) : 1),
        netUnit: null,
        tax: salesTaxRate(ctx.premium),
        babyCredit: 0
    };

    const scored = activity || {
        cost: null,
        revenue: null,
        profit: null,
        profitPct: null,
        hours,
        perDay: null,
        rawPerDay: null,
        stablePerDay: null,
        thinMarket: false,
        lowLiquidity: false
    };

    const explain = activity?.explain
        ? {
            ...activity.explain,
            opportunity,
            diffs: [...(activity.explain.diffs || [])]
        }
        : animalExplain(animal, stubPath, feed, scored, ctx, { opportunity });
    if (uniqueMissing.length && explain) {
        explain.diffs = [
            `Eksik fiyat: ${uniqueMissing.join(', ')}.`,
            ...(explain.diffs || [])
        ];
    }
    if (opportunity && activity?.explain) {
        explain.diffs = [
            ...(explain.diffs || []),
            'Ada yemi birim maliyeti tohum (Farming grow). Yem için ayrılan farm plotlar bedava değil — o ekin satılsaydı ayrı ham gümüş/gün vardı.',
            'Zincir ortalama = pasture ham/gün ÷ (1 + farm/pasture). Önerici tüm adayı ham gümüş/güne göre doldurur; tek pasture tohum-PnL ada optimumu değildir.'
        ];
    }

    const feedKey = crop?.key ?? (animal.feedDiet === 'meat' ? 'meat' : 'x');
    const activityId = feedMode === 'island'
        ? `${animal.id}-${spec.id}-island`
        : `${animal.id}-${spec.id}-mkt-${feedKey}`;
    const pathLabel = feedMode === 'island'
        ? `${spec.label} · ada yemi`
        : `${spec.label} · pazar`;

    return {
        id: `${activityId}-${feedKey}`,
        group: animal.kind,
        groupLabel: ledgerGroupLabel(animal.kind),
        name: animal.label,
        label: animal.label,
        pathLabel,
        pathId: spec.id,
        plotType: animal.plotType,
        feedMode,
        feedLabel: feed?.label ?? crop?.label ?? null,
        iconId: path?.iconId || spec.iconId,
        cost: activity?.cost ?? null,
        revenue: activity?.revenue ?? null,
        profit: activity?.profit ?? null,
        profitPct: activity?.profitPct ?? null,
        hours,
        perDay: activity?.perDay ?? null,
        rawPerDay: activity?.rawPerDay ?? activity?.perDay ?? null,
        stablePerDay: activity?.stablePerDay ?? null,
        spotPerDay: activity?.spotPerDay ?? null,
        missing: uniqueMissing,
        why: animalWhy({
            feedMode,
            feed,
            path: path || spec,
            scored: activity,
            missing: uniqueMissing,
            opportunity,
            feedFixed: animal.feedFixed
        }),
        opportunity,
        thinMarket: activity?.thinMarket === true,
        lowLiquidity: activity?.lowLiquidity === true,
        avgItemCount: activity?.avgItemCount ?? null,
        historyN: activity?.historyN ?? 0,
        activityId,
        itemKey: animal.key,
        explain
    };
}

function animalLedgerRows(animal, ctx, plantById) {
    const specs = conceptualAnimalPaths(animal);
    const rows = [];
    const market = pickCheapestMarketFeed(animal, ctx);
    const marketPaths = market.feed
        ? animalPathProfits(animal, market.feed.unit, ctx)
        : [];
    const marketById = new Map(marketPaths.map((p) => [p.id, p]));

    for (const spec of specs) {
        rows.push(animalLedgerRow({
            animal,
            spec,
            path: marketById.get(spec.id) ?? null,
            feed: market.feed,
            crop: market.crop,
            feedMode: 'market',
            extraMissing: market.missing,
            ctx,
            plantById
        }));
    }

    const island = pickCheapestIslandFeed(animal, ctx);
    if (!island) {
        return rows;
    }
    const islandPaths = island.feed
        ? animalPathProfits(animal, island.feed.unit, ctx)
        : [];
    const islandById = new Map(islandPaths.map((p) => [p.id, p]));
    for (const spec of specs) {
        rows.push(animalLedgerRow({
            animal,
            spec,
            path: islandById.get(spec.id) ?? null,
            feed: island.feed,
            crop: island.crop,
            feedMode: 'island',
            extraMissing: island.missing,
            ctx,
            plantById
        }));
    }
    return rows;
}

/**
 * Full diagnostic ledger: every plant sell path and every animal grow/butcher/product
 * × market / island-feed. Missing prices and losses stay visible. Does not rank the plan.
 */
export function listIslandLedger(ctx) {
    const rows = [];
    const plantById = new Map();
    for (const plant of listAllPlants()) {
        const row = plantLedgerRow(plant, ctx);
        rows.push(row);
        plantById.set(plant.id, row);
    }
    for (const animal of listAllAnimals()) {
        if (!animalEligible(animal, ctx)) {
            continue;
        }
        rows.push(...animalLedgerRows(animal, ctx, plantById));
    }
    rows.sort((a, b) => {
        const ad = Number.isFinite(a.perDay) ? a.perDay : Number.NEGATIVE_INFINITY;
        const bd = Number.isFinite(b.perDay) ? b.perDay : Number.NEGATIVE_INFINITY;
        if (bd !== ad) {
            return bd - ad;
        }
        const am = a.missing?.length ? 1 : 0;
        const bm = b.missing?.length ? 1 : 0;
        if (am !== bm) {
            return am - bm;
        }
        return String(a.name).localeCompare(String(b.name), 'tr');
    });
    return rows;
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
        totalStableDay: 0,
        feedNote: '—',
        mode: 'empty',
        recommended: 'simple',
        simple: null,
        chain: null,
        marketOnly: null,
        runnersUp: [],
        comparison: null,
        cityCompare: [],
        ledger: [],
        objective: 'raw-silver-per-day',
        priceBasis: PRICE_BASIS,
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
        totalStableDay: plan.totalStableDay ?? null,
        slots: plan.slots,
        feedNote: plan.feedNote,
        mode: plan.mode,
        animalKey: plan.animalKey || null
    };
}

function indexSlots(slots) {
    return slots.map((slot, i) => ({ ...slot, index: i + 1 }));
}

function packageFromFill(fill, { mode = 'market', feedNote = null } = {}) {
    if (!fill || !fill.slots?.length) {
        return null;
    }
    return {
        totalDay: fill.total,
        totalStableDay: fill.totalStable ?? 0,
        slots: indexSlots(fill.slots),
        feedNote: feedNote
            ?? (fill.activity?.feedMode === 'market'
                ? `Pazardan al: ${fill.activity.feedLabel}`
                : (fill.activity ? 'Yem gerekmez (ekin/ot satışı)' : 'Uygun aday yok')),
        mode,
        animalKey: fill.activity?.item?.key || null
    };
}

function packageFromKnapsack(best, leftoverActivity) {
    if (!best || !(best.totalDay > -Infinity)) {
        return null;
    }
    const slots = slotsFromKnapsack(best, leftoverActivity);
    if (!slots.length) {
        return null;
    }
    const firstAnimal = best.state.picks.find((m) => m.animalKey);
    return {
        totalDay: best.totalDay,
        totalStableDay: best.totalStable,
        slots,
        feedNote: feedNoteFromPlan(best, leftoverActivity),
        mode: planMode(best),
        animalKey: firstAnimal?.animalKey || leftoverActivity?.item?.key || null
    };
}

function placeholderFactionActivity(animal) {
    const hours = metricsHours(animal.baseHours, true);
    return {
        id: `${animal.id}-locked`,
        kind: animal.kind,
        plotType: animal.plotType || 'kennel',
        label: animal.label,
        pathLabel: 'Kilit',
        item: animal,
        iconId: animal.grownId,
        sellItemId: animal.grownId,
        perDay: 0,
        rawPerDay: 0,
        stablePerDay: 0,
        spotPerDay: null,
        profit: null,
        cost: null,
        revenue: null,
        profitPct: null,
        hours,
        feedDemand: animal.pens * (animal.feedQty || 0),
        feedCrop: null,
        feedMode: 'market',
        feedLabel: null,
        detail: 'faction kilit · fiyat yok',
        lowLiquidity: false,
        thinMarket: false,
        explain: {
            kind: 'animal',
            role: 'animal',
            title: `${animal.label} · Kilit`,
            iconId: animal.grownId,
            pathLabel: 'Kilit',
            priceBasis: PRICE_BASIS,
            diffs: ['Faction kennel kilidi zorunlu. Bu şehirde yeterli fiyat yok; ham gümüş/gün 0 sayılır.'],
            chips: [{ label: 'kilit', html: '<span class="calc-explain-n">faction</span>' }],
            inputs: { pens: animal.pens },
            costs: {},
            sale: {},
            cycle: { profit: null, cost: null, revenue: null, hours, rawPerDay: 0, pens: animal.pens },
            stability: {},
            notes: []
        }
    };
}

function bestFactionMarketActivity(factionAnimal, ctx) {
    const feedCrops = listCrops();
    let bestAct = null;
    for (const crop of feedCrops) {
        const feed = marketFeedUnit(factionAnimal, crop, ctx);
        if (!feed) {
            continue;
        }
        const ranked = pickBestPath(animalPathProfits(factionAnimal, feed.unit, ctx));
        if (!ranked.best) {
            continue;
        }
        const act = animalActivityFromPath(
            factionAnimal,
            ranked.best,
            feed,
            crop,
            ctx,
            { bestPct: ranked.bestPct }
        );
        if (act && (!bestAct || act.perDay > bestAct.perDay)) {
            bestAct = act;
        }
    }
    if (!bestAct) {
        const feed = marketFeedUnit(factionAnimal, null, ctx);
        if (feed) {
            const ranked = pickBestPath(animalPathProfits(factionAnimal, feed.unit, ctx));
            if (ranked.best) {
                bestAct = animalActivityFromPath(
                    factionAnimal,
                    ranked.best,
                    feed,
                    feed.crop ?? null,
                    ctx,
                    { bestPct: ranked.bestPct }
                );
            }
        }
    }
    return bestAct;
}

function dummyFactionModule(factionAnimal, locked, ctx) {
    const act = bestFactionMarketActivity(factionAnimal, ctx) || placeholderFactionActivity(factionAnimal);
    return {
        groupId: factionAnimal.id,
        animalId: factionAnimal.id,
        animalKey: factionAnimal.key,
        cost: locked,
        a: locked,
        f: 0,
        value: (act.perDay || 0) * locked,
        stableValue: (act.stablePerDay || 0) * locked,
        feedNote: `Faction ${locked}× kennel · ${act.feedLabel ? `yem pazar · ${act.feedLabel}` : (act.detail || 'kilit')}`,
        mode: 'faction-simple',
        buildSlots: () => fillPlots(locked, act, 'animal')
    };
}

function simpleFactionPlan(n, factionAnimal, activities, ctx) {
    const locked = Math.min(n, Math.max(0, Math.round(Number(ctx.factionPlots) || 0)));
    if (!factionAnimal || locked <= 0) {
        return null;
    }
    const bestAct = bestFactionMarketActivity(factionAnimal, ctx)
        || placeholderFactionActivity(factionAnimal);

    const rest = n - locked;
    const fill = bestStandaloneFill(rest, activities.filter((a) => a.item?.id !== factionAnimal.id));
    const slots = [
        ...fillPlots(locked, bestAct, 'animal'),
        ...fill.slots
    ].map((s, i) => ({ ...s, index: i + 1, role: i < locked ? 'animal' : s.role }));

    return {
        totalDay: bestAct.perDay * locked + fill.total,
        totalStableDay: (bestAct.stablePerDay ?? 0) * locked + (fill.totalStable ?? 0),
        slots,
        feedNote: `Faction ${locked}× kennel · ${bestAct.feedLabel ? `yem pazar · ${bestAct.feedLabel}` : 'yem pazar'}`,
        mode: 'faction-simple',
        animalKey: factionAnimal.key
    };
}

function runnerFromActivity(activity) {
    return {
        plotType: activity.plotType,
        label: activity.label,
        pathLabel: activity.pathLabel,
        iconId: activity.iconId,
        perDay: activity.perDay,
        rawPerDay: activity.rawPerDay ?? activity.perDay,
        stablePerDay: activity.stablePerDay ?? null,
        spotPerDay: activity.spotPerDay ?? null,
        profit: activity.profit,
        cost: activity.cost,
        profitPct: activity.profitPct,
        hours: activity.hours,
        detail: activity.detail,
        lowLiquidity: activity.lowLiquidity === true,
        thinMarket: activity.thinMarket === true,
        explain: activity.explain ?? null,
        activityId: activity.id,
        avgItemCount: activity.avgItemCount ?? null,
        historyN: activity.historyN ?? 0
    };
}

function mainSlot(slots) {
    if (!slots?.length) {
        return null;
    }
    const scores = new Map();
    for (const slot of slots) {
        const key = `${slot.activityId}|${slot.label}|${slot.pathLabel}`;
        const cur = scores.get(key) || { slot, total: 0 };
        cur.total += Number(slot.perDay) || 0;
        scores.set(key, cur);
    }
    let best = null;
    for (const row of scores.values()) {
        if (!best || row.total > best.total) {
            best = row;
        }
    }
    return best?.slot ?? slots[0];
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
    const factionAnimal = ctx.factionPlots > 0
        ? factionMountForCity(ctx.islandCity, ctx.factionTier)
        : null;

    const locked = factionAnimal && ctx.factionPlots > 0
        ? Math.min(n, ctx.factionPlots)
        : 0;
    const simple = locked > 0
        ? simpleFactionPlan(n, factionAnimal, activities, ctx)
        : packageFromFill(bestStandaloneFill(n, activities));

    const leftoverPlant = bestPlantActivity(activities);
    const minPlots = new Map();
    if (factionAnimal && locked > 0) {
        minPlots.set(factionAnimal.id, locked);
    }
    const modules = collectAnimalModules(n, ctx, { minPlotsByAnimalId: minPlots });
    const knapsack = knapsackPlans(n, modules, leftoverPlant, {
        requiredAnimalId: factionAnimal && locked > 0 ? factionAnimal.id : null,
        requiredMinA: locked,
        requiredDummy: factionAnimal && locked > 0
            ? dummyFactionModule(factionAnimal, locked, ctx)
            : null
    });
    const mixed = packageFromKnapsack(knapsack, leftoverPlant);

    const simpleDay = simple?.totalDay ?? -Infinity;
    const mixedDay = mixed?.totalDay ?? -Infinity;
    const mixedBetter = mixed && mixedDay > simpleDay + 1e-6;

    let recommended = 'simple';
    let best = simple;
    if (mixedBetter) {
        recommended = mixed.mode === 'market' ? 'simple' : (mixed.mode === 'mix' ? 'mix' : 'chain');
        best = mixed;
    } else if (!simple && mixed) {
        recommended = mixed.mode === 'island-feed' ? 'chain' : (mixed.mode === 'mix' ? 'mix' : 'simple');
        best = mixed;
    }

    const simplePkg = planPackage(simple, 'Sade (pazar)');
    const mixedIsStructured = mixed && mixed.mode !== 'market' && mixed.mode !== 'faction-simple';
    const chainPkg = mixedIsStructured
        ? planPackage(mixed, mixed.mode === 'mix' ? 'Karışık' : 'Zincir')
        : null;

    const marketOnly = simplePkg;

    const chosenIds = new Set((best?.slots || []).map((s) => s.activityId).filter(Boolean));
    const runnersUp = activities
        .filter((a) => !chosenIds.has(a.id))
        .slice(0, 8)
        .map(runnerFromActivity);

    return {
        ...best,
        totalStableDay: best?.totalStableDay ?? 0,
        recommended,
        objective: 'raw-silver-per-day',
        priceBasis: PRICE_BASIS,
        simple: simplePkg,
        chain: chainPkg,
        marketOnly,
        runnersUp,
        comparison: {
            marketDay: simplePkg?.totalDay ?? 0,
            marketStableDay: simplePkg?.totalStableDay ?? 0,
            chosenDay: best?.totalDay ?? 0,
            chosenStableDay: best?.totalStableDay ?? 0,
            delta: (best?.totalDay ?? 0) - (simplePkg?.totalDay ?? 0),
            choseIslandFeed: best?.mode === 'island-feed' || best?.mode === 'mix',
            chainBias: 1,
            recommended,
            objective: 'raw-silver-per-day'
        },
        faction: factionAnimal
            ? { key: factionAnimal.key, label: factionAnimal.label, plots: ctx.factionPlots, tier: ctx.factionTier }
            : null,
        cityCompare: [],
        ledger: options.skipLedger === true ? [] : listIslandLedger(ctx),
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
            factionPlots: city === options.islandCity ? options.factionPlots : 0,
            skipLedger: true
        });
        const main = mainSlot(plan.slots);
        out.push({
            city,
            totalDay: plan.totalDay,
            totalStableDay: plan.totalStableDay ?? null,
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

export { plotTypeLabel, mainSlot };
