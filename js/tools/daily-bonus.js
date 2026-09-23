import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { initFloatingLabels } from '../components/forms.js';
import { initStore, getAll, createRow, updateRow, deleteRow } from '../db/store.js';
import { getBonusFamilies, getBonusFamilyByKey, getBonusFamilyLabel } from '../core/bonus-families.js';
import { addDays, bonusDayIso, bonusWindowLabel } from '../core/bonus-day.js';
import { bonusCityLabel } from '../core/bonus-cities.js';
import { refreshTodayBonusChip } from '../core/today-bonus.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { initTableSort, sortHeaderHtml } from '../utils/table-sort.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { bindLogTableRows } from '../components/log-table.js';
import { showToast } from '../components/toast.js';
import { itemIconHtml } from '../components/item-icon.js';
import { getStandardCombos, getSettings, localPriceHost } from '../core/settings.js';
import { getCityApiName } from '../db/relations.js';
import { getItemByUniqueName } from '../db/relations.js';
import { fetchPrices, indexPrices, cityRow } from '../core/market.js';
import { quoteFromRow } from '../core/price-side.js';
import { cityProductionBonus, citySpecialtyProductionBonus } from '../core/catalog.js';
import { dailyBonusStationPosition, hasDailyBonusStationOrder } from './daily-bonus-station-order.js';

const TABLE = 'dailyBonuses';

const state = {
    month: toYearMonth(bonusDayIso()),
    editingId: null,
    sort: { key: 'date', direction: 'desc' },
    analysis: { familyKey: null, familyData: {}, reorderMode: false, preparing: false, usedRecipeFallback: false }
};

function toYearMonth(isoDate) {
    return isoDate.slice(0, 7);
}

function lastDayOfMonth(month) {
    const [year, monthNum] = month.split('-').map(Number);
    return new Date(year, monthNum, 0).getDate();
}

function datesForLogMonth(month, recordedDates) {
    const today = bonusDayIso();
    const last = lastDayOfMonth(month);
    const dates = [];
    for (let day = 1; day <= last; day++) {
        const iso = `${month}-${String(day).padStart(2, '0')}`;
        if (iso > today && !recordedDates.has(iso)) {
            continue;
        }
        dates.push(iso);
    }
    return dates;
}

function formatDate(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
}

const ANALYSIS_TIERS = [4, 5, 6, 7, 8];
const ANALYSIS_RECIPE_CACHE_KEY = 'albiontools.v4.dailyBonusRecipeCache';
const ANALYSIS_PRICE_CACHE_KEY = 'albiontools.v4.dailyBonusPriceCache';
const ANALYSIS_PRICE_CACHE_MS = 60 * 60 * 1000;
const ANALYSIS_CARD_ORDER_KEY = 'albiontools.v4.dailyBonusCardOrder';
const analysisPendingLoads = new Map();
let analysisCatalog = null;

function analysisDefaultTiers() {
    const tiers = [...new Set(getStandardCombos()
        .map((combo) => Number(combo.tier))
        .filter((tier) => ANALYSIS_TIERS.includes(tier)))];
    return tiers.length ? tiers : [4, 5, 6];
}

