import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CraftCardOrderRepository } from './craft-card-order-repository.mjs';

const folder = mkdtempSync(join(tmpdir(), 'craft-order-'));
let repository;
try {
    const path = join(folder, 'preferences.sqlite');
    repository = new CraftCardOrderRepository(path);
    assert.deepEqual(repository.all(), {});
    repository.save('weapons/mace', ['MAIN_MACE', '2H_MACE']);
    repository.save('potion', ['POTION_HEAL']);
    repository.close();
    repository = new CraftCardOrderRepository(path);
    assert.deepEqual(repository.all()['weapons/mace'], ['MAIN_MACE', '2H_MACE'], 'survives service restart without browser storage');
    repository.save('weapons/mace', ['2H_MACE', 'MAIN_MACE'], { onlyIfMissing: true });
    assert.deepEqual(repository.all()['weapons/mace'], ['MAIN_MACE', '2H_MACE'], 'legacy migration cannot overwrite database');
    repository.save('weapons/mace', ['2H_MACE', 'MAIN_MACE']);
    assert.deepEqual(repository.all()['weapons/mace'], ['2H_MACE', 'MAIN_MACE']);
    assert.deepEqual(repository.all().potion, ['POTION_HEAL'], 'families remain independent');
    assert.throws(() => repository.save('weapons/mace', ['MAIN_MACE', 'MAIN_MACE']));
    assert.throws(() => repository.save('../bad', []));
    assert.deepEqual(repository.all()['weapons/mace'], ['2H_MACE', 'MAIN_MACE'], 'invalid writes preserve saved order');
    console.log('PASS durable craft order, migration precedence, family isolation, validation');
} finally {
    repository?.close();
    rmSync(folder, { recursive: true, force: true });
}
