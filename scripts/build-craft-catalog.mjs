/**
 * Builds craftRecipes, craftRecipeLines, refineFamilies, factions seeds.
 * Run: node scripts/build-craft-catalog.mjs
 */
import fs from 'fs';

const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const cities = JSON.parse(fs.readFileSync('data/cities.json', 'utf8'));
const bonusFamilies = JSON.parse(fs.readFileSync('data/bonus-families.json', 'utf8'));
const economy = JSON.parse(fs.readFileSync('data/economy-constants.json', 'utf8'));

const itemByUnique = new Map(items.map((row) => [row.uniqueName, row]));
const cityByApi = new Map(cities.map((row) => [row.marketApiName, row]));
const familyByKey = new Map(bonusFamilies.map((row) => [row.familyKey, row]));

function itemId(uniqueName) {
    const row = itemByUnique.get(uniqueName);
    if (!row) {
        throw new Error(`Item not found: ${uniqueName}`);
    }
    return row.id;
}

function cityId(apiName) {
    const row = cityByApi.get(apiName);
    if (!row) {
        throw new Error(`City not found: ${apiName}`);
    }
    return row.id;
}

function familyId(familyKey) {
    if (!familyKey) {
        return null;
    }
    const row = familyByKey.get(familyKey);
    if (!row) {
        throw new Error(`Bonus family not found: ${familyKey}`);
    }
    return row.id;
}

const materialKeys = [
    { id: 1, key: 'plank', stem: 'PLANKS', itemId: itemId('T4_PLANKS'), label: 'Plank', matGroup: 'craft', sortValue: 20, appliesRr: true },
    { id: 2, key: 'bar', stem: 'METALBAR', itemId: itemId('T4_METALBAR'), label: 'Bar', matGroup: 'craft', sortValue: 10, appliesRr: true },
    { id: 3, key: 'leather', stem: 'LEATHER', itemId: itemId('T4_LEATHER'), label: 'Leather', matGroup: 'craft', sortValue: 40, appliesRr: true },
    { id: 4, key: 'cloth', stem: 'CLOTH', itemId: itemId('T4_CLOTH'), label: 'Cloth', matGroup: 'craft', sortValue: 30, appliesRr: true },
    { id: 5, key: 'odun', stem: 'WOOD', itemId: itemId('T4_WOOD'), label: 'Wood', matGroup: 'refine', sortValue: 120, appliesRr: true },
    { id: 6, key: 'fiber', stem: 'FIBER', itemId: itemId('T4_FIBER'), label: 'Fiber', matGroup: 'refine', sortValue: 110, appliesRr: true },
    { id: 7, key: 'taş', stem: 'ROCK', itemId: itemId('T4_ROCK'), label: 'Stone', matGroup: 'refine', sortValue: 140, appliesRr: true },
    { id: 8, key: 'hide', stem: 'HIDE', itemId: itemId('T4_HIDE'), label: 'Hide', matGroup: 'refine', sortValue: 130, appliesRr: true },
    { id: 9, key: 'ore', stem: 'ORE', itemId: itemId('T4_ORE'), label: 'Ore', matGroup: 'refine', sortValue: 100, appliesRr: true },
    { id: 10, key: 'energy', stem: '', itemId: itemId('QUESTITEM_TOKEN_AVALON'), label: 'Avalonian Energy', matGroup: 'other', sortValue: 200, appliesRr: false }
];

const matByKey = new Map(materialKeys.map((row) => [row.key, row]));

const craftRecipes = [];
const craftRecipeLines = [];
let recipeId = 1;
let lineId = 1;

