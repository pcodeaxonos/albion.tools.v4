import { normalizeObservation, observationTimestamp } from './market-observation.mjs';
import { BOOK_PRICE_FIELDS, marketSeriesKey } from './market-primitives.mjs';
import { ORDER_HISTORY_POLICY } from './market-history-config.mjs';

function stamp(value) {
    return observationTimestamp(value);
}

function validatePolicy(policy) {
    if (!(Number.isSafeInteger(policy.bucketMs) && policy.bucketMs > 0)
        || !(Number.isSafeInteger(policy.retentionMs) && policy.retentionMs >= policy.bucketMs)
        || policy.representative !== 'first-observation') throw new Error('Invalid order history policy');
}

/** One independently weighted sample per server/item/city/quality/side/time bucket. */
export class OrderPriceHistory {
    constructor({ servers, policy = ORDER_HISTORY_POLICY, source = 'market-order-packets' } = {}) {
        validatePolicy(policy);
        this.servers = new Set(servers || []);
        this.policy = Object.freeze({ ...policy });
        this.series = new Map();
        this.revision = 0;
        this.source = source;
    }

    recordRow(server, row, now = Date.now()) {
        let added = 0;
        for (const [side, field] of Object.entries(BOOK_PRICE_FIELDS)) {
            added += Number(this.record({ server, itemId: row.item_id, city: row.city,
                quality: row.quality, side, coverage: row.coverage, sourceTimeKnown: row.sourceTimeKnown, rawEvidence: row.rawEvidence, price: row[field], seenAt: row[`${field}_date`] }, now));
        }
        return added;
    }

    record(observation, now = Date.now()) {
        const { server, itemId, city, quality, side, price } = observation;
        // AODP observations belong to collection time, never backdated to an old current quote.
        const at = stamp(this.source === 'aodp-current' ? observation.fetchedAt : observation.seenAt);
        const sourceAt = stamp(observation.sourceQuoteAt);
        if (this.source === 'aodp-current' && (observation.source !== this.source
            || !Number.isFinite(sourceAt) || sourceAt > at
            || sourceAt < now - this.policy.retentionMs)) return false;
        if (!this.servers.has(server) || !itemId || !city || !BOOK_PRICE_FIELDS[side]
            || !Number.isInteger(quality) || quality < 1 || quality > 5
            || !Number.isFinite(price) || price <= 0 || !Number.isFinite(at)
            || at > now || at < now - this.policy.retentionMs) return false;
        const bucketAt = this.bucketStamp(new Date(at).toISOString());
        const key = marketSeriesKey(observation);
        let series = this.series.get(key);
        if (!series) {
            series = { server, itemId, city, quality, side, priceField: BOOK_PRICE_FIELDS[side], buckets: new Map() };
            this.series.set(key, series);
        }
        // Exact retries and subsequent scans cannot add weight to an occupied bucket.
        // Out-of-order input may replace its representative with the earlier observation.
        const { buckets: ignoredBuckets, priceField: ignoredField, ...rawPoint } = observation;
        const normalized = normalizeObservation({ ...rawPoint, source: this.source }, { now });
        // A source event cannot become independent merely by arriving in another hour.
        if ([...series.buckets.values()].some(point => point.observationId === normalized.observationId)) return false;
        const previous = series.buckets.get(bucketAt);
        if (previous && stamp(previous.seenAt) <= at) return false;
        series.revision = ++this.revision;
        series.buckets.set(bucketAt, { ...normalized, ...(observation.validationStatus ? { validationStatus: observation.validationStatus, reasons: observation.reasons, ...(observation.evidence ? { evidence: observation.evidence } : {}) } : {}), bucketAt: new Date(bucketAt).toISOString(),
            seenAt: new Date(at).toISOString(), price,
            ...(this.source === 'aodp-current' ? { source: this.source,
                sourceQuoteAt: new Date(sourceAt).toISOString(), fetchedAt: new Date(at).toISOString() } : {}) });
        return true;
    }

