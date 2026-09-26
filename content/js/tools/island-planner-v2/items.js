import { getPlants, getAnimals, getBuildings } from '../../core/catalog.js';
import { getItemLocalizedName, getItemUniqueName } from '../../db/relations.js';

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
