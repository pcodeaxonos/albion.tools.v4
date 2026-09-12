import { getTable, getTableNames, tables } from './schema.js';

const STORAGE_PREFIX = 'albiontools.v4.';
const SEED_REVISION_KEY = STORAGE_PREFIX + 'seedRevision';
const SEED_REVISION = 7;
const RESEED_TABLES = [
    'items',
    'itemCategories',
    'cities',
    'bonusFamilies',
    'materialKeys',
    'yieldLadders',
    'yieldLadderSteps',
    'plants',
    'plantBonusCities',
    'animals',
    'animalBonusCities',
    'economyConstants',
    'islandPlots',
    'craftRecipes',
    'craftRecipeLines',
    'refineFamilies',
    'refineTiers',
    'factions',
    'enchantSlots',
    'enchantSteps',
    'enchantPaths',
    'buildings',
    'buildingTiers',
    'materialGroups',
    'materialGroupTiers',
    'siteTools',
    'sitePages',
    'priceServers',
    'priceSources'
];
const DAILY_BONUSES_IMPORT_KEY = STORAGE_PREFIX + 'dailyBonusesImport';
const DAILY_BONUSES_IMPORT_REV = 1;

function storageKey(tableName) {
    return STORAGE_PREFIX + tableName;
}

function applySeedRevision() {
    const current = Number(localStorage.getItem(SEED_REVISION_KEY) || '1');
    if (current >= SEED_REVISION) {
        return;
    }

    for (const tableName of RESEED_TABLES) {
        localStorage.removeItem(storageKey(tableName));
    }

    localStorage.setItem(SEED_REVISION_KEY, String(SEED_REVISION));
}

function applyDailyBonusesImport() {
    const current = Number(localStorage.getItem(DAILY_BONUSES_IMPORT_KEY) || '0');
    if (current >= DAILY_BONUSES_IMPORT_REV) {
        return;
    }

    localStorage.removeItem(storageKey('dailyBonuses'));
    localStorage.setItem(DAILY_BONUSES_IMPORT_KEY, String(DAILY_BONUSES_IMPORT_REV));
}

async function fetchSeedRows(table) {
    if (!table.seedUrl) {
        throw new Error(`${table.displayName || 'Tablo'} için seed dosyası yok`);
    }

    const response = await fetch(table.seedUrl);
    if (!response.ok) {
        throw new Error(`Seed yüklenemedi (${response.status}): ${table.seedUrl}`);
    }

    return response.json();
}

async function seedTableIfEmpty(tableName) {
    const table = tables[tableName];
    const key = storageKey(tableName);

    if (localStorage.getItem(key)) {
        return false;
    }

    const data = await fetchSeedRows(table);
    localStorage.setItem(key, JSON.stringify(data));
    return true;
}

export async function initStore() {
    applySeedRevision();
    applyDailyBonusesImport();

    for (const tableName of getTableNames()) {
        await seedTableIfEmpty(tableName);
    }
}

function readRows(tableName) {
    const raw = localStorage.getItem(storageKey(tableName));
    return raw ? JSON.parse(raw) : [];
}

function writeRows(tableName, rows) {
    localStorage.setItem(storageKey(tableName), JSON.stringify(rows));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('albiontools:db-write', { detail: { tableName } }));
    }
}

export function getRowCount(tableName) {
    return readRows(tableName).length;
}

export function getAll(tableName) {
    return readRows(tableName);
}

export function getById(tableName, id) {
    const table = getTable(tableName);
    if (!table) return null;

    const key = table.key;
    return readRows(tableName).find((row) => String(row[key]) === String(id)) ?? null;
}

export function searchRows(tableName, query) {
    const rows = getAll(tableName);
    const table = getTable(tableName);

    if (!table || !query.trim()) {
        return rows;
    }

    const term = query.trim().toLowerCase();

    return rows.filter((row) =>
        table.columns.some((col) => {
            const value = row[col.name];
            return value != null && String(value).toLowerCase().includes(term);
        })
    );
}

