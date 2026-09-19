// Albion crafting-station order, verified against the in-game crafting UI.
// Source snapshot: 2026-08-30 (T4 reference).  The order is the same for
// every analysed tier; only the tier prefix in the localized item name changes.
const FIRST_THREE_BY_FAMILY = {
    'weapons/sword': ['Broadsword', 'Claymore', 'Dual Swords'],
    'weapons/axe': ['Battleaxe', 'Greataxe', 'Halberd'],
    'weapons/mace': ['Mace', 'Heavy Mace', 'Morning Star'],
    'weapons/hammer': ['Hammer', 'Polehammer', 'Great Hammer'],
    'weapons/knuckles': ['Brawler Gloves', 'Battle Bracers', 'Spiked Gauntlets'],
    'weapons/crossbow': ['Crossbow', 'Heavy Crossbow', 'Light Crossbow'],
    'weapons/bow': ['Bow', 'Warbow', 'Longbow'],
    'weapons/spear': ['Spear', 'Pike', 'Glaive'],
    'weapons/dagger': ['Dagger', 'Dagger Pair', 'Claws'],
    'weapons/quarterstaff': ['Quarterstaff', 'Iron-clad Staff', 'Double Bladed Staff'],
    'weapons/naturestaff': ['Nature Staff', 'Great Nature Staff', 'Wild Staff'],
    'weapons/shapeshifterstaff': ['Prowling Staff', 'Rootbound Staff', 'Primal Staff'],
    'weapons/arcanestaff': ['Arcane Staff', 'Great Arcane Staff', 'Enigmatic Staff'],
    'weapons/froststaff': ['Frost Staff', 'Great Frost Staff', 'Glacial Staff'],
    'weapons/firestaff': ['Fire Staff', 'Great Fire Staff', 'Infernal Staff'],
    'weapons/cursestaff': ['Cursed Staff', 'Great Cursed Staff', 'Demonic Staff'],
    'weapons/holystaff': ['Holy Staff', 'Great Holy Staff', 'Divine Staff'],
    'head/plate_helmet': ['Knight Helmet', 'Guardian Helmet', 'Soldier Helmet'],
    'armors/plate_armor': ['Knight Armor', 'Guardian Armor', 'Soldier Armor'],
    'shoes/plate_shoes': ['Knight Boots', 'Guardian Boots', 'Soldier Boots'],
    'head/leather_helmet': ['Assassin Hood', 'Mercenary Hood', 'Hunter Hood'],
    'armors/leather_armor': ['Assassin Jacket', 'Mercenary Jacket', 'Hunter Jacket'],
    'shoes/leather_shoes': ['Assassin Shoes', 'Mercenary Shoes', 'Hunter Shoes'],
    'head/cloth_helmet': ['Scholar Cowl', 'Cleric Cowl', 'Mage Cowl'],
    'armors/cloth_armor': ['Scholar Robe', 'Cleric Robe', 'Mage Robe'],
    'shoes/cloth_shoes': ['Scholar Sandals', 'Cleric Sandals', 'Mage Sandals'],
    'category/offhands': ['Shield', 'Sarcophagus', 'Caitiff Shield'],
    'category/bags': ['Bag', 'Satchel of Insight'],
    'category/capes': ['Cape', 'Bridgewatch Cape', 'Fort Sterling Cape']
};

function stationItemName(localizedName) {
    return String(localizedName || '').replace(/^[^']+'s\s+/, '').trim();
}

/** Returns the zero-based station position, or null when this family has no snapshot. */
export function dailyBonusStationPosition(familyKey, localizedName) {
    const items = FIRST_THREE_BY_FAMILY[familyKey];
    if (!items) return null;
    const position = items.indexOf(stationItemName(localizedName));
    return position === -1 ? null : position;
}
