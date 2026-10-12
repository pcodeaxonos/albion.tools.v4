import { itemNameHtml } from '../components/item-name.js';
import { toolPageHtml } from '../core/app-runtime.js';
import { escapeHtml } from '../utils/utils.js';
import { routeHref } from '../core/routes.js';
import { getBonusFamilyLabel } from '../core/bonus-families.js';
import { bonusDayIso, bonusWindowLabel } from '../core/bonus-day.js';
import { defaultCraftBonusRate, normalizeCraftBonusRate, todayCraftBonuses, craftBonusToggleHtml } from '../core/craft-bonus.js';
import { getSettings, getDefaultCity } from '../core/settings.js';
import { fetchPrices, indexPrices, cityRow } from '../core/market.js';
import { itemIconHtml, itemLabel } from '../components/item-icon.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { initTableSort, sortHeaderHtml } from '../utils/table-sort.js';
import {
    quoteFromRow,
    priceSideHint,
    priceSideToggleHtml,
    priceFieldHtml,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from '../core/price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder } from '../core/market-fees.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { bindLivePrices } from '../core/price-live.js';
import { loadActiveCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField } from '../components/city-picker.js';
import {
    bindCalcExplain,
    refreshCalcExplain,
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
import { getCraftRecipes, cityProductionBonus } from '../core/catalog.js';
import { formatSilver, formatPct } from '../utils/format.js';
import { parsePrice, isManualPrice, manualQuote } from '../core/manual-pricing.js';
import { cityNames as listCityNames, cityLabel as getCityLabel, readStoredCity, saveStoredCity } from '../core/city-utils.js';
import { profitClass } from '../utils/profit.js';

import { priceRefreshActionsHtml, bindPriceRefresh } from '../components/price-refresh.js';

import { runPriceLoad } from './shared/price-load.js';
import { bindManualPriceFields } from '../components/manual-price-fields.js';

import { returnRateFromProductionBonus } from '../core/economy-math.js';
const FAMILY_KEY = 'gathering/tool';
const CITY_STORAGE_KEY = 'albiontools.v4.avaCraft.city';
const ENERGY_ID = 'QUESTITEM_TOKEN_AVALON';
const TIERS = [4, 5, 6, 7, 8];

function cityProduction() {
    return cityProductionBonus();
}

function items() {
    return getCraftRecipes({ tool: 'ava' }).map((recipe) => ({
        id: recipe.code,
        uniqueName: recipe.uniqueName,
        label: recipe.label,
        tier: recipe.tier,
        familyKey: recipe.familyKey || FAMILY_KEY,
        recipe: recipe.recipe,
        lines: recipe.lines
    }));
}

function mats() {
    const list = [];
    const seen = new Set();
    for (const item of items()) {
        for (const line of item.lines) {
            const key = line.key === 'energy' ? 'energy' : `${line.key}-${item.tier}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            list.push({
                key,
                uniqueName: line.key === 'energy' ? ENERGY_ID : line.uniqueName,
                short: line.key === 'energy' ? 'Energy' : line.short,
                rr: line.appliesRr !== false,
                tier: item.tier,
                kind: line.key
            });
        }
    }
    return list;
}

const state = {
    premium: true,
    matSide: 'buy',
    itemSide: 'sell',
    city: getDefaultCity(),
    cities: [],
    priceIndex: null,
    manualMats: {},
    manualItems: {},
    bonusRate: 0,
    error: null,
    loaded: false,
    sort: { key: 'pct', direction: 'desc' }
};

function ensureManualMaps() {
    for (const mat of mats()) {
        if (!(mat.key in state.manualMats)) {
            state.manualMats[mat.key] = null;
        }
    }
    for (const item of items()) {
        if (!(item.id in state.manualItems)) {
            state.manualItems[item.id] = null;
        }
    }
}

function cityNames() {
    return listCityNames(state.cities);
}

function cityLabel(apiName) {
    return getCityLabel(state.cities, apiName);
}

function readSavedCity(cities) {
    return readStoredCity(CITY_STORAGE_KEY, cities, getDefaultCity());
}

function saveCity(apiName) {
    saveStoredCity(CITY_STORAGE_KEY, apiName);
}

function productionBonus() {
    return cityProduction() + state.bonusRate;
}

function returnRate() {
    return returnRateFromProductionBonus(productionBonus());
}

function salesTax() {
    return salesTaxRate(state.premium);
}

function averageQuote(uniqueName) {
    const quotes = cityNames()
        .map((city) => quoteFromRow(cityRow(state.priceIndex, uniqueName, city), state.matSide, 'buy'))
        .filter(Boolean);

    if (quotes.length === 0) {
        return null;
    }

    const price = quotes.reduce((sum, quote) => sum + quote.price, 0) / quotes.length;
    const dates = quotes.map((quote) => quote.date).filter(Boolean).sort();
    const latest = dates.length > 0 ? dates[dates.length - 1] : null;

    return {
        price,
        book: price,
        date: latest,
        stale: quotes.some((quote) => quote.stale),
        side: state.matSide,
        intent: 'buy',
        tick: 0,
        setup: placesOrder('buy', state.matSide),
        count: quotes.length,
        average: true
    };
}

function fetchedMatQuote(key) {
    const mat = mats().find((row) => row.key === key);
    if (!mat) {
        return null;
    }
    return averageQuote(mat.uniqueName);
}

function fetchedItemQuote(id) {
    const item = items().find((row) => row.id === id);
    if (!item) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, item.uniqueName, state.city), state.itemSide, 'sell');
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
    const plank = matQuote(`plank-${item.tier}`);
    const bar = matQuote(`bar-${item.tier}`);
    const energy = matQuote('energy');
    if (!plank || !bar || !energy) {
        return null;
    }

    const refined = plank.price * item.recipe.plank + bar.price * item.recipe.bar;
    const token = energy.price * item.recipe.energy;
    return { refined, token, raw: refined + token };
}

function rows() {
    const rr = returnRate();
    const matSetup = placesOrder('buy', state.matSide);

    return items().map((item) => {
        const quote = itemQuote(item.id);
        const parts = matCost(item);
        const cost = parts == null
            ? null
            : purchaseCost(parts.refined * (1 - rr) + parts.token, { setup: matSetup });
        const sell = quote
            ? saleProceeds(quote.price, { premium: state.premium, setup: quote.setup })
            : null;
        const profit = cost != null && sell != null ? sell - cost : null;
        const pct = profit != null && cost > 0 ? profit / cost : null;

        return { item, quote, parts, rr, cost, sell, profit, pct };
    });
}

function recipeChips(item) {
    const plank = mats().find((mat) => mat.key === `plank-${item.tier}`)?.uniqueName;
    const bar = mats().find((mat) => mat.key === `bar-${item.tier}`)?.uniqueName;
    return `
        <span class="recipe-chip">
            ${itemIconHtml(plank, { className: 'recipe-chip-icon item-icon recipe-chip-icon--large' })}
            <span>${item.recipe.plank}</span>
        </span>
        <span class="recipe-chip">
            ${itemIconHtml(bar, { className: 'recipe-chip-icon item-icon recipe-chip-icon--large' })}
            <span>${item.recipe.bar}</span>
        </span>
        <span class="recipe-chip">
            ${itemIconHtml(ENERGY_ID, { className: 'recipe-chip-icon item-icon recipe-chip-icon--large' })}
            <span>${item.recipe.energy}</span>
        </span>
    `;
}

function renderPremiumToggle() {
    const options = [
        { id: true, label: 'Premium' },
        { id: false, label: 'Premium yok' }
    ];

    return options.map((option) => {
        const pressed = option.id === state.premium;
        return `
            <button type="button" class="segmented-choice-button${pressed ? ' is-active' : ''}"
                data-premium="${option.id ? '1' : '0'}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderBonusToggle() {
    return craftBonusToggleHtml(state.bonusRate);
}

function renderBonusNote() {
    const extra = state.bonusRate ? ` · +${state.bonusRate}%` : '';
    const recorded = todayCraftBonuses();
    const today = recorded.length === 0
        ? 'kayıt yok.'
        : recorded.map((bonus) =>
            `${escapeHtml(getBonusFamilyLabel(bonus.key))} +${bonus.rate}%`
        ).join(' · ');

    return `<p class="tool-result-note">RR ${formatPct(returnRate())}${extra}. Enerji RR almaz.
        Bugün (${escapeHtml(bonusWindowLabel(bonusDayIso()))}): ${today}
        <a href="${routeHref('daily-bonus')}">Günlük bonus</a></p>`;
}

function renderEnergyCard() {
    const mat = mats()[0];
    const fetched = fetchedMatQuote(mat.key);
    const value = priceInputValue(state.manualMats[mat.key], fetched?.price);
    return `
        <ul class="material-price-list material-price-list--single">
            <li class="material-price-card" data-mat-card="${escapeHtml(mat.key)}">
                ${itemIconHtml(mat.uniqueName)}
                <span class="material-price-card-text">
                    <span class="material-price-card-label">${itemNameHtml(itemLabel(mat.uniqueName, 'Avalonian Energy'))}</span>
                    ${priceFieldHtml({
                        id: 'matPrice-energy',
                        label: 'Alış',
                        value,
                        manual: isManualPrice(state.manualMats[mat.key]),
                        missing: !fetched,
                        date: fetched?.date,
                        dataAttr: `data-mat-price="${escapeHtml(mat.key)}"`,
                        fieldClass: 'market-price-field'
                    })}
                </span>
            </li>
        </ul>
    `;
}

function renderTierMats() {
    return `
        <ul class="material-price-list material-price-list--tiers">
            ${TIERS.map((tier) => {
                const plank = mats().find((mat) => mat.key === `plank-${tier}`);
                const bar = mats().find((mat) => mat.key === `bar-${tier}`);
                const plankFetched = fetchedMatQuote(plank.key);
                const barFetched = fetchedMatQuote(bar.key);
                return `
                    <li class="material-price-card">
                        <span class="material-price-card-text">
                            <span class="material-price-card-label">T${tier}</span>
                            <span class="material-price-row" data-mat-card="${escapeHtml(plank.key)}">
                                ${priceFieldHtml({
                                    id: `matPrice-${plank.key}`,
                                    label: 'Plank',
                                    value: priceInputValue(state.manualMats[plank.key], plankFetched?.price),
                                    manual: isManualPrice(state.manualMats[plank.key]),
                                    missing: !plankFetched,
                                    date: plankFetched?.date,
                                    dataAttr: `data-mat-price="${escapeHtml(plank.key)}"`,
                                    fieldClass: 'market-price-field',
                                    iconId: plank.uniqueName
                                })}
                            </span>
                            <span class="material-price-row" data-mat-card="${escapeHtml(bar.key)}">
                                ${priceFieldHtml({
                                    id: `matPrice-${bar.key}`,
                                    label: 'Bar',
                                    value: priceInputValue(state.manualMats[bar.key], barFetched?.price),
                                    manual: isManualPrice(state.manualMats[bar.key]),
                                    missing: !barFetched,
                                    date: barFetched?.date,
                                    dataAttr: `data-mat-price="${escapeHtml(bar.key)}"`,
                                    fieldClass: 'market-price-field',
                                    iconId: bar.uniqueName
                                })}
                            </span>
                        </span>
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

function renderAvaExplain(key, { hovered } = {}) {
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
    const plank = matQuote(`plank-${row.item.tier}`);
    const bar = matQuote(`bar-${row.item.tier}`);
    const energy = matQuote('energy');
    const plankTotal = plank ? plank.price * row.item.recipe.plank : null;
    const barTotal = bar ? bar.price * row.item.recipe.bar : null;
    const energyTotal = energy ? energy.price * row.item.recipe.energy : null;
    const refined = row.parts?.refined ?? null;
    const afterRr = refined != null ? refined * keep : null;
    const withToken = afterRr != null && energyTotal != null ? afterRr + energyTotal : null;
    const toolIcon = itemIconHtml(row.item.uniqueName, { className: 'item-icon calc-explain-icon' });
    const plankIcon = itemIconHtml(mats().find((mat) => mat.key === `plank-${row.item.tier}`)?.uniqueName, { className: 'item-icon calc-explain-icon' });
    const barIcon = itemIconHtml(mats().find((mat) => mat.key === `bar-${row.item.tier}`)?.uniqueName, { className: 'item-icon calc-explain-icon' });
    const energyIcon = itemIconHtml(ENERGY_ID, { className: 'item-icon calc-explain-icon' });
    const chips = [{ label: 'şehir', value: cityProduction(), tone: 'city', title: 'Üretim şehri taban bonusu' }];
    if (state.bonusRate) {
        chips.push({ label: 'bonus', value: state.bonusRate, tone: 'bonus', title: 'Günlük gathering tool bonusu' });
    }

    const matLines = [
        explainStep({
            icon: plankIcon,
            label: `T${row.item.tier} Plank`,
            copyName: itemLabel(mats().find(mat => mat.key === `plank-${row.item.tier}`)?.uniqueName),
            note: 'Tarifteki plank adedi × birim alış',
            formula: [
                explainNum(row.item.recipe.plank, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(plank?.price, { tone: 'price', cap: 'birim fiyat' })
            ],
            result: plankTotal,
            resultKind: 'cost',
            resultCap: 'plank tutarı'
        }),
        explainStep({
            icon: barIcon,
            label: `T${row.item.tier} Bar`,
            copyName: itemLabel(mats().find(mat => mat.key === `bar-${row.item.tier}`)?.uniqueName),
            note: 'Tarifteki bar adedi × birim alış',
            formula: [
                explainNum(row.item.recipe.bar, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(bar?.price, { tone: 'price', cap: 'birim fiyat' })
            ],
            result: barTotal,
            resultKind: 'cost',
            resultCap: 'bar tutarı'
        }),
        explainStep({
            label: 'İşlenmiş toplam',
            note: 'Plank + bar; enerji hariç (enerji iade almaz)',
            formula: [
                explainNum(plankTotal, { tone: 'cost', cap: 'plank' }),
                explainOp('+'),
                explainNum(barTotal, { tone: 'cost', cap: 'bar' })
            ],
            result: refined,
            resultKind: 'cost',
            resultCap: 'işlenmiş'
        }),
        explainStep({
            label: 'İade sonrası',
            note: `İşlenmiş malzemenin ${formatPct(rr)}’si geri döner; ödediğin pay ${formatPct(keep)}`,
            formula: [
                explainNum(refined, { tone: 'cost', cap: 'işlenmiş' }),
                explainOp('×'),
                explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen pay' })
            ],
            result: afterRr,
            resultKind: 'cost',
            resultCap: 'ödenen'
        }),
        explainStep({
            icon: energyIcon,
            label: 'Avalonian Energy',
            copyName: itemLabel(ENERGY_ID, 'Avalonian Energy'),
            note: 'Enerji token’ı return rate almaz',
            formula: [
                explainNum(row.item.recipe.energy, { kind: 'qty', cap: 'adet' }),
                explainOp('×'),
                explainNum(energy?.price, { tone: 'price', cap: 'birim fiyat' })
            ],
            result: energyTotal,
            resultKind: 'cost',
            resultCap: 'enerji'
        }),
        explainStep({
            label: 'Ara toplam',
            note: 'İade sonrası işlenmiş + enerji',
            formula: [
                explainNum(afterRr, { tone: 'cost', cap: 'ödenen' }),
                explainOp('+'),
                explainNum(energyTotal, { tone: 'cost', cap: 'enerji' })
            ],
            result: withToken,
            resultKind: 'cost',
            resultCap: 'ara toplam'
        }),
        matSetup
            ? explainStep({
                label: 'Alış komisyonu',
                note: 'Buy emri koyunca %2,5 setup fee',
                formula: [
                    explainNum(withToken, { tone: 'cost', cap: 'ara toplam' }),
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
            })
    ];

    return explainPanelHtml({
        icon: toolIcon,
        title: `T${row.item.tier} ${row.item.label}`,
        copyName: row.item.label,
        hint: explainHint(hovered),
        flow: explainFlow([
            { icon: toolIcon, label: 'Maliyet', value: row.cost, tone: 'cost' },
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
                        note: 'bonus / (100 + bonus) — yalnız plank ve bar; enerji hariç',
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
                    icon: toolIcon
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
        root: container,
        key: 'avaExplain',
        table: container.querySelector('[data-market-table]'),
        rowKey: (tr) => tr.dataset.itemId,
        keys: () => rows().map((row) => row.item.id),
        render: (key, meta) => renderAvaExplain(key, meta)
    });
}

function renderTable() {
    const body = rows().map((row) => {
        const bonusMark = state.bonusRate
            ? `<span class="market-bonus">+${state.bonusRate}%</span>`
            : '';
        const fetched = fetchedItemQuote(row.item.id);
        const sellValue = priceInputValue(state.manualItems[row.item.id], fetched?.price);
        return `
            <tr data-item-id="${escapeHtml(row.item.id)}">
                <td>
                    <span class="market-item">
                        ${itemIconHtml(row.item.uniqueName)}
                        <span>
                            <span class="market-item-name">T${row.item.tier} ${itemNameHtml(row.item.label)}${bonusMark}</span>
                            <span class="market-item-meta">RR ${formatPct(row.rr)}</span>
                        </span>
                    </span>
                </td>
                <td class="recipe-list">${recipeChips(row.item)}</td>
                <td class="num market-number${incompleteClass(row.cost)}" data-sort-value="${row.cost ?? ''}">${formatSilver(row.cost)}</td>
                <td class="num market-number market-price-cell" data-sort-value="${row.quote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `itemPrice-${row.item.id}`,
                        label: 'Satış',
                        value: sellValue,
                        manual: isManualPrice(state.manualItems[row.item.id]),
                        missing: !fetched,
                        date: fetched?.date,
                        dataAttr: `data-item-price="${escapeHtml(row.item.id)}"`,
                        fieldClass: 'market-price-field',
                        iconId: row.item.uniqueName
                    })}
                </td>
                <td class="num market-number${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}">${formatSilver(row.sell)}</td>
                <td class="num market-number${profitClass(row.profit)}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}">${formatSilver(row.profit, { unsigned: true })}</td>
                <td class="num market-number${profitClass(row.profit)}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}">${formatPct(row.pct, { unsigned: true })}</td>
            </tr>
        `;
    }).join('');

    const sort = state.sort;

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="market-table table table-striped market-table--highlight-best calc-table" data-market-table>
                <thead>
                    <tr>
                        ${sortHeaderHtml('Alet', { key: 'item', type: 'text', direction: sort.key === 'item' ? sort.direction : null, title: 'Üretilen Avalonian alet' })}
                        ${sortHeaderHtml('Tarif', { key: 'recipe', type: 'text', direction: sort.key === 'recipe' ? sort.direction : null, title: 'Craft için gereken malzemeler' })}
                        ${sortHeaderHtml('Maliyet', { key: 'cost', type: 'number', className: 'num market-number', direction: sort.key === 'cost' ? sort.direction : null, title: 'Malzeme iadesi sonrası maliyet' })}
                        ${sortHeaderHtml('Fiyat', { key: 'price', type: 'number', className: 'num market-number', direction: sort.key === 'price' ? sort.direction : null, title: 'Piyasa satış fiyatı' })}
                        ${sortHeaderHtml('Net', { key: 'sell', type: 'number', className: 'num market-number', direction: sort.key === 'sell' ? sort.direction : null, title: 'Vergi sonrası net satış' })}
                        ${sortHeaderHtml('Kâr', { key: 'profit', type: 'number', className: 'num market-number', direction: sort.key === 'profit' ? sort.direction : null, title: 'Net satış eksi maliyet' })}
                        ${sortHeaderHtml('%', { key: 'pct', type: 'number', className: 'num market-number', direction: sort.key === 'pct' ? sort.direction : null, title: 'Kârın maliyete oranı' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="avaResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="avaResult"></div>';
    }

    const matSetup = placesOrder('buy', state.matSide);
    const itemSetup = placesOrder('sell', state.itemSide);
    const matNote = `${priceSideHint(state.matSide, 'buy')}${matSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const itemNote = `${priceSideHint(state.itemSide, 'sell')}${itemSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''} · vergi ${formatPct(salesTax())}`;

    return `
        <div id="avaResult">
            ${renderEnergyCard()}
            ${renderTierMats()}
            ${renderTable()}
            <section data-page-info>
            ${renderBonusNote()}
            <p class="tool-result-note">Malzeme şehir ortalaması · ${escapeHtml(matNote)}. Satış ${escapeHtml(cityLabel(state.city))} · ${escapeHtml(itemNote)}. Elle yazılan alış/satış API’nin yerine geçer. Kırmızı fiyat API’de yok; mavi 6 saatten eski.</p>
            </section>
        </div>
    `;
}

function bindAvaSort(container) {
    const table = container.querySelector('[data-market-table]');
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

function patchRowCells(tr, row) {
    const costCell = tr.cells[2];
    const priceCell = tr.cells[3];
    const sellCell = tr.cells[4];
    const profitCell = tr.cells[5];
    const pctCell = tr.cells[6];

    costCell.dataset.sortValue = row.cost ?? '';
    costCell.textContent = formatSilver(row.cost);
    costCell.className = `num market-number${incompleteClass(row.cost)}`;

    priceCell.dataset.sortValue = row.quote?.price ?? '';
    const itemFetched = fetchedItemQuote(row.item.id);
    applyPriceFieldState(priceCell.querySelector('[data-market-price-field]'), {
        manual: Boolean(row.quote?.manual),
        missing: !itemFetched,
        date: itemFetched?.date,
        displayValue: priceInputValue(state.manualItems[row.item.id], itemFetched?.price)
    });

    sellCell.dataset.sortValue = row.sell ?? '';
    sellCell.textContent = formatSilver(row.sell);
    sellCell.className = `num market-number${incompleteClass(row.sell)}`;

    profitCell.dataset.sortValue = row.profit ?? '';
    profitCell.textContent = formatSilver(row.profit, { unsigned: true });
    profitCell.className = `num market-number${profitClass(row.profit)}${incompleteClass(row.profit)}`;

    pctCell.dataset.sortValue = row.pct ?? '';
    pctCell.textContent = formatPct(row.pct, { unsigned: true });
    pctCell.className = `num market-number${profitClass(row.profit)}${incompleteClass(row.pct)}`;
}

function refreshCalc(container) {
    const table = container.querySelector('[data-market-table]');
    if (table) {
        for (const row of rows()) {
            const tr = table.querySelector(`tr[data-item-id="${row.item.id}"]`);
            if (tr) {
                patchRowCells(tr, row);
            }
        }
    }

    refreshCalcExplain(container);

    mats().forEach((mat) => {
        const card = container.querySelector(`[data-mat-card="${mat.key}"]`);
        if (!card) {
            return;
        }
        const field = card.querySelector('[data-market-price-field]');
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
    bindManualPriceFields(container, {
        fields: [
            {
                selector: '[data-mat-price]',
                dataKey: 'matPrice',
                values: state.manualMats,
                resolveFallbackPrice: (key) => fetchedMatQuote(key)?.price
            },
            {
                selector: '[data-item-price]',
                dataKey: 'itemPrice',
                values: state.manualItems,
                resolveFallbackPrice: (key) => fetchedItemQuote(key)?.price
            }
        ],
        onRefresh: () => refreshCalc(container)
    });
}

function refreshOutput(container) {
    const result = container.querySelector('#avaResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#avaResult'));
    bindAvaSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
    bindExplain(container);
}

function renderPage(container) {
    container.innerHTML = toolPageHtml({
        key: 'ava-craft',
        head: `<section class="page-head" data-page-head="ava-craft">
            <h1>Ava Craft</h1>
            <p>Avalonian gathering tool. Malzeme şehir ortalaması, satış seçilen şehir. RR taban + bonus; Avalonian Energy RR almaz.</p>
        </section>`,
        controls: `
                <div class="tool-form-toolbar">
                    <div class="segmented-choice" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="choice-field form-field">
                        <div class="form-field-heading"><div class="form-field-label" id="avaBonusLabel">Bonus</div></div>
                        <div class="segmented-choice" role="radiogroup" aria-labelledby="avaBonusLabel">
                            ${renderBonusToggle()}
                        </div>
                    </div>
                    <div class="choice-field form-field">
                        <div class="form-field-heading"><div class="form-field-label" id="avaMatSideLabel">Malzeme</div></div>
                        <div class="segmented-choice" role="radiogroup" aria-labelledby="avaMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="choice-field form-field">
                        <div class="form-field-heading"><div class="form-field-label" id="avaItemSideLabel">Satış</div></div>
                        <div class="segmented-choice" role="radiogroup" aria-labelledby="avaItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    ${cityFieldHtml({
                        id: 'avaCity',
                        label: 'Satış şehri',
                        selected: state.city,
                        cities: state.cities,
                        className: 'tool-form-field'
                    })}
                    ${priceRefreshActionsHtml()}
                </div>
            `,
        summary: ``,
        result: `
                ${renderOutput()}
            `,
    });

    bindPage(container);
    bindAvaSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
    bindExplain(container);
}

function bindPage(container) {
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

    bindCityField(container, 'avaCity', (value) => {
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        saveCity(value);
        renderPage(container);
    });

    bindPriceRefresh(container, {
        load: (options) => loadPrices(container, options)
    });
}

async function loadPrices(container, { showLoader = true, source } = {}) {
    await runPriceLoad({
        state,
        source,
        showLoader,
        loadingText: 'Şehir fiyatları alınıyor…',
        load: async () => {
            const locations = cityNames();
            if (locations.length === 0) {
                throw new Error('Aktif şehir yok.');
            }
            const [matRows, itemRows] = await Promise.all([
                fetchPrices(mats().map((mat) => mat.uniqueName), locations, { source }),
                fetchPrices(items().map((item) => item.uniqueName), locations, { source })
            ]);
            state.priceIndex = indexPrices([...matRows, ...itemRows]);
        },
        onFinally: () => {
            if (container.querySelector('#avaResult')) {
                refreshOutput(container);
            } else {
                renderPage(container);
            }
        }
    });
}

async function init() {
    const container = document.querySelector('[data-tool="ava-craft"]');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.matSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;

    showPageLoader();
    try {
        ensureManualMaps();
        state.cities = loadActiveCities();
        state.city = readSavedCity(state.cities);
        state.bonusRate = defaultCraftBonusRate([FAMILY_KEY]);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: [
                ...mats().map((mat) => mat.uniqueName),
                ...items().map((item) => item.uniqueName)
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