function number(value) {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

function formatTimestamp(value) {
    const date = new Date(Number(value));
    return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
        : '—';
}

function unitMaterialYield(row) {
    const totalMaterialQty = row.recipe.lines.reduce((total, line) => total + Number(line.qty || 0), 0);
    return totalMaterialQty > 0 && row.market > 0 ? row.market / totalMaterialQty : 0;
}

function analysisBonusRate(familyKey) {
    const today = findByDate(bonusDayIso());
    const slot = ['slot1', 'slot2'].find((key) => today?.[`${key}FamilyKey`] === familyKey);
    const rate = slot ? Number(today?.[`${slot}Rate`]) : 0;
    return Number.isFinite(rate) ? rate : 0;
}

function analysisSpecialtyBonus(familyKey) {
    return getBonusFamilyByKey(familyKey)?.cityId ? citySpecialtyProductionBonus() : 0;
}

function analysisProductionBonus(familyKey) {
    return cityProductionBonus() + analysisSpecialtyBonus(familyKey) + analysisBonusRate(familyKey);
}

function analysisReturnRate(familyKey) {
    const productionBonus = analysisProductionBonus(familyKey);
    return productionBonus / (100 + productionBonus);
}

function readAnalysisCardOrders() {
    try {
        const orders = JSON.parse(localStorage.getItem(ANALYSIS_CARD_ORDER_KEY) || '{}');
        return orders && typeof orders === 'object' ? orders : {};
    } catch {
        return {};
    }
}

function analysisCardOrderKey(familyKey, tier) {
    return `${familyKey}|${tier}`;
}

function orderedAnalysisRows(rows, familyKey, tier) {
    const order = readAnalysisCardOrders()[analysisCardOrderKey(familyKey, tier)] || [];
    const positions = new Map(order.map((id, index) => [id, index]));
    return rows.slice().sort((a, b) => (positions.get(a.recipe.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.recipe.id) ?? Number.MAX_SAFE_INTEGER));
}

function moveAnalysisCard(familyKey, tier, recipeId, direction) {
    const rows = orderedAnalysisRows(analysisData(familyKey).rows.filter((row) => row.recipe.tier === Number(tier)), familyKey, tier);
    const from = rows.findIndex((row) => row.recipe.id === recipeId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= rows.length) return;
    [rows[from], rows[to]] = [rows[to], rows[from]];
    const orders = readAnalysisCardOrders();
    orders[analysisCardOrderKey(familyKey, tier)] = rows.map((row) => row.recipe.id);
    localStorage.setItem(ANALYSIS_CARD_ORDER_KEY, JSON.stringify(orders));
}

function formatAnalysisPercent(ratio) {
    return number(Math.round(ratio * 1000) / 10);
}

function renderAnalysisCard(row, rank, { reorderable = false, isFirst = false, isLast = false } = {}) {
    const { recipe, market, material, profit, returnRate } = row;
    const missingMarketPrice = market <= 0;
    const totalMaterialQty = recipe.lines.reduce((total, line) => total + Number(line.qty || 0), 0);
    const materialYield = Math.round(unitMaterialYield(row));
    const percent = !missingMarketPrice && material > 0 ? Math.round((profit / material) * 100) : null;
    const profitLabel = missingMarketPrice ? '—' : number(Math.abs(profit));
    const profitTone = missingMarketPrice ? 'is-neutral' : profit > 0 ? 'is-profit' : profit < 0 ? 'is-loss' : 'is-neutral';
    const requirements = recipe.lines.map((line) => `${line.short} · ${number(line.qty)}`).join(' · ');
    const resourceIcons = recipe.lines.map((line) => `<span title="${escapeHtml(`${line.short} · ${number(line.qty)}`)}">${itemIconHtml(line.uniqueName, { size: 28, className: 'item-icon' })}<b>${number(line.qty)}</b></span>`).join('');
    return `
        <article class="bonus-analysis-card is-unit-rank-${rank}${reorderable ? ' is-reorderable' : ''}" data-analysis-recipe="${escapeHtml(recipe.id)}">
            <div class="bonus-analysis-card-surface">
            <div class="bonus-analysis-card-main">
                <span class="bonus-analysis-rank is-rank-${rank}" aria-label="Birim getiriye göre sıra ${rank}"><svg viewBox="0 0 40 34" aria-hidden="true"><path fill="currentColor" d="M4 10l8 7 8-12 8 12 8-7-4 17H8zM8 29h24v3H8z"/><g fill="currentColor"><circle cx="4" cy="8" r="2.5"/><circle cx="12" cy="14" r="2"/><circle cx="20" cy="4" r="2.5"/><circle cx="28" cy="14" r="2"/><circle cx="36" cy="8" r="2.5"/></g></svg><b>${rank}</b></span>
                <div class="bonus-analysis-icon">${itemIconHtml(recipe.uniqueName, { size: 96, className: 'item-icon' })}</div>
                <div class="bonus-analysis-card-details">
                    <div class="bonus-analysis-item-copy"><h3>${escapeHtml(recipe.label)}</h3><p>${escapeHtml(getBonusFamilyLabel(recipe.familyKey))}</p><span class="bonus-analysis-profit ${profitTone}"><small>Kâr / Adet</small><b>${profitLabel}${percent !== null ? ` <em>(%${percent})</em>` : ''}</b></span></div>
                    <dl class="bonus-analysis-prices">
                        <div class="${missingMarketPrice ? 'is-missing-market-price' : ''}"><dt>BM Fiyatı${missingMarketPrice ? '<span class="bonus-analysis-price-warning" role="img" aria-label="BM fiyatı yok" title="BM fiyatı yok">!</span>' : ''}</dt><dd>${market > 0 ? number(market) : '—'}</dd></div>
                        <div><dt>Birim Getiri</dt><dd>${materialYield > 0 ? number(materialYield) : '—'}</dd></div>
                    </dl>
                </div>
            </div>
            <div class="bonus-analysis-material"><div><span>Hammadde Maliyeti</span><strong>${material > 0 ? number(material) : '—'}</strong></div><div><span title="${escapeHtml(requirements)}">Tarif Hammadde · ${number(totalMaterialQty)}</span><div class="bonus-analysis-resources" aria-label="${escapeHtml(requirements)}">${resourceIcons}</div></div></div>
            ${reorderable ? `<div class="bonus-analysis-card-order" aria-label="Kart sırası"><button type="button" data-analysis-card-move="up"${isFirst ? ' disabled' : ''} aria-label="Yukarı taşı">↑</button><button type="button" data-analysis-card-move="down"${isLast ? ' disabled' : ''} aria-label="Aşağı taşı">↓</button></div>` : ''}
            </div>
        </article>`;
}

function renderAnalysisLoadingCard() {
    return `<article class="bonus-analysis-card is-loading" aria-label="Tarifler ve fiyatlar yükleniyor">
        <div class="bonus-analysis-card-surface">
        <div class="bonus-analysis-card-main" aria-hidden="true"><div class="bonus-analysis-icon"></div><div class="bonus-analysis-card-details"><div class="bonus-analysis-item-copy"><i></i><i></i></div><dl class="bonus-analysis-prices"><div><i></i><i></i></div><div><i></i><i></i></div></dl></div></div>
        <div class="bonus-analysis-material" aria-hidden="true"><div><i></i><i></i></div><div><i></i><i></i></div></div>
        </div>
    </article>`;
}

function renderTierColumn(tier, analysis, familyKey) {
    const rows = orderedAnalysisRows(analysis.rows.filter((row) => row.recipe.tier === tier), familyKey, tier).slice(0, 3);
    const ranks = new Map([...rows]
        .sort((a, b) => unitMaterialYield(b) - unitMaterialYield(a))
        .map((row, index) => [row.recipe.id, index + 1]));
    const content = analysis.loading && rows.length === 0
        ? Array.from({ length: 3 }, renderAnalysisLoadingCard).join('')
        : rows.length
            ? rows.map((row, index) => renderAnalysisCard(row, ranks.get(row.recipe.id), { reorderable: state.analysis.reorderMode, isFirst: index === 0, isLast: index === rows.length - 1 })).join('')
            : '<p class="bonus-analysis-empty">Bu tier için normal tarif bulunamadı.</p>';
    return `
        <section class="bonus-analysis-tier-column is-tier-${tier}" data-analysis-tier="${tier}">
            <header><strong>T${tier}</strong><span>İlk 3 Craft</span></header>
            <div>${content}</div>
        </section>`;
}

function renderAnalysisDialog(dialog) {
    dialog.innerHTML = renderBonusAnalysisDialog();
    applyAnalysisTierFilters(dialog);
}

function applyAnalysisTierFilters(dialog) {
    const buttons = [...dialog.querySelectorAll('[data-analysis-filter]')];
    const showAll = dialog.querySelector('[data-analysis-filter="all"]')?.classList.contains('is-active');
    const selected = new Set(buttons
        .filter((button) => button.dataset.analysisFilter !== 'all' && button.classList.contains('is-active'))
        .map((button) => button.dataset.analysisFilter));
    dialog.querySelectorAll('[data-analysis-tier]').forEach((column) => {
        column.hidden = !showAll && !selected.has(column.dataset.analysisTier);
    });
}

function toggleAnalysisTier(dialog, button) {
    const buttons = [...dialog.querySelectorAll('[data-analysis-filter]')];
    const allButton = dialog.querySelector('[data-analysis-filter="all"]');
    if (button.dataset.analysisFilter === 'all') {
        if (!button.classList.contains('is-active')) {
            button.classList.add('is-active');
            buttons.filter((item) => item.dataset.analysisFilter !== 'all').forEach((item) => item.classList.remove('is-active'));
        }
    } else if (allButton?.classList.contains('is-active')) {
        allButton.classList.remove('is-active');
        button.classList.add('is-active');
    } else {
        const selected = buttons.filter((item) => item.dataset.analysisFilter !== 'all' && item.classList.contains('is-active'));
        if (button.classList.contains('is-active') && selected.length === 1) {
            allButton?.classList.add('is-active');
            selected.forEach((item) => item.classList.remove('is-active'));
        } else {
            button.classList.toggle('is-active');
        }
    }
    applyAnalysisTierFilters(dialog);
}

function todayAnalysisFamilies() {
    const today = findByDate(bonusDayIso());
    return [...new Set([today?.slot1FamilyKey, today?.slot2FamilyKey].filter(Boolean))]
        .map((key) => getBonusFamilyByKey(key))
        .filter(Boolean);
}

function readAnalysisRecipeCache() {
    try {
        const cache = JSON.parse(localStorage.getItem(ANALYSIS_RECIPE_CACHE_KEY) || '{}');
        return cache && typeof cache === 'object' ? cache : {};
    } catch {
        return {};
    }
}

function saveAnalysisRecipeCache(cache) {
    try {
        localStorage.setItem(ANALYSIS_RECIPE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.warn('Günlük bonus tarif önbelleği yazılamadı.', error);
    }
}

function readAnalysisPriceCache() {
    try {
        const cache = JSON.parse(localStorage.getItem(ANALYSIS_PRICE_CACHE_KEY) || '{}');
        return cache && typeof cache === 'object' ? cache : {};
    } catch {
        return {};
    }
}

function analysisPriceCacheKey(ids, locations) {
    return `${[...ids].sort().join(',')}|${[...locations].sort().join(',')}`;
}

function cachedAnalysisPrices(ids, locations) {
    const entry = readAnalysisPriceCache()[analysisPriceCacheKey(ids, locations)];
    if (!entry || !Array.isArray(entry.rows) || Date.now() - Number(entry.updatedAt) >= ANALYSIS_PRICE_CACHE_MS) {
        return null;
    }
    return entry;
}

function saveAnalysisPrices(ids, locations, rows) {
    try {
        const cache = readAnalysisPriceCache();
        const entry = { updatedAt: Date.now(), rows };
        cache[analysisPriceCacheKey(ids, locations)] = entry;
        localStorage.setItem(ANALYSIS_PRICE_CACHE_KEY, JSON.stringify(cache));
        return entry;
    } catch (error) {
        console.warn('Günlük bonus fiyat önbelleği yazılamadı.', error);
    }
}

function hydrateAnalysisRecipe(item, familyKey, recipe) {
    return {
        id: `api-${item.uniqueName}`,
        uniqueName: item.uniqueName,
        label: item.localizedName,
        tier: Number(item.tier),
        sortValue: Number(item.sortValue) || 0,
        familyKey,
        lines: (recipe.lines || []).map((resource) => {
            const material = getItemByUniqueName(resource.uniqueName);
            return { uniqueName: resource.uniqueName, qty: Number(resource.qty) || 0, short: material?.localizedName || resource.uniqueName };
        })
    };
}

const ARTIFACT_ITEM_PATTERN = /(?:KEEPER|HELL|MORGANA|UNDEAD|AVALON|CRYSTAL|FEY|ROYAL|@)/;

function normalAnalysisItems(familyKey, items) {
    const slug = String(familyKey).split('/').pop();
    const hasStationOrder = hasDailyBonusStationOrder(familyKey);
    const matchingItems = items.map((item, sourceOrder) => ({ ...item, sourceOrder })).filter((item) => {
        const tier = Number(item.tier);
        const enchantment = Number(item.enchantment ?? item.enchantmentLevel ?? 0);
        const isEquipable = item.isEquipable ?? item.equipable;
        const stationPosition = dailyBonusStationPosition(familyKey, item.localizedName);
        const isVerifiedStationItem = stationPosition !== null;
        const isBaseItem = enchantment === 0 && !String(item.uniqueName || '').includes('@');
        if (!ANALYSIS_TIERS.includes(tier)
            || !isBaseItem
            || !(isEquipable === true || String(isEquipable).toLowerCase() === 'true')
            || ARTIFACT_ITEM_PATTERN.test(item.uniqueName)
            || (hasStationOrder ? !isVerifiedStationItem : item.shopSubCategory !== slug)) {
            return false;
        }
        return true;
    });

    // The catalogue's source order is not the station UI order (notably plate armour).
    // Use the supplied station snapshot when it covers this bonus family, with the
    // catalogue order retained as a safe fallback for families outside the snapshot.
    const tierCounts = new Map();
    return matchingItems
        .map((item) => ({ ...item, stationPosition: dailyBonusStationPosition(familyKey, item.localizedName) }))
        .sort((a, b) => (a.stationPosition ?? Number.MAX_SAFE_INTEGER) - (b.stationPosition ?? Number.MAX_SAFE_INTEGER)
            || a.sourceOrder - b.sourceOrder)
        .filter((item) => {
            const count = tierCounts.get(item.tier) || 0;
            tierCounts.set(item.tier, count + 1);
            return count < 3;
        })
        .map(({ stationPosition, sourceOrder, ...item }) => item);
}

function analysisRecipeCatalog() {
    if (analysisCatalog) return analysisCatalog;

    const items = getAll('items');
    const itemsById = new Map(items.map((item) => [Number(item.id), item]));
    const materialsByOutput = new Map();
    for (const line of getAll('recipeMaterials')) {
        const outputId = Number(line.outputItemId);
        const lines = materialsByOutput.get(outputId) || [];
        lines.push(line);
        materialsByOutput.set(outputId, lines);
    }
    for (const lines of materialsByOutput.values()) {
        lines.sort((a, b) => Number(a.sortValue || 0) - Number(b.sortValue || 0) || Number(a.id) - Number(b.id));
    }
    analysisCatalog = { items, itemsById, materialsByOutput };
    return analysisCatalog;
}

function storedAnalysisRecipe(item, familyKey, catalog) {
    const lines = (catalog.materialsByOutput.get(Number(item.id)) || []).map((line) => {
        const material = catalog.itemsById.get(Number(line.inputItemId));
        return material && {
            uniqueName: material.uniqueName,
            qty: Number(line.qty) || 0,
            short: material.localizedName || material.uniqueName
        };
    }).filter(Boolean);
    return lines.length ? {
        id: `db-${item.id}`,
        uniqueName: item.uniqueName,
        label: item.localizedName,
        tier: Number(item.tier),
        sortValue: Number(item.sortValue) || 0,
        familyKey,
        lines
    } : null;
}

async function fetchAnalysisRecipe(item) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const response = await fetch(`${localPriceHost()}/api/v1/gameinfo/items/${encodeURIComponent(item.uniqueName)}/data`, {
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                continue;
            }
            const data = await response.json();
            const resources = data?.craftingRequirements?.craftResourceList || [];
            if (resources.length) {
                return {
                    uniqueName: item.uniqueName,
                    lines: resources.map((resource) => ({ uniqueName: resource.uniqueName, qty: Number(resource.count) || 0 }))
                };
            }
            lastError = new Error('Tarif hammaddesi dönmedi');
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`${item.uniqueName}: ${lastError?.message || 'tarif alınamadı'}`);
}

async function recipesFromGameInfo(familyKey) {
    const catalog = analysisRecipeCatalog();
    const candidates = normalAnalysisItems(familyKey, catalog.items);
    const storedRecipes = candidates.map((item) => storedAnalysisRecipe(item, familyKey, catalog)).filter(Boolean);
    if (storedRecipes.length === candidates.length) return storedRecipes;

    const cache = readAnalysisRecipeCache();
    const missing = candidates.filter((item) => !storedRecipes.some((recipe) => recipe.uniqueName === item.uniqueName)
        && !cache[item.uniqueName]?.lines?.length);
    if (missing.length) {
        state.analysis.usedRecipeFallback = true;
    }
    const results = await Promise.allSettled(missing.map(fetchAnalysisRecipe));
    const details = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
    if (candidates.length > 0 && storedRecipes.length === 0 && details.length === 0) {
        const failures = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason?.message)
            .filter(Boolean);
        throw new Error(`Tarifler alınamadı: ${failures.join(' · ') || 'bilinmeyen hata'}`);
    }
    let cacheChanged = false;
    for (const recipe of details.filter(Boolean)) {
        cache[recipe.uniqueName] = recipe;
        cacheChanged = true;
    }
    if (cacheChanged) {
        saveAnalysisRecipeCache(cache);
    }
    const fallbackRecipes = candidates
        .filter((item) => !storedRecipes.some((recipe) => recipe.uniqueName === item.uniqueName))
        .map((item) => cache[item.uniqueName] && hydrateAnalysisRecipe(item, familyKey, cache[item.uniqueName]))
        .filter(Boolean);
    return [...storedRecipes, ...fallbackRecipes];
}

