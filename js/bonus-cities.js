import { loadCities } from './cities.js';

const FIGHTER = { tree: 'Fighter', treeShort: 'Fighter', vendor: "Warrior's Forge", vendorShort: 'Forge', journal: 'Fighter' };
const HUNTER = { tree: 'Hunter', treeShort: 'Hunter', vendor: "Hunter's Lodge", vendorShort: 'Lodge', journal: 'Hunter' };
const MAGE = { tree: 'Mage', treeShort: 'Mage', vendor: "Mage's Tower", vendorShort: 'Tower', journal: 'Mage' };
const TOOLS = { tree: 'Craftsman', treeShort: 'Tool', vendor: 'Toolmaker', vendorShort: 'Toolmaker', journal: 'Toolmaker' };
const COOK = { tree: 'Craftsman', treeShort: 'Cook', vendor: 'Cook', vendorShort: 'Cook', journal: 'Cook' };
const ALCHEMIST = { tree: 'Craftsman', treeShort: 'Alch', vendor: 'Alchemist', vendorShort: 'Alchemist', journal: 'Alchemist' };
const LUMBER = { tree: 'Refine', treeShort: 'Refine', vendor: 'Lumbermill', vendorShort: 'Mill', journal: 'Oduncu' };
const WEAVER = { tree: 'Refine', treeShort: 'Refine', vendor: 'Weaver', vendorShort: 'Weaver', journal: 'Fiber' };
const MASON = { tree: 'Refine', treeShort: 'Refine', vendor: 'Stonemason', vendorShort: 'Mason', journal: 'Taşçı' };
const TANNER = { tree: 'Refine', treeShort: 'Refine', vendor: 'Tanner', vendorShort: 'Tanner', journal: 'Derici' };
const SMELTER = { tree: 'Refine', treeShort: 'Refine', vendor: 'Smelter', vendorShort: 'Smelter', journal: 'Madenci' };

const FAMILY_CITY = {
    'weapons/hammer': 'Fort Sterling',
    'weapons/spear': 'Fort Sterling',
    'weapons/holystaff': 'Fort Sterling',
    'head/plate_helmet': 'Fort Sterling',
    'armors/cloth_armor': 'Fort Sterling',
    'resources/wood': 'Fort Sterling',

    'weapons/sword': 'Lymhurst',
    'weapons/bow': 'Lymhurst',
    'weapons/arcanestaff': 'Lymhurst',
    'head/leather_helmet': 'Lymhurst',
    'shoes/leather_shoes': 'Lymhurst',
    'resources/fiber': 'Lymhurst',

    'weapons/crossbow': 'Bridgewatch',
    'weapons/dagger': 'Bridgewatch',
    'weapons/cursestaff': 'Bridgewatch',
    'armors/plate_armor': 'Bridgewatch',
    'shoes/cloth_shoes': 'Bridgewatch',
    'resources/rock': 'Bridgewatch',

    'weapons/axe': 'Martlock',
    'weapons/quarterstaff': 'Martlock',
    'weapons/froststaff': 'Martlock',
    'shoes/plate_shoes': 'Martlock',
    'category/offhands': 'Martlock',
    'resources/hide': 'Martlock',

    'weapons/mace': 'Thetford',
    'weapons/firestaff': 'Thetford',
    'weapons/naturestaff': 'Thetford',
    'armors/leather_armor': 'Thetford',
    'head/cloth_helmet': 'Thetford',
    'resources/ore': 'Thetford',

    'weapons/knuckles': 'Caerleon',
    'weapons/shapeshifterstaff': 'Caerleon',
    'consumables/food': 'Caerleon',
    'gathering/tool': 'Caerleon',

    'category/bags': 'Brecilien',
    'category/capes': 'Brecilien',
    'consumables/potions': 'Brecilien'
};

const FAMILY_STATION = {
    'weapons/sword': FIGHTER,
    'weapons/axe': FIGHTER,
    'weapons/mace': FIGHTER,
    'weapons/hammer': FIGHTER,
    'weapons/quarterstaff': FIGHTER,
    'head/plate_helmet': FIGHTER,
    'armors/plate_armor': FIGHTER,
    'shoes/plate_shoes': FIGHTER,

    'weapons/bow': HUNTER,
    'weapons/crossbow': HUNTER,
    'weapons/dagger': HUNTER,
    'weapons/spear': HUNTER,
    'weapons/naturestaff': HUNTER,
    'head/leather_helmet': HUNTER,
    'armors/leather_armor': HUNTER,
    'shoes/leather_shoes': HUNTER,

    'weapons/firestaff': MAGE,
    'weapons/froststaff': MAGE,
    'weapons/arcanestaff': MAGE,
    'weapons/holystaff': MAGE,
    'weapons/cursestaff': MAGE,
    'head/cloth_helmet': MAGE,
    'armors/cloth_armor': MAGE,
    'shoes/cloth_shoes': MAGE,

    'weapons/knuckles': TOOLS,
    'weapons/shapeshifterstaff': TOOLS,
    'category/offhands': TOOLS,
    'category/bags': TOOLS,
    'category/capes': TOOLS,
    'gathering/tool': TOOLS,
    'consumables/food': COOK,
    'consumables/potions': ALCHEMIST,

    'resources/wood': LUMBER,
    'resources/fiber': WEAVER,
    'resources/rock': MASON,
    'resources/hide': TANNER,
    'resources/ore': SMELTER
};

