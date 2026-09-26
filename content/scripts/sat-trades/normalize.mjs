import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIL_KIND_BY_TEXT } from './constants.mjs';
import {
    csvColumns,
    csvItemName,
    csvOccurredAt,
    csvUnitPriceSilver,
    internalToSilver
} from './silver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOCATIONS_PATH = path.join(__dirname, '..', '..', 'data', 'locations.json');

/**
 * @param {string} [locationsPath]
 * @returns {Map<string, string>} clusterIndex → displayName
 */
export function loadLocationDisplayNames(locationsPath = DEFAULT_LOCATIONS_PATH) {
    const map = new Map();
    let rows;
    try {
        rows = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    } catch (error) {
        throw new Error(`locations.json okunamadı (${locationsPath}): ${error.message}`);
    }
    if (!Array.isArray(rows)) {
        return map;
    }
    for (const row of rows) {
        if (row == null || row.index == null) {
            continue;
        }
        const index = String(row.index);
        const name = row.displayName != null ? String(row.displayName) : null;
        if (name) {
            map.set(index, name);
        }
    }
    return map;
}

function emptyNormalized(partial = {}) {
    return {
        sourceId: null,
        occurredAt: null,
        kind: null,
        clusterIndex: null,
        locationName: null,
        itemId: null,
        itemName: null,
        quantity: null,
        unitPriceSilver: null,
        totalPriceSilver: null,
        taxRate: null,
        taxSetupRate: null,
        distanceFeeSilver: null,
        counterparty: null,
        characterGuid: null,
        rawType: null,
        rawMailTypeText: null,
        orderAmount: null,
        orderTotalSilver: null,
        quality: null,
        ...partial
    };
}

function resolveLocationName(clusterIndex, locationNames) {
    if (clusterIndex == null || clusterIndex === '') {
        return null;
    }
    return locationNames.get(String(clusterIndex)) ?? null;
}

function firstNonEmpty(...values) {
    for (const v of values) {
        if (v == null) {
            continue;
        }
        const s = String(v).trim();
        if (s) {
            return s;
        }
    }
    return null;
}

function normalizeMail(raw, base) {
    const mail = raw.MailContent || {};
    const mailType = raw.MailTypeText != null ? String(raw.MailTypeText) : null;
    const kind = mailType ? (MAIL_KIND_BY_TEXT[mailType] ?? null) : null;

    const isExpired = kind != null && kind.includes('expired');
    let unitPriceSilver = internalToSilver(mail.InternalUnitPricePaidWithOverpayment);
    if (isExpired || mail.InternalUnitPricePaidWithOverpayment === 0) {
        const fromCsv = csvUnitPriceSilver(raw.CsvOutput);
        if (fromCsv != null) {
            unitPriceSilver = fromCsv;
        }
    }

    return emptyNormalized({
        ...base,
        kind: kind ?? 'mail_unknown',
        itemId: mail.UniqueItemName != null ? String(mail.UniqueItemName) : null,
        itemName: csvItemName(raw.CsvOutput),
        quantity: mail.UsedQuantity != null ? Number(mail.UsedQuantity) : null,
        unitPriceSilver,
        totalPriceSilver: internalToSilver(mail.InternalTotalPriceWithoutTax),
        taxRate: mail.TaxRate != null ? Number(mail.TaxRate) : null,
        taxSetupRate: mail.TaxSetupRate != null ? Number(mail.TaxSetupRate) : null,
        distanceFeeSilver: internalToSilver(mail.InternalTotalDistanceFee) ?? 0,
        characterGuid: raw.Guid != null ? String(raw.Guid) : null,
        rawMailTypeText: mailType
    });
}

function normalizeInstant(raw, base, kind) {
    const instant = raw.InstantBuySellContent || {};
    const auction = raw.AuctionEntry || {};
    const quantity = instant.Quantity != null ? Number(instant.Quantity) : null;
    const unitPriceSilver = internalToSilver(instant.InternalUnitPrice);
    let totalPriceSilver = null;
    if (unitPriceSilver != null && quantity != null && Number.isFinite(quantity)) {
        totalPriceSilver = unitPriceSilver * quantity;
    }

    const counterparty = kind === 'instant_buy'
        ? firstNonEmpty(auction.SellerName, auction.BuyerName)
        : firstNonEmpty(auction.BuyerName, auction.SellerName);

    return emptyNormalized({
        ...base,
        kind,
        itemId: auction.ItemTypeId != null ? String(auction.ItemTypeId) : null,
        itemName: csvItemName(raw.CsvOutput),
        quantity,
        unitPriceSilver,
        totalPriceSilver,
        taxRate: instant.TaxRate != null ? Number(instant.TaxRate) : null,
        taxSetupRate: null,
        distanceFeeSilver: internalToSilver(instant.InternalDistanceFee) ?? 0,
        counterparty,
        characterGuid: raw.Guid != null ? String(raw.Guid) : null,
        orderAmount: auction.Amount != null ? Number(auction.Amount) : null,
        orderTotalSilver: internalToSilver(auction.TotalPriceSilver),
        quality: auction.QualityLevel != null ? Number(auction.QualityLevel) : null
    });
}

