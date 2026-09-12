import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { bonusDayIso, bonusWindowLabel } from './bonus-day.js';
import { getBonusFamilyLabel } from './bonus-families.js';
import { defaultCraftBonusRate, normalizeCraftBonusRate, todayCraftBonuses, craftBonusToggleHtml } from './craft-bonus.js';
import { getSettings } from './settings.js';
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
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { bindLivePrices } from './price-live.js';
import { loadActiveCities } from './cities.js';
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
const PREFS_STORAGE_KEY = 'albiontools.v4.furniture.prefs';
const DEFAULT_CITY = 'Martlock';

const KINDS = [
    { id: 'all', label: 'Hepsi' },
    { id: 'chest', label: 'Sandık' },
    { id: 'bed', label: 'Yatak' },
    { id: 'table', label: 'Masa' }
];

const MAT_KINDS = {
    plank: { stem: 'PLANKS', short: 'Plank' },
    bar: { stem: 'METALBAR', short: 'Bar' },
    cloth: { stem: 'CLOTH', short: 'Cloth' }
};

const FURNITURE = [
    { kind: 'chest', label: 'Chest', stem: 'FURNITUREITEM_CHEST', tiers: [2, 3, 4, 5], recipe: { plank: 20, bar: 10 } },
    { kind: 'bed', label: 'Bed', stem: 'FURNITUREITEM_BED', tiers: [2, 3, 4, 5, 6, 7, 8], recipe: { plank: 10, cloth: 20 } },
    { kind: 'table', label: 'Table', stem: 'FURNITUREITEM_TABLE', tiers: [2, 3, 4, 5, 6, 7, 8], recipe: { plank: 30, cloth: 30 } }
];

function matId(kind, tier) {
    return `T${tier}_${MAT_KINDS[kind].stem}`;
}

function matKey(kind, tier) {
    return `${kind}-${tier}`;
}

function furnitureId(stem, tier) {
    return `T${tier}_${stem}`;
}

const ITEMS = FURNITURE.flatMap((group) => group.tiers.map((tier) => ({
    id: `${group.kind}-${tier}`,
    uniqueName: furnitureId(group.stem, tier),
    kind: group.kind,
    label: group.label,
    tier,
    recipe: group.recipe
})));

const MATS = [];
for (const item of ITEMS) {
    for (const kind of Object.keys(item.recipe)) {
        const key = matKey(kind, item.tier);
        if (!MATS.some((mat) => mat.key === key)) {
            MATS.push({
                key,
                kind,
                tier: item.tier,
                uniqueName: matId(kind, item.tier),
                short: `T${item.tier} ${MAT_KINDS[kind].short}`
            });
        }
    }
}

const state = {
    premium: true,
    matSide: 'buy',
    itemSide: 'sell',
    kind: 'all',
    city: DEFAULT_CITY,
    cities: [],
    priceIndex: null,
    manualMats: Object.fromEntries(MATS.map((mat) => [mat.key, null])),
    manualItems: Object.fromEntries(ITEMS.map((item) => [item.id, null])),
    bonusRate: 0,
    error: null,
    loaded: false,
    livePaused: false,
    sort: { key: 'pct', direction: 'desc' }
};

function visibleItems() {
    if (state.kind === 'all') {
        return ITEMS;
    }
    return ITEMS.filter((item) => item.kind === state.kind);
}

function visibleMats() {
    const keys = new Set();
    for (const item of visibleItems()) {
        for (const kind of Object.keys(item.recipe)) {
            keys.add(matKey(kind, item.tier));
        }
    }
    return MATS.filter((mat) => keys.has(mat.key));
}

function visibleTiers() {
    return [...new Set(visibleItems().map((item) => item.tier))].sort((a, b) => a - b);
}

function productionBonus() {
    return CITY_PRODUCTION + state.bonusRate;
}

function returnRate() {
    const bonus = productionBonus();
    return bonus / (100 + bonus);
}

function salesTax() {
    return salesTaxRate(state.premium);
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

function readPrefs(cities) {
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY)
            ?? localStorage.getItem('albiontools.v4.chesting.prefs');
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (KINDS.some((kind) => kind.id === parsed.kind)) {
            state.kind = parsed.kind;
        }
        if (cities.some((city) => city.marketApiName === parsed.city)) {
            state.city = parsed.city;
        }
    } catch {
        /* ignore */
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
            kind: state.kind,
            city: state.city
        }));
    } catch {
        /* ignore */
    }
}

