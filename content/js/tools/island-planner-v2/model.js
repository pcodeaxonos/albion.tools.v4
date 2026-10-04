import { itemForSlot, productionModeFor } from './items.js';
import { normalizeSalesVolume, SALES_VOLUME } from './volume.js';

const SLOT_COUNT = 16;

export function blankSlot(id) {
    return {
        id,
        item: null,
        type: null,
        tier: null,
        focus: false,
        locked: false,
        productionMode: null
    };
}

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function clamp01(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
}

export function cityKey(value) {
    return String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
}

export function normalizeSlot(entry, id) {
    const normalized = {
        ...blankSlot(id),
        ...(entry && typeof entry === 'object' ? entry : {}),
        id
    };
    normalized.locked = normalized.locked === true;
    const item = itemForSlot(normalized);

    if (!item) {
        normalized.item = null;
        normalized.type = null;
        normalized.tier = null;
        return normalized;
    }

    normalized.type = item.plotType;
    normalized.tier = item.tier;
    normalized.productionMode = productionModeFor(item, normalized.productionMode);
    return normalized;
}

export function normalizeDraft(value, islandCity, baseDraft) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        ...baseDraft,
        ...source,
        islandCity,
        minSalesVolume: normalizeSalesVolume(source.minSalesVolume ?? baseDraft.minSalesVolume ?? SALES_VOLUME.default),
        minSalesVolume: normalizeSalesVolume(source.minSalesVolume ?? baseDraft.minSalesVolume ?? SALES_VOLUME.default),
        seedSide: source.seedSide === 'fixed' ? baseDraft.seedSide : (source.seedSide ?? baseDraft.seedSide),
        harvestSide: source.harvestSide === 'fixed' ? baseDraft.harvestSide : (source.harvestSide ?? baseDraft.harvestSide),
        seedFixed: source.seedFixed ?? source.seedSide === 'fixed',
        harvestFixed: source.harvestFixed ?? source.harvestSide === 'fixed',
        slots: Array.from(
            { length: SLOT_COUNT },
            (_, index) => normalizeSlot(source.slots?.[index], `R${index + 1}`)
        )
    };
}

export function parsePlan(value) {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return null;
    }
}