function analysisData(familyKey) {
    return state.analysis.familyData[familyKey] || { rows: [], loading: false, error: null, updatedAt: null };
}

async function loadAnalysisPrices(familyKey, { forcePrices = false } = {}) {
    const family = getBonusFamilyByKey(familyKey);
    const previous = analysisData(familyKey);
    state.analysis.familyData[familyKey] = { ...previous, loading: true, error: null };
    try {
        const recipes = await recipesFromGameInfo(familyKey);
        const ids = [...new Set(recipes.flatMap((recipe) => [recipe.uniqueName, ...recipe.lines.map((line) => line.uniqueName)]).filter(Boolean))];
        const locations = ['Black Market', getCityApiName(family?.cityId) || 'Caerleon'];
        let priceEntry = forcePrices ? null : cachedAnalysisPrices(ids, locations);
        if (!priceEntry) {
            const rows = await fetchPrices(ids, locations);
            priceEntry = saveAnalysisPrices(ids, locations, rows) || { updatedAt: Date.now(), rows };
        }
        const prices = indexPrices(priceEntry.rows);
        const settings = getSettings();
        const matCity = getCityApiName(family?.cityId) || 'Caerleon';
        const rows = recipes.map((recipe) => {
            const market = quoteFromRow(cityRow(prices, recipe.uniqueName, 'Black Market'), settings.sellPriceSide, 'sell')?.price || 0;
            const grossMaterial = recipe.lines.reduce((sum, line) => sum + ((quoteFromRow(cityRow(prices, line.uniqueName, matCity), settings.buyPriceSide, 'buy')?.price || 0) * line.qty), 0);
            const returnRate = analysisReturnRate(familyKey);
            const material = grossMaterial * (1 - returnRate);
            return { recipe, market, material, profit: market > 0 ? market - material : null, returnRate };
        }).sort((a, b) => a.recipe.tier - b.recipe.tier
            || a.recipe.label.localeCompare(b.recipe.label, 'tr')
            || Number(a.recipe.id) - Number(b.recipe.id));
        state.analysis.familyData[familyKey] = { rows, loading: false, error: null, updatedAt: priceEntry.updatedAt };
    } catch (error) {
        state.analysis.familyData[familyKey] = {
            ...previous,
            loading: false,
            error: error.message || 'Fiyatlar alınamadı.'
        };
    }
}

