import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { mergeGeneratedCatalog } from '../js/core/generated-catalog.mjs';
import { UserDataRepository } from './user-data-repository.mjs';
import { refreshGeneratedCatalogs } from './generated-catalogs.mjs';

const definition = { key: 'id', seedIdentity: ['uniqueName'] };
const before = [{ id: 1, uniqueName: 'A', name: 'old', quality: 1 }, { id: 2, uniqueName: 'B', name: 'old' }];
const manual = [{ ...before[0], name: 'manual' }, { id: 9, uniqueName: 'CUSTOM', name: 'custom' }];
const source = [{ id: 4, uniqueName: 'A', name: 'new', quality: 5 }, { id: 3, uniqueName: 'B', name: 'new' }, { id: 9, uniqueName: 'C', name: 'new' }];
const merged = mergeGeneratedCatalog(source, manual, before, definition);
assert.equal(merged.rows.find(row => row.uniqueName === 'A').id, 1, 'stable item identity');
assert.equal(merged.rows.find(row => row.uniqueName === 'A').name, 'manual', 'manual field preserved');
assert.equal(merged.rows.find(row => row.uniqueName === 'A').quality, 5, 'unchanged field receives source update');
assert.equal(merged.rows.some(row => row.uniqueName === 'B'), false, 'manual deletion preserved');
assert.ok(merged.rows.some(row => row.uniqueName === 'CUSTOM'));
assert.equal(new Set(merged.rows.map(row => row.id)).size, merged.rows.length, 'new source cannot collide with custom IDs');

const folder = mkdtempSync(join(tmpdir(), 'generated-catalog-'));
const repo = new UserDataRepository(join(folder, 'data.sqlite'));
try {
    mkdirSync(join(folder, 'data'));
    const items = [{ id: 43, uniqueName: 'T3_FARM_HORSE_GROWN', itemType: 'FARMANIMAL' }, { id: 3028, uniqueName: 'T3_MOUNT_HORSE', itemType: 'MOUNT' }];
    const recipes = [{ id: 1, outputItemId: 3028, inputItemId: 43, qty: 1 }];
    writeFileSync(join(folder, 'data/items.json'), JSON.stringify(items));
    writeFileSync(join(folder, 'data/recipe-materials.json'), JSON.stringify(recipes));
    repo.importOnce('old-cache', { 'albiontools.v4.items': JSON.stringify(items),
        'albiontools.v4.recipeMaterials': JSON.stringify([{ id: 1, outputItemId: 2974, inputItemId: 43, qty: 1 }]) });
    await refreshGeneratedCatalogs(repo, folder);
    assert.deepEqual(JSON.parse(repo.snapshot().entries.find(row => row.key.endsWith('recipeMaterials')).value), recipes, 'old numeric recipe references cannot suppress mount candidates');
    assert.ok(repo.db.prepare('SELECT data FROM legacy_imports').all().some(row => JSON.parse(JSON.parse(row.data)['albiontools.v4.recipeMaterials'] || '[]')[0]?.outputItemId === 2974), 'old tables remain archived');
    const itemState = repo.snapshot().entries.find(row => row.key.endsWith('.items'));
    items[1].label = 'manual';
    repo.write([{ key: itemState.key, revision: itemState.revision, value: JSON.stringify(items) }]);
    assert.deepEqual((await refreshGeneratedCatalogs(repo, folder)).refreshed, [], 'unchanged source never overwrites later edits');
    const newItems = [{ ...items[0], id: 91 }, { id: 92, uniqueName: 'T3_MOUNT_HORSE', itemType: 'MOUNT', quality: 5 }];
    writeFileSync(join(folder, 'data/items.json'), JSON.stringify(newItems));
    writeFileSync(join(folder, 'data/recipe-materials.json'), JSON.stringify([{ id: 7, outputItemId: 92, inputItemId: 91, qty: 2 }]));
    await refreshGeneratedCatalogs(repo, folder);
    const current = repo.snapshot().entries;
    assert.equal(JSON.parse(current.find(row => row.key.endsWith('.items')).value).find(row => row.uniqueName === 'T3_MOUNT_HORSE').label, 'manual');
    const recipe = JSON.parse(current.find(row => row.key.endsWith('recipeMaterials')).value)[0];
    assert.equal(recipe.outputItemId, 3028); assert.equal(recipe.inputItemId, 43); assert.equal(recipe.qty, 2);
    console.log('PASS generated catalog refresh, mount recipe recovery, source fingerprints, manual overrides/deletions, stable foreign keys');
} finally {
    repo.close(); assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep)); rmSync(folder, { recursive: true, force: true });
}
