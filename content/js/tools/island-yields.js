import { toolPageHtml } from '../components/tool-page.js';
import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { initFloatingLabels } from '../components/forms.js';
import { initStore, getAll, createRow, updateRow, deleteRow, replaceAllRows } from '../db/store.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { bindLogTableRows } from '../components/log-table.js';
import { loadActiveCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField, setCityFieldValue, cityColorHex, cityIslandDecorate } from '../components/city-picker.js';
import {
    islandYieldFieldHtml,
    bindPlantField,
    setPlantFieldValue,
    kindForIslandYieldKey,
    outputGroupsForKind
} from '../components/plant-picker.js?v=20260929-island-sections';
import { getSettings, saveSettings, getDefaultCity } from '../core/settings.js';
import { cityYieldBonus, productQtyConst } from '../core/island/economy-config.js';
import { getPlants, getAnimals } from '../core/catalog.js';
import { itemIconHtml } from '../components/item-icon.js';
import { showToast } from '../components/toast.js';
import { entryWarnings } from '../core/island-yield-validation.mjs';
import { formatPct as formatPercent, formatQuantity, formatIsoDate as formatDate } from '../utils/format.js';
import { cityLabel as getCityLabel, readStoredCity, saveStoredCity } from '../core/city-utils.js';

const formatPct = (ratio) => formatPercent(ratio, { digits: 0 });
const formatQty = (value) => formatQuantity(value, { digits: 2 });
import {
    yieldAverage,
    standardPlantYield,
    standardSeedReturn,
    standardAnimalReturn
} from '../core/island-yield-stats.js';

const TABLE = 'islandYieldLogs';
const CITY_STORAGE_KEY = 'albiontools.v4.island-yields.city';
const SEEDS_PER_PLOT = 9;

const PLOT_CHOICES = [1, 2, 3, 4, 5];
const CHANGE_BADGE_VISIBLE_MS = 60_000;
const CHANGE_BADGE_EXIT_MS = 800;
const LOG_PERIODS = [
    { key: 'all', label: 'Tüm aylar' },
    { key: 'current', label: 'Bu ay', months: 0 },
    { key: 'previous', label: 'Geçen ay', months: 1 },
    { key: 'previous-3', label: 'Geçen 3 ay', months: 3 },
    { key: 'previous-6', label: 'Geçen 6 ay', months: 6 }
];

const OUTLIER_SEED_RATE_DELTA = 0.20;
const OUTLIER_HARVEST_RATE_DELTA = 0.18;

const SLOT_WARNING_GROUPS = [
    { id: 'crop', label: 'Bitki' },
    { id: 'herb', label: 'Ot' },
    { id: 'pasture', label: 'Pasture' },
    { id: 'kennel', label: 'Kennel' }
];

const state = {
    month: 'all',
    editingId: null,
    islandCity: getDefaultCity(),
    premium: true,
    water: false,
    cities: [],
    plotsSelected: 1,
    autoPlots: true,
    yieldKind: 'plant',
    filteredPlantKey: null,
    filteredItemType: null,
    activeAverageGroup: null,
    animalOutputMode: 'offspring',
    slotMismatchWarnings: new Set()
};

function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function toYearMonth(isoDate) {
    return String(isoDate || '').slice(0, 7);
}

function logPeriodRange(period, today = todayIso()) {
    const preset = LOG_PERIODS.find((item) => item.key === period);
    if (!period || preset?.key === 'all') return null;
    if (!preset) return { start: period, end: period };
    const [year, month] = today.split('-').map(Number);
    const monthAt = (offset) => toYearMonth(todayIsoForMonth(year, month - 1 + offset));
    return preset.months === 0
        ? { start: monthAt(0), end: monthAt(0) }
        : { start: monthAt(-preset.months), end: monthAt(-1) };
}

function todayIsoForMonth(year, monthIndex) {
    const date = new Date(year, monthIndex, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function parseQuantityExpression(value) {
    const expression = String(value ?? '').replace(/\s+/g, '');
    if (!/^\d+(?:\s*[+-]\s*\d+)*$/.test(expression)) {
        return Number.NaN;
    }
    return (expression.match(/[+-]?\d+/g) || []).reduce((total, part) => total + Number(part), 0);
}

function formatSigned(value, { digits = 2, asPctPoints = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const abs = asPctPoints
        ? Math.abs(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })
        : Math.abs(value).toLocaleString('tr-TR', { maximumFractionDigits: digits });
    const unit = asPctPoints ? 'pp' : '';
    if (value > 0) {
        return `+${abs}${unit}`;
    }
    if (value < 0) {
        return `−${abs}${unit}`;
    }
    return `0${unit}`;
}

function formatDeltaMagnitude(value, { digits = 2, asPctPoints = false } = {}) {
    if (!Number.isFinite(value)) {
        return '';
    }
    const amount = asPctPoints ? Math.abs(value * 100) : Math.abs(value);
    const suffix = asPctPoints ? 'pp' : '';
    return `${amount.toLocaleString('tr-TR', { maximumFractionDigits: digits })}${suffix}`;
}

function formatRelativeDifference(actual, expected) {
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected === 0) return '—';
    return formatRelativeRatio((actual - expected) / expected);
}

function formatRelativeRatio(value) {
    if (!Number.isFinite(value)) return '—';
    return `${Math.abs(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}%`;
}

function dayAccentColor(isoDate) {
    const palette = ['#e0a04a', '#5aa8e8', '#b07ae8', '#5ecf7a', '#e85a5a', '#6ec9c0'];
    const hash = [...String(isoDate ?? '')].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0);
    return palette[hash % palette.length];
}

function confidenceTooltip(avg) {
    const confidence = avg?.confidence;
    const error = confidence?.relativeError;
    const detail = Number.isFinite(error) ? ` · %95 bootstrap aralığının bağıl yarı genişliği: ±${formatQty(error * 100)}%` : " · Veri yetersiz / hesaplanamıyor";
    return `Güven seviyesi ${confidence?.level ?? 0}/4 · Örnek miktarı değil, ortalamanın istatistiksel stabilitesi${detail}. 4 nokta: mevcut veriye göre yaklaşık ±%2 bandı; makul ek kayıtların ortalamayı anlamlı ölçüde değiştirme ihtimali düşük. En az 3 bağımsız kayıt gerekir.`;
}

function deltaTone(value) {
    if (!Number.isFinite(value) || value === 0) {
        return '';
    }
    return value > 0 ? 'is-pos' : 'is-neg';
}

function gaugeFill(value) {
    if (!Number.isFinite(value) || value === 0) {
        return 0;
    }
    // The gauge spans one side of the zero marker. Ten percentage points fills
    // that side; a small floor keeps non-zero observations legible.
    return Math.min(48, Math.max(4, Math.abs(value) * 500));
}

function cityLabel(apiName) {
    return getCityLabel(state.cities, apiName);
}

function comparisonCities() {
    return state.cities;
}

function itemsForKind(kind = state.yieldKind) {
    if (kind === 'plant') return getPlants();
    return getAnimals({ plotType: kind });
}

function itemTypeForKind(kind = state.yieldKind) {
    return kind === 'plant' ? 'plant' : 'animal';
}

function itemTypeForPickerOutput(outputMode, kind = state.yieldKind) {
    if (kind !== 'plant' && outputMode === 'product') {
        return 'animalProduct';
    }
    return itemTypeForKind(kind);
}

function itemForKey(key, itemType = itemTypeForKind()) {
    const source = itemType === 'plant' ? getPlants() : getAnimals();
    return source.find((item) => item.key === key) ?? null;
}

function itemLabel(key, itemType = itemTypeForKind()) {
    const item = itemForKey(key, itemType);
    return itemType === 'animalProduct'
        ? item?.productLabel || item?.label || key
        : item?.label || key;
}

function itemIconId(item, itemType = itemTypeForKind()) {
    if (itemType === 'animalProduct') return item?.productId;
    return itemType === 'animal' ? item?.grownId : item?.plantId;
}

function rowItemType(row) {
    return row.itemType || 'plant';
}

function rowItemKey(row) {
    return row.itemKey || row.plantKey;
}

function rowMatchesKind(row, kind = state.yieldKind) {
    if (kind === 'plant') return rowItemType(row) === 'plant';
    const animal = itemForKey(rowItemKey(row), 'animal');
    return ['animal', 'animalProduct'].includes(rowItemType(row)) && animal?.plotType === kind;
}