function requestAnalysisLoad(familyKey, options = {}) {
    const current = analysisPendingLoads.get(familyKey);
    if (current && !options.forcePrices) {
        return current;
    }

    const pending = loadAnalysisPrices(familyKey, options)
        .finally(() => {
            if (analysisPendingLoads.get(familyKey) === pending) {
                analysisPendingLoads.delete(familyKey);
            }
        });
    analysisPendingLoads.set(familyKey, pending);
    return pending;
}

function deferUntilAfterPaint(callback) {
    window.requestAnimationFrame(() => window.setTimeout(callback, 0));
}

async function warmBonusAnalysis() {
    const families = todayAnalysisFamilies();
    if (!families.length) return;

    await Promise.all(families.map((family) => requestAnalysisLoad(family.familyKey)));
}

function updateAnalysisTrigger(container) {
    const button = container.querySelector('#openBonusAnalysis');
    if (!button) return;
    button.disabled = state.analysis.preparing;
    button.classList.toggle('has-recipe-warning', state.analysis.usedRecipeFallback);
    if (state.analysis.usedRecipeFallback) {
        button.title = 'Veritabanında eksik tarif bulundu; GameInfo fallback kullanıldı.';
    } else {
        button.removeAttribute('title');
    }
    button.innerHTML = state.analysis.preparing
        ? '<i class="bonus-analysis-trigger-spinner" aria-hidden="true"></i><span>Analiz hazırlanıyor…</span>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19V5m0 14h16M7 15l3-3 3 2 5-6"/><path d="M15 8h3v3"/></svg><span>Craft Analizi</span>';
}

function scheduleBonusAnalysisWarmup(container) {
    if (!state.analysis.preparing) return;
    deferUntilAfterPaint(() => {
        void warmBonusAnalysis().finally(() => {
            state.analysis.preparing = false;
            updateAnalysisTrigger(container);
        });
    });
}

