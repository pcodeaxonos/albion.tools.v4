/**
 * Audit bonus-families.json against ao-bin-dumps craftingmodifiers + recipes.
 * Run: node scripts/audit-bonus-families.mjs
 */
import fs from 'node:fs';
import https from 'node:https';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'albion.tools.v4-audit' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                fetchJson(response.headers.location).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                response.resume();
                return;
            }
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (error) {
                    reject(error);
                }
            });
            response.on('error', reject);
        }).on('error', reject);
    });
}

const STEM_MAP = {
    PLANKS: 'plank',
    METALBAR: 'bar',
    LEATHER: 'leather',
    CLOTH: 'cloth',
    WOOD: 'odun',
    FIBER: 'fiber',
    ROCK: 'taş',
    HIDE: 'hide',
    ORE: 'ore',
    STONEBLOCK: 'block'
};

const CLUSTER_CITY = {
    '0000': 'Thetford',
    '1000': 'Lymhurst',
    '2000': 'Bridgewatch',
    '3004': 'Martlock',
    '4000': 'Fort Sterling',
    '3003': 'Caerleon',
    '5000': 'Brecilien'
};

const CITY_ID = {
    Bridgewatch: 1,
    'Fort Sterling': 2,
    Lymhurst: 3,
    Martlock: 4,
    Thetford: 5,
    Caerleon: 6,
    Brecilien: 7
};

const NAME_TO_FAMILY = {
    hammer: 'weapons/hammer',
    spear: 'weapons/spear',
    holystaff: 'weapons/holystaff',
    plate_helmet: 'head/plate_helmet',
    cloth_armor: 'armors/cloth_armor',
    wood: 'resources/wood',
    sword: 'weapons/sword',
    bow: 'weapons/bow',
    arcanestaff: 'weapons/arcanestaff',
    leather_helmet: 'head/leather_helmet',
    leather_shoes: 'shoes/leather_shoes',
    fiber: 'resources/fiber',
    crossbow: 'weapons/crossbow',
    dagger: 'weapons/dagger',
    cursestaff: 'weapons/cursestaff',
    plate_armor: 'armors/plate_armor',
    cloth_shoes: 'shoes/cloth_shoes',
    rock: 'resources/rock',
    axe: 'weapons/axe',
    quarterstaff: 'weapons/quarterstaff',
    froststaff: 'weapons/froststaff',
    plate_shoes: 'shoes/plate_shoes',
    offhand: 'category/offhands',
    hide: 'resources/hide',
    mace: 'weapons/mace',
    firestaff: 'weapons/firestaff',
    naturestaff: 'weapons/naturestaff',
    leather_armor: 'armors/leather_armor',
    cloth_helmet: 'head/cloth_helmet',
    ore: 'resources/ore',
    knuckles: 'weapons/knuckles',
    shapeshifterstaff: 'weapons/shapeshifterstaff',
    food: 'consumables/food',
    tools: 'gathering/tool',
    gatherergear: 'gathering/gear',
    bag: 'category/bags',
    cape: 'category/capes',
    potion: 'consumables/potions'
};

const REPS = {
    'weapons/hammer': 'T4_MAIN_HAMMER',
    'weapons/spear': 'T4_MAIN_SPEAR',
    'weapons/holystaff': 'T4_MAIN_HOLYSTAFF',
    'head/plate_helmet': 'T4_HEAD_PLATE_SET1',
    'armors/cloth_armor': 'T4_ARMOR_CLOTH_SET1',
    'resources/wood': 'T4_PLANKS',
    'weapons/sword': 'T4_MAIN_SWORD',
    'weapons/bow': 'T4_2H_BOW',
    'weapons/arcanestaff': 'T4_MAIN_ARCANESTAFF',
    'head/leather_helmet': 'T4_HEAD_LEATHER_SET1',
    'shoes/leather_shoes': 'T4_SHOES_LEATHER_SET1',
    'resources/fiber': 'T4_CLOTH',
    'weapons/crossbow': 'T4_2H_CROSSBOW',
    'weapons/dagger': 'T4_MAIN_DAGGER',
    'weapons/cursestaff': 'T4_MAIN_CURSEDSTAFF',
    'armors/plate_armor': 'T4_ARMOR_PLATE_SET1',
    'shoes/cloth_shoes': 'T4_SHOES_CLOTH_SET1',
    'resources/rock': 'T4_STONEBLOCK',
    'weapons/axe': 'T4_MAIN_AXE',
    'weapons/quarterstaff': 'T4_2H_QUARTERSTAFF',
    'weapons/froststaff': 'T4_MAIN_FROSTSTAFF',
    'shoes/plate_shoes': 'T4_SHOES_PLATE_SET1',
    'category/offhands': ['T4_OFF_SHIELD', 'T4_OFF_TORCH', 'T4_OFF_BOOK'],
    'resources/hide': 'T4_LEATHER',
    'weapons/mace': 'T4_MAIN_MACE',
    'weapons/firestaff': 'T4_MAIN_FIRESTAFF',
    'weapons/naturestaff': 'T4_MAIN_NATURESTAFF',
    'armors/leather_armor': 'T4_ARMOR_LEATHER_SET1',
    'head/cloth_helmet': 'T4_HEAD_CLOTH_SET1',
    'resources/ore': 'T4_METALBAR',
    'weapons/knuckles': 'T4_2H_KNUCKLES_SET1',
    'weapons/shapeshifterstaff': 'T4_2H_SHAPESHIFTER_SET1',
    'gathering/tool': 'T4_2H_TOOL_AXE',
    'gathering/gear': [
        'T4_HEAD_GATHERER_WOOD',
        'T4_HEAD_GATHERER_FIBER',
        'T4_HEAD_GATHERER_ORE'
    ],
    'category/bags': 'T4_BAG',
    'category/capes': 'T4_CAPE'
};

