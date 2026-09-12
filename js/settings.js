import { normalizePriceSide } from './price-side.js';
import {
    getPriceServers,
    getPriceSources,
    getEnchantPowers,
    getLocalPriceHost
} from './catalog.js';

const STORAGE_KEY = 'albiontools.v4.settings';

const FALLBACK_SERVERS = [
    { id: 'europe', label: 'Europe', host: 'https://europe.albion-online-data.com' },
    { id: 'west', label: 'Americas', host: 'https://west.albion-online-data.com' },
    { id: 'east', label: 'Asia', host: 'https://east.albion-online-data.com' }
];

const FALLBACK_SOURCES = [
    { id: 'api', label: 'AODP API' },
    { id: 'packets', label: 'Oyundaki paketler' }
];

const FALLBACK_POWERS = [5, 6, 7, 8, 9, 10, 11];

export function listServers() {
    const rows = getPriceServers();
    return rows.length ? rows : FALLBACK_SERVERS;
}

export function listPriceSources() {
    const rows = getPriceSources();
    return rows.length ? rows : FALLBACK_SOURCES;
}

export function listEnchantPowers() {
    const rows = getEnchantPowers();
    return rows.length ? rows : FALLBACK_POWERS;
}

/** Compat iterators for existing .map/.find/.some usage */
export const SERVERS = {
    [Symbol.iterator]: function* () { yield* listServers(); },
    map(...args) { return listServers().map(...args); },
    find(...args) { return listServers().find(...args); },
    some(...args) { return listServers().some(...args); },
    get length() { return listServers().length; },
    get 0() { return listServers()[0]; }
};

export const PRICE_SOURCES = {
    [Symbol.iterator]: function* () { yield* listPriceSources(); },
    map(...args) { return listPriceSources().map(...args); },
    find(...args) { return listPriceSources().find(...args); },
    some(...args) { return listPriceSources().some(...args); },
    get length() { return listPriceSources().length; }
};

export const ENCHANT_POWERS = {
    [Symbol.iterator]: function* () { yield* listEnchantPowers(); },
    map(...args) { return listEnchantPowers().map(...args); },
    includes(value) { return listEnchantPowers().includes(value); },
    get length() { return listEnchantPowers().length; }
};

export function localPriceHost() {
    return getLocalPriceHost();
}

/** @deprecated use localPriceHost() — static fallback for early imports */
export const LOCAL_PRICE_HOST = 'http://127.0.0.1:3001';

export const DEFAULT_SETTINGS = {
    premium: true,
    farmWater: false,
    server: 'europe',
    priceSource: 'api',
    buyPriceSide: 'buy',
    sellPriceSide: 'sell',
    enchantPower: 7,
    dataSync: true,
    islandCities: [],
    refineFollowSpecialty: false
};

export function normalizeIslandCities(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set();
    const cities = [];
    for (const entry of value) {
        const name = String(entry ?? '').trim();
        if (!name || seen.has(name)) {
            continue;
        }
        seen.add(name);
        cities.push(name);
    }
    return cities;
}

/** Empty list means every city has an island (no surprise dimming). */
export function cityHasIsland(apiName, islandCities = getSettings().islandCities) {
    const list = normalizeIslandCities(islandCities);
    if (list.length === 0) {
        return true;
    }
    return list.includes(String(apiName ?? ''));
}

export function normalizeEnchantPower(value) {
    const power = Number(value);
    return listEnchantPowers().includes(power) ? power : DEFAULT_SETTINGS.enchantPower;
}

export function enchantPowerCombos(power) {
    const target = normalizeEnchantPower(power);
    const combos = [];
    for (const tier of [4, 5, 6, 7, 8]) {
        const enchant = target - tier;
        if (enchant >= 1 && enchant <= 3) {
            combos.push({ tier, enchant });
        }
    }
    return combos;
}

export function enchantPowerLabel(power) {
    const target = normalizeEnchantPower(power);
    const combos = enchantPowerCombos(target)
        .map((combo) => `${combo.tier}.${combo.enchant}`)
        .join(' · ');
    return combos ? `${target} — ${combos}` : String(target);
}

function isServerId(value) {
    return listServers().some((server) => server.id === value);
}

function isPriceSource(value) {
    return listPriceSources().some((source) => source.id === value);
}

export function getSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_SETTINGS };
        }

        const parsed = JSON.parse(raw);
        return {
            premium: parsed.premium !== false,
            farmWater: parsed.farmWater === true,
            server: isServerId(parsed.server) ? parsed.server : DEFAULT_SETTINGS.server,
            priceSource: isPriceSource(parsed.priceSource) ? parsed.priceSource : DEFAULT_SETTINGS.priceSource,
            buyPriceSide: normalizePriceSide(parsed.buyPriceSide, DEFAULT_SETTINGS.buyPriceSide),
            sellPriceSide: normalizePriceSide(parsed.sellPriceSide, DEFAULT_SETTINGS.sellPriceSide),
            enchantPower: normalizeEnchantPower(parsed.enchantPower),
            dataSync: parsed.dataSync !== false,
            islandCities: normalizeIslandCities(parsed.islandCities),
            refineFollowSpecialty: parsed.refineFollowSpecialty === true
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(partial) {
    const next = { ...getSettings(), ...partial };
    if (!isServerId(next.server)) {
        next.server = DEFAULT_SETTINGS.server;
    }
    if (!isPriceSource(next.priceSource)) {
        next.priceSource = DEFAULT_SETTINGS.priceSource;
    }
    next.premium = Boolean(next.premium);
    next.farmWater = Boolean(next.farmWater);
    next.buyPriceSide = normalizePriceSide(next.buyPriceSide, DEFAULT_SETTINGS.buyPriceSide);
    next.sellPriceSide = normalizePriceSide(next.sellPriceSide, DEFAULT_SETTINGS.sellPriceSide);
    next.enchantPower = normalizeEnchantPower(next.enchantPower);
    next.dataSync = next.dataSync !== false;
    next.islandCities = normalizeIslandCities(next.islandCities);
    next.refineFollowSpecialty = Boolean(next.refineFollowSpecialty);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
}

export function getServer() {
    const id = getSettings().server;
    return listServers().find((server) => server.id === id) ?? listServers()[0];
}

export function getPriceHost() {
    return getSettings().priceSource === 'packets' ? localPriceHost() : getServer().host;
}
