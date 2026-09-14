import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import { initStore, getAll, createRow, updateRow, deleteRow } from './db/store.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { bindCalcSticky } from './calc-sticky.js';
import { bindLogTableRows } from './log-table.js';
import { loadActiveCities } from './cities.js';
import { cityFieldHtml, bindCityField, setCityFieldValue } from './city-picker.js';
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

const PLANT_GROUPS = [
    { kind: 'crop', title: 'Ekin tohumları' },
    { kind: 'herb', title: 'Ot tohumları' }
];

const state = {
    month: toYearMonth(todayIso()),
    editingId: null,
    islandCity: getDefaultCity(),
    premium: true,
    water: false,
    cities: [],
    plotsSelected: 1
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
    return `${(ratio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

function formatQty(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
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

function deltaTone(value) {
    if (!Number.isFinite(value) || value === 0) {
        return '';
    }
    return value > 0 ? 'is-pos' : 'is-neg';
}

function cityLabel(apiName) {
    return state.cities.find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

function plantLabel(key) {
    return getPlants().find((p) => p.key === key)?.label || key;
}

function rowsForMonth(month, islandCity = null) {
    return getAll(TABLE)
        .filter((row) => toYearMonth(row.date) === month)
        .filter((row) => !islandCity || row.islandCity === islandCity)
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
    const rows = rowsForMonth(month, state.islandCity);
    if (!rows.length) {
        const city = state.islandCity ? cityLabel(state.islandCity) : 'seçili ada';
        return `<div class="alert alert-info">${escapeHtml(month)} · ${escapeHtml(city)} için kayıt yok. Soldan hasat sonucu ekle.</div>`;
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
                        <th>Ada</th>
                        <th>Bitki</th>
                        <th class="num">Dikilen</th>
                        <th class="num">Dönen</th>
                        <th class="num">Hasat</th>
                        <th class="num">ürün/tohum</th>
                        <th class="num">tohum %</th>
                        <th>Bağlam</th>
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
    const yieldDelta = active ? avg.avgPlantYield - wikiYield : null;
    const seedDelta = active && Number.isFinite(avg.avgSeedReturn) && Number.isFinite(wikiSeed)
        ? avg.avgSeedReturn - wikiSeed
        : null;
    const thin = active && avg.n < 3;
    const name = `T${plant.tier} ${plant.label}`;

    return `
        <article class="yield-avg-card ${tierClass(plant.tier)}${active ? '' : ' is-passive'}${thin ? ' is-thin' : ''}"
            ${tipAttr(name)}>
            <div class="yield-avg-card-top">
                <div class="yield-avg-card-visual">
                    ${plant.plantId
                        ? itemIconHtml(plant.plantId, { size: 96, className: 'item-icon yield-avg-card-icon' })
                        : `<span class="yield-avg-card-icon-fallback">T${plant.tier}</span>`}
                </div>
                <div class="yield-avg-card-primary">
                    ${avgTag(active ? formatQty(avg.avgPlantYield) : '—', { kind: 'user', slot: 'yield', tip: 'Senin ürün/tohum' })}
                    ${avgTag(formatSigned(yieldDelta), { kind: 'delta', tone: deltaTone(yieldDelta), slot: 'yield-delta', tip: 'Sapma (ürün)' })}
                </div>
            </div>
            <div class="yield-avg-card-meta">
                ${avgTag(formatQty(wikiYield), { kind: 'wiki', slot: 'wiki-yield', tip: 'Wiki ürün/tohum' })}
                ${avgTag(active ? formatPct(avg.avgSeedReturn) : '—', { kind: 'user', slot: 'seed', tip: 'Senin tohum %' })}
                ${bonus
                    ? avgTag(`+${formatPct(bonusPct)}`, { kind: 'bonus', slot: 'bonus', tip: 'Şehir bonusu' })
                    : avgTag('—', { kind: 'bonus', slot: 'bonus', tip: 'Şehir bonusu yok' })}
                ${avgTag(formatPct(wikiSeed), { kind: 'wiki', slot: 'wiki-seed', tip: 'Wiki tohum %' })}
                ${avgTag(formatSigned(seedDelta, { asPctPoints: true }), { kind: 'delta', tone: deltaTone(seedDelta), slot: 'seed-delta', tip: 'Sapma (tohum)' })}
                ${avgTag(active ? `n=${avg.n}` : 'n=0', { kind: 'n', slot: 'n', tip: thin ? 'İnce örnek' : 'Kayıt sayısı' })}
            </div>
        </article>
    `;
}

function renderAvgLegend() {
    const bonusPct = formatPct(cityBonusPct());
    const rows = [
        {
            sample: avgTag('9.8', { kind: 'user', tip: 'Senin ürün/tohum' }),
            text: 'Senin hasat ortalaman — kayıtlarına göre tohum başına düşen ürün.',
            formula: 'hasat ÷ dikilen'
        },
        {
            sample: avgTag('9.9', { kind: 'wiki', tip: 'Wiki ürün/tohum' }),
            text: 'Oyunun beklenen ürünü (premium/free tabanı; şehir bonusu varsa dahil).',
            formula: 'taban × (1 + şehir%)'
        },
        {
            sample: avgTag('+0.2', { kind: 'delta', tone: 'is-pos', tip: 'Sapma (ürün)' }),
            text: 'Senin ortalaman wiki’den ne kadar ayrılıyor (ürün/tohum).',
            formula: 'senin − wiki'
        },
        {
            sample: avgTag('84%', { kind: 'user', tip: 'Senin tohum %' }),
            text: 'Tohumun geri dönüş oranı — dikilene göre dönen tohum payı.',
            formula: 'dönen ÷ dikilen'
        },
        {
            sample: avgTag('80%', { kind: 'wiki', tip: 'Wiki tohum %' }),
            text: 'Merdivendeki standart tohum dönüşü; sulama açıksa su bonusu eklenir.',
            formula: 'merdiven + su'
        },
        {
            sample: avgTag('+4pp', { kind: 'delta', tone: 'is-pos', tip: 'Sapma (tohum)' }),
            text: 'Tohum yüzdesinin wiki’den sapması (yüzde puanı).',
            formula: 'senin − wiki'
        },
        {
            sample: avgTag(`+${bonusPct}`, { kind: 'bonus', tip: 'Şehir bonusu' }),
            text: 'Bu bitki seçili adada şehir üretim bonusu alıyorsa gösterilir; wiki ürününe yansır.',
            formula: `+${bonusPct}`
        },
        {
            sample: avgTag('n=3', { kind: 'n', tip: 'Kayıt sayısı' }),
            text: 'Ortalamaya giren hasat kaydı adedi. Az kayıt (ince) daha az güvenilir sayılır.',
            formula: 'kayıt sayısı'
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

    return `
        <section class="yield-averages" data-yield-averages data-calc-toolbar aria-label="Ortalamalar">
            <div class="yield-averages-head">
                <h2 class="island-planner-subhead yield-averages-title">Ortalamalar · ${escapeHtml(cityLabel(islandCity))}</h2>
                <p class="yield-averages-meta"${tipAttr('Seçili ada + premium/su')}>${escapeHtml(contextLabel)}</p>
            </div>
            ${groups}
        </section>
        ${renderAvgLegend()}
    `;
}

function refreshResult(container) {
    const host = container.querySelector('.tool-split-result');
    if (!host) {
        return;
    }
    host.innerHTML = `
        ${renderAverages()}
        <div class="yield-log-section">
            <div class="form-floating farming-city-field yield-month-field">
                <input class="form-control is-filled" type="month" id="yieldMonth" value="${escapeHtml(state.month)}">
                <label for="yieldMonth">Ay</label>
            </div>
            <div id="yieldLog">${renderLogTable(state.month)}</div>
            <p class="farming-note">Veri yoksa Farming / Ada Planlayıcı standart oyun yield (+şehir %10) kullanır. Ortalama varken şehir bonusu tekrar uygulanmaz.</p>
        </div>
    `;
    bindResult(container);
    bindCalcSticky(container);
    initFloatingLabels(container);
}

function bindResult(container) {
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
    const seedsReturned = Number(container.querySelector('#seedsReturned')?.value);
    const plantsHarvested = Number(container.querySelector('#plantsHarvested')?.value);

    if (!date || !plantKey || !state.islandCity) {
        showToast('Tarih, ada ve bitki zorunlu.', { kind: 'error' });
        return;
    }
    if (!(seedsPlanted > 0) || !Number.isFinite(seedsReturned) || !Number.isFinite(plantsHarvested)) {
        showToast('Dikilen / dönen / hasat sayılarını kontrol et.', { kind: 'error' });
        return;
    }

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
                            <input class="form-control" type="number" min="0" step="1" id="seedsReturned" name="seedsReturned" required>
                            <label for="seedsReturned">Dönen tohum</label>
                        </div>
                        <div class="form-floating farming-city-field">
                            <input class="form-control" type="number" min="0" step="1" id="plantsHarvested" name="plantsHarvested" required>
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
        deleteRow(TABLE, state.editingId);
        showToast('Silindi.');
        fillForm(container, null);
        refreshResult(container);
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
