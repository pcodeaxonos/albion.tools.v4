/**
 * Enchanting, house, malzemeler, nav/tools, price servers.
 * Run: node scripts/build-app-catalog.mjs
 */
import fs from 'fs';

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

const siteTools = [
    { id: 1, code: 'daily-bonus', title: 'Günlük Bonus', description: 'Her gün iki craft / refine bonusunu kaydedin. Ay içi tekrar sayıları hesaplanır.', icon: '✨', href: 'daily-bonus.html', addedAt: '2026-06-01', groupLabel: 'Kayıt', frequent: true, sortValue: 10, isActive: true },
    { id: 2, code: 'farmin', title: 'Farming', description: 'Tarım verimi ve focus; Martlock, Thetford ve Brecilien.', icon: '🌱', href: 'farming.html', addedAt: '2026-09-05', groupLabel: 'Ada', frequent: true, sortValue: 20, isActive: true },
    { id: 3, code: 'pasture', title: 'Pasture', description: 'Hayvan büyütme, kesme ve süt/yumurta kârı; yem ada veya piyasa.', icon: '🐑', href: 'pasture.html', addedAt: '2026-09-07', groupLabel: 'Ada', frequent: true, sortValue: 30, isActive: true },
    { id: 4, code: 'island-planner', title: 'Ada Planlayıcı', description: 'Ada slotlarını gümüş/gün maksimize et; yem ada vs pazar fırsat maliyetiyle.', icon: '🏝️', href: 'island-planner.html', addedAt: '2026-09-07', groupLabel: 'Ada', frequent: true, sortValue: 40, isActive: true },
    { id: 5, code: 'malzemeler', title: 'Şehir Makası', description: 'Plank, bar, binek: bir şehirden alıp diğerinde satmanın net kârı.', icon: '🪵', href: 'malzemeler.html', addedAt: '2026-09-06', groupLabel: 'Piyasa', frequent: true, sortValue: 50, isActive: true },
    { id: 6, code: 'faction', title: 'Faction', description: 'Crest puan değeri ve faction cape maliyeti / kârı.', icon: '🛡️', href: 'faction.html', addedAt: '2026-08-23', groupLabel: 'Piyasa', frequent: false, sortValue: 60, isActive: true },
    { id: 7, code: 'refining', title: 'Refining', description: 'Ore / logs refine maliyeti, return rate ve kâr.', icon: '🔥', href: 'refining.html', addedAt: '2026-09-05', groupLabel: 'Üretim', frequent: true, sortValue: 70, isActive: true },
    { id: 8, code: 'furniture', title: 'Furniture', description: 'Ada evi dekorasyonu: sandık, yatak ve masa craft maliyeti / kârı.', icon: '🪑', href: 'furniture.html', addedAt: '2026-09-06', groupLabel: 'Üretim', frequent: true, sortValue: 80, isActive: true },
    { id: 9, code: 'house', title: 'House', description: 'Ev ve guild hall yükseltme: oyunun istediği T1 + block, isteğe bağlı ham eşdeğer.', icon: '🏠', href: 'house.html', addedAt: '2026-07-01', groupLabel: 'Üretim', frequent: false, sortValue: 90, isActive: true },
    { id: 10, code: 'ava-craft', title: 'Ava Craft', description: 'Avalonian tool craft maliyeti ve kârı.', icon: '⚡', href: 'ava-craft.html', addedAt: '2026-07-20', groupLabel: 'Üretim', frequent: false, sortValue: 100, isActive: true },
    { id: 11, code: 'carleon-craft', title: 'Caerleon Craft', description: 'Caerleon / Black Market craft maliyeti ve kârı.', icon: '🗡️', href: 'carleon-craft.html', addedAt: '2026-08-15', groupLabel: 'Üretim', frequent: false, sortValue: 110, isActive: true },
    { id: 12, code: 'enchantin', title: 'Enchanting', description: 'Rune, soul ve relic: kaçtan kaça çıkarmanın gümüş maliyeti.', icon: '🔮', href: 'enchanting.html', addedAt: '2026-08-23', groupLabel: 'Üretim', frequent: false, sortValue: 120, isActive: true }
];

const sitePages = [
    { id: 1, code: 'home', title: 'Home', href: 'index.html', sortValue: 10 },
    { id: 2, code: 'db', title: 'Veritabanı', href: 'db.html', sortValue: 20 },
    { id: 3, code: 'settings', title: 'Ayarlar', href: 'settings.html', sortValue: 30 }
];

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
