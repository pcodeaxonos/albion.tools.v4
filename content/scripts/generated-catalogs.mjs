import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tables } from '../js/db/schema.js';
import { tableStorageKey } from '../js/core/persistence-config.mjs';
import { mergeGeneratedCatalog } from '../js/core/generated-catalog.mjs';

export async function refreshGeneratedCatalogs(repository, root) {
    repository.db.exec('CREATE TABLE IF NOT EXISTS generated_catalog_sources (table_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, baseline TEXT NOT NULL)');
    const snapshot = new Map(repository.snapshot().entries.map(row => [row.key, row]));
    const updates = [], baselines = [], archived = {};
    let itemIds = null;
    for (const [name, definition] of Object.entries(tables).filter(([, table]) => table.seedPolicy === 'generated')) {
        const key = tableStorageKey(name);
        const bytes = readFileSync(join(root, definition.seedUrl));
        const fingerprint = createHash('sha256').update(bytes).digest('hex');
        const old = repository.db.prepare('SELECT fingerprint, baseline FROM generated_catalog_sources WHERE table_key = ?').get(key);
        const stored = snapshot.get(key);
        if (old?.fingerprint === fingerprint && stored?.value !== null) {
            if (name === 'items') {
                const currentByName = new Map(JSON.parse(old.baseline).map(row => [row.uniqueName, row.id]));
                itemIds = new Map(JSON.parse(bytes).map(row => [row.id, currentByName.get(row.uniqueName) ?? row.id]));
            }
            continue;
        }
        const source = JSON.parse(bytes);
        // Source foreign keys follow the item catalog's stable persisted identities.
        if (itemIds) for (const row of source) for (const column of definition.columns.filter(column => column.refTable === 'items')) {
            row[column.name] = itemIds.get(row[column.name]) ?? row[column.name];
        }
        const current = stored?.value ? JSON.parse(stored.value) : [];
        const merged = mergeGeneratedCatalog(source, current, old ? JSON.parse(old.baseline) : null, definition);
        if (stored?.value) archived[key] = stored.value;
        updates.push({ key, value: JSON.stringify(merged.rows), revision: stored?.revision || 0 });
        baselines.push({ key, fingerprint, value: JSON.stringify(merged.baseline) });
        if (name === 'items') {
            const stable = new Map(merged.baseline.map(row => [row.uniqueName, row.id]));
            itemIds = new Map(JSON.parse(bytes).map(row => [row.id, stable.get(row.uniqueName)]));
        }
    }
    if (!updates.length) return { refreshed: [] };
    await repository.createBackup();
    if (Object.keys(archived).length) repository.importLegacy(archived, 'generated-catalog-before-refresh');
    repository.db.exec('BEGIN IMMEDIATE');
    try {
        repository.write(updates, { inTransaction: true });
        const save = repository.db.prepare('INSERT INTO generated_catalog_sources VALUES (?, ?, ?) ON CONFLICT(table_key) DO UPDATE SET fingerprint = excluded.fingerprint, baseline = excluded.baseline');
        for (const row of baselines) save.run(row.key, row.fingerprint, row.value);
        repository.db.exec('COMMIT');
    } catch (error) { repository.db.exec('ROLLBACK'); throw error; }
    return { refreshed: updates.map(row => row.key) };
}
