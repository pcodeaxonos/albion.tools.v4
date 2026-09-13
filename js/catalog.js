import { getAll } from './db/store.js';
import {
    getItemById,
    getItemUniqueName,
    getItemLocalizedName,
    getCityById,
    getCityApiName
} from './db/relations.js';

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function ladderStep(ladderId, tier) {
    if (!ladderId) {
        return null;
    }
    return getAll('yieldLadderSteps').find((row) =>
        Number(row.ladderId) === Number(ladderId) && Number(row.tier) === Number(tier)
    ) ?? null;
}

function plantBonusCityIds(plantId) {
    return getAll('plantBonusCities')
        .filter((row) => Number(row.plantId) === Number(plantId))
        .map((row) => Number(row.cityId));
}

function animalBonusCityIds(animalId, kind = 'production') {
    return getAll('animalBonusCities')
        .filter((row) => Number(row.animalId) === Number(animalId) && row.kind === kind)
        .map((row) => Number(row.cityId));
}

function cityApiNames(cityIds) {
    return cityIds
        .map((id) => getCityApiName(id))
        .filter(Boolean);
}

function resolveYield(row) {
    if (row.seedReturn != null && row.seedReturn !== '') {
        return {
            seedReturn: num(row.seedReturn),
            waterBonus: num(row.waterBonus)
        };
    }
    const step = ladderStep(row.ladderId, row.tier);
    return {
        seedReturn: num(step?.seedReturn),
        waterBonus: num(step?.waterBonus)
    };
}

/**
 * Hydrated plant for tools. Label/uniqueNames come from items via FK.
 */
export function hydratePlant(row) {
    if (!row || row.isActive === false) {
        return null;
    }

    const yieldInfo = resolveYield(row);
    const bonusCityIds = plantBonusCityIds(row.id);
    const seedItem = getItemById(row.seedItemId);
    const plantItem = getItemById(row.plantItemId);

    return {
        id: Number(row.id),
        key: row.key,
        kind: row.kind,
        plotType: row.plotType || (row.kind === 'herb' ? 'herb' : 'farm'),
        tier: Number(row.tier),
        label: plantItem?.localizedName || getItemLocalizedName(row.plantItemId, row.key),
        vendor: num(row.vendorSilver),
        bonusCityIds,
        bonusCities: cityApiNames(bonusCityIds),
        seedItemId: Number(row.seedItemId),
        plantItemId: Number(row.plantItemId),
        seedId: seedItem?.uniqueName || getItemUniqueName(row.seedItemId),
        plantId: plantItem?.uniqueName || getItemUniqueName(row.plantItemId),
        seedReturn: yieldInfo.seedReturn,
        waterBonus: yieldInfo.waterBonus,
        ladderId: row.ladderId != null ? Number(row.ladderId) : null
    };
}

/**
 * Hydrated animal for pasture + island. Feed plant linked by feedPlantId.
 */
