import { getAnimals, getEconomyConstant, getIslandPlotsByLevel } from '../catalog.js';

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

export function baseYield() {
    return getEconomyConstant('base_yield', 4.5);
}

export function premiumYield() {
    return getEconomyConstant('premium_yield', 9);
}

export function cityYieldBonus() {
    return getEconomyConstant('city_yield_bonus', 0.1);
}

export function focusBase() {
    return getEconomyConstant('focus_base', 1000);
}

export function historyDays() {
    return getEconomyConstant('farm_history_days', 14);
}
