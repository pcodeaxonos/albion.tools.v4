import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getSettings, cityHasIsland } from './settings.js';
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
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, placesOrder } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadActiveCities } from './cities.js';
import { bindLivePrices } from './price-live.js';

const CITY_STORAGE_KEY = 'albiontools.v4.farming.city';
const PREFS_STORAGE_KEY = 'albiontools.v4.farming.prefs';
const BASE_YIELD = 4.5;
const PREMIUM_YIELD = 9;
const CITY_YIELD_BONUS = 0.1;
const FOCUS_BASE = 1000;
const YIELD_LADDER = [
    { seedReturn: 0, waterBonus: 2 },
    { seedReturn: 0.3333, waterBonus: 1.33 },
    { seedReturn: 0.6, waterBonus: 0.8 },
    { seedReturn: 0.7333, waterBonus: 0.53 },
    { seedReturn: 0.8, waterBonus: 0.4 },
    { seedReturn: 0.8667, waterBonus: 0.27 },
    { seedReturn: 0.9111, waterBonus: 0.18 },
    { seedReturn: 0.9333, waterBonus: 0.13 }
];

const CROPS = [
    crop('carrot', 1, 'CARROT', 'Carrots', 2312, ['Lymhurst', 'Brecilien']),
    crop('bean', 2, 'BEAN', 'Beans', 3468, ['Bridgewatch', 'Brecilien']),
    crop('wheat', 3, 'WHEAT', 'Sheaf of Wheat', 5780, ['Martlock', 'Brecilien']),
    crop('turnip', 4, 'TURNIP', 'Turnips', 8670, ['Fort Sterling', 'Brecilien']),
    crop('cabbage', 5, 'CABBAGE', 'Cabbage', 11560, ['Thetford', 'Brecilien']),
    crop('potato', 6, 'POTATO', 'Potatoes', 17340, ['Martlock', 'Brecilien']),
    crop('corn', 7, 'CORN', 'Bundle of Corn', 26010, ['Bridgewatch', 'Brecilien']),
    crop('pumpkin', 8, 'PUMPKIN', 'Pumpkin', 34680, ['Lymhurst', 'Brecilien'])
];

const HERBS = [
    herb('agaric', 2, 'AGARIC', 'Arcane Agaric', 3468, ['Thetford']),
    herb('comfrey', 3, 'COMFREY', 'Brightleaf Comfrey', 5780, ['Caerleon']),
    herb('burdock', 4, 'BURDOCK', 'Crenellated Burdock', 8670, ['Lymhurst']),
    herb('teasel', 5, 'TEASEL', 'Dragon Teasel', 11560, ['Bridgewatch', 'Caerleon']),
    herb('foxglove', 6, 'FOXGLOVE', 'Elusive Foxglove', 17340, ['Martlock']),
    herb('mullein', 7, 'MULLEIN', 'Firetouched Mullein', 26010, ['Thetford', 'Caerleon']),
    herb('yarrow', 8, 'YARROW', 'Ghoul Yarrow', 34680, ['Fort Sterling'])
];

function crop(key, tier, stem, label, vendor, bonusCities) {
    const ladder = YIELD_LADDER[tier - 1];
    return {
        id: `crop-${key}`,
        key,
        kind: 'crop',
        tier,
        label,
        vendor,
        bonusCities,
        seedId: `T${tier}_FARM_${stem}_SEED`,
        plantId: `T${tier}_${stem}`,
        seedReturn: ladder.seedReturn,
        waterBonus: ladder.waterBonus
    };
}

function herb(key, tier, stem, label, vendor, bonusCities) {
    const ladder = YIELD_LADDER[tier - 1];
    return {
        id: `herb-${key}`,
        key,
        kind: 'herb',
        tier,
        label,
        vendor,
        bonusCities,
        seedId: `T${tier}_FARM_${stem}_SEED`,
        plantId: `T${tier}_${stem}`,
        seedReturn: ladder.seedReturn,
        waterBonus: ladder.waterBonus
    };
}

const ALL_ITEMS = [...CROPS, ...HERBS];

const state = {
    premium: true,
    kind: 'crop',
    water: false,
    seedSide: 'buy',
    plantSide: 'buy',
    city: 'Martlock',
    cities: [],
    cropGeneral: 0,
    cropSpec: 0,
    herbGeneral: 0,
    herbSpec: 0,
    priceIndex: null,
    manualSeeds: Object.fromEntries(ALL_ITEMS.map((item) => [item.id, null])),
    manualPlants: Object.fromEntries(ALL_ITEMS.map((item) => [item.id, null])),
    error: null,
    loaded: false,
    sort: { key: 'unit', direction: 'asc' }
};