function fetchedMatQuote(key) {
    const mat = MATS.find((row) => row.key === key);
    if (!mat) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, mat.uniqueName, state.city), state.matSide, 'buy');
}

function fetchedItemQuote(id) {
    const item = ITEMS.find((row) => row.id === id);
    if (!item) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, item.uniqueName, state.city), state.itemSide, 'sell');
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

function matQuote(key) {
    const parsed = parsePrice(state.manualMats[key]);
    if (parsed != null) {
        return manualQuote(parsed, state.matSide, 'buy');
    }
    return fetchedMatQuote(key);
}

function itemQuote(id) {
    const parsed = parsePrice(state.manualItems[id]);
    if (parsed != null) {
        return manualQuote(parsed, state.itemSide, 'sell');
    }
    return fetchedItemQuote(id);
}

function matCost(item) {
    let raw = 0;
    const parts = {};
    for (const [kind, qty] of Object.entries(item.recipe)) {
        const quote = matQuote(matKey(kind, item.tier));
        if (!quote) {
            return null;
        }
        const total = quote.price * qty;
        parts[kind] = total;
        raw += total;
    }
    return { ...parts, raw };
}

function rows() {
    const rr = returnRate();
    const matSetup = placesOrder('buy', state.matSide);

    return visibleItems().map((item) => {
        const quote = itemQuote(item.id);
        const parts = matCost(item);
        const cost = parts == null
            ? null
            : purchaseCost(parts.raw * (1 - rr), { setup: matSetup });
        const sell = quote
            ? saleProceeds(quote.price, { premium: state.premium, setup: quote.setup })
            : null;
        const profit = cost != null && sell != null ? sell - cost : null;
        const pct = profit != null && cost > 0 ? profit / cost : null;

        return { item, quote, parts, rr, cost, sell, profit, pct };
    });
}

function recipeChips(item) {
    return Object.entries(item.recipe).map(([kind, qty]) => `
        <span class="ava-chip">
            ${itemIconHtml(matId(kind, item.tier), { className: 'item-icon ava-chip-icon' })}
            <span>${qty}</span>
        </span>
    `).join('');
}

function renderKindToggle() {
    return KINDS.map((kind) => {
        const pressed = kind.id === state.kind;
        return `
            <button type="button" class="ava-type-btn${pressed ? ' is-active' : ''}"
                data-kind="${escapeHtml(kind.id)}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(kind.label)}
            </button>
        `;
    }).join('');
}

function renderPremiumToggle() {
    const options = [
        { id: true, label: 'Premium' },
        { id: false, label: 'Premium yok' }
    ];

    return options.map((option) => {
        const pressed = option.id === state.premium;
        return `
            <button type="button" class="ava-type-btn${pressed ? ' is-active' : ''}"
                data-premium="${option.id ? '1' : '0'}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderCityOptions() {
    return state.cities.map((city) => {
        const selected = city.marketApiName === state.city ? ' selected' : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${selected}>${escapeHtml(city.displayName)}</option>`;
    }).join('');
}

function renderBonusNote() {
    const extra = state.bonusRate ? ` · +${state.bonusRate}%` : '';
    const recorded = todayCraftBonuses();
    const today = recorded.length === 0
        ? 'kayıt yok.'
        : recorded.map((bonus) =>
            `${escapeHtml(getBonusFamilyLabel(bonus.key))} +${bonus.rate}%`
        ).join(' · ');

    return `<p class="ava-note">RR ${formatPct(returnRate())}${extra}. Carpenter şehir tabanı ${CITY_PRODUCTION}%.
        Bugün (${escapeHtml(bonusWindowLabel(bonusDayIso()))}): ${today}
        <a href="daily-bonus.html">Günlük bonus</a></p>`;
}

