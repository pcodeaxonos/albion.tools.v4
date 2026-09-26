import { getAll, replaceAllRows } from '../../db/store.js';
import { getDefaultCity } from '../../core/settings.js';
import { readJsonStorage, removeStorage } from '../../core/storage.js';
import { cityKey, parsePlan } from './model.js';

function legacyCityPlans(key) {
    const stored = readJsonStorage(key);
    if (!stored) {
        return { activeCity: null, plans: {} };
    }
    if (stored.plans && typeof stored.plans === 'object') {
        return { activeCity: stored.activeCity ?? null, plans: stored.plans };
    }

    const legacyCity = stored.islandCity || getDefaultCity();
    return {
        activeCity: legacyCity,
        plans: { [cityKey(legacyCity)]: stored }
    };
}

export function writePlanTable(tableName, plans, activeCity = null, hasActive = false) {
    const existing = getAll(tableName);
    const ids = new Map(existing.map((row) => [cityKey(row.city), row.id]));
    let nextId = existing.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    const now = new Date().toISOString();

    replaceAllRows(tableName, Object.entries(plans).map(([key, plan]) => ({
        id: ids.get(key) ?? nextId++,
        city: plan.islandCity || key,
        plan: JSON.stringify(plan),
        ...(hasActive ? { active: cityKey(activeCity) === key } : {}),
        updatedAt: now
    })));
}

export function readPlanTable(tableName, legacyKey, hasActive = false) {
    let rows = getAll(tableName);
    if (!rows.length) {
        const legacy = legacyCityPlans(legacyKey);
        if (Object.keys(legacy.plans).length) {
            writePlanTable(tableName, legacy.plans, legacy.activeCity, hasActive);
            removeStorage(legacyKey);
            rows = getAll(tableName);
        }
    }

    const plans = {};
    let activeCity = null;
    rows.forEach((row) => {
        const plan = parsePlan(row.plan);
        if (!plan || typeof plan !== 'object') {
            return;
        }
        plans[cityKey(row.city)] = plan;
        if (hasActive && row.active) {
            activeCity = row.city;
        }
    });
    return { activeCity, plans };
}