function renderBonusAnalysisDialog() {
    const defaultTiers = analysisDefaultTiers();
    const families = todayAnalysisFamilies();
    const family = getBonusFamilyByKey(state.analysis.familyKey) || families[0];
    const activeAnalysis = analysisData(family?.familyKey);
    const familyOptions = families.map((row) => `<button type="button" class="${row.familyKey === family?.familyKey ? 'is-active' : ''}" data-analysis-family="${escapeHtml(row.familyKey)}">${escapeHtml(row.label)}</button>`).join('');
    const preferredTierText = defaultTiers.map((tier) => `T${tier}`).join(' · ');
    const updatedLabel = formatTimestamp(activeAnalysis.updatedAt);
    const isLoading = activeAnalysis.loading;
    const dailyBonus = analysisBonusRate(family?.familyKey);
    const returnRate = analysisReturnRate(family?.familyKey);
    const specialtyBonus = analysisSpecialtyBonus(family?.familyKey);
    const productionBonus = analysisProductionBonus(family?.familyKey);
    const rrTitle = `Royal şehir bonusu %${cityProductionBonus()} + yerel şehir bonusu %${specialtyBonus} + günlük bonus %${dailyBonus}; RR = ${productionBonus} / ${100 + productionBonus}`;
    const analysisNote = activeAnalysis.error
        ? escapeHtml(activeAnalysis.error)
        : `Hammadde maliyeti, %${cityProductionBonus()} Royal şehir + %${specialtyBonus} yerel şehir + %${dailyBonus} günlük üretim bonusunun RRR'a çevrilmesiyle hesaplanır. Kartlar API tarif sırasıyla gösterilir; Kart Sırasını Düzenle ile kalıcı olarak elle değiştirilebilir.`;
    const familyGrids = families.map((row) => {
        const data = analysisData(row.familyKey);
        const hidden = row.familyKey === family?.familyKey ? '' : ' hidden';
        return `<section class="bonus-analysis-grid" data-analysis-family-grid="${escapeHtml(row.familyKey)}" data-analysis-family-key="${escapeHtml(row.familyKey)}"${hidden}>
            ${ANALYSIS_TIERS.map((tier) => renderTierColumn(tier, data, row.familyKey)).join('')}
        </section>`;
    }).join('');
    return `
        <button type="button" class="app-dialog-close" aria-label="Kapat" data-analysis-close></button>
        <div class="bonus-analysis-sheet">
            <div class="bonus-analysis-layout">
                <aside class="bonus-analysis-sidebar">
                    <header class="bonus-analysis-head">
                        <div><p class="bonus-analysis-eyebrow"><img src="icons/daily-bonus/ui-icons/chart-bars.svg" alt="" aria-hidden="true">GÜNLÜK CRAFT BONUS ANALİZİ</p><h2>${escapeHtml(family?.label || 'Bonus seçin')} <span>${formatDate(bonusDayIso())}</span></h2><p>Artifactsiz ilk üç item için Black Market fiyatına göre en kârlı seçenekler.</p></div>
                        <div class="bonus-analysis-refresh-group"><button type="button" class="btn btn-primary bonus-analysis-refresh" data-analysis-refresh${isLoading ? ' disabled aria-busy="true"' : ''}><img src="icons/daily-bonus/ui-icons/refresh.svg" alt="" aria-hidden="true">${isLoading ? 'Yükleniyor…' : 'Fiyatları Yenile'}</button><small>${isLoading ? 'Tarifler ve fiyatlar<br>yükleniyor…' : `Son güncelleme:<br>${updatedLabel}`}</small></div>
                    </header>
                    <section class="bonus-analysis-controls" aria-label="Analiz filtreleri">
                        <div class="bonus-analysis-select"><span>Bonus grubu</span><div class="bonus-analysis-family-tabs">${familyOptions}</div><small>${escapeHtml(getCityApiName(family?.cityId) || 'Caerleon')}</small></div>
                        <div class="bonus-analysis-select"><span>Market</span><strong>Black Market</strong><small>Satış fiyatı</small></div>
                        <span class="bonus-analysis-rr-badge" title="${escapeHtml(rrTitle)}"><i aria-hidden="true">↻</i><span><b>RR %${formatAnalysisPercent(returnRate)}</b><small>Royal %${cityProductionBonus()} + yerel %${specialtyBonus} + günlük %${dailyBonus}</small></span></span>
                        <div class="bonus-analysis-tiers" role="group" aria-label="Tier seçimi">
                            ${ANALYSIS_TIERS.map((tier) => `<button type="button" class="is-tier-${tier}${defaultTiers.includes(tier) ? ' is-active' : ''}" data-analysis-filter="${tier}">T${tier}</button>`).join('')}
                            <button type="button" data-analysis-filter="all">Tüm Tierlar</button>
                        </div>
                        <small class="bonus-analysis-tier-hint">Öncelikli tierlar: ${preferredTierText}</small>
                    </section>
                    <div class="bonus-analysis-note"><img src="icons/daily-bonus/ui-icons/info.svg" alt="" aria-hidden="true"><span>${analysisNote}</span></div>
                    <div class="bonus-analysis-order-actions"><button type="button" class="btn btn-outline-secondary bonus-analysis-order-toggle" data-analysis-order-toggle>${state.analysis.reorderMode ? 'Sıralamayı Bitir' : 'Kart Sırasını Düzenle'}</button></div>
                </aside>
                ${familyGrids}
            </div>
        </div>`;
}

async function openBonusAnalysis(container) {
    let dialog = container.querySelector('#bonusAnalysisDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'bonusAnalysisDialog';
        dialog.className = 'app-dialog bonus-analysis-dialog';
        container.appendChild(dialog);
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog || event.target.closest('[data-analysis-close]')) {
                dialog.close();
                return;
            }
            if (event.target.closest('[data-analysis-refresh]')) {
                void refreshBonusAnalysis(dialog, state.analysis.familyKey, { forcePrices: true });
                return;
            }
            if (event.target.closest('[data-analysis-order-toggle]')) {
                state.analysis.reorderMode = !state.analysis.reorderMode;
                renderAnalysisDialog(dialog);
                return;
            }
            const moveButton = event.target.closest('[data-analysis-card-move]');
            if (moveButton) {
                const card = moveButton.closest('[data-analysis-recipe]');
                const column = moveButton.closest('[data-analysis-tier]');
                const grid = moveButton.closest('[data-analysis-family-key]');
                if (card && column && grid) {
                    moveAnalysisCard(grid.dataset.analysisFamilyKey, column.dataset.analysisTier, card.dataset.analysisRecipe, moveButton.dataset.analysisCardMove === 'up' ? -1 : 1);
                    renderAnalysisDialog(dialog);
                }
                return;
            }
            const familyButton = event.target.closest('[data-analysis-family]');
            if (familyButton) {
                state.analysis.familyKey = familyButton.dataset.analysisFamily;
                renderAnalysisDialog(dialog);
                return;
            }
            const tierButton = event.target.closest('[data-analysis-filter]');
            if (tierButton) toggleAnalysisTier(dialog, tierButton);
        });
    }
    if (dialog.open) {
        return;
    }
    const families = todayAnalysisFamilies();
    if (families.length === 0) {
        showToast('Bugün için kayıtlı craft bonusu yok.', { kind: 'error' });
        return;
    }
    state.analysis.familyKey = state.analysis.familyKey && families.some((family) => family.familyKey === state.analysis.familyKey)
        ? state.analysis.familyKey
        : families[0].familyKey;
    renderAnalysisDialog(dialog);
    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', '');
    }
    deferUntilAfterPaint(() => {
        void Promise.all(families.map((family) => refreshBonusAnalysis(dialog, family.familyKey)));
    });
}

async function refreshBonusAnalysis(dialog, familyKey, options) {
    const pending = requestAnalysisLoad(familyKey, options);
    renderAnalysisDialog(dialog);
    await pending;
    if (dialog.open) {
        renderAnalysisDialog(dialog);
    }
}