    /** Preserve independently timestamped AODP events without changing the legacy first-per-hour representative. */
    recordEvidence(observation, now = Date.now()) {
        if (this.source !== 'aodp-current') return false;
        const point = normalizeObservation(observation, { now, source: this.source });
        if (point.validationStatus === 'rejected' || !point.sourceTimeKnown || point.at < now-this.policy.retentionMs) return false;
        const series = this.series.get(marketSeriesKey(observation));
        const bucket = series?.buckets.get(this.bucketStamp(observation.fetchedAt))
            || [...(series?.buckets.values() || [])].find(p=>p.evidenceId===point.evidenceId || p.evidenceObservations?.some(event=>event.evidenceId===point.evidenceId));
        if (!bucket) return false;
        const candidates = [bucket, ...(bucket.evidenceObservations || [])];
        if (candidates.some(p => p.evidenceId === point.evidenceId && p.price === point.price)) return false;
        bucket.evidenceObservations = [...(bucket.evidenceObservations || []), point];
        series.revision = ++this.revision;
        return true;
    }

    prune(now = Date.now()) {
        let removed = 0;
        for (const [key, series] of this.series) {
            for (const [bucketAt, point] of series.buckets) {
                if (stamp(point.seenAt) < now - this.policy.retentionMs || stamp(point.seenAt) > now) {
                    series.buckets.delete(bucketAt);
                    series.revision = ++this.revision;
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
            policy: { ...this.policy }, source: this.source,
            series: [...this.series.values()].map(({ buckets, revision, ...identity }) => ({ ...identity,
                buckets: [...buckets.values()].sort((a, b) => stamp(a.bucketAt) - stamp(b.bucketAt)) })) };
    }

    identities(now = Date.now()) {
        this.prune(now);
        return [...this.series.values()].map(({ server, itemId, city, quality, side }) => (
            { server, itemId, city, quality, side }));
    }

    seriesRevision(identity) { return this.series.get(marketSeriesKey(identity))?.revision ?? 0; }

    seriesFor(identity, now = Date.now()) {
        const series = this.series.get(marketSeriesKey(identity));
        if (!series) return null;
        const { buckets, ...key } = series;
        return { ...key, source: this.source, buckets: [...buckets.values()].filter(point => {
            const at = stamp(point.seenAt); return at >= now - this.policy.retentionMs && at <= now;
        }) };
    }

    bucketStamp(value) { return Math.floor(stamp(value) / this.policy.bucketMs) * this.policy.bucketMs; }
    pointFor(identity, seenAt) { return this.series.get(marketSeriesKey(identity))?.buckets.get(this.bucketStamp(seenAt)); }

    restore(payload, now = Date.now()) {
        if (payload?.kind !== 'albion.tools.order-price-history' || payload.version !== this.policy.version
            || payload.source !== this.source
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
                    || stamp(point.bucketAt) !== Math.floor(at / this.policy.bucketMs) * this.policy.bucketMs
                    || (this.source === 'aodp-current' && (point.source !== this.source
                        || !Number.isFinite(stamp(point.sourceQuoteAt)) || stamp(point.sourceQuoteAt) > at
                        || stamp(point.fetchedAt) !== at))) {
                    throw new Error('Invalid order history bucket');
                }
                this.record({ ...series, ...point }, now);
                if (point.evidenceObservations !== undefined && !Array.isArray(point.evidenceObservations)) throw new Error('Invalid supplemental evidence');
                for (const event of point.evidenceObservations || []) {
                    if (this.source !== 'aodp-current' || event.source !== this.source
                        || ['server','itemId','city','quality','side'].some(key=>event[key]!==series[key])
                        || !Number.isFinite(stamp(event.sourceQuoteAt)) || !Number.isFinite(event.price) || event.price<=0
                        || !Number.isFinite(stamp(event.fetchedAt)) || stamp(event.sourceQuoteAt)>stamp(event.fetchedAt)
                        || (event.bucketAt && this.bucketStamp(event.fetchedAt)!==stamp(event.bucketAt)))
                        throw new Error('Invalid supplemental evidence');
                    this.recordEvidence(event, now);
                }
            }
        }
        this.prune(now);
    }
}
