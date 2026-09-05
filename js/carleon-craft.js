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

const CITY_PRODUCTION = 18;

const MATS = [
    { key: 'plank', uniqueName: 'T2_PLANKS', short: 'Plank' },
    { key: 'bar', uniqueName: 'T2_METALBAR', short: 'Bar' },
    { key: 'leather', uniqueName: 'T2_LEATHER', short: 'Leather' },
    { key: 'cloth', uniqueName: 'T2_CLOTH', short: 'Cloth' }
];

const ITEMS = [
    { id: 'soldier-armor', uniqueName: 'T2_ARMOR_PLATE_SET1', label: 'Soldier Armor', familyKey: 'armors/plate_armor', recipe: { bar: 16 } },
    { id: 'merc-jacket', uniqueName: 'T2_ARMOR_LEATHER_SET1', label: 'Mercenary Jacket', familyKey: 'armors/leather_armor', recipe: { leather: 16 } },
    { id: 'merc-shoes', uniqueName: 'T2_SHOES_LEATHER_SET1', label: 'Mercenary Shoes', familyKey: 'shoes/leather_shoes', recipe: { leather: 8 } },
    { id: 'scholar-sandals', uniqueName: 'T2_SHOES_CLOTH_SET1', label: 'Scholar Sandals', familyKey: 'shoes/cloth_shoes', recipe: { cloth: 8 } },
    { id: 'soldier-boots', uniqueName: 'T2_SHOES_PLATE_SET1', label: 'Soldier Boots', familyKey: 'shoes/plate_shoes', recipe: { bar: 8 } },
    { id: 'soldier-helmet', uniqueName: 'T2_HEAD_PLATE_SET1', label: 'Soldier Helmet', familyKey: 'head/plate_helmet', recipe: { bar: 8 } },
    { id: 'scholar-cowl', uniqueName: 'T2_HEAD_CLOTH_SET1', label: 'Scholar Cowl', familyKey: 'head/cloth_helmet', recipe: { cloth: 8 } },
    { id: 'shield', uniqueName: 'T2_OFF_SHIELD', label: 'Shield', familyKey: 'category/offhands', recipe: { plank: 4, bar: 4 } },
    { id: 'scholar-robe', uniqueName: 'T2_ARMOR_CLOTH_SET1', label: 'Scholar Robe', familyKey: 'armors/cloth_armor', recipe: { cloth: 16 } },
    { id: 'fire-staff', uniqueName: 'T2_MAIN_FIRESTAFF', label: 'Fire Staff', familyKey: 'weapons/firestaff', recipe: { plank: 16, bar: 8 } },
    { id: 'tome', uniqueName: 'T2_OFF_BOOK', label: 'Tome of Spells', familyKey: 'category/offhands', recipe: { leather: 4, cloth: 4 } },
    { id: 'sword', uniqueName: 'T2_MAIN_SWORD', label: 'Broadsword', familyKey: 'weapons/sword', recipe: { bar: 16, leather: 8 } },
    { id: 'bow', uniqueName: 'T2_2H_BOW', label: 'Bow', familyKey: 'weapons/bow', recipe: { plank: 32 } },
    { id: 'merc-hood', uniqueName: 'T2_HEAD_LEATHER_SET1', label: 'Mercenary Hood', familyKey: 'head/leather_helmet', recipe: { leather: 8 } }
];

const state = {
    premium: true,
    matSide: 'buy',
    itemSide: 'sell',
    matRows: Object.fromEntries(MATS.map((mat) => [mat.key, null])),
    itemRows: Object.fromEntries(ITEMS.map((item) => [item.id, null])),
    manualMats: Object.fromEntries(MATS.map((mat) => [mat.key, null])),
    manualItems: Object.fromEntries(ITEMS.map((item) => [item.id, null])),
    bonusRate: 0,
    error: null,
    loaded: false,
    sort: { key: 'pct', direction: 'desc' }
};

function productionBonus() {
    return CITY_PRODUCTION + state.bonusRate;
}

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

function fetchedMatQuote(key) {
    return quoteFromRow(state.matRows[key], state.matSide, 'buy');
}

