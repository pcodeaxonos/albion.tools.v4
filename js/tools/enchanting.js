import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { getSettings, getStandardCombos, getDefaultCity } from '../core/settings.js';
import { fetchPrices, indexPrices, cityRow } from '../core/market.js';
import { itemIconHtml } from '../components/item-icon.js';
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
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { bindLivePrices } from '../core/price-live.js';
import { loadCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField } from '../components/city-picker.js';
import { getEnchantSlots, getEnchantSteps, getEnchantPaths } from '../core/catalog.js';
import { formatSilver, formatDateTime } from '../utils/format.js';
import { parsePrice, isManualPrice } from '../core/manual-pricing.js';
import { cityNames as listCityNames, cityLabel as getCityLabel, readStoredCity, saveStoredCity } from '../core/city-utils.js';

import { priceRefreshActionsHtml, bindPriceRefresh } from '../components/price-refresh.js';

import { runPriceLoad } from './shared/price-load.js';
import { readStorage, writeStorage } from '../core/storage.js';
import { bindManualPriceFields } from '../components/manual-price-fields.js';

const TIERS = [4, 5, 6, 7, 8];
const CITY_STORAGE_KEY = 'albiontools.v4.enchanting.city';
const SLOT_STORAGE_KEY = 'albiontools.v4.enchanting.slot';

function slots() {
    return getEnchantSlots();
}

function steps() {
    return getEnchantSteps();
}

function paths() {
    return getEnchantPaths();
}

function mats() {
    return steps().flatMap((step) => TIERS.map((tier) => ({
        key: matKey(step.kind, tier),
        uniqueName: `T${tier}_${step.itemType}`,
        kind: step.kind,
        tier,
        short: step.label
    })));
}

function matKey(kind, tier) {
    return `${kind}-${tier}`;
}

function pathLabel(path) {
    return `${path.from} → .${path.to}`;
}

function ensureManualMaps() {
    for (const mat of mats()) {
        if (!(mat.key in state.manualMats)) {
            state.manualMats[mat.key] = null;
        }
    }
}

function standardHighlightNote() {
    const combos = getStandardCombos()
        .map((combo) => `${combo.tier}.${combo.enchant}`)
        .join(' · ');
    return combos ? `Standart (${combos})` : 'Standart (boş)';
}

function isStandardCell(tier, path) {
    if (path.to < 1 || path.to > 3) {
        return false;
    }
    return getStandardCombos().some((combo) => combo.tier === tier && combo.enchant === path.to);
}

function isMainStandardCell(tier, path) {
    return isStandardCell(tier, path) && path.from === 0;
}

function standardCellClass(tier, path) {
    if (!isStandardCell(tier, path)) {
        return '';
    }
    return isMainStandardCell(tier, path) ? ' is-standard is-main' : ' is-standard';
}

const state = {
    matSide: 'buy',
    city: getDefaultCity(),
    cities: [],
    slot: 'armor',
    priceIndex: null,
    manualMats: {},
    error: null,
    loaded: false,
    sort: { key: 'way', direction: 'asc' }
};

function currentSlot() {
    return slots().find((slot) => slot.id === state.slot) ?? slots()[1];
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

function readSavedSlot() {
    const saved = readStorage(SLOT_STORAGE_KEY);
    return slots().some((slot) => slot.id === saved) ? saved : 'armor';
}

function saveSlot(id) {
    writeStorage(SLOT_STORAGE_KEY, id);
}

function manualQuote(price) {
    return {
        price,
        book: price,
        date: null,
        side: state.matSide,
        intent: 'buy',
        tick: 0,
        setup: false,
        manual: true
    };
}

function fetchedMatQuote(key) {
    const mat = mats().find((row) => row.key === key);
    if (!mat || !state.priceIndex) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, mat.uniqueName, state.city), state.matSide, 'buy');
}

function matQuote(key) {
    const parsed = parsePrice(state.manualMats[key]);
    if (parsed != null) {
        return manualQuote(parsed);
    }
    return fetchedMatQuote(key);
}

function enchantCost(tier, from, to) {
    const slot = currentSlot();
    if (!slot || to <= from) {
        return null;
    }

    let total = 0;
    for (const step of steps()) {
        if (step.from >= from && step.to <= to) {
            const quote = matQuote(matKey(step.kind, tier));
            if (!quote) {
                return null;
            }
            total += quote.price * slot.qty;
        }
    }

    return total;
}

