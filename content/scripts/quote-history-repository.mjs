import { readFileSync, readSync, openSync, writeSync, fsyncSync, closeSync, renameSync, writeFileSync, truncateSync } from 'node:fs';
import { normalizeObservation, validateObservationSeries, OBSERVATION_POLICY, observationEvents } from '../js/core/market-observation.mjs';
import { preserveArchive, ARCHIVE_BACKUP_SUFFIX } from './archive-backup.mjs';
import { mergeSalesHistory, salesHistoryWindow } from '../js/core/sales-history-store.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { AODP_COLLECTOR_POLICY, AODP_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { priceIndexKey, marketSeriesKey, normalizePriceDate, BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';

// Stream transactions synchronously so large journals never become one V8 string.
export function* journalLines(path, { onTail } = {}) {
    let fd;
    try { fd = openSync(path, 'r'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const chunk = Buffer.alloc(64 * 1024);
    let pending = Buffer.alloc(0);
    try {
        let size, total = 0;
        while ((size = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
            total += size;
            pending = Buffer.concat([pending, chunk.subarray(0, size)]);
            let start = 0, end;
            while ((end = pending.indexOf(10, start)) >= 0) {
                if (end > start) yield pending.subarray(start, end).toString('utf8');
                start = end + 1;
            }
            pending = Buffer.from(pending.subarray(start));
        }
        if (pending.length) {
            const line = pending.toString('utf8');
            if (onTail) {
                try { JSON.parse(line); }
                catch { onTail({ truncateAt: total - pending.length }); return; }
                onTail({ needsNewline: true });
            }
            yield line;
        }
    } finally { closeSync(fd); }
}

const salesKey = (server, item, city, quality) => `${server}|${priceIndexKey(item, city, quality)}`;

/** Durable append transactions; daily atomic checkpoint. Never silently repair corrupt input. */
export class QuoteHistoryRepository {
    constructor({ path, servers, now = Date.now(), policy = AODP_COLLECTOR_POLICY }) {
        this.path = path; this.journalPath = `${path}.journal`; this.policy = policy;
        this.history = new OrderPriceHistory({ servers, source: 'aodp-current', policy: AODP_HISTORY_POLICY });
        this.audits = [];
        this.anchors = new Map(); this.current = new Map(); this.sequence = 0; this.pending = []; this.lastCheckpoint = now;
        const read = file => { try { return readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
        const raw = read(path);
        if (raw) {
            const archive = JSON.parse(raw);
            if (archive.kind !== 'albion.tools.aodp-repository' || archive.version !== 1
                || !Number.isSafeInteger(archive.sequence) || !Array.isArray(archive.anchors)) throw new Error('Invalid AODP repository');
            this.audits = Array.isArray(archive.audits) ? archive.audits.slice(-OBSERVATION_POLICY.auditLimit) : [];
            this.history.restore(archive.history, now); this.sequence = archive.sequence;
            if (archive.checkpointAt) {
                this.lastCheckpoint = Date.parse(archive.checkpointAt);
                if (!Number.isFinite(this.lastCheckpoint)) throw new Error('Invalid AODP checkpoint time');
            }
            this.anchors = new Map(archive.anchors);
            this.current = new Map(archive.current || []);
            for (const [key, row] of this.anchors) if (!this.validAnchor(row) || key !== salesKey(row.server, row.item_id, row.location, row.quality)) throw new Error('Invalid AODP anchor archive');
            for (const [key, row] of this.anchors) this.anchors.set(key, mergeSalesHistory(null, row, now));
            for (const [key, observation] of this.current) if (!this.validObservation(observation) || key !== marketSeriesKey(observation)) throw new Error('Invalid AODP current archive');
            if (archive.salesHistoryVersion !== 1) {
                // Existing write-once backups contain real days overwritten by old
                // rolling anchors. Import only their sales events, never quote votes.
                const backupRaw = read(`${path}${ARCHIVE_BACKUP_SUFFIX}`);
                if (backupRaw) {
                    const backup = JSON.parse(backupRaw);
                    if (backup.kind !== archive.kind || backup.version !== 1 || !Array.isArray(backup.anchors)) throw new Error('Invalid sales migration backup');
                    for (const [key, row] of backup.anchors) {
                        if (!this.validAnchor(row) || key !== salesKey(row.server, row.item_id, row.location, row.quality)) throw new Error('Invalid sales migration anchor');
                        this.apply({ type: 'anchor', row }, now);
                    }
                }
                for (const line of journalLines(`${this.journalPath}${ARCHIVE_BACKUP_SUFFIX}`)) {
                    const transaction = JSON.parse(line);
                    if (!Array.isArray(transaction.events)) throw new Error('Invalid sales migration journal');
                    for (const event of transaction.events) if (event.type === 'anchor') this.apply(event, now);
                }
                this.salesMigrationRequired = true;
            }
        }
        for (const line of journalLines(this.journalPath, { onTail: tail => { this.journalTail = tail; } })) {
            const transaction = JSON.parse(line);
            if (!Number.isSafeInteger(transaction.sequence) || !Array.isArray(transaction.events)) throw new Error('Invalid AODP journal');
            if (transaction.sequence <= this.sequence) {
                if (this.salesMigrationRequired) for (const event of transaction.events)
                    if (event.type === 'anchor') this.apply(event, now);
                continue; // checkpoint committed before journal rotation
            }
            if (transaction.sequence !== this.sequence + 1) throw new Error('AODP journal sequence gap');
            const writtenAt = Date.parse(transaction.writtenAt ?? transaction.events[0]?.observation?.fetchedAt ?? transaction.events[0]?.row?.fetchedAt);
            if (Number.isFinite(writtenAt)) this.lastCheckpoint = Math.min(this.lastCheckpoint, writtenAt);
            // Audit rows do not participate in quote replay. Bound once per
            // transaction rather than copying the full audit ring for every row.
            this.audits = [...this.audits, ...transaction.events.filter(event => event.type === 'audit')
                .slice(-OBSERVATION_POLICY.auditLimit).map(event => event.observation)].slice(-OBSERVATION_POLICY.auditLimit);
            for (const event of transaction.events) if (event.type !== 'audit') this.apply(event, now);
            this.sequence = transaction.sequence;
        }
        this.prune(now);
    }
    apply(event, now) {
        if (event.type === 'audit') { this.audits.push(event.observation); this.audits = this.audits.slice(-OBSERVATION_POLICY.auditLimit); }
        else if (event.type === 'quote' && this.validObservation(event.observation)) {
            this.history.recordEvidence(event.observation, now);
            this.history.record(event.observation, now);
        }
        else if (event.type === 'current' && this.validObservation(event.observation)) {
            this.history.recordEvidence(event.observation, now);
            this.current.set(marketSeriesKey(event.observation), event.observation);
        }
        else if (event.type === 'anchor' && this.validAnchor(event.row)) {
            const key = salesKey(event.row.server, event.row.item_id, event.row.location, event.row.quality);
            this.anchors.set(key, mergeSalesHistory(this.anchors.get(key), event.row, now));
        }
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
    recordRejected(observation, now) {
        const event = { type: 'audit', observation: normalizeObservation(observation, { now }) };
        this.apply(event, now); this.pending.push(event);
    }
    record(observation, now) {
        const at = Date.parse(normalizePriceDate(observation.sourceQuoteAt));
        const fetched = Date.parse(normalizePriceDate(observation.fetchedAt));
        if (!this.validObservation(observation)
            || !Number.isFinite(at) || !Number.isFinite(fetched) || fetched > now || fetched < at
            || at < now - this.history.policy.retentionMs || !(observation.price > 0)) return false;
        // Historical corrections and same-hour independent events must survive journal replay too.
        if (this.history.recordEvidence(observation, now)) this.pending.push({type:'quote',observation});
        const assessed = validateObservationSeries([...observationEvents(this.history.seriesFor(observation, now) || {buckets:[]}), observation], { now });
        const normalized = normalizeObservation(observation, { now });
        const matched = assessed.observations.find(point => point.evidenceId === normalized.evidenceId);
        observation = { ...observation, observationVersion: normalized.observationVersion, observedAt: normalized.observedAt, receivedAt: normalized.receivedAt, processedAt: normalized.processedAt, coverage: normalized.coverage, sourceTimeKnown: normalized.sourceTimeKnown, observationId: normalized.observationId, evidenceId: normalized.evidenceId, validationStatus: matched?.validationStatus ?? normalized.validationStatus, reasons: matched?.reasons ?? normalized.reasons, evidence: matched?.evidence ?? [] };
        if (observation.validationStatus !== 'accepted') {
            const previousAudit = this.audits.findLast ? this.audits.findLast(point => point.observationId === observation.observationId) : [...this.audits].reverse().find(point => point.observationId === observation.observationId);
            if (!previousAudit || previousAudit.validationStatus !== observation.validationStatus) { const event = { type: 'audit', observation }; this.apply(event, now); this.pending.push(event); }
        }
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
        if (this.journalTail) {
            if (this.journalTail.truncateAt != null) {
                preserveArchive(this.journalPath, '.torn-tail.bak');
                truncateSync(this.journalPath, this.journalTail.truncateAt);
            } else if (this.journalTail.needsNewline) {
                const fd = openSync(this.journalPath, 'a');
                try { writeSync(fd, '\n'); fsyncSync(fd); } finally { closeSync(fd); }
            }
            this.journalTail = null;
        }
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
        if (this.salesMigrationRequired || now - this.lastCheckpoint >= this.policy.checkpointMs) this.checkpoint(now);
    }
    checkpoint(now = Date.now()) {
        this.prune(now);
        preserveArchive(this.path); preserveArchive(this.journalPath);
        const fd = openSync(`${this.path}.tmp`, 'w');
        try { writeFileSync(fd, JSON.stringify({ kind: 'albion.tools.aodp-repository', version: 1,
            sequence: this.sequence, checkpointAt: new Date(now).toISOString(), history: this.history.snapshot(now),
            audits: this.audits, observationVersion: OBSERVATION_POLICY.version, salesHistoryVersion: 1, anchors: [...this.anchors], current: [...this.current] })); fsyncSync(fd); }
        finally { closeSync(fd); }
        renameSync(`${this.path}.tmp`, this.path);
        // Old journal remains safe if the process dies before/while rotation: sequence skips it.
        const journalFd = openSync(`${this.journalPath}.tmp`, 'w');
        try { fsyncSync(journalFd); } finally { closeSync(journalFd); }
        renameSync(`${this.journalPath}.tmp`, this.journalPath);
        this.lastCheckpoint = now;
        this.salesMigrationRequired = false;
    }
    prune(now = Date.now()) {
        this.audits = this.audits.filter(point => Date.parse(point.processedAt) >= now - OBSERVATION_POLICY.auditRetentionMs);
        this.history.prune(now);
        for (const [key, row] of this.current) if (now - Date.parse(row.sourceQuoteAt) > this.history.policy.retentionMs) this.current.delete(key);
        for (const [key, row] of this.anchors) {
            if (now - Date.parse(row.fetchedAt) > this.history.policy.retentionMs) this.anchors.delete(key);
            else this.anchors.set(key, mergeSalesHistory(null, row, now));
        }
    }
    snapshot(now = Date.now()) { return this.history.snapshot(now); }
    identities(now = Date.now()) { return this.history.identities(now); }
    seriesRevision(identity) { return this.history.seriesRevision(identity); }
    seriesFor(identity, now = Date.now()) { return this.history.seriesFor(identity, now); }
    anchor(item, city, quality, server) { return this.anchors.get(salesKey(server, item, city, quality)); }
    salesHistory({ server, items, locations, qualities, days, now = Date.now() }) {
        return items.flatMap(item => locations.flatMap(city => qualities.map(quality => {
            const row = this.anchor(item, city, quality, server);
            return salesHistoryWindow(row ?? { server, item_id: item, location: city, quality, source: 'aodp-sales-history', data: [] }, days, now);
        })));
    }
    currentQuote(identity) { return this.current.get(marketSeriesKey(identity)); }
}
