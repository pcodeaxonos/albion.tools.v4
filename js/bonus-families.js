import { getAll } from './db/store.js';

const LABEL_OVERRIDES = {
    arcanestaff: 'Arcane Staff',
    cursestaff: 'Cursed Staff',
    firestaff: 'Fire Staff',
    froststaff: 'Frost Staff',
    holystaff: 'Holy Staff',
    naturestaff: 'Nature Staff',
    shapeshifterstaff: 'Shapeshifter Staff',
    quarterstaff: 'Quarterstaff',
    knuckles: 'War Gloves',
    cloth_helmet: 'Cloth Cowl',
    leather_helmet: 'Leather Hood',
    plate_helmet: 'Plate Helmet',
    cloth_armor: 'Cloth Robe',
    leather_armor: 'Leather Jacket',
    plate_armor: 'Plate Armor',
    cloth_shoes: 'Cloth Sandals',
    leather_shoes: 'Leather Shoes',
    plate_shoes: 'Plate Boots',
    bags: 'Bag',
    capes: 'Cape',
    offhands: 'Off-hand',
    food: 'Food',
    potions: 'Potion',
    rock: 'Stone',
    fiber: 'Fiber',
    hide: 'Hide',
    ore: 'Ore',
    wood: 'Wood'
};

const TOOL_SUB2 = new Set(['picks', 'hammer', 'axes', 'sickle', 'knifes', 'fishingrods', 'toolkit']);

function formatSlugLabel(slug) {
    if (LABEL_OVERRIDES[slug]) {
        return LABEL_OVERRIDES[slug];
    }

    return slug
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function labelForFamilyKey(key) {
    const slug = String(key || '').split('/').pop();
    return formatSlugLabel(slug);
}

function bySort(a, b) {
    return (a.sortValue - b.sortValue) || a.label.localeCompare(b.label);
}

let cachedFamilies = null;

/**
 * Daily craft/refine bonus is a family (Sword, Hide, Bag), not a unique item.
 * Options are derived from itemCategories / gathering tools already in the DB.
 */
export function getBonusFamilies() {
    if (cachedFamilies) {
        return cachedFamilies;
    }

    const categories = getAll('itemCategories');
    const items = getAll('items');
    const families = [];

    const pushSubs = (parentSlug, group, keyPrefix) => {
        categories
            .filter((row) => row.level === 'subcategory' && row.parentSlug === parentSlug && row.slug !== 'other')
            .forEach((row) => {
                families.push({
                    key: `${keyPrefix}/${row.slug}`,
                    label: formatSlugLabel(row.slug),
                    group,
                    sortValue: row.sortValue
                });
            });
    };

    pushSubs('weapons', 'Weapons', 'weapons');
    pushSubs('head', 'Armor', 'head');
    pushSubs('armors', 'Armor', 'armors');
    pushSubs('shoes', 'Armor', 'shoes');

    categories
        .filter((row) => row.level === 'category' && ['bags', 'capes', 'offhands'].includes(row.slug))
        .forEach((row) => {
            families.push({
                key: `category/${row.slug}`,
                label: formatSlugLabel(row.slug),
                group: 'Accessories',
                sortValue: row.sortValue
            });
        });

    categories
        .filter((row) =>
            row.level === 'subcategory'
            && row.parentSlug === 'consumables'
            && ['food', 'potions'].includes(row.slug)
        )
        .forEach((row) => {
            families.push({
                key: `consumables/${row.slug}`,
                label: formatSlugLabel(row.slug),
                group: 'Consumables',
                sortValue: row.sortValue
            });
        });

    categories
        .filter((row) => row.level === 'subcategory2' && row.parentSlug === 'resources')
        .forEach((row) => {
            families.push({
                key: `resources/${row.slug}`,
                label: formatSlugLabel(row.slug),
                group: 'Resources',
                sortValue: row.sortValue
            });
        });

    const hasGatheringTools = items.some((item) =>
        item.shopCategory === 'gathering' && TOOL_SUB2.has(item.shopSubCategory2)
    );

    if (hasGatheringTools) {
        families.push({
            key: 'gathering/tool',
            label: 'Tool',
            group: 'Tools',
            sortValue: 900000
        });
    }

    const grouped = new Map();
    for (const family of families) {
        if (!grouped.has(family.group)) {
            grouped.set(family.group, []);
        }
        grouped.get(family.group).push(family);
    }

    for (const list of grouped.values()) {
        list.sort(bySort);
    }

    cachedFamilies = { families, grouped };
    return cachedFamilies;
}

export function getBonusFamilyByKey(key) {
    return getBonusFamilies().families.find((family) => family.key === key) ?? null;
}

export function getBonusFamilyLabel(key) {
    return getBonusFamilyByKey(key)?.label ?? labelForFamilyKey(key);
}
