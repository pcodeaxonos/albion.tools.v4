import { LOCAL_PRICE_HOST, getSettings } from './settings.js';

export const PRICES_EVENT = 'albiontools:prices';

let source = null;
let lastAt = null;
let reloadTimer = 0;

export function priceUpdateTouches(detail, { items = [], cities = [] } = {}) {
    if (!detail) {
        return false;
    }
    const incomingItems = Array.isArray(detail.items) ? detail.items : [];
    const incomingCities = Array.isArray(detail.cities) ? detail.cities : [];
    const itemHit = items.length === 0 || incomingItems.length === 0
        || incomingItems.some((id) => items.includes(id));
    const cityHit = cities.length === 0 || incomingCities.length === 0
        || incomingCities.some((city) => cities.includes(city));
    return itemHit && cityHit;
}

export function emitPriceUpdate(detail) {
    if (!detail?.at || detail.at === lastAt) {
        return false;
    }
    lastAt = detail.at;
    window.dispatchEvent(new CustomEvent(PRICES_EVENT, { detail }));
    return true;
}

export function noteHubSnapshot(hub) {
    if (!hub?.lastIngestAt) {
        return;
    }
    if (lastAt == null) {
        lastAt = hub.lastIngestAt;
        return;
    }
    emitPriceUpdate({
        at: hub.lastIngestAt,
        items: hub.lastItems ?? [],
        cities: hub.lastCities ?? [],
        orders: hub.orders ?? 0,
        source: 'poll'
    });
}

export function startPriceLive() {
    if (source) {
        return;
    }
    if (typeof EventSource === 'undefined') {
        return;
    }
    source = new EventSource(`${LOCAL_PRICE_HOST}/api/v2/stats/events`);
    source.addEventListener('market', (event) => {
        try {
            emitPriceUpdate({ ...JSON.parse(event.data), source: 'live' });
        } catch {
            // ignore bad frames
        }
    });
    source.onerror = () => {
        // EventSource reconnects on its own.
    };
}

export function bindLivePrices(getWatch, reload) {
    startPriceLive();
    const handler = (event) => {
        if (getSettings().priceSource !== 'packets') {
            return;
        }
        const watch = typeof getWatch === 'function' ? getWatch() : getWatch;
        if (watch?.pause) {
            return;
        }
        if (!priceUpdateTouches(event.detail, watch || {})) {
            return;
        }
        window.clearTimeout(reloadTimer);
        reloadTimer = window.setTimeout(() => {
            reload(event.detail);
        }, 200);
    };
    window.addEventListener(PRICES_EVENT, handler);
    return () => window.removeEventListener(PRICES_EVENT, handler);
}
