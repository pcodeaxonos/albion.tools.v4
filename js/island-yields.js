import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import { initStore, getAll, createRow, updateRow, deleteRow } from './db/store.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { bindCalcSticky } from './calc-sticky.js';
import { bindLogTableRows } from './log-table.js';
import { loadActiveCities } from './cities.js';
import { cityFieldHtml, bindCityField, setCityFieldValue, cityColorHex } from './city-picker.js';
import { plantFieldHtml, bindPlantField, setPlantFieldValue } from './plant-picker.js';
import { getSettings, cityHasIsland, getDefaultCity } from './settings.js';
import { getPlants, getEconomyConstant } from './catalog.js';
import { itemIconHtml } from './item-icon.js';
import { showToast } from './toast.js';
import {
    plantYieldAverage,
    standardPlantYield,
    standardSeedReturn
} from './island-yield-stats.js';

const TABLE = 'islandYieldLogs';
const CITY_STORAGE_KEY = 'albiontools.v4.island-yields.city';
const SEEDS_PER_PLOT = 9;
const PLOT_CHOICES = [1, 2, 3, 4, 5];
const CHANGE_BADGE_VISIBLE_MS = 60_000;
const CHANGE_BADGE_EXIT_MS = 800;

const PLANT_GROUPS = [
    { kind: 'crop', title: 'Ekin tohumları' },
    { kind: 'herb', title: 'Ot tohumları' }
];

const ROYAL_CITY_RING = ['Bridgewatch', 'Martlock', 'Thetford', 'Fort Sterling', 'Lymhurst'];
const SPECIAL_COMPARISON_CITIES = ['Caerleon', 'Brecilien'];

const state = {
    month: toYearMonth(todayIso()),
    editingId: null,
    islandCity: getDefaultCity(),
    premium: true,
    water: false,
    cities: [],
    plotsSelected: 1,
    filteredPlantKey: null
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

function formatDate(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
}

function formatPct(ratio) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    return `${(ratio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}%`;
}

