import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getSettings, getStandardCombos, getDefaultCity } from './settings.js';
import {
    fetchPrices,
    indexPrices,
    cityRow,
    priceRefreshActionsHtml,
    bindPriceRefresh,
    priceLoaderMessage,
    applyPriceLoadMode
} from './market.js';
import { itemIconHtml } from './item-icon.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { initFloatingLabels } from './forms.js';
import { initTableSort, parseSortNumber, sortHeaderHtml } from './table-sort.js';
import { purchaseCost, saleProceeds, placesOrder, feeMetaText, SETUP_FEE, salesTaxRate } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { bindLivePrices } from './price-live.js';
import { loadActiveCities } from './cities.js';
import {
    getCraftRecipes,
    cityProductionBonus,
    getEnchantSlots,
    getEnchantSteps
} from './catalog.js';
import {
    quoteFromRow,
    priceSideHint,
    priceSideToggleHtml,
    priceFieldHtml,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from './price-side.js';
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
} from './calc-explain.js';

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

function renderCityOptions(selected) {
    return state.cities.map((city) => {
        const current = city.marketApiName === selected ? ' selected' : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${current}>${escapeHtml(city.displayName)}</option>`;
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
                            `is-tier-${row.recipe.tier}`,
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
        <div id="royalResult">
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
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="royalBuyCity">
                            ${renderCityOptions(state.buyCity)}
                        </select>
                        <label for="royalBuyCity">Alış şehri</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="royalSellCity">
                            ${renderCityOptions(state.sellCity)}
                        </select>
                        <label for="royalSellCity">Satış şehri</label>
                    </div>
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
        buy.value = state.buyCity;
    }
    if (sell) {
        sell.value = state.sellCity;
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
    container.querySelector(id)?.addEventListener('change', (event) => {
        assign(event.target.value);
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
        const qualities = [...new Set([1, SET_BUY_QUALITY, ...selectedQualities().map((row) => row.id)])];
    if (showLoader) {
        showPageLoader(priceLoaderMessage(source));
    }
    try {
        const rowsData = await fetchPrices(ids, [state.buyCity, state.sellCity], {
            source,
            qualities
        });
        state.priceIndex = indexPrices(rowsData);
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
