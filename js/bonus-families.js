import { getAll } from './db/store.js';

function formatSlugLabel(slug) {
    return String(slug || '')
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function labelForFamilyKey(key) {
    const row = getBonusFamilyByKey(key);
    if (row?.label) {
        return row.label;
    }
    const slug = String(key || '').split('/').pop();
    return formatSlugLabel(slug);
}

function bySort(a, b) {
    return (a.sortValue - b.sortValue) || a.label.localeCompare(b.label, 'tr');
}

/**
 * Daily craft/refine bonus families — managed in Veritabanı → Bonus aileleri.
 */
export function getBonusFamilies() {
    const families = getAll('bonusFamilies')
        .filter((row) => row.isActive !== false && row.familyKey)
        .map((row) => ({
            key: row.familyKey,
            label: row.label || formatSlugLabel(String(row.familyKey).split('/').pop()),
            group: row.group || 'Other',
            sortValue: Number(row.sortValue) || 0
        }));

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

    const groupOrder = ['Weapons', 'Armor', 'Accessories', 'Consumables', 'Resources', 'Gathering', 'Other'];
    const ordered = new Map();
    for (const name of groupOrder) {
        if (grouped.has(name)) {
            ordered.set(name, grouped.get(name));
        }
    }
    for (const [name, list] of grouped) {
        if (!ordered.has(name)) {
            ordered.set(name, list);
        }
    }

    return { families: families.slice().sort(bySort), grouped: ordered };
}

export function getBonusFamilyByKey(key) {
    return getAll('bonusFamilies').find((row) => row.familyKey === key) ?? null;
}

export function getBonusFamilyLabel(key) {
    return getBonusFamilyByKey(key)?.label ?? labelForFamilyKey(key);
}
