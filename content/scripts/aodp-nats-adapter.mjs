import net from 'node:net';
import { gunzipSync } from 'node:zlib';
import { MARKET_COLLECTION_POLICY } from '../js/core/market-history-config.mjs';

/**
 * AODP publishes observed orders, not a book snapshot. The project documents that a new
 * subscriber has missed earlier orders and that completion is only inferred after hours.
 * One order, or a partial set, is therefore not a best Buy or Sell price.
 */
export const NATS_BOOK_LIMIT = Object.freeze({
    snapshotAvailable: false,
    reason: 'NATS marketorders.deduped has no snapshot and no delete event. Absence is not a cancellation until the documented multi-hour timeout.'
});

export function parseNatsEndpoint(value) {
    const url = new URL(value);
    return {
        host: url.hostname,
        port: Number(url.port),
        user: decodeURIComponent(url.username),
        pass: decodeURIComponent(url.password)
    };
}

export function ordersFromPayload(payload) {
    let bytes = payload;
    if (payload?.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) {
        try { bytes = gunzipSync(payload); } catch { return { orders: [], invalid: true, shape: 'gzip' }; }
    }
    let data;
    try { data = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes)); }
    catch { return { orders: [], invalid: true, shape: 'text' }; }
    if (Array.isArray(data)) return { orders: data, invalid: false, shape: 'array' };
    if (Array.isArray(data?.Orders)) return { orders: data.Orders, invalid: false, shape: 'upload' };
    if (data && (data.Id || data.ItemTypeId)) return { orders: [data], invalid: false, shape: 'order' };
    return { orders: [], invalid: true, shape: 'object' };
}

export function describeMarketOrder(order, { now = Date.now(), locationNames = new Map(), citySet = new Set() } = {}) {
    if (!order || typeof order !== 'object') return { valid: false, reason: 'malformed' };
    let itemId = order.ItemTypeId || order.ItemId || null;
    const enchant = Number(order.EnchantmentLevel) || 0;
    if (itemId && enchant > 0 && !String(itemId).includes('@')) itemId = `${itemId}@${enchant}`;
    const locationId = Number(order.LocationId ?? order.LocationID);
    const city = locationNames.get(locationId) || null;
    const auction = String(order.AuctionType || '').toLowerCase();
    const side = auction === 'offer' ? 'sell' : auction === 'request' ? 'buy' : null;
    const price = Number(order.UnitPriceSilver ?? order.Price);
    const amount = Number(order.Amount);
    const expires = Date.parse(order.Expires || '');
    if (!itemId || !side || !(price > 0) || !Number.isFinite(amount)) return { valid: false, reason: 'invalid-fields' };
    if (order.IsFinished === true || amount <= 0) return { valid: false, reason: 'closed', id: order.Id ?? null, itemId, city, side };
    if (Number.isFinite(expires) && expires <= now) return { valid: false, reason: 'expired', id: order.Id ?? null, itemId, city, side };
    return {
        valid: true, id: order.Id ?? null, itemId, city, inScope: Boolean(city && citySet.has(city)),
        side, price, amount, quality: Number(order.QualityLevel) || 1, locationId, expires
    };
}

/** Partial books stay unreliable. Callers must not turn the result into a stored quote. */
export function assessNatsBook(orders) {
    const live = (orders || []).filter((order) => order?.valid && order.amount > 0);
    return {
        reliable: false,
        reason: live.length <= 1 ? 'single-or-empty' : NATS_BOOK_LIMIT.reason,
        orders: live.length,
        bestBuy: null,
        bestSell: null
    };
}

/** Packet history and REST stay authoritative. A NATS price never fills a missing REST quote. */
export function chooseMarketQuote({ restPrice = null } = {}) {
    return restPrice > 0 ? { price: restPrice, source: 'aodp-current' } : { price: null, source: null };
}

export function createNatsFrameParser(onFrame) {
    let buffer = Buffer.alloc(0);
    return {
        push(chunk) {
            buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
            for (;;) {
                const split = buffer.indexOf('\r\n');
                if (split < 0) return;
                const header = buffer.subarray(0, split).toString('utf8');
                if (header.startsWith('MSG ') || header.startsWith('HMSG ')) {
                    const parts = header.split(' ');
                    const size = Number(parts[header.startsWith('HMSG ') ? parts.length - 1 : parts.length - 1]);
                    const headerSize = header.startsWith('HMSG ') ? Number(parts[parts.length - 2]) : 0;
                    if (!Number.isFinite(size) || size < 0 || size > 8 * 1024 * 1024) {
                        onFrame({ type: 'error', message: 'NATS message size rejected' });
                        buffer = buffer.subarray(split + 2);
                        continue;
                    }
                    const total = split + 2 + size + 2;
                    if (buffer.length < total) return;
                    const payload = buffer.subarray(split + 2 + (Number.isFinite(headerSize) ? headerSize : 0), split + 2 + size);
                    onFrame({ type: 'msg', subject: parts[1], payload });
                    buffer = buffer.subarray(total);
                    continue;
                }
                buffer = buffer.subarray(split + 2);
                if (header === 'PING') onFrame({ type: 'ping' });
                else if (header.startsWith('INFO')) onFrame({ type: 'info', header });
                else if (header.startsWith('-ERR')) onFrame({ type: 'error', message: header });
            }
        }
    };
}

