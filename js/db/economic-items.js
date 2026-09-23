// Shared item-selection rules for price and market-oriented tools.  The
// ao-bin-dumps rows currently expose shop taxonomy rather than explicit market
// and trade flags, so each check gracefully falls back to that taxonomy.

const TECHNICAL_UNIQUE_NAME = /(?:^|_)(?:UNTRADEABLE|UNLOCK|TEST|DEBUG|PROTOTYPE)(?:_|$)|UNIQUE_AVATAR|AVATARRING/i;
const TECHNICAL_TAXONOMY = /(?:^|_)(?:avatar|avatarring)(?:_|$)/i;
const MARKET_FIELDS = ['showInMarketplace', 'showinmarketplace', 'showInMarketPlace', 'marketable', 'isMarketable'];
const TRADE_FIELDS = ['tradeable', 'tradable', 'isTradeable', 'isTradable'];

function firstPresentField(item, fields) {
    return fields.find((field) => Object.hasOwn(item ?? {}, field));
}

function asBoolean(value) {
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true' || value === '1';
    return value === true || value === 1;
}

function itemValue(item, ...fields) {
    return fields.map((field) => item?.[field]).find((value) => value != null);
}

export function hasEconomicItemDisplayName(item) {
    const displayName = String(itemValue(item, 'localizedName', 'displayName', 'name') ?? '').trim();
    const uniqueName = String(itemValue(item, 'uniqueName', 'UniqueName', 'itemId') ?? '').trim();
    // The normalized source uses UniqueName as a fallback when localization is
    // absent.  That is a technical identifier, not a usable item label.
    return Boolean(displayName) && displayName !== uniqueName;
}

export function hasValidEconomicItemUniqueName(item) {
    return Boolean(String(itemValue(item, 'uniqueName', 'UniqueName', 'itemId') ?? '').trim());
}

export function isTechnicalEconomicItem(item) {
    const uniqueName = String(itemValue(item, 'uniqueName', 'UniqueName', 'itemId') ?? '');
    const taxonomy = [item?.shopCategory, item?.shopSubCategory, item?.shopSubCategory2, item?.category, item?.subcategory]
        .filter(Boolean)
        .join('_');
    const itemType = String(item?.itemType ?? item?.type ?? '').toUpperCase();

    return itemType === 'UNTRADEABLE'
        || TECHNICAL_UNIQUE_NAME.test(uniqueName)
        || TECHNICAL_TAXONOMY.test(taxonomy);
}

export function isMarketplaceEconomicItem(item) {
    const field = firstPresentField(item, MARKET_FIELDS);
    if (field) return asBoolean(item[field]);

    // ao-bin-dumps does not currently provide an explicit marketplace flag.
    return Boolean(String(item?.shopCategory ?? '').trim());
}

export function isTradeableEconomicItem(item) {
    const field = firstPresentField(item, TRADE_FIELDS);
    if (!field) return null;

    // In ao-bin-dumps, @tradable is written only for exceptions.  A normalized
    // null therefore means the game's default (tradeable), while false is an
    // explicit non-tradeable exclusion.
    return item[field] == null ? true : asBoolean(item[field]);
}

function baseEconomicItems(items) {
    return items.filter((item) =>
        hasEconomicItemDisplayName(item)
        && hasValidEconomicItemUniqueName(item)
        && !isTechnicalEconomicItem(item)
    );
}

/**
 * Returns market/economy items without tying the catalogue to a specific tool.
 * Explicit metadata wins when supplied; progressively safer fallbacks prevent a
 * changed upstream dump from leaving a selector empty.
 */
export function getSelectableEconomicItems(items) {
    const base = baseEconomicItems(items);
    const marketable = base.filter(isMarketplaceEconomicItem);
    const tradeable = marketable.filter((item) => isTradeableEconomicItem(item) === true);
    const hasTradeMetadata = marketable.some((item) => isTradeableEconomicItem(item) !== null);

    // A present false value is authoritative.  Only use the marketable
    // fallback when this particular dump has no tradeability field at all.
    if (hasTradeMetadata) return tradeable;
    if (marketable.length) return marketable;
    return base;
}

export function getEconomicItemFilterStats(items) {
    const total = items.length;
    const named = items.filter((item) => hasEconomicItemDisplayName(item) && hasValidEconomicItemUniqueName(item));
    const marketable = named.filter(isMarketplaceEconomicItem);
    const withTradeMetadata = marketable.filter((item) => isTradeableEconomicItem(item) !== null);
    const tradeable = withTradeMetadata.length
        ? marketable.filter((item) => isTradeableEconomicItem(item) === true)
        : marketable;
    const nonTechnical = tradeable.filter((item) => !isTechnicalEconomicItem(item));

    return {
        total,
        marketable: marketable.length,
        tradeable: tradeable.length,
        nonTechnical: nonTechnical.length,
        selectable: getSelectableEconomicItems(items).length
    };
}
