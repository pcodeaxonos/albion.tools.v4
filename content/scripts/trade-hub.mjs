/**
 * SAT Trade Hub — read-only bridge from StatisticsAnalysisTool Trades.json to the browser.
 *
 * Does not touch market prices or price-hub ingest.
 * Never writes to Trades.json or any SAT path.
 *
 *   GET  /api/v1/trades          → full normalized snapshot
 *   GET  /api/v1/trades/status   → live status
 *   GET  /api/v1/trades/updates  → SSE (initial + added + error)
 */

import { createServer } from 'node:http';
import { createTradeWatcher } from './sat-trades/index.mjs';

const PORT = Number(process.env.TRADE_HUB_PORT) || 3002;
const HOST = process.env.TRADE_HUB_HOST || '127.0.0.1';

/** @type {object[]} */
let trades = [];
let tradesPath = null;
let lastEventAt = null;
let lastError = null;
let ready = false;
let starting = null;

const sseClients = new Set();
const watcher = createTradeWatcher();

function applyCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
    applyCors(res);
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(payload);
}

function statusPayload() {
    return {
        ready,
        live: ready && !lastError,
        count: trades.length,
        path: tradesPath,
        lastEventAt,
        error: lastError ? String(lastError.message || lastError) : null,
        host: `http://${HOST}:${PORT}`
    };
}

function snapshotPayload() {
    return {
        at: lastEventAt || new Date().toISOString(),
        path: tradesPath,
        count: trades.length,
        trades
    };
}

function writeSse(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of [...sseClients]) {
        try {
            client.write(frame);
        } catch {
            sseClients.delete(client);
        }
    }
}

function attachSse(req, res) {
    req.socket.setTimeout(0);
    applyCors(res);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    res.write(':\n\n');
    sseClients.add(res);

    if (ready) {
        writeSse(res, 'initial', snapshotPayload());
    } else if (lastError) {
        writeSse(res, 'trade-error', { message: String(lastError.message || lastError) });
    } else {
        writeSse(res, 'status', { ready: false, message: 'Trade watcher starting…' });
    }

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

async function ensureWatcher() {
    if (ready) {
        return;
    }
    if (starting) {
        await starting;
        return;
    }
    starting = (async () => {
        try {
            const info = await watcher.start({
                onInitialTrades(list) {
                    trades = Array.isArray(list) ? list : [];
                    tradesPath = watcher.path;
                    lastEventAt = new Date().toISOString();
                    lastError = null;
                    ready = true;
                    broadcast('initial', snapshotPayload());
                    console.log(`trades initial ${trades.length} · ${tradesPath}`);
                },
                onTradesAdded(list) {
                    if (!Array.isArray(list) || list.length === 0) {
                        return;
                    }
                    trades = trades.concat(list);
                    lastEventAt = new Date().toISOString();
                    lastError = null;
                    broadcast('added', {
                        at: lastEventAt,
                        count: trades.length,
                        trades: list
                    });
                    console.log(`trades added +${list.length} → ${trades.length}`);
                },
                onError(error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    broadcast('trade-error', { message: lastError.message });
                    console.warn('trades watcher error:', lastError.message);
                }
            });
            tradesPath = info.path;
            ready = true;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            ready = false;
            broadcast('trade-error', { message: lastError.message });
            console.error('trades watcher failed to start:', lastError.message);
        } finally {
            starting = null;
        }
    })();
    await starting;
}

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
        .then(async () => {
            if (req.method === 'GET' && (path === '/' || path === '/api/v1/trades/status')) {
                await ensureWatcher();
                sendJson(res, 200, statusPayload());
                return;
            }

            if (req.method === 'GET' && path === '/api/v1/trades') {
                await ensureWatcher();
                if (!ready && lastError) {
                    sendJson(res, 503, { error: lastError.message, ...statusPayload() });
                    return;
                }
                sendJson(res, 200, snapshotPayload());
                return;
            }

            if (req.method === 'GET' && path === '/api/v1/trades/updates') {
                attachSse(req, res);
                ensureWatcher().catch(() => {});
                return;
            }

            sendJson(res, 404, { error: 'not found' });
        })
        .catch((error) => {
            sendJson(res, 500, { error: String(error.message || error) });
        });
});

server.listen(PORT, HOST, () => {
    console.log(`Trade hub http://${HOST}:${PORT}`);
    ensureWatcher().catch((error) => {
        console.error('initial watcher start failed:', error.message || error);
    });
});

function shutdown() {
    try {
        watcher.stop();
    } catch {
        // ignore
    }
    for (const client of sseClients) {
        try {
            client.end();
        } catch {
            // ignore
        }
    }
    sseClients.clear();
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