function emptyStats() {
    return {
        status: 'off', messages: 0, validOrders: 0, invalidOrders: 0, duplicateOrders: 0,
        items: 0, cells: 0, buy: 0, sell: 0, inScope: 0, outOfScope: 0,
        cities: {}, qualities: {}, shapes: {}, reasons: {},
        singleOrderCells: 0, multiOrderCells: 0, reliableBooks: 0,
        reconnects: 0, delayKnown: false, dedupeWindowMs: MARKET_COLLECTION_POLICY.dedupeWindowMs,
        firstOrderKeys: null, lastMessageAt: null, lastError: null
    };
}

export function createNatsMarketAdapter({
    mode = 'off', endpoint, subject = 'marketorders.deduped', locationNames = new Map(), cities = [],
    onDiscovery = () => {}, now = Date.now, connect = net.connect, log = () => {},
    timers = { setTimeout, clearTimeout }
} = {}) {
    const stats = emptyStats();
    const seenOrders = new Map();
    const cellOrders = new Map();
    const citySet = new Set(cities);
    let socket = null, stopped = true, timer = null, attempt = 0;
    const parser = createNatsFrameParser(onFrame);

    function cellKey(order) {
        return `${order.itemId}|${order.city || order.locationId}|${order.quality}|${order.side}`;
    }

    function onFrame(frame) {
        if (frame.type === 'ping') { socket?.write('PONG\r\n'); return; }
        if (frame.type === 'error') { stats.lastError = frame.message; stats.status = 'error'; return; }
        if (frame.type !== 'msg') return;
        stats.messages += 1;
        stats.lastMessageAt = new Date(now()).toISOString();
        const parsed = ordersFromPayload(frame.payload);
        stats.shapes[parsed.shape] = (stats.shapes[parsed.shape] || 0) + 1;
        if (parsed.invalid) { stats.invalidOrders += 1; return; }
        const found = [];
        for (const raw of parsed.orders) {
            if (!stats.firstOrderKeys && raw && typeof raw === 'object') stats.firstOrderKeys = Object.keys(raw).slice(0, 24);
            const order = describeMarketOrder(raw, { now: now(), locationNames, citySet });
            if (!order.valid) {
                stats.invalidOrders += 1;
                stats.reasons[order.reason] = (stats.reasons[order.reason] || 0) + 1;
                if (order.reason === 'closed' || order.reason === 'expired') {
                    const key = cellKey(order);
                    cellOrders.get(key)?.delete(order.id);
                }
                continue;
            }
            const identity = `${order.id}|${order.itemId}|${order.price}|${order.amount}`;
            if (order.id != null && seenOrders.has(identity)) { stats.duplicateOrders += 1; continue; }
            if (order.id != null) seenOrders.set(identity, now());
            stats.validOrders += 1;
            stats[order.side] += 1;
            stats.qualities[order.quality] = (stats.qualities[order.quality] || 0) + 1;
            if (order.inScope) {
                stats.inScope += 1;
                stats.cities[order.city] = (stats.cities[order.city] || 0) + 1;
                found.push(order.itemId);
                const key = cellKey(order);
                if (!cellOrders.has(key)) cellOrders.set(key, new Map());
                cellOrders.get(key).set(order.id ?? `${order.price}:${stats.validOrders}`, order);
            } else stats.outOfScope += 1;
        }
        if (found.length) onDiscovery([...new Set(found)]);
    }

    function summarizeBooks() {
        let single = 0, multi = 0;
        for (const book of cellOrders.values()) {
            const live = [...book.values()].filter((order) => order.amount > 0);
            if (live.length <= 1) single += 1;
            else multi += 1;
        }
        stats.singleOrderCells = single;
        stats.multiOrderCells = multi;
        stats.items = new Set([...cellOrders.keys()].map((key) => key.split('|')[0])).size;
        stats.cells = cellOrders.size;
        stats.reliableBooks = 0;
    }

    function scheduleReconnect() {
        if (stopped || mode !== 'telemetry') return;
        const delay = Math.min(60_000, 1000 * 2 ** attempt);
        attempt += 1;
        stats.reconnects += 1;
        stats.status = 'reconnecting';
        timer = timers.setTimeout(open, delay);
        timer.unref?.();
    }

    function open() {
        if (stopped || !endpoint) return;
        const target = parseNatsEndpoint(endpoint);
        stats.status = 'connecting';
        socket = connect(target.port, target.host);
        socket.on('connect', () => {
            attempt = 0;
            stats.status = 'live';
            const connectFrame = JSON.stringify({
                verbose: false, pedantic: false, protocol: 1,
                user: target.user, pass: target.pass, lang: 'node', version: '4', name: 'albion.tools'
            });
            socket.write(`CONNECT ${connectFrame}\r\nSUB ${subject} 1\r\nPING\r\n`);
        });
        socket.on('data', (chunk) => parser.push(chunk));
        socket.on('error', (error) => { stats.lastError = error.message; stats.status = 'error'; });
        socket.on('close', () => { socket = null; if (!stopped) scheduleReconnect(); });
    }

    return {
        stats,
        start() {
            if (mode !== 'telemetry' || !endpoint) { stats.status = 'off'; return; }
            stopped = false;
            open();
        },
        stop() { stopped = true; timers.clearTimeout(timer); socket?.destroy(); stats.status = 'off'; },
        snapshot() { summarizeBooks(); return { ...stats, cities: { ...stats.cities }, bookLimit: NATS_BOOK_LIMIT }; },
        ingest(payload) { onFrame({ type: 'msg', subject, payload: Buffer.from(payload) }); summarizeBooks(); }
    };
}
