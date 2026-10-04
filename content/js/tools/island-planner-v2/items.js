import { getPlants, getAnimals, getBuildings, hydrateCraftRecipe } from '../../core/catalog.js';
import { getAll } from '../../db/store.js';
import { getItemLocalizedName, getItemUniqueName } from '../../db/relations.js';

export const MOUNT_MATERIAL_RETURN_RATE = 0.152;

export function mountMaterialConsumption(line) {
    // Refined crafting resources return; animals, faction tokens and artifacts do not.
    const returnRate = /^T\d+_(LEATHER|PLANKS|METALBAR|CLOTH|STONEBLOCK)(?:@\d+)?$/.test(line.uniqueName)
        ? MOUNT_MATERIAL_RETURN_RATE : 0;
    return { returnRate, netQty: line.qty * (1 - returnRate) };
}

const TYPE_LABELS = Object.freeze({
    farm: 'Tarla',
    herb: 'Ot',
    pasture: 'Mera',
    kennel: 'Kennel',
    house: 'Ev'
});

const ITEM_KIND_LABELS = Object.freeze({
    crop: 'Sebze',
    herb: 'Ot',
    livestock: 'Hayvan',
    mount: 'Binek',
    'faction-mount': 'Faction Bineği'
});

export function typeLabel(type) {
    return TYPE_LABELS[type] ?? type;
}

export function buildingRows() {
    return getBuildings().flatMap((building) => {
        const tiers = [...new Set([
            ...Object.keys(building.wood),
            ...Object.keys(building.stone)
        ].map(Number).filter(Number.isFinite))];

        return tiers.map((tier) => ({
            key: `building:${building.id}:T${tier}`,
            kind: 'building',
            plotType: 'house',
            tier,
            label: `${building.label} · T${tier}`,
            iconUniqueName: 'PLAYERISLAND_FURNITUREITEM_WOOD_GATE_BIG_B',
            buildingId: building.id
        }));
    });
}

export function itemRows() {
    return [...getPlants(), ...getAnimals(), ...buildingRows()];
}

export function itemForSlot(entry) {
    return entry?.item
        ? itemRows().find((item) => item.key === entry.item) ?? null
        : null;
}

export function itemUniqueName(item) {
    return item?.iconUniqueName
        ?? getItemUniqueName(item?.plantItemId ?? item?.grownItemId);
}

export function isEconomicItem(item) {
    return Boolean(item?.seedId || item?.plantId || item?.babyId || item?.grownId);
}

export function itemName(item) {
    return item?.label || item?.key || '—';
}

export function itemCategory(item) {
    return ITEM_KIND_LABELS[item?.kind] ?? typeLabel(item?.plotType);
}

export function cityBonusItems(islandCity) {
    return [...getPlants(), ...getAnimals()]
        .filter((item) => hasCityBonus(item, islandCity))
        .sort((a, b) => a.tier - b.tier || itemName(a).localeCompare(itemName(b), 'tr'));
}

export function hasCityBonus(item, islandCity) {
    return Array.isArray(item?.bonusCities) && item.bonusCities.includes(islandCity);
}

export function animalProductionModes(item) {
    if (!item?.babyId) {
        return [];
    }
    const modes = [{ value: 'live', label: 'Canlı Sat' }];
    if (mountRecipes(item).length) modes.push({ value: 'mount', label: 'Binek Sat' });
    if (item.meatId) {
        modes.push({ value: 'butcher', label: 'Kes' });
    }
    if (item.productId) {
        modes.push({
            value: 'product',
            label: getItemLocalizedName(item.productItemId, 'Ürün') || 'Ürün'
        });
    }
    return modes;
}

// Derive every conversion from the shared game recipes, including faction mounts.
export function mountRecipes(item) {
    if (!item?.grownItemId || !['mount', 'faction-mount'].includes(item.kind)) return [];
    const outputIds = new Set(getAll('recipeMaterials')
        .filter(line => Number(line.inputItemId) === Number(item.grownItemId))
        .map(line => Number(line.outputItemId)));
    return getAll('items')
        .filter(output => outputIds.has(Number(output.id)) && output.itemType === 'MOUNT'
            && !/TEST|_SKIN/.test(output.uniqueName))
        .map(output => hydrateCraftRecipe(output.id))
        .filter(Boolean)
        .sort((a, b) => a.lines.length - b.lines.length || a.uniqueName.localeCompare(b.uniqueName));
}

export function mountRecipeFor(item, uniqueName) {
    const recipes = mountRecipes(item);
    return recipes.find(recipe => recipe.uniqueName === uniqueName) ?? recipes[0] ?? null;
}

export function productionModeFor(item, value) {
    if (!item?.babyId) {
        return null;
    }
    return animalProductionModes(item).some((mode) => mode.value === value)
        ? value
        : 'live';
}

export function productionModeUsesFocus(item, value) {
    return !item?.babyId || productionModeFor(item, value) !== 'product';
}