function rowsForMonth(month) {
    return getAll(TABLE)
        .filter((row) => toYearMonth(row.date) === month)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function runningCount(monthRows, throughDate, slotKey, familyKey) {
    return monthRows.filter((row) =>
        row.date <= throughDate && row[slotKey] === familyKey
    ).length;
}

function renderFamilyOptions(selected) {
    const { grouped } = getBonusFamilies();
    const groups = [];

    groups.push(`<option value="">Seçin</option>`);

    for (const [group, families] of grouped) {
        const options = families.map((family) => {
            const isSelected = family.key === selected ? ' selected' : '';
            return `<option value="${escapeHtml(family.key)}"${isSelected}>${escapeHtml(family.label)}</option>`;
        }).join('');
        groups.push(`<optgroup label="${escapeHtml(group)}">${options}</optgroup>`);
    }

    return groups.join('');
}

function renderRateOptions(selected) {
    return ['10', '20'].map((rate) => {
        const isSelected = String(selected) === rate ? ' selected' : '';
        return `<option value="${rate}"${isSelected}>${rate}%</option>`;
    }).join('');
}

function findByDate(date) {
    return getAll(TABLE).find((row) => row.date === date) ?? null;
}

function todayEntryPrompt(today) {
    return `Veri gir: ${bonusWindowLabel(today)} için günlük bonus kaydı yok. İki bonusu seçip kaydet.`;
}

function promptTodayIfMissing(container) {
    const today = bonusDayIso();
    if (findByDate(today) || toYearMonth(today) !== state.month) {
        return;
    }

    fillForm(container, null, today);
    setFormMessage(container, todayEntryPrompt(today));
    container.querySelector('#bonusForm')?.scrollIntoView({ block: 'nearest' });
    container.querySelector('#slot1FamilyKey')?.focus();
}

function setFormMessage(container, text, kind = 'info') {
    const el = container.querySelector('#bonusFormMessage');
    if (!el) {
        return;
    }

    if (!text) {
        el.hidden = true;
        el.textContent = '';
        el.className = 'alert alert-info';
        return;
    }

    el.hidden = false;
    el.textContent = text;
    el.className = kind === 'error' ? 'alert alert-info' : 'alert alert-info';
}

function updateRepeatPreview(container) {
    const date = container.querySelector('#bonusDate')?.value;
    const slot1 = container.querySelector('#slot1FamilyKey')?.value;
    const slot2 = container.querySelector('#slot2FamilyKey')?.value;
    const preview = container.querySelector('#bonusRepeatPreview');

    if (!preview) {
        return;
    }

    const windowHtml = date
        ? `<span class="bonus-window">${escapeHtml(bonusWindowLabel(date))}</span>`
        : '';

    if (!date || !slot1 || !slot2) {
        preview.innerHTML = windowHtml
            ? `${windowHtml}<span class="text-muted">Bonusları seçince bu ayki #1 / #2 sayıları görünür.</span>`
            : '<span class="text-muted">Bonusları seçince bu ayki #1 / #2 sayıları görünür.</span>';
        return;
    }

    const month = toYearMonth(date);
    const monthRows = rowsForMonth(month).filter((row) => row.id !== state.editingId);
    const count1 = runningCount(monthRows, date, 'slot1FamilyKey', slot1) + 1;
    const count2 = runningCount(monthRows, date, 'slot2FamilyKey', slot2) + 1;

    preview.innerHTML = `
        ${windowHtml}
        <span><strong>#1</strong> ${escapeHtml(getBonusFamilyLabel(slot1))} · ${count1}</span>
        <span><strong>#2</strong> ${escapeHtml(getBonusFamilyLabel(slot2))} · ${count2}</span>
        <span class="text-muted">${escapeHtml(month)} içinde</span>
    `;
}

function fillForm(container, row, presetDate = null) {
    const dateInput = container.querySelector('#bonusDate');
    const slot1 = container.querySelector('#slot1FamilyKey');
    const rate1 = container.querySelector('#slot1Rate');
    const slot2 = container.querySelector('#slot2FamilyKey');
    const rate2 = container.querySelector('#slot2Rate');
    const submit = container.querySelector('#bonusSubmit');
    const cancel = container.querySelector('#bonusCancelEdit');
    const remove = container.querySelector('#bonusDelete');

    if (row) {
        state.editingId = row.id;
        dateInput.value = row.date;
        slot1.value = row.slot1FamilyKey;
        rate1.value = String(row.slot1Rate);
        slot2.value = row.slot2FamilyKey;
        rate2.value = String(row.slot2Rate);
        submit.textContent = 'Güncelle';
        cancel.hidden = false;
        remove.hidden = false;
    } else {
        state.editingId = null;
        dateInput.value = presetDate || dateInput.value || bonusDayIso();
        slot1.value = '';
        rate1.value = '10';
        slot2.value = '';
        rate2.value = '10';
        submit.textContent = 'Kaydet';
        cancel.hidden = true;
        remove.hidden = true;
    }

    initFloatingLabels(container);
    updateRepeatPreview(container);
    updateLogHighlights(container);
}

function selectedFamilyKeys(container) {
    return [...new Set(
        ['#slot1FamilyKey', '#slot2FamilyKey']
            .map((selector) => container.querySelector(selector)?.value)
            .filter(Boolean)
    )];
}

function logRowClasses(row, highlightKeys) {
    const classes = [];
    if (state.editingId === row.id) {
        classes.push('is-editing');
    }

    const match1 = highlightKeys.includes(row.slot1FamilyKey);
    const match2 = highlightKeys.includes(row.slot2FamilyKey);
    if (match1 || match2) {
        classes.push('is-bonus-match');
    }
    if (highlightKeys.length > 1 && match1 && match2) {
        classes.push('is-bonus-match-both');
    }

    return classes.length ? ` class="${classes.join(' ')}"` : '';
}

function familyCell(familyKey, highlightKeys) {
    const hit = highlightKeys.includes(familyKey) ? ' is-bonus-hit' : '';
    const city = bonusCityLabel(familyKey);
    const cityHtml = city
        ? `<span class="bonus-log-city">${escapeHtml(city)}</span>`
        : '';
    return `<td class="bonus-log-family${hit}" data-family-key="${escapeHtml(familyKey)}"><span class="bonus-log-family-main"><span class="bonus-log-family-name">${escapeHtml(getBonusFamilyLabel(familyKey))}</span></span>${cityHtml}</td>`;
}

function updateLogHighlights(container) {
    const table = container.querySelector('.bonus-log-table');
    if (!table) {
        return;
    }

    const keys = selectedFamilyKeys(container);
    table.classList.toggle('is-filtering', keys.length > 0);

    table.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
        const match1 = keys.includes(tr.dataset.slot1);
        const match2 = keys.includes(tr.dataset.slot2);
        tr.classList.toggle('is-editing', String(state.editingId) === tr.dataset.id);
        tr.classList.toggle('is-bonus-match', match1 || match2);
        tr.classList.toggle('is-bonus-match-both', keys.length > 1 && match1 && match2);
        tr.querySelectorAll('[data-family-key]').forEach((td) => {
            td.classList.toggle('is-bonus-hit', keys.includes(td.dataset.familyKey));
        });
    });
}

function refreshLog(container) {
    const log = container.querySelector('#bonusLog');
    if (!log) {
        return;
    }

    log.innerHTML = renderLogTable(state.month, selectedFamilyKeys(container));
    bindLogRows(container);
    bindLogSort(container);
    bindCalcSticky(container);
}