function rowsForMonth(month, {
    islandCity = null,
    plantKey = null,
    itemType = null,
    premium = null,
    water = null
} = {}) {
    const range = logPeriodRange(month);
    return getAll(TABLE)
        .filter((row) => !range || (toYearMonth(row.date) >= range.start && toYearMonth(row.date) <= range.end))
        .filter((row) => !islandCity || row.islandCity === islandCity)
        .filter((row) => rowMatchesKind(row))
        .filter((row) => !plantKey || rowItemKey(row) === plantKey)
        .filter((row) => !itemType || rowItemType(row) === itemType)
        .filter((row) => premium == null || Boolean(row.premium) === premium)
        .filter((row) => water == null || Boolean(row.water) === water)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

const cityBonusPct = cityYieldBonus;

function hasCityBonus(plant, islandCity) {
    return Array.isArray(plant?.bonusCities) && plant.bonusCities.includes(islandCity);
}

function averageFor(item, islandCity = state.islandCity, itemType = itemTypeForKind()) {
    return yieldAverage(islandCity, item?.key, {
        premium: state.premium,
        water: state.water,
        itemType,
        includeConfidence: true
    });
}

function standardOutput(item, islandCity = state.islandCity) {
    if (state.yieldKind === 'plant') {
        return standardPlantYield(item, islandCity, state.premium);
    }
    return 1;
}

function standardReturn(item, islandCity = state.islandCity) {
    if (state.yieldKind === 'plant') {
        return standardSeedReturn(item, state.water);
    }
    return standardAnimalReturn(item, { focus: state.water });
}

// This must always use the game baseline.  `effectiveAnimalProductYield` is
// deliberately data-aware for calculations, so using it here made the
// “Varsayılan” comparison value mirror a saved observation.
function standardAnimalProductOutput(animal, islandCity = state.islandCity) {
    const base = productQtyConst();
    const bonus = hasCityBonus(animal, islandCity) ? cityBonusPct() : 0;
    return base * (1 + bonus);
}

function metricCopy() {
    return state.yieldKind === 'plant'
        ? { input: 'Tohum', returned: 'Dönen tohum', output: 'Hasat ürün', outputShort: 'Ürün', returnShort: 'Tohum', mode: 'Sulama', on: 'Su', off: 'Kuru' }
        : { input: 'Yavru', returned: 'Dönen yavru', output: 'Büyüyen hayvan', outputShort: 'Hayvan', returnShort: 'Yavru', mode: 'Odak', on: 'Odaklı', off: 'Odaksız' };
}

function unitsPerPlot() {
    return state.yieldKind === 'kennel' ? 4 : SEEDS_PER_PLOT;
}

function unitsPerSlotForRow(row) {
    if (rowItemType(row) === 'plant') return SEEDS_PER_PLOT;
    const animal = itemForKey(rowItemKey(row), 'animal');
    return animal?.plotType === 'kennel' ? 4 : SEEDS_PER_PLOT;
}

function estimatedSlotsForRow(row) {
    const inputQty = Number(row.seedsPlanted);
    const unitsPerSlot = unitsPerSlotForRow(row);
    if (!Number.isFinite(inputQty) || inputQty <= 0 || unitsPerSlot <= 0) return null;
    return Math.ceil(inputQty / unitsPerSlot);
}

function slotWarningGroupForRow(row) {
    if (rowItemType(row) === 'plant') {
        return itemForKey(rowItemKey(row), 'plant')?.kind === 'herb' ? 'herb' : 'crop';
    }
    const animal = itemForKey(rowItemKey(row), 'animal');
    return animal?.plotType === 'kennel' ? 'kennel' : 'pasture';
}

function dailyEstimatedSlots(islandCity, date, group) {
    return getAll(TABLE)
        .filter((row) => row.islandCity === islandCity && row.date === date)
        // Product-only entries are linked to an animal log and must not count
        // as an additional slot.
        .filter((row) => rowItemType(row) !== 'animalProduct')
        .filter((row) => slotWarningGroupForRow(row) === group)
        .reduce((total, row) => total + (estimatedSlotsForRow(row) ?? 0), 0);
}

function previousDateForSlotWarningGroup(islandCity, group, beforeDate) {
    return getAll(TABLE)
        .filter((row) => row.islandCity === islandCity && row.date < beforeDate)
        .filter((row) => rowItemType(row) !== 'animalProduct')
        .filter((row) => slotWarningGroupForRow(row) === group)
        .map((row) => row.date)
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function entrySummaryRows(islandCity, date) {
    return getAll(TABLE)
        .filter((row) => row.islandCity === islandCity && row.date === date);
}

function entrySummaryDate(islandCity, beforeDate) {
    return getAll(TABLE)
        .filter((row) => row.islandCity === islandCity && row.date < beforeDate)
        .map((row) => row.date)
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function renderEntrySummary(islandCity) {
    const today = todayIso();
    const referenceDate = entrySummaryDate(islandCity, today);
    if (!referenceDate) {
        return '<div class="alert alert-info mb-0">Özet için bu şehirde önceki bir günün kaydı gerekli.</div>';
    }

    const currentRows = entrySummaryRows(islandCity, today);
    const referenceRows = entrySummaryRows(islandCity, referenceDate);
    const productKeys = [...new Set([...currentRows, ...referenceRows]
        .filter((row) => rowItemType(row) === 'animalProduct')
        .map(rowItemKey))];
    const productSlots = (rows, key) => rows
        .filter((row) => rowItemType(row) === 'animalProduct' && rowItemKey(row) === key)
        .reduce((total, row) => total + (estimatedSlotsForRow(row) ?? 0), 0);
    const lines = [...SLOT_WARNING_GROUPS.map((group) => ({
        label: group.label,
        currentSlots: dailyEstimatedSlots(islandCity, today, group.id),
        referenceSlots: dailyEstimatedSlots(islandCity, referenceDate, group.id)
    })), ...productKeys.map((key) => ({
        label: itemLabel(key, 'animalProduct'),
        currentSlots: productSlots(currentRows, key),
        referenceSlots: productSlots(referenceRows, key)
    }))].filter((line) => line.currentSlots > 0 || line.referenceSlots > 0);
    const complete = lines.length > 0 && lines.every((line) => line.currentSlots === line.referenceSlots);

    return `
        <section class="app-entry-summary${complete ? ' is-complete' : ''}" aria-label="Günlük kayıt özeti">
            <ul class="app-warning-dialog-list">
                ${lines.map((line) => {
                    const tone = line.currentSlots === line.referenceSlots ? 'is-equal' : line.currentSlots > line.referenceSlots ? 'is-extra' : 'is-missing';
                    return `<li class="${tone}"><strong>${escapeHtml(line.label)}</strong><span>${line.currentSlots}</span><small>Bugün</small><i aria-hidden="true">${line.currentSlots === line.referenceSlots ? '=' : '≠'}</i><span>${line.referenceSlots}</span><small>${escapeHtml(formatDate(referenceDate))}</small></li>`;
                }).join('')}
            </ul>
        </section>
    `;
}

function refreshEntrySummary(container) {
    const host = container.querySelector('[data-yield-entry-summary]');
    if (host) host.innerHTML = renderEntrySummary(state.islandCity);
}

function slotMismatchesForToday(islandCity) {
    const date = todayIso();
    return SLOT_WARNING_GROUPS.map((group) => {
        const currentSlots = dailyEstimatedSlots(islandCity, date, group.id);
        if (!currentSlots) return null;
        const previousDate = previousDateForSlotWarningGroup(islandCity, group.id, date);
        if (!previousDate) return null;
        const previousSlots = dailyEstimatedSlots(islandCity, previousDate, group.id);
        return currentSlots === previousSlots ? null : {
            label: group.label,
            currentSlots,
            previousSlots,
            previousDate
        };
    }).filter(Boolean);
}

function showSlotMismatchWarning(container, islandCity) {
    const date = todayIso();
    const warningKey = `${islandCity}|${date}`;
    if (state.slotMismatchWarnings.has(warningKey)) return;

    const mismatches = slotMismatchesForToday(islandCity);
    if (!mismatches.length) return;

    state.slotMismatchWarnings.add(warningKey);
    const dialog = container.querySelector('[data-yield-slot-warning]');
    const details = dialog?.querySelector('[data-yield-slot-warning-details]');
    if (!dialog || !details) return;
    details.innerHTML = mismatches.map((mismatch) => `
        <li><strong>${escapeHtml(mismatch.label)}</strong><span>${mismatch.currentSlots}</span><small>Bugün</small><i aria-hidden="true">≠</i><span>${mismatch.previousSlots}</span><small>${escapeHtml(formatDate(mismatch.previousDate))}</small></li>
    `).join('');
    dialog.showModal();
}

function tierAttribute(tier) {
    const n = Number(tier);
    if (n >= 1 && n <= 8) {
        return `data-tier="${n}"`;
    }
    return '';
}

const YIELD_TOGGLE_ICONS = {
    premium: '<path d="m3 7 4 4 5-7 5 7 4-4-2 11H5Z"/><path d="M5 21h14"/>',
    free: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    water: '<path d="M12 3C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
    dry: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    focus: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    noFocus: '<path d="m13 2-3 4m-3 4-3 4h7l-1 8 5-6m3-4 2-3h-7l.4-3M3 3l18 18"/>'
};

function renderToggle(groupLabel, options, dataAttr, current) {
    return `
        <div class="farming-type" role="group" aria-label="${escapeHtml(groupLabel)}">
            ${options.map((option) => {
                const pressed = option.id === current;
                return `
                    <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                        data-${dataAttr}="${option.value}" aria-pressed="${pressed ? 'true' : 'false'}"
                        aria-label="${escapeHtml(option.label)}" title="${escapeHtml(option.label)}">
                        <svg class="farming-type-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${YIELD_TOGGLE_ICONS[option.icon]}</svg>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function setPlantedFields(container, seeds) {
    const planted = container.querySelector('#seedsPlanted');
    if (!planted) {
        return;
    }
    const n = Number(seeds);
    const safe = Number.isFinite(n) && n > 0 ? n : 1;
    planted.value = String(safe);
    planted.classList.add('is-filled');

    const plotCount = safe / unitsPerPlot();
    const matched = Number.isInteger(plotCount) && PLOT_CHOICES.includes(plotCount)
        ? plotCount
        : null;
    state.plotsSelected = matched;
    syncPlotButtons(container, matched);
}

function syncPlotButtons(container, plotCount) {
    container.querySelectorAll('[data-plots]').forEach((button) => {
        const pressed = plotCount != null && Number(button.dataset.plots) === Number(plotCount);
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

function applyPlotChoice(container, plots) {
    const n = Number(plots);
    if (!Number.isInteger(n) || n < 1) {
        return;
    }
    state.plotsSelected = n;
    const planted = container.querySelector('#seedsPlanted');
    if (planted) {
        planted.value = String(n * unitsPerPlot());
        planted.classList.add('is-filled');
    }
    syncPlotButtons(container, n);
}

function syncPlotsFromSeeds(container) {
    const planted = container.querySelector('#seedsPlanted');
    if (!planted) {
        return;
    }
    const seeds = Number(planted.value);
    if (!Number.isFinite(seeds) || seeds <= 0) {
        state.plotsSelected = null;
        syncPlotButtons(container, null);
        return;
    }
    const raw = seeds / unitsPerPlot();
    const matched = Number.isInteger(raw) && PLOT_CHOICES.includes(raw) ? raw : null;
    state.plotsSelected = matched;
    syncPlotButtons(container, matched);
}

function outputQuantity(container, selector) {
    const input = container.querySelector(selector);
    const value = parseQuantityExpression(input?.value);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function plotCandidates({ returned, harvested, animalProduct, harvestPerSeed, seedReturnRate, animalProductPerSeed }) {
    const estimates = [PLOT_CHOICES.at(-1)];
    const seedsPerPlot = unitsPerPlot();

    if (returned != null) {
        // A returned seed cannot exceed the number planted; retain this hard
        // lower bound even when no historical return rate is available.
        estimates.push(returned / seedsPerPlot);
        if (seedReturnRate > 0) estimates.push(returned / (seedsPerPlot * seedReturnRate));
    }
    if (harvested != null && harvestPerSeed > 0) {
        estimates.push(harvested / (seedsPerPlot * harvestPerSeed));
    }
    if (animalProduct != null && animalProductPerSeed > 0) {
        estimates.push(animalProduct / (seedsPerPlot * animalProductPerSeed));
    }

    // Include one value above the largest estimate so rounding and imperfect
    // observed yields do not artificially cap the automatic estimate at five.
    const maxPlots = Math.max(1, Math.ceil(Math.max(...estimates)) + 1);
    return Array.from({ length: maxPlots }, (_, index) => index + 1);
}

function estimatedPlotForOutputs(container) {
    const returned = outputQuantity(container, '#seedsReturned');
    const harvested = state.yieldKind === 'plant'
        ? outputQuantity(container, '#plantsHarvested')
        : null;
    const animalProduct = outputQuantity(container, '[data-products-harvested]');
    if (returned == null && harvested == null && animalProduct == null) {
        return null;
    }

    const plantKey = selectedItemKey(container);
    const plant = itemForKey(plantKey);
    const average = averageFor(plant);
    const harvestPerSeed = average?.avgPlantYield > 0
        ? average.avgPlantYield
        : standardOutput(plant);
    const seedReturnRate = average && Number.isFinite(average.avgSeedReturn)
        ? average.avgSeedReturn
        : standardReturn(plant);

    const animalProductPerSeed = animalProduct != null && state.yieldKind === 'pasture' && plant?.productId
        ? standardAnimalProductOutput(plant, state.islandCity)
        : null;
    const candidates = plotCandidates({
        returned,
        harvested,
        animalProduct,
        harvestPerSeed,
        seedReturnRate,
        animalProductPerSeed
    }).filter((plots) =>
        state.yieldKind !== 'plant' || returned == null || returned <= plots * unitsPerPlot()
    );
    if (!candidates.length) {
        return 1;
    }

    return candidates.reduce((best, plots) => {
        const seeds = plots * unitsPerPlot();
        let score = 0;
        if (returned != null && Number.isFinite(seedReturnRate)) {
            score += Math.abs(returned - (seeds * seedReturnRate)) / Math.max(1, returned);
        }
        if (harvested != null && Number.isFinite(harvestPerSeed) && harvestPerSeed > 0) {
            score += Math.abs(harvested - (seeds * harvestPerSeed)) / Math.max(1, harvested);
        }
        if (animalProduct != null && animalProductPerSeed > 0) {
            score += Math.abs(animalProduct - (seeds * animalProductPerSeed)) / Math.max(1, animalProduct);
        }
        return best == null || score < best.score ? { plots, score } : best;
    }, null)?.plots ?? candidates[0];
}

function yieldItemFieldHtml(selected = '') {
    return islandYieldFieldHtml({
        id: 'plantKey',
        selected,
        selectedOutputMode: state.animalOutputMode,
        className: 'farming-city-field'
    });
}

function selectedItemKey(container) {
    const field = container.querySelector('[data-plant-field="plantKey"]');
    return field?.querySelector('[data-plant-input]')?.value
        || field?.querySelector('.plant-icon-node.is-selected')?.dataset.pickerValue
        || '';
}

function setSelectedItem(container, value) {
    setPlantFieldValue(container, 'plantKey', value, state.animalOutputMode);
}

function syncAnimalProductField(container) {
    const field = container.querySelector('[data-animal-product-field]');
    const offspringField = container.querySelector('[data-animal-offspring-field]');
    if (!field) return;
    const animal = itemForKey(selectedItemKey(container), 'animal');
    const showProduct = state.animalOutputMode === 'product' && Boolean(animal?.productId);
    field.hidden = !showProduct;
    if (offspringField) offspringField.hidden = showProduct;
}

function productLogFormData(source, quantity, linkedLogId) {
    const fd = new FormData();
    for (const [key, value] of source.entries()) fd.append(key, value);
    fd.set('itemType', 'animalProduct');
    fd.set('seedsReturned', '0');
    fd.set('plantsHarvested', String(quantity));
    fd.set('linkedLogId', String(linkedLogId));
    return fd;
}

function syncAutomaticPlots(container) {
    if (!state.autoPlots) {
        return;
    }
    const plots = estimatedPlotForOutputs(container);
    if (plots != null) {
        applyPlotChoice(container, plots);
    }
}

function renderPlotPicker(selectedPlots) {
    const unit = metricCopy().input.toLocaleLowerCase('tr-TR');
    return `
        <div class="yield-plot-picker" role="radiogroup" aria-label="Plot"
            title="1 plot = ${unitsPerPlot()} ${escapeHtml(unit)}">
            ${PLOT_CHOICES.map((n) => {
                const pressed = n === selectedPlots;
                return `
                    <button type="button"
                        class="yield-plot-btn${pressed ? ' is-active' : ''}"
                        data-plots="${n}"
                        aria-pressed="${pressed ? 'true' : 'false'}"
                        title="${n} plot · ${n * unitsPerPlot()} ${escapeHtml(unit)}">
                        ${n}
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function fillForm(container, row) {
    const dateInput = container.querySelector('#yieldDate');
    const returned = container.querySelector('#seedsReturned');
    const harvested = container.querySelector('#plantsHarvested');
    const productHarvested = container.querySelector('[data-products-harvested]');
    const submit = container.querySelector('#yieldSubmit');
    const cancel = container.querySelector('#yieldCancelEdit');
    const remove = container.querySelector('#yieldDelete');

    if (row) {
        state.editingId = row.id;
        state.islandCity = row.islandCity;
        state.premium = row.premium === true;
        state.water = row.water === true;
        dateInput.value = row.date;
        setSelectedItem(container, rowItemKey(row));
        syncAnimalProductField(container);
        setPlantedFields(container, row.seedsPlanted ?? 1);
        returned.value = rowItemType(row) === 'animalProduct' ? '' : String(row.seedsReturned ?? 0);
        if (harvested) {
            harvested.value = rowItemType(row) === 'animalProduct' ? '' : String(row.plantsHarvested ?? 0);
        }
        if (productHarvested) {
            const linked = rowItemType(row) === 'animalProduct'
                ? row
                : getAll(TABLE).find((item) => String(item.linkedLogId) === String(row.id));
            productHarvested.value = linked ? String(linked.plantsHarvested ?? 0) : '';
        }
        submit.textContent = 'Güncelle';
        cancel.hidden = false;
        remove.hidden = false;
        setCityFieldValue(container, 'islandCity', state.islandCity);
        syncToggles(container);
    } else {
        state.editingId = null;
        dateInput.value = todayIso();
        setSelectedItem(container, '');
        syncAnimalProductField(container);
        setPlantedFields(container, unitsPerPlot());
        returned.value = '';
        if (harvested) harvested.value = '';
        if (productHarvested) productHarvested.value = '';
        submit.textContent = 'Kaydet';
        cancel.hidden = true;
        remove.hidden = true;
    }
    initFloatingLabels(container);
}

function syncToggles(container) {
    container.querySelectorAll('[data-premium]').forEach((button) => {
        const pressed = button.dataset.premium === (state.premium ? '1' : '0');
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
    container.querySelectorAll('[data-water]').forEach((button) => {
        const pressed = button.dataset.water === (state.water ? '1' : '0');
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

function renderLogTable(month) {
    const copy = metricCopy();
    const selectedItem = state.filteredPlantKey || null;
    const rows = rowsForMonth(month, {
        islandCity: state.islandCity,
        plantKey: selectedItem,
        itemType: state.filteredItemType,
        premium: state.premium,
        water: state.water
    });
    if (!rows.length) {
        const city = state.islandCity ? cityLabel(state.islandCity) : 'seçili ada';
        const plant = selectedItem ? ` · ${itemLabel(selectedItem, state.filteredItemType ?? undefined)}` : '';
        const context = `${state.premium ? 'Premium' : 'Free'} · ${state.water ? copy.on : copy.off}`;
        const periodLabel = LOG_PERIODS.find((period) => period.key === month)?.label || month;
        return `<div class="alert alert-info">${escapeHtml(periodLabel)} · ${escapeHtml(city)}${escapeHtml(plant)} · ${escapeHtml(context)} için kayıt yok.${logPeriodRange(month) ? ' Üst kartlar tüm ayların ortalamasını gösterir; tüm ayları seçerek geçmiş kayıtları görebilirsin.' : ' Soldan hasat sonucu ekle.'}</div>`;
    }
    const today = todayIso();
    const body = rows.map((row) => {
        const type = rowItemType(row);
        const key = rowItemKey(row);
        const plant = itemForKey(key, type);
        const iconId = itemIconId(plant, type);
        const unitsPerSlot = unitsPerSlotForRow(row);
        const estimatedSlots = estimatedSlotsForRow(row);
        const perSeed = row.seedsPlanted > 0 ? row.plantsHarvested / row.seedsPlanted : null;
        const seedRate = row.seedsPlanted > 0 ? row.seedsReturned / row.seedsPlanted : null;
        return `
            <tr data-id="${row.id}" class="${[String(state.editingId) === String(row.id) ? 'is-editing' : '', isOutlier(row) ? 'is-outlier' : '', row.date === today ? 'is-today' : ''].filter(Boolean).join(' ')}" style="--yield-day-color:${dayAccentColor(row.date)}">
                <td class="text-nowrap"${row.date === today ? ' title="Bugünün kaydı"' : ''}>${escapeHtml(formatDate(row.date))}</td>
                <td>${escapeHtml(cityLabel(row.islandCity))}</td>
                <td>
                    <span class="farming-item">
                        ${iconId ? itemIconHtml(iconId, { className: 'item-icon' }) : ''}
                        <span class="yield-log-item-name">${escapeHtml(itemLabel(key, type))}</span>
                    </span>
                </td>
                <td class="num">${row.seedsPlanted}</td>
                <td class="num" title="1 slot = ${unitsPerSlot}">${estimatedSlots ?? '—'}</td>
                <td class="num">${type === 'animalProduct' ? '—' : row.seedsReturned}</td>
                <td class="num">${row.plantsHarvested}</td>
                <td class="num">${formatQty(perSeed)}</td>
                <td class="num">${type === 'animalProduct' ? '—' : formatPct(seedRate)}</td>
                <td>${row.premium ? 'P' : 'F'}${row.water ? ` · ${state.yieldKind === 'plant' ? 'su' : 'odak'}` : ''}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive calc-table-wrap" data-calc-table>
            <table class="table table-striped farming-table log-table calc-table">
                <thead>
                    <tr>
                        <th>Gün</th>
                        <th>Ada</th>
                        <th>Çıktı</th>
                        <th class="num">${state.yieldKind === 'plant' ? 'Ekilen tohum' : 'Başlangıç yavrusu'}</th>
                        <th class="num">Tahmini slot</th>
                        <th class="num">${escapeHtml(copy.returned)}</th>
                        <th class="num">${state.yieldKind === 'plant' ? 'Hasat' : 'Yetişen hayvan'}</th>
                        <th class="num">Birim verim</th>
                        <th class="num">${state.yieldKind === 'plant' ? 'Tohum dönüşü' : 'Yavru dönüşü'}</th>
                        <th>Premium / ${escapeHtml(copy.mode)}</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function isOutlier(row) {
    return row.isOutlier === true || row.isOutlier === 'true';
}

function outlierGroupKey(row) {
    return [row.islandCity, rowItemType(row), rowItemKey(row), Boolean(row.premium), Boolean(row.water)].join('|');
}

function rowRates(row) {
    const planted = Number(row.seedsPlanted);
    if (!(planted > 0)) return null;
    return {
        seed: Number(row.seedsReturned || 0) / planted,
        harvest: Number(row.plantsHarvested || 0) / planted,
        planted
    };
}

function markYieldOutliers() {
    const groups = new Map();
    const cityRows = getAll(TABLE).filter((row) => row.islandCity === state.islandCity);
    for (const row of cityRows) {
        const key = outlierGroupKey(row);
        const rows = groups.get(key) ?? [];
        rows.push(row);
        groups.set(key, rows);
    }

    const markedIds = new Set();
    for (const rows of groups.values()) {
        const ordered = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id));
        const baseline = ordered.slice(0, 3).map(rowRates).filter(Boolean);
        const planted = baseline.reduce((total, row) => total + row.planted, 0);
        if (baseline.length < 3 || !(planted > 0)) continue;
        const seed = baseline.reduce((total, row) => total + (row.seed * row.planted), 0) / planted;
        const harvest = baseline.reduce((total, row) => total + (row.harvest * row.planted), 0) / planted;
        for (const row of ordered.slice(3)) {
            const rates = rowRates(row);
            if (!rates) continue;
            const seedOutlier = Math.abs(rates.seed - seed) >= OUTLIER_SEED_RATE_DELTA;
            const harvestOutlier = harvest > 0 && Math.abs(rates.harvest - harvest) / harvest >= OUTLIER_HARVEST_RATE_DELTA;
            if (seedOutlier || harvestOutlier) markedIds.add(String(row.id));
        }
    }

    replaceAllRows(TABLE, getAll(TABLE).map((row) => row.islandCity === state.islandCity
        ? { ...row, isOutlier: markedIds.has(String(row.id)) }
        : row));
    return markedIds.size;
}

function clearYieldOutliers() {
    replaceAllRows(TABLE, getAll(TABLE).map((row) => row.islandCity === state.islandCity
        ? { ...row, isOutlier: false }
        : row));
}

function tipAttr(label) {
    return ` title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"`;
}

function avgTag(text, { kind = '', tone = '', tip = '', slot = '' } = {}) {
    const classes = ['yield-avg-tag'];
    if (kind) {
        classes.push(`is-${kind}`);
    }
    if (tone) {
        classes.push(tone);
    }
    if (slot) {
        classes.push(`is-slot-${slot}`);
    }
    return `<span class="${classes.join(' ')}"${tip ? tipAttr(tip) : ''}>${escapeHtml(text)}</span>`;
}

function yieldDocumentIcon() {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M7 2H14.15C14.68 2 15.19 2.21 15.56 2.59L19.41 6.44C19.79 6.81 20 7.32 20 7.85V19C20 20.66 18.66 22 17 22H7C5.34 22 4 20.66 4 19V5C4 3.34 5.34 2 7 2Z M8.375 8.15H16.625A1.075 1.075 0 0 1 16.625 10.3H8.375A1.075 1.075 0 0 1 8.375 8.15Z M8.375 12.35H16.625A1.075 1.075 0 0 1 16.625 14.5H8.375A1.075 1.075 0 0 1 8.375 12.35Z M8.375 16.55H16.625A1.075 1.075 0 0 1 16.625 18.7H8.375A1.075 1.075 0 0 1 8.375 16.55Z"/></svg>`;
}

function renderAvgCard(plant, islandCity) {
    const avg = averageFor(plant, islandCity);
    const wikiYield = standardOutput(plant, islandCity);
    const wikiSeed = standardReturn(plant, islandCity);
    const bonus = state.yieldKind === 'plant' && hasCityBonus(plant, islandCity);
    const bonusPct = cityBonusPct();
    const active = avg && avg.avgPlantYield > 0;
    const thin = active && avg.n < 3;
    const name = `T${plant.tier} ${plant.label}`;
    const yieldRelativeDifference = active ? (avg.avgPlantYield - wikiYield) / wikiYield : null;
    const seedRelativeDifference = active && Number.isFinite(avg.avgSeedReturn) && Number.isFinite(wikiSeed)
        ? (avg.avgSeedReturn - wikiSeed) / wikiSeed
        : null;
    const confidence = active ? avg.confidence.level : 0;
    const copy = metricCopy();
    const iconId = itemIconId(plant);

    return `
        <article class="yield-avg-card${active ? '' : ' is-passive'}${thin ? ' is-thin' : ''}${state.filteredPlantKey === plant.key && state.filteredItemType === itemTypeForKind() ? ' is-selected' : ''} is-confidence-${confidence}" ${active ? tierAttribute(plant.tier) : ''}
            data-yield-item="${escapeHtml(plant.key)}" data-yield-item-type="${itemTypeForKind()}" role="button" tabindex="0" aria-pressed="${state.filteredPlantKey === plant.key && state.filteredItemType === itemTypeForKind() ? 'true' : 'false'}" ${tipAttr(`${name} — kayıtları filtrele`)}>
            <div class="yield-ref-stage">
                <span class="yield-avg-tier">T${plant.tier}</span>
                ${bonus ? `<span class="yield-avg-bonus-floating"${tipAttr('Şehir bonusu')}><img src="content/icons/yield-city.svg" alt="">${formatPct(bonusPct)}</span>` : ''}
                <div class="yield-avg-card-visual">${iconId
                    ? itemIconHtml(iconId, { size: 96, className: 'item-icon yield-avg-card-icon' })
                    : `<span class="yield-avg-card-icon-fallback">T${plant.tier}</span>`}</div>
                <h4 class="yield-avg-card-name">${escapeHtml(plant.label)}</h4>
            </div>
            <div class="yield-ref-deltas">
                <div class="yield-ref-delta ${deltaTone(seedRelativeDifference)}"${tipAttr('Varsayılan tohum dönüşüne göre yüzde farkı')}><strong data-yield-change="seed-relative">${active ? formatRelativeDifference(avg.avgSeedReturn, wikiSeed) : '—'}</strong><span>${active ? formatDeltaMagnitude(avg.avgSeedReturn - wikiSeed, { digits: 1, asPctPoints: true }) : ''}</span></div>
                <div class="yield-ref-delta ${deltaTone(yieldRelativeDifference)}"${tipAttr('Varsayılan ürüne göre yüzde farkı')}><strong data-yield-change="product-relative">${active ? formatRelativeDifference(avg.avgPlantYield, wikiYield) : '—'}</strong><span>${active ? formatDeltaMagnitude(avg.avgPlantYield - wikiYield, { digits: 1 }) : ''}</span></div>
            </div>
            <div class="yield-ref-values" aria-label="${escapeHtml(`${copy.outputShort} ve ${copy.returnShort} gerçek ve varsayılan değerleri`)}">
                <span class="yield-ref-value is-actual"><b data-yield-change="seed">${active ? formatPct(avg.avgSeedReturn) : '—'}</b><small>Gerçek</small></span><span class="yield-ref-value is-actual"><b data-yield-change="product">${active ? formatQty(avg.avgPlantYield) : '—'}</b><small>Gerçek</small></span>
                <span class="yield-ref-value is-default"><b>${formatPct(wikiSeed)}</b><small>Vars.</small></span><span class="yield-ref-value is-default"><b>${formatQty(wikiYield)}</b><small>Vars.</small></span>
            </div>
            <footer class="yield-card-footer"><span title="Ortalamaya giren kayıt sayısı">${yieldDocumentIcon()} <b>n=${active ? avg.n : 0}</b></span><span class="yield-confidence"${tipAttr(confidenceTooltip(active ? avg : null))}><i></i><i></i><i></i><i></i></span></footer>
        </article>
    `;
}

function renderAvgLegend(plant, islandCity) {
    const bonusPct = formatPct(cityBonusPct());
    const standardYield = standardOutput(plant, islandCity);
    const standardSeed = standardReturn(plant, islandCity);
    const copy = metricCopy();
    const exampleYield = standardYield * 0.99;
    const exampleSeed = Math.min(1, standardSeed * 1.05);
    const exampleYieldDifference = exampleYield - standardYield;
    const exampleSeedDifference = exampleSeed - standardSeed;
    const exampleYieldRelative = formatRelativeDifference(exampleYield, standardYield);
    const exampleSeedRelative = formatRelativeDifference(exampleSeed, standardSeed);
    const rows = [
        {
            sample: `<span class="yield-values-stack"><span>Gerçek <b>${formatQty(exampleYield)}</b></span><span>Vars. <b>${formatQty(standardYield)}</b></span></span>`,
            text: `${copy.outputShort}: Gerçek, kayıtlarındaki birim başına çıktı ortalaması; Vars., beklenen oyun değeri.`,
            formula: `${copy.output.toLocaleLowerCase('tr-TR')} ÷ ${copy.input.toLocaleLowerCase('tr-TR')}`
        },
        {
            sample: `<span class="yield-values-stack"><span>Gerçek <b>${formatPct(exampleSeed)}</b></span><span>Vars. <b>${formatPct(standardSeed)}</b></span></span>`,
            text: `${copy.returnShort}: Gerçek dönüş oranı; Vars., ${copy.mode.toLocaleLowerCase('tr-TR')} seçimine göre beklenen oran.`,
            formula: `${copy.returned.toLocaleLowerCase('tr-TR')} ÷ ${copy.input.toLocaleLowerCase('tr-TR')}`
        },
        {
            sample: `<span class="yield-delta-stack is-neg"><strong>${exampleYieldRelative}</strong><span>${formatSigned(exampleYieldDifference, { digits: 1 })}</span></span>`,
            text: 'Büyük yüzde, varsayılan değere göre farkın büyüklüğüdür. Yeşil daha yüksek, kırmızı daha düşük getiriyi gösterir. Altındaki sayı ürün/tohum farkıdır.',
            formula: '|gerçek − varsayılan| ÷ varsayılan'
        },
        {
            sample: `<span class="yield-delta-stack is-pos"><strong>${exampleSeedRelative}</strong><span>${formatSigned(exampleSeedDifference, { asPctPoints: true })}</span></span>`,
            text: `${copy.returnShort} farkında pp, yüzde puanı demektir. ${formatPct(exampleSeed)} ile ${formatPct(standardSeed)} arasındaki fark ${formatSigned(exampleSeedDifference, { asPctPoints: true })}; varsayılana göre ${exampleSeedRelative} artıştır.`,
            formula: `${formatPct(exampleSeed)} − ${formatPct(standardSeed)} = ${formatSigned(exampleSeedDifference, { asPctPoints: true })}`
        },
        ...(state.yieldKind === 'plant' ? [{
            sample: avgTag(`+${bonusPct}`, { kind: 'bonus', tip: 'Şehir bonusu' }),
            text: 'Sağ üstteki şehir bonusu, seçili adada bu bitkinin ek ürün verdiğini gösterir. Varsayılan ürün değerine dahildir.',
            formula: `+${bonusPct}`
        }] : []),
        {
            sample: avgTag('n=3', { kind: 'n', tip: 'Kayıt sayısı' }),
            text: `n kayıt sayısıdır; güven noktaları örnek miktarını değil, aynı ürün, şehir, Premium ve ${copy.mode.toLocaleLowerCase("tr-TR")} grubundaki ağırlıklı ortalamanın istatistiksel stabilitesini gösterir. Aykırı kayıtlar hariç, bütün kayıtlar yeniden örneklenerek %95 bootstrap güven aralığı hesaplanır. Bağıl yarı genişlik >%10: 1, ≤%10: 2, ≤%5: 3, ≤%2: 4 nokta. İki kayıttan az veri: 0; 4 nokta için en az 3 bağımsız kayıt gerekir. 4 nokta, mevcut veriye göre yaklaşık ±%2 bandı ve makul ek verinin sonucu anlamlı ölçüde değiştirme ihtimalinin düşük olduğu seviyedir.`,
            formula: 'Bağıl hata = ((üst sınır − alt sınır) / 2) / ağırlıklı ortalama'
        },
        {
            sample: '<span class="yield-delta-stack"><strong>—</strong></span>',
            text: 'Soluk kartlarda kullanılabilir hasat verisi yoktur; gerçek değer ve fark yerine çizgi gösterilir. Varsayılan değerler görünmeye devam eder.',
            formula: 'henüz veri yok'
        }
    ];

    return `
        <div class="yield-avg-legend" aria-label="Ortalama etiketleri">
            ${rows.map((row) => `
                <div class="yield-avg-legend-row">
                    <div class="yield-avg-legend-sample">${row.sample}</div>
                    <p class="yield-avg-legend-copy">${escapeHtml(row.text)}</p>
                    <span class="yield-avg-legend-formula">${escapeHtml(row.formula)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderCityComparison() {
    if (!state.filteredPlantKey) {
        return '';
    }
    const itemType = state.filteredItemType || itemTypeForKind();
    const isProduct = itemType === 'animalProduct';
    const plant = itemForKey(state.filteredPlantKey, itemType);
    if (!plant) {
        return '';
    }
    const cities = comparisonCities();
    return `
        <section class="yield-city-comparison" aria-label="Şehir karşılaştırması">
            <div class="yield-city-comparison-head">
                <div>
                    <h3 class="island-planner-subhead yield-city-comparison-title">
                        ${itemIconId(plant, itemType) ? itemIconHtml(itemIconId(plant, itemType), { size: 40, className: 'item-icon' }) : ''}
                        <span>${escapeHtml(itemLabel(plant.key, itemType))}</span>
                        <span class="yield-city-comparison-tier" ${tierAttribute(plant.tier)}>T${plant.tier}</span>
                    </h3>
                </div>
                <p>Seçili Premium / ${escapeHtml(metricCopy().mode)} ayarındaki tüm ada şehirleri · Tüm ayların ortalaması.</p>
            </div>
            <div class="yield-city-comparison-grid">
                ${cities.map((city) => {
                    const cityName = city.marketApiName;
                    const avg = averageFor(plant, cityName, itemType);
                    const standardYield = isProduct ? standardAnimalProductOutput(plant, cityName) : standardOutput(plant, cityName);
                    const standardSeed = standardReturn(plant, cityName);
                    const hasData = avg && avg.avgPlantYield > 0;
                    const yieldDelta = hasData ? (avg.avgPlantYield - standardYield) / standardYield : null;
                    const seedDelta = hasData && Number.isFinite(avg.avgSeedReturn) && Number.isFinite(standardSeed)
                        ? avg.avgSeedReturn - standardSeed
                        : null;
                    const bonus = state.yieldKind === 'plant' && hasCityBonus(plant, cityName);
                    return `
                        <article class="yield-city-card${cityName === state.islandCity ? ' is-current' : ''}${hasData ? '' : ' is-empty'}"
                            style="--yield-city-color:${escapeHtml(cityColorHex(city))}">
                            <header>
                                <strong>${escapeHtml(cityLabel(cityName))}</strong>
                                ${bonus ? `<span title="Şehir üretim bonusu">+${formatPct(cityBonusPct())}</span>` : ''}
                            </header>
                            <div class="yield-city-card-metric">
                                <span>${escapeHtml(isProduct ? 'Ürün' : metricCopy().outputShort)}</span>
                                <b>${hasData ? formatQty(avg.avgPlantYield) : '—'}</b>
                                <small>${hasData ? `${formatSigned(avg.avgPlantYield - standardYield, { digits: 1 })} · ${formatRelativeDifference(avg.avgPlantYield, standardYield)}` : `Vars. ${formatQty(standardYield)}`}</small>
                            </div>
                            ${isProduct ? '' : `<div class="yield-city-card-metric">
                                <span>${escapeHtml(metricCopy().returnShort)}</span>
                                <b>${hasData ? formatPct(avg.avgSeedReturn) : '—'}</b>
                                <small>${hasData ? formatSigned(seedDelta, { asPctPoints: true }) : `Vars. ${formatPct(standardSeed)}`}</small>
                            </div>`}
                            <footer>${hasData ? `n=${avg.n} kayıt` : 'Kayıt yok'}</footer>
                        </article>
                    `;
                }).join('')}
            </div>
        </section>
    `;
}

function renderAnimalProductAvgCard(animal, islandCity) {
    const avg = averageFor(animal, islandCity, 'animalProduct');
    const standard = standardAnimalProductOutput(animal, islandCity);
    const active = avg && avg.avgPlantYield > 0;
    const thin = active && avg.n < 3;
    const relative = active ? (avg.avgPlantYield - standard) / standard : null;
    const confidence = active ? avg.confidence.level : 0;

    return `
        <article class="yield-avg-card${active ? '' : ' is-passive'}${thin ? ' is-thin' : ''}${state.filteredPlantKey === animal.key && state.filteredItemType === 'animalProduct' ? ' is-selected' : ''} is-confidence-${confidence}" ${active ? tierAttribute(animal.tier) : ''}
            data-yield-item="${escapeHtml(animal.key)}" data-yield-item-type="animalProduct" role="button" tabindex="0" aria-pressed="${state.filteredPlantKey === animal.key && state.filteredItemType === 'animalProduct' ? 'true' : 'false'}" ${tipAttr(`T${animal.tier} ${itemLabel(animal.key, 'animalProduct')} — kayıtları filtrele`)}>
            <div class="yield-ref-stage">
                <span class="yield-avg-tier">T${animal.tier}</span>
                <div class="yield-avg-card-visual">${itemIconHtml(animal.productId, { size: 96, className: 'item-icon yield-avg-card-icon' })}</div>
                <h4 class="yield-avg-card-name">${escapeHtml(itemLabel(animal.key, 'animalProduct'))}</h4>
            </div>
            <div class="yield-ref-deltas is-single"><div class="yield-ref-delta ${deltaTone(relative)}"${tipAttr('Varsayılan ürüne göre yüzde farkı')}><strong>${active ? formatRelativeDifference(avg.avgPlantYield, standard) : '—'}</strong><span>${active ? formatDeltaMagnitude(avg.avgPlantYield - standard, { digits: 1 }) : ''}</span></div></div>
            <div class="yield-ref-values is-single" aria-label="Ürün gerçek ve varsayılan değeri"><span class="yield-ref-value is-actual"><b>${active ? formatQty(avg.avgPlantYield) : '—'}</b><small>Gerçek</small></span><span class="yield-ref-value is-default"><b>${formatQty(standard)}</b><small>Vars.</small></span></div>
            <footer class="yield-card-footer"><span title="Ortalamaya giren kayıt sayısı">${yieldDocumentIcon()} <b>n=${active ? avg.n : 0}</b></span><span class="yield-confidence"${tipAttr(confidenceTooltip(active ? avg : null))}><i></i><i></i><i></i><i></i></span></footer>
        </article>
    `;
}

function averageGroups() {
    const plants = itemsForKind();
    return outputGroupsForKind(state.yieldKind)
        .map((group) => ({
            id: group.id,
            title: group.tabLabel ?? group.label,
            items: plants.filter(group.filter),
            render: group.itemType === 'animalProduct' ? renderAnimalProductAvgCard : renderAvgCard,
            itemType: group.itemType
        }));
}

function groupIdForItem(itemKey, itemType = itemTypeForKind()) {
    const groups = averageGroups();
    return groups.find((group) => group.itemType === itemType && group.items.some((item) => item.key === itemKey))?.id ?? null;
}

function openAverageGroup(itemKey, itemType) {
    const groupId = groupIdForItem(itemKey, itemType);
    if (groupId) {
        state.activeAverageGroup = groupId;
    }
}

function yieldGroupIcon(groupId) {
    const icons = {
        crop: '<path d="M12 20V4M12 7c-3 0-5 2-5 5 3 0 5-2 5-5ZM12 11c3 0 5 2 5 5-3 0-5-2-5-5Z"/>',
        herb: '<path d="M5 19c7 0 12-5 12-12-7 0-12 5-12 12Zm1-1c2-4 5-7 9-9"/>',
        livestock: '<path d="M5 15v-4l2-2 2 2h6l2-2 2 2v4l-2 2h-1v3M8 17v3M12 11v2"/>',
        horse: '<path d="M8 20v-5l-2-3 2-5 4 2 4-2 2 5-2 3v5M9 9l3 3 3-3M10 20h4"/>',
        ox: '<path d="M5 10 3 7m16 3 2-3M5 10c0 6 3 9 7 9s7-3 7-9l-3-2H8l-3 2Zm5 4h4"/>',
        kennel: '<path d="M8 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0Zm8-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm4 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 11c-3 0-5 3-5 6 0 2 2 3 5 3s5-1 5-3c0-3-2-6-5-6Z"/>',
        'faction-t5': '<path d="m12 3 2.4 5 5.6.7-4.1 3.9 1 5.5-4.9-2.7-4.9 2.7 1-5.5L4 8.7 9.6 8 12 3Z"/>',
        'faction-t8': '<path d="m12 3 2.4 5 5.6.7-4.1 3.9 1 5.5-4.9-2.7-4.9 2.7 1-5.5L4 8.7 9.6 8 12 3Z"/><path d="M12 7v5l3 2"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[groupId] ?? icons.crop}</svg>`;
}

function yieldTabArrow(direction) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${direction === 'previous' ? 'M18 15 12 9l-6 6' : 'M18 9 12 15 6 9'}"/></svg>`;
}

function renderTierMatrix(group, islandCity) {
    const groupTiers = [...new Set(group.items.map((item) => Number(item.tier)))];
    const isSingleTier = groupTiers.length === 1;
    const tiers = isSingleTier ? groupTiers : Array.from({ length: 8 }, (_, index) => index + 1);
    return `
        <div class="yield-tier-matrix${isSingleTier ? ' is-single-tier' : ''}" aria-label="Tier bazında ada çıktıları">
            ${tiers.map((tier) => {
                const entries = group.items
                    .filter((item) => Number(item.tier) === tier)
                    .map((item) => `
                        <section class="yield-tier-list" data-kind="${escapeHtml(group.id)}">
                            ${group.render(item, islandCity)}
                        </section>
                    `);
                return `
                    <section class="yield-tier-column" data-tier="${tier}">
                        <div class="yield-tier-column-content">${entries.join('')}</div>
                    </section>
                `;
            }).join('')}
        </div>
    `;
}

function renderAverages() {
    const islandCity = state.islandCity;
    if (!islandCity) {
        return `<p class="farming-note">Ortalamalar için ada şehri seç.</p>`;
    }

    const plants = itemsForKind();
    const groups = averageGroups();
    const activeGroup = groups.find((group) => group.id === state.activeAverageGroup) ?? groups[0];
    state.activeAverageGroup = activeGroup?.id ?? null;
    const legendPlant = plants.find((plant) => plant.key === state.filteredPlantKey)
        ?? plants.find((plant) => state.yieldKind === 'plant' && hasCityBonus(plant, islandCity))
        ?? plants[0];

    return `
        <section class="yield-averages" data-yield-averages aria-label="Ortalamalar">
            <div class="yield-averages-layout">
                <nav class="yield-group-tabs" aria-label="Ürün grupları">
                    <button type="button" class="yield-group-action" data-yield-group-previous aria-label="Önceki grup" title="Önceki grup" ${groups.length < 2 ? 'disabled' : ''}>${yieldTabArrow('previous')}</button>
                    <div class="yield-group-tab-list" role="tablist">
                        ${groups.map((group) => `<button type="button" class="yield-group-tab${group.id === activeGroup?.id ? ' is-active' : ''}" data-yield-group="${escapeHtml(group.id)}" role="tab" aria-label="${escapeHtml(group.title)}" aria-selected="${group.id === activeGroup?.id ? 'true' : 'false'}" title="${escapeHtml(group.title)}">${yieldGroupIcon(group.id)}</button>`).join('')}
                    </div>
                    <button type="button" class="yield-group-action" data-yield-group-next aria-label="Sonraki grup" title="Sonraki grup" ${groups.length < 2 ? 'disabled' : ''}>${yieldTabArrow('next')}</button>
                </nav>
                <div class="yield-group-panel" role="tabpanel" aria-label="${escapeHtml(activeGroup?.title ?? '')}">
                    ${activeGroup ? renderTierMatrix(activeGroup, islandCity) : ''}
                </div>
            </div>
        </section>
        ${legendPlant ? renderAvgLegend(legendPlant, islandCity) : ''}
    `;
}

function captureAverage(plantKey) {
    const plant = itemForKey(plantKey);
    const avg = averageFor(plant);
    const standardYield = standardOutput(plant);
    const standardSeed = standardReturn(plant);
    const active = Boolean(avg && avg.avgPlantYield > 0);
    const product = active ? avg.avgPlantYield : null;
    const seed = active && Number.isFinite(avg.avgSeedReturn) ? avg.avgSeedReturn : null;
    return {
        plantKey,
        product,
        productRelative: product != null ? (product - standardYield) / standardYield : null,
        seed,
        seedRelative: seed != null && Number.isFinite(standardSeed) && standardSeed !== 0
            ? (seed - standardSeed) / standardSeed
            : null
    };
}

function changeTone(before, after) {
    if (!Number.isFinite(before) && Number.isFinite(after)) {
        return 'is-up';
    }
    if (Number.isFinite(before) && !Number.isFinite(after)) {
        return 'is-down';
    }
    if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) {
        return '';
    }
    return after > before ? 'is-up' : 'is-down';
}

function showAverageChange(container, before, after) {
    if (!before || !after || before.plantKey !== after.plantKey) {
        return;
    }
    const card = [...container.querySelectorAll('[data-yield-item]')]
        .find((item) => item.dataset.yieldItem === after.plantKey && item.dataset.yieldItemType === itemTypeForKind());
    if (!card) {
        return;
    }

    const productTone = changeTone(before.product, after.product);
    const seedTone = changeTone(before.seed, after.seed);
    const changes = [
        {
            label: 'Ürün yüzde farkı',
            target: 'product-relative',
            before: formatRelativeRatio(before.productRelative),
            after: formatRelativeRatio(after.productRelative),
            tone: productTone
        },
        {
            label: 'Ürün',
            target: 'product',
            before: formatQty(before.product),
            after: formatQty(after.product),
            tone: productTone
        },
        {
            label: 'Tohum yüzde farkı',
            target: 'seed-relative',
            before: formatRelativeRatio(before.seedRelative),
            after: formatRelativeRatio(after.seedRelative),
            tone: seedTone
        },
        {
            label: 'Tohum',
            target: 'seed',
            before: formatPct(before.seed),
            after: formatPct(after.seed),
            tone: seedTone
        }
    ].filter((change) => change.before !== change.after);
    if (!changes.length) {
        return;
    }

    changes.forEach((change) => {
        const target = card.querySelector(`[data-yield-change="${change.target}"]`);
        if (!target) {
            return;
        }
        const badge = document.createElement('i');
        badge.className = `yield-value-change${change.tone ? ` ${change.tone}` : ''}`;
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-live', 'polite');
        badge.setAttribute('aria-label', `${change.label} önceki değer: ${change.before}. Yeni değer: ${change.after}`);
        badge.textContent = change.before;
        const showBadge = () => {
            if (!target.isConnected) {
                return;
            }
            target.append(badge);
            window.setTimeout(() => badge.classList.add('is-leaving'), CHANGE_BADGE_VISIBLE_MS);
            window.setTimeout(() => badge.remove(), CHANGE_BADGE_VISIBLE_MS + CHANGE_BADGE_EXIT_MS);
        };
        showBadge();
    });

    card.classList.add('is-just-updated');
    window.setTimeout(() => card.classList.remove('is-just-updated'), 950);
}

function refreshResult(container) {
    refreshEntrySummary(container);
    const host = container.querySelector('.tool-split-result');
    if (!host) {
        return;
    }
    host.innerHTML = `
        ${renderAverages()}
        ${renderCityComparison()}
        <div class="yield-log-section">
            <div class="yield-period-controls">
            <div class="form-floating farming-city-field yield-month-field">
                <select class="form-select is-filled" id="yieldMonth" data-yield-month>
                    ${LOG_PERIODS.map((period) => `<option value="${period.key}"${state.month === period.key ? ' selected' : ''}>${period.label}</option>`).join('')}
                    ${[...new Set(getAll(TABLE).map((row) => toYearMonth(row.date)).filter(Boolean))].sort().reverse().map((month) => `<option value="${escapeHtml(month)}"${state.month === month ? ' selected' : ''}>${escapeHtml(month)}</option>`).join('')}
                </select>
                <label for="yieldMonth">Dönem</label>
            </div>
            <div class="yield-period-presets" role="group" aria-label="Hızlı dönem seçimi">
                ${LOG_PERIODS.map((period) => `<button type="button" class="btn btn-sm ${state.month === period.key ? 'btn-primary' : 'btn-outline-secondary'}" data-yield-period="${period.key}" aria-pressed="${state.month === period.key}">${period.label}</button>`).join('')}
            </div>
            </div>
            <div class="yield-log-heading">
                <h3 class="island-planner-subhead">Kayıtlar${state.filteredPlantKey ? ` · ${escapeHtml(itemLabel(state.filteredPlantKey, state.filteredItemType ?? undefined))}` : ''}</h3>
                <button type="button" class="btn btn-sm btn-outline-warning" data-yield-outliers-mark>Şüpheli kayıtları işaretle</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-yield-outliers-clear>İşaretleri kaldır</button>
                ${state.filteredPlantKey ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-clear-yield-filter>Filtreyi kaldır</button>' : ''}
            </div>
            <div id="yieldLog">${renderLogTable(state.month)}</div>
            <p class="farming-note" data-page-info>Veri yoksa araçlar standart oyun değerini kullanır. Kullanıcı ortalaması bulunduğunda aynı bonus ikinci kez uygulanmaz.</p>
        </div>
    `;
    bindResult(container);
    bindCalcSticky(container);
    initFloatingLabels(container);
}

function bindResult(container) {
    const setPlantFilter = (plantKey, itemType) => {
        const isCurrent = state.filteredPlantKey === plantKey && state.filteredItemType === itemType;
        state.filteredPlantKey = isCurrent ? null : plantKey;
        state.filteredItemType = isCurrent ? null : itemType;
        refreshResult(container);
        container.querySelector('.yield-log-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    container.querySelectorAll('[data-yield-item]').forEach((card) => {
        card.addEventListener('click', () => setPlantFilter(card.dataset.yieldItem, card.dataset.yieldItemType));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPlantFilter(card.dataset.yieldItem, card.dataset.yieldItemType);
            }
        });
    });
    container.querySelectorAll('[data-yield-group]').forEach((button) => {
        button.addEventListener('click', () => {
            state.activeAverageGroup = button.dataset.yieldGroup;
            refreshResult(container);
        });
    });
    const moveAverageGroup = (direction) => {
        const groups = averageGroups();
        const currentIndex = Math.max(0, groups.findIndex((group) => group.id === state.activeAverageGroup));
        state.activeAverageGroup = groups[(currentIndex + direction + groups.length) % groups.length]?.id ?? null;
        refreshResult(container);
    };
    container.querySelector('[data-yield-group-previous]')?.addEventListener('click', () => moveAverageGroup(-1));
    container.querySelector('[data-yield-group-next]')?.addEventListener('click', () => moveAverageGroup(1));
    container.querySelector('[data-clear-yield-filter]')?.addEventListener('click', () => {
        state.filteredPlantKey = null;
        state.filteredItemType = null;
        refreshResult(container);
    });
    container.querySelector('[data-yield-outliers-mark]')?.addEventListener('click', () => {
        const count = markYieldOutliers();
        refreshResult(container);
        showToast(count ? `${count} kayıt seçili ada şehri için şüpheli olarak işaretlendi ve ortalamadan çıkarıldı.` : 'Seçili ada şehrinde son üç kayda göre aykırı kayıt bulunmadı.');
    });
    container.querySelector('[data-yield-outliers-clear]')?.addEventListener('click', () => {
        clearYieldOutliers();
        refreshResult(container);
        showToast('Seçili ada şehrindeki şüpheli kayıt işaretleri kaldırıldı; kayıtlar yeniden ortalamaya dahil edildi.');
    });
    container.querySelector('[data-yield-month]')?.addEventListener('change', (event) => {
        state.month = event.target.value;
        refreshResult(container);
    });
    container.querySelectorAll('[data-yield-period]').forEach((button) => {
        button.addEventListener('click', () => {
            state.month = button.dataset.yieldPeriod;
            refreshResult(container);
        });
    });
    bindLogTableRows(container, (id) => {
        const clicked = getAll(TABLE).find((item) => String(item.id) === id);
        const row = clicked?.itemType === 'animalProduct'
            ? getAll(TABLE).find((item) => String(item.id) === String(clicked.linkedLogId)) ?? clicked
            : clicked;
        if (!row) {
            return;
        }
        const nextKind = kindForIslandYieldKey(rowItemKey(row)) || state.yieldKind;
        const kindChanged = nextKind !== state.yieldKind;
        state.yieldKind = nextKind;
        state.animalOutputMode = rowItemType(clicked) === 'animalProduct' ? 'product' : 'offspring';
        openAverageGroup(rowItemKey(clicked), rowItemType(clicked));
        if (kindChanged) {
            renderPage(container);
        }
        fillForm(container, row);
        refreshResult(container);
    });
}

function confirmYieldEntry(container, warnings) {
    const dialog = container.querySelector('[data-yield-entry-warning]');
    dialog.querySelector('[data-yield-entry-warning-text]').textContent = `Kontrol et: ${warnings.join('; ')}.`;
    dialog.returnValue = '';
    return new Promise((resolve) => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'save'), { once: true });
        dialog.showModal();
    });
}

async function saveEntry(container) {
    if (container.querySelector('[data-yield-entry-warning]')?.open) return;
    const date = container.querySelector('#yieldDate')?.value;
    const plantKey = selectedItemKey(container);
    const seedsPlanted = Number(container.querySelector('#seedsPlanted')?.value);
    const returnedInput = container.querySelector('#seedsReturned');
    const harvestedInput = container.querySelector('#plantsHarvested');
    const seedsReturned = parseQuantityExpression(returnedInput?.value);
    // Pasture and kennel always grow one animal for each baby put in. Keep the
    // persisted value for existing yield consumers, but derive it from input.
    const plantsHarvested = state.yieldKind === 'plant'
        ? parseQuantityExpression(harvestedInput?.value)
        : seedsPlanted;
    const productInput = container.querySelector('[data-products-harvested]');
    const productsHarvested = productInput?.value.trim() ? parseQuantityExpression(productInput.value) : null;
    const productOnly = state.yieldKind === 'pasture' && state.animalOutputMode === 'product' && productsHarvested != null;

    if (!date || !plantKey || !state.islandCity) {
        showToast(`Tarih, ada ve ${state.yieldKind === 'plant' ? 'bitki' : 'hayvan'} zorunlu.`, { kind: 'error' });
        return;
    }
    if (!(seedsPlanted > 0) || (!productOnly && (!(seedsReturned >= 0) || !(plantsHarvested >= 0)))) {
        showToast('Girdi / dönüş / çıktı sayılarını kontrol et.', { kind: 'error' });
        return;
    }
    if (productsHarvested != null && !(productsHarvested >= 0)) {
        showToast('Üretilen ürün sayısını kontrol et.', { kind: 'error' });
        return;
    }
    const item = itemForKey(plantKey);
    const entry = {
        id: state.editingId, date, islandCity: state.islandCity, itemKey: plantKey,
        itemType: productOnly ? 'animalProduct' : itemTypeForKind(),
        premium: state.premium, water: state.water, seedsPlanted,
        seedsReturned: productOnly ? 0 : seedsReturned,
        plantsHarvested: productOnly ? productsHarvested : plantsHarvested
    };
    const productOutput = (city) => standardAnimalProductOutput(item, city);
    const oppositeCity = state.cities.find((city) => hasCityBonus(item, city.marketApiName) !== hasCityBonus(item, state.islandCity))?.marketApiName;
    const options = {
        rows: getAll(TABLE), today: todayIso(),
        expectedOutput: productOnly ? productOutput(state.islandCity) : standardOutput(item),
        expectedReturn: standardReturn(item),
        alternateReturn: state.yieldKind === 'plant' ? standardSeedReturn(item, !state.water) : standardAnimalReturn(item, { focus: !state.water }),
        alternatePremiumOutput: state.yieldKind === 'plant' ? standardPlantYield(item, state.islandCity, !state.premium) : null,
        alternateCityOutput: oppositeCity ? (productOnly ? productOutput(oppositeCity) : standardOutput(item, oppositeCity)) : null,
        modeLabel: state.yieldKind === 'plant' ? 'sulama' : 'odak'
    };
    const warnings = entryWarnings(entry, options);
    if (!productOnly && productsHarvested != null && state.yieldKind === 'pasture') {
        warnings.push(...entryWarnings({ ...entry, itemType: 'animalProduct', seedsReturned: 0, plantsHarvested: productsHarvested }, {
            ...options, expectedOutput: productOutput(state.islandCity),
            alternateCityOutput: oppositeCity ? productOutput(oppositeCity) : null
        }));
    }
    if (warnings.length && !await confirmYieldEntry(container, [...new Set(warnings)])) return;
    if (!productOnly) {
        returnedInput.value = String(seedsReturned);
        if (harvestedInput) harvestedInput.value = String(plantsHarvested);
    }

    const fd = new FormData();
    fd.set('date', date);
    fd.set('islandCity', state.islandCity);
    fd.set('itemType', productOnly ? 'animalProduct' : itemTypeForKind());
    fd.set('itemKey', plantKey);
    fd.set('plantKey', plantKey);
    fd.set('seedsPlanted', String(seedsPlanted));
    fd.set('seedsReturned', String(productOnly ? 0 : seedsReturned));
    fd.set('plantsHarvested', String(productOnly ? productsHarvested : plantsHarvested));
    if (state.premium) {
        fd.set('premium', 'on');
    }
    if (state.water) {
        fd.set('water', 'on');
    }
    const editedRow = state.editingId
        ? getAll(TABLE).find((row) => String(row.id) === String(state.editingId))
        : null;
    if (editedRow && isOutlier(editedRow)) {
        fd.set('isOutlier', 'on');
    }

    try {
        const averageBeforeSave = captureAverage(plantKey);
        if (state.editingId) {
            updateRow(TABLE, state.editingId, fd);
            if (productOnly) {
                showToast('Ürün kaydı güncellendi.');
                fillForm(container, null);
                refreshResult(container);
                return;
            }
            const linked = getAll(TABLE).find((item) => String(item.linkedLogId) === String(state.editingId));
            if (productsHarvested != null && state.yieldKind === 'pasture') {
                const productFd = productLogFormData(fd, productsHarvested, state.editingId);
                if (linked) updateRow(TABLE, linked.id, productFd);
                else createRow(TABLE, productFd);
            } else if (linked) {
                deleteRow(TABLE, linked.id);
            }
            showToast('Güncellendi.');
        } else {
            if (productOnly) {
                createRow(TABLE, fd);
                showToast('Ürün kaydedildi.');
                fillForm(container, null);
                refreshResult(container);
                return;
            }
            const created = createRow(TABLE, fd);
            if (productsHarvested != null && state.yieldKind === 'pasture') {
                const productFd = productLogFormData(fd, productsHarvested, created.id);
                createRow(TABLE, productFd);
            }
            showToast('Kaydedildi.');
        }
        fillForm(container, null);
        refreshResult(container);
        showAverageChange(container, averageBeforeSave, captureAverage(plantKey));
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Kayıt başarısız.', { kind: 'error' });
    }
}

function renderPage(container) {
    const copy = metricCopy();
    const sectionSelector = '[data-plant-field] details[data-picker-kind]';
    const openSections = new Map(Array.from(container.querySelectorAll(sectionSelector),
        (section) => [section.dataset.pickerKind, section.open]));
    container.innerHTML = toolPageHtml({
        key: 'island-yields',
        head: `<section class="page-head" data-page-head="island-yields">
            <h1>Ada Çıktı</h1>
            <p>Tarla, pasture ve kennel için gerçek dönüş / çıktı değerlerini kaydet. Ortalamalar hesaplama araçlarında kullanılır.</p>
        </section>`,
        controls: `
                    <form id="yieldForm" class="farming-toolbar island-planner-toolbar">
                    <div class="yield-mode-toggles">
                    ${renderToggle('Premium', [
                        { id: true, value: '1', label: 'Premium', icon: 'premium' },
                        { id: false, value: '0', label: 'Free', icon: 'free' }
                    ], 'premium', state.premium)}
                    ${renderToggle(copy.mode, [
                        { id: true, value: '1', label: copy.on, icon: state.yieldKind === 'plant' ? 'water' : 'focus' },
                        { id: false, value: '0', label: copy.off, icon: state.yieldKind === 'plant' ? 'dry' : 'noFocus' }
                    ], 'water', state.water)}
                    </div>
                    ${cityFieldHtml({
                        id: 'islandCity',
                        label: 'Ada şehri',
                        selected: state.islandCity,
                        cities: state.cities,
                        decorate: cityIslandDecorate
                    })}
                    <div class="form-floating farming-city-field">
                        <input class="form-control is-filled" type="date" id="yieldDate" name="date" required>
                        <label for="yieldDate">Tarih</label>
                    </div>
                    ${yieldItemFieldHtml(state.filteredPlantKey || '')}
                    <div class="yield-planted-pair" title="1 plot = ${unitsPerPlot()} ${escapeHtml(copy.input.toLocaleLowerCase('tr-TR'))}">
                        ${renderPlotPicker(state.plotsSelected ?? 1)}
                        <div class="form-floating farming-city-field yield-seeds-field">
                            <input class="form-control is-filled" type="number" min="1" step="1" id="seedsPlanted" name="seedsPlanted" value="${unitsPerPlot()}" required>
                            <label for="seedsPlanted">${escapeHtml(copy.input)}</label>
                        </div>
                    </div>
                    <label class="form-check yield-auto-plots-check">
                        <input class="form-check-input" type="checkbox" data-yield-auto-plots ${state.autoPlots ? 'checked' : ''}>
                        <span class="form-check-label">Otomatik parsel tahmini</span>
                    </label>
                    <div class="yield-harvest-pair">
                        <div class="form-floating farming-city-field" data-animal-offspring-field>
                            <input class="form-control" type="text" inputmode="decimal" autocomplete="off" id="seedsReturned" name="seedsReturned" placeholder="10-8" ${state.yieldKind === 'pasture' ? '' : 'required'}>
                            <label for="seedsReturned">${escapeHtml(copy.returned)}</label>
                        </div>
                        ${state.yieldKind === 'plant' ? `
                            <div class="form-floating farming-city-field">
                                <input class="form-control" type="text" inputmode="decimal" autocomplete="off" id="plantsHarvested" name="plantsHarvested" placeholder="10-8" required>
                                <label for="plantsHarvested">${escapeHtml(copy.output)}</label>
                            </div>
                        ` : ''}
                        ${state.yieldKind === 'pasture' ? `
                            <div class="form-floating farming-city-field" data-animal-product-field hidden>
                                <input class="form-control" type="text" inputmode="decimal" autocomplete="off" data-products-harvested placeholder="18">
                                <label>Üretilen ürün</label>
                            </div>
                        ` : ''}
                    </div>
                    <div class="form-actions form-actions--inline">
                        <button type="submit" class="btn btn-primary" id="yieldSubmit">Kaydet</button>
                        <button type="button" class="btn btn-outline-secondary" id="yieldCancelEdit" hidden>Vazgeç</button>
                        <button type="button" class="btn btn-outline-danger" id="yieldDelete" hidden>Sil</button>
                    </div>
                    </form>
                `,
        summary: `<div data-yield-entry-summary></div>`,
        result: ``,
        overlays: `<dialog class="app-dialog app-warning-dialog" data-yield-slot-warning aria-labelledby="yield-slot-warning-title">
            <button type="button" class="app-dialog-close" aria-label="Kapat" data-yield-slot-warning-close></button>
            <div class="app-warning-dialog-sheet">
                <h2 id="yield-slot-warning-title">Bugünkü slot sayısı uyuşmuyor</h2>
                <p>Şehir değiştirmeden önce kayıtları kontrol et.</p>
                <ul class="app-warning-dialog-list" data-yield-slot-warning-details></ul>
                <div class="form-actions"><button type="button" class="btn btn-primary" data-yield-slot-warning-close>Tamam</button></div>
            </div>
        </dialog>
        <dialog class="app-dialog app-warning-dialog" data-yield-entry-warning aria-labelledby="yield-entry-warning-title" aria-describedby="yield-entry-warning-text">
            <button type="button" class="app-dialog-close" aria-label="Kapat" data-yield-entry-warning-close></button>
            <div class="app-warning-dialog-sheet">
                <h2 id="yield-entry-warning-title">Kaydı kontrol edelim</h2>
                <p id="yield-entry-warning-text" data-yield-entry-warning-text></p>
                <div class="form-actions form-actions--inline">
                    <button type="button" class="btn btn-outline-secondary" data-yield-entry-warning-close autofocus>Bir düşüneyim</button>
                    <button type="button" class="btn btn-primary" data-yield-entry-warning-save>Böyle kaydet</button>
                </div>
            </div>
        </dialog>`,
    });
    container.querySelectorAll(sectionSelector).forEach((section) => {
        if (openSections.has(section.dataset.pickerKind)) {
            section.open = openSections.get(section.dataset.pickerKind);
        }
    });
    bindPage(container);
    fillForm(container, null);
    refreshResult(container);
}

function bindPage(container) {
    const entryWarning = container.querySelector('[data-yield-entry-warning]');
    entryWarning?.addEventListener('click', (event) => {
        if (event.target.closest('[data-yield-entry-warning-save]')) entryWarning.close('save');
        else if (event.target === entryWarning || event.target.closest('[data-yield-entry-warning-close]')) entryWarning.close('cancel');
    });
    const slotWarning = container.querySelector('[data-yield-slot-warning]');
    slotWarning?.addEventListener('click', (event) => {
        if (event.target === slotWarning || event.target.closest('[data-yield-slot-warning-close]')) {
            slotWarning.close();
        }
    });
    container.querySelectorAll('[data-premium]').forEach((button) => {
        button.addEventListener('click', () => {
            state.premium = button.dataset.premium === '1';
            syncToggles(container);
            syncAutomaticPlots(container);
            refreshResult(container);
        });
    });
    container.querySelectorAll('[data-water]').forEach((button) => {
        button.addEventListener('click', () => {
            state.water = button.dataset.water === '1';
            syncToggles(container);
            syncAutomaticPlots(container);
            refreshResult(container);
        });
    });
    bindCityField(container, 'islandCity', (value) => {
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        if (value !== state.islandCity) {
            showSlotMismatchWarning(container, state.islandCity);
        }
        state.islandCity = value;
        saveStoredCity(CITY_STORAGE_KEY, value);
        syncAutomaticPlots(container);
        refreshResult(container);
    });
    bindPlantField(container, 'plantKey', (value, outputMode, kind) => {
        const nextKind = kind || kindForIslandYieldKey(value) || state.yieldKind;
        const kindChanged = nextKind !== state.yieldKind;
        state.yieldKind = nextKind;
        state.animalOutputMode = outputMode || 'offspring';
        if (!state.editingId) {
            state.filteredPlantKey = value || null;
            state.filteredItemType = value ? itemTypeForPickerOutput(outputMode, nextKind) : null;
        }
        openAverageGroup(value, itemTypeForPickerOutput(outputMode, nextKind));
        if (kindChanged) {
            state.editingId = null;
            renderPage(container);
            setSelectedItem(container, value);
            syncAnimalProductField(container);
            syncAutomaticPlots(container);
            return;
        }
        syncAnimalProductField(container);
        syncAutomaticPlots(container);
        refreshResult(container);
    });
    container.querySelectorAll('[data-plots]').forEach((button) => {
        button.addEventListener('click', () => {
            if (state.autoPlots) {
                state.autoPlots = false;
                container.querySelector('[data-yield-auto-plots]').checked = false;
                saveSettings({ islandYieldAutoPlots: false });
            }
            applyPlotChoice(container, Number(button.dataset.plots));
        });
    });
    container.querySelector('#seedsPlanted')?.addEventListener('input', () => {
        syncPlotsFromSeeds(container);
    });
    container.querySelectorAll('#seedsReturned, #plantsHarvested, [data-products-harvested]').forEach((input) => {
        input.addEventListener('input', () => syncAutomaticPlots(container));
        input.addEventListener('blur', () => {
            const value = parseQuantityExpression(input.value);
            if (value >= 0) {
                input.value = String(value);
                input.classList.add('is-filled');
            }
        });
    });
    container.querySelector('[data-yield-auto-plots]')?.addEventListener('change', (event) => {
        state.autoPlots = event.target.checked;
        saveSettings({ islandYieldAutoPlots: state.autoPlots });
        syncAutomaticPlots(container);
    });
    container.querySelector('#yieldForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEntry(container);
    });
    container.querySelector('#yieldCancelEdit')?.addEventListener('click', () => {
        fillForm(container, null);
        refreshResult(container);
    });
    container.querySelector('#yieldDelete')?.addEventListener('click', () => {
        if (!state.editingId) {
            return;
        }
        const row = getAll(TABLE).find((item) => String(item.id) === String(state.editingId));
        const averageBeforeDelete = row ? captureAverage(row.plantKey) : null;
        getAll(TABLE).filter((item) => String(item.linkedLogId) === String(state.editingId)).forEach((item) => deleteRow(TABLE, item.id));
        deleteRow(TABLE, state.editingId);
        showToast('Silindi.');
        fillForm(container, null);
        refreshResult(container);
        if (row) {
            showAverageChange(container, averageBeforeDelete, captureAverage(row.plantKey));
        }
    });
}

async function init() {
    initNav();
    const container = document.querySelector('[data-tool="island-yields"]');
    if (!container) {
        return;
    }
    const settings = getSettings();
    state.premium = settings.premium !== false;
    state.water = settings.farmWater === true;
    state.autoPlots = settings.islandYieldAutoPlots !== false;

    showPageLoader('Ada Çıktı yükleniyor…');
    try {
        await initStore();
        state.cities = await loadActiveCities();
        state.islandCity = readStoredCity(CITY_STORAGE_KEY, state.cities, getDefaultCity());
        renderPage(container);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="farming-note is-error">${escapeHtml(error.message || 'Yüklenemedi.')}</p>`;
    } finally {
        hidePageLoader();
    }
}

init();
