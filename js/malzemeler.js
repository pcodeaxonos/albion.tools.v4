import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
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
    priceFieldHtml,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder, feeMetaText } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadActiveCities } from './cities.js';
import { bindLivePrices } from './price-live.js';

const PREFS_STORAGE_KEY = 'albiontools.v4.malzemeler.prefs';
const DEFAULT_CITY = 'Martlock';

const GROUPS = [
    { id: 'plank', label: 'Plank', family: 'Malzeme', stem: 'PLANKS', hasEnchant: true, tiers: [2, 3, 4, 5, 6, 7, 8] },
    { id: 'block', label: 'Block', family: 'Malzeme', stem: 'STONEBLOCK', hasEnchant: true, tiers: [2, 3, 4, 5, 6, 7, 8] },
    { id: 'bar', label: 'Bar', family: 'Malzeme', stem: 'METALBAR', hasEnchant: true, tiers: [2, 3, 4, 5, 6, 7, 8] },
    { id: 'leather', label: 'Leather', family: 'Malzeme', stem: 'LEATHER', hasEnchant: true, tiers: [2, 3, 4, 5, 6, 7, 8] },
    { id: 'cloth', label: 'Cloth', family: 'Malzeme', stem: 'CLOTH', hasEnchant: true, tiers: [2, 3, 4, 5, 6, 7, 8] },
    { id: 'horse', label: 'Horse', family: 'Binek', stem: 'MOUNT_HORSE', hasEnchant: false, tiers: [3, 4, 5, 6, 7, 8] },
    { id: 'ox', label: 'Ox', family: 'Binek', stem: 'MOUNT_OX', hasEnchant: false, tiers: [3, 4, 5, 6, 7, 8] },
    { id: 'armored', label: 'Armored horse', family: 'Binek', stem: 'MOUNT_ARMORED_HORSE', hasEnchant: false, tiers: [5, 6, 7, 8] },
    { id: 'mule', label: 'Mule', family: 'Binek', stem: 'MOUNT_MULE', hasEnchant: false, tiers: [2] }
];

const state = {
    premium: true,
    buySide: 'buy',
    sellSide: 'sell',
    group: 'plank',
    enchant: 0,
    buyCity: DEFAULT_CITY,
    sellCity: DEFAULT_CITY,
    cities: [],
    priceIndex: null,
    manualBuy: {},
    manualSell: {},
    error: null,
    loaded: false,
    livePaused: false,
    sort: { key: 'profit', direction: 'desc' }
};

function currentGroup() {
    return GROUPS.find((group) => group.id === state.group) ?? GROUPS[0];
}

function resourceId(stem, tier, enchant) {
    const group = currentGroup();
    const level = !group.hasEnchant || tier < 4 ? 0 : enchant;
    if (level === 0) {
        return `T${tier}_${stem}`;
    }
    return `T${tier}_${stem}_LEVEL${level}@${level}`;
}

function rowEnchant(tier, group = currentGroup()) {
    if (!group.hasEnchant || tier < 4) {
        return 0;
    }
    return state.enchant;
}

function allUniqueNames() {
    const group = currentGroup();
    const ids = [];
    for (const tier of group.tiers) {
        ids.push(resourceId(group.stem, tier, 0));
        if (group.hasEnchant && tier >= 4) {
            for (const enchant of [1, 2, 3]) {
                ids.push(resourceId(group.stem, tier, enchant));
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

function quoteBuy(uniqueName) {
    const parsed = parsePrice(state.manualBuy[uniqueName]);
    if (parsed != null) {
        return manualQuote(parsed, state.buySide, 'buy');
    }
    return fetchedQuote(uniqueName, state.buyCity, state.buySide, 'buy');
}

function quoteSell(uniqueName) {
    const parsed = parsePrice(state.manualSell[uniqueName]);
    if (parsed != null) {
        return manualQuote(parsed, state.sellSide, 'sell');
    }
    return fetchedQuote(uniqueName, state.sellCity, state.sellSide, 'sell');
}

function defaultCityName(cities) {
    const martlock = cities.find((city) => city.marketApiName === DEFAULT_CITY);
    return martlock?.marketApiName ?? cities[0]?.marketApiName ?? DEFAULT_CITY;
}

function readPrefs(cities) {
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) {
            return false;
        }
        const parsed = JSON.parse(raw);
        if (GROUPS.some((group) => group.id === parsed.group)) {
            state.group = parsed.group;
        }
        const enchant = Number(parsed.enchant);
        if ([0, 1, 2, 3].includes(enchant)) {
            state.enchant = enchant;
        }
        const pick = (value, fallback) => (
            cities.some((city) => city.marketApiName === value) ? value : fallback
        );
        const fallback = defaultCityName(cities);
        state.buyCity = pick(parsed.buyCity, fallback);
        state.sellCity = pick(parsed.sellCity, state.buyCity);
        return true;
    } catch {
        return false;
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
            group: state.group,
            enchant: state.enchant,
            buyCity: state.buyCity,
            sellCity: state.sellCity
        }));
    } catch {
        /* ignore */
    }
}