function addRecipe({ code, tool, uniqueName, kind, tier, familyKey, lines, sortValue }) {
    const id = recipeId++;
    craftRecipes.push({
        id,
        code,
        tool,
        kind: kind || '',
        tier: tier ?? null,
        outputItemId: itemId(uniqueName),
        bonusFamilyId: familyId(familyKey),
        sortValue: sortValue ?? id * 10,
        isActive: true
    });

    for (const line of lines) {
        const mat = line.materialKey ? matByKey.get(line.materialKey) : null;
        craftRecipeLines.push({
            id: lineId++,
            recipeId: id,
            materialKeyId: mat?.id ?? null,
            inputItemId: line.inputUniqueName ? itemId(line.inputUniqueName) : null,
            qty: line.qty,
            appliesRr: line.appliesRr !== false && (mat ? mat.appliesRr !== false : true),
            sortValue: line.sortValue ?? lineId
        });
    }
}

// —— Furniture ——
const furnitureGroups = [
    { kind: 'chest', stem: 'FURNITUREITEM_CHEST', tiers: [2, 3, 4, 5], recipe: { plank: 20, bar: 10 } },
    { kind: 'bed', stem: 'FURNITUREITEM_BED', tiers: [2, 3, 4, 5, 6, 7, 8], recipe: { plank: 10, cloth: 20 } },
    { kind: 'table', stem: 'FURNITUREITEM_TABLE', tiers: [2, 3, 4, 5, 6, 7, 8], recipe: { plank: 30, cloth: 30 } }
];

for (const group of furnitureGroups) {
    for (const tier of group.tiers) {
        addRecipe({
            code: `furniture-${group.kind}-t${tier}`,
            tool: 'furniture',
            uniqueName: `T${tier}_${group.stem}`,
            kind: group.kind,
            tier,
            familyKey: null,
            lines: Object.entries(group.recipe).map(([materialKey, qty], index) => ({
                materialKey,
                qty,
                sortValue: index + 1
            }))
        });
    }
}

// —— Ava tools ——
const ENERGY_BY_TIER = { 4: 20, 5: 90, 6: 160, 7: 230, 8: 300 };
const TOOL_TYPES = [
    { key: 'pickaxe', stem: '2H_TOOL_PICK_AVALON' },
    { key: 'hammer', stem: '2H_TOOL_HAMMER_AVALON' },
    { key: 'axe', stem: '2H_TOOL_AXE_AVALON' },
    { key: 'sickle', stem: '2H_TOOL_SICKLE_AVALON' },
    { key: 'knife', stem: '2H_TOOL_KNIFE_AVALON' },
    { key: 'rod', stem: '2H_TOOL_FISHINGROD_AVALON' }
];

for (const tool of TOOL_TYPES) {
    for (const tier of [4, 5, 6, 7, 8]) {
        addRecipe({
            code: `ava-${tool.key}-t${tier}`,
            tool: 'ava',
            uniqueName: `T${tier}_${tool.stem}`,
            kind: tool.key,
            tier,
            familyKey: 'gathering/tool',
            lines: [
                { materialKey: 'plank', qty: 6, sortValue: 1 },
                { materialKey: 'bar', qty: 2, sortValue: 2 },
                { materialKey: 'energy', qty: ENERGY_BY_TIER[tier], appliesRr: false, sortValue: 3 }
            ]
        });
    }
}