export function hydrateAnimal(row) {
    if (!row || row.isActive === false) {
        return null;
    }

    const yieldInfo = resolveYield(row);
    const productionCityIds = animalBonusCityIds(row.id, 'production');
    const feedPlant = row.feedPlantId != null
        ? hydratePlant(getAll('plants').find((plant) => Number(plant.id) === Number(row.feedPlantId)))
        : null;

    const babyItem = getItemById(row.babyItemId);
    const grownItem = getItemById(row.grownItemId);
    const meatItem = row.meatItemId != null ? getItemById(row.meatItemId) : null;
    const productItem = row.productItemId != null ? getItemById(row.productItemId) : null;

    return {
        id: Number(row.id),
        key: row.key,
        kind: row.kind,
        plotType: row.plotType,
        pens: num(row.pens, row.plotType === 'kennel' ? 4 : 9),
        tier: Number(row.tier),
        label: grownItem?.localizedName || getItemLocalizedName(row.grownItemId, row.key),
        vendor: row.vendorSilver == null || row.vendorSilver === '' ? null : num(row.vendorSilver),
        focusCost: row.focusCost == null || row.focusCost === '' ? null : num(row.focusCost),
        baseHours: num(row.baseHours),
        feedQtyPasture: num(row.feedQtyPasture),
        feedQtyIsland: num(row.feedQtyIsland),
        feedQty: num(row.feedQtyIsland),
        feedDiet: row.feedDiet || 'plants',
        feedFixed: row.feedFixed !== false,
        feedKey: feedPlant?.key || null,
        feedPlantRefId: feedPlant?.id ?? null,
        seedReturn: yieldInfo.seedReturn,
        waterBonus: yieldInfo.waterBonus,
        babyItemId: Number(row.babyItemId),
        grownItemId: Number(row.grownItemId),
        meatItemId: row.meatItemId != null ? Number(row.meatItemId) : null,
        productItemId: row.productItemId != null ? Number(row.productItemId) : null,
        babyId: babyItem?.uniqueName || getItemUniqueName(row.babyItemId),
        grownId: grownItem?.uniqueName || getItemUniqueName(row.grownItemId),
        meatId: meatItem?.uniqueName || (row.meatItemId != null ? getItemUniqueName(row.meatItemId) : null),
        productId: productItem?.uniqueName || (row.productItemId != null ? getItemUniqueName(row.productItemId) : null),
        feedSeedId: feedPlant?.seedId || null,
        feedPlantId: feedPlant?.plantId || null,
        feedLabel: feedPlant?.label || (row.feedDiet === 'meat' ? 'Meat' : 'Plants'),
        feedBonusCityIds: feedPlant?.bonusCityIds || [],
        feedBonusCities: feedPlant?.bonusCities || [],
        bonusCityIds: productionCityIds,
        bonusCities: cityApiNames(productionCityIds)
    };
}

export function getPlants({ kind } = {}) {
    return getAll('plants')
        .map(hydratePlant)
        .filter(Boolean)
        .filter((row) => !kind || row.kind === kind)
        .sort((a, b) => a.tier - b.tier || a.id - b.id);
}

export function getAnimals({ kind, plotType } = {}) {
    return getAll('animals')
        .map(hydrateAnimal)
        .filter(Boolean)
        .filter((row) => !kind || row.kind === kind)
        .filter((row) => !plotType || row.plotType === plotType)
        .sort((a, b) => a.tier - b.tier || a.id - b.id);
}

export function getEconomyConstant(key, fallback = null) {
    const row = getAll('economyConstants').find((entry) => entry.key === key);
    if (!row) {
        return fallback;
    }
    const n = Number(row.value);
    return Number.isFinite(n) ? n : row.value;
}

export function getIslandPlotsByLevel() {
    const map = {};
    for (const row of getAll('islandPlots')) {
        map[Number(row.level)] = Number(row.plots);
    }
    return map;
}

export function getCityByIdSafe(id) {
    return getCityById(id);
}

function materialKeyById(id) {
    if (id == null || id === '') {
        return null;
    }
    return getAll('materialKeys').find((row) => Number(row.id) === Number(id)) ?? null;
}

function bonusFamilyById(id) {
    if (id == null || id === '') {
        return null;
    }
    return getAll('bonusFamilies').find((row) => Number(row.id) === Number(id)) ?? null;
}

export function materialUniqueName(materialRow, tier) {
    if (!materialRow) {
        return null;
    }
    const stem = String(materialRow.stem || '').trim();
    if (stem && tier != null) {
        return `T${tier}_${stem}`;
    }
    return getItemUniqueName(materialRow.itemId);
}