const CITY_SHORT = {
    'Fort Sterling': 'FS',
    Lymhurst: 'LY',
    Bridgewatch: 'BW',
    Martlock: 'ML',
    Thetford: 'TF',
    Caerleon: 'CL',
    Brecilien: 'BR'
};

const MAT = {
    cloth: ['cloth'],
    leather: ['leather'],
    bar: ['bar'],
    plank: ['plank'],
    plankBar: ['plank', 'bar'],
    plankBarCloth: ['plank', 'bar', 'cloth'],
    leatherCloth: ['leather', 'cloth']
};

/** Recipe materials for the bonus family (not the city's refine specialty). */
const FAMILY_MATERIALS = {
    'head/cloth_helmet': MAT.cloth,
    'armors/cloth_armor': MAT.cloth,
    'shoes/cloth_shoes': MAT.cloth,
    'head/leather_helmet': MAT.leather,
    'armors/leather_armor': MAT.leather,
    'shoes/leather_shoes': MAT.leather,
    'head/plate_helmet': MAT.bar,
    'armors/plate_armor': MAT.bar,
    'shoes/plate_shoes': MAT.bar,

    'weapons/sword': MAT.plankBar,
    'weapons/axe': MAT.plankBar,
    'weapons/mace': MAT.plankBar,
    'weapons/hammer': MAT.plankBar,
    'weapons/dagger': MAT.plankBar,
    'weapons/spear': MAT.plankBar,
    'weapons/quarterstaff': MAT.plankBar,
    'weapons/knuckles': MAT.plankBar,
    'weapons/bow': MAT.plank,
    'weapons/crossbow': MAT.plankBar,
    'weapons/firestaff': MAT.plank,
    'weapons/froststaff': MAT.plank,
    'weapons/arcanestaff': MAT.plank,
    'weapons/holystaff': MAT.plank,
    'weapons/cursestaff': MAT.plank,
    'weapons/naturestaff': MAT.plank,
    'weapons/shapeshifterstaff': MAT.plank,

    'category/offhands': MAT.plankBarCloth,
    'category/bags': MAT.leatherCloth,
    'category/capes': MAT.cloth,
    'gathering/tool': MAT.plankBar,
    'consumables/food': [],
    'consumables/potions': [],

    'resources/wood': ['odun'],
    'resources/fiber': ['fiber'],
    'resources/rock': ['taş'],
    'resources/hide': ['hide'],
    'resources/ore': ['ore']
};

const MAT_ITEM = {
    plank: 'T4_PLANKS',
    bar: 'T4_METALBAR',
    leather: 'T4_LEATHER',
    cloth: 'T4_CLOTH',
    odun: 'T4_WOOD',
    fiber: 'T4_FIBER',
    taş: 'T4_ROCK',
    hide: 'T4_HIDE',
    ore: 'T4_ORE'
};

export function bonusCityApiName(familyKey) {
    return FAMILY_CITY[familyKey] ?? null;
}

export function bonusMaterialItemId(key) {
    return MAT_ITEM[key] ?? null;
}

export function bonusCityLabel(familyKey) {
    const apiName = bonusCityApiName(familyKey);
    if (!apiName) {
        return '';
    }

    const city = loadCities().find((row) => row.marketApiName === apiName);
    return city?.displayName ?? apiName;
}

export function bonusCityShort(familyKey) {
    const apiName = bonusCityApiName(familyKey);
    return CITY_SHORT[apiName] ?? '';
}

export function bonusFamilyMaterials(familyKey) {
    return FAMILY_MATERIALS[familyKey] ?? [];
}

export function bonusStation(familyKey) {
    return FAMILY_STATION[familyKey] ?? null;
}

function vendorImpliedByJournal(meta) {
    const journal = String(meta.journal || '').trim().toLowerCase();
    if (!journal) {
        return false;
    }

    const vendor = String(meta.vendor || '').toLowerCase();
    const tree = String(meta.tree || '').toLowerCase();
    return vendor.includes(journal) || tree === journal;
}

export function bonusStationLine(meta) {
    const bits = [];
    if (meta.vendor && !vendorImpliedByJournal(meta)) {
        bits.push(meta.vendor);
    }
    if (meta.journal) {
        bits.push(`${meta.journal} kitabı`);
    }
    return bits.join(' · ');
}

export function bonusPackParts(meta, { includeCity = true } = {}) {
    const bits = [];
    if (includeCity) {
        bits.push(meta.cityLabel || 'Şehir yok');
    }
    if (meta.materialShort) {
        bits.push(meta.materialShort);
    }
    const station = bonusStationLine(meta);
    if (station) {
        bits.push(station);
    }
    return bits;
}

export function bonusPackLine(meta, options) {
    return bonusPackParts(meta, options).join(' · ');
}

export function bonusFamilyMeta(familyKey) {
    const materials = bonusFamilyMaterials(familyKey);
    const materialShort = materials.join(' · ');
    const station = bonusStation(familyKey);
    return {
        city: bonusCityApiName(familyKey),
        cityLabel: bonusCityLabel(familyKey),
        cityShort: bonusCityShort(familyKey),
        materials,
        materialShort,
        materialLabel: materialShort,
        tree: station?.tree ?? '',
        treeShort: station?.treeShort ?? '',
        vendor: station?.vendor ?? '',
        vendorShort: station?.vendorShort ?? '',
        journal: station?.journal ?? ''
    };
}

export function cityHintText(familyKey) {
    const meta = bonusFamilyMeta(familyKey);
    if (!meta.cityLabel) {
        return '';
    }

    return bonusPackLine(meta);
}
