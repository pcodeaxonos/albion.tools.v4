import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export const OPPORTUNITY_DIAGNOSTICS_POLICY = Object.freeze({
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    maxScans: 240,
    maxClientStates: 480,
    maxCollectorRuns: 240,
    maxBytes: 1_800_000,
    responseScans: 20,
    responseClientStates: 60,
    responseCollectorRuns: 60
});

const KIND = 'albion.tools.opportunity-diagnostics';
const VERSION = 1;
const STORE_KEYS = ['scans', 'clientStates', 'collectorRuns'];
const FILTER_KEYS = ['viewMode', 'views', 'excludedViews', 'sort', 'city', 'tier', 'enchant', 'query',
    'minDeviation', 'minNet', 'minReturn', 'execution', 'confidence', 'evidence', 'watched', 'action'];
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function emptyStore() { return { kind: KIND, version: VERSION, scans: [], clientStates: [], collectorRuns: [] }; }
function trimText(value, max = 120) { return typeof value === 'string' ? value.slice(0, max) : ''; }
function normalizedFilters(value = {}) {
    const out = {};
    for (const key of FILTER_KEYS) {
        const field = value[key];
        if (Array.isArray(field)) out[key] = field.filter(item => typeof item === 'string').slice(0, 32).map(item => trimText(item, 80));
        else if (typeof field === 'string') out[key] = trimText(field, key === 'query' ? 120 : 80);
    }
    return out;
}

export class OpportunityDiagnosticsRepository {
    constructor(path, { policy = OPPORTUNITY_DIAGNOSTICS_POLICY, now = Date.now } = {}) {
        this.path = path;
        this.policy = policy;
        this.now = now;
        this.error = null;
        this.data = emptyStore();
        if (existsSync(path)) {
            try {
                const saved = JSON.parse(readFileSync(path, 'utf8'));
                if (saved?.kind !== KIND || saved.version !== VERSION || STORE_KEYS.some(key => !Array.isArray(saved[key])))
                    throw new Error('Incompatible opportunity diagnostics store');
                this.data = { ...emptyStore(), ...saved };
                this.prune(false);
            } catch (error) { this.error = error.message; }
        }
    }

    recordServerScan(scan) {
        if (this.error) return false;
        const now = this.now();
        this.data.scans.push({ ...scan, recordedAt: new Date(now).toISOString() });
        this.data.scans = this.data.scans.slice(-this.policy.maxScans);
        const ids = new Set(this.data.scans.map(row => row.scanId));
        this.data.clientStates = this.data.clientStates.filter(row => ids.has(row.scanId));
        return this.persist();
    }

    recordClientState(input) {
        if (this.error) return false;
        const scan = this.data.scans.find(row => row.scanId === input?.scanId);
        if (!scan) return false;
        const state = { scanId: scan.scanId, server: scan.server, recordedAt: new Date(this.now()).toISOString(),
            filters: normalizedFilters(input.filters), layout: input.layout === 'list' ? 'list' : 'cards',
            availableCount: Math.max(0, Math.min(100_000, Math.floor(finite(input.availableCount) ?? 0))),
            shownCount: Math.max(0, Math.min(10_000, Math.floor(finite(input.shownCount) ?? 0))) };
        const prior = this.data.clientStates.at(-1);
        const comparable = ({ recordedAt, clientStateId, ...row }) => JSON.stringify(row);
        if (prior?.scanId === state.scanId && comparable(prior) === comparable(state)) return true;
        this.data.clientStates.push({ clientStateId: randomUUID(), ...state });
        this.data.clientStates = this.data.clientStates.slice(-this.policy.maxClientStates);
        return this.persist();
    }

