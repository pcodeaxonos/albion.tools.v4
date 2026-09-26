/**
 * Enchanting, house, malzemeler, nav/tools, price servers.
 * Run: node scripts/build-app-catalog.mjs
 */
import fs from 'fs';
import { SITE_ROUTES } from './site-routes.mjs';

const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const economy = JSON.parse(fs.readFileSync('data/economy-constants.json', 'utf8'));
const itemByUnique = new Map(items.map((row) => [row.uniqueName, row]));

function itemId(uniqueName) {
    const row = itemByUnique.get(uniqueName);
    if (!row) {
        throw new Error(`Item not found: ${uniqueName}`);
    }
    return row.id;
}

const enchantSlots = [
    { id: 1, code: 'light', label: 'helmet · boot · cape · offhand', short: 'Helmet / off', qty: 96, iconItemId: itemId('T4_HEAD_PLATE_SET1'), sortValue: 10 },
    { id: 2, code: 'armor', label: 'armor · bag', short: 'Armor / bag', qty: 192, iconItemId: itemId('T4_ARMOR_PLATE_SET1'), sortValue: 20 },
    { id: 3, code: 'one', label: '1H weapon', short: '1H', qty: 288, iconItemId: itemId('T4_MAIN_SWORD'), sortValue: 30 },
    { id: 4, code: 'two', label: '2H weapon', short: '2H', qty: 384, iconItemId: itemId('T4_2H_BOW'), sortValue: 40 }
];

const enchantSteps = [
    { id: 1, fromEnchant: 0, toEnchant: 1, kind: 'rune', label: 'Rune', itemType: 'RUNE', sortValue: 10 },
    { id: 2, fromEnchant: 1, toEnchant: 2, kind: 'soul', label: 'Soul', itemType: 'SOUL', sortValue: 20 },
    { id: 3, fromEnchant: 2, toEnchant: 3, kind: 'relic', label: 'Relic', itemType: 'RELIC', sortValue: 30 }
];

const enchantPaths = [
    { id: 1, fromEnchant: 0, toEnchant: 1, tone: 'rune', sortValue: 10 },
    { id: 2, fromEnchant: 0, toEnchant: 2, tone: 'soul', sortValue: 20 },
    { id: 3, fromEnchant: 0, toEnchant: 3, tone: 'relic', sortValue: 30 },
    { id: 4, fromEnchant: 1, toEnchant: 2, tone: 'soul', sortValue: 40 },
    { id: 5, fromEnchant: 1, toEnchant: 3, tone: 'span', sortValue: 50 },
    { id: 6, fromEnchant: 2, toEnchant: 3, tone: 'relic', sortValue: 60 }
];

const buildings = [
    { id: 1, code: 'house', label: 'House', blocks: 180, sortValue: 10, isActive: true },
    { id: 2, code: 'guild', label: 'Guild Hall', blocks: 900, sortValue: 20, isActive: true }
];

const houseWood = { 2: 30, 3: 60, 4: 120, 5: 240, 6: 480, 7: 960, 8: 1920 };
const houseStone = { 2: 3, 3: 6, 4: 12, 5: 24, 6: 48, 7: 96, 8: 192 };
const guildWood = { 2: 150, 3: 300, 4: 600, 5: 1200, 6: 2400, 7: 4800, 8: 9600 };
const guildStone = { 2: 15, 3: 30, 4: 60, 5: 120, 6: 240, 7: 480, 8: 960 };

let btId = 1;
const buildingTiers = [];
for (const tier of [2, 3, 4, 5, 6, 7, 8]) {
    buildingTiers.push({ id: btId++, buildingId: 1, tier, wood: houseWood[tier], stone: houseStone[tier] });
}
for (const tier of [2, 3, 4, 5, 6, 7, 8]) {
    buildingTiers.push({ id: btId++, buildingId: 2, tier, wood: guildWood[tier], stone: guildStone[tier] });
}

