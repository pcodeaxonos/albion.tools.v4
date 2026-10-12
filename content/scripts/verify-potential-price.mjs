import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveTradePotential, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';

const [auditPath, anchorPath, outputPath] = process.argv.slice(2);
if (!auditPath || !anchorPath || !outputPath) throw new Error('Usage: node verify-potential-price.mjs audit-result.json scope-anchors.json output.json');
const audit = JSON.parse(readFileSync(auditPath)), anchors = JSON.parse(readFileSync(anchorPath));
const requests = audit.matrix.filter(row => row.days === 28).map(({ server, itemId, city, quality, side }) => ({ server, itemId, city, quality, side }));
const key = (item, city, quality) => JSON.stringify([item, city, quality]);
const index = new Map(anchors.map(row => [key(row.item_id, row.location, row.quality), row]));
const requestedApi = new Set();
const result = await resolveTradePotential(requests, { snapshot: { trades: [] }, days: 28, now: Date.parse(audit.capturedAt), priceOnly: true,
    fetchLocalHistory: async (ids, request) => new Map(ids.map(id => [id, { points: index.get(key(id, request.city, request.quality))?.data }])),
    fetchHistory: async (ids, request) => { ids.forEach(id => requestedApi.add(key(id, request.city, request.quality))); return new Map(); } });
const valid = [], samples = [], unique = new Set();
for (const request of requests) {
    const value = result.get(tradeEvidenceKey(request));
    if (!value.reliable) continue;
    assert.equal(value.source, 'Yerel AODP'); assert.ok(Number.isSafeInteger(value.price) && value.price > 0);
    assert.equal(value.transactions, null); assert.match(value.evidenceType, /Günlük ortalama/);
    const physical = key(request.itemId, request.city, request.quality);
    assert.equal(requestedApi.has(physical), false, 'sufficient local price cannot trigger API');
    valid.push({ ...request, ...value }); unique.add(physical);
    if (samples.length < 12 && !samples.some(row => row.itemId === request.itemId)) samples.push({ ...request, ...value });
}
const previous = audit.matrix.filter(row => row.days === 28 && row.market.reliable);
const rejectedAfterFiltering = previous.filter(row => !result.get(tradeEvidenceKey(row)).reliable).map(row => ({
    itemId: row.itemId, city: row.city, side: row.side, quality: row.quality, reason: result.get(tradeEvidenceKey(row)).reason
}));
assert.equal(valid.length, previous.length - rejectedAfterFiltering.length, 'quantile pricing never relaxes the existing market gates');
for (const row of rejectedAfterFiltering) assert.match(row.reason, /Ayıklama sonrası/);
const report = { measuredAt: new Date().toISOString(), sourceCapturedAt: audit.capturedAt, periodDays: 28,
    measurement: 'Quantity-weighted P25/P75 replay of real audited AODP daily averages; personal records absent from this public fixture; external callback is a spy',
    totalPriceRequests: requests.length, reliableLocalPrices: valid.length, reliableUniqueMeasurements: unique.size,
    p25Prices: valid.filter(row => row.method === 'P25').length, p75Prices: valid.filter(row => row.method === 'P75').length,
    unknownPrices: requests.length - valid.length, adequateLocalMeasurementsSentToApi: 0, actualExternalNetworkRequests: 0, rejectedAfterFiltering, samples };
writeFileSync(outputPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, samples: report.samples.map(row => ({ itemId: row.itemId, side: row.side, method: row.method, price: row.price, source: row.source })) }));