    recordCollectorRun(run) {
        if (this.error) return false;
        const at = Number.isFinite(Date.parse(run?.fetchedAt)) ? run.fetchedAt : new Date(this.now()).toISOString();
        const fields = ['requests', 'httpRequestsSent', 'httpResponsesSuccess', 'httpResponsesFailure', 'rowsReceived',
            'validPriceSides', 'newSourceTimestampEvents', 'sameSourceCorrections', 'repeatedEvents', 'olderSourceTimestamps',
            'staleSourceSides', 'rejectedPriceSides', 'newHourlyArchiveRecords', 'supplementalObservations', 'buy', 'sell', 'invalid', 'stale'];
        const metrics = Object.fromEntries(fields.map(key => [key, Math.max(0, Math.floor(finite(run?.[key]) ?? 0))]));
        const record = { collectorRunId: randomUUID(), server: trimText(run?.server, 24), startedAt: at,
            completedAt: new Date(this.now()).toISOString(), status: trimText(run?.status || 'completed', 32),
            deferred: Boolean(run?.deferred), errors: Array.isArray(run?.errors) ? run.errors.slice(0, 8).map(value => trimText(value, 180)) : [],
            metrics };
        this.data.collectorRuns.push(record);
        this.data.collectorRuns = this.data.collectorRuns.slice(-this.policy.maxCollectorRuns);
        return this.persist();
    }

    snapshot({ server = null, now = this.now() } = {}) {
        this.prune(false, now);
        const select = rows => rows.filter(row => !server || row.server === server);
        return { kind: KIND, version: VERSION, policy: { retentionMs: this.policy.retentionMs,
            maxScans: this.policy.maxScans, maxClientStates: this.policy.maxClientStates,
            maxCollectorRuns: this.policy.maxCollectorRuns, maxBytes: this.policy.maxBytes },
        status: this.error ? 'error' : 'ok', error: this.error,
        scans: select(this.data.scans).slice(-this.policy.responseScans),
        clientStates: select(this.data.clientStates).slice(-this.policy.responseClientStates),
        collectorRuns: select(this.data.collectorRuns).slice(-this.policy.responseCollectorRuns),
        collectorWindows: this.collectorWindows(select(this.data.collectorRuns), now) };
    }

    collectorWindows(runs, now) {
        const summarize = windowMs => {
            const rows = runs.filter(row => now - Date.parse(row.completedAt) <= windowMs);
            const totals = {};
            for (const row of rows) for (const [key, value] of Object.entries(row.metrics)) totals[key] = (totals[key] || 0) + value;
            return { runs: rows.length, totals };
        };
        return { hour: summarize(60 * 60 * 1000), day: summarize(24 * 60 * 60 * 1000), week: summarize(7 * 24 * 60 * 60 * 1000) };
    }

    prune(save = false, now = this.now()) {
        const cutoff = now - this.policy.retentionMs;
        this.data.scans = this.data.scans.filter(row => Date.parse(row.recordedAt) >= cutoff).slice(-this.policy.maxScans);
        const scans = new Set(this.data.scans.map(row => row.scanId));
        this.data.clientStates = this.data.clientStates.filter(row => scans.has(row.scanId) && Date.parse(row.recordedAt) >= cutoff).slice(-this.policy.maxClientStates);
        this.data.collectorRuns = this.data.collectorRuns.filter(row => Date.parse(row.completedAt) >= cutoff).slice(-this.policy.maxCollectorRuns);
        while (Buffer.byteLength(JSON.stringify(this.data)) > this.policy.maxBytes) {
            const oldestScan = this.data.scans.length ? Date.parse(this.data.scans[0].recordedAt) : Infinity;
            const oldestClient = this.data.clientStates.length ? Date.parse(this.data.clientStates[0].recordedAt) : Infinity;
            const oldestRun = this.data.collectorRuns.length ? Date.parse(this.data.collectorRuns[0].completedAt) : Infinity;
            if (oldestScan <= oldestClient && oldestScan <= oldestRun) {
                const removed = this.data.scans.shift();
                this.data.clientStates = this.data.clientStates.filter(row => row.scanId !== removed?.scanId);
            } else if (oldestClient <= oldestRun) this.data.clientStates.shift();
            else if (this.data.collectorRuns.length) this.data.collectorRuns.shift();
            else break;
        }
        if (save) return this.persist();
        return true;
    }

    persist() {
        try {
            this.prune(false);
            const bytes = JSON.stringify(this.data);
            if (Buffer.byteLength(bytes) > this.policy.maxBytes) throw new Error('Opportunity diagnostics storage limit exceeded');
            writeFileSync(`${this.path}.tmp`, bytes);
            renameSync(`${this.path}.tmp`, this.path);
            return true;
        } catch (error) { this.error = error.message; return false; }
    }
}
