import { readStorage, writeStorage } from './storage.js';

export function cityNames(cities) {
    return (cities || []).map((city) => city.marketApiName).filter(Boolean);
}

export function cityLabel(cities, apiName) {
    return (cities || []).find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

export function resolveCity(cities, preferred) {
    const list = cities || [];
    if (list.some((city) => city.marketApiName === preferred)) {
        return preferred;
    }
    return list[0]?.marketApiName ?? preferred;
}

export function readStoredCity(storageKey, cities, preferred) {
    const saved = readStorage(storageKey);
    if ((cities || []).some((city) => city.marketApiName === saved)) {
        return saved;
    }
    return resolveCity(cities, preferred);
}

export function saveStoredCity(storageKey, apiName) {
    return writeStorage(storageKey, apiName);
}