function bindLogSort(container) {
    const table = container.querySelector('.bonus-log-table');
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

function renderGapRow(date) {
    return `
        <tr class="is-gap" data-date="${escapeHtml(date)}" title="Kayıt yok">
            <td class="text-nowrap" data-sort-value="${escapeHtml(date)}" title="${escapeHtml(bonusWindowLabel(date))}">${escapeHtml(formatDate(date))}</td>
            <td></td>
            <td class="num"></td>
            <td class="num"></td>
            <td></td>
            <td class="num"></td>
            <td class="num"></td>
        </tr>
    `;
}

function renderLogTable(month, highlightKeys = []) {
    const rows = rowsForMonth(month);
    const byDate = new Map();
    for (const row of rows) {
        const list = byDate.get(row.date) ?? [];
        list.push(row);
        byDate.set(row.date, list);
    }

    const dates = datesForLogMonth(month, byDate);

    if (dates.length === 0) {
        return `
            <div class="alert alert-info">
                ${escapeHtml(month)} için gösterilecek gün yok.
            </div>
        `;
    }

    const emptyMonthNote = rows.length === 0 && getAll(TABLE).length > 0
        ? `<div class="alert alert-info">Bu ayda kayıtlı bonus yok. Günlük bonus oyundan çekilmez; buraya sen yazarsın. Kayıtlı günler için ay seçiciden başka aya geç.</div>`
        : '';

    const filtering = highlightKeys.length > 0 ? ' is-filtering' : '';
    const sort = state.sort;
    const body = dates.slice().reverse().flatMap((date) => {
        const records = byDate.get(date);
        if (!records) {
            return [renderGapRow(date)];
        }

        return records.map((row) => {
            const count1 = runningCount(rows, row.date, 'slot1FamilyKey', row.slot1FamilyKey);
            const count2 = runningCount(rows, row.date, 'slot2FamilyKey', row.slot2FamilyKey);

            return `
            <tr data-id="${row.id}" data-slot1="${escapeHtml(row.slot1FamilyKey)}" data-slot2="${escapeHtml(row.slot2FamilyKey)}"${logRowClasses(row, highlightKeys)}>
                <td class="text-nowrap" data-sort-value="${escapeHtml(row.date)}" title="${escapeHtml(bonusWindowLabel(row.date))}">${escapeHtml(formatDate(row.date))}</td>
                ${familyCell(row.slot1FamilyKey, highlightKeys)}
                <td class="num" data-sort-value="${escapeHtml(String(row.slot1Rate))}">${escapeHtml(String(row.slot1Rate))}%</td>
                <td class="num" data-sort-value="${count1}">${count1}</td>
                ${familyCell(row.slot2FamilyKey, highlightKeys)}
                <td class="num" data-sort-value="${escapeHtml(String(row.slot2Rate))}">${escapeHtml(String(row.slot2Rate))}%</td>
                <td class="num" data-sort-value="${count2}">${count2}</td>
            </tr>
        `;
        });
    }).join('');

    return `
        ${emptyMonthNote}
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped log-table bonus-log-table calc-table${filtering}">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Tarih', { key: 'date', type: 'date', direction: sort.key === 'date' ? sort.direction : null, title: 'Bonus günü (13:00 – ertesi 13:00)' })}
                        ${sortHeaderHtml('Bonus 1', { key: 'slot1', type: 'text', direction: sort.key === 'slot1' ? sort.direction : null, title: 'İlk günlük craft bonusu' })}
                        ${sortHeaderHtml('%', { key: 'rate1', type: 'number', className: 'num', direction: sort.key === 'rate1' ? sort.direction : null, title: 'İlk bonusun oranı' })}
                        ${sortHeaderHtml('#1', { key: 'count1', type: 'number', className: 'num', direction: sort.key === 'count1' ? sort.direction : null, title: 'Bu ayda 1. bonusun kaçıncı gelişi' })}
                        ${sortHeaderHtml('Bonus 2', { key: 'slot2', type: 'text', direction: sort.key === 'slot2' ? sort.direction : null, title: 'İkinci günlük craft bonusu' })}
                        ${sortHeaderHtml('%', { key: 'rate2', type: 'number', className: 'num', direction: sort.key === 'rate2' ? sort.direction : null, title: 'İkinci bonusun oranı' })}
                        ${sortHeaderHtml('#2', { key: 'count2', type: 'number', className: 'num', direction: sort.key === 'count2' ? sort.direction : null, title: 'Bu ayda 2. bonusun kaçıncı gelişi' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
        <p class="text-muted bonus-log-hint">Tarih, 13:00’te başlayan günü gösterir (ör. 23.08 → 23.08 13:00 – 24.08 13:00). #1 ve #2, seçilen ayda aynı bonusun o güne kadar kaç kez geldiğini gösterir. Bonus seçince o ailenin geçtiği günler işaretlenir.</p>
    `;
}

function renderPage(container) {
    const families = getBonusFamilies().families;
    const monthInput = state.month;
    const today = bonusDayIso();
    const defaultDate = toYearMonth(today) === state.month ? today : `${state.month}-01`;

    container.innerHTML = `
        <section class="bonus-hero">
            <div class="bonus-hero-head"><h1>Günlük Bonus</h1><button type="button" class="bonus-analysis-trigger${state.analysis.usedRecipeFallback ? ' has-recipe-warning' : ''}" id="openBonusAnalysis"${state.analysis.preparing ? ' disabled' : ''}${state.analysis.usedRecipeFallback ? ' title="Veritabanında eksik tarif bulundu; GameInfo fallback kullanıldı."' : ''}>${state.analysis.preparing ? '<i class="bonus-analysis-trigger-spinner" aria-hidden="true"></i><span>Analiz hazırlanıyor…</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19V5m0 14h16M7 15l3-3 3 2 5-6"/><path d="M15 8h3v3"/></svg><span>Craft Analizi</span>'}</button></div>
            <p>Her gün iki craft / refine bonusu. Gün 13:00’te yenilenir. Oyun API’sinden gelmez; buraya kaydedilir. Unutulan günler boş bırakılabilir.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="bonus-toolbar">
                    <div class="form-floating bonus-month-field">
                        <input type="month" class="form-control is-filled" id="bonusMonth" value="${escapeHtml(monthInput)}" placeholder=" ">
                        <label for="bonusMonth">Ay</label>
                    </div>
                    <p class="text-muted bonus-toolbar-note">Seçenekler eşya aileleridir (Sword, Hide, Bag) — tekil T4 Broadsword değil.</p>
                </div>
                ${families.length === 0
                    ? '<div class="alert alert-info">Bonus aileleri yüklenemedi. Veritabanında itemCategories olmalı.</div>'
                    : `
                <form class="form-section bonus-form" id="bonusForm">
                    <div class="alert alert-info" id="bonusFormMessage" hidden></div>
                    <div class="form-grid">
                        <div class="form-floating">
                            <input type="date" class="form-control is-filled" id="bonusDate" name="date" value="${escapeHtml(defaultDate)}" max="${escapeHtml(today)}" placeholder=" " required>
                            <label for="bonusDate">Tarih</label>
                        </div>
                        <div class="bonus-repeat" id="bonusRepeatPreview"></div>
                        <div class="bonus-slots">
                            <div class="form-floating bonus-slot-family">
                                <select class="form-select" id="slot1FamilyKey" name="slot1FamilyKey" required>
                                    ${renderFamilyOptions('')}
                                </select>
                                <label for="slot1FamilyKey">Bonus 1</label>
                            </div>
                            <div class="form-floating bonus-slot-family">
                                <select class="form-select" id="slot2FamilyKey" name="slot2FamilyKey" required>
                                    ${renderFamilyOptions('')}
                                </select>
                                <label for="slot2FamilyKey">Bonus 2</label>
                            </div>
                            <div class="form-floating bonus-slot-rate">
                                <select class="form-select" id="slot1Rate" name="slot1Rate" required>
                                    ${renderRateOptions('10')}
                                </select>
                                <label for="slot1Rate">Oran 1</label>
                            </div>
                            <div class="form-floating bonus-slot-rate">
                                <select class="form-select" id="slot2Rate" name="slot2Rate" required>
                                    ${renderRateOptions('10')}
                                </select>
                                <label for="slot2Rate">Oran 2</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" id="bonusSubmit">Kaydet</button>
                        <button type="button" class="btn btn-outline-secondary" id="bonusCancelEdit" hidden>Vazgeç</button>
                        <button type="button" class="btn btn-outline-danger" id="bonusDelete" hidden>Sil</button>
                    </div>
                </form>
                `}
            </div>
            <section class="tool-split-result bonus-log" id="bonusLog">${renderLogTable(state.month)}</section>
        </div>
    `;

    bindPage(container);
    fillForm(container, null);
    promptTodayIfMissing(container);
    bindCalcSticky(container);
}

function bindPage(container) {
    initFloatingLabels(container);

    container.querySelector('#openBonusAnalysis')?.addEventListener('click', () => openBonusAnalysis(container));

    container.querySelector('#bonusMonth')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) {
            return;
        }
        state.month = value;
        state.editingId = null;
        renderPage(container);
    });

    container.querySelector('#bonusDate')?.addEventListener('change', () => {
        const date = container.querySelector('#bonusDate')?.value;
        if (date) {
            const existing = findByDate(date);
            if (existing && existing.id !== state.editingId) {
                fillForm(container, existing);
                setFormMessage(container, 'Bu tarihte kayıt var — güncellenecek.');
                return;
            }
        }
        updateRepeatPreview(container);
    });

    ['slot1FamilyKey', 'slot2FamilyKey'].forEach((id) => {
        container.querySelector(`#${id}`)?.addEventListener('change', () => {
            updateRepeatPreview(container);
            updateLogHighlights(container);
        });
    });

    container.querySelector('#bonusForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEntry(container);
    });

    container.querySelector('#bonusCancelEdit')?.addEventListener('click', () => {
        setFormMessage(container, '');
        fillForm(container, null);
        refreshLog(container);
        promptTodayIfMissing(container);
    });

    container.querySelector('#bonusDelete')?.addEventListener('click', () => {
        if (!state.editingId) {
            return;
        }
        deleteRow(TABLE, state.editingId);
        showToast('Kayıt silindi.');
        fillForm(container, null);
        refreshLog(container);
        refreshTodayBonusChip();
        promptTodayIfMissing(container);
    });

    bindLogRows(container);
    bindLogSort(container);
}

