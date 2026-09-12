/**
 * Builds relational farm/animal seed JSON from items + cities.
 * Run: node scripts/build-farm-catalog.mjs
 */
import fs from 'fs';

const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const cities = JSON.parse(fs.readFileSync('data/cities.json', 'utf8'));

const itemByUnique = new Map(items.map((row) => [row.uniqueName, row]));
const cityByApi = new Map(cities.map((row) => [row.marketApiName, row]));

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

function cityIds(names) {
    return names.map(cityId);
}

const yieldLadders = [
    { id: 1, code: 'farm_default', label: 'Farm / livestock default' }
];

const farmSteps = [
    { tier: 1, seedReturn: 0, waterBonus: 2 },
    { tier: 2, seedReturn: 0.3333, waterBonus: 1.33 },
    { tier: 3, seedReturn: 0.6, waterBonus: 0.8 },
    { tier: 4, seedReturn: 0.7333, waterBonus: 0.53 },
    { tier: 5, seedReturn: 0.8, waterBonus: 0.4 },
    { tier: 6, seedReturn: 0.8667, waterBonus: 0.27 },
    { tier: 7, seedReturn: 0.9111, waterBonus: 0.18 },
    { tier: 8, seedReturn: 0.9333, waterBonus: 0.13 }
];

const yieldLadderSteps = farmSteps.map((step, index) => ({
    id: index + 1,
    ladderId: 1,
    tier: step.tier,
    seedReturn: step.seedReturn,
    waterBonus: step.waterBonus
}));

const plantDefs = [
    { key: 'carrot', kind: 'crop', tier: 1, stem: 'CARROT', vendor: 2312, cities: ['Lymhurst', 'Brecilien'] },
    { key: 'bean', kind: 'crop', tier: 2, stem: 'BEAN', vendor: 3468, cities: ['Bridgewatch', 'Brecilien'] },
    { key: 'wheat', kind: 'crop', tier: 3, stem: 'WHEAT', vendor: 5780, cities: ['Martlock', 'Brecilien'] },
    { key: 'turnip', kind: 'crop', tier: 4, stem: 'TURNIP', vendor: 8670, cities: ['Fort Sterling', 'Brecilien'] },
    { key: 'cabbage', kind: 'crop', tier: 5, stem: 'CABBAGE', vendor: 11560, cities: ['Thetford', 'Brecilien'] },
    { key: 'potato', kind: 'crop', tier: 6, stem: 'POTATO', vendor: 17340, cities: ['Martlock', 'Brecilien'] },
    { key: 'corn', kind: 'crop', tier: 7, stem: 'CORN', vendor: 26010, cities: ['Bridgewatch', 'Brecilien'] },
    { key: 'pumpkin', kind: 'crop', tier: 8, stem: 'PUMPKIN', vendor: 34680, cities: ['Lymhurst', 'Brecilien'] },
    { key: 'agaric', kind: 'herb', tier: 2, stem: 'AGARIC', vendor: 3468, cities: ['Thetford'] },
    { key: 'comfrey', kind: 'herb', tier: 3, stem: 'COMFREY', vendor: 5780, cities: ['Caerleon'] },
    { key: 'burdock', kind: 'herb', tier: 4, stem: 'BURDOCK', vendor: 8670, cities: ['Lymhurst'] },
    { key: 'teasel', kind: 'herb', tier: 5, stem: 'TEASEL', vendor: 11560, cities: ['Bridgewatch', 'Caerleon'] },
    { key: 'foxglove', kind: 'herb', tier: 6, stem: 'FOXGLOVE', vendor: 17340, cities: ['Martlock'] },
    { key: 'mullein', kind: 'herb', tier: 7, stem: 'MULLEIN', vendor: 26010, cities: ['Thetford', 'Caerleon'] },
    { key: 'yarrow', kind: 'herb', tier: 8, stem: 'YARROW', vendor: 34680, cities: ['Fort Sterling'] }
];

const plants = plantDefs.map((def, index) => ({
    id: index + 1,
    key: def.key,
    kind: def.kind,
    tier: def.tier,
    vendorSilver: def.vendor,
    seedItemId: itemId(`T${def.tier}_FARM_${def.stem}_SEED`),
    plantItemId: itemId(`T${def.tier}_${def.stem}`),
    ladderId: 1,
    plotType: def.kind === 'herb' ? 'herb' : 'farm',
    isActive: true
}));