function fetchedItemQuote(id) {
    return quoteFromRow(state.itemRows[id], state.itemSide, 'sell');
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
        <div class="form-floating carleon-price-field${priceFieldClass({ manual, missing })}"${title ? ` title="${escapeHtml(title)}"` : ''}>
            <input type="text" class="form-control${filled}" id="${escapeHtml(id)}"
                ${dataAttr} value="${escapeHtml(value)}" placeholder=" "
                inputmode="decimal" autocomplete="off" spellcheck="false">
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

function matCost(recipe) {
    let total = 0;
    for (const mat of MATS) {
        const qty = recipe[mat.key] ?? 0;
        if (!qty) {
            continue;
        }
        const quote = matQuote(mat.key);
        if (!quote) {
            return null;
        }
        total += quote.price * qty;
    }
    return total;
}

function rows() {
    return ITEMS.map((item) => {
        const quote = itemQuote(item.id);
        const raw = matCost(item.recipe);
        const rr = returnRate();
        const cost = raw == null
            ? null
            : purchaseCost(raw * (1 - rr), { setup: placesOrder('buy', state.matSide) });
        const sell = quote
            ? saleProceeds(quote.price, { premium: state.premium, setup: quote.setup })
            : null;
        const profit = cost != null && sell != null ? sell - cost : null;
        const pct = profit != null && cost > 0 ? profit / cost : null;

        return { item, quote, raw, rr, cost, sell, profit, pct };
    });
}

function recipeChips(recipe) {
    return MATS
        .filter((mat) => recipe[mat.key])
        .map((mat) => `
            <span class="carleon-chip">
                ${itemIconHtml(mat.uniqueName, { className: 'item-icon carleon-chip-icon' })}
                <span>${recipe[mat.key]} ${escapeHtml(mat.short)}</span>
            </span>
        `)
        .join('');
}

function renderPremiumToggle() {
    const options = [
        { id: true, label: 'Premium' },
        { id: false, label: 'Premium yok' }
    ];

    return options.map((option) => {
        const pressed = option.id === state.premium;
        return `
            <button type="button" class="carleon-type-btn${pressed ? ' is-active' : ''}"
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

    return `<p class="carleon-note">RR ${formatPct(returnRate())}${extra}.
        Bugün (${escapeHtml(bonusWindowLabel(bonusDayIso()))}): ${today}
        <a href="daily-bonus.html">Günlük bonus</a></p>`;
}

function matMetaText(mat) {
    const hint = priceSideHint(state.matSide, 'buy');
    const used = matQuote(mat.key);
    const fetched = fetchedMatQuote(mat.key);
    const source = used?.manual
        ? 'elle'
        : (fetched?.date ? formatDateTime(fetched.date) : '');
    return `Caerleon ${hint}${source ? ` · ${source}` : ''}`;
}

function renderMatStrip() {
    return `
        <ul class="carleon-mats">
            ${MATS.map((mat) => {
                const fetched = fetchedMatQuote(mat.key);
                const value = priceInputValue(state.manualMats[mat.key], fetched?.price);
                return `
                    <li class="carleon-mat" data-mat-card="${escapeHtml(mat.key)}">
                        ${itemIconHtml(mat.uniqueName)}
                        <span class="carleon-mat-text">
                            <span class="carleon-mat-label">${escapeHtml(itemLabel(mat.uniqueName, mat.short))}</span>
                            <span class="carleon-mat-meta">${escapeHtml(matMetaText(mat))}</span>
                            ${priceFieldHtml({
                                id: `matPrice-${mat.key}`,
                                label: 'Alış',
                                value,
                                manual: isManualPrice(state.manualMats[mat.key]),
                                missing: !fetched,
                                dataAttr: `data-mat-price="${escapeHtml(mat.key)}"`
                            })}
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
            ? `<span class="carleon-bonus">+${state.bonusRate}%</span>`
            : '';
        const fetched = fetchedItemQuote(row.item.id);
        const sellValue = priceInputValue(state.manualItems[row.item.id], fetched?.price);
        return `
            <tr data-item-id="${escapeHtml(row.item.id)}">
                <td>
                    <span class="carleon-item">
                        ${itemIconHtml(row.item.uniqueName)}
                        <span>
                            <span class="carleon-item-name">${escapeHtml(row.item.label)}${bonusMark}</span>
                            <span class="carleon-item-meta">RR ${formatPct(row.rr)}</span>
                        </span>
                    </span>
                </td>
                <td class="carleon-recipe">${recipeChips(row.item.recipe)}</td>
                <td class="num carleon-num${incompleteClass(row.cost)}" data-sort-value="${row.cost ?? ''}">${formatSilver(row.cost)}</td>
                <td class="num carleon-num carleon-price-cell" data-sort-value="${row.quote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `itemPrice-${row.item.id}`,
                        label: 'Satış',
                        value: sellValue,
                        manual: isManualPrice(state.manualItems[row.item.id]),
                        missing: !fetched,
                        dataAttr: `data-item-price="${escapeHtml(row.item.id)}"`
                    })}
                </td>
                <td class="num carleon-num${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}">${formatSilver(row.sell)}</td>
                <td class="num carleon-num${profitClass(row.profit)}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}">${formatSilver(row.profit, { unsigned: true })}</td>
                <td class="num carleon-num${profitClass(row.profit)}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}">${formatPct(row.pct, { unsigned: true })}</td>
            </tr>
        `;
    }).join('');

    const sort = state.sort;

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped carleon-table calc-table">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Eşya', { key: 'item', type: 'text', direction: sort.key === 'item' ? sort.direction : null, title: 'Üretilen Caerleon eşyası' })}
                        ${sortHeaderHtml('Tarif', { key: 'recipe', type: 'text', direction: sort.key === 'recipe' ? sort.direction : null, title: 'Craft için gereken malzemeler' })}
                        ${sortHeaderHtml('Maliyet', { key: 'cost', type: 'number', className: 'num carleon-num', direction: sort.key === 'cost' ? sort.direction : null, title: 'RR düşülmüş malzeme maliyeti' })}
                        ${sortHeaderHtml('BM', { key: 'bm', type: 'number', className: 'num carleon-num', direction: sort.key === 'bm' ? sort.direction : null, title: 'Black Market satış fiyatı' })}
                        ${sortHeaderHtml('Satış', { key: 'sell', type: 'number', className: 'num carleon-num', direction: sort.key === 'sell' ? sort.direction : null, title: 'Vergi sonrası net satış' })}
                        ${sortHeaderHtml('Kâr', { key: 'profit', type: 'number', className: 'num carleon-num', direction: sort.key === 'profit' ? sort.direction : null, title: 'Net satış eksi maliyet' })}
                        ${sortHeaderHtml('%', { key: 'pct', type: 'number', className: 'num carleon-num', direction: sort.key === 'pct' ? sort.direction : null, title: 'Kârın maliyete oranı' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="carleonResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="carleonResult"></div>';
    }

    const matSetup = placesOrder('buy', state.matSide);
    const itemSetup = placesOrder('sell', state.itemSide);
    const matNote = `${priceSideHint(state.matSide, 'buy')}${matSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const itemNote = `${priceSideHint(state.itemSide, 'sell')}${itemSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''} · vergi ${formatPct(salesTax())}`;

    return `
        <div id="carleonResult">
            ${renderBonusNote()}
            ${renderMatStrip()}
            <p class="carleon-note">Malzeme ${escapeHtml(matNote)} · satış ${escapeHtml(itemNote)}. Elle yazılan alış/satış API’nin yerine geçer; kırmızı fiyat API’de yok, hesap da kırmızı kalır.</p>
            ${renderTable()}
        </div>
    `;
}

function bindCarleonSort(container) {
    const table = container.querySelector('.carleon-table');
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
    const bmCell = tr.cells[3];
    const sellCell = tr.cells[4];
    const profitCell = tr.cells[5];
    const pctCell = tr.cells[6];

    costCell.dataset.sortValue = row.cost ?? '';
    costCell.textContent = formatSilver(row.cost);
    costCell.className = `num carleon-num${incompleteClass(row.cost)}`;

    bmCell.dataset.sortValue = row.quote?.price ?? '';
    const itemFetched = fetchedItemQuote(row.item.id);
    applyPriceFieldState(bmCell.querySelector('.carleon-price-field'), {
        manual: Boolean(row.quote?.manual),
        missing: !itemFetched,
        displayValue: priceInputValue(state.manualItems[row.item.id], itemFetched?.price)
    });

    sellCell.dataset.sortValue = row.sell ?? '';
    sellCell.textContent = formatSilver(row.sell);
    sellCell.className = `num carleon-num${incompleteClass(row.sell)}`;

    profitCell.dataset.sortValue = row.profit ?? '';
    profitCell.textContent = formatSilver(row.profit, { unsigned: true });
    profitCell.className = `num carleon-num${profitClass(row.profit)}${incompleteClass(row.profit)}`;

    pctCell.dataset.sortValue = row.pct ?? '';
    pctCell.textContent = formatPct(row.pct, { unsigned: true });
    pctCell.className = `num carleon-num${profitClass(row.profit)}${incompleteClass(row.pct)}`;
}

function refreshCalc(container) {
    const table = container.querySelector('.carleon-table');
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
        const meta = card.querySelector('.carleon-mat-meta');
        if (meta) {
            meta.textContent = matMetaText(mat);
        }
        const fetched = fetchedMatQuote(mat.key);
        applyPriceFieldState(card.querySelector('.carleon-price-field'), {
            manual: isManualPrice(state.manualMats[mat.key]),
            missing: !fetched,
            displayValue: priceInputValue(state.manualMats[mat.key], fetched?.price)
        });
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
    const result = container.querySelector('#carleonResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#carleonResult'));
    bindCarleonSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function renderPage(container) {
    container.innerHTML = `
        <section class="carleon-hero">
            <h1>Caerleon Craft</h1>
            <p>T2 set1 craft. Malzeme Caerleon, satış Black Market. Alışta buy +1 / sell aynı fiyat. Satışta sell −1 / buy aynı fiyat. Emirde setup fee, satışta vergi. Alış/satış alanına yazınca o fiyat kullanılır.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="carleon-toolbar">
                    <div class="carleon-type" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="carleon-side-field">
                        <span class="carleon-side-label" id="carleonBonusLabel">Bonus</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="carleonBonusLabel">
                            ${renderBonusToggle()}
                        </div>
                    </div>
                    <div class="carleon-side-field">
                        <span class="carleon-side-label" id="carleonMatSideLabel">Malzeme</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="carleonMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="carleon-side-field">
                        <span class="carleon-side-label" id="carleonItemSideLabel">Satış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="carleonItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'carleonRefresh', apiId: 'carleonRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindCarleonSort(container);
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

    bindPriceRefresh(container, {
        refreshId: 'carleonRefresh',
        apiId: 'carleonRefreshApi',
        load: (options) => loadPrices(container, options)
    });
}

async function loadPrices(container, { showLoader = true, source } = {}) {
    applyPriceLoadMode(state, { source, showLoader });
    state.error = null;
    if (showLoader) {
        showPageLoader(priceLoaderMessage(source, 'Black Market fiyatları alınıyor…'));
    }

    try {
        const ids = [
            ...MATS.map((mat) => mat.uniqueName),
            ...ITEMS.map((item) => item.uniqueName)
        ];
        const rows = await fetchPrices(ids, undefined, { source });
        const index = indexPrices(rows);

        for (const mat of MATS) {
            state.matRows[mat.key] = cityRow(index, mat.uniqueName, 'Caerleon');
        }

        for (const item of ITEMS) {
            state.itemRows[item.id] = cityRow(index, item.uniqueName, 'Black Market');
        }

        state.loaded = true;
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (container.querySelector('#carleonResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('carleonTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.matSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;
    renderPage(container);

    showPageLoader('Caerleon craft yükleniyor…');
    try {
        await initStore();
        state.bonusRate = defaultCraftBonusRate(ITEMS.map((item) => item.familyKey));
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: [
                ...MATS.map((mat) => mat.uniqueName),
                ...ITEMS.map((item) => item.uniqueName)
            ],
            cities: ['Caerleon', 'Black Market'],
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
