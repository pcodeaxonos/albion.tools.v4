import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { getSettings, getStandardCombos, getDefaultCity } from '../core/settings.js';
import {
    fetchPrices,
    indexPrices,
    cityRow,
    priceRefreshActionsHtml,
    bindPriceRefresh,
    priceLoaderMessage,
    applyPriceLoadMode
} from '../core/market.js';
import { itemIconHtml } from '../components/item-icon.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { initFloatingLabels } from '../components/forms.js';
import { initTableSort, parseSortNumber, sortHeaderHtml } from '../utils/table-sort.js';
import { purchaseCost, saleProceeds, placesOrder, feeMetaText, SETUP_FEE, salesTaxRate } from '../core/market-fees.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { bindLivePrices } from '../core/price-live.js';
import { loadActiveCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField, setCityFieldValue } from '../components/city-picker.js';
import {
    getCraftRecipes,
    cityProductionBonus,
    getEnchantSlots,
    getEnchantSteps
} from '../core/catalog.js';
import {
    quoteFromRow,
    priceSideHint,
    priceSideToggleHtml,
    priceFieldHtml,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from '../core/price-side.js';
import {
    bindCalcExplain,
    refreshCalcExplain,
    calcExplainShell,
    explainNum,
    explainOp,
    explainStep,
    explainChips,
    explainFlow,
    explainSaleSteps,
    explainProfitFoot,
    explainPanelHtml,
    explainEmptyHtml,
    explainHint
} from '../utils/calc-explain.js';

const PREFS_KEY = 'albiontools.v4.royal.prefs';
const TIERS = [4, 5, 6, 7, 8];
const ENCHANTS = [1, 2, 3];
/** SET buy-order path always uses Excellent (quality 4). Sell quality is separate. */
const SET_BUY_QUALITY = 4;
/** One sealed bag price used as sigil unit for every tier when sealed mode is on. */
const SEALED_ROYAL_SIGIL = 'T4_LOOTBAG_EXPEDITION_ROYAL_SIGIL';
const SEALED_SIGIL_KEY = 'sigil:sealed';
const QUALITIES = [
    { id: 4, label: 'Excellent', short: 'Ex' },
    { id: 5, label: 'Masterpiece', short: 'MP' }
];
/** Refined mats for SET craft-from-mats (same qty as game: armor 16, head/shoes 8). */
const REFINED_KINDS = [
    { kind: 'bar', stem: 'METALBAR', label: 'Bar' },
    { kind: 'leather', stem: 'LEATHER', label: 'Leather' },
    { kind: 'cloth', stem: 'CLOTH', label: 'Cloth' }
];
/** Craft-plan station boxes (one building each). */
const PLAN_STATIONS = [
    { id: 'plate', label: 'Plate' },
    { id: 'cloth', label: 'Cloth' },
    { id: 'leather', label: 'Leather' }
];
const PLAN_STATION_LIMIT = 6;

const state = {
    premium: true,
    matSide: 'buy',
    itemSide: 'sell',
    buyCity: getDefaultCity(),
    sellCity: getDefaultCity(),
    type: 'all',
    slot: 'all',
    quality: 'both',
    scope: 'standard',
    tier: 'all',
    sealedSigil: false,
    setPath: 'min',
    cities: [],
    priceIndex: null,
    manualMats: {},
    manualItems: {},
    wizardRecent: [],
    wizardPriceState: new Map(),
    error: null,
    loaded: false,
    livePaused: false,
    sort: { key: 'priority', direction: 'asc' }
};

function fallbackCity(cities = state.cities) {
    const preferred = getDefaultCity();
    if (cities.some((city) => city.marketApiName === preferred)) {
        return preferred;
    }
    return cities[0]?.marketApiName ?? preferred;
}

function recipes() {
    return getCraftRecipes({ tool: 'royal' });
}

function steps() {
    return getEnchantSteps();
}

function slots() {
    return getEnchantSlots();
}

function cityLabel(apiName) {
    return state.cities.find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

function parseKind(kind) {
    const [type, slot] = String(kind || '').split('-');
    return { type: type || '', slot: slot || '' };
}

function enchantSlotCode(kind) {
    const { slot } = parseKind(kind);
    return slot === 'armor' ? 'armor' : 'light';
}

function enchantSlotQty(kind) {
    const code = enchantSlotCode(kind);
    return slots().find((slot) => slot.id === code)?.qty ?? (code === 'armor' ? 192 : 96);
}

function setVariants(setUniqueName) {
    if (!setUniqueName || !/_SET1$/.test(setUniqueName)) {
        return setUniqueName ? [setUniqueName] : [];
    }
    return [1, 2, 3].map((n) => setUniqueName.replace(/_SET1$/, `_SET${n}`));
}

function royalUniqueName(base, enchant) {
    if (!base) {
        return null;
    }
    return enchant > 0 ? `${base}@${enchant}` : base;
}

function recipeLines(recipe) {
    const setLine = recipe.lines.find((line) => /_SET\d+$/.test(line.uniqueName || ''));
    const sigilLine = recipe.lines.find((line) => String(line.uniqueName || '').includes('TOKEN_ROYAL'));
    return { setLine, sigilLine };
}

/** Materials to craft the flat SET piece used by a royal recipe (classic armor craft). */
function setCraftSpec(kind, tier) {
    const { type, slot } = parseKind(kind);
    const refined = REFINED_KINDS.find((row) => {
        if (type === 'plate') {
            return row.kind === 'bar';
        }
        return row.kind === type;
    });
    if (!refined || !tier) {
        return null;
    }
    return {
        kind: refined.kind,
        stem: refined.stem,
        label: refined.label,
        uniqueName: `T${tier}_${refined.stem}`,
        qty: slot === 'armor' ? 16 : 8,
        key: `refined:${refined.kind}-${tier}`
    };
}

function standardTierOptions() {
    const fromStandards = [...new Set(getStandardCombos().map((combo) => Number(combo.tier)))]
        .filter((tier) => TIERS.includes(tier))
        .sort((a, b) => a - b);
    const tiers = fromStandards.length ? fromStandards : TIERS.slice();
    return [
        { id: 'all', label: 'Hepsi' },
        ...tiers.map((tier) => ({ id: String(tier), label: String(tier) }))
    ];
}

function normalizeTierFilter(value) {
    if (value == null || value === 'all') {
        return 'all';
    }
    const tier = Number(value);
    if (!TIERS.includes(tier)) {
        return 'all';
    }
    const allowed = new Set(standardTierOptions().map((option) => option.id));
    return allowed.has(String(tier)) ? tier : 'all';
}

function filteredRecipes() {
    return recipes().filter((recipe) => {
        const { type, slot } = parseKind(recipe.kind);
        if (state.type !== 'all' && type !== state.type) {
            return false;
        }
        if (state.slot !== 'all' && slot !== state.slot) {
            return false;
        }
        if (state.tier !== 'all' && recipe.tier !== Number(state.tier)) {
            return false;
        }
        return true;
    });
}

function selectedQualities() {
    if (state.quality === '4') {
        return [QUALITIES[0]];
    }
    if (state.quality === '5') {
        return [QUALITIES[1]];
    }
    return QUALITIES.slice();
}

function matKey(kind, tier) {
    return `${kind}-${tier}`;
}

function enchantMatUniqueName(kind, tier) {
    const step = steps().find((row) => row.kind === kind);
    return step ? `T${tier}_${step.itemType}` : null;
}

function shortItemName(label) {
    return String(label || '')
        .replace(/^(Adept|Expert|Master|Grandmaster|Elder)'s\s+/i, '')
        .trim();
}

function allPriceIds() {
    const ids = new Set();
    ids.add(SEALED_ROYAL_SIGIL);
    for (const tier of TIERS) {
        ids.add(`QUESTITEM_TOKEN_ROYAL_T${tier}`);
        for (const refined of REFINED_KINDS) {
            ids.add(`T${tier}_${refined.stem}`);
        }
        for (const step of steps()) {
            ids.add(enchantMatUniqueName(step.kind, tier));
        }
    }
    for (const recipe of filteredRecipes()) {
        const { setLine } = recipeLines(recipe);
        for (const setId of setVariants(setLine?.uniqueName)) {
            ids.add(setId);
        }
        for (const enchant of ENCHANTS) {
            ids.add(royalUniqueName(recipe.uniqueName, enchant));
        }
    }
    return [...ids].filter(Boolean);
}

function formatSilver(value, { signed = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const text = Math.round(value).toLocaleString('tr-TR');
    if (signed && value > 0) {
        return `+${text}`;
    }
    return text;
}

function formatPct(ratio) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    return `${Math.round(ratio * 100).toLocaleString('tr-TR')}%`;
}

function formatDateTime(iso) {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}.${mm} ${hh}:${min}`;
}

function parsePrice(raw) {
    if (raw == null) {
        return null;
    }
    const value = parseSortNumber(raw);
    return value != null && value >= 0 ? value : null;
}

function isManualPrice(raw) {
    return parsePrice(raw) != null;
}

function productionBonus() {
    return cityProductionBonus();
}

function returnRate() {
    const bonus = productionBonus();
    return bonus / (100 + bonus);
}

function manualQuote(price, side, intent) {
    return {
        price,
        book: price,
        date: null,
        side,
        intent,
        tick: 0,
        setup: placesOrder(intent, side),
        manual: true
    };
}

function fetchedQuote(uniqueName, city, side, intent, quality = 1) {
    if (!uniqueName || !state.priceIndex) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, uniqueName, city, quality), side, intent);
}

function matQuote(key, uniqueName, quality = 1) {
    const parsed = parsePrice(state.manualMats[key]);
    if (parsed != null) {
        return manualQuote(parsed, state.matSide, 'buy');
    }
    return fetchedQuote(uniqueName, state.buyCity, state.matSide, 'buy', quality);
}

function itemQuote(key, uniqueName, quality) {
    const parsed = parsePrice(state.manualItems[key]);
    if (parsed != null) {
        return manualQuote(parsed, state.itemSide, 'sell');
    }
    return fetchedQuote(uniqueName, state.sellCity, state.itemSide, 'sell', quality);
}

/** Royal sell: if Ex/MP missing, use the other quality price and mark as proxy. */
function sellQuoteForQuality(sellId, quality) {
    const key = `sell:${sellId}|q${quality.id}`;
    const direct = itemQuote(key, sellId, quality.id);
    if (direct) {
        return { quote: direct, proxyQuality: null };
    }
    if (quality.id !== 4 && quality.id !== 5) {
        return { quote: null, proxyQuality: null };
    }
    const other = QUALITIES.find((row) => row.id !== quality.id);
    if (!other) {
        return { quote: null, proxyQuality: null };
    }
    const otherKey = `sell:${sellId}|q${other.id}`;
    const fallback = itemQuote(otherKey, sellId, other.id);
    if (!fallback) {
        return { quote: null, proxyQuality: null };
    }
    return {
        quote: fallback,
        proxyQuality: other
    };
}

function cheapestSet(setBase, quality) {
    let best = null;
    for (const uniqueName of setVariants(setBase)) {
        const key = `set:${uniqueName}|q${quality}`;
        const quote = matQuote(key, uniqueName, quality);
        if (!quote) {
            continue;
        }
        if (!best || quote.price < best.quote.price) {
            best = { uniqueName, quote, key };
        }
    }
    return best;
}

/** SET1/2/3 with buy quotes, cheapest → most expensive (unpriced last). */
function setVariantsByPrice(setBase, quality = SET_BUY_QUALITY) {
    return setVariants(setBase)
        .map((uniqueName) => {
            const key = `set:${uniqueName}|q${quality}`;
            const quote = matQuote(key, uniqueName, quality);
            return {
                uniqueName,
                key,
                quote,
                price: quote?.price ?? null
            };
        })
        .sort((a, b) => {
            if (a.price == null && b.price == null) {
                return a.uniqueName.localeCompare(b.uniqueName);
            }
            if (a.price == null) {
                return 1;
            }
            if (b.price == null) {
                return -1;
            }
            return a.price - b.price || a.uniqueName.localeCompare(b.uniqueName);
        });
}

function setVariantIconsHtml(setBase) {
    const variants = setVariantsByPrice(setBase);
    if (!variants.length) {
        return '';
    }
    const icons = variants.map((row) => {
        const label = setLabel(row.uniqueName);
        const price = row.price != null ? formatSilver(row.price) : 'fiyat yok';
        return `
            <span class="royal-set-icon-wrap${row.price == null ? ' is-missing' : ''}" title="${escapeHtml(`${label} · ${price}`)}">
                ${itemIconHtml(row.uniqueName, { className: 'item-icon royal-set-icon', size: 18 })}
            </span>
        `;
    }).join('');
    return `<span class="royal-item-sets" aria-label="SET ucuzdan pahalıya">${icons}</span>`;
}

function craftMatIconHtml(row) {
    const spec = row.craftSpec;
    if (!spec?.uniqueName) {
        return '';
    }
    const title = `${spec.label} · T${row.recipe.tier} · ${spec.qty} adet`;
    return `
        <span class="royal-item-mat" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
            ${itemIconHtml(spec.uniqueName, { className: 'item-icon royal-item-mat-icon', size: 48 })}
        </span>
    `;
}

function enchantCost(tier, toEnchant, kind) {
    if (toEnchant <= 0) {
        return 0;
    }
    const qty = enchantSlotQty(kind);
    let total = 0;
    for (const step of steps()) {
        if (step.from >= 0 && step.to <= toEnchant) {
            const uniqueName = enchantMatUniqueName(step.kind, tier);
            const key = matKey(step.kind, tier);
            const quote = matQuote(key, uniqueName, 1);
            if (!quote) {
                return null;
            }
            total += quote.price * qty;
        }
    }
    return total;
}

function standardRank(tier, enchant) {
    const index = getStandardCombos().findIndex((combo) => combo.tier === tier && combo.enchant === enchant);
    return index >= 0 ? index : null;
}

function isStandardRow(tier, enchant) {
    return standardRank(tier, enchant) != null;
}

function buildRow(recipe, enchant, quality) {
    const { setLine, sigilLine } = recipeLines(recipe);
    const matSetup = placesOrder('buy', state.matSide);
    const rr = returnRate();
    const keep = 1 - rr;

    // SET buy: Excellent only, cheapest SET1/2/3, purchaseCost — no MP buy for SET.
    const setPick = cheapestSet(setLine?.uniqueName, SET_BUY_QUALITY);
    const setBuyRaw = setPick && setLine ? setPick.quote.price * setLine.qty : null;
    const setBuy = setBuyRaw == null ? null : purchaseCost(setBuyRaw, { setup: matSetup });

    // SET craft-from-mats: refined × qty × (1 − cityRR), then purchaseCost. Royal craft itself has no RR.
    const craftSpec = setCraftSpec(recipe.kind, recipe.tier);
    const craftMatQuote = craftSpec
        ? matQuote(craftSpec.key, craftSpec.uniqueName, 1)
        : null;
    const setMatRaw = craftSpec && craftMatQuote
        ? craftMatQuote.price * craftSpec.qty
        : null;
    const setCraftKeep = setMatRaw == null ? null : setMatRaw * keep;
    const setCraft = setCraftKeep == null
        ? null
        : purchaseCost(setCraftKeep, { setup: matSetup });

    let setCost = null;
    let setSource = null;
    const path = state.setPath === 'craft' || state.setPath === 'buy' ? state.setPath : 'min';
    if (path === 'craft') {
        if (setCraft != null) {
            setCost = setCraft;
            setSource = 'craft';
        }
    } else if (path === 'buy') {
        if (setBuy != null) {
            setCost = setBuy;
            setSource = 'buy';
        }
    } else if (setCraft != null && setBuy != null) {
        if (setBuy <= setCraft) {
            setCost = setBuy;
            setSource = 'buy';
        } else {
            setCost = setCraft;
            setSource = 'craft';
        }
    } else if (setCraft != null) {
        setCost = setCraft;
        setSource = 'craft';
    } else if (setBuy != null) {
        setCost = setBuy;
        setSource = 'buy';
    }

    let setCheaper = null;
    if (setCraft != null && setBuy != null) {
        setCheaper = setBuy <= setCraft ? 'buy' : 'craft';
    } else if (setCraft != null) {
        setCheaper = 'craft';
    } else if (setBuy != null) {
        setCheaper = 'buy';
    }

    const setDisplay = setSource === 'craft'
        ? setCraftKeep
        : setSource === 'buy'
            ? setBuyRaw
            : null;

    // Sigil: full cost, no RR. Sealed mode uses one sealed bag unit price × recipe qty for every tier.
    const sigilQty = sigilLine?.qty ?? null;
    const sigilUnique = state.sealedSigil
        ? SEALED_ROYAL_SIGIL
        : (sigilLine?.uniqueName || null);
    const sigilKey = state.sealedSigil
        ? SEALED_SIGIL_KEY
        : `sigil:${sigilLine?.uniqueName || recipe.tier}`;
    const sigilQuote = sigilUnique
        ? matQuote(sigilKey, sigilUnique, 1)
        : null;
    const sigilRaw = sigilQuote && sigilQty != null ? sigilQuote.price * sigilQty : null;
    const sigilCost = sigilRaw == null
        ? null
        : purchaseCost(sigilRaw, { setup: matSetup });

    const enchantRaw = enchantCost(recipe.tier, enchant, recipe.kind);
    const enchantBuy = enchantRaw == null
        ? null
        : purchaseCost(enchantRaw, { setup: matSetup });

    const cost = setCost != null && sigilCost != null && enchantBuy != null
        ? setCost + sigilCost + enchantBuy
        : null;

    const sellId = royalUniqueName(recipe.uniqueName, enchant);
    const sellKey = `sell:${sellId}|q${quality.id}`;
    const { quote: sellQuote, proxyQuality } = sellQuoteForQuality(sellId, quality);
    const sell = sellQuote
        ? saleProceeds(sellQuote.price, { premium: state.premium, setup: sellQuote.setup })
        : null;
    const profit = cost != null && sell != null ? sell - cost : null;
    const pct = profit != null && cost > 0 ? profit / cost : null;
    const rank = standardRank(recipe.tier, enchant);

    return {
        id: `${recipe.code}|${enchant}|${quality.id}`,
        recipe,
        enchant,
        quality,
        tierEnchant: `${recipe.tier}.${enchant}`,
        setPick,
        setLine,
        sigilLine,
        craftSpec,
        craftMatQuote,
        setMatRaw,
        setCraftKeep,
        setCraft,
        setBuyRaw,
        setBuy,
        setCost,
        setDisplay,
        setSource,
        setCheaper,
        sealedSigil: state.sealedSigil,
        sigilUnique,
        sigilRaw,
        sigilQty,
        sigilCost,
        enchantRaw,
        enchantBuy,
        cost,
        sellQuote,
        sellProxyQuality: proxyQuality,
        sell,
        profit,
        pct,
        rr,
        matSetup,
        standard: rank != null,
        priority: rank != null ? rank : 1000 + recipe.tier * 10 + enchant,
        sellId,
        sellKey,
        setKey: setPick?.key,
        sigilKey,
        date: sellQuote?.date || setPick?.quote?.date || sigilQuote?.date || craftMatQuote?.date || null
    };
}

function setLabel(uniqueName) {
    const match = String(uniqueName || '').match(/_SET(\d+)$/);
    return match ? `SET${match[1]}` : (uniqueName || '—');
}

function rows() {
    const list = [];
    const standardOnly = state.scope !== 'all';
    for (const recipe of filteredRecipes()) {
        for (const enchant of ENCHANTS) {
            if (standardOnly && standardRank(recipe.tier, enchant) == null) {
                continue;
            }
            for (const quality of selectedQualities()) {
                list.push(buildRow(recipe, enchant, quality));
            }
        }
    }
    return list;
}

function sortedRows() {
    const list = rows();
    if (state.sort.key === 'priority') {
        return list.sort((a, b) => a.priority - b.priority
            || a.recipe.sortValue - b.recipe.sortValue
            || a.quality.id - b.quality.id);
    }
    return list;
}

function ensureManualMaps() {
    if (!(SEALED_SIGIL_KEY in state.manualMats)) {
        state.manualMats[SEALED_SIGIL_KEY] = null;
    }
    for (const tier of TIERS) {
        const sigilKey = `sigil:QUESTITEM_TOKEN_ROYAL_T${tier}`;
        if (!(sigilKey in state.manualMats)) {
            state.manualMats[sigilKey] = null;
        }
        for (const refined of REFINED_KINDS) {
            const key = `refined:${refined.kind}-${tier}`;
            if (!(key in state.manualMats)) {
                state.manualMats[key] = null;
            }
        }
        for (const step of steps()) {
            const key = matKey(step.kind, tier);
            if (!(key in state.manualMats)) {
                state.manualMats[key] = null;
            }
        }
    }
    for (const recipe of filteredRecipes()) {
        const { setLine } = recipeLines(recipe);
        for (const setId of setVariants(setLine?.uniqueName)) {
            const key = `set:${setId}|q${SET_BUY_QUALITY}`;
            if (!(key in state.manualMats)) {
                state.manualMats[key] = null;
            }
        }
        for (const quality of selectedQualities()) {
            for (const enchant of ENCHANTS) {
                const sellId = royalUniqueName(recipe.uniqueName, enchant);
                const sellKey = `sell:${sellId}|q${quality.id}`;
                if (!(sellKey in state.manualItems)) {
                    state.manualItems[sellKey] = null;
                }
            }
        }
    }
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed.buyCity === 'string') {
            state.buyCity = parsed.buyCity;
        }
        if (typeof parsed.sellCity === 'string') {
            state.sellCity = parsed.sellCity;
        }
        if (parsed.type) {
            state.type = parsed.type;
        }
        if (parsed.slot) {
            state.slot = parsed.slot;
        }
        if (parsed.quality) {
            state.quality = parsed.quality;
        }
        if (parsed.scope === 'all' || parsed.scope === 'standard') {
            state.scope = parsed.scope;
        }
        if (parsed.tier != null) {
            state.tier = normalizeTierFilter(parsed.tier);
        }
        if (parsed.matSide) {
            state.matSide = parsed.matSide;
        }
        if (parsed.itemSide) {
            state.itemSide = parsed.itemSide;
        }
        if (parsed.premium != null) {
            state.premium = Boolean(parsed.premium);
        }
        if (parsed.sealedSigil != null) {
            state.sealedSigil = Boolean(parsed.sealedSigil);
        }
        if (parsed.setPath === 'min' || parsed.setPath === 'craft' || parsed.setPath === 'buy') {
            state.setPath = parsed.setPath;
        }
    } catch {
        // ignore
    }
}

function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
        buyCity: state.buyCity,
        sellCity: state.sellCity,
        type: state.type,
        slot: state.slot,
        quality: state.quality,
        scope: state.scope,
        tier: state.tier,
        matSide: state.matSide,
        itemSide: state.itemSide,
        premium: state.premium,
        sealedSigil: state.sealedSigil,
        setPath: state.setPath
    }));
}

function renderToggle(options, selected, dataAttr) {
    return options.map((option) => {
        const id = String(option.id);
        const pressed = id === String(selected);
        return `
            <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                data-${dataAttr}="${escapeHtml(id)}" aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function sealedMatCard() {
    return {
        key: SEALED_SIGIL_KEY,
        uniqueName: SEALED_ROYAL_SIGIL,
        quality: 1
    };
}

function stripMatKinds() {
    const kinds = [
        ...REFINED_KINDS.map((refined) => ({
            kind: refined.kind,
            label: refined.label,
            cells: TIERS.map((tier) => ({
                tier,
                key: `refined:${refined.kind}-${tier}`,
                uniqueName: `T${tier}_${refined.stem}`,
                quality: 1
            }))
        })),
        ...steps().map((step) => ({
            kind: step.kind,
            label: step.label,
            cells: TIERS.map((tier) => ({
                tier,
                key: matKey(step.kind, tier),
                uniqueName: enchantMatUniqueName(step.kind, tier),
                quality: 1
            }))
        })),
        {
            kind: 'sigil',
            label: 'Sigil',
            cells: TIERS.map((tier) => ({
                tier,
                key: `sigil:QUESTITEM_TOKEN_ROYAL_T${tier}`,
                uniqueName: `QUESTITEM_TOKEN_ROYAL_T${tier}`,
                quality: 1
            }))
        }
    ];
    return kinds;
}

function renderSealedMatField() {
    const mat = sealedMatCard();
    const fetched = matQuote(mat.key, mat.uniqueName, mat.quality);
    const active = state.sealedSigil ? ' is-active' : '';
    return `
        <div class="royal-sealed-field${active}" data-mat-card="${escapeHtml(mat.key)}">
            ${priceFieldHtml({
                id: `royalMat-${mat.key}`,
                label: 'Sealed',
                value: priceInputValue(state.manualMats[mat.key], fetched?.price),
                manual: isManualPrice(state.manualMats[mat.key]),
                missing: !fetched,
                date: fetched?.date,
                dataAttr: `data-mat-price="${escapeHtml(mat.key)}"`,
                fieldClass: 'farming-price-field royal-price-field',
                iconId: mat.uniqueName
            })}
        </div>
    `;
}

function renderMatStrip() {
    const kinds = stripMatKinds();
    return `
        <div class="royal-mats" id="royalMats">
            <p class="royal-mats-meta" id="royalMatsMeta">${escapeHtml(priceSideHint(state.matSide, 'buy'))} · ${escapeHtml(cityLabel(state.buyCity))}${state.sealedSigil ? ' · sealed tüm tier’lar' : ''}</p>
            <div class="royal-mats-grid" style="--royal-mat-cols: ${TIERS.length}">
                <div class="royal-mat-corner" aria-hidden="true"></div>
                ${TIERS.map((tier) => `<div class="royal-mat-tier-head">T${tier}</div>`).join('')}
                ${kinds.map((kind) => `
                    <div class="royal-mat-kind">${escapeHtml(kind.label)}</div>
                    ${kind.cells.map((mat) => {
                        const fetched = matQuote(mat.key, mat.uniqueName, mat.quality);
                        return `
                            <div class="royal-mat" data-mat-card="${escapeHtml(mat.key)}">
                                ${priceFieldHtml({
                                    id: `royalMat-${mat.key}`,
                                    label: 'Fiyat',
                                    value: priceInputValue(state.manualMats[mat.key], fetched?.price),
                                    manual: isManualPrice(state.manualMats[mat.key]),
                                    missing: !fetched,
                                    date: fetched?.date,
                                    dataAttr: `data-mat-price="${escapeHtml(mat.key)}"`,
                                    fieldClass: 'farming-price-field royal-price-field',
                                    iconId: mat.uniqueName
                                })}
                            </div>
                        `;
                    }).join('')}
                `).join('')}
            </div>
        </div>
    `;
}

function patchMatStrip(container) {
    const meta = container.querySelector('#royalMatsMeta');
    if (meta) {
        meta.textContent = `${priceSideHint(state.matSide, 'buy')} · ${cityLabel(state.buyCity)}${state.sealedSigil ? ' · sealed tüm tier’lar' : ''}`;
    }
    const mats = [
        sealedMatCard(),
        ...stripMatKinds().flatMap((kind) => kind.cells)
    ];
    for (const mat of mats) {
        const card = container.querySelector(`[data-mat-card="${mat.key}"]`);
        if (!card) {
            continue;
        }
        const fetched = matQuote(mat.key, mat.uniqueName, mat.quality);
        applyPriceFieldState(card.querySelector('.farming-price-field'), {
            manual: isManualPrice(state.manualMats[mat.key]),
            missing: !fetched,
            date: fetched?.date,
            displayValue: priceInputValue(state.manualMats[mat.key], fetched?.price)
        });
        if (mat.key === SEALED_SIGIL_KEY) {
            card.classList.toggle('is-active', state.sealedSigil);
        }
    }
}

function remountMatStrip(container) {
    const mats = container.querySelector('#royalMats');
    if (!mats) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderMatStrip();
    mats.replaceWith(wrap.querySelector('#royalMats'));
    bindPriceInputs(container);
}

function profitClass(profit) {
    if (!Number.isFinite(profit)) {
        return '';
    }
    return profit >= 0 ? ' is-profit' : ' is-loss';
}

function sortDir(key) {
    return state.sort.key === key ? state.sort.direction : null;
}

function setCheaperTag(cheaper) {
    if (cheaper !== 'craft' && cheaper !== 'buy') {
        return '<span class="royal-path-tag is-missing">—</span>';
    }
    const label = cheaper === 'craft' ? 'Craft' : 'Buy';
    return `<span class="royal-path-tag is-${cheaper}">${label}</span>`;
}

function renderTable(list) {
    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped calc-table royal-table">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Eşya', { key: 'item', type: 'text', className: 'royal-col-item', direction: sortDir('item') })}
                        ${sortHeaderHtml('T.E', { key: 'te', type: 'text', className: 'num royal-col-te', direction: sortDir('te') })}
                        ${sortHeaderHtml('Kalite', { key: 'quality', type: 'text', className: 'royal-col-quality', direction: sortDir('quality') })}
                        ${sortHeaderHtml('SET', { key: 'set', type: 'number', className: 'num royal-col-num', direction: sortDir('set'), title: state.setPath === 'craft' ? 'SET craft-from-mats' : state.setPath === 'buy' ? 'SET Excellent buy' : 'min(SET craft-from-mats, SET Excellent buy)' })}
                        ${sortHeaderHtml('Ucuz', { key: 'cheaper', type: 'text', className: 'royal-col-path', direction: sortDir('cheaper'), title: 'Hangisi daha ucuz: SET craft mi Excellent buy mu' })}
                        ${sortHeaderHtml('Sigil', { key: 'sigil', type: 'number', className: 'num royal-col-num', direction: sortDir('sigil') })}
                        ${sortHeaderHtml('Enchant', { key: 'enchantCost', type: 'number', className: 'num royal-col-num', direction: sortDir('enchantCost') })}
                        ${sortHeaderHtml('Maliyet', { key: 'cost', type: 'number', className: 'num royal-col-num', direction: sortDir('cost') })}
                        ${sortHeaderHtml('Net satış', { key: 'sell', type: 'number', className: 'num royal-col-num', direction: sortDir('sell') })}
                        ${sortHeaderHtml('Kâr', { key: 'profit', type: 'number', className: 'num royal-col-num', direction: sortDir('profit') })}
                        ${sortHeaderHtml('Kâr %', { key: 'pct', type: 'number', className: 'num royal-col-pct', direction: sortDir('pct') })}
                    </tr>
                </thead>
                <tbody>
                    ${list.map((row) => {
                        const setName = row.setPick ? setLabel(row.setPick.uniqueName) : '—';
                        const setIcons = setVariantIconsHtml(row.setLine?.uniqueName);
                        const rowClass = [
                            row.standard ? 'is-standard' : '',
                            row.standard && standardRank(row.recipe.tier, row.enchant) === 0 ? 'is-main' : ''
                        ].filter(Boolean).join(' ');
                        const costTitle = row.setSource === 'buy'
                            ? 'SET Excellent buy + sigil + enchant (royal craft RR yok)'
                            : row.setSource === 'craft'
                                ? 'SET craft-from-mats (RR) + sigil + enchant (royal craft RR yok)'
                                : '';
                        const cheaperTitle = row.setCheaper === 'craft'
                            ? `Craft daha ucuz · craft ${formatSilver(row.setCraft)} · buy ${formatSilver(row.setBuy)}`
                            : row.setCheaper === 'buy'
                                ? `Buy daha ucuz · buy ${formatSilver(row.setBuy)} · craft ${formatSilver(row.setCraft)}`
                                : '';
                        const sellProxy = row.sellProxyQuality;
                        const sellProxyClass = sellProxy ? ' is-quality-proxy' : '';
                        const sellProxyTitle = sellProxy
                            ? `${row.quality.short} satış yok · ${sellProxy.short} fiyatı kullanıldı (gerçek ${row.quality.short} değil)`
                            : '';
                        return `
                            <tr class="${rowClass}${sellProxy ? ' has-sell-proxy' : ''}"
                                data-row-id="${escapeHtml(row.id)}"
                                data-tier="${row.recipe.tier}"
                                data-sort-item="${escapeHtml(row.recipe.label)}"
                                data-sort-te="${escapeHtml(row.tierEnchant)}"
                                data-sort-quality="${escapeHtml(row.quality.label)}"
                                data-sort-set="${row.setDisplay ?? ''}"
                                data-sort-cheaper="${escapeHtml(row.setCheaper || '')}"
                                data-sort-sigil="${row.sigilRaw ?? ''}"
                                data-sort-enchantCost="${row.enchantRaw ?? ''}"
                                data-sort-cost="${row.cost ?? ''}"
                                data-sort-sell="${row.sell ?? ''}"
                                data-sort-profit="${row.profit ?? ''}"
                                data-sort-pct="${row.pct ?? ''}"
                                data-sort-priority="${row.priority}">
                                <td class="royal-item-cell">
                                    <span class="royal-item">
                                        ${itemIconHtml(row.sellId, { className: 'item-icon royal-item-icon', size: 56 })}
                                        <span class="royal-item-text" title="${escapeHtml(row.recipe.label)} · ${escapeHtml(setName)}">
                                            <span class="royal-item-name">${escapeHtml(shortItemName(row.recipe.label))}</span>
                                            <span class="royal-item-meta">
                                                <span class="royal-item-set">${escapeHtml(setName)}</span>
                                                ${setIcons}
                                            </span>
                                        </span>
                                        ${craftMatIconHtml(row)}
                                    </span>
                                </td>
                                <td class="num" data-sort-value="${escapeHtml(row.tierEnchant)}">${escapeHtml(row.tierEnchant)}</td>
                                <td data-sort-value="${escapeHtml(row.quality.label)}" title="${sellProxy ? escapeHtml(sellProxyTitle) : 'Satış kalitesi'}">
                                    <span class="royal-quality${sellProxyClass}">${escapeHtml(row.quality.short)}${sellProxy ? `<span class="royal-proxy-tag" title="${escapeHtml(sellProxyTitle)}">~${escapeHtml(sellProxy.short)}</span>` : ''}</span>
                                </td>
                                <td class="num${incompleteClass(row.setDisplay)}" data-sort-value="${row.setDisplay ?? ''}" title="${row.setSource === 'craft' ? 'SET craft (RR sonrası)' : row.setSource === 'buy' ? 'SET Excellent buy (ham)' : ''}">${formatSilver(row.setDisplay)}</td>
                                <td class="royal-path-cell" data-sort-value="${escapeHtml(row.setCheaper || '')}"${cheaperTitle ? ` title="${escapeHtml(cheaperTitle)}"` : ''}>${setCheaperTag(row.setCheaper)}</td>
                                <td class="num${incompleteClass(row.sigilRaw)}" data-sort-value="${row.sigilRaw ?? ''}" title="${row.sigilQty != null ? `${row.sigilQty} adet · ${row.sealedSigil ? 'sealed birim × adet · RR yok' : 'RR yok'}` : ''}">${formatSilver(row.sigilRaw)}</td>
                                <td class="num${incompleteClass(row.enchantRaw)}" data-sort-value="${row.enchantRaw ?? ''}">${formatSilver(row.enchantRaw)}</td>
                                <td class="num${incompleteClass(row.cost)}" data-sort-value="${row.cost ?? ''}"${costTitle ? ` title="${escapeHtml(costTitle)}"` : ''}>${formatSilver(row.cost)}</td>
                                <td class="num${sellProxyClass}${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}"${sellProxyTitle ? ` title="${escapeHtml(sellProxyTitle)}"` : ''}>${formatSilver(row.sell)}</td>
                                <td class="num${profitClass(row.profit)}${sellProxyClass}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}"${sellProxyTitle ? ` title="${escapeHtml(sellProxyTitle)}"` : ''}>${formatSilver(row.profit, { signed: true })}</td>
                                <td class="num royal-pct${profitClass(row.pct)}${sellProxyClass}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}"${sellProxyTitle ? ` title="${escapeHtml(sellProxyTitle)}"` : ''}>${formatPct(row.pct)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function bestRow(list) {
    return list
        .filter((row) => Number.isFinite(row.pct))
        .slice()
        .sort((a, b) => b.pct - a.pct || b.profit - a.profit)[0] ?? null;
}

function renderSummary(list) {
    const best = bestRow(list);
    const combos = getStandardCombos()
        .map((combo) => `${combo.tier}.${combo.enchant}`)
        .join(' · ');
    const rrPct = (returnRate() * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    const sigilNote = state.sealedSigil
        ? 'sigil = Sealed Royal Sigil birim × adet (tüm tier)'
        : 'sigil = tier sigil · RR yok';
    const setPathLabel = state.setPath === 'craft'
        ? 'SET craft'
        : state.setPath === 'buy'
            ? 'SET Ex buy'
            : 'min(SET craft, SET Ex buy)';
    return `
        <p class="farming-note">
            Alış ${escapeHtml(cityLabel(state.buyCity))} · satış ${escapeHtml(cityLabel(state.sellCity))} ·
            RR ${escapeHtml(rrPct)}% yalnız SET craft-from-mats (şehir ${cityProductionBonus()}%) ·
            royal craft RR yok · ${escapeHtml(sigilNote)} ·
            maliyet = ${escapeHtml(setPathLabel)} + sigil + enchant ·
            ${escapeHtml(feeMetaText(state.premium))}
        </p>
        <p class="farming-note royal-standard-note">
            Kapsam: solda <strong>${state.scope === 'all' ? 'Tüm T.E' : 'Standart T.E'}</strong>
            ${state.scope !== 'all' && combos ? ` (${escapeHtml(combos)})` : ''} —
            <a href="settings.html">standart listesini ayarlardan değiştir</a>.
            ${best ? ` En kârlı: ${escapeHtml(shortItemName(best.recipe.label))} ${escapeHtml(best.tierEnchant)} ${escapeHtml(best.quality.short)} · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.` : ''}
        </p>
    `;
}

function latestDate(list) {
    let latest = null;
    for (const row of list) {
        if (row.date && (!latest || row.date > latest)) {
            latest = row.date;
        }
    }
    return latest;
}

function bestExplainKey(list) {
    return bestRow(list)?.id ?? list[0]?.id ?? null;
}

function byProfitPct(a, b) {
    const ap = Number.isFinite(a.pct) ? a.pct : -Infinity;
    const bp = Number.isFinite(b.pct) ? b.pct : -Infinity;
    if (bp !== ap) {
        return bp - ap;
    }
    const aProfit = Number.isFinite(a.profit) ? a.profit : -Infinity;
    const bProfit = Number.isFinite(b.profit) ? b.profit : -Infinity;
    return bProfit - aProfit;
}

/**
 * A–D from this table's profit% shape: prefer natural gaps, else even bands.
 * Cutoffs change with the visible rows — not fixed global % buckets.
 */
function assignProfitTiers(scoredRows) {
    const ranked = scoredRows.slice().sort(byProfitPct);
    const tiers = new Map();
    const n = ranked.length;
    const labels = ['A', 'B', 'C', 'D'];
    if (!n) {
        return tiers;
    }
    if (n <= 4) {
        ranked.forEach((row, index) => {
            tiers.set(row.id, labels[index] || 'D');
        });
        return tiers;
    }

    const values = ranked.map((row) => row.pct);
    const span = values[0] - values[n - 1];
    const minGap = span > 0 ? Math.max(span * 0.045, Math.abs(values[0]) * 0.008) : 0;
    const minSep = Math.max(1, Math.floor(n / 18));
    const gaps = [];
    for (let i = 0; i < n - 1; i++) {
        gaps.push({ after: i, gap: values[i] - values[i + 1] });
    }

    const chosen = [];
    const rankedGaps = gaps
        .filter((entry) => entry.gap >= minGap)
        .sort((a, b) => b.gap - a.gap || a.after - b.after);
    for (const entry of rankedGaps) {
        if (chosen.length >= 3) {
            break;
        }
        if (chosen.some((index) => Math.abs(index - entry.after) < minSep)) {
            continue;
        }
        if (entry.after < 0 || entry.after > n - 2) {
            continue;
        }
        chosen.push(entry.after);
    }

    const fallback = [
        Math.floor((n - 1) / 4),
        Math.floor((2 * (n - 1)) / 4),
        Math.floor((3 * (n - 1)) / 4)
    ];
    for (const target of fallback) {
        if (chosen.length >= 3) {
            break;
        }
        let best = null;
        let bestDist = Infinity;
        for (let i = 0; i <= n - 2; i++) {
            if (chosen.some((index) => Math.abs(index - i) < minSep || index === i)) {
                continue;
            }
            const dist = Math.abs(i - target);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        if (best != null) {
            chosen.push(best);
        }
    }

    const splits = chosen.sort((a, b) => a - b).slice(0, 3);
    while (splits.length < 3) {
        const next = splits.length ? splits[splits.length - 1] + Math.max(1, minSep) : fallback[splits.length];
        if (next > n - 2) {
            break;
        }
        if (!splits.includes(next)) {
            splits.push(next);
        } else {
            splits.push(Math.min(n - 2, next + 1));
        }
    }
    splits.sort((a, b) => a - b);

    ranked.forEach((row, index) => {
        let tier = 'D';
        if (index <= splits[0]) {
            tier = 'A';
        } else if (index <= splits[1]) {
            tier = 'B';
        } else if (index <= splits[2]) {
            tier = 'C';
        }
        tiers.set(row.id, tier);
    });
    return tiers;
}

/** Mix A–D so lower bands still appear in the plan (not only top profits). */
function pickStationRows(rows, tiers, limit = PLAN_STATION_LIMIT) {
    const queues = { A: [], B: [], C: [], D: [] };
    for (const row of rows.slice().sort(byProfitPct)) {
        const tier = tiers.get(row.id) || 'D';
        (queues[tier] || queues.D).push(row);
    }
    const picked = [];
    let progressed = true;
    while (picked.length < limit && progressed) {
        progressed = false;
        for (const key of ['A', 'B', 'C', 'D']) {
            if (picked.length >= limit) {
                break;
            }
            const next = queues[key].shift();
            if (next) {
                picked.push(next);
                progressed = true;
            }
        }
    }
    return picked.sort(byProfitPct);
}

/** Snapshot of current table rows for the craft-plan dialog. */
function buildCraftPlan(list) {
    const stations = Object.fromEntries(PLAN_STATIONS.map((station) => [station.id, []]));
    const missingSell = [];
    const scored = [];

    for (const row of list) {
        const type = parseKind(row.recipe.kind).type;
        if (!stations[type]) {
            continue;
        }
        if (row.sell == null) {
            missingSell.push(row);
            continue;
        }
        if (row.cost == null || !Number.isFinite(row.pct)) {
            continue;
        }
        stations[type].push(row);
        scored.push(row);
    }

    const tiers = assignProfitTiers(scored);

    for (const station of PLAN_STATIONS) {
        stations[station.id] = pickStationRows(stations[station.id], tiers);
    }

    missingSell.sort((a, b) => {
        const typeCmp = parseKind(a.recipe.kind).type.localeCompare(parseKind(b.recipe.kind).type);
        if (typeCmp) {
            return typeCmp;
        }
        return String(a.tierEnchant).localeCompare(String(b.tierEnchant));
    });

    return { stations, missingSell, tiers };
}

function planPctText(ratio) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    const pct = Math.round(ratio * 100);
    return `${pct > 0 ? '+' : ''}${pct.toLocaleString('tr-TR')}%`;
}

function planRowTitle(row, tier) {
    const tierLabel = tier ? ` · Tier ${tier}` : '';
    return `${shortItemName(row.recipe.label)} · ${row.tierEnchant}${tierLabel} · ${planPctText(row.pct)}`;
}

function planSetIconsHtml(row) {
    const variants = setVariants(row.setLine?.uniqueName);
    return `
        <span class="royal-plan-sets" aria-hidden="true">
            ${variants.map((id) => itemIconHtml(id, { className: 'item-icon royal-plan-set-icon', size: 48 })).join('')}
        </span>
    `;
}

function planTeHtml(row) {
    const tier = Number(row.recipe?.tier);
    const tierAttribute = Number.isFinite(tier) ? ` data-tier="${tier}"` : '';
    return `<span class="royal-plan-te"${tierAttribute}>${escapeHtml(row.tierEnchant)}</span>`;
}

function renderPlanStationItem(row, profitTier = 'D') {
    const itemTier = Number(row.recipe?.tier);
    const tierAttribute = Number.isFinite(itemTier) ? ` data-tier="${itemTier}"` : '';
    return `
        <button type="button" class="royal-plan-item is-profit-tier-${escapeHtml(profitTier)}"${tierAttribute} data-plan-row="${escapeHtml(row.id)}"
            title="${escapeHtml(planRowTitle(row, profitTier))}">
            <span class="royal-plan-item-visual">
                ${itemIconHtml(row.sellId, { className: 'item-icon royal-plan-item-icon', size: 80 })}
                ${planTeHtml(row)}
            </span>
            ${planSetIconsHtml(row)}
            <span class="royal-plan-item-stats">
                <span class="royal-plan-item-pct">${escapeHtml(planPctText(row.pct))}</span>
            </span>
            <span class="royal-plan-tier" aria-label="Kâr tier ${escapeHtml(profitTier)}">${escapeHtml(profitTier)}</span>
        </button>
    `;
}

function renderPlanStationBox(station, rows, tiers) {
    const body = rows.length
        ? rows.map((row) => renderPlanStationItem(row, tiers.get(row.id) || 'D')).join('')
        : '<p class="royal-plan-empty">—</p>';
    return `
        <section class="royal-plan-station" data-plan-station="${escapeHtml(station.id)}">
            <header class="royal-plan-station-head">
                <span class="royal-plan-station-label">${escapeHtml(station.label)}</span>
            </header>
            <div class="royal-plan-station-list">${body}</div>
        </section>
    `;
}

function renderPlanMissingItem(row) {
    const type = parseKind(row.recipe.kind).type;
    return `
        <button type="button" class="royal-plan-miss-item" data-plan-row="${escapeHtml(row.id)}"
            title="${escapeHtml(`${shortItemName(row.recipe.label)} · ${row.tierEnchant} · satış yok`)}">
            ${itemIconHtml(row.sellId, { className: 'item-icon royal-plan-miss-icon', size: 48 })}
            ${planTeHtml(row)}
            <span class="royal-plan-chip">${escapeHtml(type || '?')}</span>
        </button>
    `;
}

function renderPlanDialogBody(plan) {
    const stations = PLAN_STATIONS.map((station) =>
        renderPlanStationBox(station, plan.stations[station.id] || [], plan.tiers)
    ).join('');

    const missing = plan.missingSell.length
        ? `
            <section class="royal-plan-missing">
                <header class="royal-plan-missing-head">
                    <span class="royal-plan-missing-label">Satış yok</span>
                </header>
                <div class="royal-plan-missing-list">
                    ${plan.missingSell.map(renderPlanMissingItem).join('')}
                </div>
            </section>
        `
        : '';

    return `
        <button type="button" class="app-dialog-close" aria-label="Kapat" data-plan-close></button>
        <div class="royal-plan-sheet">
            <div class="royal-plan-stations">${stations}</div>
            ${missing}
        </div>
    `;
}

function renderPlanFab() {
    return `
        <button type="button" class="royal-plan-fab" id="royalPlanFab" aria-label="Royal Crafting Wizard" title="Royal Crafting Wizard">
            <svg class="royal-plan-fab-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 2.5 1.5-1.5 2 2 3.5-3.5 1.5 1.5-5 5-3.5-3.5Z"/>
            </svg>
        </button>
    `;
}

let planHost = null;

function mountPlanFab(container) {
    planHost = container;
    const status = document.querySelector('.app-status');
    let fab = document.getElementById('royalPlanFab');
    if (!fab) {
        const wrap = document.createElement('div');
        wrap.innerHTML = renderPlanFab().trim();
        fab = wrap.firstElementChild;
    }
    if (status) {
        status.classList.add('has-royal-plan-fab');
        if (fab.parentElement !== status) {
            status.appendChild(fab);
        }
    } else if (!fab.isConnected) {
        document.body.appendChild(fab);
    }
    bindCraftPlan();
}

function bindCraftPlan() {
    const fab = document.getElementById('royalPlanFab');
    if (!fab || fab.dataset.planBound === 'on') {
        return;
    }
    fab.dataset.planBound = 'on';
    fab.addEventListener('click', () => {
        if (planHost) {
            openRoyalWizard(planHost);
        }
    });
}

function wizardPriceGroups() {
    const groups = [
        {
            id: 'sigil',
            label: 'Sigil fiyatları',
            description: 'Royal Sigil fiyatları',
            entries: [
                ...TIERS.map((tier) => ({
                    key: `sigil:QUESTITEM_TOKEN_ROYAL_T${tier}`,
                    uniqueName: `QUESTITEM_TOKEN_ROYAL_T${tier}`,
                    label: `Royal Sigil T${tier}`
                })),
                { key: SEALED_SIGIL_KEY, uniqueName: SEALED_ROYAL_SIGIL, label: 'Sealed Royal Sigil' }
            ]
        },
        {
            id: 'enchant',
            label: 'Rune / Soul / Relic',
            description: 'Enchant malzemesi fiyatları',
            entries: TIERS.flatMap((tier) => steps().map((step) => ({
                key: matKey(step.kind, tier),
                uniqueName: enchantMatUniqueName(step.kind, tier),
                label: `${step.label || step.kind} T${tier}`
            })))
        },
        {
            id: 'materials',
            label: 'Malzeme fiyatları',
            description: 'SET üretim malzemesi fiyatları',
            entries: TIERS.flatMap((tier) => REFINED_KINDS.map((refined) => ({
                key: `refined:${refined.kind}-${tier}`,
                uniqueName: `T${tier}_${refined.stem}`,
                label: `${refined.label} T${tier}`
            })))
        }
    ];

    return groups.map((group) => {
        // Shared market logic marks timestamped prices older than six hours as stale.
        // A manual value is intentionally accepted: it is the user's explicit market update.
        const complete = group.entries.filter((entry) => {
            const quote = matQuote(entry.key, entry.uniqueName, 1);
            return quote && !quote.stale;
        });
        return { ...group, complete, total: group.entries.length };
    });
}

function syncWizardRecent() {
    const current = new Map();
    const changed = [];
    for (const group of wizardPriceGroups()) {
        for (const entry of group.entries) {
            const quote = matQuote(entry.key, entry.uniqueName, 1);
            if (!quote || quote.stale) continue;
            const signature = `${quote.price}|${quote.date || 'manual'}`;
            current.set(entry.key, signature);
            if (state.wizardPriceState.get(entry.key) !== signature) {
                changed.push(entry);
            }
        }
    }
    state.wizardPriceState = current;
    if (!changed.length) return;
    const changedKeys = new Set(changed.map((entry) => entry.key));
    state.wizardRecent = [
        ...changed.reverse(),
        ...state.wizardRecent.filter((entry) => !changedKeys.has(entry.key))
    ].slice(0, 12);
}

function wizardProgressCard(group) {
    const done = group.complete.length === group.total;
    const active = !done && group.complete.length > 0;
    const stateClass = done ? 'is-complete' : active ? 'is-active' : 'is-pending';
    const stateLabel = done ? 'Tamamlandı' : active ? 'Güncelleniyor' : 'Bekliyor';
    return `
        <article class="royal-wizard-group ${stateClass}">
            <span class="royal-wizard-group-icon ${done ? 'is-complete' : active ? 'is-active' : ''}" aria-hidden="true">${done ? '<img src="icons/royal-wizard/check.svg" alt="">' : `<svg viewBox="0 0 36 36" focusable="false"><circle class="royal-wizard-group-track" cx="18" cy="18" r="15"/>${active ? `<circle class="royal-wizard-group-fill" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${(group.complete.length / group.total) * 100} 100" transform="rotate(-90 18 18)"/>` : ''}</svg>`}</span>
            <div>
                <h3>${escapeHtml(group.label)}</h3>
                <strong>${escapeHtml(stateLabel)}</strong>
                <p>${done
                    ? `${group.total} fiyat güncellendi.`
                    : `${group.complete.length} / ${group.total} fiyat hazır.`}</p>
            </div>
        </article>
    `;
}

function wizardStatusGroup({ status, icon, title, value, detail }) {
    return `
        <article class="royal-wizard-group is-${status}">
            <span class="royal-wizard-group-icon is-${status}" aria-hidden="true">${icon}</span>
            <div>
                <h3>${escapeHtml(title)}</h3>
                <strong>${escapeHtml(value)}</strong>
                <p>${escapeHtml(detail)}</p>
            </div>
        </article>
    `;
}

function renderWizardProgress(group) {
    const percent = group.total ? Math.round((group.complete.length / group.total) * 100) : 0;
    return `
        <article class="royal-wizard-recent-card">
            ${itemIconHtml(group.uniqueName, { className: 'item-icon royal-wizard-recent-icon', size: 48 })}
            <span>${escapeHtml(group.label)}</span>
            <small>Fiyat güncellendi</small>
            <b>✓</b>
        </article>
    `;
}

// The step rail is deliberately driven from the same interpolated value as the
// main progress bar. Keeping the last visible value when markup is refreshed
// prevents a burst of price responses from making the connector jump wide.
function setWizardRailTarget(dialog, target, initialValue, duration) {
    const rail = dialog.querySelector('.royal-wizard-steps');
    if (!rail) return;
    const safeTarget = Math.max(0, Math.min(100, Number(target) || 0));
    if (dialog.wizardRail !== rail) {
        const start = Number.isFinite(initialValue) ? initialValue : safeTarget;
        rail.style.setProperty('--wizard-rail-progress', `${start}%`);
        void rail.offsetWidth;
        dialog.wizardRail = rail;
    }
    rail.style.setProperty('--wizard-rail-duration', `${duration}ms`);
    rail.style.setProperty('--wizard-rail-progress', `${safeTarget}%`);
}

// Price responses can arrive in bursts. Keep the currently rendered width,
// then use one CSS transition toward the latest target. The duration scales
// with the remaining distance so large batches are brisk and small updates are
// still readable.
function setWizardProgressTarget(dialog, target) {
    const bar = dialog.querySelector('.royal-wizard-progress i');
    if (!bar) return;
    const safeTarget = Math.max(0, Math.min(100, Number(target) || 0));
    let progress = dialog.wizardProgress;
    if (!progress || progress.bar !== bar) {
        progress?.cleanup?.();
        const previous = progress?.value;
        progress = {
            bar,
            value: Number.isFinite(previous) ? previous : safeTarget,
            target: safeTarget,
            settled: [],
            cleanup: null,
            isAnimating: false
        };
        dialog.wizardProgress = progress;
        // A newly rendered step must begin from the currently displayed value,
        // not from the target baked into its HTML.
        bar.style.transition = 'none';
        bar.style.width = `${progress.value}%`;
        void bar.offsetWidth;
    } else {
        // Freeze the in-flight CSS transition at its computed width before
        // retargeting it. This is what prevents rapid data responses from
        // snapping the bar to the previous transition's destination.
        const trackWidth = bar.parentElement.getBoundingClientRect().width;
        const barWidth = bar.getBoundingClientRect().width;
        progress.value = trackWidth ? Math.max(0, Math.min(100, barWidth / trackWidth * 100)) : progress.value;
        bar.style.transition = 'none';
        bar.style.width = `${progress.value}%`;
        void bar.offsetWidth;
    }
    progress.target = safeTarget;
    progress.cleanup?.();
    const distance = Math.abs(progress.target - progress.value);
    const duration = Math.round(Math.min(900, Math.max(160, 120 + distance * 10)));
    setWizardRailTarget(dialog, safeTarget, progress.value, duration);
    if (distance < 0.08) {
        progress.value = progress.target;
        progress.isAnimating = false;
        bar.style.width = `${progress.target}%`;
        progress.settled.splice(0).forEach((callback) => callback());
        return;
    }
    progress.isAnimating = true;
    bar.style.transition = `width ${duration}ms cubic-bezier(0.22, 0.8, 0.25, 1)`;
    bar.style.width = `${progress.target}%`;
    const onEnd = (event) => {
        if (event.target !== bar || event.propertyName !== 'width') return;
        progress.value = progress.target;
        progress.isAnimating = false;
        progress.cleanup = null;
        progress.settled.splice(0).forEach((callback) => callback());
    };
    bar.addEventListener('transitionend', onEnd);
    progress.cleanup = () => bar.removeEventListener('transitionend', onEnd);
}

function afterWizardProgressSettles(dialog, callback) {
    const progress = dialog.wizardProgress;
    if (!progress || !progress.isAnimating) {
        callback();
        return;
    }
    progress.settled.push(callback);
}

const ROYAL_WIZARD_TITLE = 'Royal Crafting Wizard';
const ROYAL_WIZARD_DESCRIPTION = 'En kârlı Royal ekipmanı bulman ve üretim sürecini tamamlaman için rehber.';
const ROYAL_WIZARD_STEP_TITLES = ['Fiyat Verileri', 'Royal Fiyatları', 'Sonuçlar'];

function renderWizardHeader() {
    return `<header class="royal-wizard-header">
        <img class="royal-wizard-crown" src="icons/royal-wizard/crown.svg" alt="">
        <div><h2>${ROYAL_WIZARD_TITLE}</h2><p>${ROYAL_WIZARD_DESCRIPTION}</p></div>
        <button type="button" class="royal-wizard-help" data-wizard-help><img src="icons/royal-wizard/info.svg" alt="">Nasıl çalışır?</button>
    </header>`;
}

function renderWizardSteps(currentStep, labels, progress = 0) {
    return `<ol class="royal-wizard-steps" aria-label="Wizard adımları" style="--wizard-rail-progress:${progress}%">
        ${ROYAL_WIZARD_STEP_TITLES.map((title, index) => {
            const step = index + 1;
            const state = step < currentStep ? 'is-done' : step === currentStep ? 'is-current' : '';
            return `<li class="${state}"${step === currentStep ? ' aria-current="step"' : ''}><b>${step < currentStep ? '✓' : step}</b><span>${title}<small>${escapeHtml(labels[index])}</small></span></li>`;
        }).join('')}
    </ol>`;
}

function renderWizardShell({ currentStep, labels, progress, body, footer, className = '' }) {
    return `
        <button type="button" class="app-dialog-close" aria-label="Kapat" data-wizard-close></button>
        <div class="royal-wizard-sheet ${className}">
            ${renderWizardHeader()}
            ${renderWizardSteps(currentStep, labels, progress)}
            <div class="royal-wizard-body">${body}</div>
            <footer class="royal-wizard-footer">${footer}</footer>
        </div>
    `;
}

function renderRoyalWizardStepOne(checked = 0) {
    const sourceGroups = wizardPriceGroups();
    let left = checked;
    const groups = sourceGroups.map((group) => {
        const complete = group.complete.slice(0, Math.max(0, Math.min(group.complete.length, left)));
        left -= complete.length;
        return { ...group, complete };
    });
    const readyGroups = groups.filter((group) => group.complete.length === group.total).length;
    const total = groups.reduce((sum, group) => sum + group.total, 0);
    const complete = groups.reduce((sum, group) => sum + group.complete.length, 0);
    const percent = total ? Math.round((complete / total) * 100) : 0;
    const recent = state.wizardRecent.slice(0, 8);
    const isReady = readyGroups === groups.length;

    return renderWizardShell({
        currentStep: 1,
        labels: ['Hazırlanıyor', 'Bekliyor', 'Bekliyor'],
        progress: percent,
        body: `
            <section class="royal-wizard-main">
                <h1>1. Fiyat verileri hazırlanıyor</h1>
                <p>Hesaplamalarda kullanılacak temel fiyat verileri güncelleniyor.</p>
                <div class="royal-wizard-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>
                <div class="royal-wizard-progress-meta"><strong>%${percent}</strong><span>${readyGroups} / ${groups.length} kaynak grubu hazır</span></div>
                <div class="royal-wizard-groups">${groups.map(wizardProgressCard).join('')}</div>
            </section>
            <aside class="royal-wizard-aside">
                <section><h3><img src="icons/royal-wizard/info.svg" alt="">Hazırlık kuralı</h3><p>Royal item fiyatları hesaplanmadan önce gerekli tüm temel fiyat grupları (Sigil, Rune/Soul/Relic ve malzemeler) güncellenir. Bu veriler, hesaplamaların doğru ve kararlı olması için kullanılır.</p></section>
                <section><h3><img src="icons/royal-wizard/crown.svg" alt="">Geçiş kuralı</h3><p>Tüm gerekli fiyat grupları hazır olduğunda sihirbaz otomatik olarak bir sonraki adıma geçer. Herhangi bir işlem yapmana gerek yoktur.</p></section>
            </aside>
            <section class="royal-wizard-recent-section">
                <h2 class="royal-wizard-recent-title">Son güncellenen</h2>
                <div class="royal-wizard-recent">${recent.length ? recent.map(renderWizardProgress).join('') : '<p>Henüz güncellenen bir fiyat yok.</p>'}</div>
            </section>`,
        footer: `<span><img src="icons/royal-wizard/info.svg" alt="">${isReady ? 'Tamamlandığında otomatik ilerler' : `${total - complete} fiyat hâlâ eksik.`}</span>
            <button type="button" class="btn btn-outline-secondary royal-wizard-pause" data-wizard-pause aria-pressed="false" disabled>Duraklat</button>
            <button type="button" class="royal-wizard-skip" data-wizard-continue data-wizard-ready="${isReady}">${isReady ? 'Sonraki adım' : 'Eksiklerle devam et'} <span aria-hidden="true">→</span></button>`
    });
}

function wizardRoyalItems() {
    return filteredRecipes().flatMap((recipe) => ENCHANTS
        .filter((enchant) => state.scope === 'all' || standardRank(recipe.tier, enchant) != null)
        .map((enchant) => ({ id: royalUniqueName(recipe.uniqueName, enchant),
            label: shortItemName(recipe.label), tier: `T${recipe.tier}.${enchant}` })));
}

function wizardRoyalStatus(item) {
    const count = QUALITIES.filter((quality) => itemQuote(`sell:${item.id}|q${quality.id}`, item.id, quality.id)).length;
    return count === 2 ? 'complete' : count === 1 ? 'proxy' : 'missing';
}

function renderWizardRoyalCard(item) {
    const status = wizardRoyalStatus(item);
    const label = { complete: 'Tam · Ex + MP', proxy: 'Proxy · 1 kalite bulundu', missing: 'Eksik · fiyat bulunamadı' }[status];
    return `<article class="royal-wizard-recent-card is-${status}">
        ${itemIconHtml(item.id, { className: 'item-icon royal-wizard-recent-icon', size: 64 })}
        <span>${escapeHtml(item.tier)}</span><small>${escapeHtml(item.label)}</small>
        <b title="${label}" aria-label="${label}">${status === 'complete' ? '✓' : status === 'proxy' ? '◐' : '!'}</b>
    </article>`;
}

function renderRoyalWizardStepTwo(run) {
    const checked = run.items.filter((item) => run.checked.has(item.id));
    const counts = { complete: 0, proxy: 0, missing: 0 };
    checked.forEach((item) => counts[wizardRoyalStatus(item)]++);
    const missing = checked.filter((item) => wizardRoyalStatus(item) === 'missing');
    const available = counts.complete + counts.proxy;
    const percent = run.items.length ? Math.round(available / run.items.length * 100) : 100;
    const incomplete = missing.length || run.error || !run.baseReady;
    const statusGroups = [
        { status: 'complete', icon: '✓', title: 'Tam', value: `${counts.complete} item`, detail: 'Excellent + Masterpiece hazır' },
        { status: 'proxy', icon: '◐', title: 'Proxy', value: `${counts.proxy} item`, detail: 'Tek kalite fiyatı bulundu' },
        { status: 'missing', icon: '⊘', title: 'Eksik', value: `${counts.missing} item`, detail: 'Fiyat bulunamadı' }
    ];
    const stateLabel = run.loading
        ? 'Güncelleniyor…'
        : missing.length
            ? `${missing.length} veri eksik`
            : run.error
                ? 'Kontrol tamamlanamadı'
                : 'Tamamlandı';
    const footerStatus = run.loading
        ? `Market fiyatları kontrol ediliyor… ${checked.length} / ${run.items.length} item işlendi.`
        : missing.length
            ? `${missing.length} item için fiyat bulunamadı; eksiklerle devam edebilirsin.`
            : run.error
                ? 'Bazı fiyatlar yenilenemedi.'
                : 'Fiyat kontrolü tamamlandı.';
    const missingPreview = missing.slice(0, 9);
    return renderWizardShell({
        currentStep: 2,
        labels: [run.baseReady ? 'Tamamlandı' : 'Eksiklerle geçildi', stateLabel, 'Bekliyor'],
        progress: percent,
        className: 'royal-wizard-step-two',
        body: `
            <section class="royal-wizard-main">
                <h1>2. Royal item fiyatları</h1>
                <p>Seçilen filtrelere göre Royal itemların Excellent ve Masterpiece fiyatları kontrol edilir.</p>
                <div class="royal-wizard-progress" role="progressbar" aria-label="Kullanılabilir Royal fiyat oranı" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>
                <div class="royal-wizard-progress-meta"><strong>%${percent}</strong><span>${available} / ${run.items.length} item kullanılabilir fiyatla hazır</span></div>
                <div class="royal-wizard-groups">${statusGroups.map(wizardStatusGroup).join('')}</div>
                ${!run.items.length ? '<p>Seçilen filtrelerde Royal item bulunamadı.</p>' : ''}
                ${run.error ? `<p class="royal-wizard-error" role="alert">${escapeHtml(run.error)} Mevcut kayıtlı fiyatlar gösteriliyor.</p>` : ''}
            </section>
            <aside class="royal-wizard-aside" id="royalWizardRules" tabindex="-1" data-wizard-list="missing">
                <section class="royal-wizard-missing-preview">
                    <h3><span class="royal-wizard-alert" aria-hidden="true">!</span>Eksik fiyatlar</h3>
                    <p>${missing.length ? `${missing.length} item için fiyat bulunamadı. Sonuçlarda ayrı işaretlenecek.` : 'Kontrol edilen itemlarda eksik fiyat yok.'}</p>
                    ${missingPreview.length ? `<div class="royal-wizard-item-grid">${missingPreview.map(renderWizardRoyalCard).join('')}</div>${missing.length > missingPreview.length ? `<small>İlk ${missingPreview.length} item gösteriliyor.</small>` : ''}` : ''}
                </section>
            </aside>
            <section class="royal-wizard-recent-section">
                <h2 class="royal-wizard-recent-title">Son kontrol edilenler</h2>
                <div class="royal-wizard-recent">${checked.length ? checked.slice(-8).reverse().map(renderWizardRoyalCard).join('') : '<p>Royal fiyatları bekleniyor…</p>'}</div>
            </section>`,
        footer: `<button type="button" class="btn btn-outline-secondary royal-wizard-back" data-wizard-back><img src="icons/royal-wizard/back.svg" alt="">Geri</button>
            <span role="status">${footerStatus}</span>
            <button type="button" class="royal-wizard-skip" data-wizard-continue data-wizard-ready="${!incomplete}" ${run.loading || !run.items.length ? 'disabled' : ''}>${incomplete ? 'Eksiklerle Devam Et' : 'Sonuçları Gör'} <span aria-hidden="true">→</span></button>`
    });
}

function updateWizardStepTwo(dialog) {
    const run = dialog.wizardRoyalRun;
    if (!dialog.open || dialog.dataset.wizardStep !== '2' || !run) return;
    const scrollTop = dialog.querySelector('.royal-wizard-body')?.scrollTop || 0;
    const active = document.activeElement;
    const focusedList = active?.closest('[data-wizard-list]')?.dataset.wizardList;
    const focusAttribute = ['data-wizard-continue', 'data-wizard-back', 'data-wizard-help', 'data-wizard-close'].find((name) => active?.hasAttribute(name));
    for (const name of ['all', 'missing']) {
        run[`${name}Open`] = dialog.querySelector(`[data-wizard-list="${name}"]`)?.open || false;
    }
    // Preserve a CSS transition's visible midpoint before this render replaces
    // the progress element with new markup.
    const previousProgress = dialog.wizardProgress;
    // Step two rerenders its cards for every price response. Capture the
    // rendered width before replacing its bar, otherwise a burst restarts the
    // next transition from an outdated target value.
    if (previousProgress?.bar?.isConnected) {
        const trackWidth = previousProgress.bar.parentElement?.getBoundingClientRect().width;
        const barWidth = previousProgress.bar.getBoundingClientRect().width;
        if (trackWidth) previousProgress.value = Math.max(0, Math.min(100, barWidth / trackWidth * 100));
    }
    if (previousProgress?.bar.isConnected) {
        const trackWidth = previousProgress.bar.parentElement.getBoundingClientRect().width;
        const barWidth = previousProgress.bar.getBoundingClientRect().width;
        if (trackWidth) previousProgress.value = Math.max(0, Math.min(100, barWidth / trackWidth * 100));
    }
    dialog.innerHTML = renderRoyalWizardStepTwo(run);
    const visibleAvailable = run.items.filter((item) => run.checked.has(item.id) && wizardRoyalStatus(item) !== 'missing').length;
    setWizardProgressTarget(dialog, run.items.length
        ? Math.round((visibleAvailable / run.items.length) * 100)
        : 100);
    dialog.querySelector('.royal-wizard-body').scrollTop = scrollTop;
    if (focusAttribute) dialog.querySelector(`[${focusAttribute}]`)?.focus({ preventScroll: true });
    if (focusedList) dialog.querySelector(`[data-wizard-list="${focusedList}"] > summary`)?.focus({ preventScroll: true });
}

function renderRoyalWizardResults(plan) {
    return renderWizardShell({
        currentStep: 3,
        labels: ['Tamamlandı', 'Tamamlandı', 'Plan hazır'],
        progress: 100,
        className: 'royal-wizard-results',
        body: renderPlanDialogBody(plan).replace(/<button[^>]*data-plan-close[\s\S]*?<\/button>/, ''),
        footer: '<button type="button" class="btn btn-outline-secondary royal-wizard-back" data-wizard-back><img src="icons/royal-wizard/back.svg" alt="">Geri</button>'
    });
}

async function showWizardStepTwo(dialog) {
    if (!dialog.open) return;
    stopWizardTransition(dialog);
    const run = {
        items: wizardRoyalItems(), checked: new Set(), loading: true, error: null,
        baseReady: wizardPriceGroups().every((group) => group.complete.length === group.total)
    };
    dialog.wizardRoyalRun = run;
    updateWizardStepTwo(dialog);
    // Advance only after a real batch completes. Closing or going back invalidates this run.
    for (let start = 0; start < run.items.length; start += 12) {
        const batch = run.items.slice(start, start + 12);
        try {
            const data = await fetchPrices(batch.map((item) => item.id), [state.sellCity], { qualities: [4, 5] });
            if (dialog.wizardRoyalRun !== run || !dialog.open) return;
            state.priceIndex ??= new Map();
            for (const item of batch) {
                for (const quality of QUALITIES) state.priceIndex.delete(`${item.id}|${state.sellCity}|${quality.id}`);
            }
            for (const [key, value] of indexPrices(data)) state.priceIndex.set(key, value);
            refreshCalc(dialog.parentElement);
        } catch (error) {
            if (dialog.wizardRoyalRun !== run || !dialog.open) return;
            run.error = error.message || 'Fiyatlar yenilenemedi.';
        }
        batch.forEach((item) => run.checked.add(item.id));
        updateWizardStepTwo(dialog);
    }
    run.loading = false;
    updateWizardStepTwo(dialog);
}

function stopWizardTransition(dialog) {
    dialog.wizardRoyalRun = null;
    window.clearTimeout(dialog.wizardCompletionTimer);
    window.cancelAnimationFrame(dialog.wizardPrepareFrame);
    window.clearInterval(dialog.wizardCountdownTimer);
    dialog.wizardProgress?.cleanup?.();
    dialog.wizardProgress = null;
    dialog.wizardRail = null;
    dialog.wizardTransitionCleanup?.();
    dialog.wizardTransitionCleanup = null;
    dialog.wizardCountdown = null;
}

function updateWizardCountdown(dialog) {
    const countdown = dialog.wizardCountdown;
    const paused = dialog.dataset.wizardPaused === 'true';
    const remaining = countdown?.startedAt != null && !paused
        ? Math.max(0, countdown.remaining - (performance.now() - countdown.startedAt))
        : countdown?.remaining ?? 15000;
    const seconds = Math.ceil(remaining / 1000);
    const label = dialog.querySelector('.royal-wizard-footer > span');
    const button = dialog.querySelector('[data-wizard-pause]');
    if (label) label.textContent = paused
        ? 'Otomatik geçiş duraklatıldı. Kalan süre: ' + seconds + ' sn.'
        : 'Fiyatlar güncel. Bar boşaldığında Royal fiyatlarına geçilecek (' + seconds + ' sn)…';
    if (button) {
        button.disabled = false;
        button.textContent = paused ? 'Devam et' : 'Duraklat';
        button.setAttribute('aria-pressed', String(paused));
    }
}

function resumeWizardCountdown(dialog) {
    const countdown = dialog.wizardCountdown;
    if (!countdown) return;
    countdown.startedAt = performance.now();
    countdown.bar.style.transitionProperty = 'width';
    countdown.bar.style.transitionDuration = countdown.remaining + 'ms';
    countdown.bar.style.width = '0%';
}

function toggleWizardCountdown(dialog) {
    const paused = dialog.dataset.wizardPaused !== 'true';
    const countdown = dialog.wizardCountdown;
    if (countdown && paused) {
        // Freeze at the rendered width without jumping to the transition target.
        const width = getComputedStyle(countdown.bar).width;
        countdown.remaining = Math.max(0, countdown.remaining - (performance.now() - countdown.startedAt));
        countdown.startedAt = null;
        countdown.bar.style.transitionDuration = '0ms';
        countdown.bar.style.width = width;
        void countdown.bar.offsetWidth;
    }
    dialog.dataset.wizardPaused = String(paused);
    if (countdown && !paused) resumeWizardCountdown(dialog);
    updateWizardCountdown(dialog);
}

function completeWizardStepOne(dialog, done) {
    if (!dialog.open || dialog.dataset.wizardCompleting === 'true') return;
    dialog.dataset.wizardCompleting = 'true';
    dialog.dataset.wizardPaused = 'false';
    updateWizardCountdown(dialog);
    // Do not drain until the organic preparation fill has visibly reached 100%.
    afterWizardProgressSettles(dialog, () => {
        if (!dialog.open || dialog.dataset.wizardStep !== '1') return;
        const bar = dialog.querySelector('.royal-wizard-progress i');
        if (!bar) return;
        dialog.wizardCountdown = { bar, remaining: 15000, startedAt: null };
        bar.style.transitionProperty = 'width';
        bar.style.transitionTimingFunction = 'linear';
        const onEnd = (event) => {
            if (event.target === bar && event.propertyName === 'width'
                && dialog.open && dialog.dataset.wizardStep === '1'
                && dialog.dataset.wizardPaused !== 'true' && bar.style.width === '0%') done();
        };
        bar.addEventListener('transitionend', onEnd);
        dialog.wizardTransitionCleanup = () => bar.removeEventListener('transitionend', onEnd);
        if (dialog.dataset.wizardPaused !== 'true') resumeWizardCountdown(dialog);
        dialog.wizardCountdownTimer = window.setInterval(() => updateWizardCountdown(dialog), 100);
    });
}

// All forward/back actions use this single ordered route list.
const ROYAL_WIZARD_STEPS = [showWizardStepOne, showWizardStepTwo, showWizardResults];

function moveRoyalWizard(dialog, direction, fromStep = Number(dialog.dataset.wizardStep)) {
    if (!dialog.open || Number(dialog.dataset.wizardStep) !== fromStep) return;
    if (direction !== 1 && direction !== -1) return;
    const currentIndex = fromStep - 1;
    const nextIndex = currentIndex + direction;
    if (!ROYAL_WIZARD_STEPS[currentIndex] || !ROYAL_WIZARD_STEPS[nextIndex]) return;
    if (direction === 1 && ROYAL_WIZARD_STEPS[currentIndex] === showWizardStepTwo
        && (!dialog.wizardRoyalRun || dialog.wizardRoyalRun.loading || !dialog.wizardRoyalRun.items.length)) return;
    stopWizardTransition(dialog);
    dialog.dataset.wizardStep = String(nextIndex + 1);
    ROYAL_WIZARD_STEPS[nextIndex](dialog);
}

function showWizardStepOne(dialog) {
    delete dialog.dataset.wizardPaused;
    delete dialog.dataset.wizardCompleting;
    dialog.innerHTML = renderRoyalWizardStepOne(0);
    setWizardProgressTarget(dialog, 0);
    dialog.wizardPrepareFrame = window.requestAnimationFrame(() => refreshOpenRoyalWizard(dialog.parentElement));
}

function showWizardResults(dialog) {
    const container = dialog.parentElement;
    dialog.innerHTML = renderRoyalWizardResults(buildCraftPlan(sortedRows()));
    dialog.querySelectorAll('[data-plan-row]').forEach((button) => button.addEventListener('click', () => {
        dialog.close();
        focusPlanRow(container, button.dataset.planRow);
    }));
}

function openRoyalWizard(container) {
    let dialog = container.querySelector('#royalWizardDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'royalWizardDialog';
        container.appendChild(dialog);
        // Delegate once: rendering or refreshing a step must not add another navigation listener.
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog || event.target.closest('[data-wizard-close]')) {
                dialog.close();
                return;
            }
            const button = event.target.closest('button');
            if (!button || !dialog.contains(button) || button.disabled) return;
            if (button.hasAttribute('data-wizard-continue')) {
                moveRoyalWizard(dialog, 1);
                return;
            }
            if (button.hasAttribute('data-wizard-back')) {
                moveRoyalWizard(dialog, -1);
                return;
            }
            if (button.hasAttribute('data-wizard-pause')) toggleWizardCountdown(dialog);
            if (button.hasAttribute('data-wizard-help')) {
                const rules = dialog.querySelector('#royalWizardRules');
                if (rules) rules.focus();
                else button.textContent = 'Fiyatlar hazır oldukça ilerleme güncellenir.';
            }
        });
        dialog.addEventListener('close', () => stopWizardTransition(dialog));
    }
    dialog.className = 'app-dialog royal-wizard-dialog';
    stopWizardTransition(dialog);
    dialog.dataset.wizardStep = '1';
    ROYAL_WIZARD_STEPS[0](dialog);
    if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }
}

function refreshOpenRoyalWizard(container) {
    const dialog = container.querySelector('#royalWizardDialog');
    if (dialog?.open && dialog.dataset.wizardStep === '2') {
        updateWizardStepTwo(dialog);
        return;
    }
    if (!dialog?.open || dialog.dataset.wizardStep !== '1') {
        return;
    }
    const total = wizardPriceGroups().reduce((sum, group) => sum + group.total, 0);
    if (dialog.dataset.wizardCompleting === 'true') return;
    // Keep the bar and step rail mounted so their CSS transitions remain continuous.
    const template = document.createElement('template');
    template.innerHTML = renderRoyalWizardStepOne(total);
    const next = template.content;
    const progress = dialog.querySelector('.royal-wizard-progress');
    const nextProgress = next.querySelector('.royal-wizard-progress');
    progress.setAttribute('aria-valuenow', nextProgress.getAttribute('aria-valuenow'));
    void progress.offsetWidth;
    setWizardProgressTarget(dialog, nextProgress.getAttribute('aria-valuenow'));
    for (const selector of ['.royal-wizard-progress-meta', '.royal-wizard-groups', '.royal-wizard-recent', '.royal-wizard-footer']) {
        dialog.querySelector(selector).innerHTML = next.querySelector(selector).innerHTML;
    }
    if (wizardPriceGroups().every((group) => group.complete.length === group.total)) {
        const fromStep = Number(dialog.dataset.wizardStep);
        completeWizardStepOne(dialog, () => moveRoyalWizard(dialog, 1, fromStep));
    }
}

function focusPlanRow(container, rowId) {
    const dialog = container.querySelector('#royalPlanDialog');
    if (dialog?.open) {
        dialog.close();
    }
    const safe = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(rowId)
        : String(rowId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const tr = container.querySelector(`tr[data-row-id="${safe}"]`);
    if (!tr) {
        return;
    }
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    tr.classList.add('is-plan-focus');
    tr.click();
    window.setTimeout(() => tr.classList.remove('is-plan-focus'), 1600);
}

function openCraftPlan(container) {
    let dialog = container.querySelector('#royalPlanDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'royalPlanDialog';
        container.appendChild(dialog);
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) {
                dialog.close();
            }
        });
    }
    dialog.className = 'app-dialog royal-plan-dialog';

    const plan = buildCraftPlan(sortedRows());
    dialog.innerHTML = renderPlanDialogBody(plan);

    dialog.querySelector('[data-plan-close]')?.addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-plan-row]').forEach((button) => {
        button.addEventListener('click', () => {
            focusPlanRow(container, button.dataset.planRow);
        });
    });

    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', '');
    }
}

function salesTax() {
    return salesTaxRate(state.premium);
}

function renderRoyalExplain(key, { hovered } = {}) {
    const row = rows().find((item) => item.id === key);
    if (!row) {
        return explainEmptyHtml('Satır bulunamadı.');
    }

    const bonus = productionBonus();
    const rr = row.rr;
    const keep = 1 - rr;
    const tax = salesTax();
    const sellSetup = row.sellQuote?.setup ?? placesOrder('sell', state.itemSide);
    const itemIcon = itemIconHtml(row.sellId, { className: 'item-icon calc-explain-icon', size: 56 });
    const setIcon = row.setPick
        ? itemIconHtml(row.setPick.uniqueName, { className: 'item-icon calc-explain-icon', size: 56 })
        : '';
    const craftMatIcon = row.craftSpec
        ? itemIconHtml(row.craftSpec.uniqueName, { className: 'item-icon calc-explain-icon', size: 56 })
        : '';
    const sigilIcon = row.sigilUnique
        ? itemIconHtml(row.sigilUnique, { className: 'item-icon calc-explain-icon', size: 56 })
        : '';
    const title = `${shortItemName(row.recipe.label)} ${row.tierEnchant} · satış ${row.quality.short}`;
    const matUnit = row.craftSpec && row.craftMatQuote ? row.craftMatQuote.price : null;
    const sigilUnit = row.sigilQty > 0 && row.sigilRaw != null ? row.sigilRaw / row.sigilQty : null;

    const setCraftLines = [];
    if (row.craftSpec) {
        setCraftLines.push(explainStep({
            icon: craftMatIcon,
            label: `${row.craftSpec.label} → SET`,
            note: `${row.craftSpec.uniqueName} · ${row.craftSpec.qty} adet`,
            formula: [
                explainNum(row.craftSpec.qty, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(matUnit, { tone: 'price', cap: 'birim' })
            ],
            result: row.setMatRaw,
            resultKind: 'cost',
            resultCap: 'ham'
        }));
        setCraftLines.push(explainStep({
            label: 'SET craft (RR sonrası)',
            note: `Classic SET craft · ödenen pay ${formatPct(keep)} · royal craft’ta ek RR yok`,
            formula: [
                explainNum(row.setMatRaw, { tone: 'cost', cap: 'ham' }),
                explainOp('×'),
                explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen pay' })
            ],
            result: row.setCraftKeep,
            resultKind: 'cost',
            resultCap: 'ödenen'
        }));
        setCraftLines.push(row.matSetup
            ? explainStep({
                label: 'Alış komisyonu (SET craft)',
                note: 'Buy emri koyunca %2,5 setup fee',
                formula: [
                    explainNum(row.setCraftKeep, { tone: 'cost', cap: 'ödenen' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ],
                result: row.setCraft,
                resultKind: 'cost',
                resultCap: 'craft'
            })
            : explainStep({
                label: 'Alış komisyonu (SET craft)',
                note: 'Anında alış; setup fee yok',
                result: row.setCraft,
                resultKind: 'cost',
                resultCap: 'craft'
            }));
    }

    const setBuyLines = [];
    if (row.setPick && row.setLine) {
        setBuyLines.push(explainStep({
            icon: setIcon,
            label: setLabel(row.setPick.uniqueName),
            note: 'Excellent SET · en ucuz SET1/2/3 (MP yok)',
            formula: [
                explainNum(row.setLine.qty, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(row.setPick.quote.price, { tone: 'price', cap: 'birim' })
            ],
            result: row.setBuyRaw,
            resultKind: 'cost',
            resultCap: 'SET'
        }));
        setBuyLines.push(row.matSetup
            ? explainStep({
                label: 'Alış komisyonu (SET buy)',
                note: 'Buy emri koyunca %2,5 setup fee',
                formula: [
                    explainNum(row.setBuyRaw, { tone: 'cost', cap: 'SET' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ],
                result: row.setBuy,
                resultKind: 'cost',
                resultCap: 'buy'
            })
            : explainStep({
                label: 'Alış komisyonu (SET buy)',
                note: 'Anında alış; setup fee yok',
                result: row.setBuy,
                resultKind: 'cost',
                resultCap: 'buy'
            }));
    }
    setBuyLines.push(explainStep({
        label: 'Seçilen SET',
        note: state.setPath === 'craft'
            ? 'Mod: Craft — yalnız craft maliyeti'
            : state.setPath === 'buy'
                ? 'Mod: Buy — yalnız Excellent pazar alış'
                : row.setSource === 'buy'
                    ? 'Mod: Min — Excellent buy craft’tan ucuz (veya eşit)'
                    : row.setSource === 'craft'
                        ? 'Mod: Min — SET craft buy’dan ucuz'
                        : 'Eksik fiyat',
        formula: [
            explainNum(row.setCraft, { tone: 'cost', cap: 'craft' }),
            explainOp('vs'),
            explainNum(row.setBuy, { tone: 'cost', cap: 'buy' })
        ],
        result: row.setCost,
        resultKind: 'cost',
        resultCap: row.setSource === 'buy' ? 'buy' : 'craft'
    }));

    const sigilLines = [
        explainStep({
            icon: sigilIcon,
            label: row.sealedSigil ? 'Sealed Royal Sigil' : 'Royal Sigil',
            note: row.sealedSigil
                ? 'Sealed birim fiyat × tarifedeki adet · tüm tier aynı birim · RR yok'
                : 'Aynı tier sigil · RR yok',
            formula: [
                explainNum(row.sigilQty, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(sigilUnit, { tone: 'price', cap: 'birim' })
            ],
            result: row.sigilRaw,
            resultKind: 'cost',
            resultCap: 'sigil'
        }),
        row.matSetup
            ? explainStep({
                label: 'Alış komisyonu (sigil)',
                note: 'Buy emri koyunca %2,5 setup fee',
                formula: [
                    explainNum(row.sigilRaw, { tone: 'cost', cap: 'sigil' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ],
                result: row.sigilCost,
                resultKind: 'cost',
                resultCap: 'sigil'
            })
            : explainStep({
                label: 'Alış komisyonu (sigil)',
                note: 'Anında alış; setup fee yok',
                result: row.sigilCost,
                resultKind: 'cost',
                resultCap: 'sigil'
            })
    ];

    const enchantLines = [
        explainStep({
            label: `Enchant 0 → .${row.enchant}`,
            note: `Rune/soul/relic × slot adedi (${enchantSlotQty(row.recipe.kind)})`,
            result: row.enchantRaw,
            resultKind: 'cost',
            resultCap: 'ham'
        }),
        row.matSetup
            ? explainStep({
                label: 'Alış komisyonu (enchant)',
                note: 'Buy emri koyunca %2,5 setup fee',
                formula: [
                    explainNum(row.enchantRaw, { tone: 'cost', cap: 'ham' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ],
                result: row.enchantBuy,
                resultKind: 'cost',
                resultCap: 'enchant'
            })
            : explainStep({
                label: 'Alış komisyonu (enchant)',
                note: 'Anında alış; setup fee yok',
                result: row.enchantBuy,
                resultKind: 'cost',
                resultCap: 'enchant'
            }),
        explainStep({
            label: 'Toplam maliyet',
            note: `${state.setPath === 'craft' ? 'SET craft' : state.setPath === 'buy' ? 'SET Ex buy' : 'min(SET craft, SET Ex buy)'} + sigil + enchant`,
            formula: [
                explainNum(row.setCost, { tone: 'cost', cap: 'SET' }),
                explainOp('+'),
                explainNum(row.sigilCost, { tone: 'cost', cap: 'sigil' }),
                explainOp('+'),
                explainNum(row.enchantBuy, { tone: 'cost', cap: 'enchant' })
            ],
            result: row.cost,
            resultKind: 'cost',
            resultCap: 'maliyet'
        })
    ];

    return explainPanelHtml({
        icon: itemIcon,
        title,
        hint: explainHint(hovered),
        flow: explainFlow([
            { icon: itemIcon, label: 'Maliyet', value: row.cost, tone: 'cost' },
            { label: 'Net satış', value: row.sell, tone: 'sell' },
            {
                label: row.profit < 0 ? 'Zarar' : 'Kâr',
                value: row.profit,
                tone: row.profit < 0 ? 'loss' : 'profit',
                signed: true
            }
        ]),
        groups: [
            {
                title: `İade  ${formatPct(rr)}`,
                tone: 'rr',
                intro: explainChips([
                    { label: 'şehir', value: cityProductionBonus(), tone: 'city', title: 'Şehir craft üretim bonusu' }
                ]),
                lines: [
                    explainStep({
                        label: 'İade oranı',
                        note: 'bonus / (100 + bonus) — yalnız SET craft-from-mats; royal craft ve sigil RR almaz',
                        formula: [
                            explainNum(bonus, { kind: 'qty', tone: 'bonus', cap: 'bonus' }),
                            explainOp('/'),
                            explainNum(100 + bonus, { kind: 'qty', cap: 'taban' })
                        ],
                        result: rr,
                        resultKind: 'rr',
                        resultCap: 'iade'
                    })
                ]
            },
            { title: 'SET craft-from-mats', tone: 'cost', lines: setCraftLines },
            { title: 'SET Excellent buy vs craft', tone: 'cost', lines: setBuyLines },
            { title: row.sealedSigil ? 'Sealed sigil' : 'Sigil', tone: 'cost', lines: sigilLines },
            { title: 'Enchant + toplam', tone: 'cost', lines: enchantLines },
            {
                title: 'Satış',
                tone: 'sell',
                lines: explainSaleSteps({
                    price: row.sellQuote?.price,
                    tax,
                    setup: sellSetup,
                    sell: row.sell,
                    label: row.sellProxyQuality
                        ? `${cityLabel(state.sellCity)} · ${row.quality.label} yok → ${row.sellProxyQuality.label} fiyatı (proxy)`
                        : `${cityLabel(state.sellCity)} · ${row.quality.label}`,
                    icon: itemIcon
                })
            }
        ],
        footer: explainProfitFoot({
            sell: row.sell,
            cost: row.cost,
            profit: row.profit,
            pct: row.pct
        })
    });
}

function bindExplain(container) {
    bindCalcExplain({
        panel: container.querySelector('#royalExplain'),
        table: container.querySelector('.royal-table'),
        rowKey: (tr) => tr.dataset.rowId,
        keys: () => rows().map((row) => row.id),
        defaultKey: () => bestExplainKey(sortedRows()),
        render: (key, meta) => renderRoyalExplain(key, meta)
    });
}

function renderCalc() {
    if (state.error) {
        return `<div class="alert alert-info" id="royalCalc">${escapeHtml(state.error)}</div>`;
    }
    if (!state.loaded) {
        return '<div id="royalCalc"></div>';
    }
    const list = sortedRows();
    const stamp = formatDateTime(latestDate(list));
    return `
        <div id="royalCalc">
            ${renderTable(list)}
            ${calcExplainShell('royalExplain')}
            ${renderSummary(list)}
            ${stamp ? `<p class="farming-note">${escapeHtml(stamp)}</p>` : ''}
        </div>
    `;
}

function renderOutput() {
    return `
        <div id="royalResult" class="royal-result">
            ${renderMatStrip()}
            ${renderCalc()}
        </div>
    `;
}

function renderPage(container) {
    state.tier = normalizeTierFilter(state.tier);
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Royal Crafting</h1>
            <p>SET’i mat’tan craft veya Excellent buy ile al (min), Royal Sigil (veya Sealed) ekle — royal craft’ta RR yok — sonra 0→.3 enchant ile satış kârını gör.</p>
        </section>
        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="farming-toolbar royal-toolbar">
                    <div class="farming-type" role="radiogroup" aria-label="T.E kapsamı">
                        ${renderToggle([
                            { id: 'standard', label: 'Standart T.E' },
                            { id: 'all', label: 'Tüm T.E' }
                        ], state.scope, 'scope')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Tier">
                        ${renderToggle(standardTierOptions(), String(state.tier), 'tier-filter')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Tip">
                        ${renderToggle([
                            { id: 'all', label: 'Hepsi' },
                            { id: 'plate', label: 'Plate' },
                            { id: 'leather', label: 'Leather' },
                            { id: 'cloth', label: 'Cloth' }
                        ], state.type, 'type')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Slot">
                        ${renderToggle([
                            { id: 'all', label: 'Hepsi' },
                            { id: 'head', label: 'Kafa' },
                            { id: 'armor', label: 'Gövde' },
                            { id: 'shoes', label: 'Ayak' }
                        ], state.slot, 'slot')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Ana ürün maliyeti">
                        ${renderToggle([
                            { id: 'min', label: 'Min' },
                            { id: 'craft', label: 'Craft' },
                            { id: 'buy', label: 'Buy' }
                        ], state.setPath, 'set-path')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Sigil">
                        ${renderToggle([
                            { id: '0', label: 'Sigil' },
                            { id: '1', label: 'Sealed sigil' }
                        ], state.sealedSigil ? '1' : '0', 'sealed')}
                    </div>
                    <div id="royalSealedPrice" class="royal-sealed-control">
                        ${renderSealedMatField()}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Kalite">
                        ${renderToggle([
                            { id: 'both', label: 'Ex+MP' },
                            { id: '4', label: 'Ex' },
                            { id: '5', label: 'MP' }
                        ], state.quality, 'quality')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Premium">
                        ${renderToggle([
                            { id: '1', label: 'Premium' },
                            { id: '0', label: 'Premium yok' }
                        ], state.premium ? '1' : '0', 'premium')}
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="royalMatSideLabel">Alış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="royalMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="royalItemSideLabel">Satış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="royalItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    ${cityFieldHtml({
                        id: 'royalBuyCity',
                        label: 'Alış şehri',
                        selected: state.buyCity,
                        cities: state.cities
                    })}
                    ${cityFieldHtml({
                        id: 'royalSellCity',
                        label: 'Satış şehri',
                        selected: state.sellCity,
                        cities: state.cities
                    })}
                    ${priceRefreshActionsHtml({ refreshId: 'royalRefresh', apiId: 'royalRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;
    bindPage(container);
    bindTableSort(container);
    bindPriceInputs(container);
    bindExplain(container);
    bindCalcSticky(container);
    mountPlanFab(container);
}

function syncToggleGroup(container, attr, selected) {
    const value = String(selected);
    container.querySelectorAll(`[${attr}]`).forEach((button) => {
        const pressed = button.getAttribute(attr) === value;
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

function applyControls(container) {
    state.tier = normalizeTierFilter(state.tier);
    syncToggleGroup(container, 'data-scope', state.scope);
    syncToggleGroup(container, 'data-tier-filter', String(state.tier));
    syncToggleGroup(container, 'data-type', state.type);
    syncToggleGroup(container, 'data-slot', state.slot);
    syncToggleGroup(container, 'data-quality', state.quality);
    syncToggleGroup(container, 'data-set-path', state.setPath);
    syncToggleGroup(container, 'data-sealed', state.sealedSigil ? '1' : '0');
    syncToggleGroup(container, 'data-premium', state.premium ? '1' : '0');
    container.querySelectorAll('[data-price-for]').forEach((button) => {
        const current = button.dataset.priceFor === 'item' ? state.itemSide : state.matSide;
        const pressed = button.dataset.priceSide === current;
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
    const buy = container.querySelector('#royalBuyCity');
    const sell = container.querySelector('#royalSellCity');
    if (buy) {
        setCityFieldValue(container, 'royalBuyCity', state.buyCity);
    }
    if (sell) {
        setCityFieldValue(container, 'royalSellCity', state.sellCity);
    }
}

function bindTableSort(container) {
    const table = container.querySelector('.royal-table');
    if (!table) {
        return;
    }
    initTableSort(table, {
        initial: state.sort.key === 'priority' ? null : state.sort,
        onSort({ key, direction }) {
            state.sort = { key, direction };
        }
    });
}

function refreshCalc(container) {
    const calc = container.querySelector('#royalCalc');
    if (!calc) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderCalc();
    calc.replaceWith(wrap.querySelector('#royalCalc'));
    bindTableSort(container);
    bindExplain(container);
    bindCalcSticky(container);
}

function refreshView(container, { remountMats = false } = {}) {
    applyControls(container);
    if (remountMats) {
        remountMatStrip(container);
    } else {
        patchMatStrip(container);
    }
    const sealedCard = container.querySelector(`[data-mat-card="${SEALED_SIGIL_KEY}"]`);
    sealedCard?.classList.toggle('is-active', state.sealedSigil);
    refreshCalc(container);
}

function bindPriceInputs(container) {
    initFloatingLabels(container);
    container.querySelectorAll('[data-mat-price]').forEach((input) => {
        if (input.dataset.priceBound === 'on') {
            return;
        }
        input.dataset.priceBound = 'on';
        input.addEventListener('input', () => {
            state.manualMats[input.dataset.matPrice] = input.value;
            refreshCalc(container);
        });
        input.addEventListener('change', () => {
            const key = input.dataset.matPrice;
            if (parsePrice(input.value) == null) {
                state.manualMats[key] = null;
            }
            patchMatStrip(container);
            refreshCalc(container);
        });
    });
}

function bindCitySelect(container, id, assign) {
    bindCityField(container, id.replace(/^#/, ''), (value) => {
        assign(value);
        savePrefs();
        applyControls(container);
        loadPrices(container, { showLoader: false });
    });
}

function bindPage(container) {
    container.querySelectorAll('[data-scope]').forEach((button) => {
        button.addEventListener('click', () => {
            if (state.scope === button.dataset.scope) {
                return;
            }
            state.scope = button.dataset.scope;
            savePrefs();
            applyControls(container);
            loadPrices(container, { showLoader: false });
        });
    });
    container.querySelectorAll('[data-type]').forEach((button) => {
        button.addEventListener('click', () => {
            if (state.type === button.dataset.type) {
                return;
            }
            state.type = button.dataset.type;
            savePrefs();
            applyControls(container);
            loadPrices(container, { showLoader: false });
        });
    });
    container.querySelectorAll('[data-slot]').forEach((button) => {
        button.addEventListener('click', () => {
            if (state.slot === button.dataset.slot) {
                return;
            }
            state.slot = button.dataset.slot;
            savePrefs();
            applyControls(container);
            loadPrices(container, { showLoader: false });
        });
    });
    container.querySelectorAll('[data-tier-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            const next = normalizeTierFilter(button.dataset.tierFilter);
            if (String(state.tier) === String(next)) {
                return;
            }
            state.tier = next;
            savePrefs();
            applyControls(container);
            loadPrices(container, { showLoader: false });
        });
    });
    container.querySelectorAll('[data-quality]').forEach((button) => {
        button.addEventListener('click', () => {
            if (state.quality === button.dataset.quality) {
                return;
            }
            state.quality = button.dataset.quality;
            savePrefs();
            applyControls(container);
            loadPrices(container, { showLoader: false });
        });
    });
    container.querySelectorAll('[data-set-path]').forEach((button) => {
        button.addEventListener('click', () => {
            const next = button.dataset.setPath;
            if (next !== 'min' && next !== 'craft' && next !== 'buy') {
                return;
            }
            if (state.setPath === next) {
                return;
            }
            state.setPath = next;
            savePrefs();
            applyControls(container);
            refreshView(container);
        });
    });
    container.querySelectorAll('[data-sealed]').forEach((button) => {
        button.addEventListener('click', () => {
            const sealed = button.dataset.sealed === '1';
            if (sealed === state.sealedSigil) {
                return;
            }
            state.sealedSigil = sealed;
            savePrefs();
            refreshView(container);
        });
    });
    container.querySelectorAll('[data-premium]').forEach((button) => {
        button.addEventListener('click', () => {
            const premium = button.dataset.premium === '1';
            if (premium === state.premium) {
                return;
            }
            state.premium = premium;
            savePrefs();
            refreshView(container);
        });
    });
    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const side = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            if (button.dataset.priceFor === 'item') {
                if (state.itemSide === side) {
                    return;
                }
                state.itemSide = side;
            } else {
                if (state.matSide === side) {
                    return;
                }
                state.matSide = side;
            }
            savePrefs();
            refreshView(container);
        });
    });
    bindCitySelect(container, '#royalBuyCity', (value) => {
        state.buyCity = value;
        state.sellCity = value;
    });
    bindCitySelect(container, '#royalSellCity', (value) => {
        state.sellCity = value;
    });
    bindPriceRefresh(container, {
        refreshId: 'royalRefresh',
        apiId: 'royalRefreshApi',
        load: (options) => loadPrices(container, options)
    });
}

async function loadPrices(container, { source, showLoader = true } = {}) {
    ensureManualMaps();
    applyPriceLoadMode(state, { source, showLoader });
    const ids = allPriceIds();
    const qualities = [...new Set([1, SET_BUY_QUALITY, ...QUALITIES.map((row) => row.id)])];
    if (showLoader) {
        showPageLoader(priceLoaderMessage(source));
    }
    try {
        const rowsData = await fetchPrices(ids, [state.buyCity, state.sellCity], {
            source,
            qualities
        });
        state.priceIndex = indexPrices(rowsData);
        syncWizardRecent();
        state.error = null;
        state.loaded = true;
    } catch (error) {
        state.error = error.message || 'Fiyat alınamadı';
        state.loaded = true;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        applyControls(container);
        patchMatStrip(container);
        refreshCalc(container);
        refreshOpenRoyalWizard(container);
    }
}

async function boot() {
    const container = document.querySelector('#royalTool');
    if (!container) {
        return;
    }
    await initStore();
    initNav();
    const settings = getSettings();
    state.premium = settings.premium;
    state.matSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;
    loadPrefs();
    state.cities = loadActiveCities();
    const cityFallback = fallbackCity(state.cities);
    if (!state.cities.some((city) => city.marketApiName === state.buyCity)) {
        state.buyCity = cityFallback;
    }
    if (!state.cities.some((city) => city.marketApiName === state.sellCity)) {
        state.sellCity = state.buyCity;
    }
    renderPage(container);
    await loadPrices(container);
    bindLivePrices(
        () => ({
            items: allPriceIds(),
            cities: [state.buyCity, state.sellCity],
            pause: state.livePaused
        }),
        () => loadPrices(container, { showLoader: false })
    );
}

boot();