function currentItems() {
    return state.kind === 'herb' ? HERBS : CROPS;
}

function generalSpec() {
    return state.kind === 'herb' ? state.herbGeneral : state.cropGeneral;
}

function itemSpec() {
    return state.kind === 'herb' ? state.herbSpec : state.cropSpec;
}

function clampSpec(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.min(100, Math.max(0, Math.round(n)));
}

function focusCost() {
    return FOCUS_BASE * (0.5 ** ((generalSpec() + 2 * itemSpec()) / 100));
}

function hasCityBonus(item, city) {
    return item.bonusCities.includes(city);
}

function harvestQty(item) {
    const base = state.premium ? PREMIUM_YIELD : BASE_YIELD;
    return hasCityBonus(item, state.city) ? base * (1 + CITY_YIELD_BONUS) : base;
}

function seedReturnRate(item, watered) {
    return watered ? item.seedReturn + item.waterBonus : item.seedReturn;
}

function formatSilver(value, { unsigned = false, digits = 0 } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(value) : value;
    return amount.toLocaleString('tr-TR', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits > 0 && Math.abs(amount) < 10 ? Math.min(digits, 1) : 0
    });
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
    const martlock = cities.find((city) => city.marketApiName === 'Martlock');
    return martlock?.marketApiName ?? cities[0]?.marketApiName ?? 'Martlock';
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
        if (parsed.kind === 'herb' || parsed.kind === 'crop') {
            state.kind = parsed.kind;
        }
        state.cropGeneral = clampSpec(parsed.cropGeneral);
        state.cropSpec = clampSpec(parsed.cropSpec);
        state.herbGeneral = clampSpec(parsed.herbGeneral);
        state.herbSpec = clampSpec(parsed.herbSpec);
    } catch {
        /* ignore */
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
            kind: state.kind,
            cropGeneral: state.cropGeneral,
            cropSpec: state.cropSpec,
            herbGeneral: state.herbGeneral,
            herbSpec: state.herbSpec
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

function fetchedSeedQuote(item) {
    if (!state.priceIndex) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, item.seedId, state.city), state.seedSide, 'buy');
}

function fetchedPlantQuote(item) {
    if (!state.priceIndex) {
        return null;
    }
    return quoteFromRow(cityRow(state.priceIndex, item.plantId, state.city), state.plantSide, 'buy');
}

function seedQuote(item) {
    const parsed = parsePrice(state.manualSeeds[item.id]);
    if (parsed != null) {
        return manualQuote(parsed, state.seedSide, 'buy');
    }
    return fetchedSeedQuote(item);
}

function plantQuote(item) {
    const parsed = parsePrice(state.manualPlants[item.id]);
    if (parsed != null) {
        return manualQuote(parsed, state.plantSide, 'buy');
    }
    return fetchedPlantQuote(item);
}

