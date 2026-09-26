import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { getSettings, cityHasIsland, getDefaultCity } from '../core/settings.js';
import {
    fetchPrices,
    indexPrices,
    priceRefreshActionsHtml,
    bindPriceRefresh,
    priceLoaderMessage,
    applyPriceLoadMode
} from '../core/market.js';
import { fetchHistoryIndex } from '../core/market-history.js';
import { itemIconHtml } from '../components/item-icon.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { initFloatingLabels } from '../components/forms.js';
import { feeMetaText, SETUP_FEE, salesTaxRate } from '../core/market-fees.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { loadActiveCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField, setCityFieldValue } from '../components/city-picker.js';
import { bindLivePrices } from '../core/price-live.js';
import { getEconomyConstant } from '../core/catalog.js';
import {
    calcExplainShell,
    bindCalcExplain,
    explainPanelHtml,
    explainEmptyHtml,
    explainHint,
    explainFlow,
    explainStep,
    explainNum,
    explainOp,
    explainChips,
    explainSaleSteps,
    explainProfitFoot
} from '../utils/calc-explain.js';
import {
    ISLAND_PLOTS_BY_LEVEL,
    plotsForLevel,
    allPriceItemIds,
    optimizeIsland,
    compareIslandCities,
    plotTypeLabel,
    livestockFeed,
    livestockFeedPasture,
    factionMountForCity,
    ledgerGroupLabel
} from '../core/island-economy.js';

const CITY_STORAGE_KEY = 'albiontools.v4.island-planner.islandCity';
const SELL_CITY_STORAGE_KEY = 'albiontools.v4.island-planner.sellCity';
const PREFS_STORAGE_KEY = 'albiontools.v4.island-planner.prefs';

