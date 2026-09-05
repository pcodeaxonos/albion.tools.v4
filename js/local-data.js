import { getSettings, LOCAL_PRICE_HOST } from './settings.js';

export const LOCAL_DATA_PREFIX = 'albiontools.v4.';
export const LOCAL_DATA_KIND = 'albion.tools.local-data';
export const LOCAL_DATA_VERSION = 1;

const CLOCK_KEY = LOCAL_DATA_PREFIX + '_syncClock';
const HUB_DATA_PATH = '/api/v1/local-data';
const HUB_META_PATH = '/api/v1/local-data/meta';
const META_TIMEOUT_MS = 1200;
const BODY_TIMEOUT_MS = 8000;
const PUSH_DEBOUNCE_MS = 700;

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;

let clockInstalled = false;
let muteClock = false;
let autoPushEnabled = false;
let pushTimer = 0;
let bootPromise = null;

function isTrackedKey(key) {
    return typeof key === 'string' && key.startsWith(LOCAL_DATA_PREFIX) && key !== CLOCK_KEY;
}

function wrappedSetItem(key, value) {
    if (this === localStorage && !muteClock && isTrackedKey(key)) {
        originalSetItem.call(this, CLOCK_KEY, String(Date.now()));
        scheduleHubPush();
    }
    return originalSetItem.call(this, key, value);
}

function wrappedRemoveItem(key) {
    if (this === localStorage && !muteClock && isTrackedKey(key)) {
        originalSetItem.call(this, CLOCK_KEY, String(Date.now()));
        scheduleHubPush();
    }
    return originalRemoveItem.call(this, key);
}

export function installLocalDataClock() {
    if (clockInstalled) {
        return;
    }
    clockInstalled = true;
    Storage.prototype.setItem = wrappedSetItem;
    Storage.prototype.removeItem = wrappedRemoveItem;
}

export function getLocalDataClock() {
    return Number(localStorage.getItem(CLOCK_KEY) || '0') || 0;
}

function writeClock(ms) {
    originalSetItem.call(localStorage, CLOCK_KEY, String(ms));
}

export function listLocalDataKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (isTrackedKey(key)) {
            keys.push(key);
        }
    }
    return keys.sort();
}

export function ensureLocalDataClock() {
    if (getLocalDataClock() > 0) {
        return getLocalDataClock();
    }
    if (listLocalDataKeys().length === 0) {
        return 0;
    }
    const now = Date.now();
    writeClock(now);
    return now;
}

export function collectLocalData() {
    const clock = ensureLocalDataClock();
    const data = {};
    for (const key of listLocalDataKeys()) {
        data[key] = localStorage.getItem(key);
    }
    return {
        version: LOCAL_DATA_VERSION,
        kind: LOCAL_DATA_KIND,
        exportedAt: new Date(clock || Date.now()).toISOString(),
        origin: location.origin,
        data
    };
}

export function localDataSummary() {
    const keys = listLocalDataKeys();
    let bytes = 0;
    for (const key of keys) {
        bytes += key.length + (localStorage.getItem(key)?.length || 0);
    }
    return {
        keys: keys.length,
        bytes,
        clock: getLocalDataClock()
    };
}

export function parseLocalDataSnapshot(raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || parsed.kind !== LOCAL_DATA_KIND) {
        throw new Error('Bu dosya Albion Tools yedeği değil.');
    }
    if (Number(parsed.version) !== LOCAL_DATA_VERSION) {
        throw new Error('Yedek sürümü desteklenmiyor.');
    }
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
        throw new Error('Yedek bozuk.');
    }

    const data = {};
    for (const [key, value] of Object.entries(parsed.data)) {
        if (!isTrackedKey(key) || value == null) {
            continue;
        }
        data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    return {
        version: LOCAL_DATA_VERSION,
        kind: LOCAL_DATA_KIND,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        origin: typeof parsed.origin === 'string' ? parsed.origin : '',
        data
    };
}

function tryParseJson(value) {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeDailyBonusRows(left, right) {
    const rows = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
    const byDate = new Map();
    for (const row of rows) {
        if (!row || typeof row !== 'object' || !row.date) {
            continue;
        }
        const date = String(row.date);
        const previous = byDate.get(date);
        if (!previous) {
            byDate.set(date, row);
            continue;
        }
        const score = (item) => (item.slot1FamilyKey ? 1 : 0) + (item.slot2FamilyKey ? 1 : 0);
        byDate.set(date, score(row) >= score(previous) ? { ...previous, ...row } : { ...row, ...previous });
    }
    return [...byDate.values()]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((row, index) => ({ ...row, id: index + 1 }));
}

function mergeStoredValues(key, localValue, remoteValue, localNewer) {
    if (localValue == null) {
        return remoteValue;
    }
    if (remoteValue == null) {
        return localValue;
    }
    if (key.endsWith('dailyBonuses')) {
        return JSON.stringify(mergeDailyBonusRows(tryParseJson(localValue), tryParseJson(remoteValue)));
    }
    const localParsed = tryParseJson(localValue);
    const remoteParsed = tryParseJson(remoteValue);
    if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
        return JSON.stringify(localParsed.length >= remoteParsed.length ? localParsed : remoteParsed);
    }
    if (isPlainObject(localParsed) && isPlainObject(remoteParsed)) {
        const merged = localNewer ? { ...remoteParsed, ...localParsed } : { ...localParsed, ...remoteParsed };
        return JSON.stringify(merged);
    }
    return localNewer ? localValue : remoteValue;
}

