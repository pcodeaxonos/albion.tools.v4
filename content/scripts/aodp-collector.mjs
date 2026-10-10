import https from 'node:https';
import { gunzipSync } from 'node:zlib';
import { AODP_COLLECTOR_POLICY, LONG_TERM_STRATEGIES } from '../js/core/market-history-config.mjs';
import { normalizePriceDate, BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';
import { aodpUrl, urlBatches as priceBatches } from '../js/core/market-request.mjs';
export { aodpUrl, urlBatches as priceBatches } from '../js/core/market-request.mjs';

export function requestAodp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'albion.tools.v4/quote-collector' } }, res => {
            const parts = [];
            res.on('data', chunk => parts.push(chunk));
            res.on('error', reject);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    const error = new Error(`AODP HTTP ${res.statusCode}`); error.status = res.statusCode;
                    const retry = res.headers['retry-after'];
                    error.retryAfterMs = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
                    reject(error); return;
                }
                try {
                    const bytes = Buffer.concat(parts);
                    const rows = JSON.parse((res.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes).toString());
                    if (!Array.isArray(rows)) throw new Error('AODP response is not an array');
                    resolve(rows);
                } catch (error) { reject(error); }
            });
        });
        const timer = setTimeout(() => req.destroy(new Error('AODP request timeout')), timeoutMs);
        req.on('close', () => clearTimeout(timer));
        req.on('error', reject);
    });
}

