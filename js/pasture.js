import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getSettings, cityHasIsland, getDefaultCity } from './settings.js';
import { fetchPrices, indexPrices, cityRow, priceRefreshActionsHtml, bindPriceRefresh, priceLoaderMessage, applyPriceLoadMode } from './market.js';
import { itemIconHtml, itemLabel } from './item-icon.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { initFloatingLabels } from './forms.js';
import { initTableSort, parseSortNumber, sortHeaderHtml } from './table-sort.js';
import {
    quoteFromRow,
    priceSideHint,
    priceSideToggleHtml,
    priceFieldHtml,
    priceMarkHtml,
    priceInputValue,
    applyPriceFieldState,
    setPriceFieldMeta,
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadActiveCities } from './cities.js';
import { bindLivePrices } from './price-live.js';
import {
    calcExplainShell,
    bindCalcExplain,
    refreshCalcExplain,
    explainPanelHtml,
    explainEmptyHtml,
    explainHint,
    explainFlow,
    explainStep,
    explainNum,
    explainOp,
    explainChips,
    explainSaleSteps,
    explainProfitFoot
} from './calc-explain.js';
import { getAnimals, getEconomyConstant } from './catalog.js';

const CITY_STORAGE_KEY = 'albiontools.v4.pasture.city';
const PREFS_STORAGE_KEY = 'albiontools.v4.pasture.prefs';

function baseYield() {
    return getEconomyConstant('base_yield', 4.5);
}

function premiumYield() {
    return getEconomyConstant('premium_yield', 9);
}

function cityYieldBonus() {
    return getEconomyConstant('city_yield_bonus', 0.1);
}

function feedQty() {
    return getAnimals({ kind: 'livestock' })[0]?.feedQtyPasture
        ?? 9;
}

function meatQty() {
    return getEconomyConstant('meatQty()', 18);
}

function productQty() {
    return getEconomyConstant('productQty()', 18);
}

function animals() {
    return getAnimals({ kind: 'livestock' });
}

const state = {
    premium: true,
    focus: false,
    water: false,
    feedMode: 'grow',
    babySide: 'buy',
    feedSide: 'buy',
    grownSide: 'sell',
    meatSide: 'sell',
    productSide: 'sell',
    city: getDefaultCity(),
    cities: [],
    priceIndex: null,
    loaded: false,
    error: null,
    livePaused: false,
    manualBabies: {},
    manualFeeds: {},
    manualGrowns: {},
    manualMeats: {},
    manualProducts: {},
    sort: { key: 'best', direction: 'desc' }
};

function hasFeedCropBonus(item, city) {
    return item.feedBonusCities.includes(city);
}

function harvestQty(item) {
    const base = state.premium ? premiumYield() : baseYield();
    return hasFeedCropBonus(item, state.city) ? base * (1 + cityYieldBonus()) : base;
}

function seedReturnRate(item, watered) {
    return watered ? item.seedReturn + item.waterBonus : item.seedReturn;
}

function babyChance(item, focused) {
    return focused ? item.seedReturn + item.waterBonus : item.seedReturn;
}

function formatSilver(value, { unsigned = false, digits = 0, signed = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(value) : value;
    let text = amount.toLocaleString('tr-TR', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits > 0 && Math.abs(amount) < 10 ? Math.min(digits, 1) : 0
    });
    if (signed && value > 0) {
        text = `+${text}`;
    }
    return text;
}

