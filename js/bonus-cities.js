import { loadCities } from './cities.js';
import { getAll } from './db/store.js';
import { labelForFamilyKey } from './bonus-families.js';
import {
    getCityApiName,
    getCityDisplayName,
    getCityShortCode,
    getItemUniqueName
} from './db/relations.js';

function parseMaterials(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value || '')
        .split(/[,/·]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function uniqueMaterials(variants) {
    const seen = new Set();
    const keys = [];

    for (const recipe of variants) {
        for (const key of recipe.materials) {
            if (!seen.has(key)) {
                seen.add(key);
                keys.push(key);
            }
        }
    }

    return keys;
}

export function formatFamilyVariants(variants) {
    return (variants || [])
        .filter((recipe) => recipe.materials?.length)
        .map((recipe) => {
            const mats = recipe.materials.join(' + ');
            return recipe.label ? `${recipe.label}: ${mats}` : mats;
        })
        .join(' | ');
}

export function parseFamilyVariants(value) {
    if (Array.isArray(value)) {
        return value
            .map((recipe) => ({
                label: String(recipe.label || '').trim(),
                materials: parseMaterials(recipe.materials)
            }))
            .filter((recipe) => recipe.materials.length);
    }

    const raw = String(value || '').trim();
    if (!raw) {
        return [];
    }

    return raw.split('|').map((part) => {
        const chunk = part.trim();
        const split = chunk.indexOf(':');
        if (split === -1) {
            return { label: '', materials: parseMaterials(chunk.replaceAll('+', ',')) };
        }

        return {
            label: chunk.slice(0, split).trim(),
            materials: parseMaterials(chunk.slice(split + 1).replaceAll('+', ','))
        };
    }).filter((recipe) => recipe.materials.length);
}

function familyRow(familyKey) {
    return getAll('bonusFamilies').find((row) => row.familyKey === familyKey) ?? null;
}

function materialKeyRow(key) {
    return getAll('materialKeys').find((row) => row.key === key) ?? null;
}

export function bonusCityApiName(familyKey) {
    const row = familyRow(familyKey);
    if (!row) {
        return null;
    }
    if (row.cityId != null && row.cityId !== '') {
        return getCityApiName(row.cityId);
    }
    // legacy string city during migration
    return row.city || null;
}

export function bonusMaterialItemId(key) {
    const row = materialKeyRow(key);
    if (!row) {
        return null;
    }
    if (typeof row.itemId === 'number' || /^\d+$/.test(String(row.itemId))) {
        return getItemUniqueName(row.itemId);
    }
    return row.itemId || null;
}

export function bonusCityLabel(familyKey) {
    const row = familyRow(familyKey);
    if (row?.cityId != null && row.cityId !== '') {
        return getCityDisplayName(row.cityId) || getCityApiName(row.cityId) || '';
    }

    const apiName = bonusCityApiName(familyKey);
    if (!apiName) {
        return '';
    }

    const city = loadCities().find((entry) => entry.marketApiName === apiName);
    return city?.displayName ?? apiName;
}

export function bonusCityShort(familyKey) {
    const row = familyRow(familyKey);
    if (row?.cityId != null && row.cityId !== '') {
        return getCityShortCode(row.cityId);
    }

    const apiName = bonusCityApiName(familyKey);
    if (!apiName) {
        return '';
    }

    const city = loadCities().find((entry) => entry.marketApiName === apiName);
    return city?.shortCode || '';
}

function familyMaterialKeys(familyKey) {
    const family = familyRow(familyKey);
    if (!family) {
        return [];
    }

    const links = getAll('bonusFamilyMaterials')
        .filter((row) => Number(row.bonusFamilyId) === Number(family.id))
        .sort((a, b) => (Number(a.sortValue) || 0) - (Number(b.sortValue) || 0));

    const byId = new Map(getAll('materialKeys').map((row) => [Number(row.id), row]));
    return links
        .map((link) => byId.get(Number(link.materialKeyId)))
        .filter(Boolean)
        .map((row) => row.key);
}

export function bonusFamilyVariants(familyKey) {
    const stored = parseFamilyVariants(familyRow(familyKey)?.variants);
    if (stored.length) {
        return stored;
    }

    const materials = familyMaterialKeys(familyKey);
    return materials.length ? [{ label: '', materials }] : [];
}

export function bonusFamilyMaterials(familyKey) {
    const variants = bonusFamilyVariants(familyKey);
    if (variants.length) {
        return uniqueMaterials(variants);
    }

    return familyMaterialKeys(familyKey);
}

export function bonusStation(familyKey) {
    const row = familyRow(familyKey);
    if (row && (row.vendor || row.journal || row.tree)) {
        return {
            tree: row.tree || '',
            treeShort: row.tree || '',
            vendor: row.vendor || '',
            vendorShort: row.vendor || '',
            journal: row.journal || ''
        };
    }

    return null;
}

function vendorImpliedByJournal(meta) {
    const journal = String(meta.journal || '').trim().toLowerCase();
    if (!journal) {
        return false;
    }

    const vendor = String(meta.vendor || '').toLowerCase();
    const tree = String(meta.tree || '').toLowerCase();
    return vendor.includes(journal) || tree === journal;
}

export function bonusStationLine(meta) {
    const bits = [];
    if (meta.vendor && !vendorImpliedByJournal(meta)) {
        bits.push(meta.vendor);
    }
    if (meta.journal) {
        bits.push(`${meta.journal} kitabı`);
    }
    return bits.join(' · ');
}

export function bonusPackParts(meta, { includeCity = true } = {}) {
    const bits = [];
    if (includeCity) {
        bits.push(meta.cityLabel || 'Şehir yok');
    }
    if (meta.variants?.length) {
        bits.push(formatFamilyVariants(meta.variants));
    } else if (meta.materialShort) {
        bits.push(meta.materialShort);
    }
    const station = bonusStationLine(meta);
    if (station) {
        bits.push(station);
    }
    return bits;
}

export function bonusPackLine(meta, options) {
    return bonusPackParts(meta, options).join(' · ');
}

export function bonusFamilyMeta(familyKey) {
    const variants = bonusFamilyVariants(familyKey);
    const materials = uniqueMaterials(variants);
    const materialShort = materials.join(' · ');
    const station = bonusStation(familyKey);
    return {
        city: bonusCityApiName(familyKey),
        cityLabel: bonusCityLabel(familyKey),
        cityShort: bonusCityShort(familyKey),
        materials,
        variants,
        materialShort,
        materialLabel: materialShort,
        tree: station?.tree ?? '',
        treeShort: station?.treeShort ?? '',
        vendor: station?.vendor ?? '',
        vendorShort: station?.vendorShort ?? '',
        journal: station?.journal ?? '',
        notes: familyRow(familyKey)?.notes || '',
        label: familyRow(familyKey)?.label || labelForFamilyKey(familyKey)
    };
}

export function cityHintText(familyKey) {
    const meta = bonusFamilyMeta(familyKey);
    if (!meta.cityLabel) {
        return '';
    }

    return bonusPackLine(meta);
}