// —— Caerleon T2 ——
const caerleonItems = [
    { code: 'soldier-armor', uniqueName: 'T2_ARMOR_PLATE_SET1', familyKey: 'armors/plate_armor', recipe: { bar: 16 } },
    { code: 'merc-jacket', uniqueName: 'T2_ARMOR_LEATHER_SET1', familyKey: 'armors/leather_armor', recipe: { leather: 16 } },
    { code: 'merc-shoes', uniqueName: 'T2_SHOES_LEATHER_SET1', familyKey: 'shoes/leather_shoes', recipe: { leather: 8 } },
    { code: 'scholar-sandals', uniqueName: 'T2_SHOES_CLOTH_SET1', familyKey: 'shoes/cloth_shoes', recipe: { cloth: 8 } },
    { code: 'soldier-boots', uniqueName: 'T2_SHOES_PLATE_SET1', familyKey: 'shoes/plate_shoes', recipe: { bar: 8 } },
    { code: 'soldier-helmet', uniqueName: 'T2_HEAD_PLATE_SET1', familyKey: 'head/plate_helmet', recipe: { bar: 8 } },
    { code: 'scholar-cowl', uniqueName: 'T2_HEAD_CLOTH_SET1', familyKey: 'head/cloth_helmet', recipe: { cloth: 8 } },
    { code: 'shield', uniqueName: 'T2_OFF_SHIELD', familyKey: 'category/offhands', recipe: { plank: 4, bar: 4 } },
    { code: 'scholar-robe', uniqueName: 'T2_ARMOR_CLOTH_SET1', familyKey: 'armors/cloth_armor', recipe: { cloth: 16 } },
    { code: 'fire-staff', uniqueName: 'T2_MAIN_FIRESTAFF', familyKey: 'weapons/firestaff', recipe: { plank: 16, bar: 8 } },
    { code: 'tome', uniqueName: 'T2_OFF_BOOK', familyKey: 'category/offhands', recipe: { leather: 4, cloth: 4 } },
    { code: 'sword', uniqueName: 'T2_MAIN_SWORD', familyKey: 'weapons/sword', recipe: { bar: 16, leather: 8 } },
    { code: 'bow', uniqueName: 'T2_2H_BOW', familyKey: 'weapons/bow', recipe: { plank: 32 } },
    { code: 'merc-hood', uniqueName: 'T2_HEAD_LEATHER_SET1', familyKey: 'head/leather_helmet', recipe: { leather: 8 } }
];

for (const item of caerleonItems) {
    addRecipe({
        code: `caerleon-${item.code}`,
        tool: 'caerleon',
        uniqueName: item.uniqueName,
        kind: item.code,
        tier: 2,
        familyKey: item.familyKey,
        lines: Object.entries(item.recipe).map(([materialKey, qty], index) => ({
            materialKey,
            qty,
            sortValue: index + 1
        }))
    });
}

// —— Faction cape crafts (cape + crest → faction cape) ——
const FACTIONS = [
    { city: 'Bridgewatch', stem: 'BRIDGEWATCH', heart: 'T1_FACTION_STEPPE_TOKEN_1', baby: 'T5_FARM_MOABIRD_FW_BRIDGEWATCH_BABY', elite: 'T8_FARM_MOABIRD_FW_BRIDGEWATCH_BABY' },
    { city: 'Fort Sterling', stem: 'FORTSTERLING', heart: 'T1_FACTION_HIGHLAND_TOKEN_1', baby: 'T5_FARM_DIREBEAR_FW_FORTSTERLING_BABY', elite: 'T8_FARM_DIREBEAR_FW_FORTSTERLING_BABY' },
    { city: 'Lymhurst', stem: 'LYMHURST', heart: 'T1_FACTION_FOREST_TOKEN_1', baby: 'T5_FARM_DIREBOAR_FW_LYMHURST_BABY', elite: 'T8_FARM_DIREBOAR_FW_LYMHURST_BABY' },
    { city: 'Martlock', stem: 'MARTLOCK', heart: 'T1_FACTION_MOUNTAIN_TOKEN_1', baby: 'T5_FARM_RAM_FW_MARTLOCK_BABY', elite: 'T8_FARM_RAM_FW_MARTLOCK_BABY' },
    { city: 'Thetford', stem: 'THETFORD', heart: 'T1_FACTION_SWAMP_TOKEN_1', baby: 'T5_FARM_SWAMPDRAGON_FW_THETFORD_BABY', elite: 'T8_FARM_SWAMPDRAGON_FW_THETFORD_BABY' },
    { city: 'Caerleon', stem: 'CAERLEON', heart: 'T1_FACTION_CAERLEON_TOKEN_1', baby: 'T5_FARM_GREYWOLF_FW_CAERLEON_BABY', elite: 'T8_FARM_GREYWOLF_FW_CAERLEON_BABY' },
    { city: 'Brecilien', stem: 'BRECILIEN', heart: null, baby: 'T5_FARM_OWL_FW_BRECILIEN_BABY', elite: 'T8_FARM_OWL_FW_BRECILIEN_BABY' }
];

