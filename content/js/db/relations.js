import { getAll } from './store.js';

const indexes = {
    itemsById: null,
    itemsByUnique: null,
    citiesById: null,
    citiesByApi: null
};

function buildItemIndexes() {
    const byId = new Map();
    const byUnique = new Map();
    for (const row of getAll('items')) {
        byId.set(Number(row.id), row);
        if (row.uniqueName) {
            byUnique.set(row.uniqueName, row);
        }
    }
    indexes.itemsById = byId;
    indexes.itemsByUnique = byUnique;
}

function buildCityIndexes() {
    const byId = new Map();
    const byApi = new Map();
    for (const row of getAll('cities')) {
        byId.set(Number(row.id), row);
        if (row.marketApiName) {
            byApi.set(row.marketApiName, row);
        }
    }
    indexes.citiesById = byId;
    indexes.citiesByApi = byApi;
}

export function invalidateRelationIndexes() {
    indexes.itemsById = null;
    indexes.itemsByUnique = null;
    indexes.citiesById = null;
    indexes.citiesByApi = null;
}

if (typeof window !== 'undefined') {
    window.addEventListener('albiontools:db-write', () => {
        invalidateRelationIndexes();
    });
}

export function getItemById(id) {
    if (id == null || id === '') {
        return null;
    }
    if (!indexes.itemsById) {
        buildItemIndexes();
    }
    return indexes.itemsById.get(Number(id)) ?? null;
}

export function getItemByUniqueName(uniqueName) {
    if (!uniqueName) {
        return null;
    }
    if (!indexes.itemsByUnique) {
        buildItemIndexes();
    }
    return indexes.itemsByUnique.get(uniqueName) ?? null;
}

export function getItemUniqueName(id) {
    return getItemById(id)?.uniqueName ?? null;
}

export function getItemLocalizedName(idOrUnique, fallback = '') {
    if (idOrUnique == null || idOrUnique === '') {
        return fallback;
    }
    if (typeof idOrUnique === 'number' || /^\d+$/.test(String(idOrUnique))) {
        return getItemById(idOrUnique)?.localizedName || fallback;
    }
    return getItemByUniqueName(idOrUnique)?.localizedName || fallback;
}

export function getCityById(id) {
    if (id == null || id === '') {
        return null;
    }
    if (!indexes.citiesById) {
        buildCityIndexes();
    }
    return indexes.citiesById.get(Number(id)) ?? null;
}

export function getCityByApiName(apiName) {
    if (!apiName) {
        return null;
    }
    if (!indexes.citiesByApi) {
        buildCityIndexes();
    }
    return indexes.citiesByApi.get(apiName) ?? null;
}

export function getCityApiName(id) {
    return getCityById(id)?.marketApiName ?? null;
}

export function getCityDisplayName(id) {
    const city = getCityById(id);
    return city?.displayName || city?.marketApiName || '';
}

export function getCityShortCode(id) {
    return getCityById(id)?.shortCode || '';
}
