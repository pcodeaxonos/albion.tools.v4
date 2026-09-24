import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Locate StatisticsAnalysisTool Europe Trades.json under %LOCALAPPDATA%.
 * Instance IDs are discovered dynamically (never hardcoded).
 *
 * Preference (non-binding): largest non-empty UserData-EUROPE\Trades.json.
 * Does not depend on whether the SAT process is running.
 *
 * @param {{ localAppData?: string }} [options]
 * @returns {{ path: string, size: number, mtimeMs: number, instanceId: string }}
 */
export function findEuropeTradesFile(options = {}) {
    const localAppData = options.localAppData
        || process.env.LOCALAPPDATA
        || path.join(os.homedir(), 'AppData', 'Local');

    const satRoot = path.join(localAppData, 'StatisticsAnalysisTool');
    if (!fs.existsSync(satRoot)) {
        throw new Error(
            `StatisticsAnalysisTool klasörü bulunamadı: ${satRoot}`
        );
    }

    const instancesDir = path.join(satRoot, 'Instances');
    if (!fs.existsSync(instancesDir)) {
        throw new Error(
            `StatisticsAnalysisTool Instances klasörü bulunamadı: ${instancesDir}`
        );
    }

    let instanceEntries;
    try {
        instanceEntries = fs.readdirSync(instancesDir, { withFileTypes: true });
    } catch (error) {
        throw new Error(
            `Instances okunamadı (${instancesDir}): ${error.message}`
        );
    }

    const candidates = [];
    for (const entry of instanceEntries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const tradesPath = path.join(
            instancesDir,
            entry.name,
            'UserData-EUROPE',
            'Trades.json'
        );
        if (!fs.existsSync(tradesPath)) {
            continue;
        }
        let st;
        try {
            st = fs.statSync(tradesPath);
        } catch {
            continue;
        }
        if (!st.isFile()) {
            continue;
        }
        candidates.push({
            path: tradesPath,
            size: st.size,
            mtimeMs: st.mtimeMs,
            instanceId: entry.name
        });
    }

    if (candidates.length === 0) {
        throw new Error(
            `UserData-EUROPE\\Trades.json bulunamadı (arıanan: ${instancesDir}\\*\\UserData-EUROPE\\Trades.json)`
        );
    }

    candidates.sort((a, b) => {
        if (b.size !== a.size) {
            return b.size - a.size;
        }
        return b.mtimeMs - a.mtimeMs;
    });

    return candidates[0];
}

/**
 * Read Trades.json as UTF-8 and parse as a JSON array.
 * Read-only. Throws on missing file, invalid JSON, or non-array root.
 *
 * @param {string} filePath
 * @returns {{ records: object[], bytes: number }}
 */
export function readTradesFile(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        throw new Error(`Trades.json okunamadı (${filePath}): ${error.message}`);
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Trades.json JSON parse hatası (${filePath}): ${error.message}`);
    }

    if (!Array.isArray(data)) {
        throw new Error(
            `Trades.json root tipi array değil (${filePath}): ${data === null ? 'null' : typeof data}`
        );
    }

    return { records: data, bytes: Buffer.byteLength(raw, 'utf8') };
}