const state = {
    premium: true,
    water: false,
    focus: false,
    islandLevel: 6,
    plotsOverride: null,
    islandCity: getDefaultCity(),
    sellCity: getDefaultCity(),
    buySide: 'buy',
    sellSide: 'sell',
    cities: [],
    priceIndex: null,
    historyIndex: null,
    factionPlots: 0,
    factionTier: 5,
    minVolume: 0,
    loaded: false,
    error: null,
    livePaused: false,
    plan: null,
    cityCompare: []
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
    const preferred = fallback || getDefaultCity();
    if (cities.some((city) => city.marketApiName === preferred)) {
        return preferred;
    }
    return cities[0]?.marketApiName ?? preferred;
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
        const fp = Number(parsed.factionPlots);
        if (Number.isFinite(fp)) {
            state.factionPlots = Math.max(0, Math.min(16, Math.round(fp)));
        }
        state.factionTier = Number(parsed.factionTier) === 8 ? 8 : 5;
        const mv = Number(parsed.minVolume);
        if (Number.isFinite(mv) && mv >= 0) {
            state.minVolume = mv;
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
            plotsOverride: state.plotsOverride,
            factionPlots: state.factionPlots,
            factionTier: state.factionTier,
            minVolume: state.minVolume
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

function formatFarms(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function planActivityIds() {
    return new Set((state.plan?.slots || []).map((slot) => slot.activityId).filter(Boolean));
}

function recommendedLabel(plan) {
    if (plan?.recommended === 'chain') {
        return 'Zincir';
    }
    if (plan?.recommended === 'mix') {
        return 'Karışık';
    }
    return 'Sade';
}

function explainIcon(uniqueName) {
    return itemIconHtml(uniqueName, { className: 'item-icon calc-explain-icon' });
}

function explainKeyForSlot(slot, start) {
    return `${slot.activityId || slot.label}|${slot.role || 'cash'}|${start}`;
}

function ledgerExplainKey(row) {
    return `ledger|${row.id}`;
}

function collectExplainRows() {
    const plan = state.plan;
    const rows = [];
    if (plan?.slots?.length) {
        for (const group of groupSlots(plan.slots)) {
            rows.push({
                key: explainKeyForSlot(group.slot, group.start),
                slot: group.slot,
                count: group.count
            });
        }
    }
    for (const row of plan?.ledger || []) {
        rows.push({
            key: ledgerExplainKey(row),
            slot: row,
            count: 1,
            ledger: true
        });
    }
    for (const row of plan?.runnersUp || []) {
        rows.push({
            key: `runner|${row.activityId || row.label}`,
            slot: row,
            count: 1,
            runner: true
        });
    }
    return rows;
}

function findExplainRow(key) {
    return collectExplainRows().find((row) => row.key === key) ?? null;
}

function readMinVolumeField() {
    try {
        const el = document.querySelector('#minVolume');
        if (!el) {
            return;
        }
        const raw = String(el.value || '').trim();
        state.minVolume = raw ? Math.max(0, Number(raw) || 0) : 0;
    } catch {
        /* ignore */
    }
}

function runPlan() {
    readMinVolumeField();
    if (!state.priceIndex) {
        state.plan = null;
        state.cityCompare = [];
        return;
    }
    const settings = getSettings();
    state.water = settings.farmWater === true;
    const opts = {
        plots: effectivePlots(),
        premium: state.premium,
        water: state.water,
        focus: state.focus,
        islandCity: state.islandCity,
        sellCity: state.sellCity,
        buySide: state.buySide,
        sellSide: state.sellSide,
        priceIndex: state.priceIndex,
        historyIndex: state.historyIndex,
        factionPlots: state.factionPlots,
        factionTier: state.factionTier,
        minVolume: state.minVolume
    };
    state.plan = optimizeIsland(opts);
    const islandCities = state.cities
        .filter((c) => cityHasIsland(c.marketApiName))
        .map((c) => c.marketApiName);
    state.cityCompare = compareIslandCities(opts, islandCities);
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

function cityIslandDecorate(city) {
    if (cityHasIsland(city.marketApiName)) {
        return {};
    }
    return { muted: true, hint: 'ada yok' };
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
    const rec = recommendedLabel(plan);
    const alt = plan.recommended === 'simple' ? plan.chain : plan.simple;
    const faction = plan.faction;
    const stable = plan.totalStableDay;
    return `
        <div class="island-planner-summary">
            <p class="island-planner-total">
                <strong>${formatSilver(plan.totalDay)}</strong>
                <span>ham gümüş/gün · ${effectivePlots()} plot · önerilen: ${escapeHtml(rec)}</span>
                <span class="island-planner-cities">alış ${escapeHtml(cityLabel(state.islandCity))} → satış ${escapeHtml(cityLabel(state.sellCity))}</span>
            </p>
            <p class="island-planner-objective">Hedef: ham gümüş/gün = Σ (plot kârı ÷ döngü saati × 24). İstikrar sıralamaz, elemez veya “önerilen”i değiştirmez.</p>
            <p class="island-planner-feed">${escapeHtml(plan.feedNote || '—')}</p>
            ${Number.isFinite(stable) ? `
                <p class="farming-note">İstikrar (bilgi): ${formatSilver(stable)} gümüş/gün · likidite × volatilite cezası. İnce pazar satırları durur; yalnızca uyarıdır.</p>
            ` : ''}
            ${state.minVolume > 0 ? `
                <p class="farming-note">İnce pazar eşiği ${escapeHtml(String(state.minVolume))}/gün: hacmi düşük (veya geçmişi olmayan) satırlar işaretlenir; sıralama ve öneri değişmez.</p>
            ` : ''}
            ${faction ? `
                <p class="farming-note">Faction kilit: ${faction.plots}× kennel T${faction.tier} ${escapeHtml(faction.label)} (kennel plotun olmalı).</p>
            ` : ''}
            ${uniform ? `
                <p class="farming-note">Bu planda tüm plotlar aynı aktiviteye verildi — karışık bir dağılım ham gümüş/günü artırmıyor.</p>
            ` : ''}
            ${alt ? `
                <p class="island-planner-compare farming-note">
                    Alternatif ${escapeHtml(alt.label)}: ${formatSilver(alt.totalDay)} ham gümüş/gün
                    · fark ${formatSilver((alt.totalDay || 0) - (plan.totalDay || 0), { signed: true })}
                </p>
            ` : ''}
            ${cmp ? `
                <p class="island-planner-compare farming-note">
                    Sade pazar: ${formatSilver(cmp.marketDay)} · seçilen ${formatSilver(cmp.chosenDay)}
                    · fark ${formatSilver(cmp.delta, { signed: true })}
                    ${cmp.choseIslandFeed ? ' · ada yemi / karışık' : ''}
                </p>
            ` : ''}
        </div>
    `;
}

function renderCityCompare() {
    const list = state.cityCompare;
    if (!list?.length) {
        return '';
    }
    const rows = list.map((row) => `
        <tr${row.city === state.islandCity ? ' class="is-active-city"' : ''}>
            <td>${escapeHtml(cityLabel(row.city))}</td>
            <td>
                ${row.iconId ? itemIconHtml(row.iconId, { className: 'item-icon' }) : ''}
                ${escapeHtml(row.label)}
                ${row.pathLabel ? `<span class="farming-item-meta">${escapeHtml(row.pathLabel)}</span>` : ''}
            </td>
            <td class="num">${formatSilver(row.totalDay)}</td>
            <td>${escapeHtml(recommendedLabel(row))}</td>
        </tr>
    `).join('');
    return `
        <h2 class="island-planner-subhead">Şehir karşılaştırması</h2>
        <p class="farming-note">Her ada şehri için ham gümüş/gün (aynı plot / premium / satış şehri ayarları).</p>
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table island-planner-table calc-table">
                <thead>
                    <tr>
                        <th>Ada</th>
                        <th>Ana ürün</th>
                        <th class="num">ham gümüş/gün</th>
                        <th>Plan</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
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
        } else if (part === 'ince pazar' || part === 'satış zor') {
            bonuses.push(part);
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

function slotIsThin(slot) {
    if (slot?.thinMarket === true) {
        return true;
    }
    if (!(state.minVolume > 0)) {
        return false;
    }
    if (Number.isFinite(slot?.avgItemCount)) {
        return slot.avgItemCount < state.minVolume;
    }
    return true;
}

function renderProductCell(slot) {
    const { bonuses, notes } = splitDetail(slot.detail);
    if (slotIsThin(slot) && !bonuses.includes('ince pazar')) {
        bonuses.unshift('ince pazar');
    }
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
                <th class="num island-planner-col-day">ham gümüş/gün</th>
                <th class="num">bugün/gün</th>
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
                        <tr><td colspan="10">Henüz plan yok.</td></tr>
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
            <tr data-explain-key="${escapeHtml(explainKeyForSlot(slot, group.start))}">
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
                    ${Number.isFinite(slot.stablePerDay)
                        ? `<span class="island-planner-day-stable">istikrar ${formatSilver(slot.stablePerDay)}</span>`
                        : ''}
                </td>
                <td class="num">${formatSilver(slot.spotPerDay)}</td>
                <td class="num">${formatHours(slot.hours)}</td>
            </tr>
        `;
    }).join('');

    return `
        ${renderAllocationChips(groups)}
        <div class="table-responsive calc-table-wrap" data-calc-table>
            <table class="table table-striped farming-table island-planner-table calc-table" data-island-explain-table="plan">
                ${head}
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderMissingFlags(missing) {
    if (!missing?.length) {
        return '<span class="island-ledger-ok">fiyat tam</span>';
    }
    return missing.map((label) => (
        `<span class="farming-bonus island-planner-tag island-ledger-missing">${escapeHtml(label)}</span>`
    )).join('');
}

function renderLedgerDayCell(row) {
    const opp = row.opportunity;
    const dayClass = Number.isFinite(row.perDay)
        ? (row.perDay > 0 ? ' is-profit' : row.perDay < 0 ? ' is-loss' : '')
        : ' is-missing';
    return `
        <span class="island-planner-day farming-num${dayClass}">${formatSilver(row.perDay, { signed: true })}</span>
        ${row.feedMode === 'island' ? `
            <span class="island-planner-day-stable">tohum · pasture</span>
            ${Number.isFinite(opp?.chainAvgPerDay) ? `
                <span class="island-ledger-chain">zincir ${formatSilver(opp.chainAvgPerDay, { signed: true })}/plot</span>
            ` : ''}
            ${Number.isFinite(opp?.farmsPerPasture) ? `
                <span class="island-ledger-opp">+${escapeHtml(formatFarms(opp.farmsPerPasture))} farm ${escapeHtml(opp.feedCropLabel || '')}</span>
            ` : ''}
            ${Number.isFinite(opp?.oppCostPerDay) ? `
                <span class="island-ledger-opp">fırsat ${formatSilver(opp.oppCostPerDay)}/gün</span>
            ` : ''}
        ` : ''}
    `;
}

function renderLedger() {
    const list = state.plan?.ledger;
    const chosen = planActivityIds();
    const head = `
        <thead>
            <tr>
                <th>Grup</th>
                <th>Ad</th>
                <th class="island-planner-col-path">Path</th>
                <th class="island-planner-col-type">Plot</th>
                <th class="num">Maliyet</th>
                <th class="num">Gelir</th>
                <th class="num">Kâr</th>
                <th class="num island-planner-col-day">ham gümüş/gün</th>
                <th>Eksik fiyat</th>
                <th>Neden</th>
            </tr>
        </thead>
    `;
    if (!list?.length) {
        return `
            <h2 class="island-planner-subhead">Aday defteri</h2>
            <p class="farming-note">Plan hesaplanınca tüm ekin / ot / hayvan path’leri burada görünür.</p>
            <div class="table-responsive calc-table-wrap">
                <table class="table table-striped farming-table island-planner-table island-ledger-table calc-table">
                    ${head}
                    <tbody>
                        <tr><td colspan="10">Henüz aday yok.</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    const rows = list.map((row) => {
        const profitClass = Number.isFinite(row.profit)
            ? (row.profit > 0 ? ' is-profit' : row.profit < 0 ? ' is-loss' : '')
            : (row.missing?.length ? ' is-missing' : '');
        const inPlan = chosen.has(row.activityId);
        const typeLabel = plotTypeLabel(row.plotType);
        return `
            <tr data-explain-key="${escapeHtml(ledgerExplainKey(row))}"${inPlan ? ' class="is-in-plan"' : ''}${row.missing?.length ? ' data-missing="1"' : ''}>
                <td>
                    <span class="island-planner-type island-planner-type--${escapeHtml(row.plotType)}">${escapeHtml(row.groupLabel || ledgerGroupLabel(row.group))}</span>
                    ${inPlan ? '<span class="farming-bonus island-planner-tag">planda</span>' : ''}
                </td>
                <td>
                    <span class="farming-item">
                        ${row.iconId ? itemIconHtml(row.iconId, { className: 'item-icon' }) : ''}
                        <span>
                            <span class="farming-item-name">${escapeHtml(row.name)}</span>
                            ${row.feedLabel ? `<span class="farming-item-meta">${escapeHtml(row.feedLabel)}</span>` : ''}
                        </span>
                    </span>
                </td>
                <td class="island-planner-col-path">${escapeHtml(row.pathLabel || '—')}</td>
                <td class="island-planner-col-type">
                    <span class="island-planner-type island-planner-type--${escapeHtml(row.plotType)}">${escapeHtml(typeLabel)}</span>
                </td>
                <td class="num farming-num${row.missing?.length && !Number.isFinite(row.cost) ? ' is-missing' : ''}">${formatSilver(row.cost)}</td>
                <td class="num farming-num">${formatSilver(row.revenue)}</td>
                <td class="num farming-num${profitClass}">${formatSilver(row.profit, { signed: true })}</td>
                <td class="num island-planner-col-day">${renderLedgerDayCell(row)}</td>
                <td>${renderMissingFlags(row.missing)}</td>
                <td class="island-ledger-why">${escapeHtml(row.why || '—')}</td>
            </tr>
        `;
    }).join('');

    return `
        <h2 class="island-planner-subhead">Aday defteri</h2>
        <p class="farming-note">
            Tüm ada çıktıları (ekin/ot satışı; hayvan büyüt / kes / besle; pazar ve ada yemi).
            Sıra ham gümüş/gün (plot başına, önericinin skoru). Zarar ve eksik fiyat gizlenmez.
            Ada yemi satırında büyük rakam tohum maliyetli pasture-only’dir; zincir/fırsat yem plotunun satılmadığını gösterir.
            Satıra tıklayınca formül açılır.
        </p>
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table island-planner-table island-ledger-table calc-table" data-island-explain-table="ledger">
                ${head}
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="farming-note island-planner-note">
            Ham gümüş/gün sıralaması önericiyle aynı metriktir; ada yemi satırı “en yüksek pasture” olabilir diye zinciri kazanmaz.
            Cow + ada yemi vs burdock karşılaştırması: burdock satırına ve ineğin pazar / ada yemi path’lerine bakın.
        </p>
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
            <tr data-explain-key="${escapeHtml(`runner|${row.activityId || row.label}`)}">
                <td class="num">${i + 1}</td>
                <td>
                    <span class="island-planner-type island-planner-type--${escapeHtml(row.plotType)}">${escapeHtml(plotTypeLabel(row.plotType))}</span>
                </td>
                <td>${renderProductCell(row)}</td>
                <td>${escapeHtml(row.pathLabel || '—')}</td>
                <td class="num">${formatSilver(row.cost)}</td>
                <td class="num farming-num${profitClass}">${formatSilver(row.profit, { signed: true })}</td>
                <td class="num farming-num${profitClass}">${formatPct(row.profitPct)}</td>
                <td class="num">
                    ${formatSilver(row.perDay)}
                    ${Number.isFinite(row.stablePerDay)
                        ? `<span class="island-planner-day-stable">istikrar ${formatSilver(row.stablePerDay)}</span>`
                        : ''}
                </td>
                <td class="num">${formatSilver(row.spotPerDay)}</td>
                <td class="num">${formatHours(row.hours)}</td>
            </tr>
        `;
    }).join('');

    return `
        <h2 class="island-planner-subhead">Alternatifler (plot başına)</h2>
        <p class="farming-note">Ham gümüş/gün sırasıyla seçilmeyen adaylar. İnce pazar elenmez. “Bugün” kolonu spot fiyattır — spike olabilir. Satıra tıklayınca formül açılır.</p>
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped farming-table island-planner-table calc-table" data-island-explain-table="runners">
                <thead>
                    <tr>
                        <th class="num">#</th>
                        <th>Tip</th>
                        <th>Ürün</th>
                        <th>Path</th>
                        <th class="num">Maliyet</th>
                        <th class="num">Kâr</th>
                        <th class="num">Kâr %</th>
                        <th class="num">ham gümüş/gün</th>
                        <th class="num">bugün/gün</th>
                        <th class="num">Döngü</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderPlannerExplain(key, { hovered } = {}) {
    const found = findExplainRow(key);
    if (!found?.slot?.explain) {
        return explainEmptyHtml('Bu satırın formülü yok. Tabloda bir ürüne gelin veya tıklayın.');
    }
    const slot = found.slot;
    const ex = slot.explain;
    const tax = salesTaxRate(state.premium);
    const opp = slot.opportunity || ex.opportunity;
    const chips = explainChips([
        ...(ex.chips || []),
        found.ledger ? { label: 'defter', html: '<span class="calc-explain-n">aday</span>' } : null,
        found.runner ? { label: 'aday', html: '<span class="calc-explain-n">alternatif</span>' } : null,
        !found.ledger && !found.runner
            ? { label: `${found.count}× plot`, tone: 'qty', value: found.count, kind: 'qty' }
            : null,
        slot.missing?.length
            ? { label: 'eksik fiyat', html: `<span class="calc-explain-n is-loss">${escapeHtml(slot.missing.join(', '))}</span>` }
            : null,
        slotIsThin(slot) ? { label: 'ince pazar', html: '<span class="calc-explain-n is-loss">uyarı</span>' } : null,
        slot.lowLiquidity && !slotIsThin(slot) ? { label: 'satış zor', html: '<span class="calc-explain-n is-loss">uyarı</span>' } : null
    ].filter(Boolean));

    const groups = [];

    groups.push({
        title: 'Fiyat kaynağı',
        tone: 'buy',
        intro: chips,
        lines: [
            explainStep({
                label: 'Alış',
                note: ex.priceBasis?.buy || 'max(spot, medyan)',
                result: ex.inputs?.seedPrice ?? ex.inputs?.babyPrice ?? ex.costs?.unit ?? null,
                resultKind: 'price',
                resultCap: 'kullanılan alış'
            }),
            explainStep({
                label: 'Satış',
                note: ex.priceBasis?.sell || 'medyan (yoksa spot)',
                result: ex.sale?.price ?? null,
                resultKind: 'price',
                resultCap: 'kullanılan satış'
            }),
            ...(ex.diffs || []).map((text) => explainStep({
                label: 'Fark / not',
                note: text
            }))
        ]
    });

    if (ex.kind === 'plant' || ex.kind === 'feed') {
        const keep = 1 - (ex.inputs?.usedReturn ?? 0);
        groups.push({
            title: 'Birim maliyet (Farming formülü)',
            tone: 'cost',
            lines: [
                explainStep({
                    icon: explainIcon(ex.inputs?.seedId),
                    label: 'Net tohum',
                    note: ex.inputs?.seedSetup ? 'Tohum × ödenen pay × setup' : 'Tohum × ödenen pay',
                    formula: ex.inputs?.seedSetup
                        ? [
                            explainNum(ex.inputs?.seedPrice, { tone: 'price', cap: 'tohum' }),
                            explainOp('×'),
                            explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen' }),
                            explainOp('×'),
                            explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                        ]
                        : [
                            explainNum(ex.inputs?.seedPrice, { tone: 'price', cap: 'tohum' }),
                            explainOp('×'),
                            explainNum(keep, { kind: 'pct', tone: 'rr', cap: 'ödenen' })
                        ],
                    result: ex.costs?.netSeed,
                    resultKind: 'cost',
                    resultCap: 'net tohum'
                }),
                explainStep({
                    icon: explainIcon(ex.sale?.itemId || slot.iconId),
                    label: 'Birim',
                    note: `Net tohum / verim (${ex.inputs?.yieldSource === 'user' ? `ada ort. n=${ex.inputs.yieldN}` : 'standart'})`,
                    formula: [
                        explainNum(ex.costs?.netSeed, { tone: 'cost', cap: 'net tohum' }),
                        explainOp('/'),
                        explainNum(ex.inputs?.harvestQty, { kind: 'qty', cap: 'verim' })
                    ],
                    result: ex.costs?.unit,
                    resultKind: 'cost',
                    resultCap: 'birim'
                }),
                explainStep({
                    label: 'Plot maliyet',
                    note: `Birim × ${ex.inputs?.slots || 9} slot × verim`,
                    formula: [
                        explainNum(ex.costs?.unit, { tone: 'cost', cap: 'birim' }),
                        explainOp('×'),
                        explainNum(ex.inputs?.yieldPlot, { kind: 'qty', cap: 'hasat' })
                    ],
                    result: ex.costs?.plotCost ?? ex.cycle?.cost,
                    resultKind: 'cost',
                    resultCap: 'plot'
                })
            ]
        });
    }

    if (ex.kind === 'animal') {
        groups.push({
            title: 'Maliyet (Pasture path matematiği)',
            tone: 'cost',
            lines: [
                explainStep({
                    icon: explainIcon(ex.inputs?.babyId),
                    label: 'Yavru net',
                    note: ex.inputs?.babySetup ? 'Alış + setup' : 'Anında alış (setup yok)',
                    formula: ex.inputs?.babySetup
                        ? [
                            explainNum(ex.inputs?.babyPrice, { tone: 'price', cap: 'yavru' }),
                            explainOp('×'),
                            explainNum(1 + SETUP_FEE, { kind: 'factor', tone: 'fee', cap: 'setup' })
                        ]
                        : [explainNum(ex.inputs?.babyPrice, { tone: 'price', cap: 'yavru' })],
                    result: ex.costs?.babyNet,
                    resultKind: 'cost',
                    resultCap: 'yavru net'
                }),
                explainStep({
                    label: `Yem ×${ex.inputs?.feedQty ?? '—'}`,
                    note: [
                        ex.inputs?.feedSource === 'island' ? 'Ada birim maliyeti' : (ex.inputs?.feedSource === 'mixed' ? 'Ada + pazar karışık' : 'Pazar birim'),
                        Number.isFinite(ex.inputs?.feedQtyIsland) && Number.isFinite(ex.inputs?.feedQtyPasture) && ex.inputs.feedQtyIsland !== ex.inputs.feedQtyPasture
                            ? `ada ×${ex.inputs.feedQtyIsland} / pasture ×${ex.inputs.feedQtyPasture}`
                            : null
                    ].filter(Boolean).join(' · '),
                    formula: [
                        explainNum(ex.inputs?.feedQty, { kind: 'qty', cap: 'adet' }),
                        explainOp('×'),
                        explainNum(ex.inputs?.feedUnit, { tone: 'cost', cap: 'yem birim' })
                    ],
                    result: ex.costs?.feedCost,
                    resultKind: 'cost',
                    resultCap: 'yem'
                }),
                explainStep({
                    label: 'Hayvan maliyeti',
                    note: ex.pathId === 'feed' ? 'Yalnız yem (besle)' : 'Yavru + yem',
                    formula: ex.pathId === 'feed'
                        ? [explainNum(ex.costs?.feedCost, { tone: 'cost', cap: 'yem' })]
                        : [
                            explainNum(ex.costs?.babyNet, { tone: 'cost', cap: 'yavru' }),
                            explainOp('+'),
                            explainNum(ex.costs?.feedCost, { tone: 'cost', cap: 'yem' })
                        ],
                    result: ex.cycle?.pathCost ?? ex.costs?.unitCost,
                    resultKind: 'cost',
                    resultCap: 'hayvan'
                }),
                explainStep({
                    label: `Plot ×${ex.inputs?.pens ?? '—'} ağıt`,
                    note: 'Bir pasture / kennel plot',
                    formula: [
                        explainNum(ex.cycle?.pathCost ?? ex.costs?.unitCost, { tone: 'cost', cap: 'hayvan' }),
                        explainOp('×'),
                        explainNum(ex.inputs?.pens, { kind: 'qty', cap: 'ağıt' })
                    ],
                    result: ex.cycle?.cost,
                    resultKind: 'cost',
                    resultCap: 'plot'
                })
            ]
        });
        if (Number.isFinite(ex.inputs?.chance)) {
            groups.push({
                title: 'Yavru iadesi',
                tone: 'rr',
                lines: [
                    explainStep({
                        icon: explainIcon(ex.inputs?.babyId),
                        label: 'Yavru kredisi',
                        note: state.focus ? 'Focus açık: iade + water bonus' : 'Focus yok: taban iade',
                        formula: [
                            explainNum(ex.inputs.chance, { kind: 'pct', tone: state.focus ? 'focus' : 'rr', cap: 'ihtimal' }),
                            explainOp('×'),
                            explainNum(ex.inputs.babyPrice, { tone: 'price', cap: 'yavru fiyat' })
                        ],
                        result: ex.sale?.babyCredit,
                        resultKind: 'sell',
                        resultCap: 'kredi'
                    })
                ]
            });
        }
    }

    const saleLines = explainSaleSteps({
        price: ex.sale?.price,
        tax: ex.sale?.tax ?? tax,
        setup: ex.sale?.setup === true,
        sell: ex.sale?.netUnit,
        label: 'Satış fiyatı',
        icon: explainIcon(ex.sale?.itemId || slot.iconId)
    });
    if (Number.isFinite(ex.sale?.qty) && ex.sale.qty !== 1) {
        saleLines.push(explainStep({
            label: `Miktar ×${ex.sale.qty}`,
            note: 'Net birim × adet',
            formula: [
                explainNum(ex.sale.netUnit, { tone: 'sell', cap: 'net birim' }),
                explainOp('×'),
                explainNum(ex.sale.qty, { kind: 'qty', cap: 'adet' })
            ],
            result: Number.isFinite(ex.sale.netUnit) ? ex.sale.netUnit * ex.sale.qty : null,
            resultKind: 'sell',
            resultCap: 'ürün'
        }));
    }
    if (Number.isFinite(ex.sale?.babyCredit) && ex.sale.babyCredit !== 0) {
        saleLines.push(explainStep({
            label: 'Gelir',
            note: 'Net satış + yavru kredisi',
            formula: [
                explainNum(
                    Number.isFinite(ex.sale.netUnit)
                        ? ex.sale.netUnit * (ex.sale.qty ?? 1)
                        : null,
                    { tone: 'sell', cap: 'ürün' }
                ),
                explainOp('+'),
                explainNum(ex.sale.babyCredit, { tone: 'sell', cap: 'kredi' })
            ],
            result: ex.kind === 'animal' ? ex.sale.revenue : ex.cycle?.revenue,
            resultKind: 'sell',
            resultCap: 'gelir'
        }));
    }
    groups.push({
        title: ex.kind === 'feed' ? 'Fazla yem satışı' : 'Satış',
        tone: 'sell',
        lines: saleLines
    });

    if (opp) {
        groups.push({
            title: 'Fırsat maliyeti (ada yemi)',
            tone: 'rr',
            lines: [
                explainStep({
                    label: 'Pasture-only',
                    note: 'Tohum maliyetli yem · yalnızca hayvan plotu. Ada optimumu bu değil.',
                    result: opp.seedOnlyPerDay ?? slot.perDay,
                    resultKind: 'profit',
                    resultCap: 'ham/gün',
                    signed: true
                }),
                explainStep({
                    label: 'Yem farm',
                    note: `${opp.feedCropLabel || 'yem'} · 1 pasture için ~${formatFarms(opp.farmsPerPasture)} farm plot`,
                    formula: [
                        explainNum(opp.farmsPerPasture, { kind: 'qty', cap: 'farm/pasture' })
                    ]
                }),
                explainStep({
                    label: 'Fırsat',
                    note: 'O farm plotlar ekin olarak satılsaydı (plot × ham/gün)',
                    formula: [
                        explainNum(opp.farmsPerPasture, { kind: 'qty', cap: 'farm' }),
                        explainOp('×'),
                        explainNum(opp.cropSellPerDay, { tone: 'profit', cap: 'ekin/gün', signed: true })
                    ],
                    result: opp.oppCostPerDay,
                    resultKind: 'profit',
                    resultCap: 'fırsat/gün',
                    signed: true
                }),
                explainStep({
                    label: 'Zincir ortalama',
                    note: 'Pasture ham/gün ÷ (1 + farm/pasture). Burdock gibi tek-plot satırla bunu karşılaştırın.',
                    formula: [
                        explainNum(opp.seedOnlyPerDay ?? slot.perDay, { tone: 'profit', cap: 'pasture', signed: true }),
                        explainOp('/'),
                        explainNum(opp.chainPlots, { kind: 'qty', cap: 'plot' })
                    ],
                    result: opp.chainAvgPerDay,
                    resultKind: 'profit',
                    resultCap: 'zincir/plot',
                    signed: true
                })
            ]
        });
    }

    groups.push({
        title: 'Ham gümüş/gün',
        tone: 'point',
        lines: [
            explainStep({
                label: 'Plot kârı',
                note: 'Bir plot · bir döngü',
                formula: [
                    explainNum(ex.cycle?.revenue, { tone: 'sell', cap: 'gelir' }),
                    explainOp('−'),
                    explainNum(ex.cycle?.cost, { tone: 'cost', cap: 'maliyet' })
                ],
                result: ex.cycle?.profit,
                resultKind: 'profit',
                resultCap: 'kâr',
                signed: true
            }),
            explainStep({
                label: 'Ham gümüş/gün',
                note: 'Kâr ÷ döngü × 24s — sıralama ve öneri bunu kullanır',
                formula: [
                    explainNum(ex.cycle?.profit, { tone: 'profit', cap: 'kâr', signed: true }),
                    explainOp('/'),
                    explainNum(ex.cycle?.hours, { kind: 'qty', cap: 'saat' }),
                    explainOp('×'),
                    explainNum(24, { kind: 'qty', cap: 'gün' })
                ],
                result: ex.cycle?.rawPerDay,
                resultKind: 'profit',
                resultCap: 'ham/gün',
                signed: true
            }),
            explainStep({
                label: 'İstikrar (bilgi)',
                note: 'Ham × likidite × volatilite cezası. Sıralamaz, elemez.',
                formula: [
                    explainNum(ex.stability?.rawPerDay, { tone: 'profit', cap: 'ham', signed: true }),
                    explainOp('×'),
                    explainNum(ex.stability?.liquidity, { kind: 'pct', tone: 'rr', cap: 'likidite' }),
                    explainOp('×'),
                    explainNum(ex.stability?.volPenalty, { kind: 'factor', tone: 'fee', cap: 'vol' })
                ],
                result: ex.stability?.stablePerDay,
                resultKind: 'profit',
                resultCap: 'istikrar/gün',
                signed: true
            })
        ]
    });

    const dayTotal = Number.isFinite(slot.perDay) ? slot.perDay * found.count : null;
    return explainPanelHtml({
        icon: explainIcon(ex.iconId || slot.iconId),
        title: ex.title || `${slot.label} · ${slot.pathLabel || ''}`.trim(),
        hint: explainHint(hovered),
        flow: explainFlow([
            { icon: explainIcon(ex.iconId || slot.iconId), label: 'Maliyet', value: ex.cycle?.cost, tone: 'cost' },
            { label: 'Gelir', value: ex.cycle?.revenue, tone: 'sell' },
            {
                label: (ex.cycle?.profit ?? 0) < 0 ? 'Zarar' : 'Kâr',
                value: ex.cycle?.profit,
                tone: (ex.cycle?.profit ?? 0) < 0 ? 'loss' : 'profit',
                signed: true
            },
            {
                label: 'Ham/gün',
                value: ex.cycle?.rawPerDay,
                tone: 'profit',
                signed: true
            }
        ]),
        groups,
        footer: `
            ${explainProfitFoot({
                sell: ex.cycle?.revenue,
                cost: ex.cycle?.cost,
                profit: ex.cycle?.profit,
                pct: ex.cycle?.profitPct
            })}
            ${found.count > 1 && dayTotal != null ? `
                <p class="farming-note">${found.count} plot × ${formatSilver(slot.perDay)} = ${formatSilver(dayTotal)} ham gümüş/gün.</p>
            ` : ''}
        `
    });
}

function bindPlannerExplain(container) {
    const panel = container.querySelector('#islandPlannerExplain');
    const table = container.querySelector('[data-island-explain-table="plan"]')
        || container.querySelector('.island-planner-table');
    if (!panel || !table) {
        return;
    }
    bindCalcExplain({
        panel,
        table,
        rowKey: (tr) => tr.dataset.explainKey,
        keys: () => collectExplainRows().map((row) => row.key),
        defaultKey: () => collectExplainRows()[0]?.key ?? null,
        render: (key, meta) => renderPlannerExplain(key, meta)
    });

    const extraTables = [...container.querySelectorAll('[data-island-explain-table="ledger"], [data-island-explain-table="runners"]')];
    const paintKey = (key, source) => {
        if (!key) {
            return;
        }
        table.querySelectorAll('tbody tr').forEach((tr) => {
            tr.classList.toggle('is-explain', false);
            tr.classList.toggle('is-explain-hover', false);
        });
        extraTables.forEach((extra) => {
            extra.querySelectorAll('tbody tr').forEach((tr) => {
                tr.classList.toggle('is-explain', extra === source && tr.dataset.explainKey === key);
            });
        });
        panel.innerHTML = renderPlannerExplain(key, { hovered: false });
    };
    extraTables.forEach((extra) => {
        if (extra.dataset.explainBound === 'on') {
            return;
        }
        extra.dataset.explainBound = 'on';
        extra.addEventListener('click', (event) => {
            const tr = event.target instanceof Element ? event.target.closest('tbody tr') : null;
            if (tr?.dataset.explainKey) {
                paintKey(tr.dataset.explainKey, extra);
            }
        });
    });
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
            ${renderLedger()}
            ${calcExplainShell('islandPlannerExplain')}
            ${renderCityCompare()}
            ${renderRunnersUp()}
            <p class="farming-note">
                ${escapeHtml(feeMetaText(state.premium))}
                · hedef ham gümüş/gün = plot kârı ÷ döngü × 24s
                · alış max(spot, ~${getEconomyConstant('farm_history_days', 14)}g medyan) · satış medyan (Farming/Pasture spot kullanır)
                · livestock ada yemi ×${livestockFeed()} (Pasture ×${livestockFeedPasture()})
                · path = ham gümüş; Pasture “en iyi” = kâr %
                · hayvan et/ürün adedine ada şehir +10% uygulanır (Pasture uygulamaz)
                · istikrar = ham × likidite × vol cezası — bilgi / uyarı, sıralama değil
                · maliyet / kâr bir plot · bir döngü
                · sulama ${state.water ? 'açık' : 'kapalı'} (Ayarlar)
                · ince pazar eşiği ${state.minVolume || 'yok'} (uyarı; eleme yok)
                · alış ${escapeHtml(cityLabel(state.islandCity))} · satış ${escapeHtml(cityLabel(state.sellCity))}
                · <a href="../../pages/logs/island-yields.html">Ada Çıktı</a> kayıtları varsa yield ortalaması kullanılır
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
        bindPlannerExplain(container);
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

    setCityFieldValue(container, 'islandCity', state.islandCity);
    setCityFieldValue(container, 'sellCity', state.sellCity);
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
    const factionPlots = container.querySelector('#factionPlots');
    if (factionPlots) {
        const next = state.factionPlots ? String(state.factionPlots) : '';
        if (factionPlots.value !== next) {
            factionPlots.value = next;
        }
        factionPlots.classList.toggle('is-filled', Boolean(next));
    }
    const factionTier = container.querySelector('#factionTier');
    if (factionTier && Number(factionTier.value) !== state.factionTier) {
        factionTier.value = String(state.factionTier);
    }
    const minVolume = container.querySelector('#minVolume');
    if (minVolume) {
        const next = state.minVolume ? String(state.minVolume) : '';
        if (minVolume.value !== next) {
            minVolume.value = next;
        }
        minVolume.classList.toggle('is-filled', Boolean(next));
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
    const factionAvail = factionMountForCity(state.islandCity, state.factionTier);
    container.innerHTML = `
        <section class="farming-hero">
            <h1>Ada Planlayıcı</h1>
            <p>Ada plotlarını <strong>ham gümüş/gün</strong> (zaman-normalize kâr) için planlar. Aday defteri her path’in maliyet / gelir / kârını ve ada yemi fırsat maliyetini canlı gösterir. Likidite ve volatilite yalnızca uyarıdır; ince pazar elenmez.</p>
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

                    ${cityFieldHtml({
                        id: 'islandCity',
                        label: 'Ada şehri',
                        selected: state.islandCity,
                        cities: state.cities,
                        decorate: cityIslandDecorate
                    })}
                    ${cityFieldHtml({
                        id: 'sellCity',
                        label: 'Satış şehri',
                        selected: state.sellCity,
                        cities: state.cities,
                        decorate: cityIslandDecorate
                    })}
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
                    <div class="form-floating farming-city-field">
                        <input class="form-control${state.factionPlots ? ' is-filled' : ''}" type="number" min="0" max="16"
                            id="factionPlots" value="${state.factionPlots || ''}" placeholder=" ">
                        <label for="factionPlots">Faction kennel plot</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <select class="form-select is-filled" id="factionTier">
                            <option value="5"${state.factionTier === 5 ? ' selected' : ''}>T5 faction</option>
                            <option value="8"${state.factionTier === 8 ? ' selected' : ''}>T8 faction</option>
                        </select>
                        <label for="factionTier">Faction tier</label>
                    </div>
                    <div class="form-floating farming-city-field">
                        <input class="form-control${state.minVolume ? ' is-filled' : ''}" type="number" min="0" step="1"
                            id="minVolume" value="${state.minVolume || ''}" placeholder=" ">
                        <label for="minVolume">İnce pazar eşiği (uyarı)</label>
                    </div>
                    ${factionAvail
                        ? `<p class="farming-note">${escapeHtml(factionAvail.label)} bu şehirde kilitlenebilir.</p>`
                        : `<p class="farming-note">Bu şehirde faction bineği yok / bilinmiyor.</p>`}
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

    bindCityField(container, 'islandCity', (value) => {
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.islandCity = value;
        state.sellCity = value;
        saveCity(CITY_STORAGE_KEY, value);
        saveCity(SELL_CITY_STORAGE_KEY, value);
        renderPage(container);
    });

    bindCityField(container, 'sellCity', (value) => {
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

    const onFactionPlots = (event) => {
        const raw = event.target.value.trim();
        state.factionPlots = raw ? Math.max(0, Math.min(16, Math.round(Number(raw)) || 0)) : 0;
        savePrefs();
        applyPlan(container);
    };
    container.querySelector('#factionPlots')?.addEventListener('change', onFactionPlots);
    container.querySelector('#factionPlots')?.addEventListener('input', onFactionPlots);

    container.querySelector('#factionTier')?.addEventListener('change', (event) => {
        state.factionTier = Number(event.target.value) === 8 ? 8 : 5;
        savePrefs();
        applyPlan(container);
    });

    const onMinVolume = (event) => {
        const raw = event.target.value.trim();
        state.minVolume = raw ? Math.max(0, Number(raw) || 0) : 0;
        savePrefs();
        applyPlan(container);
    };
    container.querySelector('#minVolume')?.addEventListener('change', onMinVolume);
    container.querySelector('#minVolume')?.addEventListener('input', onMinVolume);

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
        showPageLoader(priceLoaderMessage(source, 'Şehir fiyatları ve geçmiş alınıyor…'));
    }

    try {
        const locations = cityNames();
        if (locations.length === 0) {
            throw new Error('Aktif şehir yok.');
        }
        const ids = allPriceItemIds();
        const days = getEconomyConstant('farm_history_days', 14);
        const [rows, historyIndex] = await Promise.all([
            fetchPrices(ids, locations, { source }),
            fetchHistoryIndex(ids, locations, { days }).catch((err) => {
                console.warn(err);
                return new Map();
            })
        ]);
        state.priceIndex = indexPrices(rows);
        state.historyIndex = historyIndex;
        state.loaded = true;
        runPlan();
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
        state.plan = null;
        state.cityCompare = [];
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
        state.islandCity = readSavedCity(CITY_STORAGE_KEY, state.cities, getDefaultCity());
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
