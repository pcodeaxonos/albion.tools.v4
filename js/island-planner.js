import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getSettings, cityHasIsland } from './settings.js';
import {
    fetchPrices,
    indexPrices,
    priceRefreshActionsHtml,
    bindPriceRefresh,
    priceLoaderMessage,
    applyPriceLoadMode
} from './market.js';
import { itemIconHtml } from './item-icon.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { initFloatingLabels } from './forms.js';
import { feeMetaText } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadActiveCities } from './cities.js';
import { bindLivePrices } from './price-live.js';
import {
    ISLAND_PLOTS_BY_LEVEL,
    plotsForLevel,
    allPriceItemIds,
    optimizeIsland,
    plotTypeLabel,
    LIVESTOCK_FEED
} from './island-economy.js';

const CITY_STORAGE_KEY = 'albiontools.v4.island-planner.islandCity';
const SELL_CITY_STORAGE_KEY = 'albiontools.v4.island-planner.sellCity';
const PREFS_STORAGE_KEY = 'albiontools.v4.island-planner.prefs';

const state = {
    premium: true,
    water: false,
    focus: false,
    islandLevel: 6,
    plotsOverride: null,
    islandCity: 'Martlock',
    sellCity: 'Martlock',
    buySide: 'buy',
    sellSide: 'sell',
    cities: [],
    priceIndex: null,
    loaded: false,
    error: null,
    livePaused: false,
    plan: null
};

function formatSilver(value, { digits = 0, signed = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    let text = Math.round(value).toLocaleString('tr-TR', {
        maximumFractionDigits: digits
    });
    if (signed && value > 0) {
        text = `+${text}`;
    }
    return text;
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

function effectivePlots() {
    if (state.plotsOverride != null && Number.isFinite(state.plotsOverride)) {
        return Math.max(1, Math.min(16, Math.round(state.plotsOverride)));
    }
    return plotsForLevel(state.islandLevel);
}

function readSavedCity(key, cities, fallback) {
    try {
        const saved = localStorage.getItem(key);
        if (cities.some((city) => city.marketApiName === saved)) {
            return saved;
        }
    } catch {
        /* ignore */
    }
    if (cities.some((city) => city.marketApiName === fallback)) {
        return fallback;
    }
    return cities[0]?.marketApiName ?? 'Martlock';
}

function saveCity(key, apiName) {
    try {
        localStorage.setItem(key, apiName);
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
        state.focus = parsed.focus === true;
        // water comes from settings.farmWater
        const level = Number(parsed.islandLevel);
        if (ISLAND_PLOTS_BY_LEVEL[level]) {
            state.islandLevel = level;
        }
        if (parsed.plotsOverride != null && Number.isFinite(Number(parsed.plotsOverride))) {
            state.plotsOverride = Math.max(1, Math.min(16, Math.round(Number(parsed.plotsOverride))));
        }
    } catch {
        /* ignore */
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
            focus: state.focus,
            islandLevel: state.islandLevel,
            plotsOverride: state.plotsOverride
        }));
    } catch {
        /* ignore */
    }
}