const materialGroups = [
    { id: 1, code: 'plank', label: 'Plank', family: 'Malzeme', stem: 'PLANKS', hasEnchant: true, sortValue: 10 },
    { id: 2, code: 'block', label: 'Block', family: 'Malzeme', stem: 'STONEBLOCK', hasEnchant: true, sortValue: 20 },
    { id: 3, code: 'bar', label: 'Bar', family: 'Malzeme', stem: 'METALBAR', hasEnchant: true, sortValue: 30 },
    { id: 4, code: 'leather', label: 'Leather', family: 'Malzeme', stem: 'LEATHER', hasEnchant: true, sortValue: 40 },
    { id: 5, code: 'cloth', label: 'Cloth', family: 'Malzeme', stem: 'CLOTH', hasEnchant: true, sortValue: 50 },
    { id: 6, code: 'horse', label: 'Horse', family: 'Binek', stem: 'MOUNT_HORSE', hasEnchant: false, sortValue: 60 },
    { id: 7, code: 'ox', label: 'Ox', family: 'Binek', stem: 'MOUNT_OX', hasEnchant: false, sortValue: 70 },
    { id: 8, code: 'armored', label: 'Armored horse', family: 'Binek', stem: 'MOUNT_ARMORED_HORSE', hasEnchant: false, sortValue: 80 },
    { id: 9, code: 'mule', label: 'Mule', family: 'Binek', stem: 'MOUNT_MULE', hasEnchant: false, sortValue: 90 }
];

const groupTiers = {
    plank: [2, 3, 4, 5, 6, 7, 8],
    block: [2, 3, 4, 5, 6, 7, 8],
    bar: [2, 3, 4, 5, 6, 7, 8],
    leather: [2, 3, 4, 5, 6, 7, 8],
    cloth: [2, 3, 4, 5, 6, 7, 8],
    horse: [3, 4, 5, 6, 7, 8],
    ox: [3, 4, 5, 6, 7, 8],
    armored: [5, 6, 7, 8],
    mule: [2]
};

let mgtId = 1;
const materialGroupTiers = [];
for (const group of materialGroups) {
    for (const tier of groupTiers[group.code]) {
        materialGroupTiers.push({ id: mgtId++, groupId: group.id, tier });
    }
}

// Runtime metadata deliberately contains a public path, never a source file path.
const runtimeRoute = ({ source, kind, nav, path, ...entry }) => ({
    ...entry,
    path,
    navLabel: nav.label,
    navGroup: nav.group,
    navOrder: nav.order,
    navVisible: nav.visible
});
const siteTools = SITE_ROUTES.filter((entry) => entry.kind === 'tool').map(runtimeRoute);
const sitePages = SITE_ROUTES.filter((entry) => entry.kind !== 'tool').map(runtimeRoute);

const priceServers = [
    { id: 1, code: 'europe', label: 'Europe', host: 'https://europe.albion-online-data.com', sortValue: 10 },
    { id: 2, code: 'west', label: 'Americas', host: 'https://west.albion-online-data.com', sortValue: 20 },
    { id: 3, code: 'east', label: 'Asia', host: 'https://east.albion-online-data.com', sortValue: 30 }
];

const priceSources = [
    { id: 1, code: 'api', label: 'AODP API', sortValue: 10 },
    { id: 2, code: 'packets', label: 'Oyundaki paketler', sortValue: 20 }
];

const extraConstants = [
    { key: 'local_price_host', value: 'http://127.0.0.1:3001', label: 'Local price hub URL' },
    { key: 'enchant_powers', value: '5,6,7,8,9,10,11', label: 'Enchant power options' },
    { key: 'new_tool_live_count', value: '2', label: 'How many newest tools show NEW badge' }
];

let nextConstId = Math.max(0, ...economy.map((row) => row.id)) + 1;
const economyOut = economy.slice();
for (const entry of extraConstants) {
    if (economyOut.some((row) => row.key === entry.key)) {
        continue;
    }
    economyOut.push({ id: nextConstId++, ...entry });
}

function write(name, data) {
    fs.writeFileSync(`data/${name}.json`, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote data/${name}.json (${data.length})`);
}

write('enchant-slots', enchantSlots);
write('enchant-steps', enchantSteps);
write('enchant-paths', enchantPaths);
write('buildings', buildings);
write('building-tiers', buildingTiers);
write('material-groups', materialGroups);
write('material-group-tiers', materialGroupTiers);
write('site-tools', siteTools);
write('site-pages', sitePages);
write('price-servers', priceServers);
write('price-sources', priceSources);
write('economy-constants', economyOut);
console.log('done');