const factions = FACTIONS.map((faction, index) => ({
    id: index + 1,
    cityId: cityId(faction.city),
    stem: faction.stem,
    heartItemId: faction.heart ? itemId(faction.heart) : null,
    babyItemId: itemId(faction.baby),
    eliteItemId: itemId(faction.elite),
    isActive: true
}));

for (const faction of FACTIONS) {
    for (const tier of [4, 5, 6, 7, 8]) {
        addRecipe({
            code: `faction-cape-${faction.stem.toLowerCase()}-t${tier}`,
            tool: 'faction',
            uniqueName: `T${tier}_CAPEITEM_FW_${faction.stem}`,
            kind: 'cape',
            tier,
            familyKey: 'category/capes',
            lines: [
                { inputUniqueName: `T${tier}_CAPE`, qty: 1, appliesRr: true, sortValue: 1 },
                { inputUniqueName: `T${tier}_CAPEITEM_FW_${faction.stem}_BP`, qty: 1, appliesRr: true, sortValue: 2 }
            ]
        });
    }
}

const refineFamilies = [
    { id: 1, code: 'ore', label: 'Ore', hamWord: 'ore', outWord: 'Bar', rawStem: 'ORE', outStem: 'METALBAR', bonusFamilyId: familyId('resources/ore') },
    { id: 2, code: 'wood', label: 'Wood', hamWord: 'odun', outWord: 'Plank', rawStem: 'WOOD', outStem: 'PLANKS', bonusFamilyId: familyId('resources/wood') },
    { id: 3, code: 'hide', label: 'Hide', hamWord: 'hide', outWord: 'Leather', rawStem: 'HIDE', outStem: 'LEATHER', bonusFamilyId: familyId('resources/hide') },
    { id: 4, code: 'fiber', label: 'Fiber', hamWord: 'fiber', outWord: 'Cloth', rawStem: 'FIBER', outStem: 'CLOTH', bonusFamilyId: familyId('resources/fiber') },
    { id: 5, code: 'stone', label: 'Stone', hamWord: 'taş', outWord: 'Block', rawStem: 'ROCK', outStem: 'STONEBLOCK', bonusFamilyId: familyId('resources/rock') }
];

const RAW_QTY = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 5 };
const LOWER_QTY = { 2: 0, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 };
const refineTiers = [2, 3, 4, 5, 6, 7, 8].map((tier, index) => ({
    id: index + 1,
    tier,
    rawQty: RAW_QTY[tier],
    lowerQty: LOWER_QTY[tier]
}));

const CREST_POINTS = { 4: 400, 5: 2250, 6: 3000, 7: 7500, 8: 15000 };
const extraConstants = [
    { key: 'city_production', value: '18', label: 'City craft production bonus %' },
    { key: 'city_resource', value: '40', label: 'City resource refine bonus %' },
    { key: 'focus_production', value: '59', label: 'Focus refine production bonus %' },
    { key: 'setup_fee', value: '0.025', label: 'Market setup fee ratio' },
    { key: 'tax_premium', value: '0.04', label: 'Sales tax with premium' },
    { key: 'tax_free', value: '0.08', label: 'Sales tax without premium' },
    { key: 'faction_heart_points', value: '3000', label: 'Faction heart vendor points' },
    { key: 'faction_baby_points', value: '3000', label: 'Faction baby vendor points' },
    { key: 'faction_elite_points', value: '50000', label: 'Faction elite vendor points' },
    ...Object.entries(CREST_POINTS).map(([tier, pts]) => ({
        key: `faction_crest_points_t${tier}`,
        value: String(pts),
        label: `Faction crest points T${tier}`
    }))
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

write('material-keys', materialKeys);
write('craft-recipes', craftRecipes);
write('craft-recipe-lines', craftRecipeLines);
write('refine-families', refineFamilies);
write('refine-tiers', refineTiers);
write('factions', factions);
write('economy-constants', economyOut);

console.log('done');
