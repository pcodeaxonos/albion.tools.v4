import { escapeHtml } from './utils.js';

const ICON_BASE = 'https://render.albiononline.com/v1/item';
const DEFAULT_SIZE = 64;

/** Static labels so tools stay fast and skip IndexedDB / items.json. */
export const ITEM_LABELS = {
    T1_WOOD: 'Rough Logs',
    T2_WOOD: 'Birch Logs',
    T3_WOOD: 'Chestnut Logs',
    T4_WOOD: 'Pine Logs',
    T5_WOOD: 'Cedar Logs',
    T6_WOOD: 'Bloodoak Logs',
    T7_WOOD: 'Ashenbark Logs',
    T8_WOOD: 'Whitewood Logs',
    T1_ROCK: 'Rough Stone',
    T2_ROCK: 'Limestone',
    T3_ROCK: 'Sandstone',
    T4_ROCK: 'Travertine',
    T5_ROCK: 'Granite',
    T6_ROCK: 'Slate',
    T7_ROCK: 'Basalt',
    T8_ROCK: 'Marble',
    T2_ORE: 'Copper Ore',
    T3_ORE: 'Tin Ore',
    T4_ORE: 'Iron Ore',
    T5_ORE: 'Titanium Ore',
    T6_ORE: 'Runite Ore',
    T7_ORE: 'Meteorite Ore',
    T8_ORE: 'Adamantium Ore',
    T2_HIDE: 'Rugged Hide',
    T3_HIDE: 'Thin Hide',
    T4_HIDE: 'Medium Hide',
    T5_HIDE: 'Heavy Hide',
    T6_HIDE: 'Robust Hide',
    T7_HIDE: 'Thick Hide',
    T8_HIDE: 'Resilient Hide',
    T2_FIBER: 'Cotton',
    T3_FIBER: 'Flax',
    T4_FIBER: 'Hemp',
    T5_FIBER: 'Skyflower',
    T6_FIBER: 'Amberleaf Cotton',
    T7_FIBER: 'Sunflax',
    T8_FIBER: 'Ghost Hemp',
    T2_STONEBLOCK: 'Limestone Block',
    T3_STONEBLOCK: 'Sandstone Block',
    T4_STONEBLOCK: 'Travertine Block',
    T5_STONEBLOCK: 'Granite Block',
    T6_STONEBLOCK: 'Slate Block',
    T7_STONEBLOCK: 'Basalt Block',
    T8_STONEBLOCK: 'Marble Block',
    T2_PLANKS: 'Birch Planks',
    T3_PLANKS: 'Chestnut Planks',
    T4_PLANKS: 'Pine Planks',
    T5_PLANKS: 'Cedar Planks',
    T6_PLANKS: 'Bloodoak Planks',
    T7_PLANKS: 'Ashenbark Planks',
    T8_PLANKS: 'Whitewood Planks',
    T2_METALBAR: 'Copper Bar',
    T3_METALBAR: 'Bronze Bar',
    T4_METALBAR: 'Steel Bar',
    T5_METALBAR: 'Titanium Steel Bar',
    T6_METALBAR: 'Runite Steel Bar',
    T7_METALBAR: 'Meteorite Steel Bar',
    T8_METALBAR: 'Adamantium Steel Bar',
    T2_LEATHER: 'Stiff Leather',
    T3_LEATHER: 'Thick Leather',
    T4_LEATHER: 'Worked Leather',
    T5_LEATHER: 'Cured Leather',
    T6_LEATHER: 'Hardened Leather',
    T7_LEATHER: 'Reinforced Leather',
    T8_LEATHER: 'Fortified Leather',
    T2_CLOTH: 'Simple Cloth',
    T3_CLOTH: 'Neat Cloth',
    T4_CLOTH: 'Fine Cloth',
    T5_CLOTH: 'Ornate Cloth',
    T6_CLOTH: 'Lavish Cloth',
    T7_CLOTH: 'Opulent Cloth',
    T8_CLOTH: 'Baroque Cloth',
    QUESTITEM_TOKEN_AVALON: 'Avalonian Energy',
    T1_FACTION_FOREST_TOKEN_1: 'Treeheart',
    T1_FACTION_HIGHLAND_TOKEN_1: 'Rockheart',
    T1_FACTION_STEPPE_TOKEN_1: 'Beastheart',
    T1_FACTION_MOUNTAIN_TOKEN_1: 'Mountainheart',
    T1_FACTION_SWAMP_TOKEN_1: 'Vineheart',
    T1_FACTION_CAERLEON_TOKEN_1: 'Shadowheart',
    T4_CAPE: "Adept's Cape",
    T5_CAPE: "Expert's Cape",
    T6_CAPE: "Master's Cape",
    T7_CAPE: "Grandmaster's Cape",
    T8_CAPE: "Elder's Cape",
    T1_FARM_CARROT_SEED: 'Carrot Seeds',
    T2_FARM_BEAN_SEED: 'Bean Seeds',
    T3_FARM_WHEAT_SEED: 'Wheat Seeds',
    T4_FARM_TURNIP_SEED: 'Turnip Seeds',
    T5_FARM_CABBAGE_SEED: 'Cabbage Seeds',
    T6_FARM_POTATO_SEED: 'Potato Seeds',
    T7_FARM_CORN_SEED: 'Corn Seeds',
    T8_FARM_PUMPKIN_SEED: 'Pumpkin Seeds',
    T2_FARM_AGARIC_SEED: 'Arcane Agaric Seed',
    T3_FARM_COMFREY_SEED: 'Brightleaf Comfrey Seed',
    T4_FARM_BURDOCK_SEED: 'Crenellated Burdock Seed',
    T5_FARM_TEASEL_SEED: 'Dragon Teasel Seed',
    T6_FARM_FOXGLOVE_SEED: 'Elusive Foxglove Seed',
    T7_FARM_MULLEIN_SEED: 'Firetouched Mullein Seed',
    T8_FARM_YARROW_SEED: 'Ghoul Yarrow Seed',
    T1_CARROT: 'Carrots',
    T2_BEAN: 'Beans',
    T3_WHEAT: 'Sheaf of Wheat',
    T4_TURNIP: 'Turnips',
    T5_CABBAGE: 'Cabbage',
    T6_POTATO: 'Potatoes',
    T7_CORN: 'Bundle of Corn',
    T8_PUMPKIN: 'Pumpkin',
    T2_AGARIC: 'Arcane Agaric',
    T3_COMFREY: 'Brightleaf Comfrey',
    T4_BURDOCK: 'Crenellated Burdock',
    T5_TEASEL: 'Dragon Teasel',
    T6_FOXGLOVE: 'Elusive Foxglove',
    T7_MULLEIN: 'Firetouched Mullein',
    T8_YARROW: 'Ghoul Yarrow'
};

export function itemLabel(uniqueName, fallback = uniqueName) {
    return ITEM_LABELS[uniqueName] ?? fallback;
}

export function itemIconUrl(uniqueName, size = DEFAULT_SIZE) {
    const safeSize = Number.isFinite(size) ? Math.min(217, Math.max(1, Math.round(size))) : DEFAULT_SIZE;
    return `${ICON_BASE}/${encodeURIComponent(uniqueName)}.png?size=${safeSize}`;
}

export function stoneBlockId(tier) {
    return `T${tier}_STONEBLOCK`;
}

export function rawStoneId(tier) {
    return `T${tier}_ROCK`;
}

export function itemIconHtml(uniqueName, { size = DEFAULT_SIZE, className = 'item-icon' } = {}) {
    if (!uniqueName) {
        return '';
    }

    const alt = itemLabel(uniqueName);
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(itemIconUrl(uniqueName, size))}" alt="${escapeHtml(alt)}" width="36" height="36" loading="lazy" decoding="async" onerror="this.hidden=true">`;
}
