/**
 * Local market-price hub.
 *
 * Albion Data Client already decodes game packets. Point it here with
 * `-i http://127.0.0.1:3001` and this process stores the orders, then
 * serves the same /api/v2/stats/prices shape the tools already call.
 */

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = Number(process.env.PRICE_HUB_PORT) || 3001;
const HOST = process.env.PRICE_HUB_HOST || '127.0.0.1';
const CACHE_PATH = join(ROOT, '.price-hub.json');
const LOCAL_DATA_PATH = join(ROOT, '.albion-tools-data.json');
const LOCAL_DATA_KIND = 'albion.tools.local-data';
const LOCAL_DATA_VERSION = 1;
const LOCAL_DATA_PREFIX = 'albiontools.v4.';
const LOCAL_DATA_CLOCK_KEY = LOCAL_DATA_PREFIX + '_syncClock';
const LOCAL_DATA_MAX_BYTES = 50 * 1024 * 1024;
const LOCATIONS_PATH = join(ROOT, 'data', 'locations.json');
const ADC_IMAGE = 'albiondata-client.exe';
const ADC_PROCESS_TTL_MS = 4000;
const execFileAsync = promisify(execFile);
const SILVER_SCALE = 10000;
const EMPTY_DATE = '0001-01-01T00:00:00';
const CITY_NAMES = new Set([
    'Bridgewatch',
    'Fort Sterling',
    'Lymhurst',
    'Martlock',
    'Thetford',
    'Caerleon',
    'Brecilien',
    'Black Market'
]);

const locationToCity = buildLocationMap();
const books = new Map();
const startedAt = new Date().toISOString();
let lastIngestAt = null;
let lastClientAt = null;
let lastIngestPath = null;
let lastPowAt = null;
let cachedMarketAt = null;
let sessionMarketAt = null;
let sessionClientAt = null;
let sessionDroppedMarketAt = null;
let ingestCount = 0;
let lastItems = [];
let lastCities = [];
let unknownLocations = [];
let persistTimer = null;
let localDataSnapshot = null;
let adcProcessCache = { at: 0, running: null };
const sseClients = new Set();

loadCache();
loadLocalDataFile();

const server = createServer((req, res) => {
    applyCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';

    Promise.resolve()
        .then(() => route(req, res, url, path))
        .catch((error) => {
            console.error(error);
            sendJson(res, 500, { error: 'Hub hatası' });
        });
});

server.on('error', (error) => {
    console.error(error);
});

server.listen(PORT, HOST, () => {
    console.log(`Fiyat hub  http://${HOST}:${PORT}`);
    console.log(`AODP client: albiondata-client.exe -i http://${HOST}:${PORT}`);
});

function applyCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function route(req, res, url, path) {
    if (req.method === 'GET' && path === '/pow') {
        notePow();
        sendJson(res, 200, { key: 'local', wanted: '' });
        return;
    }

    if (req.method === 'GET' && (path === '/' || path === '/api/v2/stats/status')) {
        pruneExpired();
        sendJson(res, 200, statusPayload(await adcProcessRunning()));
        return;
    }

    if (req.method === 'GET' && path === '/api/v2/stats/events') {
        attachSse(req, res);
        return;
    }

    const priceMatch = path.match(/^\/api\/v2\/stats\/prices\/(.+?)(?:\.json)?$/);
    if (req.method === 'GET' && priceMatch) {
        pruneExpired();
        sendJson(res, 200, priceRows(priceMatch[1], url.searchParams));
        return;
    }

    if (req.method === 'GET' && path === '/api/v1/local-data/meta') {
        sendJson(res, 200, localDataMeta());
        return;
    }

    if (req.method === 'GET' && path === '/api/v1/local-data') {
        if (!localDataSnapshot) {
            sendJson(res, 404, { error: 'Kayıt yok', empty: true });
            return;
        }
        sendJson(res, 200, localDataSnapshot);
        return;
    }

    if (req.method === 'PUT' && path === '/api/v1/local-data') {
        const body = await readBody(req, LOCAL_DATA_MAX_BYTES);
        const snapshot = parseLocalDataSnapshot(body);
        if (!snapshot) {
            sendJson(res, 400, { error: 'Geçersiz veri paketi' });
            return;
        }
        saveLocalDataFile(mergeLocalDataSnapshots(localDataSnapshot, snapshot));
        sendJson(res, 200, { ok: true, ...localDataMeta() });
        return;
    }

    if (req.method === 'POST' && isIngestPath(path)) {
        const body = await readBody(req);
        noteClient(path);
        if (isMarketOrdersPath(path)) {
            const payload = path.includes('/pow/') ? parsePowBody(body) : parseJsonBody(body);
            const added = ingestMarketUpload(payload);
            if (added === 0) {
                noteDroppedMarket();
            }
            sendJson(res, 200, { ok: true, orders: added });
            return;
        }
        sendJson(res, 200, { ok: true, ignored: true });
        return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
        await readBody(req).catch(() => '');
    }
    sendJson(res, 404, { error: 'Not found' });
}

