import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { DAY_MS } from '../js/core/market-history-config.mjs';

export const PACKET_HISTORY_SOURCE = 'game-market-history';
const TICKS_EPOCH = 621355968000000000n;
const SILVER_SCALE = 10000n;
const SCALE_HOURS = [1, 6, 6];
function wireInteger(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Unsafe wire integer');
    if (typeof value === 'string' && !/^\d+$/.test(value)) throw new Error('Invalid wire integer');
    if (value == null) throw new Error('Missing wire integer');
    return BigInt(value);
}

// Preserve 64-bit wire integers before JSON.parse; never convert ticks to float.
export function parseMarketHistoryBody(raw, pow = false) {
    const json = pow ? new URLSearchParams(raw).get('natsmsg') ?? raw : raw;
    return JSON.parse(json.replace(/("(?:Timestamp|SilverAmount|ItemAmount)"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"$2"'));
}

export function normalizeMarketHistoryPacket(payload, { server, itemNames, cityFromLocation, now = Date.now() }) {
    const item = itemNames.get(Number(payload?.AlbionId));
    const city = cityFromLocation(payload?.LocationId);
    const quality = Number(payload?.QualityLevel), scale = Number(payload?.Timescale);
    if (!item || !city || !Number.isInteger(quality) || quality < 1 || quality > 5
        || payload.Timescale == null || !Number.isInteger(scale) || scale < 0 || scale > 2 || !Array.isArray(payload.MarketHistories)
        || payload.MarketHistories.length > 4096) throw new Error('Invalid Market History packet scope');
    const points = new Map();
    for (const history of payload.MarketHistories) {
        try {
            const ticks = wireInteger(history.Timestamp), silver = wireInteger(history.SilverAmount), amount = wireInteger(history.ItemAmount);
            const at = Number((ticks - TICKS_EPOCH) / 10000n);
            if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER) || silver <= 0n || silver / SILVER_SCALE > BigInt(Number.MAX_SAFE_INTEGER)
                || at > now || at < now - 90 * DAY_MS) continue;
            // SilverAmount is total silver in 1/10000 units, not a unit price.
            const unit = Number(silver / SILVER_SCALE) / Number(amount);
            if (!Number.isFinite(unit) || unit <= 0 || unit > Number.MAX_SAFE_INTEGER) continue;
            const timestamp = new Date(at).toISOString();
            points.set(timestamp, { timestamp, avg_price: unit, item_count: Number(amount),
                source: PACKET_HISTORY_SOURCE, timescale: scale, intervalHours: SCALE_HOURS[scale] });
        } catch { /* Reject malformed points without erasing previously captured history. */ }
    }
    return { server, item_id: item, location: city, quality, timescale: scale,
        source: PACKET_HISTORY_SOURCE, fetchedAt: new Date(now).toISOString(), data: [...points.values()] };
}

export class MarketHistoryPackets {
    constructor(path) {
        this.path = path;
        this.rows = new Map();
        if (existsSync(path)) {
            const text = readFileSync(path, 'utf8');
            // Ignore only an incomplete crash tail. Complete malformed records fail loudly.
            const lines = text.split('\n');
            for (const line of lines.slice(0, -1)) if (line) this.apply(JSON.parse(line));
            if (lines.at(-1)) throw new Error('Incomplete Market History archive tail; preserve and repair before ingest');
        }
    }
    key(row) { return JSON.stringify([row.server, row.item_id, row.location, row.quality, row.timescale]); }
    apply(row) {
        const key = this.key(row), old = this.rows.get(key);
        const points = new Map((old?.data ?? []).map(point => [point.timestamp, point]));
        for (const point of row.data) points.set(point.timestamp, point);
        const start = Date.parse(row.fetchedAt) - 90 * DAY_MS;
        this.rows.set(key, { ...row, data: [...points.values()].filter(point => Date.parse(point.timestamp) >= start)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp)) });
    }
    ingest(row) {
        if (!row.data.length) return 0;
        const old = new Map((this.rows.get(this.key(row))?.data ?? []).map(point => [point.timestamp, point]));
        const changed = row.data.filter(point => JSON.stringify(old.get(point.timestamp)) !== JSON.stringify(point));
        if (!changed.length) return 0;
        // Persist before exposing the data. Corrections replace buckets, never add volume.
        const event = { ...row, data: changed };
        appendFileSync(this.path, JSON.stringify(event) + '\n');
        this.apply(event);
        return changed.length;
    }
    history({ server, items, locations, qualities, days, now = Date.now() }) {
        return [...this.rows.values()].filter(row => row.server === server && items.includes(row.item_id)
            && locations.includes(row.location) && qualities.includes(row.quality)).map(row => ({ ...row,
            data: row.data.filter(point => Date.parse(point.timestamp) >= now - days * DAY_MS && Date.parse(point.timestamp) <= now) }));
    }
    status() {
        return { series: this.rows.size, points: [...this.rows.values()].reduce((sum, row) => sum + row.data.length, 0),
            latest: [...this.rows.values()].map(row => row.fetchedAt).sort().at(-1) ?? null };
    }
}
