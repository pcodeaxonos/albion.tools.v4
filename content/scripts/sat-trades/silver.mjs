import { SILVER_SCALE } from './constants.mjs';

/**
 * Convert Albion internal silver units to display silver.
 * Always divides by SILVER_SCALE (does not round non-multiples away).
 */
export function internalToSilver(value) {
    if (value == null || value === '') {
        return null;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return null;
    }
    return n / SILVER_SCALE;
}

export function csvColumns(csvOutput) {
    if (typeof csvOutput !== 'string' || !csvOutput) {
        return [];
    }
    return csvOutput.split(';');
}

export function csvOccurredAt(csvOutput) {
    const iso = csvColumns(csvOutput)[0];
    if (!iso) {
        return null;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : iso;
}

export function csvKind(csvOutput) {
    return csvColumns(csvOutput)[3] || null;
}

export function csvItemName(csvOutput) {
    const name = csvColumns(csvOutput)[4];
    return name ? name : null;
}

export function csvUnitPriceSilver(csvOutput) {
    const raw = csvColumns(csvOutput)[10];
    if (raw == null || raw === '') {
        return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/**
 * Stable identity for duplicate detection.
 * Prefer Id; fall back to a composite that stays unique within a snapshot.
 */
export function tradeIdentity(raw) {
    if (raw == null) {
        return null;
    }
    if (raw.Id != null && raw.Id !== '') {
        return `id:${raw.Id}`;
    }
    const csv = typeof raw.CsvOutput === 'string' ? raw.CsvOutput : '';
    const type = raw.Type ?? '';
    const guid = raw.Guid ?? '';
    const cluster = raw.ClusterIndex ?? '';
    if (!csv && type === '' && !guid) {
        return null;
    }
    return `fb:${type}|${cluster}|${guid}|${csv}`;
}