function hydrateRecipeLine(line, recipeTier) {
    const mat = materialKeyById(line.materialKeyId);
    let uniqueName = null;
    let key = null;
    let short = null;
    let appliesRr = line.appliesRr !== false;

    if (mat) {
        key = mat.key;
        uniqueName = materialUniqueName(mat, recipeTier);
        short = mat.stem && recipeTier != null
            ? `T${recipeTier} ${mat.label}`
            : (mat.label || key);
        if (line.appliesRr == null) {
            appliesRr = mat.appliesRr !== false;
        }
    } else if (line.inputItemId != null) {
        const item = getItemById(line.inputItemId);
        uniqueName = item?.uniqueName || getItemUniqueName(line.inputItemId);
        key = uniqueName;
        short = item?.localizedName || getItemLocalizedName(line.inputItemId, uniqueName);
    }

    return {
        id: Number(line.id),
        key,
        uniqueName,
        short,
        qty: num(line.qty),
        appliesRr,
        materialKeyId: line.materialKeyId != null ? Number(line.materialKeyId) : null,
        inputItemId: line.inputItemId != null ? Number(line.inputItemId) : null
    };
}

/**
 * Hydrated craft recipe for furniture / ava / caerleon / faction / royal tools.
 */
export function hydrateCraftRecipe(row) {
    if (!row || row.isActive === false) {
        return null;
    }

    const output = getItemById(row.outputItemId);
    const family = bonusFamilyById(row.bonusFamilyId);
    const tier = row.tier == null || row.tier === '' ? null : Number(row.tier);
    const lines = getAll('craftRecipeLines')
        .filter((line) => Number(line.recipeId) === Number(row.id))
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue) || Number(a.id) - Number(b.id))
        .map((line) => hydrateRecipeLine(line, tier))
        .filter((line) => line.uniqueName);

    const recipe = {};
    for (const line of lines) {
        if (line.key) {
            recipe[line.key] = line.qty;
        }
    }

    return {
        id: Number(row.id),
        code: row.code,
        tool: row.tool,
        kind: row.kind || '',
        tier,
        uniqueName: output?.uniqueName || getItemUniqueName(row.outputItemId),
        label: output?.localizedName || getItemLocalizedName(row.outputItemId, row.code),
        outputItemId: Number(row.outputItemId),
        bonusFamilyId: row.bonusFamilyId != null ? Number(row.bonusFamilyId) : null,
        familyKey: family?.familyKey || null,
        recipe,
        lines,
        sortValue: num(row.sortValue)
    };
}

export function getCraftRecipes({ tool, kind } = {}) {
    return getAll('craftRecipes')
        .map(hydrateCraftRecipe)
        .filter(Boolean)
        .filter((row) => !tool || row.tool === tool)
        .filter((row) => !kind || kind === 'all' || row.kind === kind)
        .sort((a, b) => a.sortValue - b.sortValue || a.id - b.id);
}

export function getCraftKindOptions(tool) {
    const seen = new Set();
    const options = [{ id: 'all', label: 'Hepsi' }];
    for (const recipe of getCraftRecipes({ tool })) {
        if (!recipe.kind || seen.has(recipe.kind)) {
            continue;
        }
        seen.add(recipe.kind);
        options.push({
            id: recipe.kind,
            label: recipe.kind.charAt(0).toUpperCase() + recipe.kind.slice(1)
        });
    }
    return options;
}

export function getRefineFamilies() {
    return getAll('refineFamilies')
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((row) => {
            const family = bonusFamilyById(row.bonusFamilyId);
            return {
                id: row.code,
                dbId: Number(row.id),
                label: row.label,
                hamWord: row.hamWord,
                outWord: row.outWord,
                raw: row.rawStem,
                out: row.outStem,
                bonusKey: family?.familyKey || null,
                bonusFamilyId: row.bonusFamilyId != null ? Number(row.bonusFamilyId) : null
            };
        });
}

export function getRefineTier() {
    const map = {};
    for (const row of getAll('refineTiers')) {
        map[Number(row.tier)] = {
            rawQty: num(row.rawQty),
            lowerQty: num(row.lowerQty)
        };
    }
    return map;
}

