import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UserDataRepository } from './user-data-repository.mjs';
import { routeUserData } from './user-data-api.mjs';
import { OpportunityEvidenceRepository } from './opportunity-evidence-repository.mjs';
import { signalSnapshot } from '../js/core/opportunity-evidence.mjs';
import { tableWriteChange } from '../js/core/table-storage.mjs';
import { openPersistentData } from './open-persistent-data.mjs';

const folder = mkdtempSync(join(tmpdir(), 'albion-user-data-'));
const path = join(folder, 'data.sqlite');
const key = 'albiontools.v4.dailyBonuses';
let repo = new UserDataRepository(path), evidence, server;
try {
    repo.importOnce('old-json', { [key]: '[{"id":1,"date":"2026-10-13"}]' });
    repo.importOnce('old-json', { [key]: '[]' });
    assert.notEqual(repo.snapshot().entries.find(row => row.key === key).value, '[]');
    const initial = repo.snapshot().entries.find(row => row.key === key);
    repo.write([{ key, value: '[{"id":1,"date":"2026-10-14"}]', revision: initial.revision }]);
    const largeKey = 'albiontools.v4.items';
    const largeRows = Array.from({ length: 1000 }, (_, id) => ({ id, uniqueName: `T4_ITEM_${id}`, localizedName: 'Example item' }));
    const largeValue = JSON.stringify(largeRows);
    repo.write([{ key: largeKey, value: largeValue, revision: 0 }]);
    largeRows[500].localizedName = 'Changed name';
    const delta = tableWriteChange(largeKey, JSON.stringify(largeRows), largeValue, 1);
    assert.equal(delta.patch.upsert.length, 1);
    assert.ok(JSON.stringify(delta).length < 300, 'editing one item does not upload the full catalog');
    const rowsBefore = repo.db.prepare('SELECT total_changes() AS total').get().total;
    repo.write([delta]);
    assert.ok(repo.db.prepare('SELECT total_changes() AS total').get().total - rowsBefore <= 3, 'only edited SQLite row and revision are written');
    assert.throws(() => repo.write([{ key: 'albiontools.v4.settings', value: '{}', revision: 0 },
        { key, value: '[]', revision: initial.revision }]), error => error.status === 409);
    assert.equal(repo.snapshot().entries.some(row => row.key === 'albiontools.v4.settings'), false, 'conflicting batch rolls back all rows');
    repo.write([{ key, value: '[{"id":1,"date":"2026-10-14"}]', revision: initial.revision }]);
    assert.throws(() => repo.write([{ key: 'unrelated-site', value: 'x', revision: 0 }]), error => error.status === 400);
    const legacyFile = join(folder, 'old-evidence.jsonl');
    evidence = new OpportunityEvidenceRepository(legacyFile);
    const snapshot = signalSnapshot({ id: 'fixture', server: 'europe', itemId: 'T4_TEST', city: 'Lymhurst', quality: 1,
        buy: { price: 140 }, sell: { price: 100 }, primary: { id: 'local-flip', evidence: { inputs: {
            sell: { price: 100, at: new Date().toISOString(), source: 'aodp-current' },
            buy: { price: 140, at: new Date().toISOString(), source: 'aodp-current' }
        } }, economics: {} } });
    const command = { type: 'check', snapshot, side: 'buy', result: 'correct', at: new Date().toISOString() };
    evidence.submit({ requestId: 'request-migration', command }); evidence.close();
    const oldBytes = readFileSync(legacyFile);
    evidence = new OpportunityEvidenceRepository(legacyFile, { database: repo.db });
    assert.equal(evidence.snapshot().checks.length, 1, 'old evidence migrated into same SQLite');
    evidence.submit({ requestId: 'request-sqlite', command });
    assert.deepEqual(readFileSync(legacyFile), oldBytes, 'legacy journal retained and no longer written');
    evidence.close();
    const backup = await repo.createBackup();
    assert.equal(backup.path.startsWith(folder + sep), true);
    repo.close(); repo = new UserDataRepository(path);
    evidence = new OpportunityEvidenceRepository(legacyFile, { database: repo.db });
    assert.equal(evidence.snapshot().checks.length, 2);
    assert.equal(evidence.submit({ requestId: 'request-sqlite', command }).duplicate, true, 'receipt survives restart');
    evidence.close(); evidence = null;
    const restorePath = join(folder, 'restored.sqlite');
    const restoreScript = fileURLToPath(new URL('./restore-user-data.mjs', import.meta.url));
    const restore = spawnSync(process.execPath, [restoreScript, backup.path, restorePath], { encoding: 'utf8' });
    assert.equal(restore.status, 0, restore.stderr);
    assert.notEqual(spawnSync(process.execPath, [restoreScript, backup.path, restorePath]).status, 0, 'recovery command never overwrites an existing target');
    const restored = new UserDataRepository(restorePath);
    assert.equal(restored.snapshot().entries.find(row => row.key === key).value, '[{"id":1,"date":"2026-10-14"}]');
    assert.equal(restored.db.prepare('SELECT COUNT(*) AS total FROM opportunity_evidence_journal').get().total, 2, 'full backup contains journal too');
    restored.close();
    writeFileSync(join(folder, 'broken.sqlite'), 'corrupt');
    assert.throws(() => new UserDataRepository(join(folder, 'broken.sqlite')), 'corrupt database is never reset silently');
    const legacy = { kind: 'albion.tools.local-data', version: 1, data: {
        [key]: JSON.stringify([{ id: 1, date: '2026-10-12' }, { id: 1, date: '2026-10-13' }])
    } };
    writeFileSync(join(folder, '.albion-tools-data.json'), JSON.stringify(legacy));
    const held = new OpportunityEvidenceRepository(join(folder, '.opportunity-evidence.jsonl'));
    await assert.rejects(openPersistentData(folder, { refreshCatalogs: false }), /başka bir servis/);
    const blocked = new UserDataRepository(join(folder, '.albion-tools.sqlite'));
    assert.equal(blocked.db.prepare('SELECT COUNT(*) AS total FROM data_migrations').get().total, 0, 'active old service cannot mark migration complete');
    blocked.close(); held.close();
    const initialized = await openPersistentData(folder, { refreshCatalogs: false });
    const migrated = JSON.parse(initialized.repository.snapshot().entries.find(row => row.key === key).value);
    assert.equal(migrated.length, 2, 'duplicate old ids never discard a row');
    assert.equal(new Set(migrated.map(row => row.id)).size, 2);
    assert.equal(JSON.parse(initialized.repository.db.prepare('SELECT data FROM legacy_imports').get().data)[key], legacy.data[key], 'original duplicate identities remain recoverable in archive');
    initialized.opportunityEvidence.close(); initialized.repository.close();

    let rejectWrites = false;
    const writes = [];
    server = createServer(async (req, res) => {
        if (req.method === 'PUT') {
            writes.push(req.url);
            if (rejectWrites) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"offline"}'); return; }
        }
        if (!await routeUserData(req, res, repo, new URL(req.url, 'http://localhost').pathname)) res.writeHead(404).end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const host = `http://127.0.0.1:${server.address().port}`;
    const client = await import('../js/core/durable-storage.mjs?first');
    const stale = await import('../js/core/durable-storage.mjs?second');
    await client.initDurableStorage(host, { [key]: '[]', 'albiontools.v4.island-planner.prefs': '{"city":"Martlock"}' });
    await stale.initDurableStorage(host);
    assert.notEqual(client.readDurable(key), '[]', 'browser cannot replace existing database records');
    client.writeDurable('albiontools.v4.settings', '{"premium":false}');
    rejectWrites = true;
    await assert.rejects(client.flushDurableWrites(), /offline/);
    assert.equal(client.persistenceStatus().pending, 1, 'failed draft remains retryable');
    assert.equal(repo.snapshot().entries.some(row => row.key === 'albiontools.v4.settings'), false);
    rejectWrites = false;
    await client.flushDurableWrites();
    assert.equal(client.persistenceStatus().pending, 0);
    await assert.rejects(stale.saveDurableChanges(new Map([['albiontools.v4.settings', '{"premium":true}']])), error => error.status === 409);
    const clean = await import('../js/core/durable-storage.mjs?clean-browser');
    await clean.initDurableStorage(host);
    assert.equal(clean.readDurable('albiontools.v4.settings'), '{"premium":false}', 'clean browser reads saved data with zero localStorage');
    assert.equal(writes.length, 3, 'reads stay in memory; only changed data is sent');
    console.log('PASS migration, restart, atomic conflict protection, retries, clean browser, full SQLite backup/restore, evidence migration');
} finally {
    if (server) await new Promise(resolve => server.close(resolve));
    evidence?.close(); repo.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    rmSync(folder, { recursive: true, force: true });
}