function ingestTopic(path) {
    const name = path.split('/').pop() ?? '';
    return name.endsWith('.ingest') ? name : '';
}

function isIngestPath(path) {
    return Boolean(ingestTopic(path)) || isMarketOrdersPath(path);
}

function isMarketOrdersPath(path) {
    const topic = ingestTopic(path);
    return (
        topic === 'marketorders.ingest' ||
        path === '/api/v1/stats/MarketOrders' ||
        path.toLowerCase() === '/api/v1/stats/marketorders'
    );
}

function statusPayload(adcProcess = null) {
    let orderCount = 0;
    const cities = new Set();
    for (const book of books.values()) {
        orderCount += book.orders.size;
        cities.add(book.city);
    }

    return {
        ok: true,
        host: `http://${HOST}:${PORT}`,
        startedAt,
        lastIngestAt,
        lastClientAt,
        lastIngestPath,
        lastPowAt,
        cachedMarketAt,
        sessionMarketAt,
        sessionClientAt,
        sessionDroppedMarketAt,
        adcProcess,
        lastItems,
        lastCities,
        unknownLocations,
        ingestCount,
        books: books.size,
        orders: orderCount,
        cities: [...cities].sort()
    };
}

async function adcProcessRunning() {
    const now = Date.now();
    if (now - adcProcessCache.at < ADC_PROCESS_TTL_MS) {
        return adcProcessCache.running;
    }

    let running = null;
    try {
        if (process.platform === 'win32') {
            const { stdout } = await execFileAsync(
                'tasklist',
                ['/FI', `IMAGENAME eq ${ADC_IMAGE}`, '/FO', 'CSV', '/NH'],
                { windowsHide: true, timeout: 2500 }
            );
            running = String(stdout).toLowerCase().includes('albiondata-client.exe');
        } else {
            try {
                await execFileAsync('pgrep', ['-f', 'albiondata-client'], { timeout: 2500 });
                running = true;
            } catch (error) {
                running = error && error.code === 1 ? false : null;
            }
        }
    } catch {
        running = null;
    }

    adcProcessCache = { at: now, running };
    return running;
}

function noteClient(path) {
    const now = new Date().toISOString();
    lastClientAt = now;
    sessionClientAt = now;
    lastIngestPath = path;
}

function notePow() {
    const now = new Date().toISOString();
    lastPowAt = now;
    sessionClientAt = sessionClientAt ?? now;
}

function rememberUnknownLocation(raw) {
    const id = String(raw ?? '').trim();
    const label = !id || id === 'null' || id === 'undefined' ? '(boş)' : id;
    unknownLocations = [...new Set([...unknownLocations, label])].slice(-8);
}

function noteDroppedMarket() {
    sessionDroppedMarketAt = new Date().toISOString();
    const loc = unknownLocations.length > 0 ? ` · konum ${unknownLocations.slice(-3).join(', ')}` : '';
    console.log(`market düştü: boş veya şehir yok${loc}`);
}

function priceRows(rawIds, params) {
    const itemIds = rawIds
        .split(',')
        .map((id) => decodeURIComponent(id).trim())
        .filter(Boolean);
    const locations = splitCsv(params.get('locations'));
    const qualities = splitCsv(params.get('qualities')).map(Number).filter(Number.isFinite);
    const qualityFilter = qualities.length > 0 ? new Set(qualities) : null;
    const locationFilter = locations.length > 0 ? new Set(locations) : null;
    const rows = [];

    for (const itemId of itemIds) {
        const cities = locationFilter ? [...locationFilter] : citiesForItem(itemId);
        for (const city of cities) {
            const qualitiesToEmit = qualityFilter ? [...qualityFilter] : qualitiesForItemCity(itemId, city);
            for (const quality of qualitiesToEmit.length > 0 ? qualitiesToEmit : [1]) {
                rows.push(aggregateRow(itemId, city, quality));
            }
        }
    }

    return rows;
}

function citiesForItem(itemId) {
    const cities = new Set();
    for (const book of books.values()) {
        if (book.itemId === itemId) {
            cities.add(book.city);
        }
    }
    return [...cities];
}