function formatPct(ratio) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    return `${(ratio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

function formatQty(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
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

function readSavedCity(cities) {
    try {
        const saved = localStorage.getItem(CITY_STORAGE_KEY);
        if (cities.some((city) => city.marketApiName === saved)) {
            return saved;
        }
    } catch {
        /* ignore */
    }
    const preferred = getDefaultCity();
    const match = cities.find((city) => city.marketApiName === preferred);
    return match?.marketApiName ?? cities[0]?.marketApiName ?? preferred;
}

function saveCity(apiName) {
    try {
        localStorage.setItem(CITY_STORAGE_KEY, apiName);
    } catch {
        /* ignore */
    }
}

function readPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (parsed.feedMode === 'grow' || parsed.feedMode === 'market') {
            state.feedMode = parsed.feedMode;
        }
        state.focus = parsed.focus === true;
    } catch {
        /* ignore */
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
            feedMode: state.feedMode,
            focus: state.focus
        }));
    } catch {
        /* ignore */
    }
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

function fetchedQuote(itemId, side, intent) {
    if (!state.priceIndex || !itemId) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, itemId, state.city), side, intent);
}

function quoteFor(itemId, side, intent, manualMap, id) {
    const parsed = parsePrice(manualMap[id]);
    if (parsed != null) {
        return manualQuote(parsed, side, intent);
    }
    return fetchedQuote(itemId, side, intent);
}

function babyQuote(item) {
    return quoteFor(item.babyId, state.babySide, 'buy', state.manualBabies, item.id);
}

function feedInputQuote(item) {
    if (state.feedMode === 'grow') {
        return quoteFor(item.feedSeedId, state.feedSide, 'buy', state.manualFeeds, item.id);
    }
    return quoteFor(item.feedPlantId, state.feedSide, 'buy', state.manualFeeds, item.id);
}

function grownQuote(item) {
    return quoteFor(item.grownId, state.grownSide, 'sell', state.manualGrowns, item.id);
}

function meatQuote(item) {
    return quoteFor(item.meatId, state.meatSide, 'sell', state.manualMeats, item.id);
}

function productQuote(item) {
    if (!item.productId) {
        return null;
    }
    return quoteFor(item.productId, state.productSide, 'sell', state.manualProducts, item.id);
}

function babyMark(usedPrice, vendor) {
    if (!Number.isFinite(usedPrice) || !Number.isFinite(vendor) || vendor <= 0) {
        return null;
    }
    const delta = (usedPrice - vendor) / vendor;
    if (delta <= -0.01) {
        return { tone: 'cheap', label: `NPC ${formatPct(delta)}` };
    }
    if (delta >= 0.01) {
        return { tone: 'dear', label: `NPC +${formatPct(delta)}` };
    }
    return { tone: 'even', label: 'NPC ≈' };
}

function feedUnitCost(item, feedQuote) {
    if (!feedQuote) {
        return null;
    }
    if (state.feedMode === 'market') {
        return purchaseCost(feedQuote.price, { setup: feedQuote.setup });
    }
    const qty = harvestQty(item);
    const usedReturn = seedReturnRate(item, state.water);
    const netSeed = purchaseCost(feedQuote.price * (1 - usedReturn), { setup: feedQuote.setup });
    return qty > 0 ? netSeed / qty : null;
}

function pathProfits(item, focused) {
    const baby = babyQuote(item);
    const feed = feedInputQuote(item);
    const grown = grownQuote(item);
    const meat = meatQuote(item);
    const product = productQuote(item);
    const unit = feedUnitCost(item, feed);
    const chance = babyChance(item, focused);

    const babyNet = baby ? purchaseCost(baby.price, { setup: baby.setup }) : null;
    const growCost = babyNet != null && unit != null ? babyNet + feedQty() * unit : null;
    const babyCredit = baby && Number.isFinite(chance) ? chance * baby.price : null;

    const growRev = grown && babyCredit != null
        ? saleProceeds(grown.price, { premium: state.premium, setup: grown.setup }) + babyCredit
        : null;
    const butcherRev = meat && babyCredit != null
        ? saleProceeds(meat.price, { premium: state.premium, setup: meat.setup }) * meatQty() + babyCredit
        : null;

    const profitGrow = growRev != null && growCost != null ? growRev - growCost : null;
    const profitButcher = butcherRev != null && growCost != null ? butcherRev - growCost : null;

    let profitFeed = null;
    let feedCost = null;
    if (item.productId && unit != null && product) {
        feedCost = feedQty() * unit;
        const feedRev = saleProceeds(product.price, { premium: state.premium, setup: product.setup }) * productQty();
        profitFeed = feedRev - feedCost;
    }

    const pctGrow = profitGrow != null && growCost > 0 ? profitGrow / growCost : null;
    const pctButcher = profitButcher != null && growCost > 0 ? profitButcher / growCost : null;
    const pctFeed = profitFeed != null && feedCost > 0 ? profitFeed / feedCost : null;

    const paths = [
        { id: 'grow', label: 'Büyüt', profit: profitGrow, pct: pctGrow },
        { id: 'butcher', label: 'Kes', profit: profitButcher, pct: pctButcher }
    ];
    if (item.productId) {
        paths.push({ id: 'feed', label: 'Besle', profit: profitFeed, pct: pctFeed });
    }

    let best = null;
    for (const path of paths) {
        if (path.pct == null) {
            continue;
        }
        if (best == null || path.pct > best.pct) {
            best = path;
        }
    }

    return {
        baby,
        feed,
        grown,
        meat,
        product,
        unit,
        chance,
        growCost,
        feedCost,
        profitGrow,
        profitButcher,
        profitFeed,
        pctGrow,
        pctButcher,
        pctFeed,
        best
    };
}

function computeRow(item) {
    const active = pathProfits(item, state.focus);
    const dry = state.focus ? pathProfits(item, false) : null;

    let perFocus = null;
    if (state.focus && dry?.best && active.best && item.focusCost > 0) {
        perFocus = (active.best.profit - dry.best.profit) / item.focusCost;
    }

    return {
        item,
        ...active,
        qty: state.feedMode === 'grow' ? harvestQty(item) : null,
        usedReturn: state.feedMode === 'grow' ? seedReturnRate(item, state.water) : null,
        feedBonus: state.feedMode === 'grow' && hasFeedCropBonus(item, state.city),
        mark: active.baby ? babyMark(active.baby.price, item.vendor) : null,
        perFocus
    };
}

function rows() {
    return animals().map(computeRow);
}

function explainIcon(uniqueName) {
    return itemIconHtml(uniqueName, { className: 'item-icon calc-explain-icon' });
}

function feedExplainLines(row) {
    const item = row.item;
    const feed = row.feed;
    const lines = [];

    if (state.feedMode === 'market') {
        lines.push(explainStep({
            icon: explainIcon(item.feedPlantId),
            label: itemLabel(item.feedPlantId, item.feedLabel),
            note: 'Piyasadan yem alış (buy +1 ve varsa setup)',
            formula: feed?.setup
                ? [
                    explainNum(feed?.price, { tone: 'price', cap: 'birim fiyat' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ]
                : [explainNum(feed?.price, { tone: 'price', cap: 'birim fiyat' })],
            result: row.unit,
            resultKind: 'cost',
            resultCap: 'yem birim'
        }));
        return lines;
    }

    const qty = row.qty;
    const usedReturn = row.usedReturn;
    const keep = Number.isFinite(usedReturn) ? 1 - usedReturn : null;
    const seedBook = feed && keep != null ? feed.price * keep : null;
    const seedNet = feed && keep != null
        ? purchaseCost(feed.price * keep, { setup: feed.setup })
        : null;

    lines.push(explainStep({
        icon: explainIcon(item.feedSeedId),
        label: `${itemLabel(item.feedSeedId, 'Tohum')} · iade sonrası`,
        note: state.water
            ? `Sulama açık: tohum geri dönüşü ${formatPct(usedReturn)}`
            : `Sulama yok: tohum geri dönüşü ${formatPct(usedReturn)}`,
        formula: [
            explainNum(feed?.price, { tone: 'price', cap: 'tohum' }),
            explainOp('×'),
            explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen pay' })
        ],
        result: seedBook,
        resultKind: 'cost',
        resultCap: 'net tohum'
    }));
    if (feed?.setup) {
        lines.push(explainStep({
            label: 'Alış komisyonu',
            note: 'Buy emri koyunca %2,5 setup fee',
            formula: [
                explainNum(seedBook, { tone: 'cost', cap: 'net tohum' }),
                explainOp('×'),
                explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
            ],
            result: seedNet,
            resultKind: 'cost',
            resultCap: 'tohum + setup'
        }));
    }
    lines.push(explainStep({
        icon: explainIcon(item.feedPlantId),
        label: 'Ada birim maliyeti',
        note: row.feedBonus
            ? `Hasat ${formatQty(qty)} (+10% şehir bonusu) · net tohum / verim`
            : `Hasat ${formatQty(qty)} · net tohum / verim`,
        formula: [
            explainNum(seedNet ?? seedBook, { tone: 'cost', cap: feed?.setup ? 'tohum + setup' : 'net tohum' }),
            explainOp('/'),
            explainNum(qty, { kind: 'qty', cap: 'verim' })
        ],
        result: row.unit,
        resultKind: 'cost',
        resultCap: 'yem birim'
    }));
    return lines;
}

function pathRevenue(row, pathId) {
    const babyCredit = row.baby && Number.isFinite(row.chance)
        ? row.chance * row.baby.price
        : null;
    if (pathId === 'grow') {
        const grownNet = row.grown
            ? saleProceeds(row.grown.price, { premium: state.premium, setup: row.grown.setup })
            : null;
        return grownNet != null && babyCredit != null ? grownNet + babyCredit : null;
    }
    if (pathId === 'butcher') {
        const meatNet = row.meat
            ? saleProceeds(row.meat.price, { premium: state.premium, setup: row.meat.setup })
            : null;
        return meatNet != null && babyCredit != null ? meatNet * meatQty() + babyCredit : null;
    }
    if (pathId === 'feed' && row.item.productId && row.product) {
        return saleProceeds(row.product.price, { premium: state.premium, setup: row.product.setup }) * productQty();
    }
    return null;
}

function pathCost(row, pathId) {
    if (pathId === 'feed') {
        return row.unit != null ? feedQty() * row.unit : null;
    }
    return row.growCost;
}

function renderPastureExplain(key, { hovered } = {}) {
    const row = rows().find((item) => item.item.id === key);
    if (!row) {
        return explainEmptyHtml('Satır bulunamadı.');
    }

    const item = row.item;
    const tax = salesTaxRate(state.premium);
    const baby = row.baby;
    const babyNet = baby ? purchaseCost(baby.price, { setup: baby.setup }) : null;
    const babyCredit = baby && Number.isFinite(row.chance) ? row.chance * baby.price : null;
    const feedSpend = row.unit != null ? feedQty() * row.unit : null;
    const grownIcon = explainIcon(item.grownId);
    const bestId = row.best?.id;
    const bestRev = bestId ? pathRevenue(row, bestId) : null;
    const bestCost = bestId ? pathCost(row, bestId) : null;
    const bestPct = bestRev != null && bestCost != null && bestCost !== 0
        ? row.best.profit / bestCost
        : null;

    const chips = [
        {
            label: 'yavru %',
            value: row.chance,
            kind: 'pct',
            tone: state.focus ? 'focus' : 'rr',
            title: state.focus ? 'Focus açık: taban + focus bonusu' : 'Focus kapalı: taban yavru ihtimali'
        },
        {
            label: 'yem',
            html: `<span class="calc-explain-n is-city">${escapeHtml(state.feedMode === 'grow' ? 'yetiştir' : 'piyasa')}</span>`,
            tone: 'city',
            title: state.feedMode === 'grow' ? 'Ada ekin birim maliyeti' : 'Şehir buy +1'
        }
    ];
    if (state.focus) {
        chips.push({
            label: 'focus',
            value: item.focusCost,
            kind: 'qty',
            tone: 'focus',
            title: 'Bu hayvan için sabit focus maliyeti'
        });
    }

    const costLines = [
        explainStep({
            icon: explainIcon(item.babyId),
            label: itemLabel(item.babyId, 'Yavru'),
            note: 'Yavru alış; emir koyunca setup eklenir',
            formula: baby?.setup
                ? [
                    explainNum(baby?.price, { tone: 'price', cap: 'birim fiyat' }),
                    explainOp('×'),
                    explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                ]
                : [explainNum(baby?.price, { tone: 'price', cap: 'birim fiyat' })],
            result: babyNet,
            resultKind: 'cost',
            resultCap: 'yavru net'
        }),
        explainStep({
            icon: explainIcon(item.feedPlantId),
            label: `Yem ×${feedQty()}`,
            note: 'Büyütme / besleme için tüketilen yem',
            formula: [
                explainNum(feedQty(), { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(row.unit, { tone: 'cost', cap: 'yem birim' })
            ],
            result: feedSpend,
            resultKind: 'cost',
            resultCap: 'yem tutarı'
        }),
        explainStep({
            icon: grownIcon,
            label: 'Büyütme maliyeti',
            note: 'Yavru + yem; kes ve büyüt aynı maliyeti paylaşır',
            formula: [
                explainNum(babyNet, { tone: 'cost', cap: 'yavru net' }),
                explainOp('+'),
                explainNum(feedSpend, { tone: 'cost', cap: 'yem tutarı' })
            ],
            result: row.growCost,
            resultKind: 'cost',
            resultCap: 'maliyet'
        })
    ];

    const chanceLines = [
        explainStep({
            icon: explainIcon(item.babyId),
            label: 'Yavru kredisi',
            note: 'Büyüyünce dönen yavru beklenen değeri (Excel gibi fiyat × ihtimal)',
            formula: [
                explainNum(row.chance, { kind: 'pct', tone: state.focus ? 'focus' : 'rr', cap: 'ihtimal' }),
                explainOp('×'),
                explainNum(baby?.price, { tone: 'price', cap: 'yavru fiyat' })
            ],
            result: babyCredit,
            resultKind: 'sell',
            resultCap: 'kredi'
        })
    ];

    const grownNetSale = row.grown
        ? saleProceeds(row.grown.price, { premium: state.premium, setup: row.grown.setup })
        : null;
    const growRev = pathRevenue(row, 'grow');
    const butcherRev = pathRevenue(row, 'butcher');
    const feedRev = pathRevenue(row, 'feed');

    const growSale = explainSaleSteps({
        price: row.grown?.price,
        tax,
        setup: row.grown?.setup ?? placesOrder('sell', state.grownSide),
        sell: grownNetSale,
        label: itemLabel(item.grownId, item.label),
        icon: grownIcon
    });
    growSale.push(explainStep({
        label: 'Büyüt geliri',
        note: 'Net satış + yavru kredisi',
        formula: [
            explainNum(grownNetSale, { tone: 'sell', cap: 'net satış' }),
            explainOp('+'),
            explainNum(babyCredit, { tone: 'sell', cap: 'kredi' })
        ],
        result: growRev,
        resultKind: 'sell',
        resultCap: 'gelir'
    }));
    growSale.push(explainStep({
        label: 'Büyüt kârı',
        note: 'Gelir − büyütme maliyeti',
        formula: [
            explainNum(growRev, { tone: 'sell', cap: 'gelir' }),
            explainOp('−'),
            explainNum(row.growCost, { tone: 'cost', cap: 'maliyet' })
        ],
        result: row.profitGrow,
        resultKind: 'profit',
        resultCap: 'kâr',
        signed: true
    }));
    growSale.push(explainStep({
        label: 'Büyüt kâr %',
        note: 'Kâr ÷ büyütme maliyeti',
        formula: [
            explainNum(row.profitGrow, { tone: 'profit', cap: 'kâr', signed: true }),
            explainOp('/'),
            explainNum(row.growCost, { tone: 'cost', cap: 'maliyet' })
        ],
        result: row.pctGrow,
        resultKind: 'pct',
        resultCap: 'kâr %'
    }));

    const meatNetSale = row.meat
        ? saleProceeds(row.meat.price, { premium: state.premium, setup: row.meat.setup })
        : null;
    const butcherSale = explainSaleSteps({
        price: row.meat?.price,
        tax,
        setup: row.meat?.setup ?? placesOrder('sell', state.meatSide),
        sell: meatNetSale,
        label: itemLabel(item.meatId, 'Et'),
        icon: explainIcon(item.meatId)
    });
    butcherSale.push(explainStep({
        label: `Et ×${meatQty()} + kredi`,
        note: 'Kesme geliri',
        formula: [
            explainNum(meatNetSale, { tone: 'sell', cap: 'net et' }),
            explainOp('×'),
            explainNum(meatQty(), { kind: 'qty', cap: 'adet' }),
            explainOp('+'),
            explainNum(babyCredit, { tone: 'sell', cap: 'kredi' })
        ],
        result: butcherRev,
        resultKind: 'sell',
        resultCap: 'gelir'
    }));
    butcherSale.push(explainStep({
        label: 'Kes kârı',
        note: 'Gelir − büyütme maliyeti',
        formula: [
            explainNum(butcherRev, { tone: 'sell', cap: 'gelir' }),
            explainOp('−'),
            explainNum(row.growCost, { tone: 'cost', cap: 'maliyet' })
        ],
        result: row.profitButcher,
        resultKind: 'profit',
        resultCap: 'kâr',
        signed: true
    }));
    butcherSale.push(explainStep({
        label: 'Kes kâr %',
        note: 'Kâr ÷ büyütme maliyeti',
        formula: [
            explainNum(row.profitButcher, { tone: 'profit', cap: 'kâr', signed: true }),
            explainOp('/'),
            explainNum(row.growCost, { tone: 'cost', cap: 'maliyet' })
        ],
        result: row.pctButcher,
        resultKind: 'pct',
        resultCap: 'kâr %'
    }));

    const groups = [
        {
            title: state.feedMode === 'grow' ? 'Yem · ada yetiştir' : 'Yem · piyasa',
            tone: 'buy',
            intro: explainChips(chips),
            lines: feedExplainLines(row)
        },
        { title: 'Maliyet', tone: 'cost', lines: costLines },
        { title: 'Yavru ihtimali', tone: 'rr', lines: chanceLines },
        {
            title: bestId === 'grow' ? 'Büyüt · en iyi' : 'Büyüt',
            tone: 'sell',
            lines: growSale
        },
        {
            title: bestId === 'butcher' ? 'Kes · en iyi' : 'Kes',
            tone: 'sell',
            lines: butcherSale
        }
    ];

    if (item.productId) {
        const productNetSale = row.product
            ? saleProceeds(row.product.price, { premium: state.premium, setup: row.product.setup })
            : null;
        const feedSale = explainSaleSteps({
            price: row.product?.price,
            tax,
            setup: row.product?.setup ?? placesOrder('sell', state.productSide),
            sell: productNetSale,
            label: itemLabel(item.productId, 'Ürün'),
            icon: explainIcon(item.productId)
        });
        feedSale.push(explainStep({
            label: `Ürün ×${productQty()}`,
            note: 'Besleme geliri (yavru kredisi yok; yalnız yem maliyeti)',
            formula: [
                explainNum(productNetSale, { tone: 'sell', cap: 'net ürün' }),
                explainOp('×'),
                explainNum(productQty(), { kind: 'qty', cap: 'adet' })
            ],
            result: feedRev,
            resultKind: 'sell',
            resultCap: 'gelir'
        }));
        feedSale.push(explainStep({
            label: 'Besle kârı',
            note: 'Gelir − yem tutarı',
            formula: [
                explainNum(feedRev, { tone: 'sell', cap: 'gelir' }),
                explainOp('−'),
                explainNum(feedSpend, { tone: 'cost', cap: 'yem tutarı' })
            ],
            result: row.profitFeed,
            resultKind: 'profit',
            resultCap: 'kâr',
            signed: true
        }));
        feedSale.push(explainStep({
            label: 'Besle kâr %',
            note: 'Kâr ÷ yem tutarı',
            formula: [
                explainNum(row.profitFeed, { tone: 'profit', cap: 'kâr', signed: true }),
                explainOp('/'),
                explainNum(feedSpend, { tone: 'cost', cap: 'yem tutarı' })
            ],
            result: row.pctFeed,
            resultKind: 'pct',
            resultCap: 'kâr %'
        }));
        groups.push({
            title: bestId === 'feed' ? 'Besle · en iyi' : 'Besle',
            tone: 'sell',
            lines: feedSale
        });
    }

    if (state.focus && Number.isFinite(row.perFocus)) {
        const dry = pathProfits(item, false);
        groups.push({
            title: 'Focus',
            tone: 'rr',
            lines: [
                explainStep({
                    label: 'gümüş / focus',
                    note: 'En iyi yol kâr farkı ÷ sabit focus maliyeti',
                    formula: [
                        explainNum(row.best?.profit, { tone: 'profit', cap: 'focuslu', signed: true }),
                        explainOp('−'),
                        explainNum(dry.best?.profit, { tone: 'profit', cap: 'focussuz', signed: true }),
                        explainOp('/'),
                        explainNum(item.focusCost, { kind: 'qty', cap: 'focus' })
                    ],
                    result: row.perFocus,
                    resultKind: 'profit',
                    resultCap: 'gümüş/focus',
                    signed: true
                })
            ]
        });
    }

    return explainPanelHtml({
        icon: grownIcon,
        title: `T${item.tier} ${itemLabel(item.grownId, item.label)}`,
        hint: explainHint(hovered),
        flow: explainFlow([
            { icon: grownIcon, label: 'Maliyet', value: bestCost, tone: 'cost' },
            { label: 'Gelir', value: bestRev, tone: 'sell' },
            {
                label: (row.best?.profit ?? 0) < 0 ? 'Zarar' : 'Kâr',
                value: row.best?.profit,
                tone: (row.best?.profit ?? 0) < 0 ? 'loss' : 'profit',
                signed: true
            }
        ]),
        groups,
        footer: explainProfitFoot({
            sell: bestRev,
            cost: bestCost,
            profit: row.best?.profit,
            pct: bestPct
        })
    });
}

function bindExplain(container) {
    bindCalcExplain({
        panel: container.querySelector('#pastureExplain'),
        table: container.querySelector('.pasture-table'),
        rowKey: (tr) => tr.dataset.itemId,
        keys: () => rows().map((row) => row.item.id),
        defaultKey: () => bestProfitId(rows()) ?? animals()[0]?.id ?? null,
        render: (key, meta) => renderPastureExplain(key, meta)
    });
}

function bestProfitId(list) {
    let best = null;
    for (const row of list) {
        if (row.best?.pct == null) {
            continue;
        }
        if (best == null || row.best.pct > best.best.pct) {
            best = row;
        }
    }
    return best?.item.id ?? null;
}

function profitCellHtml(pct, silver, isBest) {
    if (!Number.isFinite(pct) && !Number.isFinite(silver)) {
        return `<td class="num farming-num pasture-profit-cell${incompleteClass(null)}" data-sort-value="">—</td>`;
    }
    return `
        <td class="num farming-num pasture-profit-cell${profitClass(pct ?? silver)}${incompleteClass(pct)}${isBest ? ' is-path-best' : ''}" data-sort-value="${pct ?? ''}">
            <span class="pasture-profit-pct">${formatPct(pct)}</span>
            <span class="pasture-profit-silver">${formatSilver(silver, { signed: true })}</span>
        </td>
    `;
}

function feedMetaText(row) {
    if (!Number.isFinite(row.unit)) {
        return '';
    }
    if (state.feedMode === 'grow') {
        const bonus = row.feedBonus ? ' +10%' : '';
        return `birim ${formatSilver(row.unit, { digits: 1 })} · ${formatPct(row.usedReturn)}${bonus}`;
    }
    return `birim ${formatSilver(row.unit, { digits: 1 })}`;
}

function feedIconId(item) {
    return state.feedMode === 'grow' ? item.feedSeedId : item.feedPlantId;
}

function renderFeedModeToggle() {
    return [
        { id: 'grow', label: 'Yetiştir' },
        { id: 'market', label: 'Piyasa' }
    ].map((option) => {
        const pressed = option.id === state.feedMode;
        return `
            <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                data-feed-mode="${option.id}" aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderPremiumToggle() {
    return [
        { id: true, label: 'Premium' },
        { id: false, label: 'Premium yok' }
    ].map((option) => {
        const pressed = option.id === state.premium;
        return `
            <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                data-premium="${option.id ? '1' : '0'}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderFocusToggle() {
    return [
        { id: false, label: 'Focus yok' },
        { id: true, label: 'Focus' }
    ].map((option) => {
        const pressed = option.id === state.focus;
        return `
            <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                data-focus="${option.id ? '1' : '0'}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderCityOptions() {
    return [...state.cities]
        .sort((a, b) => Number(!cityHasIsland(a.marketApiName)) - Number(!cityHasIsland(b.marketApiName)) || a.id - b.id)
        .map((city) => {
            const selected = city.marketApiName === state.city ? ' selected' : '';
            const muted = cityHasIsland(city.marketApiName)
                ? ''
                : ' data-muted="1" data-hint="ada yok"';
            return `<option value="${escapeHtml(city.marketApiName)}"${selected}${muted}>${escapeHtml(city.displayName)}</option>`;
        })
        .join('');
}

function profitClass(value) {
    if (!Number.isFinite(value) || value === 0) {
        return '';
    }
    return value > 0 ? ' is-profit' : ' is-loss';
}

function pathLabel(path) {
    if (!path) {
        return '—';
    }
    return path.label;
}

function feedFieldLabel() {
    return state.feedMode === 'grow' ? 'Tohum' : 'Yem';
}

function fetchedFeedQuote(item) {
    if (state.feedMode === 'grow') {
        return fetchedQuote(item.feedSeedId, state.feedSide, 'buy');
    }
    return fetchedQuote(item.feedPlantId, state.feedSide, 'buy');
}

function renderTable() {
    const list = rows();
    const bestId = bestProfitId(list);
    const sort = state.sort;
    const dir = (key) => (sort.key === key ? sort.direction : null);
    const feedLabel = feedFieldLabel();

    const body = list.map((row) => {
        const babyFetched = fetchedQuote(row.item.babyId, state.babySide, 'buy');
        const feedFetched = fetchedFeedQuote(row.item);
        const grownFetched = fetchedQuote(row.item.grownId, state.grownSide, 'sell');
        const meatFetched = fetchedQuote(row.item.meatId, state.meatSide, 'sell');
        const productFetched = row.item.productId
            ? fetchedQuote(row.item.productId, state.productSide, 'sell')
            : null;

        const babyManual = isManualPrice(state.manualBabies[row.item.id]);
        const feedManual = isManualPrice(state.manualFeeds[row.item.id]);
        const grownManual = isManualPrice(state.manualGrowns[row.item.id]);
        const meatManual = isManualPrice(state.manualMeats[row.item.id]);
        const productManual = isManualPrice(state.manualProducts[row.item.id]);

        const mark = priceMarkHtml(row.mark);
        const best = row.item.id === bestId ? ' is-best' : '';
        const chanceNote = formatPct(row.chance);
        const feedMeta = feedMetaText(row);

        const productCell = row.item.productId
            ? priceFieldHtml({
                id: `productPrice-${row.item.id}`,
                label: 'Ürün',
                value: priceInputValue(state.manualProducts[row.item.id], productFetched?.price),
                manual: productManual,
                missing: !productFetched,
                date: productFetched?.date,
                dataAttr: `data-product-price="${escapeHtml(row.item.id)}"`,
                iconId: row.item.productId
            })
            : '—';

        return `
            <tr data-item-id="${escapeHtml(row.item.id)}" class="${best.trim()}">
                <td data-sort-value="${row.item.tier}">
                    <span class="farming-item">
                        ${itemIconHtml(row.item.grownId)}
                        <span>
                            <span class="farming-item-name">T${row.item.tier} ${escapeHtml(itemLabel(row.item.grownId, row.item.label))}</span>
                            <span class="farming-item-meta pasture-animal-meta">${itemIconHtml(row.item.babyId, { className: 'item-icon farming-seed-icon' })} yavru · ${chanceNote}</span>
                        </span>
                    </span>
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.baby?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `babyPrice-${row.item.id}`,
                        label: 'Yavru',
                        value: priceInputValue(state.manualBabies[row.item.id], babyFetched?.price),
                        manual: babyManual,
                        missing: !babyFetched,
                        date: babyFetched?.date,
                        dataAttr: `data-baby-price="${escapeHtml(row.item.id)}"`,
                        iconId: row.item.babyId,
                        mark
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.unit ?? ''}">
                    ${priceFieldHtml({
                        id: `feedPrice-${row.item.id}`,
                        label: feedLabel,
                        value: priceInputValue(state.manualFeeds[row.item.id], feedFetched?.price),
                        manual: feedManual,
                        missing: !feedFetched,
                        date: feedFetched?.date,
                        dataAttr: `data-feed-price="${escapeHtml(row.item.id)}"`,
                        iconId: feedIconId(row.item),
                        meta: feedMeta
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.grown?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `grownPrice-${row.item.id}`,
                        label: 'Büyümüş',
                        value: priceInputValue(state.manualGrowns[row.item.id], grownFetched?.price),
                        manual: grownManual,
                        missing: !grownFetched,
                        date: grownFetched?.date,
                        dataAttr: `data-grown-price="${escapeHtml(row.item.id)}"`,
                        iconId: row.item.grownId
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.meat?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `meatPrice-${row.item.id}`,
                        label: 'Et',
                        value: priceInputValue(state.manualMeats[row.item.id], meatFetched?.price),
                        manual: meatManual,
                        missing: !meatFetched,
                        date: meatFetched?.date,
                        dataAttr: `data-meat-price="${escapeHtml(row.item.id)}"`,
                        iconId: row.item.meatId
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.product?.price ?? ''}">
                    ${productCell}
                </td>
                ${profitCellHtml(row.pctGrow, row.profitGrow, row.best?.id === 'grow')}
                ${profitCellHtml(row.pctButcher, row.profitButcher, row.best?.id === 'butcher')}
                ${row.item.productId
                    ? profitCellHtml(row.pctFeed, row.profitFeed, row.best?.id === 'feed')
                    : '<td class="num farming-num pasture-profit-cell" data-sort-value="">—</td>'}
                <td class="farming-verdict${row.best ? ' is-profit' : ''}${incompleteClass(row.best)}" data-sort-value="${row.best?.pct ?? ''}">${pathLabel(row.best)}</td>
                <td class="num farming-num${state.focus ? incompleteClass(row.perFocus) : ''}" data-sort-value="${row.perFocus ?? ''}">${formatSilver(row.perFocus, { digits: 1 })}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table pasture-table calc-table">
                <colgroup>
                    <col class="farming-col-item">
                    <col class="farming-col-price">
                    <col class="farming-col-price">
                    <col class="farming-col-price">
                    <col class="farming-col-price">
                    <col class="farming-col-price">
                    <col class="farming-col-num">
                    <col class="farming-col-num">
                    <col class="farming-col-num">
                    <col class="farming-col-verdict">
                    <col class="farming-col-num">
                </colgroup>
                <thead>
                    <tr>
                        ${sortHeaderHtml('Hayvan', { key: 'item', type: 'number', direction: dir('item'), title: 'Pasture hayvanı' })}
                        ${sortHeaderHtml('Yavru', { key: 'baby', type: 'number', className: 'num farming-num', direction: dir('baby'), title: 'Yavru alış fiyatı' })}
                        ${sortHeaderHtml('Yem', { key: 'feed', type: 'number', className: 'num farming-num', direction: dir('feed'), title: state.feedMode === 'grow' ? 'Yem tohumu / birim maliyet' : 'Yem piyasa alış' })}
                        ${sortHeaderHtml('Büyümüş', { key: 'grown', type: 'number', className: 'num farming-num', direction: dir('grown'), title: 'Büyümüş satış fiyatı' })}
                        ${sortHeaderHtml('Et', { key: 'meat', type: 'number', className: 'num farming-num', direction: dir('meat'), title: 'Et satış fiyatı' })}
                        ${sortHeaderHtml('Ürün', { key: 'product', type: 'number', className: 'num farming-num', direction: dir('product'), title: 'Süt veya yumurta satış fiyatı' })}
                        ${sortHeaderHtml('Büyüt', { key: 'grow', type: 'number', className: 'num farming-num', direction: dir('grow'), title: 'Büyütüp satma: kâr % (üst) ve gümüş (alt)' })}
                        ${sortHeaderHtml('Kes', { key: 'butcher', type: 'number', className: 'num farming-num', direction: dir('butcher'), title: 'Kesme: kâr % (üst) ve gümüş (alt)' })}
                        ${sortHeaderHtml('Besle', { key: 'milk', type: 'number', className: 'num farming-num', direction: dir('milk'), title: 'Süt / yumurta: kâr % (üst) ve gümüş (alt)' })}
                        ${sortHeaderHtml('En iyi', { key: 'best', type: 'number', direction: dir('best'), title: 'En yüksek kâr % yolu' })}
                        ${sortHeaderHtml('gümüş/focus', { key: 'focus', type: 'number', className: 'num farming-num', direction: dir('focus'), title: 'Focus başına ek gümüş' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function latestQuoteDate() {
    const dates = animals()
        .flatMap((item) => [
            babyQuote(item)?.date,
            feedInputQuote(item)?.date,
            grownQuote(item)?.date,
            meatQuote(item)?.date,
            productQuote(item)?.date
        ])
        .filter(Boolean)
        .sort();
    return dates.length > 0 ? dates[dates.length - 1] : '';
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="pastureResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="pastureResult"></div>';
    }

    const babySetup = placesOrder('buy', state.babySide);
    const feedSetup = placesOrder('buy', state.feedSide);
    const grownSetup = placesOrder('sell', state.grownSide);
    const meatSetup = placesOrder('sell', state.meatSide);
    const productSetup = placesOrder('sell', state.productSide);
    const stamp = formatDateTime(latestQuoteDate());
    const feedModeNote = state.feedMode === 'grow'
        ? `yem = ekin birim maliyeti (tohum ${priceSideHint(state.feedSide, 'buy')}${feedSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}${state.water ? ' · sulama' : ''})`
        : `yem = piyasa ${priceSideHint(state.feedSide, 'buy')}${feedSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const focusNote = state.focus
        ? ' Focus açık: yavru ihtimali + focus bonusu; gümüş/focus = en iyi yol kâr farkı / sabit focus.'
        : '';

    return `
        <div id="pastureResult">
            ${renderTable()}
            ${calcExplainShell('pastureExplain')}
            <p class="farming-note">
                ${escapeHtml(cityLabel(state.city))} · yavru ${escapeHtml(priceSideHint(state.babySide, 'buy'))}${babySetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}.
                ${escapeHtml(feedModeNote)}.
                Satış: büyümüş ${escapeHtml(priceSideHint(state.grownSide, 'sell'))}${grownSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''},
                et ${escapeHtml(priceSideHint(state.meatSide, 'sell'))}${meatSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''},
                ürün ${escapeHtml(priceSideHint(state.productSide, 'sell'))}${productSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}.
                Büyütme / besleme yem ×${feedQty()}, kesme et ×${meatQty()}, ürün ×${productQty()}. Domuzda süt yok.
                Kâr sütunlarında üstte % (maliyete oran), altta gümüş. En iyi = en yüksek %.
                Yavru işareti NPC fiyatına göre.${focusNote}
                Elle yazılan fiyat API’nin yerine geçer. Kırmızı fiyat API’de yok; mavi 6 saatten eski.${stamp ? ` ${stamp}` : ''}
            </p>
        </div>
    `;
}

function bindPastureSort(container) {
    const table = container.querySelector('.pasture-table');
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
    tr.classList.toggle('is-best', row.item.id === bestId);
    tr.cells[0].dataset.sortValue = String(row.item.tier);

    const setPriceCell = (cell, manualRaw, fetched, quotePrice) => {
        cell.dataset.sortValue = quotePrice ?? '';
        applyPriceFieldState(cell.querySelector('.farming-price-field'), {
            manual: isManualPrice(manualRaw),
            missing: !fetched,
            date: fetched?.date,
            displayValue: priceInputValue(manualRaw, fetched?.price)
        });
    };

    setPriceCell(tr.cells[1], state.manualBabies[row.item.id], fetchedQuote(row.item.babyId, state.babySide, 'buy'), row.baby?.price);
    const babyField = tr.cells[1].querySelector('.farming-price-field');
    let mark = babyField?.querySelector('.price-field-mark, .farming-seed-mark');
    if (row.mark) {
        if (!mark && babyField) {
            mark = document.createElement('span');
            babyField.append(mark);
        }
        if (mark) {
            mark.className = `price-field-mark farming-seed-mark float-cut is-${row.mark.tone}`;
            mark.textContent = row.mark.label;
        }
    } else if (mark) {
        mark.remove();
    }

    const feedCell = tr.cells[2];
    feedCell.dataset.sortValue = row.unit ?? '';
    const feedField = feedCell.querySelector('.farming-price-field');
    applyPriceFieldState(feedField, {
        manual: isManualPrice(state.manualFeeds[row.item.id]),
        missing: !fetchedFeedQuote(row.item),
        date: fetchedFeedQuote(row.item)?.date,
        displayValue: priceInputValue(state.manualFeeds[row.item.id], fetchedFeedQuote(row.item)?.price)
    });
    setPriceFieldMeta(feedField, feedMetaText(row));

    setPriceCell(tr.cells[3], state.manualGrowns[row.item.id], fetchedQuote(row.item.grownId, state.grownSide, 'sell'), row.grown?.price);
    setPriceCell(tr.cells[4], state.manualMeats[row.item.id], fetchedQuote(row.item.meatId, state.meatSide, 'sell'), row.meat?.price);

    const productCell = tr.cells[5];
    if (row.item.productId) {
        productCell.dataset.sortValue = row.product?.price ?? '';
        const field = productCell.querySelector('.farming-price-field');
        if (field) {
            applyPriceFieldState(field, {
                manual: isManualPrice(state.manualProducts[row.item.id]),
                missing: !fetchedQuote(row.item.productId, state.productSide, 'sell'),
                date: fetchedQuote(row.item.productId, state.productSide, 'sell')?.date,
                displayValue: priceInputValue(
                    state.manualProducts[row.item.id],
                    fetchedQuote(row.item.productId, state.productSide, 'sell')?.price
                )
            });
        }
    } else {
        productCell.dataset.sortValue = '';
        productCell.textContent = '—';
    }

    const patchProfit = (cell, pct, silver, isBest) => {
        cell.dataset.sortValue = pct ?? '';
        cell.className = `num farming-num pasture-profit-cell${profitClass(pct ?? silver)}${incompleteClass(pct)}${isBest ? ' is-path-best' : ''}`;
        if (!Number.isFinite(pct) && !Number.isFinite(silver)) {
            cell.textContent = '—';
            return;
        }
        cell.innerHTML = `
            <span class="pasture-profit-pct">${formatPct(pct)}</span>
            <span class="pasture-profit-silver">${formatSilver(silver, { signed: true })}</span>
        `;
    };

    patchProfit(tr.cells[6], row.pctGrow, row.profitGrow, row.best?.id === 'grow');
    patchProfit(tr.cells[7], row.pctButcher, row.profitButcher, row.best?.id === 'butcher');
    if (row.item.productId) {
        patchProfit(tr.cells[8], row.pctFeed, row.profitFeed, row.best?.id === 'feed');
    } else {
        tr.cells[8].dataset.sortValue = '';
        tr.cells[8].textContent = '—';
        tr.cells[8].className = 'num farming-num pasture-profit-cell';
    }

    tr.cells[9].dataset.sortValue = row.best?.pct ?? '';
    tr.cells[9].textContent = pathLabel(row.best);
    tr.cells[9].className = `farming-verdict${row.best ? ' is-profit' : ''}${incompleteClass(row.best)}`;

    tr.cells[10].dataset.sortValue = row.perFocus ?? '';
    tr.cells[10].textContent = formatSilver(row.perFocus, { digits: 1 });
    tr.cells[10].className = `num farming-num${state.focus ? incompleteClass(row.perFocus) : ''}`;

    const chanceMeta = tr.querySelector('.pasture-animal-meta');
    if (chanceMeta) {
        chanceMeta.innerHTML = `${itemIconHtml(row.item.babyId, { className: 'item-icon farming-seed-icon' })} yavru · ${formatPct(row.chance)}`;
    }
}

function refreshCalc(container) {
    const table = container.querySelector('.pasture-table');
    if (!table) {
        return;
    }
    const list = rows();
    const bestId = bestProfitId(list);
    for (const row of list) {
        const tr = table.querySelector(`tr[data-item-id="${row.item.id}"]`);
        if (tr) {
            patchRowCells(tr, row, bestId);
        }
    }
    refreshCalcExplain(container.querySelector('#pastureExplain'));
}

function bindPriceInputs(container) {
    initFloatingLabels(container);

    const binders = [
        { sel: '[data-baby-price]', map: 'manualBabies', key: 'babyPrice' },
        { sel: '[data-feed-price]', map: 'manualFeeds', key: 'feedPrice' },
        { sel: '[data-grown-price]', map: 'manualGrowns', key: 'grownPrice' },
        { sel: '[data-meat-price]', map: 'manualMeats', key: 'meatPrice' },
        { sel: '[data-product-price]', map: 'manualProducts', key: 'productPrice' }
    ];

    const resolveFetched = (item, key) => {
        if (key === 'babyPrice') {
            return fetchedQuote(item.babyId, state.babySide, 'buy');
        }
        if (key === 'feedPrice') {
            return fetchedFeedQuote(item);
        }
        if (key === 'grownPrice') {
            return fetchedQuote(item.grownId, state.grownSide, 'sell');
        }
        if (key === 'meatPrice') {
            return fetchedQuote(item.meatId, state.meatSide, 'sell');
        }
        return item.productId ? fetchedQuote(item.productId, state.productSide, 'sell') : null;
    };

    const dataKey = (input, key) => {
        if (key === 'babyPrice') {
            return input.dataset.babyPrice;
        }
        if (key === 'feedPrice') {
            return input.dataset.feedPrice;
        }
        if (key === 'grownPrice') {
            return input.dataset.grownPrice;
        }
        if (key === 'meatPrice') {
            return input.dataset.meatPrice;
        }
        return input.dataset.productPrice;
    };

    for (const binder of binders) {
        container.querySelectorAll(binder.sel).forEach((input) => {
            if (input.dataset.priceBound === 'on') {
                return;
            }
            input.dataset.priceBound = 'on';

            input.addEventListener('input', () => {
                const id = dataKey(input, binder.key);
                state[binder.map][id] = input.value;
                refreshCalc(container);
            });

            input.addEventListener('change', () => {
                const id = dataKey(input, binder.key);
                const item = animals().find((row) => row.id === id);
                if (parsePrice(input.value) == null) {
                    state[binder.map][id] = null;
                    const fetched = item ? resolveFetched(item, binder.key) : null;
                    input.value = fetched ? formatSilver(fetched.price) : '';
                    input.classList.toggle('is-filled', input.value.length > 0);
                }
                refreshCalc(container);
            });
        });
    }
}

function refreshOutput(container) {
    const result = container.querySelector('#pastureResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#pastureResult'));
    bindPastureSort(container);
    bindPriceInputs(container);
    bindExplain(container);
    bindCalcSticky(container);
}

function sideFieldsHtml() {
    const feedLabel = state.feedMode === 'grow' ? 'Yem tohum' : 'Yem';
    return `
        <div class="farming-side-field">
            <span class="farming-side-label" id="pastureBabySideLabel">Yavru</span>
            <div class="price-side" role="radiogroup" aria-labelledby="pastureBabySideLabel">
                ${priceSideToggleHtml('baby', state.babySide)}
            </div>
        </div>
        <div class="farming-side-field">
            <span class="farming-side-label" id="pastureFeedSideLabel">${escapeHtml(feedLabel)}</span>
            <div class="price-side" role="radiogroup" aria-labelledby="pastureFeedSideLabel">
                ${priceSideToggleHtml('feed', state.feedSide)}
            </div>
        </div>
        <div class="farming-side-field">
            <span class="farming-side-label" id="pastureGrownSideLabel">Büyümüş</span>
            <div class="price-side" role="radiogroup" aria-labelledby="pastureGrownSideLabel">
                ${priceSideToggleHtml('grown', state.grownSide)}
            </div>
        </div>
        <div class="farming-side-field">
            <span class="farming-side-label" id="pastureMeatSideLabel">Et</span>
            <div class="price-side" role="radiogroup" aria-labelledby="pastureMeatSideLabel">
                ${priceSideToggleHtml('meat', state.meatSide)}
            </div>
        </div>
        <div class="farming-side-field">
            <span class="farming-side-label" id="pastureProductSideLabel">Ürün</span>
            <div class="price-side" role="radiogroup" aria-labelledby="pastureProductSideLabel">
                ${priceSideToggleHtml('product', state.productSide)}
            </div>
        </div>
    `;
}

function renderPage(container) {
    container.innerHTML = `
        <section class="farming-hero pasture-hero">
            <h1>Pasture</h1>
            <p>Seçilen şehirde hayvan büyütme, kesme ve süt/yumurta kârı. Yemi ada birim maliyetiyle veya piyasa buy+1 ile hesapla; en iyi yolu işaretler.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="farming-toolbar pasture-toolbar">
                    <div class="farming-type" role="radiogroup" aria-label="Yem kaynağı">
                        ${renderFeedModeToggle()}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Focus">
                        ${renderFocusToggle()}
                    </div>
                    ${sideFieldsHtml()}
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="pastureCity">
                            ${renderCityOptions()}
                        </select>
                        <label for="pastureCity">Şehir</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'pastureRefresh', apiId: 'pastureRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindPastureSort(container);
    bindPriceInputs(container);
    bindExplain(container);
    bindCalcSticky(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-feed-mode]').forEach((button) => {
        button.addEventListener('click', () => {
            state.feedMode = button.dataset.feedMode === 'market' ? 'market' : 'grow';
            state.manualFeeds = {};
            savePrefs();
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-premium]').forEach((button) => {
        button.addEventListener('click', () => {
            state.premium = button.dataset.premium === '1';
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-focus]').forEach((button) => {
        button.addEventListener('click', () => {
            state.focus = button.dataset.focus === '1';
            savePrefs();
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const side = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            const target = button.dataset.priceFor;
            if (target === 'baby') {
                state.babySide = side;
            } else if (target === 'feed') {
                state.feedSide = side;
            } else if (target === 'grown') {
                state.grownSide = side;
            } else if (target === 'meat') {
                state.meatSide = side;
            } else if (target === 'product') {
                state.productSide = side;
            }
            renderPage(container);
        });
    });

    container.querySelector('#pastureCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        saveCity(value);
        renderPage(container);
    });

    bindPriceRefresh(container, {
        refreshId: 'pastureRefresh',
        apiId: 'pastureRefreshApi',
        load: (options) => loadPrices(container, options)
    });
}

function priceItemIds() {
    const ids = new Set();
    for (const item of animals()) {
        ids.add(item.babyId);
        ids.add(item.grownId);
        ids.add(item.meatId);
        ids.add(item.feedSeedId);
        ids.add(item.feedPlantId);
        if (item.productId) {
            ids.add(item.productId);
        }
    }
    return [...ids];
}

async function loadPrices(container, { showLoader = true, source } = {}) {
    applyPriceLoadMode(state, { source, showLoader });
    state.error = null;
    if (showLoader) {
        showPageLoader(priceLoaderMessage(source, 'Şehir fiyatları alınıyor…'));
    }

    try {
        const locations = cityNames();
        if (locations.length === 0) {
            throw new Error('Aktif şehir yok.');
        }
        const rows = await fetchPrices(priceItemIds(), locations, { source });
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
        if (container.querySelector('#pastureResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('pastureTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.water = settings.farmWater === true;
    state.babySide = settings.buyPriceSide;
    state.feedSide = settings.buyPriceSide;
    state.grownSide = settings.sellPriceSide;
    state.meatSide = settings.sellPriceSide;
    state.productSide = settings.sellPriceSide;
    readPrefs();

    showPageLoader('Pasture yükleniyor…');
    try {
        await initStore();
        state.cities = loadActiveCities();
        state.city = readSavedCity(state.cities);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: priceItemIds(),
            cities: [state.city],
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