export function getFactions() {
    return getAll('factions')
        .filter((row) => row.isActive !== false)
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((row) => {
            const city = getCityById(row.cityId);
            const heart = row.heartItemId != null ? getItemById(row.heartItemId) : null;
            const baby = getItemById(row.babyItemId);
            const elite = getItemById(row.eliteItemId);
            return {
                id: Number(row.id),
                cityId: Number(row.cityId),
                city: city?.marketApiName || getCityApiName(row.cityId),
                stem: row.stem,
                heartId: heart?.uniqueName || (row.heartItemId != null ? getItemUniqueName(row.heartItemId) : null),
                heartLabel: heart?.localizedName || null,
                babyId: baby?.uniqueName || getItemUniqueName(row.babyItemId),
                babyLabel: baby?.localizedName || null,
                eliteId: elite?.uniqueName || getItemUniqueName(row.eliteItemId),
                eliteLabel: elite?.localizedName || null
            };
        });
}

export function cityProductionBonus() {
    return getEconomyConstant('city_production', 18);
}

export function cityResourceBonus() {
    return getEconomyConstant('city_resource', 40);
}

export function focusProductionBonus() {
    return getEconomyConstant('focus_production', 59);
}

export function getEnchantSlots() {
    return getAll('enchantSlots')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue) || Number(a.id) - Number(b.id))
        .map((row) => ({
            id: row.code,
            dbId: Number(row.id),
            label: row.label,
            short: row.short,
            qty: num(row.qty),
            icon: getItemUniqueName(row.iconItemId),
            iconItemId: Number(row.iconItemId)
        }));
}

export function getEnchantSteps() {
    return getAll('enchantSteps')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            from: Number(row.fromEnchant),
            to: Number(row.toEnchant),
            kind: row.kind,
            label: row.label,
            itemType: row.itemType
        }));
}

export function getEnchantPaths() {
    return getAll('enchantPaths')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            from: Number(row.fromEnchant),
            to: Number(row.toEnchant),
            tone: row.tone
        }));
}

export function getBuildings() {
    const tiers = getAll('buildingTiers');
    return getAll('buildings')
        .filter((row) => row.isActive !== false)
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => {
            const wood = {};
            const stone = {};
            for (const tierRow of tiers.filter((entry) => Number(entry.buildingId) === Number(row.id))) {
                wood[Number(tierRow.tier)] = num(tierRow.wood);
                stone[Number(tierRow.tier)] = num(tierRow.stone);
            }
            return {
                id: row.code,
                dbId: Number(row.id),
                label: row.label,
                wood,
                stone,
                blocks: num(row.blocks)
            };
        });
}

export function getMaterialGroups() {
    const tierRows = getAll('materialGroupTiers');
    return getAll('materialGroups')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            id: row.code,
            dbId: Number(row.id),
            label: row.label,
            family: row.family,
            stem: row.stem,
            hasEnchant: row.hasEnchant !== false,
            tiers: tierRows
                .filter((entry) => Number(entry.groupId) === Number(row.id))
                .map((entry) => Number(entry.tier))
                .sort((a, b) => a - b)
        }));
}

export function getSiteTools() {
    return getAll('siteTools')
        .filter((row) => row.isActive !== false)
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            id: row.code,
            title: row.title,
            description: row.description,
            icon: row.icon,
            href: row.href || '',
            addedAt: row.addedAt || '',
            group: row.groupLabel,
            frequent: row.frequent === true
        }));
}

export function getSitePages() {
    return getAll('sitePages')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            id: row.code,
            title: row.title,
            href: row.href
        }));
}

export function getPriceServers() {
    return getAll('priceServers')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            id: row.code,
            label: row.label,
            host: row.host
        }));
}

export function getPriceSources() {
    return getAll('priceSources')
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue))
        .map((row) => ({
            id: row.code,
            label: row.label
        }));
}

export function getEnchantPowers() {
    const raw = String(getEconomyConstant('enchant_powers', '5,6,7,8,9,10,11'));
    return raw.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n));
}

export function getLocalPriceHost() {
    return String(getEconomyConstant('local_price_host', 'http://127.0.0.1:3001'));
}

export function getNewToolLiveCount() {
    return getEconomyConstant('new_tool_live_count', 2);
}