function qualitiesForItemCity(itemId, city) {
    const qualities = new Set();
    for (const book of books.values()) {
        if (book.itemId === itemId && book.city === city) {
            qualities.add(book.quality);
        }
    }
    return [...qualities];
}

function aggregateRow(itemId, city, quality) {
    const offer = books.get(bookKey(itemId, city, quality, 'offer'));
    const request = books.get(bookKey(itemId, city, quality, 'request'));
    const sell = extrema(offer, 'min');
    const sellMax = extrema(offer, 'max');
    const buy = extrema(request, 'min');
    const buyMax = extrema(request, 'max');

    return {
        item_id: itemId,
        city,
        quality,
        sell_price_min: sell.price,
        sell_price_min_date: sell.date,
        sell_price_max: sellMax.price,
        sell_price_max_date: sellMax.date,
        buy_price_min: buy.price,
        buy_price_min_date: buy.date,
        buy_price_max: buyMax.price,
        buy_price_max_date: buyMax.date
    };
}

function extrema(book, kind) {
    if (!book || book.orders.size === 0) {
        return { price: 0, date: EMPTY_DATE };
    }

    let chosen = null;
    for (const order of book.orders.values()) {
        if (!chosen) {
            chosen = order;
            continue;
        }
        if (kind === 'min' ? order.price < chosen.price : order.price > chosen.price) {
            chosen = order;
        }
    }

    return {
        price: chosen.price,
        date: chosen.seenAt
    };
}

function ingestMarketUpload(payload) {
    const orders = Array.isArray(payload)
        ? payload
        : payload?.Orders ?? payload?.orders ?? [];
    if (!Array.isArray(orders) || orders.length === 0) {
        return 0;
    }

    const seenAt = new Date().toISOString();
    const snapshots = new Map();

    for (const raw of orders) {
        const parsed = normalizeOrder(raw, seenAt);
        if (!parsed) {
            const loc = raw.LocationId ?? raw.location_id ?? raw.LocationID;
            if (!cityFromLocation(loc)) {
                rememberUnknownLocation(loc);
            }
            continue;
        }
        const key = bookKey(parsed.itemId, parsed.city, parsed.quality, parsed.side);
        if (!snapshots.has(key)) {
            snapshots.set(key, []);
        }
        snapshots.get(key).push(parsed);
    }

    for (const [key, batch] of snapshots) {
        const sample = batch[0];
        const book = {
            itemId: sample.itemId,
            city: sample.city,
            quality: sample.quality,
            side: sample.side,
            orders: new Map(batch.map((order) => [order.id, order]))
        };
        books.set(key, book);
    }

    if (snapshots.size === 0) {
        return 0;
    }

    lastIngestAt = seenAt;
    sessionMarketAt = seenAt;
    ingestCount += 1;
    lastItems = [...new Set([...snapshots.values()].map((batch) => batch[0].itemId))];
    lastCities = [...new Set([...snapshots.values()].map((batch) => batch[0].city))].sort();
    schedulePersist();
    broadcastMarket({
        at: seenAt,
        items: lastItems,
        cities: lastCities,
        books: snapshots.size,
        orders: orders.length
    });
    console.log(`ingest ${snapshots.size} kitap · ${orders.length} sipariş`);
    return snapshots.size;
}

function attachSse(req, res) {
    req.socket.setTimeout(0);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    res.write(':\n\n');
    sseClients.add(res);
    const ping = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(ping);
            return;
        }
        res.write(':\n\n');
    }, 20000);
    req.on('close', () => {
        clearInterval(ping);
        sseClients.delete(res);
    });
}

