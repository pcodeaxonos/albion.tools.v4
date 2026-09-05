import { normalizePriceSide } from './price-side.js';

const STORAGE_KEY = 'albiontools.v4.settings';

export const SERVERS = [
    { id: 'europe', label: 'Europe', host: 'https://europe.albion-online-data.com' },
    { id: 'west', label: 'Americas', host: 'https://west.albion-online-data.com' },
    { id: 'east', label: 'Asia', host: 'https://east.albion-online-data.com' }
];

export const PRICE_SOURCES = [
    { id: 'api', label: 'AODP API' },
    { id: 'packets', label: 'Oyundaki paketler' }
];

export const LOCAL_PRICE_HOST = 'http://127.0.0.1:3001';

export const ENCHANT_POWERS = [5, 6, 7, 8, 9, 10, 11];

export const DEFAULT_SETTINGS = {
    premium: true,
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
    return ENCHANT_POWERS.includes(power) ? power : DEFAULT_SETTINGS.enchantPower;
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
    return SERVERS.some((server) => server.id === value);
}

function isPriceSource(value) {
    return PRICE_SOURCES.some((source) => source.id === value);
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
    return SERVERS.find((server) => server.id === id) ?? SERVERS[0];
}

export function getPriceHost() {
    return getSettings().priceSource === 'packets' ? LOCAL_PRICE_HOST : getServer().host;
}