const plantByKey = new Map(plants.map((row) => [row.key, row]));

let plantBonusId = 1;
const plantBonusCities = [];
for (const def of plantDefs) {
    const plant = plantByKey.get(def.key);
    for (const cid of cityIds(def.cities)) {
        plantBonusCities.push({ id: plantBonusId++, plantId: plant.id, cityId: cid });
    }
}

const livestockDefs = [
    { key: 'chicken', tier: 3, stem: 'CHICKEN', vendor: 5780, feedKey: 'wheat', product: 'EGG', focus: 486, production: ['Fort Sterling'] },
    { key: 'goat', tier: 4, stem: 'GOAT', vendor: 8670, feedKey: 'turnip', product: 'MILK', focus: 441, production: ['Bridgewatch'] },
    { key: 'goose', tier: 5, stem: 'GOOSE', vendor: 11560, feedKey: 'cabbage', product: 'EGG', focus: 390, production: ['Lymhurst'] },
    { key: 'sheep', tier: 6, stem: 'SHEEP', vendor: 17340, feedKey: 'potato', product: 'MILK', focus: 429, production: ['Fort Sterling'] },
    { key: 'pig', tier: 7, stem: 'PIG', vendor: 26010, feedKey: 'corn', product: null, focus: 473, production: ['Thetford'] },
    { key: 'cow', tier: 8, stem: 'COW', vendor: 34680, feedKey: 'pumpkin', product: 'MILK', focus: 500, production: ['Martlock'] }
];

const mountHours = { 3: 44, 4: 92, 5: 140, 6: 188, 7: 236, 8: 284 };
const mountFeed = { 3: 10, 4: 20, 5: 90, 6: 270, 7: 810, 8: 2430 };
const horseYield = [
    { t: 3, sr: 0.84, wb: 0.2 },
    { t: 4, sr: 0.7867, wb: 0.1333 },
    { t: 5, sr: 0.7867, wb: 0.0889 },
    { t: 6, sr: 0.814, wb: 0.0593 },
    { t: 7, sr: 0.842, wb: 0.0395 },
    { t: 8, sr: 0.8736, wb: 0.0263 }
];

const animals = [];
let animalId = 1;

for (const def of livestockDefs) {
    const feedPlant = plantByKey.get(def.feedKey);
    animals.push({
        id: animalId++,
        key: def.key,
        kind: 'livestock',
        tier: def.tier,
        vendorSilver: def.vendor,
        focusCost: def.focus,
        babyItemId: itemId(`T${def.tier}_FARM_${def.stem}_BABY`),
        grownItemId: itemId(`T${def.tier}_FARM_${def.stem}_GROWN`),
        meatItemId: itemId(`T${def.tier}_MEAT`),
        productItemId: def.product ? itemId(`T${def.tier}_${def.product}`) : null,
        feedPlantId: feedPlant.id,
        ladderId: 1,
        seedReturn: null,
        waterBonus: null,
        plotType: 'pasture',
        pens: 9,
        baseHours: 44,
        feedQtyPasture: 9,
        feedQtyIsland: 18,
        feedDiet: 'plants',
        feedFixed: true,
        isActive: true
    });
}

for (const { t, sr, wb } of horseYield) {
    for (const [key, stem, labelKey] of [
        ['horse', 'HORSE'],
        ['ox', 'OX']
    ]) {
        animals.push({
            id: animalId++,
            key: `${key}-t${t}`,
            kind: 'mount',
            tier: t,
            vendorSilver: null,
            focusCost: null,
            babyItemId: itemId(`T${t}_FARM_${stem}_BABY`),
            grownItemId: itemId(`T${t}_FARM_${stem}_GROWN`),
            meatItemId: null,
            productItemId: null,
            feedPlantId: null,
            ladderId: null,
            seedReturn: sr,
            waterBonus: wb,
            plotType: 'pasture',
            pens: 9,
            baseHours: mountHours[t],
            feedQtyPasture: mountFeed[t],
            feedQtyIsland: mountFeed[t],
            feedDiet: 'plants',
            feedFixed: false,
            isActive: true
        });
    }
}

