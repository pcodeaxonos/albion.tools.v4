import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getBonusFamilyLabel } from './bonus-families.js';
import { bonusDayIso, bonusWindowLabel } from './bonus-day.js';
import { defaultCraftBonusRate, normalizeCraftBonusRate, todayCraftBonuses, craftBonusToggleHtml } from './craft-bonus.js';
import { getSettings } from './settings.js';
import { fetchPrices, indexPrices, cityRow, priceRefreshActionsHtml, bindPriceRefresh, priceLoaderMessage, applyPriceLoadMode } from './market.js';
import { itemIconHtml, itemLabel } from './item-icon.js';
import { showPageLoader, hidePageLoader, showAreaLoader, hideAreaLoader } from './loader.js';
import { initFloatingLabels } from './forms.js';
import { initTableSort, parseSortNumber, sortHeaderHtml } from './table-sort.js';
import {
    quoteFromRow,
    priceSideHint,
    priceSideToggleHtml,
    priceFieldClass,
    priceFieldTitle,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder, feeMetaText } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadActiveCities } from './cities.js';
import { bonusCityApiName } from './bonus-cities.js';
import { bindLivePrices } from './price-live.js';
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

const CITY_PRODUCTION = 18;
const CITY_RESOURCE = 40;
const FOCUS_PRODUCTION = 59;
const PREFS_STORAGE_KEY = 'albiontools.v4.refining.prefs';
const TIERS = [2, 3, 4, 5, 6, 7, 8];
const RAW_QTY = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 5 };
const LOWER_QTY = { 2: 0, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 };

const FAMILIES = [
    { id: 'ore', label: 'Ore', hamWord: 'ore', outWord: 'Bar', raw: 'ORE', out: 'METALBAR', bonusKey: 'resources/ore' },
    { id: 'wood', label: 'Wood', hamWord: 'odun', outWord: 'Plank', raw: 'WOOD', out: 'PLANKS', bonusKey: 'resources/wood' },
    { id: 'hide', label: 'Hide', hamWord: 'hide', outWord: 'Leather', raw: 'HIDE', out: 'LEATHER', bonusKey: 'resources/hide' },
    { id: 'fiber', label: 'Fiber', hamWord: 'fiber', outWord: 'Cloth', raw: 'FIBER', out: 'CLOTH', bonusKey: 'resources/fiber' },
    { id: 'stone', label: 'Stone', hamWord: 'taş', outWord: 'Block', raw: 'ROCK', out: 'STONEBLOCK', bonusKey: 'resources/rock' }
];

const state = {
    premium: true,
    rawSide: 'buy',
    itemSide: 'sell',
    family: 'ore',
    enchant: 0,
    chain: 'market',
    focus: false,
    buyCity: 'Martlock',
    refineCity: 'Martlock',
    sellCity: 'Martlock',
    cities: [],
    bonusRate: 0,
    priceIndex: null,
    manualRaw: {},
    manualOut: {},
    error: null,
    loaded: false,
    livePaused: false,
    sort: { key: 'profit', direction: 'desc' }
};

function currentFamily() {
    return FAMILIES.find((family) => family.id === state.family) ?? FAMILIES[0];
}

function familyCity(family = currentFamily()) {
    return bonusCityApiName(family.bonusKey);
}

function resourceId(stem, tier, enchant) {
    const level = tier < 4 ? 0 : enchant;
    if (level === 0) {
        return `T${tier}_${stem}`;
    }
    return `T${tier}_${stem}_LEVEL${level}@${level}`;
}

function rowEnchant(tier) {
    return tier < 4 ? 0 : state.enchant;
}

function lowerSpec(tier, enchant) {
    if (enchant > 0) {
        return { tier, enchant: enchant - 1 };
    }
    if (tier <= 2) {
        return null;
    }
    return { tier: tier - 1, enchant: 0 };
}

function allUniqueNames() {
    const family = currentFamily();
    const ids = [];
    for (const tier of TIERS) {
        ids.push(resourceId(family.raw, tier, 0), resourceId(family.out, tier, 0));
        if (tier >= 4) {
            for (const enchant of [1, 2, 3]) {
                ids.push(resourceId(family.raw, tier, enchant), resourceId(family.out, tier, enchant));
            }
        }
    }
    return [...new Set(ids)];
}

function itemDisplayName(uniqueName, enchant) {
    const base = uniqueName.replace(/_LEVEL\d+@\d+$/, '');
    const name = itemLabel(base, base);
    return enchant > 0 ? `${name} .${enchant}` : name;
}

