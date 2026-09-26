import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DEBOUNCE_MS, READ_RETRY_DELAYS_MS } from './constants.mjs';
import { findEuropeTradesFile, readTradesFile } from './find-trades-file.mjs';
import { loadLocationDisplayNames, normalizeTrade, normalizeTrades } from './normalize.mjs';
import { tradeIdentity } from './silver.mjs';

/**
 * @typedef {object} TradeWatcherHandlers
 * @property {(trades: object[]) => void} [onInitialTrades]
 * @property {(trades: object[]) => void} [onTradesAdded]
 * @property {(error: Error) => void} [onError]
 */

/**
 * Read-only SAT Trades.json watcher.
 *
 * - Never writes to Trades.json or any SAT path.
 * - Uses fs.watch + debounce (no polling interval).
 * - Emits initial snapshot once, then only newly seen Ids.
 */
export function createTradeWatcher(options = {}) {
    const emitter = new EventEmitter();
    const state = {
        started: false,
        stopped: false,
        tradesPath: null,
        locationNames: null,
        seenIds: new Set(),
        watcher: null,
        debounceTimer: null,
        reloadInFlight: false,
        reloadQueued: false,
        handlers: {
            onInitialTrades: null,
            onTradesAdded: null,
            onError: null
        }
    };

    function emitError(error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (typeof state.handlers.onError === 'function') {
            try {
                state.handlers.onError(err);
            } catch {
                // ignore handler errors
            }
        }
        emitter.emit('error', err);
    }

    function emitInitial(trades) {
        if (typeof state.handlers.onInitialTrades === 'function') {
            try {
                state.handlers.onInitialTrades(trades);
            } catch (error) {
                emitError(error);
            }
        }
        emitter.emit('initial', trades);
    }

    function emitAdded(trades) {
        if (!trades.length) {
            return;
        }
        if (typeof state.handlers.onTradesAdded === 'function') {
            try {
                state.handlers.onTradesAdded(trades);
            } catch (error) {
                emitError(error);
            }
        }
        emitter.emit('added', trades);
    }

    async function readWithRetry() {
        let lastError = null;
        const attempts = [0, ...READ_RETRY_DELAYS_MS];
        for (const delay of attempts) {
            if (state.stopped) {
                throw new Error('Trade watcher stopped');
            }
            if (delay > 0) {
                await sleep(delay);
            }
            try {
                return readTradesFile(state.tradesPath);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
        throw lastError || new Error('Trades.json okunamadı');
    }

    function rememberRaw(raw) {
        const id = tradeIdentity(raw);
        if (id) {
            state.seenIds.add(id);
        }
        return id;
    }

    async function loadInitial() {
        const { records } = await readWithRetry();
        state.seenIds = new Set();
        for (const raw of records) {
            rememberRaw(raw);
        }
        const normalized = normalizeTrades(records, state.locationNames);
        emitInitial(normalized);
        return normalized;
    }

    async function reloadForChanges() {
        if (state.stopped) {
            return;
        }
        if (state.reloadInFlight) {
            state.reloadQueued = true;
            return;
        }
        state.reloadInFlight = true;
        try {
            const { records } = await readWithRetry();
            const added = [];
            for (const raw of records) {
                const id = tradeIdentity(raw);
                if (!id || state.seenIds.has(id)) {
                    continue;
                }
                state.seenIds.add(id);
                added.push(normalizeTrade(raw, state.locationNames));
            }
            // Preserve source-file order of newly discovered rows.
            emitAdded(added);
        } catch (error) {
            emitError(error);
        } finally {
            state.reloadInFlight = false;
            if (state.reloadQueued && !state.stopped) {
                state.reloadQueued = false;
                scheduleReload();
            }
        }
    }

    function scheduleReload() {
        if (state.stopped) {
            return;
        }
        if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
        }
        state.debounceTimer = setTimeout(() => {
            state.debounceTimer = null;
            reloadForChanges();
        }, options.debounceMs ?? DEBOUNCE_MS);
        if (typeof state.debounceTimer.unref === 'function') {
            state.debounceTimer.unref();
        }
    }

    function attachWatcher() {
        const dir = path.dirname(state.tradesPath);
        const fileName = path.basename(state.tradesPath);

        // Watch the directory: some Windows editors replace the file atomically.
        state.watcher = fs.watch(dir, { persistent: true }, (_eventType, changed) => {
            if (state.stopped) {
                return;
            }
            if (changed && String(changed) !== fileName) {
                return;
            }
            scheduleReload();
        });

        state.watcher.on('error', (error) => {
            emitError(error);
        });
    }

    /**
     * @param {TradeWatcherHandlers} [handlers]
     */
    async function start(handlers = {}) {
        if (state.started && !state.stopped) {
            throw new Error('Trade watcher already started');
        }

        state.stopped = false;
        state.handlers = {
            onInitialTrades: handlers.onInitialTrades || null,
            onTradesAdded: handlers.onTradesAdded || null,
            onError: handlers.onError || null
        };

        const located = options.tradesPath
            ? {
                path: options.tradesPath,
                size: 0,
                mtimeMs: 0,
                instanceId: null
            }
            : findEuropeTradesFile({ localAppData: options.localAppData });

        state.tradesPath = located.path;
        state.locationNames = options.locationNames
            || loadLocationDisplayNames(options.locationsPath);

        await loadInitial();
        attachWatcher();
        state.started = true;

        return {
            path: state.tradesPath,
            seenCount: state.seenIds.size
        };
    }

    function stop() {
        state.stopped = true;
        if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
            state.debounceTimer = null;
        }
        if (state.watcher) {
            try {
                state.watcher.close();
            } catch {
                // ignore
            }
            state.watcher = null;
        }
        state.reloadQueued = false;
        state.reloadInFlight = false;
        state.started = false;
    }

    /**
     * Test helper: simulate a re-read with a provided records array
     * without touching the real Trades.json file.
     * Only newly seen identities are normalized and emitted as added.
     *
     * @param {object[]} records
     * @returns {object[]} newly added normalized trades
     */
    function simulateReload(records) {
        if (!Array.isArray(records)) {
            throw new Error('simulateReload expects an array');
        }
        const added = [];
        for (const raw of records) {
            const id = tradeIdentity(raw);
            if (!id || state.seenIds.has(id)) {
                continue;
            }
            state.seenIds.add(id);
            added.push(normalizeTrade(raw, state.locationNames || new Map()));
        }
        emitAdded(added);
        return added;
    }

    return {
        start,
        stop,
        on: emitter.on.bind(emitter),
        off: emitter.off.bind(emitter),
        once: emitter.once.bind(emitter),
        /** @internal test aid — does not write to disk */
        simulateReload,
        get path() {
            return state.tradesPath;
        },
        get seenCount() {
            return state.seenIds.size;
        }
    };
}

function sleep(ms) {
    return new Promise((resolve) => {
        const t = setTimeout(resolve, ms);
        if (typeof t.unref === 'function') {
            t.unref();
        }
    });
}