function formatQty(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
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

function confidenceLevel(seedsPlanted) {
    const seeds = Number(seedsPlanted);
    if (!(seeds > 0)) return 0;
    // One plot has nine seeds. Sample size, rather than the number of form
    // submissions, determines how representative the weighted average is.
    if (seeds >= 360) return 4;
    if (seeds >= 135) return 3;
    if (seeds >= 45) return 2;
    return 1;
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
    return state.cities.find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

function normalizeCityName(city) {
    return String(city ?? '').toLowerCase().replace(/[\s_-]+/g, '');
}

function comparisonCities() {
    const byName = new Map(state.cities.map((city) => [normalizeCityName(city.marketApiName), city]));
    const mainCity = normalizeCityName(getSettings().defaultCity);
    const start = ROYAL_CITY_RING.findIndex((city) => normalizeCityName(city) === mainCity);
    const ring = start >= 0
        ? [...ROYAL_CITY_RING.slice(start), ...ROYAL_CITY_RING.slice(0, start)]
        : ROYAL_CITY_RING;
    const orderedKeys = [...ring, ...SPECIAL_COMPARISON_CITIES].map(normalizeCityName);
    const ordered = orderedKeys.map((key) => byName.get(key)).filter(Boolean);
    const known = new Set(ordered.map((city) => normalizeCityName(city.marketApiName)));
    return [...ordered, ...state.cities.filter((city) => !known.has(normalizeCityName(city.marketApiName)))];
}

function plantLabel(key) {
    return getPlants().find((p) => p.key === key)?.label || key;
}

function rowsForMonth(month, islandCity = null, plantKey = null) {
    return getAll(TABLE)
        .filter((row) => toYearMonth(row.date) === month)
        .filter((row) => !islandCity || row.islandCity === islandCity)
        .filter((row) => !plantKey || row.plantKey === plantKey)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function cityIslandDecorate(city) {
    if (cityHasIsland(city.marketApiName)) {
        return {};
    }
    return { muted: true, hint: 'ada yok' };
}

function cityBonusPct() {
    return getEconomyConstant('city_yield_bonus', 0.1);
}

function hasCityBonus(plant, islandCity) {
    return Array.isArray(plant?.bonusCities) && plant.bonusCities.includes(islandCity);
}

function tierClass(tier) {
    const n = Number(tier);
    if (n >= 1 && n <= 8) {
        return `is-item-tier-${n}`;
    }
    return '';
}

function renderToggle(groupLabel, options, dataAttr, current) {
    return `
        <div class="farming-type" role="radiogroup" aria-label="${escapeHtml(groupLabel)}">
            ${options.map((option) => {
                const pressed = option.id === current;
                return `
                    <button type="button" class="farming-type-btn${pressed ? ' is-active' : ''}"
                        data-${dataAttr}="${option.value}" aria-pressed="${pressed ? 'true' : 'false'}">
                        ${escapeHtml(option.label)}
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

    const plotCount = safe / SEEDS_PER_PLOT;
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
    if (!PLOT_CHOICES.includes(n)) {
        return;
    }
    state.plotsSelected = n;
    const planted = container.querySelector('#seedsPlanted');
    if (planted) {
        planted.value = String(n * SEEDS_PER_PLOT);
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
    const raw = seeds / SEEDS_PER_PLOT;
    const matched = Number.isInteger(raw) && PLOT_CHOICES.includes(raw) ? raw : null;
    state.plotsSelected = matched;
    syncPlotButtons(container, matched);
}

function renderPlotPicker(selectedPlots) {
    return `
        <div class="yield-plot-picker" role="radiogroup" aria-label="Plot"
            title="1 plot = ${SEEDS_PER_PLOT} tohum">
            ${PLOT_CHOICES.map((n) => {
                const pressed = n === selectedPlots;
                return `
                    <button type="button"
                        class="yield-plot-btn${pressed ? ' is-active' : ''}"
                        data-plots="${n}"
                        aria-pressed="${pressed ? 'true' : 'false'}"
                        title="${n} plot · ${n * SEEDS_PER_PLOT} tohum">
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
    const submit = container.querySelector('#yieldSubmit');
    const cancel = container.querySelector('#yieldCancelEdit');
    const remove = container.querySelector('#yieldDelete');

    if (row) {
        state.editingId = row.id;
        state.islandCity = row.islandCity;
        state.premium = row.premium === true;
        state.water = row.water === true;
        dateInput.value = row.date;
        setPlantFieldValue(container, 'plantKey', row.plantKey);
        setPlantedFields(container, row.seedsPlanted ?? 1);
        returned.value = String(row.seedsReturned ?? 0);
        harvested.value = String(row.plantsHarvested ?? 0);
        submit.textContent = 'Güncelle';
        cancel.hidden = false;
        remove.hidden = false;
        setCityFieldValue(container, 'islandCity', state.islandCity);
        syncToggles(container);
    } else {
        state.editingId = null;
        dateInput.value = todayIso();
        setPlantFieldValue(container, 'plantKey', '');
        setPlantedFields(container, SEEDS_PER_PLOT);
        returned.value = '';
        harvested.value = '';
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
    const rows = rowsForMonth(month, state.islandCity, state.filteredPlantKey);
    if (!rows.length) {
        const city = state.islandCity ? cityLabel(state.islandCity) : 'seçili ada';
        const plant = state.filteredPlantKey ? ` · ${plantLabel(state.filteredPlantKey)}` : '';
        return `<div class="alert alert-info">${escapeHtml(month)} · ${escapeHtml(city)}${escapeHtml(plant)} için kayıt yok. Soldan hasat sonucu ekle.</div>`;
    }
    const body = rows.map((row) => {
        const plant = getPlants().find((p) => p.key === row.plantKey);
        const perSeed = row.seedsPlanted > 0 ? row.plantsHarvested / row.seedsPlanted : null;
        const seedRate = row.seedsPlanted > 0 ? row.seedsReturned / row.seedsPlanted : null;
        return `
            <tr data-id="${row.id}"${String(state.editingId) === String(row.id) ? ' class="is-editing"' : ''}>
                <td class="text-nowrap">${escapeHtml(formatDate(row.date))}</td>
                <td>${escapeHtml(cityLabel(row.islandCity))}</td>
                <td>
                    <span class="farming-item">
                        ${plant?.plantId ? itemIconHtml(plant.plantId, { className: 'item-icon' }) : ''}
                        <span>${escapeHtml(plantLabel(row.plantKey))}</span>
                    </span>
                </td>
                <td class="num">${row.seedsPlanted}</td>
                <td class="num">${row.seedsReturned}</td>
                <td class="num">${row.plantsHarvested}</td>
                <td class="num">${formatQty(perSeed)}</td>
                <td class="num">${formatPct(seedRate)}</td>
                <td>${row.premium ? 'P' : 'F'}${row.water ? ' · su' : ''}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive calc-table-wrap" data-calc-table>
            <table class="table table-striped farming-table log-table calc-table">
                <thead>
                    <tr>
                        <th>Tarih</th>
                        <th>Ada şehri</th>
                        <th>Bitki</th>
                        <th class="num">Ekilen tohum</th>
                        <th class="num">Alınan tohum</th>
                        <th class="num">Hasat miktarı</th>
                        <th class="num">Tohum başına ürün</th>
                        <th class="num">Tohum dönüşü %</th>
                        <th>Premium / Sulama</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
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

function renderAvgCard(plant, islandCity) {
    const avg = plantYieldAverage(islandCity, plant.key, {
        premium: state.premium,
        water: state.water
    });
    const wikiYield = standardPlantYield(plant, islandCity, state.premium);
    const wikiSeed = standardSeedReturn(plant, state.water);
    const bonus = hasCityBonus(plant, islandCity);
    const bonusPct = cityBonusPct();
    const active = avg && avg.avgPlantYield > 0;
    const thin = active && avg.n < 3;
    const name = `T${plant.tier} ${plant.label}`;
    const yieldRelativeDifference = active ? (avg.avgPlantYield - wikiYield) / wikiYield : null;
    const seedRelativeDifference = active && Number.isFinite(avg.avgSeedReturn) && Number.isFinite(wikiSeed)
        ? (avg.avgSeedReturn - wikiSeed) / wikiSeed
        : null;
    const confidence = active ? confidenceLevel(avg.seedsPlanted) : 0;

    return `
        <article class="yield-avg-card ${tierClass(plant.tier)}${active ? '' : ' is-passive'}${thin ? ' is-thin' : ''}${state.filteredPlantKey === plant.key ? ' is-selected' : ''} is-confidence-${confidence}"
            data-yield-plant="${escapeHtml(plant.key)}" role="button" tabindex="0" aria-pressed="${state.filteredPlantKey === plant.key ? 'true' : 'false'}" ${tipAttr(`${name} — kayıtları filtrele`)}>
            <span class="yield-avg-tier">T${plant.tier}</span>
            ${bonus ? `<span class="yield-avg-bonus-floating"${tipAttr('Şehir bonusu')}><img src="icons/yield-city.svg" alt="">${formatPct(bonusPct)}</span>` : ''}
            <div class="yield-avg-card-visual">${plant.plantId
                ? itemIconHtml(plant.plantId, { size: 96, className: 'item-icon yield-avg-card-icon' })
                : `<span class="yield-avg-card-icon-fallback">T${plant.tier}</span>`}</div>
            <h4 class="yield-avg-card-name">${escapeHtml(plant.label)}</h4>
            <section class="yield-metric" aria-label="Ürün getirisi">
                <div class="yield-metric-title"><img src="icons/yield-product.svg" alt=""><span>Ürün</span></div>
                <div class="yield-metric-content">
                    <div class="yield-actual"><b data-yield-change="product">${active ? formatQty(avg.avgPlantYield) : ''}</b><span>Gerçek</span></div>
                    <div class="yield-delta-stack ${deltaTone(yieldRelativeDifference)}"${tipAttr('Varsayılan ürüne göre yüzde farkı')}><strong data-yield-change="product-relative">${active ? formatRelativeDifference(avg.avgPlantYield, wikiYield) : ''}</strong><span>${active ? formatDeltaMagnitude(avg.avgPlantYield - wikiYield, { digits: 1 }) : ''}</span><span class="yield-default"><b>${formatQty(wikiYield)}</b></span><i class="yield-delta-gauge" style="--yield-gauge-fill: ${gaugeFill(yieldRelativeDifference)}%;" aria-hidden="true"></i></div>
                </div>
            </section>
            <section class="yield-metric" aria-label="Tohum getirisi">
                <div class="yield-metric-title"><img src="icons/yield-seed.svg" alt=""><span>Tohum</span></div>
                <div class="yield-metric-content">
                    <div class="yield-actual"><b data-yield-change="seed">${active ? formatPct(avg.avgSeedReturn) : ''}</b><span>Gerçek</span></div>
                    <div class="yield-delta-stack ${deltaTone(seedRelativeDifference)}"${tipAttr('Varsayılan tohum dönüşüne göre yüzde farkı')}><strong data-yield-change="seed-relative">${active ? formatRelativeDifference(avg.avgSeedReturn, wikiSeed) : ''}</strong><span>${active ? formatDeltaMagnitude(avg.avgSeedReturn - wikiSeed, { digits: 1, asPctPoints: true }) : ''}</span><span class="yield-default"><b>${formatPct(wikiSeed)}</b></span><i class="yield-delta-gauge" style="--yield-gauge-fill: ${gaugeFill(seedRelativeDifference)}%;" aria-hidden="true"></i></div>
                </div>
            </section>
            <footer class="yield-card-footer"><span title="Ortalamaya giren kayıt sayısı"><img src="icons/yield-log.svg" alt=""> <b>n=${active ? avg.n : 0}</b></span><span class="yield-confidence"${tipAttr(`Güven seviyesi ${confidence}/4 · ${active ? formatQty(avg.seedsPlanted) : 0} ekilen tohum`)}><i></i><i></i><i></i><i></i></span></footer>
        </article>
    `;
}

function renderAvgLegend(plant, islandCity) {
    const bonusPct = formatPct(cityBonusPct());
    const standardYield = standardPlantYield(plant, islandCity, state.premium);
    const standardSeed = standardSeedReturn(plant, state.water);
    const exampleYield = standardYield * 0.99;
    const exampleSeed = Math.min(1, standardSeed * 1.05);
    const exampleYieldDifference = exampleYield - standardYield;
    const exampleSeedDifference = exampleSeed - standardSeed;
    const exampleYieldRelative = formatRelativeDifference(exampleYield, standardYield);
    const exampleSeedRelative = formatRelativeDifference(exampleSeed, standardSeed);
    const rows = [
        {
            sample: `<span class="yield-values-stack"><span>Gerçek <b>${formatQty(exampleYield)}</b></span><span>Vars. <b>${formatQty(standardYield)}</b></span></span>`,
            text: 'Ürün: Gerçek, kayıtlarındaki tohum başına hasat ortalaması; Vars., premium ve şehir bonusu dahil beklenen değer.',
            formula: 'hasat ÷ ekilen tohum'
        },
        {
            sample: `<span class="yield-values-stack"><span>Gerçek <b>${formatPct(exampleSeed)}</b></span><span>Vars. <b>${formatPct(standardSeed)}</b></span></span>`,
            text: 'Tohum: Gerçek, geri aldığın tohumların ekilen tohuma oranı; Vars., sulama seçimine göre beklenen dönüş oranı.',
            formula: 'alınan tohum ÷ ekilen tohum'
        },
        {
            sample: `<span class="yield-delta-stack is-neg"><strong>${exampleYieldRelative}</strong><span>${formatSigned(exampleYieldDifference, { digits: 1 })}</span></span>`,
            text: 'Büyük yüzde, varsayılan değere göre farkın büyüklüğüdür. Yeşil daha yüksek, kırmızı daha düşük getiriyi gösterir. Altındaki sayı ürün/tohum farkıdır.',
            formula: '|gerçek − varsayılan| ÷ varsayılan'
        },
        {
            sample: `<span class="yield-delta-stack is-pos"><strong>${exampleSeedRelative}</strong><span>${formatSigned(exampleSeedDifference, { asPctPoints: true })}</span></span>`,
            text: `Tohum farkında pp, yüzde puanı demektir. ${formatPct(exampleSeed)} ile ${formatPct(standardSeed)} arasındaki fark ${formatSigned(exampleSeedDifference, { asPctPoints: true })}; varsayılana göre ${exampleSeedRelative} artıştır.`,
            formula: `${formatPct(exampleSeed)} − ${formatPct(standardSeed)} = ${formatSigned(exampleSeedDifference, { asPctPoints: true })}`
        },
        {
            sample: avgTag(`+${bonusPct}`, { kind: 'bonus', tip: 'Şehir bonusu' }),
            text: 'Sağ üstteki şehir bonusu, seçili adada bu bitkinin ek ürün verdiğini gösterir. Varsayılan ürün değerine dahildir.',
            formula: `+${bonusPct}`
        },
        {
            sample: avgTag('n=3', { kind: 'n', tip: 'Kayıt sayısı' }),
            text: 'n, ortalamaya giren kayıt sayısıdır. Alttaki noktalar kayıt miktarını gösterir: 1–4 kayıtta bir, 5–11 kayıtta iki, 12 ve üzeri kayıtta üç nokta yanar.',
            formula: '1 / 5 / 12 kayıt'
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
    const plant = getPlants().find((item) => item.key === state.filteredPlantKey);
    if (!plant) {
        return '';
    }
    const cities = comparisonCities();
    return `
        <section class="yield-city-comparison" aria-label="Şehir karşılaştırması">
            <div class="yield-city-comparison-head">
                <div>
                    <p class="yield-city-comparison-kicker">Şehir karşılaştırması</p>
                    <h3 class="island-planner-subhead yield-city-comparison-title">
                        ${plant.plantId ? itemIconHtml(plant.plantId, { size: 40, className: 'item-icon' }) : ''}
                        <span>${escapeHtml(plant.label)}</span>
                        <span class="yield-city-comparison-tier ${tierClass(plant.tier)}">T${plant.tier}</span>
                    </h3>
                </div>
                <p>Seçili Premium / Sulama ayarındaki tüm ada şehirleri.</p>
            </div>
            <div class="yield-city-comparison-grid">
                ${cities.map((city) => {
                    const cityName = city.marketApiName;
                    const avg = plantYieldAverage(cityName, plant.key, { premium: state.premium, water: state.water });
                    const standardYield = standardPlantYield(plant, cityName, state.premium);
                    const standardSeed = standardSeedReturn(plant, state.water);
                    const hasData = avg && avg.avgPlantYield > 0;
                    const yieldDelta = hasData ? (avg.avgPlantYield - standardYield) / standardYield : null;
                    const seedDelta = hasData && Number.isFinite(avg.avgSeedReturn) && Number.isFinite(standardSeed)
                        ? avg.avgSeedReturn - standardSeed
                        : null;
                    const bonus = hasCityBonus(plant, cityName);
                    return `
                        <article class="yield-city-card${cityName === state.islandCity ? ' is-current' : ''}${hasData ? '' : ' is-empty'}"
                            style="--yield-city-color:${escapeHtml(cityColorHex(city))}">
                            <header>
                                <strong>${escapeHtml(cityLabel(cityName))}</strong>
                                ${bonus ? `<span title="Şehir üretim bonusu">+${formatPct(cityBonusPct())}</span>` : ''}
                            </header>
                            <div class="yield-city-card-metric">
                                <span>Ürün</span>
                                <b>${hasData ? formatQty(avg.avgPlantYield) : '—'}</b>
                                <small>${hasData ? `${formatSigned(avg.avgPlantYield - standardYield, { digits: 1 })} · ${formatRelativeDifference(avg.avgPlantYield, standardYield)}` : `Vars. ${formatQty(standardYield)}`}</small>
                            </div>
                            <div class="yield-city-card-metric">
                                <span>Tohum</span>
                                <b>${hasData ? formatPct(avg.avgSeedReturn) : '—'}</b>
                                <small>${hasData ? formatSigned(seedDelta, { asPctPoints: true }) : `Vars. ${formatPct(standardSeed)}`}</small>
                            </div>
                            <footer>${hasData ? `n=${avg.n} kayıt` : 'Kayıt yok'}</footer>
                        </article>
                    `;
                }).join('')}
            </div>
        </section>
    `;
}

function renderAvgGroup(group, plants, islandCity) {
    const list = plants.filter((p) => p.kind === group.kind);
    if (!list.length) {
        return '';
    }
    const slots = Array.from({ length: 8 }, (_, index) => {
        const tier = index + 1;
        return list.find((plant) => Number(plant.tier) === tier) ?? null;
    });

    return `
        <div class="yield-avg-group" data-kind="${escapeHtml(group.kind)}">
            <h3 class="yield-avg-group-title">${escapeHtml(group.title)}</h3>
            <div class="yield-avg-row">
                ${slots.map((plant) => (plant
                    ? renderAvgCard(plant, islandCity)
                    : '<div class="yield-avg-slot is-empty" aria-hidden="true"></div>'
                )).join('')}
            </div>
        </div>
    `;
}

function renderAverages() {
    const islandCity = state.islandCity;
    if (!islandCity) {
        return `<p class="farming-note">Ortalamalar için ada şehri seç.</p>`;
    }

    const plants = getPlants();
    const contextLabel = `${state.premium ? 'Premium' : 'Free'} · ${state.water ? 'Su' : 'Kuru'}`;
    const groups = PLANT_GROUPS.map((group) => renderAvgGroup(group, plants, islandCity)).join('');
    const legendPlant = plants.find((plant) => plant.key === state.filteredPlantKey)
        ?? plants.find((plant) => hasCityBonus(plant, islandCity))
        ?? plants[0];

    return `
        <section class="yield-averages" data-yield-averages aria-label="Ortalamalar">
            <div class="yield-averages-head">
                <h2 class="island-planner-subhead yield-averages-title">Ortalamalar · ${escapeHtml(cityLabel(islandCity))}</h2>
                <p class="yield-averages-meta"${tipAttr('Seçili ada + premium/su')}>${escapeHtml(contextLabel)}</p>
            </div>
            ${groups}
        </section>
        ${legendPlant ? renderAvgLegend(legendPlant, islandCity) : ''}
    `;
}

function captureAverage(plantKey) {
    const plant = getPlants().find((item) => item.key === plantKey);
    const avg = plantYieldAverage(state.islandCity, plantKey, {
        premium: state.premium,
        water: state.water
    });
    const standardYield = standardPlantYield(plant, state.islandCity, state.premium);
    const standardSeed = standardSeedReturn(plant, state.water);
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
    const card = [...container.querySelectorAll('[data-yield-plant]')]
        .find((item) => item.dataset.yieldPlant === after.plantKey);
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
    const host = container.querySelector('.tool-split-result');
    if (!host) {
        return;
    }
    host.innerHTML = `
        ${renderAverages()}
        ${renderCityComparison()}
        <div class="yield-log-section">
            <div class="form-floating farming-city-field yield-month-field">
                <input class="form-control is-filled" type="month" id="yieldMonth" value="${escapeHtml(state.month)}">
                <label for="yieldMonth">Ay</label>
            </div>
            <div class="yield-log-heading">
                <h3 class="island-planner-subhead">Kayıtlar${state.filteredPlantKey ? ` · ${escapeHtml(plantLabel(state.filteredPlantKey))}` : ''}</h3>
                ${state.filteredPlantKey ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-clear-yield-filter>Filtreyi kaldır</button>' : ''}
            </div>
            <div id="yieldLog">${renderLogTable(state.month)}</div>
            <p class="farming-note">Veri yoksa Farming / Ada Planlayıcı standart oyun yield (+şehir ${formatPct(cityBonusPct())}) kullanır. Ortalama varken şehir bonusu tekrar uygulanmaz.</p>
        </div>
    `;
    bindResult(container);
    bindCalcSticky(container);
    initFloatingLabels(container);
}

function bindResult(container) {
    const setPlantFilter = (plantKey) => {
        state.filteredPlantKey = state.filteredPlantKey === plantKey ? null : plantKey;
        refreshResult(container);
        container.querySelector('.yield-log-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    container.querySelectorAll('[data-yield-plant]').forEach((card) => {
        card.addEventListener('click', () => setPlantFilter(card.dataset.yieldPlant));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPlantFilter(card.dataset.yieldPlant);
            }
        });
    });
    container.querySelector('[data-clear-yield-filter]')?.addEventListener('click', () => {
        state.filteredPlantKey = null;
        refreshResult(container);
    });
    container.querySelector('#yieldMonth')?.addEventListener('change', (event) => {
        if (event.target.value) {
            state.month = event.target.value;
            refreshResult(container);
        }
    });
    bindLogTableRows(container, (id) => {
        const row = getAll(TABLE).find((item) => String(item.id) === id);
        if (!row) {
            return;
        }
        fillForm(container, row);
        refreshResult(container);
    });
}

function saveEntry(container) {
    const date = container.querySelector('#yieldDate')?.value;
    const plantKey = container.querySelector('#plantKey')?.value;
    const seedsPlanted = Number(container.querySelector('#seedsPlanted')?.value);
    const returnedInput = container.querySelector('#seedsReturned');
    const harvestedInput = container.querySelector('#plantsHarvested');
    const seedsReturned = parseQuantityExpression(returnedInput?.value);
    const plantsHarvested = parseQuantityExpression(harvestedInput?.value);

    if (!date || !plantKey || !state.islandCity) {
        showToast('Tarih, ada ve bitki zorunlu.', { kind: 'error' });
        return;
    }
    if (!(seedsPlanted > 0) || !(seedsReturned >= 0) || !(plantsHarvested >= 0)) {
        showToast('Dikilen / dönen / hasat sayılarını kontrol et.', { kind: 'error' });
        return;
    }
    returnedInput.value = String(seedsReturned);
    harvestedInput.value = String(plantsHarvested);

    const fd = new FormData();
    fd.set('date', date);
    fd.set('islandCity', state.islandCity);
    fd.set('plantKey', plantKey);
    fd.set('seedsPlanted', String(seedsPlanted));
    fd.set('seedsReturned', String(seedsReturned));
    fd.set('plantsHarvested', String(plantsHarvested));
    if (state.premium) {
        fd.set('premium', 'on');
    }
    if (state.water) {
        fd.set('water', 'on');
    }

    try {
        const averageBeforeSave = captureAverage(plantKey);
        if (state.editingId) {
            updateRow(TABLE, state.editingId, fd);
            showToast('Güncellendi.');
        } else {
            createRow(TABLE, fd);
            showToast('Kaydedildi.');
        }
        state.month = toYearMonth(date);
        fillForm(container, null);
        refreshResult(container);
        showAverageChange(container, averageBeforeSave, captureAverage(plantKey));
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Kayıt başarısız.', { kind: 'error' });
    }
}

function renderPage(container) {
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Ada Çıktı</h1>
            <p>Her adanın gerçek seed / ürün yield’ini kaydet. Ortalamalar Farming ve Ada Planlayıcı maliyetinde kullanılır.</p>
        </section>
        <div class="tool-split">
            <div class="tool-split-controls">
                <form id="yieldForm" class="farming-toolbar island-planner-toolbar">
                    ${renderToggle('Premium', [
                        { id: true, value: '1', label: 'Premium' },
                        { id: false, value: '0', label: 'Free' }
                    ], 'premium', state.premium)}
                    ${renderToggle('Sulama', [
                        { id: true, value: '1', label: 'Su' },
                        { id: false, value: '0', label: 'Kuru' }
                    ], 'water', state.water)}
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
                    ${plantFieldHtml({
                        id: 'plantKey',
                        label: 'Bitki',
                        selected: '',
                        className: 'farming-city-field'
                    })}
                    <div class="yield-planted-pair" title="1 plot = ${SEEDS_PER_PLOT} tohum">
                        ${renderPlotPicker(state.plotsSelected ?? 1)}
                        <div class="form-floating farming-city-field yield-seeds-field">
                            <input class="form-control is-filled" type="number" min="1" step="1" id="seedsPlanted" name="seedsPlanted" value="${SEEDS_PER_PLOT}" required>
                            <label for="seedsPlanted">Tohum</label>
                        </div>
                    </div>
                    <div class="yield-harvest-pair">
                        <div class="form-floating farming-city-field">
                            <input class="form-control" type="text" inputmode="decimal" autocomplete="off" id="seedsReturned" name="seedsReturned" placeholder="10-8" required>
                            <label for="seedsReturned">Dönen tohum</label>
                        </div>
                        <div class="form-floating farming-city-field">
                            <input class="form-control" type="text" inputmode="decimal" autocomplete="off" id="plantsHarvested" name="plantsHarvested" placeholder="10-8" required>
                            <label for="plantsHarvested">Hasat ürün</label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" id="yieldSubmit">Kaydet</button>
                        <button type="button" class="btn btn-outline-secondary" id="yieldCancelEdit" hidden>Vazgeç</button>
                        <button type="button" class="btn btn-outline-danger" id="yieldDelete" hidden>Sil</button>
                    </div>
                </form>
            </div>
            <div class="tool-split-result"></div>
        </div>
    `;
    bindPage(container);
    fillForm(container, null);
    refreshResult(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-premium]').forEach((button) => {
        button.addEventListener('click', () => {
            state.premium = button.dataset.premium === '1';
            syncToggles(container);
            refreshResult(container);
        });
    });
    container.querySelectorAll('[data-water]').forEach((button) => {
        button.addEventListener('click', () => {
            state.water = button.dataset.water === '1';
            syncToggles(container);
            refreshResult(container);
        });
    });
    bindCityField(container, 'islandCity', (value) => {
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.islandCity = value;
        try {
            localStorage.setItem(CITY_STORAGE_KEY, value);
        } catch {
            /* ignore */
        }
        refreshResult(container);
    });
    bindPlantField(container, 'plantKey');
    container.querySelectorAll('[data-plots]').forEach((button) => {
        button.addEventListener('click', () => {
            applyPlotChoice(container, Number(button.dataset.plots));
        });
    });
    container.querySelector('#seedsPlanted')?.addEventListener('input', () => {
        syncPlotsFromSeeds(container);
    });
    container.querySelectorAll('#seedsReturned, #plantsHarvested').forEach((input) => {
        input.addEventListener('blur', () => {
            const value = parseQuantityExpression(input.value);
            if (value >= 0) {
                input.value = String(value);
                input.classList.add('is-filled');
            }
        });
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
    const container = document.getElementById('islandYieldsTool');
    if (!container) {
        return;
    }
    const settings = getSettings();
    state.premium = settings.premium !== false;
    state.water = settings.farmWater === true;

    showPageLoader('Ada Çıktı yükleniyor…');
    try {
        await initStore();
        state.cities = await loadActiveCities();
        try {
            const saved = localStorage.getItem(CITY_STORAGE_KEY);
            if (saved && state.cities.some((c) => c.marketApiName === saved)) {
                state.islandCity = saved;
            } else {
                state.islandCity = getDefaultCity();
            }
        } catch {
            state.islandCity = getDefaultCity();
        }
        renderPage(container);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="farming-note is-error">${escapeHtml(error.message || 'Yüklenemedi.')}</p>`;
    } finally {
        hidePageLoader();
    }
}

init();