function normalizeCrafting(raw, base) {
    const instant = raw.InstantBuySellContent || {};
    const quantity = instant.Quantity != null ? Number(instant.Quantity) : null;
    const unitPriceSilver = internalToSilver(instant.InternalUnitPrice);
    let totalPriceSilver = null;
    if (unitPriceSilver != null && quantity != null && Number.isFinite(quantity)) {
        totalPriceSilver = unitPriceSilver * quantity;
    }

    return emptyNormalized({
        ...base,
        kind: 'crafting',
        itemId: null,
        itemName: csvItemName(raw.CsvOutput),
        quantity,
        unitPriceSilver,
        totalPriceSilver,
        taxRate: instant.TaxRate != null ? Number(instant.TaxRate) : null,
        distanceFeeSilver: internalToSilver(instant.InternalDistanceFee) ?? 0,
        characterGuid: raw.Guid != null ? String(raw.Guid) : null
    });
}

function normalizePlayer(raw, base, kind) {
    const player = raw.PlayerTradeContent || {};
    const quantity = player.Quantity != null ? Number(player.Quantity) : null;
    const isSilver = player.IsSilver === true;
    const totalPriceSilver = isSilver
        ? internalToSilver(player.InternalSilver)
        : null;
    const unitPriceSilver = isSilver && totalPriceSilver != null && quantity
        ? totalPriceSilver / quantity
        : null;

    const cols = csvColumns(raw.CsvOutput);
    const csvName = csvItemName(raw.CsvOutput);
    let itemId = null;
    let itemName = null;
    if (isSilver) {
        itemId = null;
        itemName = csvName === 'Silver' ? 'Silver' : csvName;
    } else {
        // Nested item id is absent; CSV col4 may be UniqueName or display name.
        itemName = csvName;
        if (csvName && /^[A-Z0-9_@]+$/i.test(csvName) && csvName.includes('_')) {
            itemId = csvName;
        }
    }

    return emptyNormalized({
        ...base,
        kind,
        itemId,
        itemName,
        quantity,
        unitPriceSilver,
        totalPriceSilver,
        counterparty: player.PartnerName != null ? String(player.PartnerName) : null,
        characterGuid: raw.Guid != null ? String(raw.Guid) : null
    });
}

/**
 * Normalize one raw SAT trade record.
 * Never throws for missing fields; unknown types still produce a record with kind null/unknown.
 *
 * @param {object} raw
 * @param {Map<string, string>} locationNames
 */
export function normalizeTrade(raw, locationNames = new Map()) {
    try {
        const clusterIndex = raw?.ClusterIndex == null || raw.ClusterIndex === ''
            ? null
            : String(raw.ClusterIndex);

        const base = {
            sourceId: raw?.Id != null ? raw.Id : null,
            occurredAt: csvOccurredAt(raw?.CsvOutput),
            clusterIndex,
            locationName: resolveLocationName(clusterIndex, locationNames),
            rawType: raw?.Type != null ? Number(raw.Type) : null,
            rawMailTypeText: raw?.MailTypeText != null ? String(raw.MailTypeText) : null
        };

        const type = Number(raw?.Type);

        if (type === 1) {
            return normalizeMail(raw, base);
        }
        if (type === 2) {
            return normalizeInstant(raw, base, 'instant_sell');
        }
        if (type === 3) {
            return normalizeInstant(raw, base, 'instant_buy');
        }
        if (type === 6) {
            return normalizeCrafting(raw, base);
        }
        if (type === 7) {
            return normalizePlayer(raw, base, 'player_in');
        }
        if (type === 8) {
            return normalizePlayer(raw, base, 'player_out');
        }

        return emptyNormalized({
            ...base,
            kind: type != null && !Number.isNaN(type) ? `unknown_type_${type}` : 'unknown',
            itemName: csvItemName(raw?.CsvOutput),
            characterGuid: raw?.Guid != null ? String(raw.Guid) : null
        });
    } catch {
        return emptyNormalized({
            sourceId: raw?.Id != null ? raw.Id : null,
            kind: 'normalize_error',
            rawType: raw?.Type != null ? Number(raw.Type) : null
        });
    }
}

/**
 * @param {object[]} records
 * @param {Map<string, string>} [locationNames]
 */
export function normalizeTrades(records, locationNames = new Map()) {
    if (!Array.isArray(records)) {
        return [];
    }
    const out = new Array(records.length);
    for (let i = 0; i < records.length; i += 1) {
        out[i] = normalizeTrade(records[i], locationNames);
    }
    return out;
}
