import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getSettings, enchantPowerCombos, normalizeEnchantPower } from './settings.js';
import { fetchPrices, indexPrices, cityRow, priceRefreshActionsHtml, bindPriceRefresh, priceLoaderMessage, applyPriceLoadMode } from './market.js';
import { itemIconHtml } from './item-icon.js';
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
import { bindCalcSticky } from './calc-sticky.js';
import { bindLivePrices } from './price-live.js';
import { loadCities } from './cities.js';
import { getEnchantSlots, getEnchantSteps, getEnchantPaths } from './catalog.js';

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

function standardHighlightNote(power) {
    const target = normalizeEnchantPower(power);
    const combos = enchantPowerCombos(target)
        .map((combo) => `${combo.tier}.${combo.enchant}`)
        .join(' · ');
    return combos ? `${target} ayar (${combos})` : `${target} ayar`;
}

function isStandardCell(tier, path, power) {
    return path.to >= 1 && path.to <= 3 && tier + path.to === power;
}

function isMainStandardCell(tier, path, power) {
    return isStandardCell(tier, path, power) && path.from === 0;
}

function standardCellClass(tier, path, power) {
    if (!isStandardCell(tier, path, power)) {
        return '';
    }
    return isMainStandardCell(tier, path, power) ? ' is-standard is-main' : ' is-standard';
}

const state = {
    matSide: 'buy',
    city: 'Bridgewatch',
    cities: [],
    slot: 'armor',
    priceIndex: null,
    manualMats: {},
    error: null,
    loaded: false,
    sort: { key: 'way', direction: 'asc' },
    enchantPower: 7
};

function currentSlot() {
    return slots().find((slot) => slot.id === state.slot) ?? slots()[1];
}

function formatSilver(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return Math.round(value).toLocaleString('tr-TR');
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

function readSavedSlot() {
    try {
        const saved = localStorage.getItem(SLOT_STORAGE_KEY);
        if (slots().some((slot) => slot.id === saved)) {
            return saved;
        }
    } catch {
        /* ignore */
    }
    return 'armor';
}

function saveSlot(id) {
    try {
        localStorage.setItem(SLOT_STORAGE_KEY, id);
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

function renderCityOptions() {
    return state.cities.map((city) => {
        const selected = city.marketApiName === state.city ? ' selected' : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${selected}>${escapeHtml(city.displayName)}</option>`;
    }).join('');
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
        <ul class="enchant-mats()">
            ${steps().map((step) => `
                <li class="enchant-mat">
                    ${itemIconHtml(`T4_${step.itemType}`)}
                    <span class="enchant-mat-text">
                        <span class="enchant-mat-label">${escapeHtml(step.label)}</span>
                        <span class="enchant-mat-meta">${escapeHtml(priceSideHint(state.matSide, 'buy'))} · ${escapeHtml(cityLabel(state.city))}</span>
                        <span class="enchant-mat-tiers">
                            ${TIERS.map((tier) => {
                                const key = matKey(step.kind, tier);
                                const fetched = fetchedMatQuote(key);
                                return `
                                    <span class="enchant-tier-row" data-mat-card="${escapeHtml(key)}">
                                        ${itemIconHtml(`T${tier}_${step.itemType}`, { className: 'item-icon enchant-tier-icon' })}
                                        ${priceFieldHtml({
                                            id: `matPrice-${key}`,
                                            label: `T${tier}`,
                                            value: priceInputValue(state.manualMats[key], fetched?.price),
                                            manual: isManualPrice(state.manualMats[key]),
                                            missing: !fetched,
                                            date: fetched?.date,
                                            dataAttr: `data-mat-price="${escapeHtml(key)}"`,
                                            fieldClass: 'enchant-price-field',
                                            iconId: `T${tier}_${step.itemType}`
                                        })}
                                    </span>
                                `;
                            }).join('')}
                        </span>
                    </span>
                </li>
            `).join('')}
        </ul>
    `;
}

function renderTable() {
    const slot = currentSlot();
    const power = state.enchantPower;
    const body = pathRows().map((row) => `
        <tr data-path="${row.index}" class="enchant-path enchant-path--${escapeHtml(row.path.tone)}">
            <td data-sort-value="${row.index}">
                <span class="enchant-way">${escapeHtml(row.label)}</span>
                <span class="enchant-item-meta">${escapeHtml(slot.label)} · ${slot.qty}</span>
            </td>
            ${TIERS.map((tier) => `
                <td class="num enchant-num${standardCellClass(tier, row.path, power)}${incompleteClass(row.costs[tier])}" data-sort-value="${row.costs[tier] ?? ''}">${formatSilver(row.costs[tier])}</td>
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
                            const enchant = power - tier;
                            const marked = enchant >= 1 && enchant <= 3;
                            const heading = marked ? `T${tier}.${enchant}` : `T${tier}`;
                            return sortHeaderHtml(heading, {
                                key: `t${tier}`,
                                type: 'number',
                                className: `num enchant-num${marked ? ' is-standard-col' : ''}`,
                                direction: dir(`t${tier}`),
                                title: marked
                                    ? `Hedef güç ${heading} için bu yolun malzeme maliyeti`
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
            <p class="enchant-standard-note">Vurgu: ${escapeHtml(standardHighlightNote(state.enchantPower))}. 0 → hedef yolları daha koyu. <a href="settings.html">Ayarlardan değiştir</a></p>
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
        cell.className = `num enchant-num${standardCellClass(tier, row.path, state.enchantPower)}${incompleteClass(row.costs[tier])}`;
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
                const fetched = fetchedMatQuote(key);
                input.value = fetched ? formatSilver(fetched.price) : '';
                input.classList.toggle('is-filled', input.value.length > 0);
            }
            refreshCalc(container);
        });
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
            <p>Seçilen slot’u kaçtan kaça çıkarmanın gümüş maliyeti. Excel tablosu: yol × T4–T8. Standart ayar (4.3 / 5.2 / 6.1 gibi) vurgulanır; Ayarlar’dan değişir. Fiyatlar şehirden; boşsa elle yazın.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="enchant-toolbar">
                    <div class="enchant-type enchant-slots()" role="radiogroup" aria-label="Slot">
                        ${renderSlotToggle()}
                    </div>
                    <div class="enchant-side-field">
                        <span class="enchant-side-label" id="enchantMatSideLabel">Malzeme</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="enchantMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="form-floating">
                        <select class="form-select is-filled" id="enchantCity">
                            ${renderCityOptions()}
                        </select>
                        <label for="enchantCity">Şehir</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'enchantRefresh', apiId: 'enchantRefreshApi' })}
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

    container.querySelector('#enchantCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        saveCity(value);
        renderPage(container);
    });

    bindPriceRefresh(container, {
        refreshId: 'enchantRefresh',
        apiId: 'enchantRefreshApi',
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
        const rows = await fetchPrices(mats().map((mat) => mat.uniqueName), locations, { source });
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
        if (container.querySelector('#enchantResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('enchantTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.matSide = settings.buyPriceSide;
    state.enchantPower = normalizeEnchantPower(settings.enchantPower);

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
