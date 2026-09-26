export function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeStorage(key) {
    try {
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