function renderTierMats() {
    const tiers = visibleTiers();
    return `
        <ul class="ava-mats ava-mats--furniture">
            ${tiers.map((tier) => {
                const mats = visibleMats().filter((mat) => mat.tier === tier);
                return `
                    <li class="ava-mat ava-mat--tier">
                        <span class="ava-mat-text">
                            <span class="ava-mat-label">T${tier}</span>
                            <span class="ava-mat-meta">${escapeHtml(priceSideHint(state.matSide, 'buy'))}</span>
                            ${mats.map((mat) => {
                                const fetched = fetchedMatQuote(mat.key);
                                return `
                                    <span class="ava-tier-row" data-mat-card="${escapeHtml(mat.key)}">
                                        ${itemIconHtml(mat.uniqueName)}
                                        ${priceFieldHtml({
                                            id: `matPrice-${mat.key}`,
                                            label: MAT_KINDS[mat.kind].short,
                                            value: priceInputValue(state.manualMats[mat.key], fetched?.price),
                                            manual: isManualPrice(state.manualMats[mat.key]),
                                            missing: !fetched,
                                            date: fetched?.date,
                                            dataAttr: `data-mat-price="${escapeHtml(mat.key)}"`,
                                            fieldClass: 'ava-price-field',
                                            iconId: mat.uniqueName
                                        })}
                                    </span>
                                `;
                            }).join('')}
                        </span>
                    </li>
                `;
            }).join('')}
        </ul>
    `;
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

function latestQuoteDate(list) {
    const dates = list
        .flatMap((row) => [
            row.quote?.date,
            ...Object.keys(row.item.recipe).map((kind) => matQuote(matKey(kind, row.item.tier))?.date)
        ])
        .filter(Boolean)
        .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
}

function renderSummary(list) {
    const best = bestRow(list);
    if (!best) {
        return '<p class="ava-note" id="furnitureSummary"><strong>Bu senaryoda kâr hesaplanamadı.</strong> Eksik fiyatları doldur.</p>';
    }
    const name = `T${best.item.tier} ${best.item.label}`;
    if (best.profit < 0) {
        return `<p class="ava-note" id="furnitureSummary"><strong>Bu senaryoda zarar.</strong> En az zarar ${escapeHtml(name)} · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.</p>`;
    }
    return `<p class="ava-note" id="furnitureSummary"><strong>En kârlı ${escapeHtml(name)}</strong> · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.</p>`;
}

function renderExplain(key, { hovered } = {}) {
    const row = rows().find((item) => item.item.id === key);
    if (!row) {
        return explainEmptyHtml('Satır bulunamadı.');
    }

    const bonus = productionBonus();
    const rr = row.rr;
    const keep = 1 - rr;
    const matSetup = placesOrder('buy', state.matSide);
    const tax = salesTax();
    const sellSetup = row.quote?.setup ?? placesOrder('sell', state.itemSide);
    const afterRr = row.parts?.raw != null ? row.parts.raw * keep : null;
    const itemIcon = itemIconHtml(row.item.uniqueName, { className: 'item-icon calc-explain-icon' });
    const chips = [{ label: 'şehir', value: CITY_PRODUCTION, tone: 'city', title: 'Carpenter şehir taban bonusu' }];
    if (state.bonusRate) {
        chips.push({ label: 'bonus', value: state.bonusRate, tone: 'bonus', title: 'Ek üretim bonusu' });
    }

    const matLines = [];
    for (const [kind, qty] of Object.entries(row.item.recipe)) {
        const quote = matQuote(matKey(kind, row.item.tier));
        const lineTotal = quote ? quote.price * qty : null;
        matLines.push(explainStep({
            icon: itemIconHtml(matId(kind, row.item.tier), { className: 'item-icon calc-explain-icon' }),
            label: `T${row.item.tier} ${MAT_KINDS[kind].short}`,
            note: 'Tarifteki adet × birim alış fiyatı',
            formula: [
                explainNum(qty, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(quote?.price, { tone: 'price', cap: 'birim fiyat' })
            ],
            result: lineTotal,
            resultKind: 'cost',
            resultCap: 'satır tutarı'
        }));
    }
    matLines.push(explainStep({
        label: 'Malzeme toplamı',
        note: 'Return rate düşülmeden önceki ham gümüş',
        result: row.parts?.raw,
        resultKind: 'cost',
        resultCap: 'ham toplam'
    }));
    matLines.push(explainStep({
        label: 'İade sonrası',
        note: `Malzemenin ${formatPct(rr)}’si istasyona geri döner; ödediğin pay ${formatPct(keep)}`,
        formula: [
            explainNum(row.parts?.raw, { tone: 'cost', cap: 'ham toplam' }),
            explainOp('×'),
            explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen pay' })
        ],
        result: afterRr,
        resultKind: 'cost',
        resultCap: 'ödenen'
    }));
    matLines.push(matSetup
        ? explainStep({
            label: 'Alış komisyonu',
            note: 'Buy emri koyunca %2,5 setup fee',
            formula: [
                explainNum(afterRr, { tone: 'cost', cap: 'ödenen' }),
                explainOp('×'),
                explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
            ],
            result: row.cost,
            resultKind: 'cost',
            resultCap: 'maliyet'
        })
        : explainStep({
            label: 'Alış komisyonu',
            note: 'Anında alış; setup fee yok',
            result: row.cost,
            resultKind: 'cost',
            resultCap: 'maliyet'
        }));

    return explainPanelHtml({
        icon: itemIcon,
        title: `T${row.item.tier} ${row.item.label}`,
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
                intro: explainChips(chips),
                lines: [
                    explainStep({
                        label: 'İade oranı',
                        note: 'bonus / (100 + bonus) — carpenter’da geri gelen malzeme payı',
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
            { title: 'Malzeme maliyeti', tone: 'cost', lines: matLines },
            {
                title: 'Satış',
                tone: 'sell',
                lines: explainSaleSteps({
                    price: row.quote?.price,
                    tax,
                    setup: sellSetup,
                    sell: row.sell,
                    label: cityLabel(state.city),
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
        panel: container.querySelector('#furnitureExplain'),
        table: container.querySelector('.ava-table'),
        rowKey: (tr) => tr.dataset.itemId,
        keys: () => rows().map((row) => row.item.id),
        defaultKey: () => bestRow(rows())?.item.id ?? rows()[0]?.item.id ?? null,
        render: (key, meta) => renderExplain(key, meta)
    });
}

function renderTable() {
    const list = rows();
    const best = bestRow(list);
    const body = list.map((row) => {
        const bonusMark = state.bonusRate
            ? `<span class="ava-bonus">+${state.bonusRate}%</span>`
            : '';
        const fetched = fetchedItemQuote(row.item.id);
        const sellValue = priceInputValue(state.manualItems[row.item.id], fetched?.price);
        const bestClass = best && row.item.id === best.item.id ? ' is-best' : '';
        return `
            <tr data-item-id="${escapeHtml(row.item.id)}" class="${bestClass.trim()}">
                <td>
                    <span class="ava-item">
                        ${itemIconHtml(row.item.uniqueName)}
                        <span>
                            <span class="ava-item-name">T${row.item.tier} ${escapeHtml(row.item.label)}${bonusMark}</span>
                            <span class="ava-item-meta">${escapeHtml(itemLabel(row.item.uniqueName, row.item.label))} · RR ${formatPct(row.rr)}</span>
                        </span>
                    </span>
                </td>
                <td class="ava-recipe">${recipeChips(row.item)}</td>
                <td class="num ava-num${incompleteClass(row.cost)}" data-sort-value="${row.cost ?? ''}">${formatSilver(row.cost)}</td>
                <td class="num ava-num ava-price-cell" data-sort-value="${row.quote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `itemPrice-${row.item.id}`,
                        label: 'Satış',
                        value: sellValue,
                        manual: isManualPrice(state.manualItems[row.item.id]),
                        missing: !fetched,
                        date: fetched?.date,
                        dataAttr: `data-item-price="${escapeHtml(row.item.id)}"`,
                        fieldClass: 'ava-price-field',
                        iconId: row.item.uniqueName
                    })}
                </td>
                <td class="num ava-num${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}">${formatSilver(row.sell)}</td>
                <td class="num ava-num${profitClass(row.profit)}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}">${formatSilver(row.profit, { signed: true })}</td>
                <td class="num ava-num${profitClass(row.profit)}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}">${formatPct(row.pct)}</td>
            </tr>
        `;
    }).join('');

    const sort = state.sort;

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped ava-table calc-table">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Eşya', { key: 'item', type: 'text', direction: sort.key === 'item' ? sort.direction : null, title: 'Üretilen dekorasyon' })}
                        ${sortHeaderHtml('Tarif', { key: 'recipe', type: 'text', direction: sort.key === 'recipe' ? sort.direction : null, title: 'Craft için gereken malzemeler' })}
                        ${sortHeaderHtml('Maliyet', { key: 'cost', type: 'number', className: 'num ava-num', direction: sort.key === 'cost' ? sort.direction : null, title: 'RR düşülmüş malzeme maliyeti' })}
                        ${sortHeaderHtml('Fiyat', { key: 'price', type: 'number', className: 'num ava-num', direction: sort.key === 'price' ? sort.direction : null, title: 'Piyasa satış fiyatı' })}
                        ${sortHeaderHtml('Net', { key: 'sell', type: 'number', className: 'num ava-num', direction: sort.key === 'sell' ? sort.direction : null, title: 'Vergi sonrası net satış' })}
                        ${sortHeaderHtml('Kâr', { key: 'profit', type: 'number', className: 'num ava-num', direction: sort.key === 'profit' ? sort.direction : null, title: 'Net satış eksi maliyet' })}
                        ${sortHeaderHtml('%', { key: 'pct', type: 'number', className: 'num ava-num', direction: sort.key === 'pct' ? sort.direction : null, title: 'Kârın maliyete oranı' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="furnitureResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="furnitureResult"></div>';
    }

    const list = rows();
    const matSetup = placesOrder('buy', state.matSide);
    const itemSetup = placesOrder('sell', state.itemSide);
    const matNote = `${priceSideHint(state.matSide, 'buy')}${matSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const itemNote = `${priceSideHint(state.itemSide, 'sell')}${itemSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''} · vergi ${formatPct(salesTax())}`;
    const stamp = formatDateTime(latestQuoteDate(list));

    return `
        <div id="furnitureResult">
            ${renderTierMats()}
            ${renderTable()}
            ${calcExplainShell('furnitureExplain')}
            ${renderSummary(list)}
            ${renderBonusNote()}
            <p class="ava-note">Malzeme ve satış ${escapeHtml(cityLabel(state.city))} · ${escapeHtml(matNote)}. Satış ${escapeHtml(itemNote)}. Elle yazılan alış/satış API’nin yerine geçer. Kırmızı fiyat API’de yok; turuncu 6 saatten eski.${stamp ? ` ${escapeHtml(stamp)}.` : ''}</p>
        </div>
    `;
}

function bindTableSort(container) {
    const table = container.querySelector('.ava-table');
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

    const costCell = tr.cells[2];
    const priceCell = tr.cells[3];
    const sellCell = tr.cells[4];
    const profitCell = tr.cells[5];
    const pctCell = tr.cells[6];

    costCell.dataset.sortValue = row.cost ?? '';
    costCell.textContent = formatSilver(row.cost);
    costCell.className = `num ava-num${incompleteClass(row.cost)}`;

    priceCell.dataset.sortValue = row.quote?.price ?? '';
    const itemFetched = fetchedItemQuote(row.item.id);
    applyPriceFieldState(priceCell.querySelector('.ava-price-field'), {
        manual: Boolean(row.quote?.manual),
        missing: !itemFetched,
        date: itemFetched?.date,
        displayValue: priceInputValue(state.manualItems[row.item.id], itemFetched?.price)
    });

    sellCell.dataset.sortValue = row.sell ?? '';
    sellCell.textContent = formatSilver(row.sell);
    sellCell.className = `num ava-num${incompleteClass(row.sell)}`;

    profitCell.dataset.sortValue = row.profit ?? '';
    profitCell.textContent = formatSilver(row.profit, { signed: true });
    profitCell.className = `num ava-num${profitClass(row.profit)}${incompleteClass(row.profit)}`;

    pctCell.dataset.sortValue = row.pct ?? '';
    pctCell.textContent = formatPct(row.pct);
    pctCell.className = `num ava-num${profitClass(row.profit)}${incompleteClass(row.pct)}`;
}

function refreshCalc(container) {
    const table = container.querySelector('.ava-table');
    const list = rows();
    const best = bestRow(list);
    if (table) {
        for (const row of list) {
            const tr = table.querySelector(`tr[data-item-id="${row.item.id}"]`);
            if (tr) {
                patchRowCells(tr, row, best?.item.id);
            }
        }
    }

    refreshCalcExplain(container.querySelector('#furnitureExplain'));

    const summary = container.querySelector('#furnitureSummary');
    if (summary) {
        const wrap = document.createElement('div');
        wrap.innerHTML = renderSummary(list);
        const next = wrap.querySelector('#furnitureSummary');
        if (next) {
            summary.replaceWith(next);
        }
    }

    visibleMats().forEach((mat) => {
        const card = container.querySelector(`[data-mat-card="${mat.key}"]`);
        if (!card) {
            return;
        }
        const field = card.querySelector('.ava-price-field');
        if (field) {
            const fetched = fetchedMatQuote(mat.key);
            applyPriceFieldState(field, {
                manual: isManualPrice(state.manualMats[mat.key]),
                missing: !fetched,
                date: fetched?.date,
                displayValue: priceInputValue(state.manualMats[mat.key], fetched?.price)
            });
        }
    });
}

function bindPriceInputs(container) {
    initFloatingLabels(container);

    const bindField = (input, kind) => {
        if (input.dataset.priceBound === 'on') {
            return;
        }
        input.dataset.priceBound = 'on';

        input.addEventListener('input', () => {
            if (kind === 'mat') {
                state.manualMats[input.dataset.matPrice] = input.value;
            } else {
                state.manualItems[input.dataset.itemPrice] = input.value;
            }
            refreshCalc(container);
        });

        input.addEventListener('change', () => {
            const key = kind === 'mat' ? input.dataset.matPrice : input.dataset.itemPrice;
            if (parsePrice(input.value) == null) {
                if (kind === 'mat') {
                    state.manualMats[key] = null;
                } else {
                    state.manualItems[key] = null;
                }
                const fetched = kind === 'mat' ? fetchedMatQuote(key) : fetchedItemQuote(key);
                input.value = fetched ? formatSilver(fetched.price) : '';
                input.classList.toggle('is-filled', input.value.length > 0);
            }
            refreshCalc(container);
        });
    };

    container.querySelectorAll('[data-mat-price]').forEach((input) => bindField(input, 'mat'));
    container.querySelectorAll('[data-item-price]').forEach((input) => bindField(input, 'item'));
}

function refreshOutput(container) {
    const result = container.querySelector('#furnitureResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#furnitureResult'));
    bindTableSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
    bindExplain(container);
}

function renderPage(container) {
    container.innerHTML = `
        <section class="ava-hero">
            <h1>Furniture</h1>
            <p>Ada evine konan dekorasyon: sandık, yatak ve masa. Malzeme ve satış aynı şehir; carpenter RR şehir tabanı + bonus.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="ava-toolbar">
                    <div class="ava-type" role="radiogroup" aria-label="Eşya">
                        ${renderKindToggle()}
                    </div>
                    <div class="ava-type" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="furnitureBonusLabel">Bonus</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="furnitureBonusLabel">
                            ${craftBonusToggleHtml(state.bonusRate)}
                        </div>
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="furnitureMatSideLabel">Malzeme</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="furnitureMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="furnitureItemSideLabel">Satış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="furnitureItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    <div class="form-floating ava-city-field">
                        <select class="form-select is-filled" id="furnitureCity">
                            ${renderCityOptions()}
                        </select>
                        <label for="furnitureCity">Şehir</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'furnitureRefresh', apiId: 'furnitureRefreshApi' })}
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
    bindCalcSticky(container);
    bindExplain(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-kind]').forEach((button) => {
        button.addEventListener('click', () => {
            if (!KINDS.some((kind) => kind.id === button.dataset.kind)) {
                return;
            }
            state.kind = button.dataset.kind;
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

    container.querySelectorAll('[data-bonus-rate]').forEach((button) => {
        button.addEventListener('click', () => {
            state.bonusRate = normalizeCraftBonusRate(button.dataset.bonusRate);
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const side = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            if (button.dataset.priceFor === 'item') {
                state.itemSide = side;
            } else {
                state.matSide = side;
            }
            renderPage(container);
        });
    });

    container.querySelector('#furnitureCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        savePrefs();
        renderPage(container);
    });

    bindPriceRefresh(container, {
        refreshId: 'furnitureRefresh',
        apiId: 'furnitureRefreshApi',
        load: (options) => loadPrices(container, options)
    });
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
        const ids = [
            ...MATS.map((mat) => mat.uniqueName),
            ...ITEMS.map((item) => item.uniqueName)
        ];
        const rows = await fetchPrices(ids, locations, { source });
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
        if (container.querySelector('#furnitureResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('furnitureTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.matSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;

    showPageLoader('Furniture yükleniyor…');
    try {
        await initStore();
        state.cities = loadActiveCities();
        if (state.cities.some((city) => city.marketApiName === DEFAULT_CITY)) {
            state.city = DEFAULT_CITY;
        } else {
            state.city = state.cities[0]?.marketApiName ?? DEFAULT_CITY;
        }
        readPrefs(state.cities);
        state.bonusRate = defaultCraftBonusRate([]);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: [
                ...MATS.map((mat) => mat.uniqueName),
                ...ITEMS.map((item) => item.uniqueName)
            ],
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
