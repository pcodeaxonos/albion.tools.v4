import { readFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, writeFileSync } from 'node:fs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { AODP_COLLECTOR_POLICY, AODP_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { priceIndexKey, marketSeriesKey, normalizePriceDate, BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';

const salesKey = (server, item, city, quality) => `${server}|${priceIndexKey(item, city, quality)}`;

/** Durable append transactions; daily atomic checkpoint. Never silently repair corrupt input. */
export class QuoteHistoryRepository {
    constructor({ path, servers, now = Date.now(), policy = AODP_COLLECTOR_POLICY }) {
        this.path = path; this.journalPath = `${path}.journal`; this.policy = policy;
        this.history = new OrderPriceHistory({ servers, source: 'aodp-current', policy: AODP_HISTORY_POLICY });
        this.anchors = new Map(); this.current = new Map(); this.sequence = 0; this.pending = []; this.lastCheckpoint = now;
        const read = file => { try { return readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
        const raw = read(path);
        if (raw) {
            const archive = JSON.parse(raw);
            if (archive.kind !== 'albion.tools.aodp-repository' || archive.version !== 1
                || !Number.isSafeInteger(archive.sequence) || !Array.isArray(archive.anchors)) throw new Error('Invalid AODP repository');
            this.history.restore(archive.history, now); this.sequence = archive.sequence;
            if (archive.checkpointAt) {
                this.lastCheckpoint = Date.parse(archive.checkpointAt);
                if (!Number.isFinite(this.lastCheckpoint)) throw new Error('Invalid AODP checkpoint time');
            }
            this.anchors = new Map(archive.anchors);
            this.current = new Map(archive.current || []);
            for (const [key, row] of this.anchors) if (!this.validAnchor(row) || key !== salesKey(row.server, row.item_id, row.location, row.quality)) throw new Error('Invalid AODP anchor archive');
            for (const [key, observation] of this.current) if (!this.validObservation(observation) || key !== marketSeriesKey(observation)) throw new Error('Invalid AODP current archive');
        }
        const journal = read(this.journalPath);
        if (journal) for (const line of journal.split('\n').filter(Boolean)) {
            const transaction = JSON.parse(line);
            if (!Number.isSafeInteger(transaction.sequence) || !Array.isArray(transaction.events)) throw new Error('Invalid AODP journal');
            if (transaction.sequence <= this.sequence) continue; // checkpoint committed before journal rotation
            if (transaction.sequence !== this.sequence + 1) throw new Error('AODP journal sequence gap');
            const writtenAt = Date.parse(transaction.writtenAt ?? transaction.events[0]?.observation?.fetchedAt ?? transaction.events[0]?.row?.fetchedAt);
            if (Number.isFinite(writtenAt)) this.lastCheckpoint = Math.min(this.lastCheckpoint, writtenAt);
            for (const event of transaction.events) this.apply(event, now);
            this.sequence = transaction.sequence;
        }
        this.prune(now);
    }
    apply(event, now) {
        if (event.type === 'quote' && this.validObservation(event.observation)) this.history.record(event.observation, now);
        else if (event.type === 'current' && this.validObservation(event.observation))
            this.current.set(marketSeriesKey(event.observation), event.observation);
        else if (event.type === 'anchor' && this.validAnchor(event.row))
            this.anchors.set(salesKey(event.row.server, event.row.item_id, event.row.location, event.row.quality), event.row);
        else throw new Error('Invalid AODP journal event');
    }
    validObservation(row) {
        const at = Date.parse(normalizePriceDate(row?.sourceQuoteAt)), fetched = Date.parse(normalizePriceDate(row?.fetchedAt));
        return row?.source === 'aodp-current' && this.history.servers.has(row.server)
            && typeof row.itemId === 'string' && Boolean(row.itemId) && typeof row.city === 'string' && Boolean(row.city)
            && Number.isInteger(row.quality) && row.quality >= 1 && row.quality <= 5 && Boolean(BOOK_PRICE_FIELDS[row.side])
            && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(at) && Number.isFinite(fetched) && at <= fetched
            && (!row.bucketAt || Date.parse(row.bucketAt) === this.history.bucketStamp(row.fetchedAt))
            && (!row.seenAt || Date.parse(row.seenAt) === fetched);
    }
    validAnchor(row) {
        return row?.source === 'aodp-sales-history' && this.history.servers.has(row.server)
            && row.item_id && row.location && Number.isInteger(row.quality) && row.quality >= 1 && row.quality <= 5
            && Array.isArray(row.data) && Number.isFinite(Date.parse(row.fetchedAt));
    }
    coverage(now) {
        const hour = 60 * 60 * 1000;
        let fresh1h = 0, fresh6h = 0, fresh24h = 0, sourceFresh6h = 0;
        const cells = new Set();
        for (const row of this.current.values()) {
            const polled = now - Date.parse(row.fetchedAt);
            const source = now - Date.parse(row.sourceQuoteAt);
            cells.add(`${row.itemId}|${row.city}|${row.quality}`);
            if (polled <= hour) fresh1h += 1;
            if (polled <= 6 * hour) fresh6h += 1;
            if (polled <= 24 * hour) fresh24h += 1;
            if (source <= 6 * hour) sourceFresh6h += 1;
        }
        return { series: this.history.series.size, currentQuotes: this.current.size, cells: cells.size, fresh1h, fresh6h, fresh24h, sourceFresh6h };
    }
    record(observation, now) {
        const at = Date.parse(normalizePriceDate(observation.sourceQuoteAt));
        const fetched = Date.parse(normalizePriceDate(observation.fetchedAt));
        if (!this.validObservation(observation)
            || !Number.isFinite(at) || !Number.isFinite(fetched) || fetched > now || fetched < at
            || at < now - this.history.policy.retentionMs || !(observation.price > 0)) return false;
        const key = marketSeriesKey(observation), previous = this.current.get(key);
        if (!previous || at > Date.parse(previous.sourceQuoteAt)
            || (at === Date.parse(previous.sourceQuoteAt) && observation.price !== previous.price)) {
            const event = { type: 'current', observation }; this.apply(event, now); this.pending.push(event);
        }
        // Source time must advance. Corrected prices at the same source time may update
        // the current quote, but cannot become a new hourly historical vote.
        if (previous && at <= Date.parse(previous.sourceQuoteAt)) return false;
        if (!this.history.record(observation, now)) return false;
        this.pending.push({ type: 'quote', observation: { ...observation, ...this.history.pointFor(observation, observation.fetchedAt) } }); return true;
    }
    setAnchor(row, now) {
        const event = { type: 'anchor', row }; this.apply(event, now); this.pending.push(event);
    }
    flush(now = Date.now()) {
        if (this.writeError) throw this.writeError;
        if (this.pending.length) {
            const sequence = this.sequence + 1;
            const fd = openSync(this.journalPath, 'a');
            try {
                const bytes = Buffer.from(JSON.stringify({ sequence, writtenAt: new Date(now).toISOString(), events: this.pending }) + '\n');
                let offset = 0;
                while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
                fsyncSync(fd);
            } catch (error) { this.writeError = new Error(`AODP journal write failed; restart required: ${error.message}`); throw this.writeError; }
            finally { closeSync(fd); }
            this.sequence = sequence; this.pending = [];
        }
        if (now - this.lastCheckpoint >= this.policy.checkpointMs) this.checkpoint(now);
    }
    checkpoint(now = Date.now()) {
        this.prune(now);
        const fd = openSync(`${this.path}.tmp`, 'w');
        try { writeFileSync(fd, JSON.stringify({ kind: 'albion.tools.aodp-repository', version: 1,
            sequence: this.sequence, checkpointAt: new Date(now).toISOString(), history: this.history.snapshot(now),
            anchors: [...this.anchors], current: [...this.current] })); fsyncSync(fd); }
        finally { closeSync(fd); }
        renameSync(`${this.path}.tmp`, this.path);
        // Old journal remains safe if the process dies before/while rotation: sequence skips it.
        writeFileSync(`${this.journalPath}.tmp`, '');
        renameSync(`${this.journalPath}.tmp`, this.journalPath);
        this.lastCheckpoint = now;
    }
    prune(now = Date.now()) {
        this.history.prune(now);
        for (const [key, row] of this.current) if (now - Date.parse(row.sourceQuoteAt) > this.history.policy.retentionMs) this.current.delete(key);
        for (const [key, row] of this.anchors) if (now - Date.parse(row.fetchedAt) > this.history.policy.retentionMs) this.anchors.delete(key);
    }
    snapshot(now = Date.now()) { return this.history.snapshot(now); }
    identities(now = Date.now()) { return this.history.identities(now); }
    seriesFor(identity, now = Date.now()) { return this.history.seriesFor(identity, now); }
    anchor(item, city, quality, server) { return this.anchors.get(salesKey(server, item, city, quality)); }
    currentQuote(identity) { return this.current.get(marketSeriesKey(identity)); }
}
