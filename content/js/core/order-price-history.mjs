import { BOOK_PRICE_FIELDS, marketSeriesKey, normalizePriceDate } from './market-primitives.mjs';
import { ORDER_HISTORY_POLICY } from './market-history-config.mjs';

function stamp(value) {
    return Date.parse(normalizePriceDate(value));
}

function validatePolicy(policy) {
    if (!(Number.isSafeInteger(policy.bucketMs) && policy.bucketMs > 0)
        || !(Number.isSafeInteger(policy.retentionMs) && policy.retentionMs >= policy.bucketMs)
        || policy.representative !== 'first-observation') throw new Error('Invalid order history policy');
}

/** One independently weighted sample per server/item/city/quality/side/time bucket. */
export class OrderPriceHistory {
    constructor({ servers, policy = ORDER_HISTORY_POLICY } = {}) {
        validatePolicy(policy);
        this.servers = new Set(servers || []);
        this.policy = Object.freeze({ ...policy });
        this.series = new Map();
    }

    recordRow(server, row, now = Date.now()) {
        let added = 0;
        for (const [side, field] of Object.entries(BOOK_PRICE_FIELDS)) {
            added += Number(this.record({ server, itemId: row.item_id, city: row.city,
                quality: row.quality, side, price: row[field], seenAt: row[`${field}_date`] }, now));
        }
        return added;
    }

    record(observation, now = Date.now()) {
        const { server, itemId, city, quality, side, price } = observation;
        const at = stamp(observation.seenAt);
        if (!this.servers.has(server) || !itemId || !city || !BOOK_PRICE_FIELDS[side]
            || !Number.isInteger(quality) || quality < 1 || quality > 5
            || !Number.isFinite(price) || price <= 0 || !Number.isFinite(at)
            || at > now || at < now - this.policy.retentionMs) return false;
        const bucketAt = Math.floor(at / this.policy.bucketMs) * this.policy.bucketMs;
        const key = marketSeriesKey(observation);
        let series = this.series.get(key);
        if (!series) {
            series = { server, itemId, city, quality, side, priceField: BOOK_PRICE_FIELDS[side], buckets: new Map() };
            this.series.set(key, series);
        }
        // Exact retries and subsequent scans cannot add weight to an occupied bucket.
        // Out-of-order input may replace its representative with the earlier observation.
        const previous = series.buckets.get(bucketAt);
        if (previous && stamp(previous.seenAt) <= at) return false;
        series.buckets.set(bucketAt, { bucketAt: new Date(bucketAt).toISOString(),
            seenAt: new Date(at).toISOString(), price });
        return true;
    }

    prune(now = Date.now()) {
        let removed = 0;
        for (const [key, series] of this.series) {
            for (const [bucketAt, point] of series.buckets) {
                if (stamp(point.seenAt) < now - this.policy.retentionMs || stamp(point.seenAt) > now) {
                    series.buckets.delete(bucketAt);
                    removed++;
                }
            }
            if (!series.buckets.size) this.series.delete(key);
        }
        return removed;
    }

    snapshot(now = Date.now()) {
        this.prune(now);
        return { kind: 'albion.tools.order-price-history', version: this.policy.version,
            policy: { ...this.policy }, source: 'market-order-packets',
            series: [...this.series.values()].map(({ buckets, ...identity }) => ({ ...identity,
                buckets: [...buckets.values()].sort((a, b) => stamp(a.bucketAt) - stamp(b.bucketAt)) })) };
    }

    restore(payload, now = Date.now()) {
        if (payload?.kind !== 'albion.tools.order-price-history' || payload.version !== this.policy.version
            || payload.source !== 'market-order-packets'
            || payload.policy?.bucketMs !== this.policy.bucketMs
            || payload.policy?.representative !== this.policy.representative
            || !Array.isArray(payload.series)) throw new Error('Incompatible order history archive');
        for (const series of payload.series) {
            if (!Array.isArray(series.buckets) || !this.servers.has(series.server) || !series.itemId || !series.city
                || !Number.isInteger(series.quality) || series.quality < 1 || series.quality > 5
                || !BOOK_PRICE_FIELDS[series.side] || series.priceField !== BOOK_PRICE_FIELDS[series.side]) {
                throw new Error('Invalid order history series');
            }
            for (const point of series.buckets) {
                const at = stamp(point.seenAt);
                if (!Number.isFinite(at) || !Number.isFinite(point.price) || point.price <= 0
                    || stamp(point.bucketAt) !== Math.floor(at / this.policy.bucketMs) * this.policy.bucketMs) {
                    throw new Error('Invalid order history bucket');
                }
                this.record({ ...series, ...point }, now);
            }
        }
        this.prune(now);
    }
}