function applyCityDefaults(cities) {
    const fallback = defaultCityName(cities);
    if (!cities.some((city) => city.marketApiName === state.buyCity)) {
        state.buyCity = fallback;
    }
    if (!cities.some((city) => city.marketApiName === state.sellCity)) {
        state.sellCity = state.buyCity;
    }
}

function rows() {
    const group = currentGroup();
    return group.tiers.map((tier) => {
        const enchant = rowEnchant(tier, group);
        const itemId = resourceId(group.stem, tier, enchant);
        const buyQuote = quoteBuy(itemId);
        const sellQuote = quoteSell(itemId);
        const buyNet = buyQuote ? purchaseCost(buyQuote.price, { setup: buyQuote.setup }) : null;
        const sellNet = sellQuote
            ? saleProceeds(sellQuote.price, { premium: state.premium, setup: sellQuote.setup })
            : null;
        const buyFee = buyQuote && buyNet != null ? buyNet - buyQuote.price : null;
        const sellFee = sellQuote && sellNet != null ? sellQuote.price - sellNet : null;
        const spend = buyFee != null && sellFee != null ? buyFee + sellFee : null;
        const spread = buyQuote && sellQuote && buyQuote.price > 0
            ? (sellQuote.price - buyQuote.price) / buyQuote.price
            : null;
        const profit = buyNet != null && sellNet != null ? sellNet - buyNet : null;
        const pct = profit != null && buyNet > 0 ? profit / buyNet : null;

        return {
            id: `t${tier}`,
            tier,
            enchant,
            itemId,
            buyQuote,
            sellQuote,
            buyNet,
            sellNet,
            spend,
            spread,
            profit,
            pct
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

function renderToggleGroup(options, selected, attr) {
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

function renderGroupOptions(selected) {
    const families = [];
    for (const group of GROUPS) {
        let family = families.find((item) => item.label === group.family);
        if (!family) {
            family = { label: group.family, groups: [] };
            families.push(family);
        }
        family.groups.push(group);
    }

    return families.map((family) => `
        <optgroup label="${escapeHtml(family.label)}">
            ${family.groups.map((group) => {
                const isSelected = group.id === selected ? ' selected' : '';
                return `<option value="${escapeHtml(group.id)}"${isSelected}>${escapeHtml(group.label)}</option>`;
            }).join('')}
        </optgroup>
    `).join('');
}

function renderCityOptions(selected) {
    return state.cities.map((city) => {
        const isSelected = city.marketApiName === selected ? ' selected' : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${isSelected}>${escapeHtml(city.displayName)}</option>`;
    }).join('');
}

function renderSummary(list) {
    const best = bestRow(list);
    if (!best || best.profit == null) {
        return '<p class="farming-note" id="malzemelerSummary"><strong>Bu senaryoda kâr hesaplanamadı.</strong> Eksik fiyatları doldur.</p>';
    }
    const name = itemDisplayName(best.itemId, best.enchant);
    if (best.profit <= 0) {
        return `<p class="farming-note" id="malzemelerSummary"><strong>Bu senaryoda zarar.</strong> En az zarar ${escapeHtml(name)} · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.</p>`;
    }
    return `<p class="farming-note" id="malzemelerSummary"><strong>En kârlı ${escapeHtml(name)}</strong> · ${formatSilver(best.profit, { signed: true })} · ${formatPct(best.pct)}.</p>`;
}

function renderScenario() {
    const buyNote = `${priceSideHint(state.buySide, 'buy')}${placesOrder('buy', state.buySide) ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const sellNote = `${priceSideHint(state.sellSide, 'sell')}${placesOrder('sell', state.sellSide) ? ` · setup ${formatPct(SETUP_FEE)}` : ''} · vergi ${formatPct(salesTaxRate(state.premium))}`;
    const route = state.buyCity === state.sellCity
        ? `${cityLabel(state.buyCity)}’ta flip`
        : `${cityLabel(state.buyCity)}’tan al → ${cityLabel(state.sellCity)}’da sat`;

    return `<p class="farming-note">${escapeHtml(route)}. Alış ${escapeHtml(buyNote)}. Satış ${escapeHtml(sellNote)}. ${escapeHtml(feeMetaText(state.premium))}. Elle yazılan fiyat API’nin yerine geçer.</p>`;
}

function latestQuoteDate(list) {
    const dates = list
        .flatMap((row) => [row.buyQuote?.date, row.sellQuote?.date])
        .filter(Boolean)
        .sort();
    return dates.length > 0 ? dates[dates.length - 1] : '';
}

function renderTable(list) {
    const best = bestRow(list);
    const sort = state.sort;
    const dir = (key) => (sort.key === key ? sort.direction : null);

    const body = list.map((row) => {
        const buyFetched = fetchedQuote(row.itemId, state.buyCity, state.buySide, 'buy');
        const sellFetched = fetchedQuote(row.itemId, state.sellCity, state.sellSide, 'sell');
        const buyValue = priceInputValue(state.manualBuy[row.itemId], buyFetched?.price);
        const sellValue = priceInputValue(state.manualSell[row.itemId], sellFetched?.price);
        const bestClass = best && row.id === best.id ? ' is-best' : '';

        return `
            <tr data-item-id="${escapeHtml(row.id)}" class="${bestClass.trim()}">
                <td data-sort-value="${row.tier}">
                    <span class="farming-item">
                        ${itemIconHtml(row.itemId)}
                        <span>
                            <span class="farming-item-name">${escapeHtml(itemDisplayName(row.itemId, row.enchant))}</span>
                            <span class="farming-item-meta">T${row.tier}${row.enchant ? ` .${row.enchant}` : ''}</span>
                        </span>
                    </span>
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.buyQuote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `buyPrice-${row.id}`,
                        label: 'Alış',
                        value: buyValue,
                        manual: isManualPrice(state.manualBuy[row.itemId]),
                        missing: !buyFetched,
                        date: buyFetched?.date,
                        dataAttr: `data-buy-id="${escapeHtml(row.itemId)}"`,
                        iconId: row.itemId
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.sellQuote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `sellPrice-${row.id}`,
                        label: 'Satış',
                        value: sellValue,
                        manual: isManualPrice(state.manualSell[row.itemId]),
                        missing: !sellFetched,
                        date: sellFetched?.date,
                        dataAttr: `data-sell-id="${escapeHtml(row.itemId)}"`,
                        iconId: row.itemId
                    })}
                </td>
                <td class="num farming-num${profitClass(row.spread)}${incompleteClass(row.spread)}" data-sort-value="${row.spread ?? ''}">${formatPct(row.spread)}</td>
                <td class="num farming-num${incompleteClass(row.spend)}" data-sort-value="${row.spend ?? ''}">${formatSilver(row.spend)}</td>
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
                    <col class="farming-col-pct">
                    <col class="farming-col-num">
                    <col class="farming-col-num">
                    <col class="farming-col-pct">
                </colgroup>
                <thead>
                    <tr>
                        ${sortHeaderHtml('Eşya', { key: 'item', type: 'number', direction: dir('item'), title: 'Kademe' })}
                        ${sortHeaderHtml('Alış', { key: 'buy', type: 'number', className: 'num farming-num', direction: dir('buy'), title: 'Alış şehri fiyatı' })}
                        ${sortHeaderHtml('Satış', { key: 'sell', type: 'number', className: 'num farming-num', direction: dir('sell'), title: 'Satış şehri fiyatı' })}
                        ${sortHeaderHtml('Makas', { key: 'spread', type: 'number', className: 'num farming-num', direction: dir('spread'), title: '(satış − alış) / alış' })}
                        ${sortHeaderHtml('Harcama', { key: 'spend', type: 'number', className: 'num farming-num', direction: dir('spend'), title: 'Setup ve satış vergisi' })}
                        ${sortHeaderHtml('Net kâr', { key: 'profit', type: 'number', className: 'num farming-num', direction: dir('profit'), title: 'Net satış eksi net alış' })}
                        ${sortHeaderHtml('Net %', { key: 'pct', type: 'number', className: 'num farming-num', direction: dir('pct'), title: 'Kârın net alışa oranı' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="malzemelerResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="malzemelerResult"></div>';
    }

    const list = rows();
    const stamp = formatDateTime(latestQuoteDate(list));

    return `
        <div id="malzemelerResult">
            ${renderTable(list)}
            ${renderSummary(list)}
            ${renderScenario()}
            ${stamp ? `<p class="farming-note">${escapeHtml(stamp)}</p>` : ''}
        </div>
    `;
}

function renderPage(container) {
    const group = currentGroup();
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Şehir Makası</h1>
            <p>Bir şehirden alıp diğerinde sat: plank, bar, leather, cloth ve binek. Vergi ve setup diğer araçlarla aynı.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="farming-toolbar">
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="malzemelerGroup">
                            ${renderGroupOptions(state.group)}
                        </select>
                        <label for="malzemelerGroup">Grup</label>
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Enchant" data-enchant-wrap${group.hasEnchant ? '' : ' style="display: none"'}>
                        ${renderToggleGroup([
                            { id: 0, label: '0' },
                            { id: 1, label: '.1' },
                            { id: 2, label: '.2' },
                            { id: 3, label: '.3' }
                        ], state.enchant, 'enchant')}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Premium">
                        ${renderToggleGroup([
                            { id: '1', label: 'Premium' },
                            { id: '0', label: 'Premium yok' }
                        ], state.premium ? '1' : '0', 'premium')}
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="malzemelerBuySideLabel">Alış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="malzemelerBuySideLabel">
                            ${priceSideToggleHtml('buy', state.buySide)}
                        </div>
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="malzemelerSellSideLabel">Satış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="malzemelerSellSideLabel">
                            ${priceSideToggleHtml('sell', state.sellSide)}
                        </div>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="malzemelerBuyCity">
                            ${renderCityOptions(state.buyCity)}
                        </select>
                        <label for="malzemelerBuyCity">Alış şehri</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="malzemelerSellCity">
                            ${renderCityOptions(state.sellCity)}
                        </select>
                        <label for="malzemelerSellCity">Satış şehri</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'malzemelerRefresh', apiId: 'malzemelerRefreshApi' })}
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
}

function bindTableSort(container) {
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

    const buyCell = tr.cells[1];
    const sellCell = tr.cells[2];
    const spreadCell = tr.cells[3];
    const spendCell = tr.cells[4];
    const profitCell = tr.cells[5];
    const pctCell = tr.cells[6];

    buyCell.dataset.sortValue = row.buyQuote?.price ?? '';
    const buyFetched = fetchedQuote(row.itemId, state.buyCity, state.buySide, 'buy');
    applyPriceFieldState(buyCell.querySelector('.farming-price-field'), {
        manual: isManualPrice(state.manualBuy[row.itemId]),
        missing: !buyFetched,
        date: buyFetched?.date,
        displayValue: priceInputValue(state.manualBuy[row.itemId], buyFetched?.price)
    });

    sellCell.dataset.sortValue = row.sellQuote?.price ?? '';
    const sellFetched = fetchedQuote(row.itemId, state.sellCity, state.sellSide, 'sell');
    applyPriceFieldState(sellCell.querySelector('.farming-price-field'), {
        manual: isManualPrice(state.manualSell[row.itemId]),
        missing: !sellFetched,
        date: sellFetched?.date,
        displayValue: priceInputValue(state.manualSell[row.itemId], sellFetched?.price)
    });

    spreadCell.dataset.sortValue = row.spread ?? '';
    spreadCell.textContent = formatPct(row.spread);
    spreadCell.className = `num farming-num${profitClass(row.spread)}${incompleteClass(row.spread)}`;

    spendCell.dataset.sortValue = row.spend ?? '';
    spendCell.textContent = formatSilver(row.spend);
    spendCell.className = `num farming-num${incompleteClass(row.spend)}`;

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

    const summary = container.querySelector('#malzemelerSummary');
    if (summary) {
        const wrap = document.createElement('div');
        wrap.innerHTML = renderSummary(list);
        const next = wrap.querySelector('#malzemelerSummary');
        if (next) {
            summary.replaceWith(next);
        }
    }
}

function bindPriceInputs(container) {
    initFloatingLabels(container);

    const bindField = (input, kind) => {
        if (input.dataset.priceBound === 'on') {
            return;
        }
        input.dataset.priceBound = 'on';

        input.addEventListener('input', () => {
            const id = kind === 'buy' ? input.dataset.buyId : input.dataset.sellId;
            const parsed = parsePrice(input.value);
            if (kind === 'buy') {
                state.manualBuy[id] = parsed != null ? input.value : null;
            } else {
                state.manualSell[id] = parsed != null ? input.value : null;
            }
            input.classList.toggle('is-filled', input.value.length > 0);
            refreshCalc(container);
        });

        input.addEventListener('change', () => {
            const id = kind === 'buy' ? input.dataset.buyId : input.dataset.sellId;
            if (parsePrice(input.value) == null) {
                if (kind === 'buy') {
                    state.manualBuy[id] = null;
                    const fetched = fetchedQuote(id, state.buyCity, state.buySide, 'buy');
                    input.value = fetched ? formatSilver(fetched.price) : '';
                } else {
                    state.manualSell[id] = null;
                    const fetched = fetchedQuote(id, state.sellCity, state.sellSide, 'sell');
                    input.value = fetched ? formatSilver(fetched.price) : '';
                }
                input.classList.toggle('is-filled', input.value.length > 0);
            }
            refreshCalc(container);
        });
    };

    container.querySelectorAll('[data-buy-id]').forEach((input) => bindField(input, 'buy'));
    container.querySelectorAll('[data-sell-id]').forEach((input) => bindField(input, 'sell'));
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
        malzemelerBuyCity: state.buyCity,
        malzemelerSellCity: state.sellCity
    };
    for (const [id, value] of Object.entries(selected)) {
        const select = container.querySelector(`#${id}`);
        if (select) {
            select.innerHTML = renderCityOptions(value);
        }
    }
}

function applyControls(container) {
    const groupSelect = container.querySelector('#malzemelerGroup');
    if (groupSelect) {
        groupSelect.value = state.group;
    }
    syncToggleGroup(container, 'data-enchant', state.enchant);
    syncToggleGroup(container, 'data-premium', state.premium ? '1' : '0');
    const enchantWrap = container.querySelector('[data-enchant-wrap]');
    if (enchantWrap) {
        enchantWrap.style.display = currentGroup().hasEnchant ? '' : 'none';
    }
    container.querySelectorAll('[data-price-for]').forEach((button) => {
        const current = button.dataset.priceFor === 'sell' ? state.sellSide : state.buySide;
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
    container.querySelector('#malzemelerGroup')?.addEventListener('change', (event) => {
        const next = GROUPS.find((group) => group.id === event.target.value);
        if (!next || next.id === state.group) {
            return;
        }
        state.group = next.id;
        savePrefs();
        applyControls(container);
        loadPrices(container, { showLoader: false, areaLoader: true });
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

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const side = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            if (button.dataset.priceFor === 'sell') {
                if (state.sellSide === side) {
                    return;
                }
                state.sellSide = side;
            } else {
                if (state.buySide === side) {
                    return;
                }
                state.buySide = side;
            }
            refreshView(container);
        });
    });

    bindCitySelect(container, '#malzemelerBuyCity', (value) => {
        state.buyCity = value;
        state.sellCity = value;
    });
    bindCitySelect(container, '#malzemelerSellCity', (value) => {
        state.sellCity = value;
    });

    bindPriceRefresh(container, {
        refreshId: 'malzemelerRefresh',
        apiId: 'malzemelerRefreshApi',
        load: (options) => loadPrices(container, options)
    });
}

function refreshOutput(container) {
    const result = container.querySelector('#malzemelerResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#malzemelerResult'));
    bindTableSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
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
        const data = await fetchPrices(allUniqueNames(), locations, { source });
        state.priceIndex = indexPrices(data);
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
        if (container.querySelector('#malzemelerResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('malzemelerTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.buySide = settings.buyPriceSide;
    state.sellSide = settings.sellPriceSide;

    showPageLoader('Şehir Makası yükleniyor…');
    try {
        await initStore();
        state.cities = loadActiveCities();
        readPrefs(state.cities);
        applyCityDefaults(state.cities);
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