const OFF_LABELS = {
    T4_OFF_SHIELD: 'Shield',
    T4_OFF_TORCH: 'Torch',
    T4_OFF_BOOK: 'Tome of Spells',
    T4_HEAD_GATHERER_WOOD: 'Wood/Hide/Fish',
    T4_HEAD_GATHERER_FIBER: 'Fiber',
    T4_HEAD_GATHERER_ORE: 'Ore/Stone'
};

function walkCraftable(node, found) {
    if (Array.isArray(node)) {
        for (const item of node) {
            walkCraftable(item, found);
        }
        return;
    }
    if (!node || typeof node !== 'object') {
        return;
    }
    const un = node['@uniquename'];
    if (un && node.craftingrequirements && !found.has(un)) {
        found.set(un, node);
    }
    for (const value of Object.values(node)) {
        walkCraftable(value, found);
    }
}

function craftMats(found, uniquename) {
    const node = found.get(uniquename);
    if (!node) {
        return null;
    }
    let crs = node.craftingrequirements;
    if (!crs) {
        return new Map();
    }
    if (!Array.isArray(crs)) {
        crs = [crs];
    }
    const craftresRaw = crs[0].craftresource;
    if (!craftresRaw) {
        return new Map();
    }
    const craftres = Array.isArray(craftresRaw) ? craftresRaw : [craftresRaw];
    const mats = new Map();
    for (const row of craftres) {
        const name = String(row['@uniquename'] || '');
        const core = name.replace(/^T\d+_/, '').replace(/@\d+$/, '');
        const key = STEM_MAP[core] || core.toLowerCase();
        mats.set(key, (mats.get(key) || 0) + Number(row['@count'] || 0));
    }
    return mats;
}

