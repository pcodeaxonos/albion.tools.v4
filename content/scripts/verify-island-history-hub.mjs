import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolveTradePotential, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';

const [auditPath, outputPath] = process.argv.slice(2);
if (!auditPath || !outputPath) throw new Error('Usage: node verify-island-history-hub.mjs audit-result.json output.json');
const audit = JSON.parse(readFileSync(auditPath));
const requests = audit.matrix.filter(row => row.days === 28).map(({ server, itemId, city, quality, side }) => ({ server, itemId, city, quality, side }));
const items = [...new Set(requests.map(row => row.itemId))].sort(), locations = [...new Set(requests.map(row => row.city))].sort();
async function get(host, params) {
    const response = await fetch(`${host}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20000) });
    assert.equal(response.ok, true, `${response.status} ${await (!response.ok ? response.text() : '')}`);
    return response.json();
}
const scope = { server: 'europe', items: items.join(','), locations: locations.join(','), qualities: '1', days: '90' };
const snapshot = await get('http://127.0.0.1:3003/api/v1/trades', scope);
assert.equal(snapshot.filtered, true, 'personal archive must be filtered on Node');
const rows = [];
for (const location of locations) rows.push(...(await get('http://127.0.0.1:3001/api/v1/market/sales-history', { ...scope, locations: location })).rows);
const index = new Map(rows.map(row => [JSON.stringify([row.item_id, row.location, row.quality]), row]));
const periods = [];
for (const days of [7, 14, 28, 60, 90]) {
    const requestedApi = new Set();
    const result = await resolveTradePotential(requests, { priceOnly: false, days, snapshot,
        fetchLocalHistory: async (ids, request) => new Map(ids.map(id => [id, { points: index.get(JSON.stringify([id, request.city, request.quality]))?.data }])),
        fetchHistory: async (ids, request) => { ids.forEach(id => requestedApi.add(JSON.stringify([id, request.city, request.quality]))); return new Map(); } });
    const source = { Yerel: 0, API: 0, Karma: 0, Yetersiz: 0 };
    const unique = new Set();
    for (const request of requests) {
        const value = result.get(tradeEvidenceKey(request));
        source[value.reliable ? value.source : 'Yetersiz']++;
        if (value.reliable) {
            const key = JSON.stringify([request.itemId, request.city, request.quality]);
            unique.add(key); assert.equal(requestedApi.has(key), false);
        }
    }
    periods.push({ days, sources: source, validUnique: unique.size, missingUnique: requestedApi.size });
}
const stamps = rows.flatMap(row => row.data.map(point => point.timestamp)).sort();
const output = { measuredAt: new Date().toISOString(), server: 'europe', personalSnapshotRecords: snapshot.count,
    filteredPersonal: snapshot.filtered, requestedItems: items.length, returnedMarketSeries: rows.length,
    marketVolumeSeries: rows.filter(row => row.data.some(point => point.item_count > 0)).length,
    earliestReportedDay: stamps[0] ?? null, latestReportedDay: stamps.at(-1) ?? null,
    maxDaysStored: Math.max(...rows.map(row => row.data.length)),
    actualLocalHttpRequests: 8, actualExternalHistoryRequestsFromThisVerification: 0,
    limitation: 'External fallback is a spy only; background collector traffic is independent and not counted here', periods };
writeFileSync(outputPath, JSON.stringify(output, null, 2)); console.log(JSON.stringify(output));
