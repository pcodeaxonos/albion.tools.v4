import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getBonusFamilyLabel } from './bonus-families.js';
import { bonusDayIso, bonusWindowLabel } from './bonus-day.js';
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
    priceFieldClass,
    priceFieldTitle,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { bindLivePrices } from './price-live.js';
import { loadCities } from './cities.js';

const CITY_PRODUCTION = 18;
const FAMILY_KEY = 'gathering/tool';
const CITY_STORAGE_KEY = 'albiontools.v4.avaCraft.city';
const ENERGY_ID = 'QUESTITEM_TOKEN_AVALON';
const TIERS = [4, 5, 6, 7, 8];
const PLANK_QTY = 6;
const BAR_QTY = 2;
const ENERGY_BY_TIER = { 4: 20, 5: 90, 6: 160, 7: 230, 8: 300 };

const TOOL_TYPES = [
    { key: 'pickaxe', stem: '2H_TOOL_PICK_AVALON', label: 'Pickaxe' },
    { key: 'hammer', stem: '2H_TOOL_HAMMER_AVALON', label: 'Stone Hammer' },
    { key: 'axe', stem: '2H_TOOL_AXE_AVALON', label: 'Axe' },
    { key: 'sickle', stem: '2H_TOOL_SICKLE_AVALON', label: 'Sickle' },
    { key: 'knife', stem: '2H_TOOL_KNIFE_AVALON', label: 'Skinning Knife' },
    { key: 'rod', stem: '2H_TOOL_FISHINGROD_AVALON', label: 'Fishing Rod' }
];

function plankId(tier) {
    return `T${tier}_PLANKS`;
}

function barId(tier) {
    return `T${tier}_METALBAR`;
}

function toolId(stem, tier) {
    return `T${tier}_${stem}`;
}

const MATS = [
    { key: 'energy', uniqueName: ENERGY_ID, short: 'Energy', rr: false },
    ...TIERS.flatMap((tier) => [
        { key: `plank-${tier}`, uniqueName: plankId(tier), short: `T${tier} Plank`, rr: true, tier, kind: 'plank' },
        { key: `bar-${tier}`, uniqueName: barId(tier), short: `T${tier} Bar`, rr: true, tier, kind: 'bar' }
    ])
];

const ITEMS = TOOL_TYPES.flatMap((tool) => TIERS.map((tier) => ({
    id: `${tool.key}-${tier}`,
    uniqueName: toolId(tool.stem, tier),
    label: tool.label,
    tier,
    familyKey: FAMILY_KEY,
    recipe: {
        plank: PLANK_QTY,
        bar: BAR_QTY,
        energy: ENERGY_BY_TIER[tier]
    }
})));

const state = {
    premium: true,
    matSide: 'buy',
    itemSide: 'sell',
    city: 'Bridgewatch',
    cities: [],
    priceIndex: null,
    manualMats: Object.fromEntries(MATS.map((mat) => [mat.key, null])),
    manualItems: Object.fromEntries(ITEMS.map((item) => [item.id, null])),
    bonusRate: 0,
    error: null,
    loaded: false,
    sort: { key: 'pct', direction: 'desc' }
};