function parseDbMaterials(value) {
    return String(value || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function sameKeys(a, b) {
    return [...a].sort().join('|') === [...b].sort().join('|');
}

const bonus = JSON.parse(fs.readFileSync('data/bonus-families.json', 'utf8'));
const byKey = new Map(bonus.map((row) => [row.familyKey, row]));
const cities = JSON.parse(fs.readFileSync('data/cities.json', 'utf8'));
const cityName = new Map(cities.map((row) => [row.id, row.displayName]));

const [modsXml, itemsXml] = await Promise.all([
    fetchJson('https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/craftingmodifiers.json'),
    fetchJson('https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json')
]);

const found = new Map();
walkCraftable(itemsXml.items, found);

console.log('=== CITY vs craftingmodifiers API ===');
const cityIssues = [];
for (const loc of modsXml.craftingmodifiers.craftinglocation) {
    const cluster = loc['@clusterid'];
    const city = CLUSTER_CITY[cluster];
    if (!city) {
        continue;
    }
    const expectedId = CITY_ID[city];
    let list = loc.craftingmodifier;
    if (!Array.isArray(list)) {
        list = [list];
    }
    for (const mod of list) {
        const name = mod['@name'];
        if (String(name).startsWith('meat_')) {
            continue;
        }
        const familyKey = NAME_TO_FAMILY[name];
        if (!familyKey) {
            console.log(`UNMAPPED modifier ${name} in ${city}`);
            continue;
        }
        const row = byKey.get(familyKey);
        if (!row) {
            console.log(`MISSING family ${familyKey}`);
            continue;
        }
        const ok = Number(row.cityId) === expectedId;
        if (!ok || familyKey.startsWith('resources/')) {
            const mark = ok ? 'OK' : 'CITY WRONG';
            console.log(
                `${mark} ${familyKey}: DB ${cityName.get(row.cityId)} (${row.cityId})`
                + ` | API ${city} (${expectedId}) | bonus ${mod['@value']}`
            );
        }
        if (!ok) {
            cityIssues.push({ familyKey, db: row.cityId, api: expectedId, city });
        }
    }
}

console.log('\n=== RESOURCE REFINE RECIPES (API) ===');
for (const familyKey of [
    'resources/wood',
    'resources/fiber',
    'resources/rock',
    'resources/hide',
    'resources/ore'
]) {
    const row = byKey.get(familyKey);
    const un = REPS[familyKey];
    const mats = craftMats(found, un);
    console.log(familyKey);
    console.log(
        `  DB: city=${cityName.get(row.cityId)} materials=${row.materials}`
        + ` vendor=${row.vendor} journal=${row.journal}`
    );
    console.log(`  API: ${un} => ${mats ? JSON.stringify(Object.fromEntries(mats)) : 'NOT FOUND'}`);
}

console.log('\n=== MATERIALS FIELD vs API RECIPE ===');
const materialIssues = [];
for (const [familyKey, rep] of Object.entries(REPS)) {
    if (familyKey.startsWith('resources/')) {
        const mats = craftMats(found, rep);
        const db = parseDbMaterials(byKey.get(familyKey)?.materials);
        const apiRaw = mats ? [...mats.keys()].filter((key) => ['odun', 'fiber', 'taş', 'hide', 'ore'].includes(key)) : [];
        if (!sameKeys(db, apiRaw)) {
            materialIssues.push({ familyKey, db, api: apiRaw, full: mats ? Object.fromEntries(mats) : null });
            console.log(`MISMATCH ${familyKey}: DB=[${db}] API raw=[${apiRaw}] full=${JSON.stringify(mats ? Object.fromEntries(mats) : null)}`);
        } else {
            console.log(`OK ${familyKey}: [${db}]`);
        }
        continue;
    }

    const db = parseDbMaterials(byKey.get(familyKey)?.materials);
    if (Array.isArray(rep)) {
        const all = [];
        const variants = [];
        for (const un of rep) {
            const mats = craftMats(found, un) || new Map();
            const keys = [...mats.keys()].filter((key) => ['plank', 'bar', 'leather', 'cloth'].includes(key));
            variants.push(`${OFF_LABELS[un] || un}: ${keys.join(' + ')}`);
            for (const key of keys) {
                if (!all.includes(key)) {
                    all.push(key);
                }
            }
        }
        console.log(`${familyKey}: DB=[${db}] API=[${all}]`);
        console.log(`  DB variants: ${byKey.get(familyKey)?.variants || ''}`);
        console.log(`  API variants: ${variants.join(' | ')}`);
        if (!sameKeys(db, all)) {
            materialIssues.push({ familyKey, db, api: all, variants });
        }
        continue;
    }

    const mats = craftMats(found, rep);
    if (!mats) {
        console.log(`NOT FOUND ${familyKey} ${rep}`);
        materialIssues.push({ familyKey, db, api: null, missing: rep });
        continue;
    }
    const refined = [...mats.keys()].filter((key) =>
        ['plank', 'bar', 'leather', 'cloth', 'block', 'odun', 'fiber', 'taş', 'hide', 'ore'].includes(key)
    );
    const api = refined.length ? refined : [...mats.keys()];
    if (!sameKeys(db, api)) {
        materialIssues.push({ familyKey, db, api, full: Object.fromEntries(mats) });
        console.log(`MISMATCH ${familyKey}: DB=[${db}] API=[${api}] full=${JSON.stringify(Object.fromEntries(mats))}`);
    } else {
        console.log(`OK ${familyKey}: [${db}]`);
    }
}

console.log('\n=== SUMMARY ===');
console.log(`city issues: ${cityIssues.length}`);
console.log(`material issues: ${materialIssues.length}`);
fs.writeFileSync(
    'scripts/audit-bonus-families-report.json',
    JSON.stringify({ cityIssues, materialIssues }, null, 2),
    'utf8'
);
console.log('wrote scripts/audit-bonus-families-report.json');