function seedMark(usedPrice, vendor) {
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

function computeRow(item) {
    const seed = seedQuote(item);
    const plant = plantQuote(item);
    const qty = harvestQty(item);
    const baseReturn = seedReturnRate(item, false);
    const usedReturn = seedReturnRate(item, state.water);
    const seedSetup = seed ? seed.setup : false;
    const plantSetup = plant ? plant.setup : false;
    const netSeed = seed ? purchaseCost(seed.price * (1 - usedReturn), { setup: seedSetup }) : null;
    const unit = netSeed != null && qty > 0 ? netSeed / qty : null;
    const market = plant ? purchaseCost(plant.price, { setup: plantSetup }) : null;
    const delta = unit != null && market != null ? unit - market : null;
    let decision = null;
    if (delta != null) {
        decision = delta < 0 ? 'grow' : delta > 0 ? 'buy' : 'even';
    }

    let perFocus = null;
    if (state.water && seed) {
        const dryNet = purchaseCost(seed.price * (1 - baseReturn), { setup: seedSetup });
        const wetNet = netSeed;
        const focus = focusCost();
        if (Number.isFinite(dryNet) && Number.isFinite(wetNet) && focus > 0) {
            perFocus = (dryNet - wetNet) / focus;
        }
    }

    return {
        item,
        seed,
        plant,
        qty,
        usedReturn,
        netSeed,
        unit,
        market,
        delta,
        decision,
        perFocus,
        bonus: hasCityBonus(item, state.city),
        mark: seed ? seedMark(seed.price, item.vendor) : null
    };
}

function rows() {
    return currentItems().map(computeRow);
}

function bestUnitId(list) {
    let best = null;
    for (const row of list) {
        if (row.unit == null) {
            continue;
        }
        if (best == null || row.unit < best.unit) {
            best = row;
        }
    }
    return best?.item.id ?? null;
}

function renderKindToggle() {
    return [
        { id: 'crop', label: 'Ekin' },
        { id: 'herb', label: 'Ot' }
    ].map((option) => {
        const pressed = option.id === state.kind;
        return `
            <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                data-kind="${option.id}" aria-pressed="${pressed ? 'true' : 'false'}">
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

function specFieldsHtml() {
    if (!state.water) {
        return '';
    }

    const generalId = 'farmingGeneralSpec';
    const specId = 'farmingItemSpec';
    const generalLabel = state.kind === 'herb' ? 'Herb Gardener' : 'Crop Farmer';
    const specLabel = 'Ürün spec';

    return `
        <div class="farming-spec">
            <div class="form-floating">
                <input type="number" class="form-control is-filled" id="${generalId}"
                    min="0" max="100" step="1" value="${generalSpec()}">
                <label for="${generalId}">${escapeHtml(generalLabel)}</label>
            </div>
            <div class="form-floating">
                <input type="number" class="form-control is-filled" id="${specId}"
                    min="0" max="100" step="1" value="${itemSpec()}">
                <label for="${specId}">${escapeHtml(specLabel)}</label>
            </div>
        </div>
    `;
}

function decisionLabel(decision) {
    if (decision === 'grow') {
        return 'Üret';
    }
    if (decision === 'buy') {
        return 'Al';
    }
    if (decision === 'even') {
        return 'Eşit';
    }
    return '—';
}

function decisionClass(decision) {
    if (decision === 'grow') {
        return ' is-profit';
    }
    if (decision === 'buy') {
        return ' is-loss';
    }
    return '';
}

function deltaClass(delta) {
    if (!Number.isFinite(delta) || delta === 0) {
        return '';
    }
    return delta < 0 ? ' is-profit' : ' is-loss';
}

function renderTable() {
    const list = rows();
    const bestId = bestUnitId(list);
    const sort = state.sort;
    const dir = (key) => (sort.key === key ? sort.direction : null);

    const body = list.map((row) => {
        const seedFetched = fetchedSeedQuote(row.item);
        const plantFetched = fetchedPlantQuote(row.item);
        const seedManual = isManualPrice(state.manualSeeds[row.item.id]);
        const plantManual = isManualPrice(state.manualPlants[row.item.id]);
        const seedValue = priceInputValue(state.manualSeeds[row.item.id], seedFetched?.price);
        const plantValue = priceInputValue(state.manualPlants[row.item.id], plantFetched?.price);
        const mark = priceMarkHtml(row.mark);
        const bonus = row.bonus ? '<span class="farming-bonus">+10%</span>' : '';
        const best = row.item.id === bestId ? ' is-best' : '';

        return `
            <tr data-item-id="${escapeHtml(row.item.id)}" class="${best.trim()}">
                <td data-sort-value="${row.item.tier}">
                    <span class="farming-item">
                        ${itemIconHtml(row.item.plantId)}
                        <span>
                            <span class="farming-item-name">T${row.item.tier} ${escapeHtml(itemLabel(row.item.plantId, row.item.label))}</span>
                            <span class="farming-item-meta">${itemIconHtml(row.item.seedId, { className: 'item-icon farming-seed-icon' })} tohum${bonus}</span>
                        </span>
                    </span>
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.seed?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `seedPrice-${row.item.id}`,
                        label: 'Tohum',
                        value: seedValue,
                        manual: seedManual,
                        missing: !seedFetched,
                        date: seedFetched?.date,
                        dataAttr: `data-seed-price="${escapeHtml(row.item.id)}"`,
                        iconId: row.item.seedId,
                        mark
                    })}
                </td>
                <td class="num farming-num farming-price-cell" data-sort-value="${row.plant?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `plantPrice-${row.item.id}`,
                        label: 'Hasat',
                        value: plantValue,
                        manual: plantManual,
                        missing: !plantFetched,
                        date: plantFetched?.date,
                        dataAttr: `data-plant-price="${escapeHtml(row.item.id)}"`,
                        iconId: row.item.plantId
                    })}
                </td>
                <td class="num farming-num" data-sort-value="${row.qty}">${formatQty(row.qty)}</td>
                <td class="num farming-num" data-sort-value="${row.usedReturn}">${formatPct(row.usedReturn)}</td>
                <td class="num farming-num${incompleteClass(row.unit)}" data-sort-value="${row.unit ?? ''}">${formatSilver(row.unit, { digits: 1 })}</td>
                <td class="num farming-num${deltaClass(row.delta)}${incompleteClass(row.delta)}" data-sort-value="${row.delta ?? ''}">${formatSilver(row.delta, { digits: 1 })}</td>
                <td class="farming-verdict${decisionClass(row.decision)}${incompleteClass(row.decision)}" data-sort-value="${row.decision ?? ''}">${decisionLabel(row.decision)}</td>
                <td class="num farming-num${state.water ? incompleteClass(row.perFocus) : ''}" data-sort-value="${row.perFocus ?? ''}">${formatSilver(row.perFocus, { digits: 1 })}</td>
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
                    <col class="farming-col-pct">
                    <col class="farming-col-num">
                    <col class="farming-col-num">
                    <col class="farming-col-verdict">
                    <col class="farming-col-num">
                </colgroup>
                <thead>
                    <tr>
                        ${sortHeaderHtml('Ürün', { key: 'item', type: 'number', direction: dir('item'), title: 'Ekin veya ot' })}
                        ${sortHeaderHtml('Tohum', { key: 'seed', type: 'number', className: 'num farming-num', direction: dir('seed'), title: 'Tohum alış fiyatı' })}
                        ${sortHeaderHtml('Hasat alış', { key: 'plant', type: 'number', className: 'num farming-num', direction: dir('plant'), title: 'Hasat ürününün piyasa alış fiyatı' })}
                        ${sortHeaderHtml('Verim', { key: 'qty', type: 'number', className: 'num farming-num', direction: dir('qty'), title: 'Hasat miktarı' })}
                        ${sortHeaderHtml('Tohum %', { key: 'seedPct', type: 'number', className: 'num farming-num', direction: dir('seedPct'), title: 'Tohumun geri dönme oranı' })}
                        ${sortHeaderHtml('Birim', { key: 'unit', type: 'number', className: 'num farming-num', direction: dir('unit'), title: 'Bir hasat biriminin üretim maliyeti' })}
                        ${sortHeaderHtml('Fark', { key: 'delta', type: 'number', className: 'num farming-num', direction: dir('delta'), title: 'Üretim maliyeti eksi piyasa fiyatı' })}
                        ${sortHeaderHtml('Karar', { key: 'decision', type: 'text', direction: dir('decision'), title: 'Üret veya piyasadan al' })}
                        ${sortHeaderHtml('gümüş/focus', { key: 'focus', type: 'number', className: 'num farming-num', direction: dir('focus'), title: 'Sulamada focus başına kazanılan gümüş' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function latestQuoteDate() {
    const dates = currentItems()
        .flatMap((item) => [seedQuote(item)?.date, plantQuote(item)?.date])
        .filter(Boolean)
        .sort();
    return dates.length > 0 ? dates[dates.length - 1] : '';
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="farmingResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="farmingResult"></div>';
    }

    const seedSetup = placesOrder('buy', state.seedSide);
    const plantSetup = placesOrder('buy', state.plantSide);
    const stamp = formatDateTime(latestQuoteDate());
    const seedNote = `${priceSideHint(state.seedSide, 'buy')}${seedSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const plantNote = `${priceSideHint(state.plantSide, 'buy')}${plantSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const focusNote = state.water
        ? ` Sulama focus ${formatSilver(focusCost(), { digits: 1 })}.`
        : '';

    return `
        <div id="farmingResult">
            ${renderTable()}
            <p class="farming-note">
                ${escapeHtml(cityLabel(state.city))} · tohum ${escapeHtml(seedNote)} · hasat ${escapeHtml(plantNote)}.
                Birim = net tohum / verim. Fark = birim − hasat alış; negatifse üret, değilse al.
                Tohum işareti NPC fiyatına göre.${focusNote}
                Elle yazılan fiyat API’nin yerine geçer. Kırmızı fiyat API’de yok; turuncu 6 saatten eski. Hesap da kırmızı kalır, elle doldur.${stamp ? ` ${stamp}` : ''}
            </p>
        </div>
    `;
}

function bindFarmingSort(container) {
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
    tr.classList.toggle('is-best', row.item.id === bestId);

    tr.cells[0].dataset.sortValue = String(row.item.tier);

    const seedCell = tr.cells[1];
    const plantCell = tr.cells[2];
    const qtyCell = tr.cells[3];
    const pctCell = tr.cells[4];
    const unitCell = tr.cells[5];
    const deltaCell = tr.cells[6];
    const verdictCell = tr.cells[7];
    const focusCell = tr.cells[8];

    seedCell.dataset.sortValue = row.seed?.price ?? '';
    const seedFetched = fetchedSeedQuote(row.item);
    const seedManual = state.manualSeeds[row.item.id];
    applyPriceFieldState(seedCell.querySelector('.farming-price-field'), {
        manual: isManualPrice(seedManual),
        missing: !seedFetched,
        date: seedFetched?.date,
        displayValue: priceInputValue(seedManual, seedFetched?.price)
    });
    const seedField = seedCell.querySelector('.farming-price-field');
    let mark = seedField?.querySelector('.price-field-mark, .farming-seed-mark');
    if (row.mark) {
        if (!mark && seedField) {
            mark = document.createElement('span');
            seedField.append(mark);
        }
        if (mark) {
            mark.className = `price-field-mark farming-seed-mark float-cut is-${row.mark.tone}`;
            mark.textContent = row.mark.label;
        }
    } else if (mark) {
        mark.remove();
    }

    plantCell.dataset.sortValue = row.plant?.price ?? '';
    const plantFetched = fetchedPlantQuote(row.item);
    const plantManual = state.manualPlants[row.item.id];
    applyPriceFieldState(plantCell.querySelector('.farming-price-field'), {
        manual: isManualPrice(plantManual),
        missing: !plantFetched,
        date: plantFetched?.date,
        displayValue: priceInputValue(plantManual, plantFetched?.price)
    });

    qtyCell.dataset.sortValue = String(row.qty);
    qtyCell.textContent = formatQty(row.qty);

    pctCell.dataset.sortValue = String(row.usedReturn);
    pctCell.textContent = formatPct(row.usedReturn);

    unitCell.dataset.sortValue = row.unit ?? '';
    unitCell.textContent = formatSilver(row.unit, { digits: 1 });
    unitCell.className = `num farming-num${incompleteClass(row.unit)}`;

    deltaCell.dataset.sortValue = row.delta ?? '';
    deltaCell.textContent = formatSilver(row.delta, { digits: 1 });
    deltaCell.className = `num farming-num${deltaClass(row.delta)}${incompleteClass(row.delta)}`;

    verdictCell.dataset.sortValue = row.decision ?? '';
    verdictCell.textContent = decisionLabel(row.decision);
    verdictCell.className = `farming-verdict${decisionClass(row.decision)}${incompleteClass(row.decision)}`;

    if (focusCell) {
        focusCell.dataset.sortValue = row.perFocus ?? '';
        focusCell.textContent = formatSilver(row.perFocus, { digits: 1 });
        focusCell.className = `num farming-num${state.water ? incompleteClass(row.perFocus) : ''}`;
    }

    const bonus = tr.querySelector('.farming-bonus');
    if (row.bonus && !bonus) {
        const meta = tr.querySelector('.farming-item-meta');
        meta?.insertAdjacentHTML('beforeend', '<span class="farming-bonus">+10%</span>');
    } else if (!row.bonus && bonus) {
        bonus.remove();
    }
}

function refreshCalc(container) {
    const table = container.querySelector('.farming-table');
    if (!table) {
        return;
    }
    const list = rows();
    const bestId = bestUnitId(list);
    for (const row of list) {
        const tr = table.querySelector(`tr[data-item-id="${row.item.id}"]`);
        if (tr) {
            patchRowCells(tr, row, bestId);
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
            const id = kind === 'seed' ? input.dataset.seedPrice : input.dataset.plantPrice;
            if (kind === 'seed') {
                state.manualSeeds[id] = input.value;
            } else {
                state.manualPlants[id] = input.value;
            }
            refreshCalc(container);
        });

        input.addEventListener('change', () => {
            const id = kind === 'seed' ? input.dataset.seedPrice : input.dataset.plantPrice;
            const item = ALL_ITEMS.find((row) => row.id === id);
            if (parsePrice(input.value) == null) {
                if (kind === 'seed') {
                    state.manualSeeds[id] = null;
                    const fetched = item ? fetchedSeedQuote(item) : null;
                    input.value = fetched ? formatSilver(fetched.price) : '';
                } else {
                    state.manualPlants[id] = null;
                    const fetched = item ? fetchedPlantQuote(item) : null;
                    input.value = fetched ? formatSilver(fetched.price) : '';
                }
                input.classList.toggle('is-filled', input.value.length > 0);
            }
            refreshCalc(container);
        });
    };

    container.querySelectorAll('[data-seed-price]').forEach((input) => bindField(input, 'seed'));
    container.querySelectorAll('[data-plant-price]').forEach((input) => bindField(input, 'plant'));
}

function refreshOutput(container) {
    const result = container.querySelector('#farmingResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#farmingResult'));
    bindFarmingSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function renderPage(container) {
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Farming</h1>
            <p>Seçilen şehirde ekin / ot birim maliyeti. Tohum NPC’ye göre ucuz veya pahalı işaretlenir. Birim hasat alışından düşükse üret; değilse al, plotu daha ucuz ürüne ver.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="farming-toolbar">
                    <div class="farming-type" role="radiogroup" aria-label="Tür">
                        ${renderKindToggle()}
                    </div>
                    <div class="farming-type" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="farmingSeedSideLabel">Tohum</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="farmingSeedSideLabel">
                            ${priceSideToggleHtml('seed', state.seedSide)}
                        </div>
                    </div>
                    <div class="farming-side-field">
                        <span class="farming-side-label" id="farmingPlantSideLabel">Hasat</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="farmingPlantSideLabel">
                            ${priceSideToggleHtml('plant', state.plantSide)}
                        </div>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="farmingCity">
                            ${renderCityOptions()}
                        </select>
                        <label for="farmingCity">Şehir</label>
                    </div>
                    ${specFieldsHtml()}
                    ${priceRefreshActionsHtml({ refreshId: 'farmingRefresh', apiId: 'farmingRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindFarmingSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-kind]').forEach((button) => {
        button.addEventListener('click', () => {
            state.kind = button.dataset.kind === 'herb' ? 'herb' : 'crop';
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

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const side = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            if (button.dataset.priceFor === 'plant') {
                state.plantSide = side;
            } else {
                state.seedSide = side;
            }
            renderPage(container);
        });
    });

    container.querySelector('#farmingCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        saveCity(value);
        renderPage(container);
    });

    const bindSpec = (id, assign) => {
        const input = container.querySelector(id);
        if (!input) {
            return;
        }
        input.addEventListener('input', () => {
            assign(clampSpec(input.value));
            savePrefs();
            refreshCalc(container);
        });
        input.addEventListener('change', () => {
            assign(clampSpec(input.value));
            input.value = String(state.kind === 'herb'
                ? (id === '#farmingGeneralSpec' ? state.herbGeneral : state.herbSpec)
                : (id === '#farmingGeneralSpec' ? state.cropGeneral : state.cropSpec));
            savePrefs();
            renderPage(container);
        });
    };

    bindSpec('#farmingGeneralSpec', (value) => {
        if (state.kind === 'herb') {
            state.herbGeneral = value;
        } else {
            state.cropGeneral = value;
        }
    });
    bindSpec('#farmingItemSpec', (value) => {
        if (state.kind === 'herb') {
            state.herbSpec = value;
        } else {
            state.cropSpec = value;
        }
    });

    bindPriceRefresh(container, {
        refreshId: 'farmingRefresh',
        apiId: 'farmingRefreshApi',
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
        const [seedRows, plantRows] = await Promise.all([
            fetchPrices(ALL_ITEMS.map((item) => item.seedId), locations, { source }),
            fetchPrices(ALL_ITEMS.map((item) => item.plantId), locations, { source })
        ]);
        state.priceIndex = indexPrices([...seedRows, ...plantRows]);
        state.loaded = true;
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (container.querySelector('#farmingResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('farmingTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.water = settings.farmWater === true;
    state.seedSide = settings.buyPriceSide;
    state.plantSide = settings.buyPriceSide;
    readPrefs();

    showPageLoader('Farming yükleniyor…');
    try {
        await initStore();
        state.cities = loadActiveCities();
        state.city = readSavedCity(state.cities);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: ALL_ITEMS.flatMap((item) => [item.seedId, item.plantId]),
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
