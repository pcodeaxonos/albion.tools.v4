import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readdirSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { isPersistentKey, USER_DATA_BACKUP_RETENTION } from '../js/core/persistence-config.mjs';
import { storedTableDefinition, tableRows, normalizeImportedTable } from '../js/core/table-storage.mjs';

export class UserDataRepository {
    constructor(path, { backupDirectory = join(dirname(path), '.albion-tools-backups') } = {}) {
        this.path = path;
        this.backupDirectory = backupDirectory;
        mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS user_data (key TEXT PRIMARY KEY, value TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS data_migrations (name TEXT PRIMARY KEY, completed_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS legacy_imports (digest TEXT PRIMARY KEY, source TEXT NOT NULL, data TEXT NOT NULL, imported_at TEXT NOT NULL);`);
        if (!this.db.prepare('PRAGMA table_info(user_data)').all().some(column => column.name === 'is_table')) {
            this.db.exec('ALTER TABLE user_data ADD COLUMN is_table INTEGER NOT NULL DEFAULT 0');
        }
        this.db.exec('CREATE TABLE IF NOT EXISTS user_table_rows (table_key TEXT NOT NULL, row_id TEXT NOT NULL, position INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(table_key, row_id))');
        const check = this.db.prepare('PRAGMA quick_check').get();
        if (Object.values(check)[0] !== 'ok') { this.db.close(); throw new Error('Veritabanı bütünlük kontrolü başarısız; yedekten kurtarma gerekli.'); }
    }

    snapshot() {
        this.db.exec('BEGIN');
        try {
            const snapshot = { entries: this.db.prepare('SELECT key, value, revision, is_table FROM user_data').all().map(row => ({ key: row.key, revision: row.revision, value: this.value(row) })),
                updatedAt: this.db.prepare('SELECT MAX(updated_at) AS stamp FROM user_data').get().stamp };
            this.db.exec('COMMIT'); return snapshot;
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }

    value(row) {
        if (!row.is_table) return row.value;
        return '[' + this.db.prepare('SELECT value FROM user_table_rows WHERE table_key = ? ORDER BY position').all(row.key).map(row => row.value).join(',') + ']';
    }

    updateTable(key, rows) {
        const before = new Map(this.db.prepare('SELECT row_id, position, value FROM user_table_rows WHERE table_key = ?').all(key).map(row => [row.row_id, row]));
        const keep = new Set(rows.map(row => row.id));
        const save = this.db.prepare(`INSERT INTO user_table_rows VALUES (?, ?, ?, ?) ON CONFLICT(table_key, row_id) DO UPDATE SET position = excluded.position, value = excluded.value`);
        for (const row of rows) {
            const value = JSON.stringify(row.row), old = before.get(row.id);
            if (!old || old.value !== value || old.position !== row.position) save.run(key, row.id, row.position, value);
        }
        const remove = this.db.prepare('DELETE FROM user_table_rows WHERE table_key = ? AND row_id = ?');
        for (const id of before.keys()) if (!keep.has(id)) remove.run(key, id);
    }

    // The whole batch either commits, or leaves every value intact. Revisions protect other tabs/devices.
    write(changes, { onlyIfMissing = false, inTransaction = false } = {}) {
        if (!Array.isArray(changes) || changes.length > 1000 || new Set(changes.map(row => row?.key)).size !== changes.length
            || changes.some(row => !row || !isPersistentKey(row.key) || (!row.patch && row.value !== null && typeof row.value !== 'string')
                || (!onlyIfMissing && (!Number.isSafeInteger(row.revision) || row.revision < 0)))) {
            const error = new Error('Geçersiz kayıt paketi'); error.status = 400; throw error;
        }
        const read = this.db.prepare('SELECT key, value, revision, is_table FROM user_data WHERE key = ?');
        const save = this.db.prepare(`INSERT INTO user_data (key, value, revision, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_at = excluded.updated_at`);
        if (!inTransaction) this.db.exec('BEGIN IMMEDIATE');
        try {
            const entries = [];
            for (const change of changes) {
                const current = read.get(change.key);
                const currentValue = current ? this.value(current) : null;
                if (onlyIfMissing && current) { entries.push({ key: change.key, value: currentValue, revision: current.revision }); continue; }
                let value = change.value;
                if (change.patch) {
                    const definition = storedTableDefinition(change.key);
                    const patch = change.patch;
                    if (!definition || !current || currentValue === null || !Array.isArray(patch.upsert) || !Array.isArray(patch.remove)
                        || patch.upsert.some(row => !row || typeof row.id !== 'string' || !Number.isSafeInteger(row.position) || row.position < 0
                            || !row.row || String(row.row[definition.key]) !== row.id) || patch.remove.some(id => typeof id !== 'string')) {
                        const error = new Error('Geçersiz tablo değişikliği'); error.status = 400; throw error;
                    }
                    const rows = new Map(tableRows(currentValue, change.key).map(row => [row.id, row]));
                    for (const id of patch.remove) rows.delete(id);
                    for (const row of patch.upsert) rows.set(row.id, row);
                    value = JSON.stringify([...rows.values()].sort((a, b) => a.position - b.position).map(row => row.row));
                }
                if (!onlyIfMissing && (current?.revision ?? 0) !== change.revision) {
                    // A lost HTTP response can safely be retried when the same value already committed.
                    if (current && currentValue === value) { entries.push({ key: change.key, value: currentValue, revision: current.revision }); continue; }
                    const error = new Error('Kayıt başka bir sekmede veya cihazda değişti. Sayfayı yeniden açıp değişikliği tekrar uygulayın.');
                    error.status = 409; throw error;
                }
                const revision = (current?.revision ?? 0) + 1;
                const rows = tableRows(value, change.key);
                if (rows) this.updateTable(change.key, rows);
                else this.db.prepare('DELETE FROM user_table_rows WHERE table_key = ?').run(change.key);
                save.run(change.key, rows ? '[]' : value, revision, new Date().toISOString());
                this.db.prepare('UPDATE user_data SET is_table = ? WHERE key = ?').run(rows ? 1 : 0, change.key);
                entries.push(change.patch ? { key: change.key, revision } : { key: change.key, value, revision });
            }
            if (!inTransaction) this.db.exec('COMMIT');
            return { entries };
        } catch (error) { if (!inTransaction) this.db.exec('ROLLBACK'); throw error; }
    }

    importOnce(name, data) {
        if (this.db.prepare('SELECT name FROM data_migrations WHERE name = ?').get(name)) return;
        this.importLegacy(Object.fromEntries(Object.entries(data).filter(([key]) => isPersistentKey(key))
            .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])), name);
        this.db.prepare('INSERT INTO data_migrations VALUES (?, ?)').run(name, new Date().toISOString());
    }

    importLegacy(data, source = 'browser') {
        const changes = Object.entries(data).map(([key, value]) => ({ key, value }));
        if (changes.some(row => !isPersistentKey(row.key) || typeof row.value !== 'string')) {
            const error = new Error('Geçersiz aktarım'); error.status = 400; throw error;
        }
        const raw = JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))));
        const digest = createHash('sha256').update(raw).digest('hex');
        // Keep every divergent old value, even when the existing database remains authoritative.
        this.db.prepare('INSERT OR IGNORE INTO legacy_imports VALUES (?, ?, ?, ?)')
            .run(digest, String(source).slice(0, 500), raw, new Date().toISOString());
        const conflicts = changes.filter(row => {
            const current = this.db.prepare('SELECT key, value, is_table FROM user_data WHERE key = ?').get(row.key);
            return current && this.value(current) !== row.value;
        }).map(row => row.key);
        return { ...this.write(changes.map(row => ({ ...row, value: normalizeImportedTable(row.value, row.key) })), { onlyIfMissing: true }), conflicts, archive: digest };
    }

    async createBackup() {
        if (this.backupPromise) return this.backupPromise;
        this.backupPromise = this.performBackup().finally(() => { this.backupPromise = null; });
        return this.backupPromise;
    }

    async performBackup() {
        mkdirSync(this.backupDirectory, { recursive: true });
        const fileName = `albion-tools-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        const target = join(this.backupDirectory, fileName);
        const temporary = target + '.tmp';
        try {
            await backup(this.db, temporary);
            const copy = new DatabaseSync(temporary, { readOnly: true });
            try {
                if (Object.values(copy.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw new Error('Yedek bütünlük kontrolü başarısız');
            } finally { copy.close(); }
            renameSync(temporary, target);
            // Retention only runs after a new, verified backup exists.
            const backups = readdirSync(this.backupDirectory).filter(name => /^albion-tools-.*\.sqlite$/.test(name)).sort().reverse();
            for (const name of backups.slice(USER_DATA_BACKUP_RETENTION)) unlinkSync(join(this.backupDirectory, name));
            this.lastBackup = { path: target, at: new Date().toISOString() };
            this.backupError = null;
            return this.lastBackup;
        } catch (error) {
            this.backupError = error.message;
            if (existsSync(temporary)) unlinkSync(temporary);
            throw error;
        }
    }

    status() { return { database: this.path, backupDirectory: this.backupDirectory,
        lastBackup: this.lastBackup || null, backupError: this.backupError || null }; }
    close() { this.db.close(); }
}