function formatSilver(value, { unsigned = false, signed = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(value) : value;
    const text = Math.round(amount).toLocaleString('tr-TR');
    if (signed && value > 0) {
        return `+${text}`;
    }
    return text;
}

function formatPct(ratio, { unsigned = false } = {}) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(ratio) : ratio;
    return `${(amount * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
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

function cityNames() {
    return state.cities.map((city) => city.marketApiName).filter(Boolean);
}

function cityLabel(apiName) {
    return state.cities.find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

function hasCityBonus() {
    return state.refineCity === familyCity();
}

function productionBonus() {
    return CITY_PRODUCTION
        + (hasCityBonus() ? CITY_RESOURCE : 0)
        + state.bonusRate
        + (state.focus ? FOCUS_PRODUCTION : 0);
}

function returnRate() {
    const bonus = productionBonus();
    return bonus / (100 + bonus);
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

function fetchedQuote(uniqueName, city, side, intent) {
    if (!state.priceIndex) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, uniqueName, city), side, intent);
}

function otherSide(side) {
    return side === 'buy' ? 'sell' : 'buy';
}

/** Buy this item: preferred book, then the other book (instant take if buy is empty). */
function quotePurchase(uniqueName, city, preferredSide) {
    return fetchedQuote(uniqueName, city, preferredSide, 'buy')
        ?? fetchedQuote(uniqueName, city, otherSide(preferredSide), 'buy');
}

function quoteRaw(uniqueName) {
    const parsed = parsePrice(state.manualRaw[uniqueName]);
    if (parsed != null) {
        return manualQuote(parsed, state.rawSide, 'buy');
    }
    return fetchedQuote(uniqueName, state.buyCity, state.rawSide, 'buy');
}

function quoteOut(uniqueName) {
    const parsed = parsePrice(state.manualOut[uniqueName]);
    if (parsed != null) {
        return manualQuote(parsed, state.itemSide, 'sell');
    }
    return fetchedQuote(uniqueName, state.sellCity, state.itemSide, 'sell');
}

function quoteLower(uniqueName) {
    return quotePurchase(uniqueName, state.buyCity, state.rawSide);
}

function readPrefs(cities) {
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) {
            return false;
        }
        const parsed = JSON.parse(raw);
        if (FAMILIES.some((family) => family.id === parsed.family)) {
            state.family = parsed.family;
        }
        const enchant = Number(parsed.enchant);
        if ([0, 1, 2, 3].includes(enchant)) {
            state.enchant = enchant;
        }
        if (parsed.chain === 'full' || parsed.chain === 'market') {
            state.chain = parsed.chain;
        }
        state.focus = parsed.focus === true;
        const pick = (value, fallback) => (
            cities.some((city) => city.marketApiName === value) ? value : fallback
        );
        const fallback = specialtyCityName(cities);
        state.buyCity = pick(parsed.buyCity, fallback);
        state.refineCity = pick(parsed.refineCity, fallback);
        state.sellCity = pick(parsed.sellCity, state.buyCity);
        return true;
    } catch {
        return false;
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
            family: state.family,
            enchant: state.enchant,
            chain: state.chain,
            focus: state.focus,
            buyCity: state.buyCity,
            refineCity: state.refineCity,
            sellCity: state.sellCity
        }));
    } catch {
        /* ignore */
    }
}

function specialtyCityName(cities) {
    const specialty = cities.find((city) => city.marketApiName === familyCity());
    return specialty?.marketApiName ?? cities[0]?.marketApiName ?? 'Martlock';
}

function applyFamilyCityDefaults(cities, { preferSpecialty = false } = {}) {
    const fallback = specialtyCityName(cities);
    if (preferSpecialty) {
        state.buyCity = fallback;
        state.refineCity = fallback;
        state.sellCity = fallback;
        return;
    }
    if (!cities.some((city) => city.marketApiName === state.buyCity)) {
        state.buyCity = fallback;
    }
    if (!cities.some((city) => city.marketApiName === state.refineCity)) {
        state.refineCity = fallback;
    }
    if (!cities.some((city) => city.marketApiName === state.sellCity)) {
        state.sellCity = state.buyCity;
    }
}

function applyRefineCityForFamily(cities) {
    const specialty = specialtyCityName(cities);
    if (cities.some((city) => city.marketApiName === specialty)) {
        state.refineCity = specialty;
    }
}

function computeCost(tier, enchant, cache) {
    const key = `${tier}.${enchant}`;
    if (cache.has(key)) {
        return cache.get(key);
    }

    const family = currentFamily();
    const rawId = resourceId(family.raw, tier, enchant);
    const rawQuote = quoteRaw(rawId);
    if (!rawQuote) {
        cache.set(key, null);
        return null;
    }

    const hamNet = purchaseCost(rawQuote.price, { setup: rawQuote.setup });
    const rawQty = RAW_QTY[tier];
    const lowerQty = LOWER_QTY[tier];
    const lower = lowerSpec(tier, enchant);
    let altNet = 0;

    if (lowerQty > 0 && lower) {
        if (state.chain === 'full') {
            altNet = computeCost(lower.tier, lower.enchant, cache);
        } else {
            const lowerId = resourceId(family.out, lower.tier, lower.enchant);
            const lowerQuote = quoteLower(lowerId);
            altNet = lowerQuote ? purchaseCost(lowerQuote.price, { setup: lowerQuote.setup }) : null;
        }
        if (altNet == null) {
            cache.set(key, null);
            return null;
        }
    }

    const cost = rawQty * hamNet * (1 - returnRate()) + altNet * lowerQty;
    cache.set(key, cost);
    return cost;
}

function rows() {
    const family = currentFamily();
    const cache = new Map();
    const rr = returnRate();

    return TIERS.map((tier) => {
        const enchant = rowEnchant(tier);
        const rawId = resourceId(family.raw, tier, enchant);
        const outId = resourceId(family.out, tier, enchant);
        const rawQuote = quoteRaw(rawId);
        const outQuote = quoteOut(outId);
        const cost = computeCost(tier, enchant, cache);
        const sell = outQuote
            ? saleProceeds(outQuote.price, { premium: state.premium, setup: outQuote.setup })
            : null;
        const profit = cost != null && sell != null ? sell - cost : null;
        const pct = profit != null && cost > 0 ? profit / cost : null;
        const lower = lowerSpec(tier, enchant);
        const lowerId = lower ? resourceId(family.out, lower.tier, lower.enchant) : null;
        const lowerGap = Boolean(lowerId) && LOWER_QTY[tier] > 0 && cost == null
            && (state.chain === 'full'
                ? computeCost(lower.tier, lower.enchant, cache) == null
                : !quoteLower(lowerId));

        return {
            id: `t${tier}`,
            tier,
            enchant,
            rawId,
            outId,
            rawQty: RAW_QTY[tier],
            lowerQty: LOWER_QTY[tier],
            rawQuote,
            outQuote,
            rr,
            cost,
            sell,
            profit,
            pct,
            lowerGap
        };
    });
}

function bestRow(list) {
    let best = null;
    for (const row of list) {
        if (row.profit == null) {
            continue;
        }
        if (best == null || row.profit > best.profit) {
            best = row;
        }
    }
    return best;
}

function profitClass(profit) {
    if (profit == null) {
        return '';
    }
    if (profit > 0) {
        return ' is-profit';
    }
    if (profit < 0) {
        return ' is-loss';
    }
    return '';
}

function chainNodes(tier, enchant) {
    const nodes = [];
    let currentTier = tier;
    let currentEnchant = enchant;
    while (true) {
        nodes.push({ tier: currentTier, enchant: currentEnchant, bought: false });
        const lower = lowerSpec(currentTier, currentEnchant);
        if (!lower || LOWER_QTY[currentTier] === 0) {
            break;
        }
        if (state.chain !== 'full') {
            nodes.push({ tier: lower.tier, enchant: lower.enchant, bought: true });
            break;
        }
        currentTier = lower.tier;
        currentEnchant = lower.enchant;
    }
    return nodes;
}

function explainIcon(uniqueName) {
    return itemIconHtml(uniqueName, { className: 'item-icon calc-explain-icon' });
}

function explainChainLines(row) {
    const family = currentFamily();
    const rr = row.rr;
    const keep = 1 - rr;
    const cache = new Map();
    const lines = [];

    for (const node of [...chainNodes(row.tier, row.enchant)].reverse()) {
        if (node.bought) {
            const id = resourceId(family.out, node.tier, node.enchant);
            const quote = quoteLower(id);
            const net = quote ? purchaseCost(quote.price, { setup: quote.setup }) : null;
            lines.push(explainStep({
                icon: explainIcon(id),
                label: `Alt ${itemDisplayName(id, node.enchant)}`,
                note: 'Bu kademeyi piyasadan alıyorsun; burada işlemiyorsun',
                formula: quote?.setup
                    ? [
                        explainNum(quote?.price, { tone: 'price', cap: 'birim fiyat' }),
                        explainOp('×'),
                        explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                    ]
                    : [explainNum(quote?.price, { tone: 'price', cap: 'birim fiyat' })],
                result: net,
                resultKind: 'cost',
                resultCap: 'alt maliyet'
            }));
            continue;
        }

        const outId = resourceId(family.out, node.tier, node.enchant);
        const rawId = resourceId(family.raw, node.tier, node.enchant);
        const rawQuote = quoteRaw(rawId);
        const hamNet = rawQuote ? purchaseCost(rawQuote.price, { setup: rawQuote.setup }) : null;
        const rawQty = RAW_QTY[node.tier];
        const lowerQty = LOWER_QTY[node.tier];
        const hamBook = rawQuote ? rawQty * rawQuote.price : null;
        const hamWithFee = hamNet != null ? rawQty * hamNet : null;
        const hamPart = hamNet != null ? rawQty * hamNet * keep : null;
        const cost = computeCost(node.tier, node.enchant, cache);
        const lower = lowerSpec(node.tier, node.enchant);
        let altNet = 0;
        if (lowerQty > 0 && lower) {
            if (state.chain === 'full') {
                altNet = computeCost(lower.tier, lower.enchant, cache);
            } else {
                const lowerId = resourceId(family.out, lower.tier, lower.enchant);
                const lowerQuote = quoteLower(lowerId);
                altNet = lowerQuote ? purchaseCost(lowerQuote.price, { setup: lowerQuote.setup }) : null;
            }
        }

        lines.push(explainStep({
            icon: explainIcon(rawId),
            label: `T${node.tier} ${family.hamWord}`,
            note: 'Tarifteki ham madde adedi × birim alış',
            formula: [
                explainNum(rawQty, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(rawQuote?.price, { tone: 'price', cap: 'birim fiyat' })
            ],
            result: hamBook,
            resultKind: 'cost',
            resultCap: 'ham tutarı'
        }));
        if (rawQuote?.setup) {
            lines.push(explainStep({
                label: 'Alış komisyonu',
                note: 'Buy emri koyunca %2,5 setup fee',
                formula: [
                    explainNum(hamBook, { tone: 'cost', cap: 'ham tutarı' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ],
                result: hamWithFee,
                resultKind: 'cost',
                resultCap: 'ham + setup'
            }));
        }
        lines.push(explainStep({
            label: 'İade sonrası',
            note: `Ham maddenin ${formatPct(rr)}’si istasyona geri döner; ödediğin pay ${formatPct(keep)}`,
            formula: [
                explainNum(hamWithFee ?? hamBook, {
                    tone: 'cost',
                    cap: rawQuote?.setup ? 'ham + setup' : 'ham tutarı'
                }),
                explainOp('×'),
                explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen pay' })
            ],
            result: hamPart,
            resultKind: 'cost',
            resultCap: 'ödenen ham'
        }));
        if (lowerQty > 0) {
            lines.push(explainStep({
                icon: explainIcon(outId),
                label: itemDisplayName(outId, node.enchant),
                note: 'Ödenen ham + alt kademe maliyeti',
                formula: [
                    explainNum(hamPart, { tone: 'cost', cap: 'ödenen ham' }),
                    explainOp('+'),
                    explainNum(lowerQty, { kind: 'qty', cap: 'alt adet' }),
                    explainOp('×'),
                    explainNum(altNet, { tone: 'cost', cap: 'alt birim' })
                ],
                result: cost,
                resultKind: 'cost',
                resultCap: 'maliyet'
            }));
        } else {
            lines.push(explainStep({
                icon: explainIcon(outId),
                label: itemDisplayName(outId, node.enchant),
                note: 'Alt kademe yok; maliyet yalnız ham madde',
                result: cost,
                resultKind: 'cost',
                resultCap: 'maliyet'
            }));
        }
    }

    return lines;
}

function renderRefiningExplain(key, { hovered } = {}) {
    const row = rows().find((item) => item.id === key);
    if (!row) {
        return explainEmptyHtml('Satır bulunamadı.');
    }

    const bonus = productionBonus();
    const rr = row.rr;
    const tax = salesTaxRate(state.premium);
    const sellSetup = row.outQuote?.setup ?? placesOrder('sell', state.itemSide);
    const outIcon = explainIcon(row.outId);
    const chips = [{
        label: 'şehir',
        value: CITY_PRODUCTION,
        tone: 'city',
        title: 'Her şehir istasyonunda taban üretim bonusu'
    }];
    if (hasCityBonus()) {
        chips.push({
            label: 'uzman',
            value: CITY_RESOURCE,
            tone: 'spec',
            title: `Bu hammadde ${cityLabel(familyCity())} uzmanı; işle şehri orasıysa +40`
        });
    }
    if (state.bonusRate) {
        chips.push({
            label: 'bonus',
            value: state.bonusRate,
            tone: 'bonus',
            title: 'Günlük craft / refine bonusu'
        });
    }
    if (state.focus) {
        chips.push({
            label: 'focus',
            value: FOCUS_PRODUCTION,
            tone: 'focus',
            title: 'Focus kullanınca ek üretim bonusu'
        });
    }

    const chainTitle = state.chain === 'full' ? 'Maliyet · tam zincir' : 'Maliyet · alt kademe piyasadan';

    return explainPanelHtml({
        icon: outIcon,
        title: itemDisplayName(row.outId, row.enchant),
        hint: explainHint(hovered),
        flow: explainFlow([
            { icon: outIcon, label: 'Maliyet', value: row.cost, tone: 'cost' },
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
                intro: explainChips(chips),
                lines: [
                    explainStep({
                        label: 'İade oranı',
                        note: 'bonus / (100 + bonus) — istasyona geri gelen ham madde payı',
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
            { title: chainTitle, tone: 'cost', lines: explainChainLines(row) },
            {
                title: 'Satış',
                tone: 'sell',
                lines: explainSaleSteps({
                    price: row.outQuote?.price,
                    tax,
                    setup: sellSetup,
                    sell: row.sell,
                    label: cityLabel(state.sellCity),
                    icon: outIcon
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
        panel: container.querySelector('#refiningExplain'),
        table: container.querySelector('.farming-table'),
        rowKey: (tr) => tr.dataset.itemId,
        keys: () => rows().map((row) => row.id),
        defaultKey: () => bestRow(rows())?.id ?? rows()[0]?.id ?? null,
        render: (key, meta) => renderRefiningExplain(key, meta)
    });
}

function priceFieldHtml({ id, label, value, manual, missing, dataAttr }) {
    const filled = String(value ?? '').length > 0 ? ' is-filled' : '';
    const title = priceFieldTitle({ manual, missing });
    return `
        <div class="form-floating farming-price-field${priceFieldClass({ manual, missing })}"${title ? ` title="${escapeHtml(title)}"` : ''}>
            <input type="text" class="form-control${filled}" id="${escapeHtml(id)}"
                ${dataAttr} value="${escapeHtml(value)}" placeholder=" "
                inputmode="decimal" autocomplete="off" spellcheck="false">
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

function renderToggleGroup(name, options, selected, attr) {
    return options.map((option) => {
        const pressed = option.id === selected;
        return `
            <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                data-${attr}="${escapeHtml(String(option.id))}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderCityOptions(selected) {
    const family = currentFamily();
    return state.cities.map((city) => {
        const isSelected = city.marketApiName === selected ? ' selected' : '';
        const bonus = city.marketApiName === familyCity(family) ? ' · +40' : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${isSelected}>${escapeHtml(city.displayName)}${bonus}</option>`;
    }).join('');
}

function rrDetails() {
    const parts = [`RR ${formatPct(returnRate())}`];
    if (hasCityBonus()) {
        parts.push('şehir +40');
    }
    if (state.focus) {
        parts.push('focus açık');
    }
    if (state.bonusRate) {
        parts.push(`+${state.bonusRate}%`);
    }
    return parts.join(', ');
}

function renderBonusNote() {
    const recorded = todayCraftBonuses();
    const today = recorded.length === 0
        ? 'kayıt yok.'
        : recorded.map((bonus) =>
            `${escapeHtml(getBonusFamilyLabel(bonus.key))} +${bonus.rate}%`
        ).join(' · ');

    return `<p class="farming-note">Bugün (${escapeHtml(bonusWindowLabel(bonusDayIso()))}): ${today}
        <a href="daily-bonus.html">Günlük bonus</a>. ${escapeHtml(feeMetaText(state.premium))}.</p>`;
}

function renderSummary(list) {
    const best = bestRow(list);
    if (!best || best.profit == null) {
        return '<p class="farming-note" id="refiningSummary"><strong>Bu senaryoda kâr hesaplanamadı.</strong> Eksik fiyatları doldur.</p>';
    }
    if (best.profit <= 0) {
        return `<p class="farming-note" id="refiningSummary"><strong>Bu senaryoda zarar.</strong> En az zarar ${escapeHtml(itemDisplayName(best.outId, best.enchant))} · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.</p>`;
    }
    return `<p class="farming-note" id="refiningSummary"><strong>En kârlı ${escapeHtml(itemDisplayName(best.outId, best.enchant))}</strong> · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.</p>`;
}

function renderScenario() {
    const rawNote = `${priceSideHint(state.rawSide, 'buy')}${placesOrder('buy', state.rawSide) ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const outNote = `${priceSideHint(state.itemSide, 'sell')}${placesOrder('sell', state.itemSide) ? ` · setup ${formatPct(SETUP_FEE)}` : ''} · vergi ${formatPct(salesTaxRate(state.premium))}`;
    const chainNote = state.chain === 'full'
        ? 'Tam zincir T2’den'
        : 'Alt kademe alış şehrinden (buy yoksa sell kitaptan anında)';

    return `<p class="farming-note">Alış ${escapeHtml(cityLabel(state.buyCity))} · işle ${escapeHtml(cityLabel(state.refineCity))} (${escapeHtml(rrDetails())}) · satış ${escapeHtml(cityLabel(state.sellCity))}.
        Ham ${escapeHtml(rawNote)}. Ürün ${escapeHtml(outNote)}. ${escapeHtml(chainNote)}. Elle yazılan fiyat API’nin yerine geçer.</p>`;
}

function latestQuoteDate(list) {
    const dates = list
        .flatMap((row) => [row.rawQuote?.date, row.outQuote?.date])
        .filter(Boolean)
        .sort();
    return dates.length > 0 ? dates[dates.length - 1] : '';
}

function renderTable(list) {
    const best = bestRow(list);
    const sort = state.sort;
    const dir = (key) => (sort.key === key ? sort.direction : null);
    const family = currentFamily();

    const body = list.map((row) => {
        const rawFetched = fetchedQuote(row.rawId, state.buyCity, state.rawSide, 'buy');
        const outFetched = fetchedQuote(row.outId, state.sellCity, state.itemSide, 'sell');
        const rawValue = priceInputValue(state.manualRaw[row.rawId], rawFetched?.price);
        const outValue = priceInputValue(state.manualOut[row.outId], outFetched?.price);
        const bestClass = best && row.id === best.id ? ' is-best' : '';
        const bonus = state.bonusRate && row.enchant === state.enchant
            ? `<span class="farming-bonus">+${state.bonusRate}%</span>`
            : '';

        return `
            <tr data-item-id="${escapeHtml(row.id)}" class="${bestClass.trim()}">
                <td data-sort-value="${row.tier}">
                    <span class="farming-item">
                        ${itemIconHtml(row.outId)}
                        <span>
                            <span class="farming-item-name">${escapeHtml(itemDisplayName(row.outId, row.enchant))}${bonus}</span>
                            <span class="farming-item-meta">${itemIconHtml(row.rawId, { className: 'item-icon farming-seed-icon' })} ${row.rawQty} ${escapeHtml(family.hamWord)}${row.lowerQty ? ` + ${row.lowerQty} alt` : ''}${row.lowerGap ? ' · alt fiyat yok' : ''}</span>
                        </span>
                    </span>
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.rawQuote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `rawPrice-${row.id}`,
                        label: 'Ham',
                        value: rawValue,
                        manual: isManualPrice(state.manualRaw[row.rawId]),
                        missing: !rawFetched,
                        dataAttr: `data-raw-id="${escapeHtml(row.rawId)}"`
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.outQuote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `outPrice-${row.id}`,
                        label: family.outWord,
                        value: outValue,
                        manual: isManualPrice(state.manualOut[row.outId]),
                        missing: !outFetched,
                        dataAttr: `data-out-id="${escapeHtml(row.outId)}"`
                    })}
                </td>
                <td class="num farming-num${incompleteClass(row.cost)}" data-sort-value="${row.cost ?? ''}">${formatSilver(row.cost)}</td>
                <td class="num farming-num${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}">${formatSilver(row.sell)}</td>
                <td class="num farming-num${profitClass(row.profit)}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}">${formatSilver(row.profit, { signed: true })}</td>
                <td class="num farming-num${profitClass(row.profit)}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}">${formatPct(row.pct)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table calc-table">
                <colgroup>
                    <col class="farming-col-item">
                    <col class="farming-col-price">
                    <col class="farming-col-price">
                    <col class="farming-col-num">
                    <col class="farming-col-num">
                    <col class="farming-col-num">
                    <col class="farming-col-pct">
                </colgroup>
                <thead>
                    <tr>
                        ${sortHeaderHtml('Ürün', { key: 'item', type: 'number', direction: dir('item'), title: 'İşlenen kademe' })}
                        ${sortHeaderHtml('Ham', { key: 'raw', type: 'number', className: 'num farming-num', direction: dir('raw'), title: 'Hammadde alış fiyatı' })}
                        ${sortHeaderHtml(family.outWord, { key: 'out', type: 'number', className: 'num farming-num', direction: dir('out'), title: 'Ürün satış fiyatı' })}
                        ${sortHeaderHtml('Maliyet', { key: 'cost', type: 'number', className: 'num farming-num', direction: dir('cost'), title: 'RR ve fee düşülmüş maliyet' })}
                        ${sortHeaderHtml('Satış net', { key: 'sell', type: 'number', className: 'num farming-num', direction: dir('sell'), title: 'Vergi sonrası net satış' })}
                        ${sortHeaderHtml('Kâr', { key: 'profit', type: 'number', className: 'num farming-num', direction: dir('profit'), title: 'Net satış eksi maliyet' })}
                        ${sortHeaderHtml('Kâr%', { key: 'pct', type: 'number', className: 'num farming-num', direction: dir('pct'), title: 'Kârın maliyete oranı' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="refiningResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="refiningResult"></div>';
    }

    const list = rows();
    const stamp = formatDateTime(latestQuoteDate(list));

    return `
        <div id="refiningResult">
            ${renderTable(list)}
            ${calcExplainShell('refiningExplain')}
            ${renderSummary(list)}
            ${renderScenario()}
            ${renderBonusNote()}
            ${stamp ? `<p class="farming-note">${escapeHtml(stamp)}</p>` : ''}
        </div>
    `;
}

function renderPage(container) {
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Refining</h1>
            <p>Seçilen hammaddede hangi kademeyi işlemenin kâr bıraktığı. Ham alış, refine ve satış şehirleri ayrı; focus ve günlük bonus RR’yi değiştirir.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="farming-toolbar">
                    <div class="farming-type" role="radiogroup" aria-label="Aile">
                        ${renderToggleGroup('family', FAMILIES.map((family) => ({ id: family.id, label: family.label })), state.family, 'family')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Enchant">
                        ${renderToggleGroup('enchant', [
                            { id: 0, label: '0' },
                            { id: 1, label: '.1' },
                            { id: 2, label: '.2' },
                            { id: 3, label: '.3' }
                        ], state.enchant, 'enchant')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Zincir">
                        ${renderToggleGroup('chain', [
                            { id: 'market', label: 'Piyasa' },
                            { id: 'full', label: 'Tam zincir' }
                        ], state.chain, 'chain')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Focus">
                        ${renderToggleGroup('focus', [
                            { id: '1', label: 'Focus' },
                            { id: '0', label: 'Focus yok' }
                        ], state.focus ? '1' : '0', 'focus')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Premium">
                        ${renderToggleGroup('premium', [
                            { id: '1', label: 'Premium' },
                            { id: '0', label: 'Premium yok' }
                        ], state.premium ? '1' : '0', 'premium')}
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="refiningBonusLabel">Bonus</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="refiningBonusLabel">
                            ${craftBonusToggleHtml(state.bonusRate)}
                        </div>
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="refiningRawSideLabel">Ham</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="refiningRawSideLabel">
                            ${priceSideToggleHtml('raw', state.rawSide)}
                        </div>
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="refiningItemSideLabel">Ürün</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="refiningItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="refiningBuyCity">
                            ${renderCityOptions(state.buyCity)}
                        </select>
                        <label for="refiningBuyCity">Ham alış şehri</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="refiningRefineCity">
                            ${renderCityOptions(state.refineCity)}
                        </select>
                        <label for="refiningRefineCity">Refine şehri</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="refiningSellCity">
                            ${renderCityOptions(state.sellCity)}
                        </select>
                        <label for="refiningSellCity">Satış şehri</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'refiningRefresh', apiId: 'refiningRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindRefiningSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
    bindExplain(container);
}

function bindRefiningSort(container) {
    const table = container.querySelector('.farming-table');
    if (!table) {
        return;
    }

    initTableSort(table, {
        initial: state.sort,
        onSort({ key, direction }) {
            state.sort = { key, direction };
        }
    });
}

function patchRowCells(tr, row, bestId) {
    tr.classList.toggle('is-best', row.id === bestId);

    tr.cells[0].dataset.sortValue = String(row.tier);

    const rawCell = tr.cells[1];
    const outCell = tr.cells[2];
    const costCell = tr.cells[3];
    const sellCell = tr.cells[4];
    const profitCell = tr.cells[5];
    const pctCell = tr.cells[6];

    rawCell.dataset.sortValue = row.rawQuote?.price ?? '';
    const rawFetched = fetchedQuote(row.rawId, state.buyCity, state.rawSide, 'buy');
    applyPriceFieldState(rawCell.querySelector('.farming-price-field'), {
        manual: isManualPrice(state.manualRaw[row.rawId]),
        missing: !rawFetched,
        displayValue: priceInputValue(state.manualRaw[row.rawId], rawFetched?.price)
    });

    outCell.dataset.sortValue = row.outQuote?.price ?? '';
    const outFetched = fetchedQuote(row.outId, state.sellCity, state.itemSide, 'sell');
    applyPriceFieldState(outCell.querySelector('.farming-price-field'), {
        manual: isManualPrice(state.manualOut[row.outId]),
        missing: !outFetched,
        displayValue: priceInputValue(state.manualOut[row.outId], outFetched?.price)
    });

    costCell.dataset.sortValue = row.cost ?? '';
    costCell.textContent = formatSilver(row.cost);
    costCell.className = `num farming-num${incompleteClass(row.cost)}`;

    sellCell.dataset.sortValue = row.sell ?? '';
    sellCell.textContent = formatSilver(row.sell);
    sellCell.className = `num farming-num${incompleteClass(row.sell)}`;

    profitCell.dataset.sortValue = row.profit ?? '';
    profitCell.textContent = formatSilver(row.profit, { signed: true });
    profitCell.className = `num farming-num${profitClass(row.profit)}${incompleteClass(row.profit)}`;

    pctCell.dataset.sortValue = row.pct ?? '';
    pctCell.textContent = formatPct(row.pct);
    pctCell.className = `num farming-num${profitClass(row.profit)}${incompleteClass(row.pct)}`;
}

function refreshCalc(container) {
    const table = container.querySelector('.farming-table');
    if (!table) {
        return;
    }
    const list = rows();
    const best = bestRow(list);
    for (const row of list) {
        const tr = table.querySelector(`tr[data-item-id="${row.id}"]`);
        if (tr) {
            patchRowCells(tr, row, best?.id);
        }
    }

    const summary = container.querySelector('#refiningSummary');
    if (summary) {
        const wrap = document.createElement('div');
        wrap.innerHTML = renderSummary(list);
        const next = wrap.querySelector('#refiningSummary');
        if (next) {
            summary.replaceWith(next);
        }
    }

    refreshCalcExplain(container.querySelector('#refiningExplain'));
}

function bindPriceInputs(container) {
    initFloatingLabels(container);

    const bindField = (input, kind) => {
        if (input.dataset.priceBound === 'on') {
            return;
        }
        input.dataset.priceBound = 'on';

        input.addEventListener('input', () => {
            const id = kind === 'raw' ? input.dataset.rawId : input.dataset.outId;
            const parsed = parsePrice(input.value);
            if (kind === 'raw') {
                state.manualRaw[id] = parsed != null ? input.value : null;
            } else {
                state.manualOut[id] = parsed != null ? input.value : null;
            }
            input.classList.toggle('is-filled', input.value.length > 0);
            refreshCalc(container);
        });

        input.addEventListener('change', () => {
            const id = kind === 'raw' ? input.dataset.rawId : input.dataset.outId;
            if (parsePrice(input.value) == null) {
                if (kind === 'raw') {
                    state.manualRaw[id] = null;
                    const fetched = fetchedQuote(id, state.buyCity, state.rawSide, 'buy');
                    input.value = fetched ? formatSilver(fetched.price) : '';
                } else {
                    state.manualOut[id] = null;
                    const fetched = fetchedQuote(id, state.sellCity, state.itemSide, 'sell');
                    input.value = fetched ? formatSilver(fetched.price) : '';
                }
                input.classList.toggle('is-filled', input.value.length > 0);
            }
            refreshCalc(container);
        });
    };

    container.querySelectorAll('[data-raw-id]').forEach((input) => bindField(input, 'raw'));
    container.querySelectorAll('[data-out-id]').forEach((input) => bindField(input, 'out'));
}

function syncToggleGroup(container, attr, selected) {
    const value = String(selected);
    container.querySelectorAll(`[${attr}]`).forEach((button) => {
        const pressed = button.getAttribute(attr) === value;
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

function syncCitySelects(container) {
    const selected = {
        refiningBuyCity: state.buyCity,
        refiningRefineCity: state.refineCity,
        refiningSellCity: state.sellCity
    };
    for (const [id, value] of Object.entries(selected)) {
        const select = container.querySelector(`#${id}`);
        if (select) {
            select.innerHTML = renderCityOptions(value);
        }
    }
}

function applyControls(container) {
    syncToggleGroup(container, 'data-family', state.family);
    syncToggleGroup(container, 'data-enchant', state.enchant);
    syncToggleGroup(container, 'data-chain', state.chain);
    syncToggleGroup(container, 'data-focus', state.focus ? '1' : '0');
    syncToggleGroup(container, 'data-premium', state.premium ? '1' : '0');
    syncToggleGroup(container, 'data-bonus-rate', state.bonusRate);
    container.querySelectorAll('[data-price-for]').forEach((button) => {
        const current = button.dataset.priceFor === 'item' ? state.itemSide : state.rawSide;
        const pressed = button.dataset.priceSide === current;
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
    syncCitySelects(container);
}

function refreshView(container) {
    applyControls(container);
    refreshOutput(container);
}

function bindCitySelect(container, id, assign) {
    container.querySelector(id)?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        assign(value);
        savePrefs();
        refreshView(container);
    });
}

function bindPage(container) {
    container.querySelectorAll('[data-family]').forEach((button) => {
        button.addEventListener('click', () => {
            const next = FAMILIES.find((family) => family.id === button.dataset.family);
            if (!next || next.id === state.family) {
                return;
            }
            state.family = next.id;
            if (getSettings().refineFollowSpecialty) {
                applyRefineCityForFamily(state.cities);
            }
            state.bonusRate = defaultCraftBonusRate([next.bonusKey]);
            savePrefs();
            applyControls(container);
            loadPrices(container, { showLoader: false, areaLoader: true });
        });
    });

    container.querySelectorAll('[data-enchant]').forEach((button) => {
        button.addEventListener('click', () => {
            const enchant = Number(button.dataset.enchant) || 0;
            if (enchant === state.enchant) {
                return;
            }
            state.enchant = enchant;
            savePrefs();
            refreshView(container);
        });
    });

    container.querySelectorAll('[data-chain]').forEach((button) => {
        button.addEventListener('click', () => {
            const chain = button.dataset.chain === 'full' ? 'full' : 'market';
            if (chain === state.chain) {
                return;
            }
            state.chain = chain;
            savePrefs();
            refreshView(container);
        });
    });

    container.querySelectorAll('[data-focus]').forEach((button) => {
        button.addEventListener('click', () => {
            const focus = button.dataset.focus === '1';
            if (focus === state.focus) {
                return;
            }
            state.focus = focus;
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
            refreshView(container);
        });
    });

    container.querySelectorAll('[data-bonus-rate]').forEach((button) => {
        button.addEventListener('click', () => {
            const rate = normalizeCraftBonusRate(button.dataset.bonusRate);
            if (rate === state.bonusRate) {
                return;
            }
            state.bonusRate = rate;
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
                if (state.rawSide === side) {
                    return;
                }
                state.rawSide = side;
            }
            refreshView(container);
        });
    });

    bindCitySelect(container, '#refiningBuyCity', (value) => {
        state.buyCity = value;
    });
    bindCitySelect(container, '#refiningRefineCity', (value) => {
        state.refineCity = value;
    });
    bindCitySelect(container, '#refiningSellCity', (value) => {
        state.sellCity = value;
    });

    bindPriceRefresh(container, {
        refreshId: 'refiningRefresh',
        apiId: 'refiningRefreshApi',
        load: (options) => loadPrices(container, options)
    });
}

function refreshOutput(container) {
    const result = container.querySelector('#refiningResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#refiningResult'));
    bindRefiningSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
    bindExplain(container);
}

async function loadPrices(container, { showLoader = true, source, areaLoader = false } = {}) {
    applyPriceLoadMode(state, { source, showLoader });
    state.error = null;
    const area = areaLoader ? container.querySelector('.tool-split-result') : null;
    if (showLoader) {
        showPageLoader(priceLoaderMessage(source, 'Şehir fiyatları alınıyor…'));
    } else if (area) {
        showAreaLoader(area, priceLoaderMessage(source, 'Şehir fiyatları alınıyor…'));
    }

    try {
        const locations = cityNames();
        if (locations.length === 0) {
            throw new Error('Aktif şehir yok.');
        }
        const rows = await fetchPrices(allUniqueNames(), locations, { source });
        state.priceIndex = indexPrices(rows);
        state.loaded = true;
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (area) {
            hideAreaLoader(area);
        }
        if (container.querySelector('#refiningResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('refiningTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.rawSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;

    showPageLoader('Refining yükleniyor…');
    try {
        await initStore();
        state.cities = loadActiveCities();
        const hadPrefs = readPrefs(state.cities);
        applyFamilyCityDefaults(state.cities, { preferSpecialty: !hadPrefs });
        state.bonusRate = defaultCraftBonusRate([currentFamily().bonusKey]);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: allUniqueNames(),
            cities: [state.buyCity, state.sellCity],
            pause: state.livePaused
        }), () => loadPrices(container, { showLoader: false }));
    } catch (error) {
        console.error(error);
        state.error = 'Sayfa yüklenemedi. Static server ile açın.';
        state.loaded = true;
        renderPage(container);
    } finally {
        hidePageLoader();
    }
}

init();