function formatPct(ratio) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    return `${(ratio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

function formatHours(hours) {
    if (!Number.isFinite(hours) || hours <= 0) {
        return '—';
    }
    const days = Math.max(1, Math.ceil(hours / 24 - 1e-9));
    return `${days} gün`;
}

function runPlan() {
    if (!state.priceIndex) {
        state.plan = null;
        return;
    }
    const settings = getSettings();
    state.water = settings.farmWater === true;
    state.plan = optimizeIsland({
        plots: effectivePlots(),
        premium: state.premium,
        water: state.water,
        focus: state.focus,
        islandCity: state.islandCity,
        sellCity: state.sellCity,
        buySide: state.buySide,
        sellSide: state.sellSide,
        priceIndex: state.priceIndex
    });
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

function renderCityOptions(selected) {
    return state.cities.map((city) => {
        const value = city.marketApiName;
        const island = cityHasIsland(value);
        const selectedAttr = value === selected ? ' selected' : '';
        const hint = island ? '' : ' data-hint="ada yok"';
        return `<option value="${escapeHtml(value)}"${selectedAttr}${hint}>${escapeHtml(city.displayName)}${island ? '' : ' (ada yok)'}</option>`;
    }).join('');
}

function renderLevelOptions() {
    return Object.keys(ISLAND_PLOTS_BY_LEVEL).map((level) => {
        const n = Number(level);
        const plots = ISLAND_PLOTS_BY_LEVEL[n];
        const selected = n === state.islandLevel ? ' selected' : '';
        return `<option value="${n}"${selected}>L${n} · ${plots} plot</option>`;
    }).join('');
}

function latestPriceDate() {
    if (!state.priceIndex || typeof state.priceIndex.values !== 'function') {
        return null;
    }
    let latest = null;
    for (const row of state.priceIndex.values()) {
        for (const key of ['buy_price_max_date', 'sell_price_min_date']) {
            const iso = row?.[key];
            if (iso && !String(iso).startsWith('0001') && (!latest || iso > latest)) {
                latest = iso;
            }
        }
    }
    return latest;
}

function renderSummary() {
    const plan = state.plan;
    if (!plan || !plan.slots?.length) {
        return `<p class="farming-note">Plan için fiyat ve plot gerekir.</p>`;
    }
    const cmp = plan.comparison;
    const groups = groupSlots(plan.slots);
    const uniform = groups.length === 1 && groups[0].count === effectivePlots();
    return `
        <div class="island-planner-summary">
            <p class="island-planner-total">
                <strong>${formatSilver(plan.totalDay)}</strong>
                <span>net gümüş/gün · ${effectivePlots()} plot</span>
                <span class="island-planner-cities">alış ${escapeHtml(cityLabel(state.islandCity))} → satış ${escapeHtml(cityLabel(state.sellCity))}</span>
            </p>
            <p class="island-planner-feed">${escapeHtml(plan.feedNote || '—')}</p>
            ${uniform ? `
                <p class="farming-note">Max net gümüş/gün için tüm plotlar aynı aktiviteye verildi; alternatifler tablonun altında.</p>
            ` : ''}
            ${cmp ? `
                <p class="island-planner-compare farming-note">
                    Pazar-yem / tek tip baseline: ${formatSilver(cmp.marketDay)} net gümüş/gün
                    · fark ${formatSilver(cmp.delta, { signed: true })}
                    ${cmp.choseIslandFeed ? ' · ada yemi seçildi' : ' · pazar / ekin satışı seçildi'}
                </p>
            ` : ''}
        </div>
    `;
}

function slotGroupKey(slot) {
    return [
        slot.plotType,
        slot.label,
        slot.pathLabel,
        slot.iconId,
        slot.detail,
        Number.isFinite(slot.perDay) ? Math.round(slot.perDay) : '',
        Number.isFinite(slot.profitPct) ? Math.round(slot.profitPct * 1000) : '',
        Number.isFinite(slot.cost) ? Math.round(slot.cost) : ''
    ].join('|');
}

function groupSlots(slots) {
    const groups = [];
    for (const slot of slots) {
        const key = slotGroupKey(slot);
        const last = groups[groups.length - 1];
        if (last && last.key === key) {
            last.count += 1;
            last.end = slot.index;
            continue;
        }
        groups.push({
            key,
            start: slot.index,
            end: slot.index,
            count: 1,
            slot
        });
    }
    return groups;
}

function renderSlotRange(group) {
    if (group.count === 1) {
        return String(group.start);
    }
    return `${group.start}–${group.end}`;
}

function splitDetail(detail) {
    const parts = String(detail || '')
        .split(' · ')
        .map((part) => part.trim())
        .filter(Boolean);
    const bonuses = [];
    const notes = [];
    for (const part of parts) {
        if (part === 'şehir +10%' || part === 'yem şehir +10%') {
            bonuses.push(part === 'şehir +10%' ? '+10%' : 'yem +10%');
        } else {
            notes.push(part);
        }
    }
    return { bonuses, notes };
}

function renderBonusTags(bonuses) {
    if (!bonuses?.length) {
        return '';
    }
    return bonuses.map((label) => (
        `<span class="farming-bonus island-planner-tag">${escapeHtml(label)}</span>`
    )).join('');
}

function renderProductCell(slot) {
    const { bonuses, notes } = splitDetail(slot.detail);
    return `
        <span class="farming-item">
            ${slot.iconId ? itemIconHtml(slot.iconId, { className: 'item-icon' }) : ''}
            <span>
                <span class="farming-item-name">
                    ${escapeHtml(slot.label)}
                    ${renderBonusTags(bonuses)}
                </span>
                ${notes.length
                    ? `<span class="farming-item-meta">${escapeHtml(notes.join(' · '))}</span>`
                    : ''}
            </span>
        </span>
    `;
}

function renderAllocationChips(groups) {
    if (!groups.length) {
        return '';
    }
    return `
        <ul class="island-planner-chips" aria-label="Slot özeti">
            ${groups.map((group) => {
                const slot = group.slot;
                const type = plotTypeLabel(slot.plotType);
                const { bonuses } = splitDetail(slot.detail);
                return `
                    <li class="island-planner-chip">
                        <strong>${group.count}×</strong>
                        <span class="island-planner-chip-type">${escapeHtml(type)}</span>
                        ${slot.iconId ? itemIconHtml(slot.iconId, { className: 'item-icon island-planner-chip-icon' }) : ''}
                        <span>${escapeHtml(slot.label)}</span>
                        <span class="island-planner-chip-path">${escapeHtml(slot.pathLabel || '')}</span>
                        ${renderBonusTags(bonuses)}
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

function renderSlotsTable() {
    const plan = state.plan;
    const head = `
        <thead>
            <tr>
                <th class="island-planner-col-slot">Slot</th>
                <th class="island-planner-col-type">Tip</th>
                <th>Ürün</th>
                <th class="island-planner-col-path">Path</th>
                <th class="num">Maliyet</th>
                <th class="num">Kâr</th>
                <th class="num">Kâr %</th>
                <th class="num island-planner-col-day">net gümüş/gün</th>
                <th class="num">Döngü</th>
            </tr>
        </thead>
    `;

    if (!plan?.slots?.length) {
        return `
            <div class="table-responsive calc-table-wrap">
                <table class="table table-striped farming-table island-planner-table calc-table">
                    ${head}
                    <tbody>
                        <tr><td colspan="9">Henüz plan yok.</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    const groups = groupSlots(plan.slots);
    const rows = groups.map((group) => {
        const slot = group.slot;
        const dayTotal = Number.isFinite(slot.perDay) ? slot.perDay * group.count : null;
        const profitClass = Number.isFinite(slot.profit)
            ? (slot.profit > 0 ? ' is-profit' : slot.profit < 0 ? ' is-loss' : '')
            : '';
        return `
            <tr>
                <td class="island-planner-col-slot">
                    <span class="island-planner-slot-range">${escapeHtml(renderSlotRange(group))}</span>
                    ${group.count > 1 ? `<span class="island-planner-slot-count">${group.count} plot</span>` : ''}
                </td>
                <td class="island-planner-col-type">
                    <span class="island-planner-type island-planner-type--${escapeHtml(slot.plotType)}">${escapeHtml(plotTypeLabel(slot.plotType))}</span>
                </td>
                <td>${renderProductCell(slot)}</td>
                <td class="island-planner-col-path">${escapeHtml(slot.pathLabel || '—')}</td>
                <td class="num">${formatSilver(slot.cost)}</td>
                <td class="num farming-num${profitClass}">${formatSilver(slot.profit, { signed: true })}</td>
                <td class="num farming-num${profitClass}">${formatPct(slot.profitPct)}</td>
                <td class="num island-planner-col-day">
                    <span class="island-planner-day">${formatSilver(slot.perDay)}</span>
                    ${group.count > 1 && dayTotal != null
                        ? `<span class="island-planner-day-total">${formatSilver(dayTotal)} toplam</span>`
                        : ''}
                </td>
                <td class="num">${formatHours(slot.hours)}</td>
            </tr>
        `;
    }).join('');

    return `
        ${renderAllocationChips(groups)}
        <div class="table-responsive calc-table-wrap" data-calc-table>
            <table class="table table-striped farming-table island-planner-table calc-table">
                ${head}
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderRunnersUp() {
    const list = state.plan?.runnersUp;
    if (!list?.length) {
        return '';
    }
    const rows = list.map((row, i) => {
        const profitClass = Number.isFinite(row.profit)
            ? (row.profit > 0 ? ' is-profit' : row.profit < 0 ? ' is-loss' : '')
            : '';
        return `
            <tr>
                <td class="num">${i + 1}</td>
                <td>
                    <span class="island-planner-type island-planner-type--${escapeHtml(row.plotType)}">${escapeHtml(plotTypeLabel(row.plotType))}</span>
                </td>
                <td>${renderProductCell(row)}</td>
                <td>${escapeHtml(row.pathLabel || '—')}</td>
                <td class="num">${formatSilver(row.cost)}</td>
                <td class="num farming-num${profitClass}">${formatSilver(row.profit, { signed: true })}</td>
                <td class="num farming-num${profitClass}">${formatPct(row.profitPct)}</td>
                <td class="num">${formatSilver(row.perDay)}</td>
                <td class="num">${formatHours(row.hours)}</td>
            </tr>
        `;
    }).join('');

    return `
        <h2 class="island-planner-subhead">Alternatifler (plot başına)</h2>
        <p class="farming-note">Seçilen plandan sonraki en yüksek net gümüş/gün adayları. Şehir veya satış şehri değişince sıra değişir.</p>
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table island-planner-table calc-table">
                <thead>
                    <tr>
                        <th class="num">#</th>
                        <th>Tip</th>
                        <th>Ürün</th>
                        <th>Path</th>
                        <th class="num">Maliyet</th>
                        <th class="num">Kâr</th>
                        <th class="num">Kâr %</th>
                        <th class="num">net gümüş/gün</th>
                        <th class="num">Döngü</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<p class="farming-note is-error">${escapeHtml(state.error)}</p>`;
    }
    if (!state.loaded) {
        return `<p class="farming-note">Fiyatlar yükleniyor…</p>`;
    }

    const stamp = formatDateTime(latestPriceDate());
    return `
        <div id="islandPlannerResult">
            ${renderSummary()}
            ${renderSlotsTable()}
            ${renderRunnersUp()}
            <p class="farming-note">
                ${escapeHtml(feeMetaText(state.premium))}
                · livestock yem ×${LIVESTOCK_FEED} (wiki)
                · maliyet / kâr bir plot · bir döngü (net = satış − maliyet; vergi + setup dahil)
                · net gümüş/gün = net kâr ÷ döngü × 24s
                · oyun 22s → plan 24s (1 gün; +2s slack)
                · sulama ${state.water ? 'açık' : 'kapalı'} (Ayarlar)
                · alış ${escapeHtml(cityLabel(state.islandCity))} · satış ${escapeHtml(cityLabel(state.sellCity))}
                ${stamp ? ` · ${escapeHtml(stamp)}` : ''}
            </p>
        </div>
    `;
}

function refreshOutput(container) {
    runPlan();
    const resultHost = container.querySelector('.tool-split-result');
    if (resultHost) {
        resultHost.innerHTML = renderOutput();
        bindCalcSticky(container);
    }
}

function syncToggleGroup(container, dataAttr, current) {
    const value = current === true || current === false
        ? (current ? '1' : '0')
        : String(current);
    container.querySelectorAll(`[data-${dataAttr}]`).forEach((button) => {
        const pressed = button.getAttribute(`data-${dataAttr}`) === value;
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

function syncControls(container) {
    syncToggleGroup(container, 'premium', state.premium);
    syncToggleGroup(container, 'focus', state.focus);

    const islandCity = container.querySelector('#islandCity');
    if (islandCity && islandCity.value !== state.islandCity) {
        islandCity.value = state.islandCity;
    }
    const sellCity = container.querySelector('#sellCity');
    if (sellCity && sellCity.value !== state.sellCity) {
        sellCity.value = state.sellCity;
    }
    const islandLevel = container.querySelector('#islandLevel');
    if (islandLevel && Number(islandLevel.value) !== state.islandLevel) {
        islandLevel.value = String(state.islandLevel);
    }
    const plotsOverride = container.querySelector('#plotsOverride');
    if (plotsOverride) {
        const next = state.plotsOverride != null ? String(state.plotsOverride) : '';
        if (plotsOverride.value !== next) {
            plotsOverride.value = next;
        }
        plotsOverride.classList.toggle('is-filled', Boolean(next));
    }
    initFloatingLabels(container);
}

/** Sol seçimler değişince planı yeniden hesapla ve sağda göster. */
function applyPlan(container) {
    syncControls(container);
    refreshOutput(container);
}

function renderPage(container) {
    const overrideVal = state.plotsOverride != null ? String(state.plotsOverride) : '';
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Ada Planlayıcı</h1>
            <p>Soldaki seçimlere göre anlık plan. Ada / satış şehri, seviye ve premium değişince sonuç yeniden hesaplanır; sabit plan yok.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="farming-toolbar island-planner-toolbar">
                    ${renderToggle('Premium', [
                        { id: true, value: '1', label: 'Premium' },
                        { id: false, value: '0', label: 'Free' }
                    ], 'premium', state.premium)}
                    ${renderToggle('Focus', [
                        { id: true, value: '1', label: 'Focus' },
                        { id: false, value: '0', label: 'Yok' }
                    ], 'focus', state.focus)}

                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="islandCity">
                            ${renderCityOptions(state.islandCity)}
                        </select>
                        <label for="islandCity">Ada şehri</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="sellCity">
                            ${renderCityOptions(state.sellCity)}
                        </select>
                        <label for="sellCity">Satış şehri</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="islandLevel">
                            ${renderLevelOptions()}
                        </select>
                        <label for="islandLevel">Ada seviyesi</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <input class="form-control${overrideVal ? ' is-filled' : ''}" type="number" min="1" max="16"
                            id="plotsOverride" value="${escapeHtml(overrideVal)}" placeholder=" ">
                        <label for="plotsOverride">Plot override (1–16)</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'islandPlannerRefresh', apiId: 'islandPlannerRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    initFloatingLabels(container);
    applyPlan(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-premium]').forEach((button) => {
        button.addEventListener('click', () => {
            state.premium = button.dataset.premium === '1';
            applyPlan(container);
        });
    });

    container.querySelectorAll('[data-focus]').forEach((button) => {
        button.addEventListener('click', () => {
            state.focus = button.dataset.focus === '1';
            savePrefs();
            applyPlan(container);
        });
    });

    container.querySelector('#islandCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.islandCity = value;
        state.sellCity = value;
        saveCity(CITY_STORAGE_KEY, value);
        saveCity(SELL_CITY_STORAGE_KEY, value);
        applyPlan(container);
    });

    container.querySelector('#sellCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.sellCity = value;
        saveCity(SELL_CITY_STORAGE_KEY, value);
        applyPlan(container);
    });

    container.querySelector('#islandLevel')?.addEventListener('change', (event) => {
        const level = Number(event.target.value);
        if (!ISLAND_PLOTS_BY_LEVEL[level]) {
            return;
        }
        state.islandLevel = level;
        state.plotsOverride = null;
        savePrefs();
        applyPlan(container);
    });

    const plotsInput = container.querySelector('#plotsOverride');
    const onPlotsChange = (event) => {
        const raw = event.target.value.trim();
        if (!raw) {
            state.plotsOverride = null;
        } else {
            const n = Number(raw);
            if (!Number.isFinite(n)) {
                return;
            }
            state.plotsOverride = Math.max(1, Math.min(16, Math.round(n)));
        }
        savePrefs();
        applyPlan(container);
    };
    plotsInput?.addEventListener('change', onPlotsChange);
    plotsInput?.addEventListener('input', onPlotsChange);

    bindPriceRefresh(container, {
        refreshId: 'islandPlannerRefresh',
        apiId: 'islandPlannerRefreshApi',
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
        const rows = await fetchPrices(allPriceItemIds(), locations, { source });
        state.priceIndex = indexPrices(rows);
        state.loaded = true;
        runPlan();
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
        state.plan = null;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (container.querySelector('#islandPlannerResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('islandPlannerTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.water = settings.farmWater === true;
    state.buySide = settings.buyPriceSide;
    state.sellSide = settings.sellPriceSide;
    readPrefs();

    showPageLoader('Ada Planlayıcı yükleniyor…');
    try {
        await initStore();
        state.cities = await loadActiveCities();
        state.islandCity = readSavedCity(CITY_STORAGE_KEY, state.cities, 'Martlock');
        state.sellCity = readSavedCity(SELL_CITY_STORAGE_KEY, state.cities, state.islandCity);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: allPriceItemIds(),
            cities: cityNames(),
            pause: state.livePaused
        }), () => loadPrices(container, { showLoader: false }));
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Yüklenemedi.';
        state.loaded = true;
        renderPage(container);
    } finally {
        hidePageLoader();
    }
}

init();