export function mergeLocalDataMaps(localData = {}, remoteData = {}, localNewer = true) {
    const keys = new Set([...Object.keys(localData), ...Object.keys(remoteData)]);
    const data = {};
    for (const key of keys) {
        if (!isTrackedKey(key)) {
            continue;
        }
        data[key] = mergeStoredValues(key, localData[key], remoteData[key], localNewer);
    }
    return data;
}

export function applyLocalData(snapshot, { replace = true } = {}) {
    const next = parseLocalDataSnapshot(snapshot);
    muteClock = true;
    try {
        if (replace) {
            const incoming = new Set(Object.keys(next.data));
            for (const key of listLocalDataKeys()) {
                if (!incoming.has(key)) {
                    originalRemoveItem.call(localStorage, key);
                }
            }
            for (const [key, value] of Object.entries(next.data)) {
                originalSetItem.call(localStorage, key, value);
            }
        } else {
            const merged = mergeLocalDataMaps(collectLocalData().data, next.data, true);
            for (const [key, value] of Object.entries(merged)) {
                originalSetItem.call(localStorage, key, value);
            }
            next.data = merged;
        }
        const importedAt = Date.parse(next.exportedAt);
        writeClock(Number.isFinite(importedAt) ? importedAt : Date.now());
    } catch (error) {
        if (error?.name === 'QuotaExceededError') {
            throw new Error('Tarayıcı deposu doldu; yedek uygulanamadı.');
        }
        throw error;
    } finally {
        muteClock = false;
    }
    return next;
}

export function downloadLocalData() {
    const snapshot = collectLocalData();
    const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    const stamp = (snapshot.exportedAt || '').slice(0, 10) || 'export';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `albion-tools-data-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return snapshot;
}

export function formatDataBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function hubFetch(path, options = {}) {
    const timeout = options.timeout ?? META_TIMEOUT_MS;
    const fetchOptions = { ...options };
    delete fetchOptions.timeout;
    return fetch(`${LOCAL_PRICE_HOST}${path}`, {
        ...fetchOptions,
        signal: AbortSignal.timeout(timeout)
    });
}

export async function fetchHubDataMeta() {
    const response = await hubFetch(HUB_META_PATH, { timeout: META_TIMEOUT_MS });
    if (!response.ok) {
        throw new Error('Hub meta alınamadı');
    }
    return response.json();
}

export async function fetchHubDataSnapshot() {
    const response = await hubFetch(HUB_DATA_PATH, { timeout: BODY_TIMEOUT_MS });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error('Hub verisi alınamadı');
    }
    return parseLocalDataSnapshot(await response.json());
}

export async function pushLocalDataToHub(snapshot = collectLocalData()) {
    const response = await hubFetch(HUB_DATA_PATH, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        timeout: BODY_TIMEOUT_MS
    });
    if (!response.ok) {
        throw new Error('Hub’a gönderilemedi');
    }
    return response.json();
}

function hubTime(meta) {
    if (!meta || meta.empty) {
        return 0;
    }
    const parsed = Date.parse(meta.exportedAt);
    return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncWithHub(mode = 'auto') {
    const meta = await fetchHubDataMeta();
    const localClock = ensureLocalDataClock();
    const remoteClock = hubTime(meta);
    const localNewer = localClock >= remoteClock;

    if (mode === 'auto') {
        const local = collectLocalData();
        const remote = await fetchHubDataSnapshot();
        if (!remote && Object.keys(local.data).length === 0) {
            return { status: 'empty', meta };
        }
        const merged = {
            version: LOCAL_DATA_VERSION,
            kind: LOCAL_DATA_KIND,
            exportedAt: new Date(Math.max(localClock, remoteClock, Date.now())).toISOString(),
            origin: location.origin,
            data: mergeLocalDataMaps(local.data, remote?.data ?? {}, localNewer)
        };
        applyLocalData(merged, { replace: false });
        await pushLocalDataToHub(merged);
        return { status: 'merged', meta: { empty: false, exportedAt: merged.exportedAt, origin: merged.origin, keyCount: Object.keys(merged.data).length } };
    }

    if (mode === 'push') {
        const snapshot = collectLocalData();
        if (Object.keys(snapshot.data).length === 0) {
            return { status: 'empty', meta };
        }
        await pushLocalDataToHub(snapshot);
        return { status: 'pushed', meta: { ...meta, empty: false, exportedAt: snapshot.exportedAt, origin: snapshot.origin, keyCount: Object.keys(snapshot.data).length } };
    }

    if (mode === 'pull') {
        const snapshot = await fetchHubDataSnapshot();
        if (!snapshot) {
            return { status: 'empty', meta };
        }
        applyLocalData(snapshot, { replace: false });
        return { status: 'pulled', meta: { empty: false, exportedAt: snapshot.exportedAt, origin: snapshot.origin, keyCount: Object.keys(snapshot.data).length }, snapshot };
    }

    return { status: meta?.empty ? 'empty' : 'in-sync', meta };
}

function scheduleHubPush() {
    if (!autoPushEnabled || muteClock || !getSettings().dataSync) {
        return;
    }
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => {
        pushTimer = 0;
        pushLocalDataToHub().catch(() => {});
    }, PUSH_DEBOUNCE_MS);
}

export function setLocalDataAutoPush(enabled) {
    autoPushEnabled = Boolean(enabled);
}

async function runBootSync() {
    installLocalDataClock();
    ensureLocalDataClock();
    if (!getSettings().dataSync) {
        autoPushEnabled = false;
        return { status: 'off' };
    }

    try {
        const result = await syncWithHub('auto');
        autoPushEnabled = true;
        return result;
    } catch {
        autoPushEnabled = true;
        return { status: 'offline' };
    }
}

export function bootLocalDataSync() {
    if (!bootPromise) {
        bootPromise = runBootSync();
    }
    return bootPromise;
}

installLocalDataClock();
