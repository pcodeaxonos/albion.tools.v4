import { localPriceHost, getSettings } from './settings.js';

export const PRICES_EVENT = 'albiontools:prices';

let source = null;
let lastAt = null;

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
    source = new EventSource(`${localPriceHost()}/api/v2/stats/price-updates`);
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

export function bindLivePrices(getWatch, reload, { packetSourceOnly = true, delayMs = 200 } = {}) {
    startPriceLive();
    let reloadTimer = 0;
    let latestDetail;
    const handler = (event) => {
        if (packetSourceOnly && getSettings().priceSource !== 'packets') {
            return;
        }
        const watch = typeof getWatch === 'function' ? getWatch() : getWatch;
        if (watch?.pause) {
            return;
        }
        if (!priceUpdateTouches(event.detail, watch || {})) {
            return;
        }
        const pending = latestDetail;
        latestDetail = { ...event.detail };
        for (const key of ['items', 'cities']) {
            const incoming = Array.isArray(event.detail?.[key]) ? event.detail[key] : [];
            const previous = Array.isArray(pending?.[key]) ? pending[key] : [];
            // Empty scopes mean every item/city, so keep that meaning across a burst.
            latestDetail[key] = pending && (!previous.length || !incoming.length)
                ? [] : [...new Set([...previous, ...incoming])];
        }
        // A fixed batching window keeps continuous packet traffic from delaying updates forever.
        if (reloadTimer) return;
        reloadTimer = window.setTimeout(() => {
            reloadTimer = 0;
            const detail = latestDetail;
            latestDetail = undefined;
            reload(detail);
        }, delayMs);
    };
    window.addEventListener(PRICES_EVENT, handler);
    return () => {
        window.clearTimeout(reloadTimer);
        window.removeEventListener(PRICES_EVENT, handler);
    };
}