const kennelMounts = [
    { key: 'swiftclaw', tier: 5, stem: 'COUGAR', sr: 0, wb: 0.1 },
    { key: 'direwolf', tier: 6, stem: 'DIREWOLF', sr: 0, wb: 0.08 },
    { key: 'direboar', tier: 7, stem: 'DIREBOAR', sr: 0, wb: 0.06 },
    { key: 'direbear', tier: 8, stem: 'DIREBEAR', sr: 0, wb: 0.05 },
    { key: 'swampdragon', tier: 7, stem: 'SWAMPDRAGON', sr: 0, wb: 0.06 },
    { key: 'mammoth', tier: 8, stem: 'MAMMOTH', sr: 0, wb: 0.05 }
];

for (const def of kennelMounts) {
    animals.push({
        id: animalId++,
        key: `${def.key}-t${def.tier}`,
        kind: 'mount',
        tier: def.tier,
        vendorSilver: null,
        focusCost: null,
        babyItemId: itemId(`T${def.tier}_FARM_${def.stem}_BABY`),
        grownItemId: itemId(`T${def.tier}_FARM_${def.stem}_GROWN`),
        meatItemId: null,
        productItemId: null,
        feedPlantId: null,
        ladderId: null,
        seedReturn: def.sr,
        waterBonus: def.wb,
        plotType: 'kennel',
        pens: 4,
        baseHours: mountHours[def.tier],
        feedQtyPasture: mountFeed[def.tier],
        feedQtyIsland: mountFeed[def.tier],
        feedDiet: 'meat',
        feedFixed: false,
        isActive: true
    });
}

let animalBonusId = 1;
const animalBonusCities = [];
for (const def of livestockDefs) {
    const animal = animals.find((row) => row.key === def.key);
    for (const cid of cityIds(def.production)) {
        animalBonusCities.push({
            id: animalBonusId++,
            animalId: animal.id,
            cityId: cid,
            kind: 'production'
        });
    }
}

const economyConstants = [
    { id: 1, key: 'base_yield', value: '4.5', label: 'Base harvest yield (no premium)' },
    { id: 2, key: 'premium_yield', value: '9', label: 'Premium harvest yield' },
    { id: 3, key: 'city_yield_bonus', value: '0.1', label: 'City specialty yield bonus ratio' },
    { id: 4, key: 'focus_base', value: '1000', label: 'Farming focus base cost' },
    { id: 5, key: 'meat_qty', value: '18', label: 'Meat yield per animal' },
    { id: 6, key: 'product_qty', value: '18', label: 'Egg/milk yield per animal' },
    { id: 7, key: 'crop_hours', value: '22', label: 'Crop cycle hours (Albion day)' },
    { id: 8, key: 'livestock_hours', value: '44', label: 'Livestock cycle hours' },
    { id: 9, key: 'plant_slots', value: '9', label: 'Plant slots per farm plot' },
    { id: 10, key: 'pasture_pens', value: '9', label: 'Pens per pasture' },
    { id: 11, key: 'kennel_pens', value: '4', label: 'Pens per kennel' },
    { id: 12, key: 'albion_day_hours', value: '22', label: 'Albion day length (hours)' },
    { id: 13, key: 'plan_day_hours', value: '24', label: 'Planner day length (hours)' }
];

const islandPlots = [
    { id: 1, level: 1, plots: 1 },
    { id: 2, level: 2, plots: 3 },
    { id: 3, level: 3, plots: 6 },
    { id: 4, level: 4, plots: 9 },
    { id: 5, level: 5, plots: 12 },
    { id: 6, level: 6, plots: 16 }
];

function write(name, data) {
    fs.writeFileSync(`data/${name}.json`, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote data/${name}.json (${data.length})`);
}

write('yield-ladders', yieldLadders);
write('yield-ladder-steps', yieldLadderSteps);
write('plants', plants);
write('plant-bonus-cities', plantBonusCities);
write('animals', animals);
write('animal-bonus-cities', animalBonusCities);
write('economy-constants', economyConstants);
write('island-plots', islandPlots);

// Rewrite bonus-families with cityId
const bonus = JSON.parse(fs.readFileSync('data/bonus-families.json', 'utf8'));
const bonusOut = bonus.map((row) => {
    const { city, ...rest } = row;
    return {
        ...rest,
        cityId: city ? cityId(city) : null
    };
});
write('bonus-families', bonusOut);

// material-keys: itemId as numeric FK
const mats = JSON.parse(fs.readFileSync('data/material-keys.json', 'utf8'));
const matsOut = mats.map((row) => ({
    id: row.id,
    key: row.key,
    itemId: itemId(row.itemId),
    label: row.label
}));
write('material-keys', matsOut);

console.log('done');