function formatSilver(value, { unsigned = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(value) : value;
    return Math.round(amount).toLocaleString('tr-TR');
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

function readSavedCity(cities) {
    try {
        const saved = localStorage.getItem(CITY_STORAGE_KEY);
        if (cities.some((city) => city.marketApiName === saved)) {
            return saved;
        }
    } catch {
        /* ignore */
    }
    return cities[0]?.marketApiName ?? 'Bridgewatch';
}

function saveCity(apiName) {
    try {
        localStorage.setItem(CITY_STORAGE_KEY, apiName);
    } catch {
        /* ignore */
    }
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
        side: state.matSide,
        intent: 'buy',
        tick: 0,
        setup: placesOrder('buy', state.matSide),
        count: quotes.length,
        average: true
    };
}

function fetchedMatQuote(key) {
    const mat = MATS.find((row) => row.key === key);
    if (!mat) {
        return null;
    }
    return averageQuote(mat.uniqueName);
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

function priceFieldHtml({ id, label, value, manual, missing, dataAttr }) {
    const filled = String(value ?? '').length > 0 ? ' is-filled' : '';
    const title = priceFieldTitle({ manual, missing });
    return `
        <div class="form-floating ava-price-field${priceFieldClass({ manual, missing })}"${title ? ` title="${escapeHtml(title)}"` : ''}>
            <input type="text" class="form-control${filled}" id="${escapeHtml(id)}"
                ${dataAttr} value="${escapeHtml(value)}" placeholder=" "
                inputmode="decimal" autocomplete="off" spellcheck="false">
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
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

    return ITEMS.map((item) => {
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
    const plank = plankId(item.tier);
    const bar = barId(item.tier);
    return `
        <span class="ava-chip">
            ${itemIconHtml(plank, { className: 'item-icon ava-chip-icon' })}
            <span>${item.recipe.plank}</span>
        </span>
        <span class="ava-chip">
            ${itemIconHtml(bar, { className: 'item-icon ava-chip-icon' })}
            <span>${item.recipe.bar}</span>
        </span>
        <span class="ava-chip">
            ${itemIconHtml(ENERGY_ID, { className: 'item-icon ava-chip-icon' })}
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

    return `<p class="ava-note">RR ${formatPct(returnRate())}${extra}. Enerji RR almaz.
        Bugün (${escapeHtml(bonusWindowLabel(bonusDayIso()))}): ${today}
        <a href="daily-bonus.html">Günlük bonus</a></p>`;
}

function matMetaText(mat) {
    const hint = priceSideHint(state.matSide, 'buy');
    const used = matQuote(mat.key);
    if (used?.manual) {
        return `elle · ${hint}`;
    }
    const fetched = fetchedMatQuote(mat.key);
    const count = fetched?.count ?? 0;
    const total = cityNames().length;
    const source = fetched?.date ? formatDateTime(fetched.date) : '';
    return `${count}/${total} şehir ortalama · ${hint}${source ? ` · ${source}` : ''}`;
}

function renderEnergyCard() {
    const mat = MATS[0];
    const fetched = fetchedMatQuote(mat.key);
    const value = priceInputValue(state.manualMats[mat.key], fetched?.price);
    return `
        <ul class="ava-mats ava-mats--energy">
            <li class="ava-mat" data-mat-card="${escapeHtml(mat.key)}">
                ${itemIconHtml(mat.uniqueName)}
                <span class="ava-mat-text">
                    <span class="ava-mat-label">${escapeHtml(itemLabel(mat.uniqueName, 'Avalonian Energy'))}</span>
                    <span class="ava-mat-meta">${escapeHtml(matMetaText(mat))} · RR yok</span>
                    ${priceFieldHtml({
                        id: 'matPrice-energy',
                        label: 'Alış',
                        value,
                        manual: isManualPrice(state.manualMats[mat.key]),
                        missing: !fetched,
                        dataAttr: `data-mat-price="${escapeHtml(mat.key)}"`
                    })}
                </span>
            </li>
        </ul>
    `;
}

function renderTierMats() {
    return `
        <ul class="ava-mats ava-mats--tiers">
            ${TIERS.map((tier) => {
                const plank = MATS.find((mat) => mat.key === `plank-${tier}`);
                const bar = MATS.find((mat) => mat.key === `bar-${tier}`);
                const plankFetched = fetchedMatQuote(plank.key);
                const barFetched = fetchedMatQuote(bar.key);
                return `
                    <li class="ava-mat ava-mat--tier">
                        <span class="ava-mat-text">
                            <span class="ava-mat-label">T${tier}</span>
                            <span class="ava-mat-meta">${escapeHtml(priceSideHint(state.matSide, 'buy'))}</span>
                            <span class="ava-tier-row" data-mat-card="${escapeHtml(plank.key)}">
                                ${itemIconHtml(plank.uniqueName)}
                                ${priceFieldHtml({
                                    id: `matPrice-${plank.key}`,
                                    label: 'Plank',
                                    value: priceInputValue(state.manualMats[plank.key], plankFetched?.price),
                                    manual: isManualPrice(state.manualMats[plank.key]),
                                    missing: !plankFetched,
                                    dataAttr: `data-mat-price="${escapeHtml(plank.key)}"`
                                })}
                            </span>
                            <span class="ava-tier-row" data-mat-card="${escapeHtml(bar.key)}">
                                ${itemIconHtml(bar.uniqueName)}
                                ${priceFieldHtml({
                                    id: `matPrice-${bar.key}`,
                                    label: 'Bar',
                                    value: priceInputValue(state.manualMats[bar.key], barFetched?.price),
                                    manual: isManualPrice(state.manualMats[bar.key]),
                                    missing: !barFetched,
                                    dataAttr: `data-mat-price="${escapeHtml(bar.key)}"`
                                })}
                            </span>
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

function renderTable() {
    const body = rows().map((row) => {
        const bonusMark = state.bonusRate
            ? `<span class="ava-bonus">+${state.bonusRate}%</span>`
            : '';
        const fetched = fetchedItemQuote(row.item.id);
        const sellValue = priceInputValue(state.manualItems[row.item.id], fetched?.price);
        return `
            <tr data-item-id="${escapeHtml(row.item.id)}">
                <td>
                    <span class="ava-item">
                        ${itemIconHtml(row.item.uniqueName)}
                        <span>
                            <span class="ava-item-name">T${row.item.tier} ${escapeHtml(row.item.label)}${bonusMark}</span>
                            <span class="ava-item-meta">RR ${formatPct(row.rr)}</span>
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
                        dataAttr: `data-item-price="${escapeHtml(row.item.id)}"`
                    })}
                </td>
                <td class="num ava-num${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}">${formatSilver(row.sell)}</td>
                <td class="num ava-num${profitClass(row.profit)}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}">${formatSilver(row.profit, { unsigned: true })}</td>
                <td class="num ava-num${profitClass(row.profit)}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}">${formatPct(row.pct, { unsigned: true })}</td>
            </tr>
        `;
    }).join('');

    const sort = state.sort;

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped ava-table calc-table">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Alet', { key: 'item', type: 'text', direction: sort.key === 'item' ? sort.direction : null, title: 'Üretilen Avalonian alet' })}
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
            ${renderBonusNote()}
            <p class="ava-note">Malzeme şehir ortalaması · ${escapeHtml(matNote)}. Satış ${escapeHtml(cityLabel(state.city))} · ${escapeHtml(itemNote)}. Elle yazılan alış/satış API’nin yerine geçer. Kırmızı fiyat API’de yok; hesap da kırmızı kalır.</p>
        </div>
    `;
}

function bindAvaSort(container) {
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

function patchRowCells(tr, row) {
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
        displayValue: priceInputValue(state.manualItems[row.item.id], itemFetched?.price)
    });

    sellCell.dataset.sortValue = row.sell ?? '';
    sellCell.textContent = formatSilver(row.sell);
    sellCell.className = `num ava-num${incompleteClass(row.sell)}`;

    profitCell.dataset.sortValue = row.profit ?? '';
    profitCell.textContent = formatSilver(row.profit, { unsigned: true });
    profitCell.className = `num ava-num${profitClass(row.profit)}${incompleteClass(row.profit)}`;

    pctCell.dataset.sortValue = row.pct ?? '';
    pctCell.textContent = formatPct(row.pct, { unsigned: true });
    pctCell.className = `num ava-num${profitClass(row.profit)}${incompleteClass(row.pct)}`;
}

function refreshCalc(container) {
    const table = container.querySelector('.ava-table');
    if (table) {
        for (const row of rows()) {
            const tr = table.querySelector(`tr[data-item-id="${row.item.id}"]`);
            if (tr) {
                patchRowCells(tr, row);
            }
        }
    }

    MATS.forEach((mat) => {
        const card = container.querySelector(`[data-mat-card="${mat.key}"]`);
        if (!card) {
            return;
        }
        const meta = card.querySelector('.ava-mat-meta');
        if (meta && mat.key === 'energy') {
            meta.textContent = `${matMetaText(mat)} · RR yok`;
        }
        const field = card.querySelector('.ava-price-field');
        if (field) {
            const fetched = fetchedMatQuote(mat.key);
            applyPriceFieldState(field, {
                manual: isManualPrice(state.manualMats[mat.key]),
                missing: !fetched,
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
}

function renderPage(container) {
    container.innerHTML = `
        <section class="ava-hero">
            <h1>Ava Craft</h1>
            <p>Avalonian gathering tool. Malzeme şehir ortalaması, satış seçilen şehir. RR taban + bonus; Avalonian Energy RR almaz.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="ava-toolbar">
                    <div class="ava-type" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="avaBonusLabel">Bonus</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="avaBonusLabel">
                            ${renderBonusToggle()}
                        </div>
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="avaMatSideLabel">Malzeme</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="avaMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="avaItemSideLabel">Satış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="avaItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    <div class="form-floating ava-city-field">
                        <select class="form-select is-filled" id="avaCity">
                            ${renderCityOptions()}
                        </select>
                        <label for="avaCity">Satış şehri</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'avaRefresh', apiId: 'avaRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindAvaSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
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

    container.querySelector('#avaCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        saveCity(value);
        renderPage(container);
    });

    bindPriceRefresh(container, {
        refreshId: 'avaRefresh',
        apiId: 'avaRefreshApi',
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
        const [matRows, itemRows] = await Promise.all([
            fetchPrices(MATS.map((mat) => mat.uniqueName), locations, { source }),
            fetchPrices(ITEMS.map((item) => item.uniqueName), locations, { source })
        ]);
        state.priceIndex = indexPrices([...matRows, ...itemRows]);
        state.loaded = true;
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (container.querySelector('#avaResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('avaTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.matSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;

    showPageLoader('Ava craft yükleniyor…');
    try {
        await initStore();
        state.cities = loadCities().filter((city) => city.isActive);
        state.city = readSavedCity(state.cities);
        state.bonusRate = defaultCraftBonusRate([FAMILY_KEY]);
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
