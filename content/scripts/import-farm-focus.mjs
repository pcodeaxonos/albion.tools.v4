import fs from 'node:fs';
import { seedFarmFocus } from './farm-focus-seed.mjs';

// Same raw items dump used by fetch-game-data.mjs. Pass a downloaded dump path.
const dump = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const metadata = new Map();
function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node['@activefarmmaxcycles'] != null) metadata.set(node['@uniquename'], {
        activeFarmFocusCost: node['@activefarmfocuscost'] == null ? null : Number(node['@activefarmfocuscost']),
        activeFarmMaxCycles: Number(node['@activefarmmaxcycles'])
    });
    for (const child of Object.values(node)) visit(child);
}
visit(dump.items);
const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
for (const item of items) Object.assign(item, metadata.get(item.uniqueName) || {});
fs.writeFileSync('data/items.json', JSON.stringify(items, null, 2));
let count = 0;
for (const [name, field] of [['plants', 'seedItemId'], ['animals', 'babyItemId']]) {
    const rows = JSON.parse(fs.readFileSync(`data/${name}.json`, 'utf8'));
    const seeded = seedFarmFocus(rows, items, field);
    fs.writeFileSync(`data/${name}.json`, JSON.stringify(seeded, null, 2) + '\n');
    count += seeded.length;
    const byId = new Map(items.map(item => [item.id, item]));
    for (const row of rows) if (!byId.get(row[field])?.activeFarmMaxCycles) throw new Error(`Missing max cycles: ${row.key}`);
}
console.log(`Focus seeded: ${count} farmables`);