function bindLogRows(container) {
    bindLogTableRows(container, (id) => {
        const record = getAll(TABLE).find((item) => String(item.id) === id);
        if (!record) {
            return;
        }
        fillForm(container, record);
        setFormMessage(container, '');
        refreshLog(container);
    });

    container.querySelectorAll('.bonus-log-table tbody tr.is-gap[data-date]').forEach((row) => {
        row.addEventListener('click', () => {
            const date = row.dataset.date;
            fillForm(container, null, date);
            setFormMessage(container, '');
            refreshLog(container);
            container.querySelector(`.bonus-log-table tbody tr.is-gap[data-date="${date}"]`)?.classList.add('is-editing');
        });
    });
}

function saveEntry(container) {
    const date = container.querySelector('#bonusDate').value;
    const slot1FamilyKey = container.querySelector('#slot1FamilyKey').value;
    const slot1Rate = container.querySelector('#slot1Rate').value;
    const slot2FamilyKey = container.querySelector('#slot2FamilyKey').value;
    const slot2Rate = container.querySelector('#slot2Rate').value;

    if (!date || !slot1FamilyKey || !slot2FamilyKey || !slot1Rate || !slot2Rate) {
        showToast('Tarih, iki bonus ve iki oran gerekli.', { kind: 'error' });
        return;
    }

    if (slot1FamilyKey === slot2FamilyKey) {
        showToast('İki slot aynı bonus ailesi olamaz.', { kind: 'error' });
        return;
    }

    const payload = new FormData();
    payload.set('date', date);
    payload.set('slot1FamilyKey', slot1FamilyKey);
    payload.set('slot1Rate', slot1Rate);
    payload.set('slot2FamilyKey', slot2FamilyKey);
    payload.set('slot2Rate', slot2Rate);

    const existing = findByDate(date);
    const targetId = state.editingId ?? existing?.id;

    if (targetId) {
        const current = getAll(TABLE).find((row) => row.id === targetId);
        if (current && current.date !== date && existing) {
            showToast('Bu tarihte zaten başka bir kayıt var.', { kind: 'error' });
            return;
        }
        updateRow(TABLE, targetId, payload);
        showToast('Kayıt güncellendi.');
    } else {
        createRow(TABLE, payload);
        showToast('Kayıt eklendi.');
    }

    state.month = toYearMonth(date);
    const next = addDays(date, 1);
    state.editingId = null;

    const monthInput = container.querySelector('#bonusMonth');
    if (monthInput) {
        monthInput.value = state.month;
    }

    fillForm(container, null);

    const dateInput = container.querySelector('#bonusDate');
    if (dateInput && !findByDate(next) && toYearMonth(next) === state.month && next <= bonusDayIso()) {
        dateInput.value = next;
    }

    initFloatingLabels(container);
    updateRepeatPreview(container);
    refreshLog(container);
    refreshTodayBonusChip();
}

async function init() {
    initNav();
    const container = document.getElementById('dailyBonus');
    if (!container) {
        return;
    }

    showPageLoader('Günlük bonus yükleniyor…');

    try {
        await initStore();
        state.month = toYearMonth(bonusDayIso());
        state.analysis.preparing = todayAnalysisFamilies().length > 0;
        renderPage(container);
        scheduleBonusAnalysisWarmup(container);
    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="alert alert-info">Günlük bonus yüklenemedi. Sayfayı bir static server ile açın.</div>';
    } finally {
        hidePageLoader();
    }
}

init();
