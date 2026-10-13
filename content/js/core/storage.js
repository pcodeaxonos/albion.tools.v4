import { isPersistentKey } from './persistence-config.mjs';
import { readDurable, writeDurable } from './durable-storage.mjs';

export function readStorage(key) {
    try {
        if (isPersistentKey(key)) return readDurable(key);
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key, value) {
    try {
        if (isPersistentKey(key)) return writeDurable(key, value);
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeStorage(key) {
    try {
        if (isPersistentKey(key)) return writeDurable(key, null);
        localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

export function readJsonStorage(key, { legacyKeys = [] } = {}) {
    for (const candidate of [key, ...legacyKeys]) {
        const raw = readStorage(candidate);
        if (!raw) {
            continue;
        }
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }
    return null;
}

export function writeJsonStorage(key, value) {
    return writeStorage(key, JSON.stringify(value));
}
