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
    standardCombos: ['4.3', '5.2', '6.1'],
    enchantPowerOrder: {},
    defaultCity: 'Martlock',
    dataSync: true,
    islandCities: [],
    refineFollowSpecialty: false
};

function comboKey(combo) {
    return `${combo.tier}.${combo.enchant}`;
}

function parseComboKey(value) {
    const match = String(value ?? '').match(/^(\d+)\.(\d+)$/);
    if (!match) {
        return null;
    }
    const tier = Number(match[1]);
    const enchant = Number(match[2]);
    if (tier < 4 || tier > 8 || enchant < 1 || enchant > 3) {
        return null;
    }
    return { tier, enchant };
}

export function allEnchantCombos() {
    const combos = [];
    for (const tier of [4, 5, 6, 7, 8]) {
        for (const enchant of [1, 2, 3]) {
            combos.push({ tier, enchant });
        }
    }
    return combos;
}

export function normalizeStandardCombos(value) {
    if (!Array.isArray(value)) {
        return DEFAULT_SETTINGS.standardCombos.map(parseComboKey).filter(Boolean);
    }
    const listed = [];
    const seen = new Set();
    for (const entry of value) {
        const combo = typeof entry === 'string' ? parseComboKey(entry) : parseComboKey(comboKey(entry || {}));
        if (!combo) {
            continue;
        }
        const key = comboKey(combo);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        listed.push(combo);
    }
    return listed;
}

export function standardComboKeys(combos = getStandardCombos()) {
    return normalizeStandardCombos(combos).map(comboKey);
}

/** Ordered standard T.E combos from settings (add/remove/reorder). */
export function getStandardCombos(settings = getSettings()) {
    return normalizeStandardCombos(settings?.standardCombos);
}

export function normalizeEnchantPowerOrder(orderMap, power = DEFAULT_SETTINGS.enchantPower) {
    const target = normalizeEnchantPower(power);
    const defaults = enchantPowerCombos(target);
    const defaultKeys = defaults.map(comboKey);
    const raw = orderMap && typeof orderMap === 'object' ? orderMap[String(target)] : null;
    const listed = [];
    const seen = new Set();

    if (Array.isArray(raw)) {
        for (const entry of raw) {
            const combo = typeof entry === 'string' ? parseComboKey(entry) : entry;
            if (!combo) {
                continue;
            }
            const key = comboKey(combo);
            if (!defaultKeys.includes(key) || seen.has(key)) {
                continue;
            }
            seen.add(key);
            listed.push({ tier: combo.tier, enchant: combo.enchant });
        }
    }

    for (const combo of defaults) {
        const key = comboKey(combo);
        if (!seen.has(key)) {
            listed.push(combo);
        }
    }

    return listed;
}

/** @deprecated use getStandardCombos — kept for Enchanting/Royal callers */
export function orderedEnchantPowerCombos(power, orderMap) {
    if (orderMap == null && (power == null || power === getSettings().enchantPower)) {
        return getStandardCombos();
    }
    const settings = orderMap == null ? getSettings() : null;
    const target = normalizeEnchantPower(power ?? settings?.enchantPower);
    const map = orderMap ?? settings?.enchantPowerOrder ?? {};
    return normalizeEnchantPowerOrder(map, target);
}

export function enchantPowerOrderMapFromList(power, combos) {
    const target = normalizeEnchantPower(power);
    const ordered = normalizeEnchantPowerOrder({ [String(target)]: combos }, target);
    return { [String(target)]: ordered.map(comboKey) };
}

function migrateStandardCombos(parsed) {
    if (Array.isArray(parsed?.standardCombos)) {
        return normalizeStandardCombos(parsed.standardCombos);
    }
    const power = normalizeEnchantPower(parsed?.enchantPower);
    const fromOrder = normalizeEnchantPowerOrder(parsed?.enchantPowerOrder, power);
    if (fromOrder.length) {
        return fromOrder;
    }
    return normalizeStandardCombos(DEFAULT_SETTINGS.standardCombos);
}

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

function normalizeEnchantPowerOrderStore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const out = {};
    for (const [key, list] of Object.entries(value)) {
        const power = Number(key);
        if (!listEnchantPowers().includes(power)) {
            continue;
        }
        out[String(power)] = normalizeEnchantPowerOrder({ [String(power)]: list }, power).map(comboKey);
    }
    return out;
}

function normalizeDefaultCity(value) {
    const name = String(value ?? '').trim();
    return name || DEFAULT_SETTINGS.defaultCity;
}

/** Market API city name used when a tool has no saved city preference. */
export function getDefaultCity() {
    return normalizeDefaultCity(getSettings().defaultCity);
}

export function getSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                ...DEFAULT_SETTINGS,
                enchantPowerOrder: {},
                standardCombos: [...DEFAULT_SETTINGS.standardCombos]
            };
        }

        const parsed = JSON.parse(raw);
        const enchantPower = normalizeEnchantPower(parsed.enchantPower);
        const standardCombos = migrateStandardCombos(parsed).map(comboKey);
        return {
            premium: parsed.premium !== false,
            farmWater: parsed.farmWater === true,
            server: isServerId(parsed.server) ? parsed.server : DEFAULT_SETTINGS.server,
            priceSource: isPriceSource(parsed.priceSource) ? parsed.priceSource : DEFAULT_SETTINGS.priceSource,
            buyPriceSide: normalizePriceSide(parsed.buyPriceSide, DEFAULT_SETTINGS.buyPriceSide),
            sellPriceSide: normalizePriceSide(parsed.sellPriceSide, DEFAULT_SETTINGS.sellPriceSide),
            enchantPower,
            standardCombos,
            enchantPowerOrder: normalizeEnchantPowerOrderStore(parsed.enchantPowerOrder),
            defaultCity: normalizeDefaultCity(parsed.defaultCity),
            dataSync: parsed.dataSync !== false,
            islandCities: normalizeIslandCities(parsed.islandCities),
            refineFollowSpecialty: parsed.refineFollowSpecialty === true
        };
    } catch {
        return {
            ...DEFAULT_SETTINGS,
            enchantPowerOrder: {},
            standardCombos: [...DEFAULT_SETTINGS.standardCombos]
        };
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
    next.standardCombos = standardComboKeys(next.standardCombos);
    next.enchantPowerOrder = normalizeEnchantPowerOrderStore(next.enchantPowerOrder);
    next.defaultCity = normalizeDefaultCity(next.defaultCity);
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
