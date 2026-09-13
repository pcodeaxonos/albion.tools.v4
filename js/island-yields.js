import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import { initStore, getAll, createRow, updateRow, deleteRow } from './db/store.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadActiveCities } from './cities.js';
import { cityFieldHtml, bindCityField, setCityFieldValue } from './city-picker.js';
import { getSettings, cityHasIsland, getDefaultCity } from './settings.js';
import { getPlants } from './catalog.js';
import { itemIconHtml } from './item-icon.js';
import { summarizeYieldAverages } from './island-yield-stats.js';

const TABLE = 'islandYieldLogs';
const CITY_STORAGE_KEY = 'albiontools.v4.island-yields.city';

const state = {
    month: toYearMonth(todayIso()),
    editingId: null,
    islandCity: getDefaultCity(),
    premium: true,
    water: false,
    cities: []
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

function cityLabel(apiName) {
    return state.cities.find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

function plantLabel(key) {
    return getPlants().find((p) => p.key === key)?.label || key;
}

function plantOptions(selected) {
    const plants = getPlants();
    const crops = plants.filter((p) => p.kind === 'crop');
    const herbs = plants.filter((p) => p.kind === 'herb');
    const opt = (list) => list.map((p) => {
        const sel = p.key === selected ? ' selected' : '';
        return `<option value="${escapeHtml(p.key)}"${sel}>T${p.tier} ${escapeHtml(p.label)}</option>`;
    }).join('');
    return `
        <option value="">Seçin</option>
        <optgroup label="Ekin">${opt(crops)}</optgroup>
        <optgroup label="Ot">${opt(herbs)}</optgroup>
    `;
}

function rowsForMonth(month) {
    return getAll(TABLE)
        .filter((row) => toYearMonth(row.date) === month)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function cityIslandDecorate(city) {
    if (cityHasIsland(city.marketApiName)) {
        return {};
    }
    return { muted: true, hint: 'ada yok' };
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

function setFormMessage(container, text) {
    const el = container.querySelector('#yieldFormMessage');
    if (!el) {
        return;
    }
    if (!text) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = 'alert alert-info';
}

function fillForm(container, row) {
    const dateInput = container.querySelector('#yieldDate');
    const plant = container.querySelector('#plantKey');
    const planted = container.querySelector('#seedsPlanted');
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
        plant.value = row.plantKey;
        planted.value = String(row.seedsPlanted ?? 1);
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
        plant.value = '';
        planted.value = '1';
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
    const rows = rowsForMonth(month);
    if (!rows.length) {
        return `<div class="alert alert-info">${escapeHtml(month)} için kayıt yok. Soldan hasat sonucu ekle.</div>`;
    }
    const body = rows.map((row) => {
        const plant = getPlants().find((p) => p.key === row.plantKey);
        const perSeed = row.seedsPlanted > 0 ? row.plantsHarvested / row.seedsPlanted : null;
        const seedRate = row.seedsPlanted > 0 ? row.seedsReturned / row.seedsPlanted : null;
        return `
            <tr data-id="${row.id}"${state.editingId === row.id ? ' class="is-editing"' : ''}>
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
            <table class="table table-striped farming-table calc-table">
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

function renderAverages() {
    const rows = summarizeYieldAverages();
    if (!rows.length) {
        return `<p class="farming-note">Henüz ortalama yok — kayıt girdikçe burada görünür. Farming ve Ada Planlayıcı bu ortalamaları kullanır.</p>`;
    }
    const body = rows.map((row) => `
        <tr>
            <td>${escapeHtml(cityLabel(row.islandCity))}</td>
            <td>
                <span class="farming-item">
                    ${row.plantId ? itemIconHtml(row.plantId, { className: 'item-icon' }) : ''}
                    <span>${escapeHtml(row.plantLabel)}${row.thin ? ' <span class="farming-bonus">ince</span>' : ''}</span>
                </span>
            </td>
            <td class="num">${row.n}</td>
            <td class="num">${formatQty(row.avgPlantYield)}</td>
            <td class="num">${formatPct(row.avgSeedReturn)}</td>
            <td>${row.premium ? 'Premium' : 'Free'}${row.water ? ' · su' : ''}</td>
        </tr>
    `).join('');
    return `
        <h2 class="island-planner-subhead">Ortalamalar</h2>
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table calc-table">
                <thead>
                    <tr>
                        <th>Ada</th>
                        <th>Bitki</th>
                        <th class="num">n</th>
                        <th class="num">ort. ürün/tohum</th>
                        <th class="num">ort. tohum %</th>
                        <th>Bağlam</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function refreshResult(container) {
    const host = container.querySelector('.tool-split-result');
    if (!host) {
        return;
    }
    host.innerHTML = `
        <div class="form-floating farming-city-field" style="max-width:12rem;margin-bottom:1rem;">
            <input class="form-control is-filled" type="month" id="yieldMonth" value="${escapeHtml(state.month)}">
            <label for="yieldMonth">Ay</label>
        </div>
        <div id="yieldLog">${renderLogTable(state.month)}</div>
        ${renderAverages()}
        <p class="farming-note">Veri yoksa Farming / Ada Planlayıcı standart oyun yield (+şehir %10) kullanır. Ortalama varken şehir bonusu tekrar uygulanmaz.</p>
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
    container.querySelectorAll('#yieldLog tbody tr[data-id]').forEach((tr) => {
        tr.addEventListener('click', () => {
            const row = getAll(TABLE).find((item) => String(item.id) === tr.dataset.id);
            if (!row) {
                return;
            }
            fillForm(container, row);
            setFormMessage(container, '');
            refreshResult(container);
        });
    });
}

function saveEntry(container) {
    const date = container.querySelector('#yieldDate')?.value;
    const plantKey = container.querySelector('#plantKey')?.value;
    const seedsPlanted = Number(container.querySelector('#seedsPlanted')?.value);
    const seedsReturned = Number(container.querySelector('#seedsReturned')?.value);
    const plantsHarvested = Number(container.querySelector('#plantsHarvested')?.value);

    if (!date || !plantKey || !state.islandCity) {
        setFormMessage(container, 'Tarih, ada ve bitki zorunlu.');
        return;
    }
    if (!(seedsPlanted > 0) || !Number.isFinite(seedsReturned) || !Number.isFinite(plantsHarvested)) {
        setFormMessage(container, 'Dikilen / dönen / hasat sayılarını kontrol et.');
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
            setFormMessage(container, 'Güncellendi.');
        } else {
            createRow(TABLE, fd);
            setFormMessage(container, 'Kaydedildi.');
        }
        state.month = toYearMonth(date);
        fillForm(container, null);
        refreshResult(container);
    } catch (error) {
        console.error(error);
        setFormMessage(container, error.message || 'Kayıt başarısız.');
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
                    <div id="yieldFormMessage" class="alert alert-info" hidden></div>
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
                    <div class="form-floating farming-city-field">
                        <select class="form-select" id="plantKey" name="plantKey" required>
                            ${plantOptions('')}
                        </select>
                        <label for="plantKey">Bitki</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <input class="form-control is-filled" type="number" min="1" step="1" id="seedsPlanted" name="seedsPlanted" value="1" required>
                        <label for="seedsPlanted">Dikilen tohum</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <input class="form-control" type="number" min="0" step="1" id="seedsReturned" name="seedsReturned" required>
                        <label for="seedsReturned">Dönen tohum</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <input class="form-control" type="number" min="0" step="1" id="plantsHarvested" name="plantsHarvested" required>
                        <label for="plantsHarvested">Hasat ürün</label>
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
        });
    });
    container.querySelectorAll('[data-water]').forEach((button) => {
        button.addEventListener('click', () => {
            state.water = button.dataset.water === '1';
            syncToggles(container);
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
    });
    container.querySelector('#yieldForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEntry(container);
    });
    container.querySelector('#yieldCancelEdit')?.addEventListener('click', () => {
        setFormMessage(container, '');
        fillForm(container, null);
        refreshResult(container);
    });
    container.querySelector('#yieldDelete')?.addEventListener('click', () => {
        if (!state.editingId) {
            return;
        }
        deleteRow(TABLE, state.editingId);
        setFormMessage(container, 'Silindi.');
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
