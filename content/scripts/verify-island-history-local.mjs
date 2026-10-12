import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveTradePotential, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';
import { salesEvidence } from '../js/core/island-sales-potential.mjs';
import { mergeSalesHistory, salesHistoryWindow } from '../js/core/sales-history-store.mjs';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
import { DAY_MS } from '../js/core/market-history-config.mjs';

const [auditPath, anchorsPath, outputPath] = process.argv.slice(2);
if (!auditPath || !anchorsPath || !outputPath) throw new Error('Usage: node verify-island-history-local.mjs audit-result.json scope-anchors.json output.json');
const audit = JSON.parse(readFileSync(auditPath)), anchors = JSON.parse(readFileSync(anchorsPath));
const now = Date.parse(audit.capturedAt);
const servers = JSON.parse(readFileSync(new URL('../../data/price-servers.json', import.meta.url)));
const key = row => JSON.stringify([row.server, row.item_id, row.location, row.quality]);
const stored = new Map(anchors.map(row => [key(row), mergeSalesHistory(null, row, now)]));
const requests = audit.matrix.filter(row => row.days === 28).map(({ server, itemId, city, quality, side }) => ({ server, itemId, city, quality, side }));
const periods = [], examples = [];
for (const days of [7, 14, 28, 60, 90]) {
    let apiGroups = 0, apiBatches = 0;
    const requestedApi = new Set();
    const resolved = await resolveTradePotential(requests, { priceOnly: false, days, now, snapshot: { trades: [] },
        fetchLocalHistory: async (ids, request) => new Map(ids.map(id => {
            const row = stored.get(key({ server: request.server, item_id: id, location: request.city, quality: request.quality }));
            return [id, { points: salesHistoryWindow(row, days, now).data }];
        })),
        fetchHistory: async (ids, request) => {
            apiGroups++;
            const end = Math.floor(now / DAY_MS) * DAY_MS;
            apiBatches += urlBatches(ids, batch => aodpUrl(servers.find(row => row.code === request.server).host, 'history', batch, [request.city], request.quality,
                { date: new Date(end - days * DAY_MS).toISOString().slice(0, 10), end_date: new Date(now).toISOString().slice(0, 10), 'time-scale': '24' })).length;
            for (const id of ids) requestedApi.add(key({ server: request.server, item_id: id, location: request.city, quality: request.quality }));
            return new Map(); // No live external calls, never invent unavailable responses.
        } });
    const previous = audit.matrix.filter(row => row.days === days);
    const validUnique = new Set(), unchanged = [], sources = { Yerel: 0, API: 0, Karma: 0, Yetersiz: 0 };
    for (const request of requests) {
        const value = resolved.get(tradeEvidenceKey(request));
        sources[value.reliable ? value.source : 'Yetersiz']++;
        const row = anchors.find(row => key(row) === key({ server: request.server, item_id: request.itemId, location: request.city, quality: request.quality }));
        const before = salesEvidence(row?.data, days, now, null, { side: request.side });
        if (before.reliable) {
            assert.equal(value.reliable, true); assert.equal(value.price, before.price); assert.equal(value.volume, before.volume);
            const physicalKey = key(row);
            validUnique.add(physicalKey); unchanged.push(tradeEvidenceKey(request));
            assert.equal(requestedApi.has(physicalKey), false, 'eligible local measurement must not request API');
        }
        if (days === 28 && examples.length < 12 && value.reliable && !examples.some(row => row.item === request.itemId))
            examples.push({ item: request.itemId, city: request.city, side: request.side, price: value.price,
                volume: value.volume, samples: value.samples, source: value.source, priceOrigin: value.priceOrigin, capacityOrigin: value.capacityOrigin });
    }
    assert.equal(unchanged.length, previous.filter(row => row.market.reliable).length);
    periods.push({ days, totalRoles: requests.length, validRoles: unchanged.length, validUnique: validUnique.size,
        unchangedPriceAndVolume: unchanged.length, sources, localPercent: sources.Yerel / requests.length * 100,
        remainingApiUnique: requestedApi.size, apiGroupInvocations: apiGroups,
        coldExternalUrlBatches: apiBatches,
        actualExternalNetworkCalls: 0, eligibleMeasurementsRequestedFromApi: 0 });
}
assert.equal(periods.find(row => row.days === 28).validUnique, 263);
const result = { sourceCapturedAt: audit.capturedAt, measuredAt: new Date().toISOString(),
    inputHashes: [auditPath, anchorsPath].map(path => createHash('sha256').update(readFileSync(path)).digest('hex')),
    measurement: 'Replay of real audited local archive; mocked unavailable external API, not live network traffic',
    storedSeries: anchors.length, storedVolumeSeries: anchors.filter(row => row.data.some(point => point.item_count > 0)).length,
    periods, examples };
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
