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
const FW_CITY_MAP = {
    MARTLOCK: 'Martlock',
    FORTSTERLING: 'Fort Sterling',
    BRIDGEWATCH: 'Bridgewatch',
    LYMHURST: 'Lymhurst',
    THETFORD: 'Thetford',
    CAERLEON: 'Caerleon',
    BRECILIEN: 'Brecilien'
};

function factionCityFromUnique(uniqueName) {
    const match = String(uniqueName || '').match(/_FW_([A-Z]+)_/);
    if (!match) {
        return null;
    }
    return FW_CITY_MAP[match[1]] || null;
}

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
    const babyUnique = babyItem?.uniqueName || getItemUniqueName(row.babyItemId);
    const factionCity = row.kind === 'faction-mount' ? factionCityFromUnique(babyUnique) : null;

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
        offspringChancePerNurture: row.offspringChancePerNurture == null || row.offspringChancePerNurture === '' ? null : num(row.offspringChancePerNurture),
        maxNurtureCount: row.maxNurtureCount == null || row.maxNurtureCount === '' ? null : num(row.maxNurtureCount),
        babyItemId: Number(row.babyItemId),
        grownItemId: Number(row.grownItemId),
        meatItemId: row.meatItemId != null ? Number(row.meatItemId) : null,
        productItemId: row.productItemId != null ? Number(row.productItemId) : null,
        babyId: babyUnique,
        grownId: grownItem?.uniqueName || getItemUniqueName(row.grownItemId),
        meatId: meatItem?.uniqueName || (row.meatItemId != null ? getItemUniqueName(row.meatItemId) : null),
        productId: productItem?.uniqueName || (row.productItemId != null ? getItemUniqueName(row.productItemId) : null),
        feedSeedId: feedPlant?.seedId || null,
        feedPlantId: feedPlant?.plantId || null,
        feedLabel: feedPlant?.label || (row.feedDiet === 'meat' ? 'Meat' : 'Plants'),
        feedBonusCityIds: feedPlant?.bonusCityIds || [],
        feedBonusCities: feedPlant?.bonusCities || [],
        bonusCityIds: productionCityIds,
        bonusCities: cityApiNames(productionCityIds),
        factionCity
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

function bonusFamilyById(id) {
    if (id == null || id === '') {
        return null;
    }
    return getAll('bonusFamilies').find((row) => Number(row.id) === Number(id)) ?? null;
}

function recipeMaterialKey(uniqueName) {
    const value = String(uniqueName || '');
    if (value.includes('_PLANKS')) return 'plank';
    if (value.includes('_METALBAR')) return 'bar';
    if (value.includes('_LEATHER')) return 'leather';
    if (value.includes('_CLOTH')) return 'cloth';
    if (value.includes('_STONEBLOCK')) return 'block';
    if (value === 'QUESTITEM_TOKEN_AVALON') return 'energy';
    return value;
}

function craftTools(item) {
    return String(item?.craftTools || '').split('|').map((tool) => tool.trim()).filter(Boolean);
}

function craftKind(item, tool) {
    const uniqueName = String(item?.uniqueName || '');
    if (tool === 'furniture') return uniqueName.match(/FURNITUREITEM_(CHEST|BED|TABLE)/)?.[1]?.toLowerCase() || '';
    if (tool === 'ava') {
        return Object.entries({ PICK: 'pickaxe', HAMMER: 'hammer', AXE: 'axe', SICKLE: 'sickle', KNIFE: 'knife', FISHINGROD: 'rod' })
            .find(([stem]) => uniqueName.includes(`_${stem}_`))?.[1] || '';
    }
    if (tool === 'royal') {
        const match = uniqueName.match(/_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)_ROYAL/);
        return match ? `${match[2].toLowerCase()}-${({ HEAD: 'head', ARMOR: 'armor', SHOES: 'shoes' })[match[1]]}` : '';
    }
    return item?.shopSubCategory || item?.itemType || '';
}

function bonusFamilyForItem(item) {
    const category = String(item?.shopCategory || '');
    const sub = String(item?.shopSubCategory || '');
    const candidates = [`${category}/${sub}`, `weapons/${sub}`, `head/${sub}`, `armors/${sub}`, `shoes/${sub}`, `category/${sub}`];
    return getAll('bonusFamilies').find((family) => candidates.includes(family.familyKey)) ?? null;
}

function hydrateRecipeLine(line) {
    const input = getItemById(line.inputItemId);
    const uniqueName = input?.uniqueName || getItemUniqueName(line.inputItemId);
    return {
        id: Number(line.id),
        key: recipeMaterialKey(uniqueName),
        uniqueName,
        short: input?.localizedName || getItemLocalizedName(line.inputItemId, uniqueName),
        qty: num(line.qty),
        appliesRr: line.appliesRr !== false,
        inputItemId: Number(line.inputItemId)
    };
}

/** Hydrated craftable item and its concrete input items. */
export function hydrateCraftRecipe(outputItemId, tool = '') {
    const output = getItemById(outputItemId);
    if (!output) return null;
    const lines = getAll('recipeMaterials')
        .filter((line) => Number(line.outputItemId) === Number(outputItemId))
        .slice()
        .sort((a, b) => num(a.sortValue) - num(b.sortValue) || Number(a.id) - Number(b.id))
        .map(hydrateRecipeLine)
        .filter((line) => line.uniqueName);
    if (!lines.length) return null;

    const recipe = {};
    for (const line of lines) {
        if (line.key) {
            recipe[line.key] = line.qty;
        }
    }

    return {
        id: Number(output.id),
        code: String(output.uniqueName || '').toLowerCase(),
        tool,
        kind: craftKind(output, tool),
        tier: Number(output.tier) || null,
        uniqueName: output.uniqueName || getItemUniqueName(outputItemId),
        label: output.localizedName || getItemLocalizedName(outputItemId, output.uniqueName),
        outputItemId: Number(output.id),
        bonusFamilyId: bonusFamilyForItem(output)?.id ?? null,
        familyKey: bonusFamilyForItem(output)?.familyKey || null,
        recipe,
        lines,
        sortValue: Number(output.tier) * 100000 + Number(output.id)
    };
}

export function getCraftRecipes({ tool, kind } = {}) {
    const outputIds = [...new Set(getAll('recipeMaterials').map((line) => Number(line.outputItemId)))];
    return outputIds
        .map((outputItemId) => {
            const item = getItemById(outputItemId);
            const matchesTool = tool === 'gameinfo'
                ? !craftTools(item).length
                : !tool || craftTools(item).includes(tool);
            return matchesTool ? hydrateCraftRecipe(outputItemId, tool || '') : null;
        })
        .filter(Boolean)
        .filter((row) => !tool || row.tool === tool)
        .filter((row) => !kind || kind === 'all' || row.kind === kind)
        .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label, 'tr') || a.id - b.id);
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

export function getRefineTiers() {
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

export function citySpecialtyProductionBonus() {
    return getEconomyConstant('city_specialty_production', 15);
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
