import { loadCities } from './cities.js';
import { getAll } from './db/store.js';
import { labelForFamilyKey } from './bonus-families.js';

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
    plankBarClothLeather: ['plank', 'bar', 'cloth', 'leather'],
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

    'category/offhands': MAT.plankBarClothLeather,
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

const FAMILY_VARIANTS = {
    'category/offhands': [
        { label: 'Shield', materials: ['plank', 'bar'] },
        { label: 'Torch', materials: ['plank', 'cloth'] },
        { label: 'Tome of Spells', materials: ['leather', 'cloth'] }
    ]
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

function parseMaterials(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value || '')
        .split(/[,/·]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function uniqueMaterials(variants) {
    const seen = new Set();
    const keys = [];

    for (const recipe of variants) {
        for (const key of recipe.materials) {
            if (!seen.has(key)) {
                seen.add(key);
                keys.push(key);
            }
        }
    }

    return keys;
}

export function formatFamilyVariants(variants) {
    return (variants || [])
        .filter((recipe) => recipe.materials?.length)
        .map((recipe) => {
            const mats = recipe.materials.join(' + ');
            return recipe.label ? `${recipe.label}: ${mats}` : mats;
        })
        .join(' | ');
}

export function parseFamilyVariants(value) {
    if (Array.isArray(value)) {
        return value
            .map((recipe) => ({
                label: String(recipe.label || '').trim(),
                materials: parseMaterials(recipe.materials)
            }))
            .filter((recipe) => recipe.materials.length);
    }

    const raw = String(value || '').trim();
    if (!raw) {
        return [];
    }

    return raw.split('|').map((part) => {
        const chunk = part.trim();
        const split = chunk.indexOf(':');
        if (split === -1) {
            return { label: '', materials: parseMaterials(chunk.replaceAll('+', ',')) };
        }

        return {
            label: chunk.slice(0, split).trim(),
            materials: parseMaterials(chunk.slice(split + 1).replaceAll('+', ','))
        };
    }).filter((recipe) => recipe.materials.length);
}

function familyRow(familyKey) {
    return getAll('bonusFamilies').find((row) => row.familyKey === familyKey) ?? null;
}

export function seedBonusFamilyRows() {
    return Object.keys(FAMILY_CITY).map((familyKey, index) => {
        const station = FAMILY_STATION[familyKey];
        const named = FAMILY_VARIANTS[familyKey] || [];
        const materials = named.length
            ? uniqueMaterials(named)
            : (FAMILY_MATERIALS[familyKey] ?? []);
        return {
            id: index + 1,
            familyKey,
            label: labelForFamilyKey(familyKey),
            city: FAMILY_CITY[familyKey],
            tree: station?.tree ?? '',
            vendor: station?.vendor ?? '',
            journal: station?.journal ?? '',
            materials: materials.join(', '),
            variants: formatFamilyVariants(named),
            notes: ''
        };
    });
}

export function bonusCityApiName(familyKey) {
    return familyRow(familyKey)?.city || FAMILY_CITY[familyKey] || null;
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

export function bonusFamilyVariants(familyKey) {
    const stored = parseFamilyVariants(familyRow(familyKey)?.variants);
    if (stored.length) {
        return stored;
    }

    if (FAMILY_VARIANTS[familyKey]?.length) {
        return FAMILY_VARIANTS[familyKey].map((recipe) => ({
            label: recipe.label,
            materials: [...recipe.materials]
        }));
    }

    const materials = FAMILY_MATERIALS[familyKey] ?? [];
    return materials.length ? [{ label: '', materials: [...materials] }] : [];
}

export function bonusFamilyMaterials(familyKey) {
    const variants = bonusFamilyVariants(familyKey);
    if (variants.length) {
        return uniqueMaterials(variants);
    }

    const stored = familyRow(familyKey)?.materials;
    if (stored != null && String(stored).trim() !== '') {
        return parseMaterials(stored);
    }

    return FAMILY_MATERIALS[familyKey] ?? [];
}

export function bonusStation(familyKey) {
    const row = familyRow(familyKey);
    if (row && (row.vendor || row.journal || row.tree)) {
        return {
            tree: row.tree || '',
            treeShort: row.tree || '',
            vendor: row.vendor || '',
            vendorShort: row.vendor || '',
            journal: row.journal || ''
        };
    }

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
    if (meta.variants?.length) {
        bits.push(formatFamilyVariants(meta.variants));
    } else if (meta.materialShort) {
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
    const variants = bonusFamilyVariants(familyKey);
    const materials = uniqueMaterials(variants);
    const materialShort = materials.join(' · ');
    const station = bonusStation(familyKey);
    return {
        city: bonusCityApiName(familyKey),
        cityLabel: bonusCityLabel(familyKey),
        cityShort: bonusCityShort(familyKey),
        materials,
        variants,
        materialShort,
        materialLabel: materialShort,
        tree: station?.tree ?? '',
        treeShort: station?.treeShort ?? '',
        vendor: station?.vendor ?? '',
        vendorShort: station?.vendorShort ?? '',
        journal: station?.journal ?? '',
        notes: familyRow(familyKey)?.notes || ''
    };
}

export function cityHintText(familyKey) {
    const meta = bonusFamilyMeta(familyKey);
    if (!meta.cityLabel) {
        return '';
    }

    return bonusPackLine(meta);
}