function broadcastMarket(payload) {
    const frame = `event: market\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of [...sseClients]) {
        try {
            client.write(frame);
        } catch {
            sseClients.delete(client);
        }
    }
}

function normalizeOrder(raw, seenAt) {
    const itemId = String(raw.ItemTypeId ?? raw.item_id ?? raw.itemId ?? '').trim();
    const city = cityFromLocation(raw.LocationId ?? raw.location_id ?? raw.LocationID);
    const price = toSilver(raw.UnitPriceSilver ?? raw.unit_price_silver ?? raw.Price ?? raw.price);
    const quality = Number(raw.QualityLevel ?? raw.quality ?? 1) || 1;
    const side = auctionSide(raw.AuctionType ?? raw.auction_type);
    const id = String(raw.Id ?? raw.id ?? `${itemId}|${city}|${price}|${raw.Amount ?? ''}`);
    const expires = parseDate(raw.Expires ?? raw.expires);

    if (!itemId || !city || !side || !(price > 0)) {
        return null;
    }

    if (expires && expires.getTime() <= Date.now()) {
        return null;
    }

    return {
        id,
        itemId: withEnchantment(itemId, raw.EnchantmentLevel ?? raw.enchantment),
        city,
        quality,
        side,
        price,
        seenAt,
        expiresAt: expires ? expires.toISOString() : null
    };
}

function withEnchantment(itemId, enchantment) {
    if (itemId.includes('@')) {
        return itemId;
    }
    const level = Number(enchantment);
    if (level > 0) {
        return `${itemId}@${level}`;
    }
    return itemId;
}

function auctionSide(value) {
    const type = String(value ?? '').toLowerCase();
    if (type === 'offer' || type === 'sell') {
        return 'offer';
    }
    if (type === 'request' || type === 'buy') {
        return 'request';
    }
    return null;
}

function toSilver(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        return 0;
    }
    if (n >= SILVER_SCALE && n % SILVER_SCALE === 0) {
        return n / SILVER_SCALE;
    }
    return Math.round(n);
}

function parseDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function cityFromLocation(raw) {
    const id = normalizeLocationId(raw);
    if (!id) {
        return null;
    }
    return locationToCity.get(id) ?? locationToCity.get(id.toLowerCase()) ?? null;
}

function normalizeLocationId(raw) {
    if (raw == null || raw === '') {
        return '';
    }
    let id = String(raw).trim();
    if (!id || id === 'null' || id === 'undefined') {
        return '';
    }
    if (id.includes('@')) {
        id = id.split('@').pop();
        id = id.replace(/^BLACKBANK-/i, '');
    }
    return id;
}

function buildLocationMap() {
    const map = new Map();

    const alias = (from, city) => {
        for (const key of locationKeys(from)) {
            map.set(key, city);
        }
    };

    alias('3013', 'Black Market');
    alias('3013-Auction2', 'Black Market');

    let rows = [];
    try {
        rows = JSON.parse(readFileSync(LOCATIONS_PATH, 'utf8'));
    } catch (error) {
        console.warn('locations.json okunamadı, sadece sabit eşleme kullanılacak:', error.message);
    }

    for (const row of rows) {
        const index = String(row.index ?? '');
        const city = cityFromWorldName(row.uniqueName, index);
        if (!city) {
            continue;
        }
        alias(index, city);
    }

    return map;
}

function cityFromWorldName(uniqueName, index) {
    const name = String(uniqueName ?? '').trim();
    if (!name) {
        return null;
    }
    if (String(index).includes('Auction2')) {
        return 'Black Market';
    }
    if (CITY_NAMES.has(name)) {
        return name;
    }
    if (name.endsWith(' Market')) {
        const city = name.slice(0, -' Market'.length);
        return CITY_NAMES.has(city) ? city : null;
    }
    return null;
}

function locationKeys(raw) {
    const id = String(raw);
    const keys = new Set([id, id.toLowerCase()]);
    if (id.includes('-')) {
        keys.add(id.split('-')[0]);
    }
    const numeric = Number(id.replace(/^0+/, '') || id);
    if (Number.isInteger(numeric) && numeric >= 0 && !id.includes('-')) {
        keys.add(String(numeric));
        keys.add(String(numeric).padStart(4, '0'));
    }
    return keys;
}

function bookKey(itemId, city, quality, side) {
    return `${itemId}|${city}|${quality}|${side}`;
}

function pruneExpired() {
    const now = Date.now();
    for (const [key, book] of books) {
        for (const [id, order] of book.orders) {
            const expires = order.expiresAt ? Date.parse(order.expiresAt) : NaN;
            // Keep orders past last-seen freshness; UI marks them stale (orange).
            // Only drop when the game Expires timestamp has passed.
            if (Number.isFinite(expires) && expires <= now) {
                book.orders.delete(id);
            }
        }
        if (book.orders.size === 0) {
            books.delete(key);
        }
    }
}

function splitCsv(value) {
    if (!value) {
        return [];
    }
    return String(value)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseJsonBody(raw) {
    if (!raw) {
        return {};
    }
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function parsePowBody(raw) {
    const params = new URLSearchParams(raw);
    const natsmsg = params.get('natsmsg') ?? raw;
    return parseJsonBody(natsmsg);
}

function readBody(req, maxBytes = 12 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error('Gövde çok büyük'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function isTrackedLocalDataKey(key) {
    return typeof key === 'string' && key.startsWith(LOCAL_DATA_PREFIX) && key !== LOCAL_DATA_CLOCK_KEY;
}

function parseLocalDataSnapshot(raw) {
    const parsed = parseJsonBody(raw);
    if (!parsed || parsed.kind !== LOCAL_DATA_KIND || Number(parsed.version) !== LOCAL_DATA_VERSION) {
        return null;
    }
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
        return null;
    }

    const data = {};
    for (const [key, value] of Object.entries(parsed.data)) {
        if (!isTrackedLocalDataKey(key) || value == null) {
            continue;
        }
        data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    return {
        version: LOCAL_DATA_VERSION,
        kind: LOCAL_DATA_KIND,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        origin: typeof parsed.origin === 'string' ? parsed.origin : '',
        data
    };
}

function parseMaybeJson(value) {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function mergeDailyBonusRows(left, right) {
    const rows = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
    const byDate = new Map();
    for (const row of rows) {
        if (!row || typeof row !== 'object' || !row.date) {
            continue;
        }
        const date = String(row.date);
        const previous = byDate.get(date);
        if (!previous) {
            byDate.set(date, row);
            continue;
        }
        const score = (item) => (item.slot1FamilyKey ? 1 : 0) + (item.slot2FamilyKey ? 1 : 0);
        byDate.set(date, score(row) >= score(previous) ? { ...previous, ...row } : { ...row, ...previous });
    }
    return [...byDate.values()]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((row, index) => ({ ...row, id: index + 1 }));
}

function mergeLocalDataSnapshots(existing, incoming) {
    if (!existing?.data) {
        return incoming;
    }

    const data = { ...existing.data };
    for (const [key, value] of Object.entries(incoming.data ?? {})) {
        if (key.endsWith('dailyBonuses')) {
            data[key] = JSON.stringify(mergeDailyBonusRows(parseMaybeJson(data[key]), parseMaybeJson(value)));
            continue;
        }
        data[key] = value;
    }

    for (const [key, value] of Object.entries(existing.data)) {
        if (key.endsWith('dailyBonuses') && incoming.data?.[key] == null) {
            data[key] = value;
        }
    }

    return {
        ...incoming,
        data
    };
}

function localDataMeta() {
    if (!localDataSnapshot) {
        return { empty: true };
    }
    return {
        empty: false,
        exportedAt: localDataSnapshot.exportedAt ?? null,
        origin: localDataSnapshot.origin ?? '',
        keyCount: Object.keys(localDataSnapshot.data ?? {}).length
    };
}

function saveLocalDataFile(snapshot) {
    localDataSnapshot = snapshot;
    try {
        writeFileSync(LOCAL_DATA_PATH, JSON.stringify(snapshot));
    } catch (error) {
        console.warn('yerel veri yazılamadı:', error.message);
    }
}

function loadLocalDataFile() {
    try {
        const parsed = parseLocalDataSnapshot(readFileSync(LOCAL_DATA_PATH, 'utf8'));
        if (parsed) {
            localDataSnapshot = parsed;
        }
    } catch {
        localDataSnapshot = null;
    }
}

function sendJson(res, status, body) {
    if (res.writableEnded || res.headersSent) {
        return;
    }
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(json);
}

function schedulePersist() {
    if (persistTimer) {
        return;
    }
    persistTimer = setTimeout(() => {
        persistTimer = null;
        persistCache();
    }, 400);
}

function persistCache() {
    const payload = {
        lastIngestAt,
        lastClientAt,
        lastIngestPath,
        lastItems,
        lastCities,
        ingestCount,
        books: [...books.values()].map((book) => ({
            itemId: book.itemId,
            city: book.city,
            quality: book.quality,
            side: book.side,
            orders: [...book.orders.values()]
        }))
    };

    try {
        writeFileSync(CACHE_PATH, JSON.stringify(payload));
    } catch (error) {
        console.warn('önbellek yazılamadı:', error.message);
    }
}

function loadCache() {
    try {
        const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
        lastIngestAt = parsed.lastIngestAt ?? null;
        cachedMarketAt = lastIngestAt;
        lastClientAt = null;
        lastIngestPath = parsed.lastIngestPath ?? null;
        lastItems = Array.isArray(parsed.lastItems) ? parsed.lastItems : [];
        lastCities = Array.isArray(parsed.lastCities) ? parsed.lastCities : [];
        ingestCount = Number(parsed.ingestCount) || 0;
        for (const book of parsed.books ?? []) {
            const key = bookKey(book.itemId, book.city, book.quality, book.side);
            books.set(key, {
                itemId: book.itemId,
                city: book.city,
                quality: book.quality,
                side: book.side,
                orders: new Map((book.orders ?? []).map((order) => [order.id, order]))
            });
        }
        pruneExpired();
    } catch {
        // no cache yet
    }
}