function pathRows() {
    return paths().map((path, index) => ({
        index,
        path,
        label: pathLabel(path),
        costs: Object.fromEntries(TIERS.map((tier) => [tier, enchantCost(tier, path.from, path.to)]))
    }));
}

function renderSlotToggle() {
    return slots().map((slot) => {
        const pressed = slot.id === state.slot;
        return `
            <button type="button" class="enchant-type-btn${pressed ? ' is-active' : ''}"
                data-slot="${escapeHtml(slot.id)}" aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(slot.short)}
            </button>
        `;
    }).join('');
}

function renderMatStrip() {
    return `
        <div class="enchant-mats" id="enchantMats">
            <p class="enchant-mats-meta">${escapeHtml(priceSideHint(state.matSide, 'buy'))} · ${escapeHtml(cityLabel(state.city))}</p>
            <div class="enchant-mats-grid" style="--enchant-mat-cols: ${TIERS.length}">
                <div class="enchant-mat-corner" aria-hidden="true"></div>
                ${TIERS.map((tier) => `<div class="enchant-mat-tier-head">T${tier}</div>`).join('')}
                ${steps().map((step) => `
                    <div class="enchant-mat-kind">${escapeHtml(step.label)}</div>
                    ${TIERS.map((tier) => {
                        const key = matKey(step.kind, tier);
                        const fetched = fetchedMatQuote(key);
                        return `
                            <div class="enchant-mat" data-mat-card="${escapeHtml(key)}">
                                ${priceFieldHtml({
                                    id: `matPrice-${key}`,
                                    label: 'Fiyat',
                                    value: priceInputValue(state.manualMats[key], fetched?.price),
                                    manual: isManualPrice(state.manualMats[key]),
                                    missing: !fetched,
                                    date: fetched?.date,
                                    dataAttr: `data-mat-price="${escapeHtml(key)}"`,
                                    fieldClass: 'enchant-price-field royal-price-field',
                                    iconId: `T${tier}_${step.itemType}`
                                })}
                            </div>
                        `;
                    }).join('')}
                `).join('')}
            </div>
        </div>
    `;
}

function renderTable() {
    const slot = currentSlot();
    const standards = getStandardCombos();
    const body = pathRows().map((row) => `
        <tr data-path="${row.index}" class="enchant-path enchant-path--${escapeHtml(row.path.tone)}">
            <td data-sort-value="${row.index}">
                <span class="enchant-way">${escapeHtml(row.label)}</span>
                <span class="enchant-item-meta">${escapeHtml(slot.label)} · ${slot.qty}</span>
            </td>
            ${TIERS.map((tier) => `
                <td class="num enchant-num${standardCellClass(tier, row.path)}${incompleteClass(row.costs[tier])}" data-sort-value="${row.costs[tier] ?? ''}">${formatSilver(row.costs[tier])}</td>
            `).join('')}
        </tr>
    `).join('');

    const sort = state.sort;
    const dir = (key) => (sort.key === key ? sort.direction : null);

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table enchant-table calc-table">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Yol', { key: 'way', type: 'number', direction: dir('way'), title: 'Enchant adımı (başlangıç → hedef)' })}
                        ${TIERS.map((tier) => {
                            const hits = standards.filter((combo) => combo.tier === tier);
                            const marked = hits.length > 0;
                            const heading = marked
                                ? hits.map((combo) => `T${tier}.${combo.enchant}`).join(' · ')
                                : `T${tier}`;
                            return sortHeaderHtml(heading, {
                                key: `t${tier}`,
                                type: 'number',
                                className: `num enchant-num${marked ? ' is-standard-col' : ''}`,
                                direction: dir(`t${tier}`),
                                title: marked
                                    ? `Standart hedef: ${heading}`
                                    : `T${tier} eşyayı bu yolla enchant etmenin maliyeti`
                            });
                        }).join('')}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function latestQuoteDate() {
    const dates = mats().map((mat) => matQuote(mat.key)?.date).filter(Boolean).sort();
    return dates.at(-1) ?? '';
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="enchantResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="enchantResult"></div>';
    }

    const slot = currentSlot();
    const stamp = formatDateTime(latestQuoteDate());
    const hint = priceSideHint(state.matSide, 'buy');

    return `
        <div id="enchantResult">
            <div class="enchant-result-head">
                <h2>
                    ${itemIconHtml(slot.icon, { className: 'item-icon enchant-head-icon' })}
                    ${escapeHtml(slot.label)}
                </h2>
            </div>
            ${renderMatStrip()}
            ${renderTable()}
            <p class="enchant-note">${slot.qty} rune / soul / relic · ${escapeHtml(cityLabel(state.city))} ${escapeHtml(hint)}${stamp ? ` · ${stamp}` : ''}. Elle yazılan malzeme fiyatı API’nin yerine geçer. Kırmızı fiyat API’de yok; mavi 6 saatten eski.</p>
            <p class="enchant-standard-note">Vurgu: ${escapeHtml(standardHighlightNote())}. 0 → hedef yolları daha koyu. <a href="settings">Ayarlardan değiştir</a></p>
        </div>
    `;
}

