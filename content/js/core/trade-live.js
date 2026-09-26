import { localTradeHost } from './settings.js';

export const TRADES_EVENT = 'albiontools:trades';

let source = null;
let connected = false;
let lastAt = null;

export function isTradeLiveConnected() {
    return connected && source != null && source.readyState === EventSource.OPEN;
}

export function emitTradeLive(detail) {
    window.dispatchEvent(new CustomEvent(TRADES_EVENT, { detail }));
}

/**
 * Subscribe to SAT trade hub SSE.
 * Events: initial | added | error | status
 */
export function startTradeLive() {
    if (source) {
        return source;
    }
    if (typeof EventSource === 'undefined') {
        return null;
    }

    const url = `${localTradeHost()}/api/v1/trades/updates`;
    source = new EventSource(url);

    source.addEventListener('open', () => {
        connected = true;
        emitTradeLive({ type: 'connection', connected: true, at: new Date().toISOString() });
    });

    source.addEventListener('initial', (event) => {
        connected = true;
        try {
            const data = JSON.parse(event.data);
            lastAt = data.at || lastAt;
            emitTradeLive({ type: 'initial', ...data });
        } catch {
            // ignore bad frames
        }
    });

    source.addEventListener('added', (event) => {
        connected = true;
        try {
            const data = JSON.parse(event.data);
            lastAt = data.at || lastAt;
            emitTradeLive({ type: 'added', ...data });
        } catch {
            // ignore
        }
    });

    source.addEventListener('trade-error', (event) => {
        try {
            const data = JSON.parse(event.data);
            emitTradeLive({ type: 'error', message: data.message || 'Trade hub error' });
        } catch {
            // ignore
        }
    });

    source.addEventListener('status', (event) => {
        try {
            const data = JSON.parse(event.data);
            emitTradeLive({ type: 'status', ...data });
        } catch {
            // ignore
        }
    });

    source.onerror = () => {
        connected = false;
        emitTradeLive({ type: 'connection', connected: false, at: new Date().toISOString() });
        // EventSource reconnects automatically.
    };

    return source;
}

export function stopTradeLive() {
    if (source) {
        source.close();
        source = null;
    }
    connected = false;
}

/**
 * Optional REST snapshot (used if SSE has not delivered initial yet).
 */
export async function fetchTradeSnapshot(signal) {
    const response = await fetch(`${localTradeHost()}/api/v1/trades`, {
        signal,
        cache: 'no-store'
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Trade hub HTTP ${response.status}`);
    }
    return response.json();
}

export async function fetchTradeStatus(signal) {
    const response = await fetch(`${localTradeHost()}/api/v1/trades/status`, {
        signal,
        cache: 'no-store'
    });
    if (!response.ok) {
        throw new Error(`Trade hub status HTTP ${response.status}`);
    }
    return response.json();
}

export function bindTradeLive(handler) {
    startTradeLive();
    const wrapped = (event) => handler(event.detail);
    window.addEventListener(TRADES_EVENT, wrapped);
    return () => window.removeEventListener(TRADES_EVENT, wrapped);
}

export function getLastTradeEventAt() {
    return lastAt;
}
