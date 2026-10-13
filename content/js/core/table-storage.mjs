import { tables } from '../db/schema.js';
import { tableStorageKey } from './persistence-config.mjs';

const definitions = new Map(Object.entries(tables).map(([name, table]) => [tableStorageKey(name), table]));
export function storedTableDefinition(key) { return definitions.get(key); }

export function normalizeImportedTable(value, key) {
    const definition = storedTableDefinition(key);
    if (!definition?.autoKey || value === null) return value;
    const rows = JSON.parse(value);
    if (!Array.isArray(rows)) return value;
    const seen = new Set();
    let next = rows.reduce((max, row) => Math.max(max, Number(row?.[definition.key]) || 0), 0) + 1;
    return JSON.stringify(rows.map(row => {
        if (!row || typeof row !== 'object') return row;
        const id = row[definition.key];
        if (id == null || seen.has(String(id))) return { ...row, [definition.key]: next++ };
        seen.add(String(id));
        return row;
    }));
}

export function tableRows(value, key) {
    const definition = storedTableDefinition(key);
    if (!definition || value === null) return null;
    const rows = JSON.parse(value);
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)
        || row[definition.key] == null) || new Set(rows.map(row => String(row[definition.key]))).size !== rows.length) {
        throw new Error('Tablo satırları ve benzersiz kayıt kimlikleri gerekli');
    }
    return rows.map((row, position) => ({ id: String(row[definition.key]), row, position }));
}

export function tableWriteChange(key, value, previous, revision) {
    if (!storedTableDefinition(key) || value === null || previous === null) return { key, value, revision };
    const before = new Map(tableRows(previous, key).map(row => [row.id, row]));
    const after = tableRows(value, key);
    const ids = new Set(after.map(row => row.id));
    return { key, revision, patch: {
        upsert: after.filter(row => {
            const old = before.get(row.id);
            return !old || old.position !== row.position || JSON.stringify(old.row) !== JSON.stringify(row.row);
        }),
        remove: [...before.keys()].filter(id => !ids.has(id))
    } };
}
