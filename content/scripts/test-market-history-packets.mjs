import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketHistoryPackets, normalizeMarketHistoryPacket, parseMarketHistoryBody } from './market-history-packets.mjs';
import { resolveTradePotential, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';

const now = Date.parse('2026-10-12T12:00:00Z');
const ticks = at => String(BigInt(at) * 10000n + 621355968000000000n);
const context = { server: 'europe', now, itemNames: new Map([[38, 'T4_FARM_HORSE_BABY']]),
    cityFromLocation: value => String(value) === '5003' ? 'Brecilien' : null };
const wire = `{"AlbionId":38,"LocationId":"5003","QualityLevel":1,"Timescale":0,"MarketHistories":[{"ItemAmount":4,"SilverAmount":1620120000,"Timestamp":${ticks(now - 3600000)}}]}`;
const payload = parseMarketHistoryBody(wire);
assert.equal(typeof payload.MarketHistories[0].Timestamp, 'string');
assert.deepEqual(parseMarketHistoryBody(new URLSearchParams({ natsmsg: wire }).toString(), true), payload);
const row = normalizeMarketHistoryPacket(payload, context);
assert.equal(row.data[0].avg_price, 40503);
assert.equal(row.data[0].item_count, 4);
assert.equal(row.data[0].intervalHours, 1);
assert.equal(row.data[0].timestamp, new Date(now - 3600000).toISOString());
assert.throws(() => normalizeMarketHistoryPacket({ ...payload, AlbionId: 99999 }, context));
assert.throws(() => normalizeMarketHistoryPacket({ ...payload, LocationId: 'unknown' }, context));
assert.throws(() => normalizeMarketHistoryPacket({ ...payload, QualityLevel: 0 }, context));
assert.throws(() => normalizeMarketHistoryPacket({ ...payload, Timescale: 3 }, context));
assert.equal(normalizeMarketHistoryPacket({ ...payload, MarketHistories: [{ ...payload.MarketHistories[0], Timestamp: ticks(now + 3600000) }] }, context).data.length, 0);
const folder = mkdtempSync(join(tmpdir(), 'albion-market-packets-')), path = join(folder, 'packets.jsonl');
try {
    let archive = new MarketHistoryPackets(path);
    assert.equal(archive.ingest(row), 1);
    assert.equal(archive.ingest(row), 0, 'repeat never inflates volume');
    const corrected = { ...row, data: [{ ...row.data[0], item_count: 5 }] };
    archive.ingest(corrected);
    archive.ingest(normalizeMarketHistoryPacket({ ...payload, Timescale: 1 }, context));
    archive = new MarketHistoryPackets(path);
    const request = { server: 'europe', itemId: row.item_id, city: row.location, quality: 1, side: 'buy' };
    const scope = { server: 'europe', items: [row.item_id], locations: [row.location], qualities: [1], days: 28, now };
    assert.equal(archive.history(scope).length, 2, 'hourly and coarse reports stay separate');
    assert.equal(archive.history(scope).find(r => r.timescale === 0).data[0].item_count, 5);
    assert.equal(archive.history({ ...scope, server: 'west' }).length, 0);
    assert.equal(archive.history({ ...scope, qualities: [2] }).length, 0);
    const result = await resolveTradePotential([request], { opportunity: true, days: 28, now,
        snapshot: { server: 'europe', scope: 'personal', trades: [] },
        fetchPacketHistory: async () => new Map([[row.item_id, { points: row.data }]]),
        fetchHourlyHistory: async () => { assert.fail('API must not override valid game packets'); } });
    assert.equal(result.get(tradeEvidenceKey(request)).price, 40503);
    assert.equal(result.get(tradeEvidenceKey(request)).source, 'Oyun Market History');
} finally { rmSync(path, { force: true }); rmdirSync(folder); }
console.log('Market History packets: wire precision, silver/ticks, POW, dedupe/corrections, persistent restore, resolution/scope isolation and game-before-API passed.');