function bindEnchantSort(container) {
    const table = container.querySelector('.enchant-table');
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
    tr.cells[0].dataset.sortValue = String(row.index);
    TIERS.forEach((tier, index) => {
        const cell = tr.cells[index + 1];
        cell.dataset.sortValue = row.costs[tier] ?? '';
        cell.className = `num enchant-num${standardCellClass(tier, row.path)}${incompleteClass(row.costs[tier])}`;
        cell.textContent = formatSilver(row.costs[tier]);
    });
}

function refreshCalc(container) {
    const table = container.querySelector('.enchant-table');
    if (table) {
        for (const row of pathRows()) {
            const tr = table.querySelector(`tr[data-path="${row.index}"]`);
            if (tr) {
                patchRowCells(tr, row);
            }
        }
    }

    mats().forEach((mat) => {
        const card = container.querySelector(`[data-mat-card="${mat.key}"]`);
        const fetched = fetchedMatQuote(mat.key);
        applyPriceFieldState(card?.querySelector('.enchant-price-field'), {
            manual: isManualPrice(state.manualMats[mat.key]),
            missing: !fetched,
            date: fetched?.date,
            displayValue: priceInputValue(state.manualMats[mat.key], fetched?.price)
        });
    });
}

function bindPriceInputs(container) {
    bindManualPriceFields(container, {
        fields: [{
            selector: '[data-mat-price]',
            dataKey: 'matPrice',
            values: state.manualMats,
            resolveFallbackPrice: (key) => fetchedMatQuote(key)?.price
        }],
        onRefresh: () => refreshCalc(container)
    });
}

function refreshOutput(container) {
    const result = container.querySelector('#enchantResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#enchantResult'));
    bindEnchantSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function renderPage(container) {
    container.innerHTML = `
        <section class="enchant-hero">
            <h1>Enchanting</h1>
            <p>Seçilen slot’u kaçtan kaça çıkarmanın gümüş maliyeti. Excel tablosu: yol × T4–T8. Standart ayar (4.3 / 5.2 / 6.1 gibi) vurgulanır; sıra Ayarlar’dan değişir ve Royal Crafting’de de kullanılır. Fiyatlar şehirden; boşsa elle yazın.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="enchant-toolbar">
                    <div class="enchant-type enchant-slots" role="radiogroup" aria-label="Slot">
                        ${renderSlotToggle()}
                    </div>
                    <div class="enchant-side-field">
                        <span class="enchant-side-label" id="enchantMatSideLabel">Malzeme</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="enchantMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    ${cityFieldHtml({
                        id: 'enchantCity',
                        label: 'Şehir',
                        selected: state.city,
                        cities: state.cities,
                        className: ''
                    })}
                    ${priceRefreshActionsHtml()}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindEnchantSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-slot]').forEach((button) => {
        button.addEventListener('click', () => {
            state.slot = button.dataset.slot;
            saveSlot(state.slot);
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            state.matSide = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            renderPage(container);
        });
    });

    bindCityField(container, 'enchantCity', (value) => {
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
            const rows = await fetchPrices(mats().map((mat) => mat.uniqueName), locations, { source });
            state.priceIndex = indexPrices(rows);
        },
        onFinally: () => {
            if (container.querySelector('#enchantResult')) {
                refreshOutput(container);
            } else {
                renderPage(container);
            }
        }
    });
}

async function init() {
    initNav();
    const container = document.getElementById('enchantTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.matSide = settings.buyPriceSide;

    showPageLoader('Enchanting yükleniyor…');
    try {
        await initStore();
        state.slot = readSavedSlot();
        ensureManualMaps();
        state.cities = loadCities().filter((city) => city.isActive);
        state.city = readSavedCity(state.cities);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: mats().map((mat) => mat.uniqueName),
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
