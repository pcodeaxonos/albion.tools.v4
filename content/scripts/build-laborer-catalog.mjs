import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Supply the downloaded ao-data/ao-bin-dumps directory. No market data belongs here.
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node content/scripts/build-laborer-catalog.mjs <dump directory>');
const read = (name) => fs.readFileSync(path.join(directory, `${name}.json`), 'utf8');
const itemsText = read('items');
const gameText = read('gamedata');
const raw = JSON.parse(itemsText).items;
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const known = new Map(items.map((item) => [item.uniqueName, item]));
const contracts = list(raw.labourercontract).map((row) => {
    const item = known.get(row['@uniquename']);
    if (!item) throw new Error(`Contract missing from item DB: ${row['@uniquename']}`);
    return { itemId: item.id, item: item.uniqueName, label: item.localizedName, tier: Number(row['@tier']), type: row['@shopsubcategory3'] };
});
const journals = list(raw.journalitem).map((row) => ({
    item: row['@uniquename'], tier: Number(row['@tier']), type: row['@shopsubcategory3'],
    filled: known.has(`${row['@uniquename']}_FULL`) ? `${row['@uniquename']}_FULL` : null,
    empty: known.has(`${row['@uniquename']}_EMPTY`) ? `${row['@uniquename']}_EMPTY` : null,
    missionTypes: Object.keys(row.famefillingmissions || {}),
    fillFame: Number(row['@maxfame']), baseLootAmount: Number(row['@baselootamount']),
    loot: list(row.lootlist?.loot).map((loot) => {
        const enchantment = Number(loot['@itemenchantmentlevel'] || 0);
        const name = loot['@itemname'];
        const item = loot['@silveramount'] != null ? 'SILVER' : enchantment > 0 && known.has(`${name}@${enchantment}`) ? `${name}@${enchantment}` : known.has(name) ? name : null;
        return { item, rawItem: name || null, enchantment,
            amount: Number(loot['@silveramount'] ?? loot['@itemamount']),
            weight: Number(loot['@weight']), labourerFame: Number(loot['@labourerfame']) };
    })
}));
const data = {
    provenance: {
        repository: 'https://github.com/ao-data/ao-bin-dumps',
        itemsSha256: crypto.createHash('sha256').update(itemsText).digest('hex'),
        gamedataSha256: crypto.createHash('sha256').update(gameText).digest('hex'),
        fields: ['labourercontract.@uniquename', 'labourercontract.@tier', 'labourercontract.@shopsubcategory3', 'journalitem.@maxfame', 'journalitem.@baselootamount', 'journalitem.lootlist.loot', 'AO-GameData.LabourerSettings.@maxyield']
    },
    maxRewardYield: Number(JSON.parse(gameText)['AO-GameData'].LabourerSettings['@maxyield']),
    contracts, journals
};
fs.writeFileSync('data/laborer-contract.json', `${JSON.stringify(data, null, 2)}\n`);
console.log(`Laborer catalog: ${contracts.length} contracts, ${journals.length} journals; progression unsupported`);