export function createAodpCollector({ host, server, ids, cities, repository,
    policy = AODP_COLLECTOR_POLICY, collectionPlan = null, request = requestAodp, now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log,
    timers = { setTimeout, clearTimeout } }) {
    const state = { status: 'scheduled', server, itemCount: ids.length, cityCount: cities.length,
        intervalMs: policy.intervalMs, lastSuccessAt: null, lastRun: null, nextRunAt: null };
    let running = false, stopped = false, timer = null, blockedUntil = 0;
    const itemSet = new Set(ids), citySet = new Set(cities);
    const inScope = row => itemSet.has(row.item_id) && citySet.has(row.city ?? row.location) && Number(row.quality) === policy.quality;
    async function fetchRows(url, summary) {
        for (let attempt = 0; ; attempt++) {
            if (blockedUntil > now()) {
                const delay = blockedUntil - now();
                if (delay > policy.maxRetryMs) throw new Error('AODP rate-limit cooldown; next scheduled round will retry');
                await sleep(delay);
                blockedUntil = 0;
            }
            summary.requests++;
            if (collectionPlan && !collectionPlan.allowRequest(now())) {
                const error = new Error('AODP request budget reached'); error.status = 429; error.budget = true; throw error;
            }
            collectionPlan?.noteRequest(now());
            try { return await request(url, policy.timeoutMs); }
            catch (error) {
                if (error.budget) throw error;
                if (error.status === 429) blockedUntil = now() + Math.max(error.retryAfterMs || 0, policy.retryBaseMs * 2 ** attempt);
                if (attempt >= policy.retries || (error.status && error.status !== 429 && error.status < 500)) throw error;
                if (error.status !== 429) await sleep(Math.min(policy.maxRetryMs, policy.retryBaseMs * 2 ** attempt));
            }
        }
    }
    async function run() {
        if (running || stopped) return;
        running = true; state.status = 'collecting';
        const due = collectionPlan ? collectionPlan.dueIds(now()) : ids;
        const summary = { fetchedAt: new Date(now()).toISOString(), items: due.length, cities: cities.length,
            batches: 0, requests: 0, buy: 0, sell: 0, observations: 0, duplicates: 0, invalid: 0, stale: 0,
            deferred: false, errors: [] };
        if (!due.length) {
            state.status = 'ok'; state.lastRun = summary;
            if (collectionPlan) state.collection = collectionPlan.publicState(now());
            state.coverage = repository.coverage?.(now()) || null;
            running = false; return summary;
        }
        try {
            const makeUrl = batch => aodpUrl(host, 'prices', batch, cities, policy.quality);
            const completed = [];
            for (const batch of priceBatches(due, makeUrl, policy.maxUrlLength)) {
                if (collectionPlan && !collectionPlan.allowRequest(now())) { summary.deferred = true; break; }
                summary.batches++;
                try {
                    const rows = await fetchRows(makeUrl(batch), summary);
                    const fetchedAt = new Date(now()).toISOString();
                    for (const row of rows) {
                        if (!inScope(row)) { summary.invalid++; continue; }
                        for (const [side, field] of Object.entries(BOOK_PRICE_FIELDS)) {
                            const sourceQuoteAt = normalizePriceDate(row[`${field}_date`]);
                            const at = Date.parse(sourceQuoteAt), price = Number(row[field]);
                            if (!(price > 0) || !Number.isFinite(price) || !Number.isFinite(at) || at > now()) { summary.invalid++; continue; }
                            if (now() - at > policy.sourceMaxAgeMs) { summary.stale++; continue; }
                            summary[side]++;
                            const added = repository.record({ server, itemId: row.item_id, city: row.city,
                                quality: Number(row.quality), side, price, sourceQuoteAt, fetchedAt, source: 'aodp-current' }, now());
                            summary[added ? 'observations' : 'duplicates']++;
                        }
                    }
                    repository.flush(now());
                    completed.push(...batch);
                    collectionPlan?.notePrices(rows.flatMap((row) => Object.entries(BOOK_PRICE_FIELDS).map(([side, field]) => ({
                        itemId: row.item_id, city: row.city, side, price: Number(row[field])
                    }))), now());
                } catch (error) {
                    if (error.budget) { summary.deferred = true; break; }
                    summary.errors.push(error.message);
                }
                await sleep(policy.requestGapMs);
            }
            collectionPlan?.noteFetched(completed, now());
            // Sales averages are anchors only; never inserted as Sell/Buy quote observations.
            const preferred = collectionPlan?.preferredIds;
            const refreshIds = due.filter(id => cities.some(city => {
                const anchor = repository.anchor(id, city, policy.quality, server);
                return !anchor || now() - Date.parse(anchor.fetchedAt) >= policy.anchorRefreshMs;
            }));
            const end = new Date(now());
            const start = new Date(now() - LONG_TERM_STRATEGIES['median-28d'].windowMs);
            if (preferred?.size) refreshIds.sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)));
            const historyUrl = batch => aodpUrl(host, 'history', batch, cities, policy.quality,
                { date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), 'time-scale': '24' });
            const historyBatches = priceBatches(refreshIds, historyUrl, policy.maxUrlLength);
            const historyCap = collectionPlan ? collectionPlan.historyBatchCap : historyBatches.length;
            for (const batch of historyBatches.slice(0, historyCap)) {
                if (collectionPlan && !collectionPlan.allowRequest(now())) { summary.deferred = true; break; }
                try {
                    const rows = await fetchRows(historyUrl(batch), summary);
                    for (const row of rows) if (inScope(row) && Array.isArray(row.data)) repository.setAnchor({ ...row, quality: Number(row.quality),
                        server, fetchedAt: new Date(now()).toISOString(), source: 'aodp-sales-history' }, now());
                    // Cache explicit absence too, so missing sales rows are retried daily rather than hourly.
                    for (const id of batch) for (const city of cities) if (!rows.some(row => row.item_id === id && row.location === city && Number(row.quality) === policy.quality))
                        repository.setAnchor({ item_id: id, location: city, quality: policy.quality, server,
                            data: [], fetchedAt: new Date(now()).toISOString(), source: 'aodp-sales-history' }, now());
                    repository.flush(now());
                } catch (error) {
                    if (error.budget) { summary.deferred = true; break; }
                    summary.errors.push(error.message);
                }
                await sleep(policy.requestGapMs);
            }
            repository.flush(now());
            state.status = summary.errors.length ? 'partial-error' : 'ok';
            if (!summary.errors.length) state.lastSuccessAt = new Date(now()).toISOString();
        } catch (error) { summary.errors.push(error.message); state.status = 'error'; }
        finally {
            state.lastRun = summary; running = false;
            if (collectionPlan) state.collection = collectionPlan.publicState(now());
            state.coverage = repository.coverage?.(now()) || null;
            log(`[AODP collector] ${JSON.stringify(summary)}`);
        }
        return summary;
    }
    function schedule(delay) {
        if (stopped) return;
        state.nextRunAt = new Date(now() + delay).toISOString();
        timer = timers.setTimeout(async () => {
            await run();
            schedule(Math.max(collectionPlan ? collectionPlan.tickMs : policy.intervalMs, blockedUntil - now()));
        }, delay);
        timer?.unref?.();
    }
    return {
        state, run,
        noteOpportunities(itemIds, at = now()) { collectionPlan?.noteOpportunities(itemIds, at); },
        noteWatched(itemIds, at = now()) { collectionPlan?.noteWatched(itemIds, at); },
        noteDiscovery(itemIds, at = now()) { return collectionPlan?.noteDiscovery(itemIds, at) || 0; },
        start() { if (timer === null && !stopped) schedule(policy.initialDelayMs); },
        stop() { stopped = true; timers.clearTimeout(timer); }
    };
}