function coerceValue(column, rawValue) {
    if (column.type === 'boolean') {
        return rawValue === true || rawValue === 'true' || rawValue === 'on';
    }

    if (column.type === 'number' || column.type === 'ref') {
        if (rawValue === '' || rawValue == null) {
            return null;
        }
        const num = Number(rawValue);
        return Number.isNaN(num) ? 0 : num;
    }

    if (column.type === 'enum') {
        return rawValue;
    }

    return rawValue ?? '';
}

function getEditableColumnsFromTable(table) {
    return table.columns.filter((col) => col.editable !== false && col.name !== table.key);
}

export function createRow(tableName, formData) {
    const table = getTable(tableName);
    if (!table) throw new Error('Tablo bulunamadı');

    const rows = getAll(tableName);
    const record = {};

    if (table.autoKey) {
        const maxId = rows.reduce((max, row) => Math.max(max, Number(row[table.key]) || 0), 0);
        record[table.key] = maxId + 1;
    }

    for (const column of getEditableColumnsFromTable(table)) {
        if (column.type === 'boolean') {
            record[column.name] = formData.has(column.name);
        } else {
            record[column.name] = coerceValue(column, formData.get(column.name));
        }
    }

    if (!table.autoKey && !record[table.key]) {
        throw new Error(`${table.key} zorunlu`);
    }

    rows.push(record);
    writeRows(tableName, rows);
    return record;
}

export function updateRow(tableName, id, formData) {
    const table = getTable(tableName);
    if (!table) throw new Error('Tablo bulunamadı');

    const rows = getAll(tableName);
    const index = rows.findIndex((row) => String(row[table.key]) === String(id));

    if (index === -1) {
        throw new Error('Kayıt bulunamadı');
    }

    const record = { ...rows[index] };

    for (const column of getEditableColumnsFromTable(table)) {
        if (column.type === 'boolean') {
            record[column.name] = formData.has(column.name);
        } else {
            record[column.name] = coerceValue(column, formData.get(column.name));
        }
    }

    rows[index] = record;
    writeRows(tableName, rows);
    return record;
}

export function deleteRow(tableName, id) {
    const table = getTable(tableName);
    if (!table) throw new Error('Tablo bulunamadı');

    const rows = getAll(tableName);
    const filtered = rows.filter((row) => String(row[table.key]) !== String(id));
    writeRows(tableName, filtered);
}

export function resetTable(tableName) {
    localStorage.removeItem(storageKey(tableName));
}

export async function reseedTable(tableName) {
    const table = getTable(tableName);
    if (!table) {
        throw new Error('Tablo bulunamadı');
    }

    resetTable(tableName);
    await seedTableIfEmpty(tableName);
}

export function replaceAllRows(tableName, rows) {
    if (!getTable(tableName)) {
        throw new Error('Tablo bulunamadı');
    }
    if (!Array.isArray(rows)) {
        throw new Error('JSON dizi olmalı');
    }
    writeRows(tableName, rows);
}

export function mergeImportedRows(tableName, incoming) {
    const table = getTable(tableName);
    if (!table) {
        throw new Error('Tablo bulunamadı');
    }
    if (!Array.isArray(incoming)) {
        throw new Error('JSON dizi olmalı');
    }

    const key = table.key;
    const current = getAll(tableName);
    const byKey = new Map(current.map((row) => [String(row[key]), row]));
    let added = 0;
    let updated = 0;

    for (const row of incoming) {
        const id = String(row[key]);
        if (byKey.has(id)) {
            byKey.set(id, { ...byKey.get(id), ...row });
            updated += 1;
        } else {
            byKey.set(id, row);
            added += 1;
        }
    }

    writeRows(tableName, [...byKey.values()]);
    return { added, updated, total: byKey.size };
}

export function exportTableJson(tableName) {
    return JSON.stringify(getAll(tableName), null, 2);
}

export async function loadSeedRows(tableName) {
    const table = getTable(tableName);
    if (!table) {
        throw new Error('Tablo bulunamadı');
    }
    return fetchSeedRows(table);
}

export function tableHasLocalChanges(tableName, seedRows) {
    const local = getAll(tableName);
    return JSON.stringify(local) !== JSON.stringify(seedRows);
}

export async function resetAllTables() {
    for (const tableName of getTableNames()) {
        if (tables[tableName].userData) {
            continue;
        }
        resetTable(tableName);
    }
    await initStore();
}
