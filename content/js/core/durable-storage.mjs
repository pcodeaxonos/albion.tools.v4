import { USER_DATA_ENDPOINT, isPersistentKey } from './persistence-config.mjs';
import { tableWriteChange } from './table-storage.mjs';

// In-memory read cache. No browser database is required for permanent records.
const values = new Map();
const revisions = new Map();
const pending = new Map();
const confirmed = new Map();
let host = '', ready = false, active = null, timer = null, failure = null;
let backupStatus = null;
let operations = 0;
export const PERSISTENCE_EVENT = 'albiontools:persistence';

function notify() {
    globalThis.window?.dispatchEvent(new CustomEvent(PERSISTENCE_EVENT, { detail: persistenceStatus() }));
}
export function persistenceStatus() { return { ready, pending: pending.size + operations, error: failure?.message || null, ...backupStatus }; }
export function beginDurableOperation() { operations++; notify(); }
export function endDurableOperation(error = null) { operations--; if (error) failure = error; notify(); }

async function request(path = '', options = {}) {
    let response;
    try {
        response = await fetch(`${host}${USER_DATA_ENDPOINT}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
    } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            throw new Error('Veritabanı servisi zamanında yanıt vermedi. Bekleyen değişiklikleri Tekrar dene ile kaydedebilirsiniz.', { cause: error });
        }
        throw error;
    }
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'Veritabanına erişilemedi'); error.status = response.status; throw error; }
    return body;
}
function apply(entries) {
    for (const row of entries) {
        revisions.set(row.key, row.revision);
        confirmed.set(row.key, row.value);
        const value = pending.has(row.key) ? pending.get(row.key) : row.value;
        if (value === null) values.delete(row.key); else values.set(row.key, value);
    }
}

export async function initDurableStorage(baseUrl, legacy = {}) {
    host = baseUrl.replace(/\/$/, '');
    const snapshot = await request();
    apply(snapshot.entries);
    const previous = Object.entries(legacy).filter(([key]) => isPersistentKey(key));
    let migration = null;
    if (previous.length) {
        const imported = await request('/import', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: Object.fromEntries(previous), source: globalThis.location?.origin || 'browser' }) });
        apply(imported.entries);
        migration = imported;
    }
    backupStatus = snapshot.backup;
    ready = true;
    failure = null;
    notify();
    return migration;
}

export function readDurable(key) { return values.get(key) ?? null; }
export function durableKeys() { return [...values.keys()].sort(); }
export async function saveDurableChanges(changes) {
    await flushDurableWrites();
    const rows = [...changes].map(([key, value]) => tableWriteChange(key, value, confirmed.get(key) ?? null, revisions.get(key) ?? 0));
    if (!rows.length) return;
    try {
        const saved = await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: rows }) });
        apply(saved.entries.map(row => ({ ...row, value: row.value === undefined ? changes.get(row.key) : row.value })));
        failure = null; notify();
    } catch (error) { failure = error; notify(); throw error; }
}
export function writeDurable(key, value) {
    if (!ready) throw new Error('Veritabanı bağlantısı hazır değil');
    if (!isPersistentKey(key)) throw new Error('Geçersiz kalıcı veri anahtarı');
    value = value == null ? null : String(value);
    if ((values.get(key) ?? null) === value) return true;
    if (value === null) values.delete(key); else values.set(key, value);
    pending.set(key, value);
    failure = null;
    notify();
    // Coalesce rapid form changes into a small atomic request, never a full application snapshot.
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void flushDurableWrites().catch(() => {}); }, 80);
    return true;
}

export async function flushDurableWrites() {
    clearTimeout(timer); timer = null;
    if (active) await active;
    if (!pending.size) return;
    const sent = new Map(pending);
    const changes = [...sent].map(([key, value]) => tableWriteChange(key, value, confirmed.get(key) ?? null, revisions.get(key) ?? 0));
    active = (async () => {
        try {
            const result = await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
            for (const row of result.entries) {
                const value = row.value === undefined ? sent.get(row.key) : row.value;
                revisions.set(row.key, row.revision);
                confirmed.set(row.key, value);
                if (pending.get(row.key) === sent.get(row.key)) {
                    pending.delete(row.key);
                    if (value === null) values.delete(row.key); else values.set(row.key, value);
                }
            }
            failure = null;
        } catch (error) { failure = error; throw error; }
        finally { active = null; notify(); }
    })();
    await active;
    if (pending.size) return flushDurableWrites();
}

export async function reloadDurableStorage() {
    await flushDurableWrites();
    const snapshot = await request();
    values.clear(); revisions.clear(); confirmed.clear(); apply(snapshot.entries); backupStatus = snapshot.backup; notify();
}
export async function createDurableBackup() { await flushDurableWrites(); backupStatus = await request('/backup', { method: 'POST' }); notify(); return backupStatus; }

export const durableStorage = {
    getItem: readDurable,
    setItem: writeDurable,
    removeItem: key => writeDurable(key, null),
    key: index => durableKeys()[index] ?? null,
    get length() { return values.size; }
};
