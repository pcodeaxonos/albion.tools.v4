import { dailyFocusRequirement } from '../core/island/focus.js';
import { allocateInternalFeed } from '../core/island/placement-model.js';
import { optimizePlacement } from './island-planner-v2/optimizer.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { getAll, initStore, replaceAllRows } from '../db/store.js';
import { getSettings, getDefaultCity } from '../core/settings.js';
import { loadActiveCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField, cityIslandDecorate } from '../components/city-picker.js';
import { getItemLocalizedName, getItemUniqueName } from '../db/relations.js';
import { itemIconHtml } from '../components/item-icon.js';
import { cityRow, fetchPrices, indexPrices } from '../core/market.js';
import { quoteFromRow } from '../core/price-side.js';
import { fetchLongTermIndex, longTermQuote, longTermMetadata, LONG_TERM_PRICE_MODE, LONG_TERM_PRICE_LABEL } from '../core/long-term-quotes.js';
import { purchaseCost, saleProceeds } from '../core/market-fees.js';
import { butcherQty, cropHours, planCycleHours, planDayHours, plantSlots } from '../core/island-economy.js';
import { animalCycleHours } from '../core/island/economy-config.js';
import { animalForFeed, feedPlants } from '../core/island/feeding.js';
import { effectiveAnimalProductYield, effectiveAnimalReturn, effectivePlantYield, effectiveSeedReturn, yieldAverage } from '../core/island-yield-stats.js';
import { bindLivePrices } from '../core/price-live.js';
import { fetchHistoryIndex, historyAt } from '../core/market-history.js';
import { SALES_VOLUME, normalizeSalesVolume, filterSalesVolume } from './island-planner-v2/volume.js';
import { FIXED_PRICE_TABLE } from '../core/fixed-prices.js';
import { V2_CITIES, V2_COMMITTED_STORAGE_KEY, V2_COMMITTED_TABLE, V2_DRAFT_TABLE, V2_GEOMETRY_TABLE, V2_GEOMETRY_URL, V2_ROYAL_CITIES, V2_SPECIAL_CITY_GEOMETRY, V2_STORAGE_KEY, V2_UNLOCKED_SLOTS_BY_LEVEL } from './island-planner-v2-config.js';
import { blankSlot, clone, clamp01, cityKey, normalizeDraft as normalizeDraftModel } from './island-planner-v2/model.js';
import {
    animalProductionModes,
    mountRecipes,
    mountMaterialConsumption,
    MOUNT_MATERIAL_RETURN_RATE,
    mountRecipeFor,
    cityBonusItems,
    hasCityBonus,
    isEconomicItem,
    itemCategory,
    itemForSlot,
    itemName,
    itemRows,
    itemUniqueName,
    productionModeFor,
    productionModeUsesFocus,
    typeLabel
} from './island-planner-v2/items.js';
import { readPlanTable, writePlanTable } from './island-planner-v2/persistence.js';

const OVERLAY_DEBUG = new URLSearchParams(location.search).has('islandOverlayDebug');
const TOOLBAR_TYPE_ICONS = Object.freeze({
    farm: './content/icons/T3_WHEAT.png',
    herb: './content/icons/T4_BURDOCK.png',
    pasture: './content/icons/T3_FARM_CHICKEN_GROWN.png',
    kennel: './content/icons/T5_FARM_COUGAR_GROWN.png',
    house: './content/icons/PLAYERISLAND_FURNITUREITEM_WOOD_GATE_BIG_B.png'
});
const state = { cities: [], geometry: null, geometryRows: [], fixedPrices: [], selectedSlotId: 'R1', hoveredSlotId: null, toolbar: { stage: 'type', type: null }, draftsByCity: {}, committedByCity: {}, draft: null, committed: null, priceIndex: null, averagePriceIndex: null, longTermPriceIndex: null, priceLoading: false, autoFilling: false, optimizationPricesChecked: false, autoFillPriceDiagnostics: [], autoFillResult: null, priceError: null, priceRequestId: 0, priceDiagnosticSignature: null, derivedDiagnosticSignature: null, openDependencyPopover: null, drag: null, pointerDrag: null, dragPreviewFrame: null, dragPreviewPoint: null, suppressClick: false, derived: { slots: new Map(), summary: null }, calculationTimer: null, overlayDebugSignature: null };

function defaultDraft(islandCity = getDefaultCity()) { const settings = getSettings(); return { premium: settings.premium !== false, focus: false, islandCity, sellCity: getDefaultCity(), islandLevel: 6, seedSide: settings.buyPriceSide, harvestSide: settings.sellPriceSide, seedFixed: false, harvestFixed: false, slots: Array.from({ length: 16 }, (_, i) => blankSlot(`R${i + 1}`)), pricesUpdatedAt: null }; }
function normalizeDraft(value, islandCity) { return normalizeDraftModel(value, islandCity, defaultDraft(islandCity)); }
function slot(id) { return state.draft.slots.find((entry) => entry.id === id) ?? null; }
function cityName(value) { return state.cities.find((city) => city.marketApiName === value)?.displayName ?? value; }
function islandImage(value) { return `assets/island-planner-v2/islands/${cityKey(value)}.png`; }
function geometryGroupForCity(value = state.draft.islandCity) { const key = cityKey(value); return V2_ROYAL_CITIES.has(key) ? 'royal' : key; }
function geometryForCity() {
    const group = geometryGroupForCity();
    const special = state.geometry?.specialCities?.[group]?.slots ?? V2_SPECIAL_CITY_GEOMETRY[group];
    const runtime = group === 'royal' ? state.geometry?.slots : special && { ...special, R10: state.geometry.slots.R10 };
    const points = runtime ? clone(runtime) : {};
    state.geometryRows.filter((row) => row.geometryGroup === group && /^R(?:[1-9]|1[0-6])$/.test(row.slot)).forEach((row) => {
        const x = Number(row.x); const y = Number(row.y);
        if (Number.isFinite(x) && Number.isFinite(y)) points[row.slot] = { x: clamp01(x), y: clamp01(y) };
    });
    return Object.keys(points).length ? points : null;
}
function displayedSlot() { return state.hoveredSlotId ? slot(state.hoveredSlotId) : slot(state.selectedSlotId); }
function isEditableDetail() { return !state.hoveredSlotId || state.hoveredSlotId === state.selectedSlotId; }
function renderIslandCityBonuses() {
    const bonuses = cityBonusItems(state.draft.islandCity);
    if (!bonuses.length) return '';
    const city = cityName(state.draft.islandCity);
    return `<aside class="island-v2-island-bonuses" aria-label="${escapeHtml(city)} şehir bonusları"><span class="island-v2-island-bonuses-label">Şehir Bonusu</span><span class="island-v2-island-bonuses-items">${bonuses.map((item) => {
        const uniqueName = item.productId || itemUniqueName(item);
        const label = item.productLabel || itemName(item);
        return `<span class="island-v2-island-bonus" data-tier="${item.tier}" title="${escapeHtml(`${city} · ${label} üretim bonusu`)}">${itemIconHtml(uniqueName, { size: 68 })}</span>`;
    }).join('')}</span></aside>`;
}
function effectiveSlotFocus(entry, item) {
    return Boolean(state.draft.focus && entry?.focus && productionModeUsesFocus(item, entry.productionMode));
}
function persistDrafts() {
    if (!state.draft) return;
    state.draftsByCity[cityKey(state.draft.islandCity)] = clone(state.draft);
    writePlanTable(V2_DRAFT_TABLE, state.draftsByCity, state.draft.islandCity, true);
}
function persistCommitted() {
    if (!state.draft || !state.committed) return;
    state.committedByCity[cityKey(state.draft.islandCity)] = clone(state.committed);
    writePlanTable(V2_COMMITTED_TABLE, state.committedByCity);
}
function persistGeometry(slotId, x, y) {
    const group = geometryGroupForCity();
    const rows = getAll(V2_GEOMETRY_TABLE);
    const existing = rows.find((row) => row.geometryGroup === group && row.slot === slotId);
    const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    const row = { id: existing?.id ?? nextId, geometryGroup: group, slot: slotId, x: clamp01(x), y: clamp01(y), updatedAt: new Date().toISOString() };
    replaceAllRows(V2_GEOMETRY_TABLE, existing ? rows.map((entry) => entry.id === existing.id ? row : entry) : [...rows, row]);
    state.geometryRows = getAll(V2_GEOMETRY_TABLE);
}
function switchIslandCity(nextCity) {
    state.autoFillPriceDiagnostics = [];
    if (!nextCity || nextCity === state.draft.islandCity) return;
    persistDrafts();
    const key = cityKey(nextCity);
    state.draft = normalizeDraft(state.draftsByCity[key], nextCity);
    state.committed = normalizeDraft(state.committedByCity[key], nextCity);
    state.draftsByCity[key] = clone(state.draft);
    state.selectedSlotId = 'R1';
    state.hoveredSlotId = null;
    state.toolbar = { stage: 'type', type: null };
    persistDrafts();
}
function priceText() {
    if (state.priceLoading) return 'Fiyatlar alınıyor…';
    if (state.priceError) return `Fiyat alınamadı: ${state.priceError}`;
    if (state.draft?.slots?.some((entry) => isEconomicItem(itemForSlot(entry))) && !v2PriceItemIds().length) return 'Sabit fiyatlar kullanılıyor';
    return state.draft.pricesUpdatedAt ? new Date(state.draft.pricesUpdatedAt).toLocaleString('tr-TR') : 'Fiyat verisi henüz yenilenmedi';
}
function toolbarOptionRank(item) {
    // The catalog key and feedFixed rule already distinguish the pasture groups:
    // transport oxen, horses, then animals with a fixed favourite feed.
    if (item?.plotType !== 'pasture') return 0;
    if (String(item.key).startsWith('ox-')) return 0;
    if (String(item.key).startsWith('horse-')) return 1;
    return item.feedFixed ? 2 : 1;
}
function renderToolbar() {
    const current = state.toolbar;
    let choices = '';
    const back = current.stage === 'type'
        ? '<span class="island-v2-toolbar-leading-space" aria-hidden="true"></span>'
        : '<button type="button" class="island-v2-toolbar-tile island-v2-toolbar-back" data-v2-toolbar-back aria-label="Geri" title="Geri"><span aria-hidden="true">‹</span></button>';
    if (current.stage === 'type') {
        choices = ['farm', 'herb', 'pasture', 'kennel', 'house'].map((type) => {
            const active = current.type === type ? ' is-active' : '';
            return `<button type="button" class="island-v2-toolbar-tile island-v2-toolbar-type${active}" data-v2-toolbar-type="${type}" title="${typeLabel(type)}" aria-pressed="${active ? 'true' : 'false'}"><img class="island-v2-toolbar-type-icon" src="${TOOLBAR_TYPE_ICONS[type]}" alt="" aria-hidden="true"><span>${typeLabel(type)}</span></button>`;
        }).join('');
    }
    if (current.stage === 'item') {
        const groups = new Map();
        itemRows().filter((item) => item.plotType === current.type).sort((a, b) => a.tier - b.tier || toolbarOptionRank(a) - toolbarOptionRank(b) || itemName(a).localeCompare(itemName(b), 'tr')).forEach((item) => {
            if (!groups.has(item.tier)) groups.set(item.tier, []);
            groups.get(item.tier).push(item);
        });
        choices = groups.size ? `<span class="island-v2-toolbar-option-groups">${[...groups.entries()].map(([tier, items]) => `<span class="island-v2-toolbar-option-group" data-v2-toolbar-tier-group="${tier}"><span class="island-v2-toolbar-option-stack">${items.map((item) => `<button type="button" class="island-v2-toolbar-tile island-v2-toolbar-item" data-tier="${item.tier}" data-v2-toolbar-item="${escapeHtml(item.key)}" title="T${item.tier} · ${escapeHtml(itemName(item))}" aria-label="T${item.tier} ${escapeHtml(itemName(item))}">${itemIconHtml(itemUniqueName(item), { size: 60 })}${item.plotType === 'house' ? `<span class="badge island-v2-toolbar-tier" data-tier="${item.tier}" aria-hidden="true">T${item.tier}</span>` : ''}</button>`).join('')}</span></span>`).join('')}</span>` : '<span class="island-v2-toolbar-empty">Bu tür için seçenek bulunamadı.</span>';
    }
    return `<div class="island-v2-toolbar">${back}<div class="island-v2-toolbar-choices">${choices}</div></div>`;
}

function feedItemIds(item) {
    if (!item?.babyId || !item.feedDiet) return [];
    if (item.feedDiet === 'meat') return [`T${item.tier}_MEAT`];
    if (item.feedDiet !== 'plants') return [];
    return feedPlants(item).map((plant) => plant.plantId).filter(Boolean);
}

function resolveFeed(item) {
    const ids = feedItemIds(item);
    const candidates = ids.map((itemId) => {
        const lookup = priceLookup(itemId, state.draft.islandCity, state.draft.seedSide, 'buy', 'input');
        const effective = lookup.quote ? purchaseCost(lookup.quote.price, { setup: lookup.quote.setup }) : null;
        const quantity = animalForFeed(item, { plantId: itemId }).feedQty;
        return { itemId, lookup, effective, quantity, cycleCost: effective == null ? null : effective * quantity };
    });
    const available = candidates.filter((candidate) => Number.isFinite(candidate.effective));
    const selected = available.sort((a, b) => a.cycleCost - b.cycleCost)[0] ?? candidates[0] ?? null;
    return { candidates, ids, itemId: selected?.itemId ?? null, lookup: selected?.lookup ?? null, effective: selected?.effective ?? null, quantity: selected?.quantity ?? null };
}
function purchaseItemId(item) { return item?.seedId || item?.babyId || null; }
function saleItemId(item) { return item?.plantId || item?.grownId || null; }
function v2PriceEntries() { return [...state.draft.slots, ...optimizationEntries()]; }
function v2PriceItemIds(entries = v2PriceEntries()) {
    const ids = [];
    for (const entry of entries) {
        const item = itemForSlot(entry);
        if (!isEconomicItem(item)) continue;
        const production = productionDerived(item, entry);
        if (production.requiresInput) ids.push(purchaseItemId(item));
        if (production.requiresFeed) ids.push(...feedItemIds(item));
        if (production.saleItemId) ids.push(production.saleItemId);
        ids.push(...(production.mountMaterials ?? []).map(line => line.uniqueName));
    }
    return [...new Set(ids.filter(Boolean))];
}
function v2PriceCities(entries = v2PriceEntries()) {
    const cities = new Set();
    for (const entry of entries) {
        const item = itemForSlot(entry);
        if (!isEconomicItem(item)) continue;
        const production = productionDerived(item, entry);
        if ((production.requiresInput || production.requiresFeed)) cities.add(state.draft.islandCity);
        if (production.saleItemId) cities.add(state.draft.sellCity);
    }
    return [...cities].filter(Boolean);
}
function priceRows() {
    if (!state.priceIndex || typeof state.priceIndex.values !== 'function') return [];
    return [...new Set([...state.priceIndex.values()].filter((row) => row?.item_id && row?.city))];
}
function fixedPriceLookup(itemId, role, intent) {
    const lookup = { itemId: itemId ?? null, city: null, side: 'fixed', intent, role, row: null, quote: null, reason: null };
    if (!itemId) {
        lookup.reason = 'Katalogta bu sabit fiyat için uniqueName/itemId yok.';
        return lookup;
    }
    const row = state.fixedPrices.find((value) => (String(value?.itemId) === String(itemId) || getItemUniqueName(value?.itemId) === itemId) && value?.role === role && Number(value?.price) > 0);
    if (!row) {
        lookup.reason = 'Sabit fiyat tanımlı değil.';
        return lookup;
    }
    lookup.row = row;
    lookup.quote = { price: Number(row.price), book: Number(row.price), date: null, stale: false, side: 'fixed', intent, tick: 0, setup: true, fixed: true, role };
    return lookup;
}
function priceLookup(itemId, city, side, intent, role = intent === 'buy' ? 'input' : 'output', useFixed = true) {
    const preferFixed = role === 'input' ? state.draft.seedFixed : state.draft.harvestFixed;
    if (useFixed && preferFixed) {
        const fixed = fixedPriceLookup(itemId, role, intent);
        if (fixed.quote) return fixed;
    }
    const lookup = { itemId: itemId ?? null, city: city ?? null, side, intent, row: null, quote: null, reason: null };
    if (side === LONG_TERM_PRICE_MODE) {
        return { ...lookup, ...longTermQuote(state.longTermPriceIndex, { itemId, city, intent }) };
    }
    if (side === 'average') {
        const history = historyAt(state.averagePriceIndex, itemId, city);
        if (history?.meanAvgPrice > 0) {
            lookup.quote = { price: history.meanAvgPrice, book: history.meanAvgPrice, date: null, stale: false, side, intent, tick: 0, setup: true, average: true };
        } else lookup.reason = 'Son 28 günlük satış geçmişinde ortalama fiyat verisi yok.';
        return lookup;
    }
    if (!state.priceIndex) {
        lookup.reason = 'Fiyat cache’i henüz yüklenmedi.';
        return lookup;
    }
    if (!itemId) {
        lookup.reason = 'Katalogta bu fiyat için uniqueName/itemId yok.';
        return lookup;
    }
    if (!city) {
        lookup.reason = 'Aranacak şehir seçilmedi.';
        return lookup;
    }
    lookup.row = cityRow(state.priceIndex, itemId, city);
    if (lookup.row) {
        lookup.quote = quoteFromRow(lookup.row, side, intent);
        if (!lookup.quote) {
            const field = side === 'buy' ? 'buy_price_max' : 'sell_price_min';
            lookup.reason = `${field} bu şehirde boş veya 0.`;
        }
        return lookup;
    }
    const rows = priceRows();
    const itemRows = rows.filter((row) => row.item_id === itemId);
    const cityRows = itemRows.filter((row) => row.city === city);
    const base = String(itemId).replace(/@\d+$/, '');
    const suffixRows = rows.filter((row) => String(row.item_id).replace(/@\d+$/, '') === base);
    if (cityRows.length) {
        lookup.reason = `Quality 1 kaydı yok; cache’te quality: ${[...new Set(cityRows.map((row) => Number(row.quality) || 1))].join(', ')}.`;
    } else if (itemRows.length) {
        lookup.reason = `Bu item cache’te var, fakat ${city} için değil (mevcut şehirler: ${[...new Set(itemRows.map((row) => row.city))].join(', ')}).`;
    } else if (suffixRows.length) {
        lookup.reason = `Enchantment/uniqueName uyuşmazlığı: cache’te ${[...new Set(suffixRows.map((row) => row.item_id))].join(', ')} var, istenen ${itemId}.`;
    } else {
        lookup.reason = 'Bu uniqueName için cache’te kayıt yok.';
    }
    return lookup;
}
function priceQuote(itemId, city, side, intent, role) {
    return priceLookup(itemId, city, side, intent, role).quote;
}
function fixedMarketComparison(itemId, city, role, fixedQuote) {
    if (!fixedQuote?.fixed || !state.priceIndex) return null;
    const intent = role === 'input' ? 'buy' : 'sell';
    const side = role === 'input' ? state.draft.seedSide : state.draft.harvestSide;
    const marketQuote = priceLookup(itemId, city, side, intent, role, false).quote;
    if (!marketQuote) return null;
    const difference = marketQuote.price - fixedQuote.price;
    return {
        marketQuote,
        difference,
        percent: fixedQuote.price > 0 ? (difference / fixedQuote.price) * 100 : null
    };
}
function fixedComparisonTitle(values) {
    const rows = [
        ['Tohum / yavru', values.purchaseQuote, values.purchaseComparison],
        ['Yem', values.feedQuote, values.feedComparison],
        ['Hasat', values.saleQuote, values.saleComparison]
    ].filter(([, quote, comparison]) => quote?.fixed && comparison);
    return rows.map(([label, quote, comparison]) => {
        const percent = Number.isFinite(comparison.percent) ? Math.abs(comparison.percent).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '—';
        const direction = comparison.difference < 0 ? 'altında' : comparison.difference > 0 ? 'üstünde' : 'ile aynı';
        return `${label}: Sabit order ${displayValue(quote.price)} · pazar order ${displayValue(comparison.marketQuote.price)} · ${comparison.difference >= 0 ? '+' : ''}${displayValue(comparison.difference)} / %${percent} · Pazar hedefin %${percent} ${direction}.`;
    }).join('\n');
}
function missingPriceDiagnostic({ entry, item, lookup, role, blocked }) {
    return {
        type: lookup.side === 'fixed' ? 'missing-fixed-price' : 'missing-price',
        slotId: entry.id,
        item: getItemLocalizedName(lookup.itemId, itemName(item)),
        itemId: lookup.itemId,
        city: lookup.city,
        side: lookup.side,
        role,
        blocked,
        reason: lookup.reason || 'Bilinmeyen lookup hatası.'
    };
}
function formatPriceAge(date) {
    const stamp = Date.parse(date);
    if (!Number.isFinite(stamp)) return 'zaman bilgisi yok';
    const minutes = Math.max(0, Math.floor((Date.now() - stamp) / 60000));
    if (minutes < 60) return `${minutes} dk önce`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} sa önce`;
    return `${Math.floor(minutes / 1440)} gün önce`;
}
function stalePriceDiagnostic({ entry, item, itemId, city, side, quote, role, usedIn }) {
    return {
        type: 'stale-price', slotId: entry.id, item: getItemLocalizedName(itemId, itemName(item)), itemId, city, side, role,
        blocked: usedIn, updatedAt: quote.date ?? null, age: formatPriceAge(quote.date),
        reason: `Son fiyat güncellemesi: ${quote.date ? new Date(quote.date).toLocaleString('tr-TR') : 'bilinmiyor'} (${formatPriceAge(quote.date)}).`
    };
}
function diagnosticText(diagnostic) {
    return `${diagnostic.slotId} · ${diagnostic.item} · ${diagnostic.itemId || 'itemId yok'} · ${diagnostic.city || 'şehir yok'} · ${diagnostic.side} · ${diagnostic.blocked}: ${diagnostic.reason}`;
}
function diagnosticsTitle(diagnostics) {
    return diagnostics.length ? diagnostics.map(diagnosticText).join('\n') : '';
}
function logMissingPriceDiagnostics(diagnostics) {
    const signature = JSON.stringify(diagnostics);
    if (signature === state.priceDiagnosticSignature) return;
    state.priceDiagnosticSignature = signature;
    if (diagnostics.length) {
        console.warn('[Island Planner V2] Fiyat eksik teşhisi', diagnostics);
    }
}
function dependency({ type, entry, item, blocked, reason, itemId = null, city = null, side = null }) {
    return { type, slotId: entry.id, item: itemName(item), itemId, city, side, blocked, reason };
}
function dependencyTypeLabel(type) {
    return ({
        'missing-price': 'Fiyat eksik',
        'missing-fixed-price': 'Sabit fiyat tanımlı değil',
        'missing-output-data': 'Çıktı verisi eksik',
        'missing-rr-output-data': 'RR verisi eksik',
        'missing-feed-rule': 'Yem kuralı eksik',
        'missing-focus-cost': 'Focus maliyeti eksik',
        'missing-production-mode-data': 'Üretim modu verisi eksik',
        'stale-price': 'Eski fiyat',
        'missing-ledger-row': 'Hesap satırı eksik'
    })[type] ?? 'Hesap verisi eksik';
}
function dependencyText(value) {
    const lookup = [value.itemId, value.city, value.side].filter(Boolean).join(' · ');
    return `${value.slotId} · ${value.item} · ${dependencyTypeLabel(value.type)} · ${value.blocked}${lookup ? ` · ${lookup}` : ''}: ${value.reason}`;
}
function dependencyTitle(values) {
    return values?.length ? values.map(dependencyText).join('\n') : '';
}
function dependencyRow(value, { price = false } = {}) {
    const item = itemForSlot(slot(value.slotId));
    const itemId = value.itemId || (item ? itemUniqueName(item) : null);
    const icon = itemId ? itemIconHtml(itemId, { size: 40, className: 'island-v2-warning-icon' }) : '';
    const date = value.updatedAt ? new Date(value.updatedAt) : null;
    const timestamp = date && Number.isFinite(date.getTime()) ? `${date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}${value.age ? ` (${value.age})` : ''}` : '';
    const meta = [itemId, value.blocked, timestamp, !price && (value.slotIds?.join(', ') || value.slotId), !price && value.reason].filter(Boolean).join(' · ');
    return `<li class="island-v2-warning-row" data-v2-warning-type="${escapeHtml(value.type)}">${icon}<div class="island-v2-warning-content"><div class="island-v2-warning-head"><span class="island-v2-warning-name" title="${escapeHtml(value.item)}">${escapeHtml(value.item)}</span>${value.side ? `<span class="island-v2-warning-source">${escapeHtml([value.city && cityName(value.city), value.side].filter(Boolean).join(' · '))}</span>` : ''}<em>${escapeHtml(dependencyTypeLabel(value.type))}</em></div><small title="${escapeHtml(meta)}">${escapeHtml(meta)}</small></div></li>`;
}
function dependencyList(values) {
    const unique = uniqueDependencies(values);
    return unique.map((value) => dependencyRow(value)).join('');
}
function uniquePriceDependencies(values) {
    return [...new Map((values ?? []).map((value) => [
        `${value.type}|${value.itemId || ''}|${value.city || ''}|${value.side || ''}`,
        value
    ])).values()];
}
function priceDependencyList(values) {
    return uniquePriceDependencies(values).map((value) => dependencyRow(value, { price: true })).join('');
}
function ledgerDependencies(entry, item, ledger) {
    if (!ledger) {
        return [dependency({ type: 'missing-ledger-row', entry, item, blocked: 'Kâr / Gün', reason: 'V1 island ledger bu item için hesap satırı üretmedi.' })];
    }
    return (ledger.missing ?? []).map((missing) => {
        const feed = /yem/i.test(missing);
        const itemId = feed ? (item.feedDiet === 'meat' ? `T${item.tier}_MEAT` : (item.feedPlantId || item.feedSeedId || null)) : null;
        const missingFeedRule = feed && (!item.feedDiet || !Number.isFinite(Number(item.feedQty)) || Number(item.feedQty) <= 0 || (item.feedFixed && !item.feedPlantId));
        return dependency({
            type: missingFeedRule ? 'missing-feed-rule' : 'missing-price', entry, item, itemId,
            city: feed ? state.draft.islandCity : null,
            side: feed ? state.draft.seedSide : null,
            blocked: 'Kâr / Gün',
            reason: `V1 island ledger eksik dependency bildirdi: ${missing}.`
        });
    });
}
function logDerivedDependencies(dependencies) {
    const signature = JSON.stringify(dependencies);
    if (signature === state.derivedDiagnosticSignature) return;
    state.derivedDiagnosticSignature = signature;
    if (dependencies.length) console.warn('[Island Planner V2] Derived dependency teşhisi', dependencies);
}
function priceStateFor(requiredQuotes) {
    if (requiredQuotes.some((quote) => !quote)) return 'missing';
    if (requiredQuotes.length && requiredQuotes.every((quote) => quote.fixed)) return 'fixed';
    return requiredQuotes.some((quote) => quote.stale) ? 'stale' : 'current';
}
function uniquePriceDiagnosticCount(diagnostics) {
    return new Set((diagnostics ?? []).map((value) => {
        const identity = [value.itemId, value.city, value.side].filter(Boolean).join('|');
        return identity || `${value.type}|${value.reason}`;
    })).size;
}
function sumFinite(values) { return values.every(Number.isFinite) ? values.reduce((total, value) => total + value, 0) : null; }
function priceSummaryLabel(summary) {
    if (summary.missing) return `${summary.missing} eksik${summary.stale ? ` · ${summary.stale} güncel değil` : ''}`;
    return summary.stale ? `${summary.stale} güncel değil` : 'Güncel';
}
function dailyQuantity(perCycle, hours) {
    return Number.isFinite(perCycle) && Number.isFinite(hours) && hours > 0
        ? (perCycle / hours) * planDayHours()
        : null;
}
function productionDerived(item, entry) {
    const premium = state.draft.premium;
    const usesFocus = productionModeUsesFocus(item, entry.productionMode);
    const focused = effectiveSlotFocus(entry, item);
    if (item.seedId || item.plantId) {
        const yieldInfo = effectivePlantYield(item, state.draft.islandCity, {
            premium,
            water: focused
        });
        const returnInfo = effectiveSeedReturn(item, state.draft.islandCity, {
            premium,
            water: focused
        });
        const hours = planCycleHours(cropHours());
        const output = dailyQuantity(plantSlots() * yieldInfo.qty, hours);
        const rr = Number.isFinite(returnInfo.rate) ? returnInfo.rate : null;
        const source = yieldInfo.source === 'user' || returnInfo.source === 'user' ? 'user' : 'standard';
        const samples = Math.max(yieldInfo.n ?? 0, returnInfo.n ?? 0);
        return { output, netOutput: output, rr, hours, source, samples, saleItemId: item.plantId, requiresInput: true, requiresFeed: false, usesFocus, effectiveFocus: focused };
    }

    // The V1 animal grow path sells one grown animal per pen. A yield log can
    // replace that observed output ratio; it shares the same city/focus context
    // as the existing V1 offspring-return lookup.
    const mode = productionModeFor(item, entry.productionMode);
    const hours = planCycleHours(animalCycleHours(item, premium, mode));
    if (mode === 'product') {
        const productInfo = effectiveAnimalProductYield(item, state.draft.islandCity, { premium, focus: focused });
        const output = dailyQuantity(Number(item.pens) * productInfo.qty, hours);
        return { output, netOutput: output, rr: null, hours, source: productInfo.source, samples: productInfo.n ?? 0, saleItemId: item.productId, requiresInput: false, requiresFeed: true, usesFocus, effectiveFocus: false };
    }
    if (mode === 'butcher') {
        const output = dailyQuantity(Number(item.pens) * butcherQty(item, { islandCity: state.draft.islandCity }), hours);
        const returnInfo = effectiveAnimalReturn(item, state.draft.islandCity, { premium, focus: focused });
        return { output, netOutput: output, rr: Number.isFinite(returnInfo.rate) ? returnInfo.rate : null, hours, source: returnInfo.source, samples: returnInfo.n ?? 0, saleItemId: item.meatId, requiresInput: true, requiresFeed: true, usesFocus, effectiveFocus: focused };
    }
    const observed = yieldAverage(state.draft.islandCity, item.key, {
        premium,
        water: focused,
        itemType: 'animal'
    });
    const outputRatio = observed && Number.isFinite(observed.avgPlantYield) && observed.avgPlantYield > 0
        ? observed.avgPlantYield
        : 1;
    const returnInfo = effectiveAnimalReturn(item, state.draft.islandCity, { premium, focus: focused });
    const output = dailyQuantity(Number(item.pens) * outputRatio, hours);
    const rr = Number.isFinite(returnInfo.rate) ? returnInfo.rate : null;
    const source = observed || returnInfo.source === 'user' ? 'user' : 'standard';
    return { output, netOutput: output, rr, hours, source, samples: Math.max(observed?.n ?? 0, returnInfo.n ?? 0), saleItemId: mode === 'mount' ? mountRecipeFor(item, entry.mountItem)?.uniqueName : item.grownId,
        mountMaterials: mode === 'mount' ? mountRecipeFor(item, entry.mountItem).lines.filter(line => line.inputItemId !== item.grownItemId) : [],
        requiresInput: true, requiresFeed: true, usesFocus, effectiveFocus: focused };
}
function productionSourceLabel(values) {
    if (values.productionSource === 'user') {
        return `GK${values.productionSamples ? ` (${values.productionSamples})` : ''}`;
    }
    return values.productionSource === 'standard' ? 'Ref.' : '—';
}
function productionSourceTitle(values) {
    if (values.productionSource === 'user') {
        return `GK: Ada Çıktı gözlemleri kullanıldı${values.productionSamples ? ` (${values.productionSamples} kayıt)` : ''}.`;
    }
    return values.productionSource === 'standard'
        ? 'Ref.: Referans varsayılan. Ada Çıktı gözlemi yok; mevcut katalog/ekonomi varsayılanı kullanıldı.'
        : dependencyTitle([...(values.dependencies?.output ?? []), ...(values.dependencies?.rr ?? [])]);
}
export function calculateIslandPlan({ entries = state.draft.slots, update = true } = {}) {
    const slots = new Map(); const candidates = []; const profiles = [];
    const diagnostics = []; const staleDiagnostics = []; const derivedDependencies = [];
    for (const entry of entries) {
        const item = itemForSlot(entry);
        if (!item) { slots.set(entry.id, { income: null, expense: null, net: null, focus: null, output: null, rr: null, internal: null, market: null, priceState: 'empty', diagnostics: [], dependencies: {} }); continue; }
        if (!isEconomicItem(item)) { slots.set(entry.id, { income: null, expense: null, net: null, focus: null, output: null, rr: null, internal: null, market: null, economic: false, priceState: 'not-applicable', diagnostics: [], staleDiagnostics: [], dependencies: {} }); continue; }
        const production = productionDerived(item, entry);
        const capacity = item.seedId ? plantSlots() : Number(item.pens);
        const dailyFactor = Number.isFinite(production.hours) && production.hours > 0 ? planDayHours() / production.hours : null;
        const inputQuantity = production.requiresInput && Number.isFinite(capacity) && Number.isFinite(dailyFactor) && Number.isFinite(production.rr)
            ? capacity * dailyFactor * (1 - production.rr) : null;
        const feed = production.requiresFeed ? resolveFeed(item) : null;
        const feedId = feed?.itemId ?? null;
        const feedQuantity = !production.requiresFeed ? 0 : Number.isFinite(capacity) && Number.isFinite(dailyFactor) && Number.isFinite(feed?.quantity) && feed.quantity > 0
            ? capacity * dailyFactor * feed.quantity : null;
        const feedLookup = feed?.lookup ?? null;
        const feedEffective = feed?.effective ?? null;
        const candidate = { entry, item, production, capacity, inputQuantity, feedIds: feed?.ids ?? [], feedId, feedQuantity, feedLookup, feedEffective, feedCycles: production.requiresFeed ? capacity * dailyFactor : 0, internalCycles: 0, internalFeed: [], feedChoices: feed?.candidates ?? [], internal: 0, market: feedQuantity, consumed: 0, internalTransferIn: 0, internalTransferOut: 0 };
        candidates.push(candidate);
        const sale = item.plantId ? priceQuote(item.plantId, state.draft.sellCity, state.draft.harvestSide, 'sell', 'output') : null;
        profiles.push({ entry, net: 0,
            supplies: sale && Number.isFinite(production.output) ? [{ id: item.plantId, quantity: production.output, unitValue: saleProceeds(sale.price, { premium: state.draft.premium, setup: sale.setup }) }] : [],
            feed: Number.isFinite(candidate.feedCycles) && Number.isFinite(feedEffective) && Number.isFinite(feedQuantity)
                ? { cycles: candidate.feedCycles, marketCycleCost: feedEffective * feed.quantity,
                    choices: candidate.feedChoices.filter(choice => Number.isFinite(choice.quantity) && choice.quantity > 0).map(choice => ({ id: choice.itemId, quantity: choice.quantity })) } : null });
    }
    for (const transfer of allocateInternalFeed(profiles)) {
        const supply = candidates[transfer.producer], consumer = candidates[transfer.consumer];
        supply.consumed += transfer.used;
        consumer.internal += transfer.used;
        consumer.internalFeed.push({ itemId: supply.production.saleItemId, quantity: transfer.used });
        consumer.internalCycles += transfer.cycles;
        consumer.market = Math.max(0, consumer.feedQuantity - consumer.internalCycles * profiles[transfer.consumer].feed.choices.find(choice => choice.id === consumer.feedId).quantity);
        const transferValue = transfer.used * transfer.unitValue;
        supply.internalTransferOut += transferValue;
        consumer.internalTransferIn += transferValue;
    }
    for (const candidate of candidates) {
        const { entry, item, production } = candidate;
        const purchaseLookup = production.requiresInput ? priceLookup(purchaseItemId(item), state.draft.islandCity, state.draft.seedSide, 'buy', 'input') : null;
        const saleLookup = priceLookup(production.saleItemId, state.draft.sellCity, state.draft.harvestSide, 'sell', 'output');
        const feedLookup = candidate.feedId && (candidate.market > 0 || candidate.internal > 0) ? candidate.feedLookup : null;
        const purchaseQuote = purchaseLookup?.quote ?? null; const saleQuote = saleLookup.quote; const feedQuote = feedLookup?.quote ?? null;
        const mountMaterials = (production.mountMaterials ?? []).map(line => {
            const lookup = priceLookup(line.uniqueName, state.draft.islandCity, state.draft.seedSide, 'buy', 'input');
            return { ...line, ...mountMaterialConsumption(line), lookup, quote: lookup.quote };
        });
        const mountCost = sumFinite(mountMaterials.map(line => line.quote && Number.isFinite(production.output)
            ? purchaseCost(line.quote.price, { setup: line.quote.setup }) * line.netQty * production.output : null));
        const slotDiagnostics = [];
        for (const line of mountMaterials) if (!line.quote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: line.lookup, role: 'binek malzemesi', blocked: 'Bineğe dönüştürme gideri' }));
        if (production.requiresInput && !purchaseQuote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: purchaseLookup, role: 'alış', blocked: 'Tohum / yavru maliyeti' }));
        if (!saleQuote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: saleLookup, role: 'satış', blocked: 'Hasat satış geliri' }));
        if (candidate.feedId && candidate.market > 0 && !feedQuote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: feedLookup, role: 'yem', blocked: 'Yem gideri' }));
        const priceDependencies = slotDiagnostics.map((diagnostic) => dependency({ type: diagnostic.type, entry, item, itemId: diagnostic.itemId, city: diagnostic.city, side: diagnostic.side, blocked: diagnostic.blocked, reason: diagnostic.reason }));
        const baseDependencies = [];
        if (!Number.isFinite(production.output)) baseDependencies.push(dependency({ type: 'missing-output-data', entry, item, blocked: 'Günlük Çıktı', reason: 'Ada Çıktı gözlemi veya mevcut referans çıktı değeri bulunamadı.' }));
        if (production.requiresInput && !Number.isFinite(production.rr)) baseDependencies.push(dependency({ type: 'missing-rr-output-data', entry, item, blocked: 'RR / Geri Dönüş', reason: 'Ada Çıktı gözlemi veya mevcut referans geri dönüş oranı bulunamadı.' }));
        if (production.requiresFeed && (!candidate.feedIds.length || !Number.isFinite(candidate.feedQuantity))) baseDependencies.push(dependency({ type: 'missing-feed-rule', entry, item, blocked: 'Yem gideri', reason: 'Mevcut katalogda bu hayvan için günlük yem kuralı eksik.' }));
        const effectiveBuy = purchaseQuote ? purchaseCost(purchaseQuote.price, { setup: purchaseQuote.setup }) : null;
        const effectiveSell = saleQuote ? saleProceeds(saleQuote.price, { premium: state.draft.premium, setup: saleQuote.setup }) : null;
        const effectiveFeed = feedQuote ? purchaseCost(feedQuote.price, { setup: feedQuote.setup }) : null;
        const seedOrBabyCost = !production.requiresInput ? 0 : (Number.isFinite(effectiveBuy) && Number.isFinite(candidate.inputQuantity) ? effectiveBuy * candidate.inputQuantity : null);
        const feedCost = candidate.market > 0 ? (Number.isFinite(effectiveFeed) ? effectiveFeed * candidate.market : null) : 0;
        const feedRuleReady = !production.requiresFeed || (candidate.feedIds.length > 0 && Number.isFinite(candidate.feedQuantity));
        const expense = Number.isFinite(seedOrBabyCost) && Number.isFinite(feedCost) && Number.isFinite(mountCost) && feedRuleReady ? seedOrBabyCost + feedCost + mountCost : null;
        const saleQuantity = Math.max(0, (production.output ?? 0) - candidate.consumed);
        const income = Number.isFinite(effectiveSell) && Number.isFinite(production.output)
            ? effectiveSell * (item.plantId ? saleQuantity : production.output) : null;
        const standaloneFeedCost = production.requiresFeed ? (Number.isFinite(effectiveFeed) && Number.isFinite(candidate.feedQuantity) ? effectiveFeed * candidate.feedQuantity : null) : 0;
        const standaloneIncome = Number.isFinite(effectiveSell) && Number.isFinite(production.output) ? effectiveSell * production.output : null;
        const standaloneExpense = Number.isFinite(seedOrBabyCost) && Number.isFinite(standaloneFeedCost) && Number.isFinite(mountCost) && feedRuleReady ? seedOrBabyCost + standaloneFeedCost + mountCost : null;
        profiles[candidates.indexOf(candidate)].net = Number.isFinite(standaloneIncome) && Number.isFinite(standaloneExpense) ? standaloneIncome - standaloneExpense : null;
        const externalIncome = income;
        const externalExpense = expense;
        const productionCost = Number.isFinite(externalExpense) ? externalExpense + candidate.internalTransferIn : null;
        const unitCost = Number.isFinite(productionCost) && production.output > 0 ? productionCost / production.output : null;
        const externalNet = Number.isFinite(externalIncome) && Number.isFinite(externalExpense) ? externalIncome - externalExpense : null;
        const contribution = Number.isFinite(externalIncome) && Number.isFinite(externalExpense)
            ? externalIncome + candidate.internalTransferOut - externalExpense - candidate.internalTransferIn
            : null;
        const requiredQuotes = [...mountMaterials.map(line => line.quote), ...(production.requiresInput ? [purchaseQuote] : []), saleQuote, ...(candidate.feedId && candidate.market > 0 ? [feedQuote] : [])];
        const priceState = priceStateFor(requiredQuotes);
        if (priceState === 'missing') diagnostics.push(...slotDiagnostics);
        const slotStaleDiagnostics = [];
        const staleRows = [[purchaseQuote, purchaseItemId(item), state.draft.islandCity, state.draft.seedSide, 'alış', 'Tohum / yavru maliyeti'], [saleQuote, production.saleItemId, state.draft.sellCity, state.draft.harvestSide, 'satış', 'Hasat satış geliri'], [feedQuote, candidate.feedId, state.draft.islandCity, state.draft.seedSide, 'yem', 'Yem gideri']];
        staleRows.push(...mountMaterials.map(line => [line.quote, line.uniqueName, state.draft.islandCity, state.draft.seedSide, 'binek malzemesi', 'Bineğe dönüştürme gideri']));
        staleRows.forEach(([quote, itemId, city, side, role, usedIn]) => { if (quote?.stale) slotStaleDiagnostics.push(stalePriceDiagnostic({ entry, item, itemId, city, side, quote, role, usedIn })); });
        if (slotStaleDiagnostics.length) staleDiagnostics.push(...slotStaleDiagnostics);
        const focus = dailyFocusRequirement(item, { focused: production.effectiveFocus, capacity: candidate.capacity, hours: production.hours });
        const dependencies = {
            income: Number.isFinite(income) ? [] : [...priceDependencies.filter((value) => value.blocked === 'Hasat satış geliri'), ...baseDependencies],
            expense: Number.isFinite(expense) ? [] : [...priceDependencies.filter((value) => value.blocked !== 'Hasat satış geliri'), ...baseDependencies],
            net: Number.isFinite(externalNet) ? [] : [...priceDependencies, ...baseDependencies],
            contribution: Number.isFinite(contribution) ? [] : [...priceDependencies, ...baseDependencies],
            profitPercent: Number.isFinite(contribution) && Number.isFinite(externalExpense + candidate.internalTransferIn) && externalExpense + candidate.internalTransferIn > 0 ? [] : [...priceDependencies, ...baseDependencies],
            focus: !Number.isFinite(focus) ? [dependency({ type: 'missing-focus-cost', entry, item, blocked: 'Focus / Gün', reason: 'Bu üretim için karakter Focus tüketimi / uzmanlık verisi eksik; sıfır varsayılmadı.' })] : [],
            output: Number.isFinite(production.output) ? [] : baseDependencies.filter((value) => value.type === 'missing-output-data'),
            rr: Number.isFinite(production.rr) ? [] : baseDependencies.filter((value) => value.type === 'missing-rr-output-data'),
            internal: [], market: []
        };
        Object.values(dependencies).forEach((values) => derivedDependencies.push(...values));
        slots.set(entry.id, { mountCost, mountMaterials, income: externalIncome, expense: externalExpense, net: externalNet, externalIncome, externalExpense, externalNet, contribution, unitCost, profitPercent: Number.isFinite(contribution) && Number.isFinite(externalExpense + candidate.internalTransferIn) && externalExpense + candidate.internalTransferIn > 0 ? (contribution / (externalExpense + candidate.internalTransferIn)) * 100 : null, focus, usesFocus: production.usesFocus, effectiveFocus: production.effectiveFocus, output: production.output, netOutput: item.plantId ? saleQuantity : production.output, rr: production.rr, productionSource: production.source, productionSamples: production.samples, productionHours: production.hours, internal: candidate.internal, market: candidate.market, internalTransferIn: candidate.internalTransferIn, internalTransferOut: candidate.internalTransferOut, economic: true, saleItemId: production.saleItemId, purchaseItemId: purchaseItemId(item), purchaseQuantity: candidate.inputQuantity, internalFeed: candidate.internalFeed, feedId: candidate.feedId, feed: Number.isFinite(candidate.market) ? candidate.internal + candidate.market : null, priceState, purchaseQuote, saleQuote, feedQuote, purchaseEffective: effectiveBuy, saleEffective: effectiveSell, feedEffective: effectiveFeed, purchaseComparison: fixedMarketComparison(purchaseItemId(item), state.draft.islandCity, 'input', purchaseQuote), saleComparison: fixedMarketComparison(production.saleItemId, state.draft.sellCity, 'output', saleQuote), feedComparison: fixedMarketComparison(candidate.feedId, state.draft.islandCity, 'input', feedQuote), diagnostics: slotDiagnostics, staleDiagnostics: slotStaleDiagnostics, dependencies });
    }
    const filled = [...slots.values()].filter((value) => value.economic === true);
    const contributionTotal = sumFinite(filled.map((value) => value.contribution));
    const externalNet = sumFinite(filled.map((value) => value.externalNet));
    if (Number.isFinite(contributionTotal) && Number.isFinite(externalNet) && Math.abs(contributionTotal - externalNet) > 1e-7) {
        console.warn('[Island Planner V2] Katkı toplamı external net ile uyuşmuyor.', { contributionTotal, externalNet });
    }
    if (update) { logMissingPriceDiagnostics(diagnostics); logDerivedDependencies(derivedDependencies); }
    const missing = uniquePriceDiagnosticCount(diagnostics);
    const stale = uniquePriceDiagnosticCount(staleDiagnostics);
    const summaryDependencies = (key) => filled.filter((value) => !Number.isFinite(value[key])).flatMap((value) => value.dependencies?.[key] ?? []);
    const derived = { slots, profiles, summary: { net: externalNet, contribution: contributionTotal, income: sumFinite(filled.map((value) => value.externalIncome)), expense: sumFinite(filled.map((value) => value.externalExpense)), focus: sumFinite(filled.map(value => value.focus)), internal: sumFinite(filled.map((value) => value.internal)), market: sumFinite(filled.map((value) => value.market)), surplus: sumFinite(filled.map((value) => value.netOutput)), feed: sumFinite(filled.map(value => value.feed)), missing, stale, priceLabel: priceSummaryLabel({ missing, stale }), diagnostics, staleDiagnostics, dependencies: { net: summaryDependencies('net'), income: summaryDependencies('income'), expense: summaryDependencies('expense'), focus: filled.flatMap((value) => value.dependencies?.focus ?? []) } } };
    if (update) { state.derived = derived; render(); }
    return derived;
}
export async function optimizeDraftPlacement(candidates, { cancelled = () => false, baseline = calculateIslandPlan({ update: false }), isLocked = isSlotLocked } = {}) {
    const available = state.draft.slots.filter(entry => !entry.item && !isLocked(entry.id));
    if (!Number.isFinite(baseline.summary.net) || baseline.profiles.some(profile => !Number.isFinite(profile.net))) throw new Error('Mevcut taslağın net kârı hesaplanamıyor.');
        const result = await optimizePlacement(candidates, baseline.profiles, available.length, { cancelled });
        if (cancelled()) throw new Error('Plan değişti; otomatik doldurma iptal edildi.');
        const next = state.draft.slots.map(entry => {
            const index = available.findIndex(candidate => candidate.id === entry.id);
            if (index < 0) return entry;
            return result.entries[index] ? { ...result.entries[index], id: entry.id } : blankSlot(entry.id);
        });
        const derived = calculateIslandPlan({ entries: next, update: false });
        if (!Number.isFinite(derived.summary.net) || Math.abs(derived.summary.net - result.net) > .01 || Math.abs(result.baseline - baseline.summary.net) > .01 || Math.abs(derived.summary.net - baseline.summary.net - result.marginalNet) > .01) throw new Error('Yerleştirme sonucu ada hesabıyla doğrulanamadı.');
    return { result, next, derived };
}
export function evaluatePlacementCandidates(entries) {
    const diagnostics = [];
        const candidates = [];
        let staleCandidates = 0;
        for (const entry of entries) {
            const trial = calculateIslandPlan({ entries: [entry], update: false });
            const value = trial.slots.get(entry.id);
            diagnostics.push(...(value?.diagnostics ?? []).map(diagnostic => ({ ...diagnostic, type: diagnostic.type ?? 'missing-price' })), ...(value?.staleDiagnostics ?? []));
            if (!Number.isFinite(value?.net) || !Number.isFinite(trial.profiles[0]?.net)) continue;
            if (value.staleDiagnostics?.length) staleCandidates++;
            candidates.push(trial.profiles[0]);
        }
    return { candidates, staleCandidates, diagnostics, skipped: entries.length - candidates.length };
}
export function optimizationEntries() {
return itemRows().filter(item => isEconomicItem(item) && item.plotType !== 'kennel').flatMap(item => {
            const modes = animalProductionModes(item);
            return (modes.length ? modes.map(mode => mode.value) : [null]).flatMap(productionMode =>
                (productionMode === 'mount' ? mountRecipes(item).map(recipe => recipe.uniqueName) : [null]).flatMap(mountItem =>
                    [false].map(focus =>
                        ({ ...blankSlot('R1'), item: item.key, type: item.plotType, tier: item.tier, productionMode, mountItem, focus }))));
        });
}
async function autoFillIsland() {
    if (state.autoFilling || state.priceLoading) return;
    clearTimeout(state.calculationTimer);
    const available = state.draft.slots.filter(entry => !entry.item && !isSlotLocked(entry.id));
    if (!available.length) { showToast('Doldurulabilecek açık ve boş slot yok.'); return; }
    const signature = JSON.stringify(state.draft);
    const cancelled = () => signature !== JSON.stringify(state.draft);
    state.autoFillResult = null;
    state.autoFilling = true;
    state.autoFillPriceDiagnostics = [];
    ++state.priceRequestId;
    render();
    let applied = false;
    try {
        const entries = optimizationEntries();
        const ids = v2PriceItemIds([...state.draft.slots, ...entries]);
        if (ids.length) {
            const { rows, history, longTerm } = await fetchPlanPrices(ids, v2PriceCities([...state.draft.slots, ...entries]));
            if (cancelled()) throw new Error('Plan değişti; otomatik doldurma iptal edildi.');
            state.priceIndex = indexPrices(rows);
            state.averagePriceIndex = history;
            state.longTermPriceIndex = longTerm;
        }
        const baseline = calculateIslandPlan({ update: false });
        if (!Number.isFinite(baseline.summary.net) || baseline.profiles.some(profile => !Number.isFinite(profile.net))) {
            state.autoFillPriceDiagnostics.push(...baseline.summary.diagnostics, ...baseline.summary.staleDiagnostics);
            throw new Error('Mevcut taslağın net kârı hesaplanamıyor; eksik fiyat/üretim verisini tamamlayın.');
        }
        const evaluated = evaluatePlacementCandidates(entries);
        const { diagnostics } = evaluated;
        const minimum = state.draft.minSalesVolume;
        const outputId = candidate => productionDerived(itemForSlot(candidate.entry), candidate.entry).saleItemId;
        const history = minimum > 0
            ? await fetchHistoryIndex(evaluated.candidates.map(outputId), [state.draft.sellCity], { days: SALES_VOLUME.days, timeScale: 24 })
            : null;
        if (cancelled()) throw new Error('Plan değişti; otomatik doldurma iptal edildi.');
        const volumeFilter = filterSalesVolume(evaluated.candidates, minimum, candidate => {
            const stats = historyAt(history, outputId(candidate), state.draft.sellCity);
            return stats?.n > 0 ? stats.avgItemCount : null;
        });
        const { candidates } = volumeFilter;
        const staleCandidates = candidates.filter(candidate => calculateIslandPlan({ entries: [candidate.entry], update: false }).slots.get(candidate.entry.id)?.staleDiagnostics?.length).length;
        state.autoFillPriceDiagnostics.push(...baseline.summary.staleDiagnostics, ...diagnostics);
        state.optimizationPricesChecked = true;
        if (!candidates.length) throw new Error(minimum > 0
            ? `Fiyat/üretim verisi ve en az ${displayValue(minimum)} adet/gün satış hacmi koşullarını sağlayan seçenek yok. ${volumeFilter.low} düşük hacimli, ${volumeFilter.unknown} hacim verisi olmayan seçenek elendi.`
            : 'Yerleştirme için yeterli fiyat veya üretim verisi yok.');
        const { result, next, derived } = await optimizeDraftPlacement(candidates, { cancelled, baseline });
        state.autoFillResult = { ...result.metadata, totalCandidates: entries.length, missingPrices: uniquePriceDiagnosticCount(state.autoFillPriceDiagnostics.filter(value => value.type !== 'stale-price')), skipped: evaluated.skipped, staleCandidates,
            volumeExcluded: volumeFilter.low, volumeUnknown: volumeFilter.unknown, minSalesVolume: minimum,
            stalePrices: uniquePriceDiagnosticCount(state.autoFillPriceDiagnostics.filter(value => value.type === 'stale-price')),
            baselineNet: baseline.summary.net, totalNet: derived.summary.net, marginalNet: result.marginalNet,
            focusPerDay: derived.summary.focus, knownFocusPerDay: [...derived.slots.values()].reduce((sum, value) => sum + (Number.isFinite(value.focus) ? value.focus : 0), 0), focusBudget: null,
            unknownFocusSlots: [...derived.slots.values()].filter(value => value.effectiveFocus && !Number.isFinite(value.focus)).length };
        state.draft.slots = next;
        state.draft.pricesUpdatedAt = new Date().toISOString();
        persistDrafts();
        applied = true;
        const missing = uniquePriceDiagnosticCount(state.autoFillPriceDiagnostics.filter(value => value.type !== 'stale-price'));
        const stale = uniquePriceDiagnosticCount(state.autoFillPriceDiagnostics.filter(value => value.type === 'stale-price'));
        const reportRows = [
            ['Net kâr / gün', displayValue(result.net)],
            ['Ek kazanç / gün', '+' + displayValue(result.marginalNet)]
        ];
        if (state.draft.focus && derived.summary.focus > 0) reportRows.push(['Focus / gün', displayValue(derived.summary.focus)]);
        if (missing) reportRows.push(['Eksik fiyat', String(missing)]);
        if (stale) reportRows.push(['Eski fiyat', String(stale)]);
        showToast('Otomatik doldurma tamamlandı', {
            duration: 8000,
            rows: reportRows,
            note: missing || stale ? 'Eksik fiyatlı seçenekler atlandı; eski fiyatlar sonucu etkileyebilir.' : ''
        });
    } catch (error) {
        showToast(error.message || 'Otomatik doldurma başarısız.', { kind: 'error' });
    } finally {
        state.autoFilling = false;
        if (!applied && cancelled()) void loadV2Prices(); else calculateIslandPlan();
    }
}

async function fetchPlanPrices(ids, cities) {
    const useAverage = state.draft.seedSide === 'average' || state.draft.harvestSide === 'average';
    const useLongTerm = [state.draft.seedSide, state.draft.harvestSide].includes(LONG_TERM_PRICE_MODE);
    const [rows, history, longTerm] = await Promise.all([
        fetchPrices(ids, cities, { source: getSettings().priceSource }).catch(error => { if (useLongTerm) return []; throw error; }),
        useAverage ? fetchHistoryIndex(ids, cities, { days: 28, timeScale: 24 }) : Promise.resolve(null),
        useLongTerm ? fetchLongTermIndex(ids, cities) : Promise.resolve(null)
    ]);
    return { rows, history, longTerm };
}
async function loadV2Prices() {
    if (state.autoFilling) return;
    const requestId = ++state.priceRequestId;
    const entries = v2PriceEntries();
    const ids = v2PriceItemIds(entries);
    if (!ids.length) {
        state.priceLoading = false;
        state.priceError = null;
        state.autoFillPriceDiagnostics = evaluatePlacementCandidates(entries).diagnostics;
        state.optimizationPricesChecked = true;
        calculateIslandPlan();
        return;
    }
    state.priceLoading = true; state.priceError = null;
    render();
    try {
        const cities = v2PriceCities(entries);
        const { rows, history, longTerm } = await fetchPlanPrices(ids, cities);
        if (requestId !== state.priceRequestId) return;
        state.priceIndex = indexPrices(rows);
        state.averagePriceIndex = history;
        state.longTermPriceIndex = longTerm;
        state.draft.pricesUpdatedAt = new Date().toISOString();
        persistDrafts();
        const selectedQuotes = state.draft.slots.filter((entry) => isEconomicItem(itemForSlot(entry))).map((entry) => {
            const item = itemForSlot(entry);
            const production = productionDerived(item, entry);
            return { slot: entry.id, item: item?.key, purchase: priceQuote(purchaseItemId(item), state.draft.islandCity, state.draft.seedSide, 'buy', 'input')?.price ?? null, sale: priceQuote(production.saleItemId, state.draft.sellCity, state.draft.harvestSide, 'sell', 'output')?.price ?? null };
        });
        console.info('[Island Planner V2] prices refreshed', JSON.stringify({ ids, cities, rows: rows.length, selectedQuotes }));
    } catch (error) {
        if (requestId === state.priceRequestId) {
            console.error(error); state.priceError = error.message || 'Fiyatlar alınamadı.';
        }
    } finally {
        if (requestId === state.priceRequestId) {
            state.priceLoading = false;
            state.autoFillPriceDiagnostics = evaluatePlacementCandidates(entries).diagnostics;
            state.optimizationPricesChecked = true;
            calculateIslandPlan();
        }
    }
}
function scheduleEconomicUpdate() {
    clearTimeout(state.calculationTimer);
    persistDrafts();
    state.calculationTimer = setTimeout(() => { void loadV2Prices(); }, 125);
}

function renderSegment(label, values, current, attr, extra = '') { return `<div><p class="city-field-label island-v2-group-label">${label}</p><div class="island-v2-segment">${values.map(([value, text]) => `<button type="button" data-v2-${attr}="${value}" class="${String(value) === String(current) ? 'is-active' : ''}">${text}</button>`).join('')}${extra}</div></div>`; }
function renderPriceSegment(label, side, fixed, attr) {
    const toggle = `<button type="button" data-v2-${attr}-fixed="1" aria-pressed="${Boolean(fixed)}" class="${fixed ? "is-active" : ""}" title="Sabit fiyat varsa öncelikle kullan; yoksa seçili fiyat yöntemini kullan">Sabit</button>`;
    return renderSegment(label, [["buy", "Buy"], ["sell", "Sell"], ["average", "4H"], [LONG_TERM_PRICE_MODE, LONG_TERM_PRICE_LABEL]], side, attr, toggle);
}
function renderCities(label, current, attr, disabled = false) {
    return cityFieldHtml({
        id: `v2-${attr}`, label, selected: current, disabled, className: '', decorate: cityIslandDecorate,
        cities: state.cities.filter((city) => V2_CITIES.includes(cityKey(city.marketApiName)))
    });
}
function renderOptimizationPriceStatus() {
    const issues = uniquePriceDependencies(state.autoFillPriceDiagnostics)
        .sort((a, b) => Number(a.type === 'stale-price') - Number(b.type === 'stale-price'));
    const pending = !state.optimizationPricesChecked || state.priceLoading || state.autoFilling;
    const problem = issues.length > 0 || Boolean(state.priceError);
    const label = pending ? 'Optimizasyon fiyatları kontrol ediliyor' : problem ? 'Optimizasyonu sınırlayan fiyat sorunları' : 'Optimizasyon fiyatları güncel ve tam';
    const icon = problem ? '<path d="M9 3h11v14M4 7v14h16M3 3l18 18M13 8a3 3 0 0 1 3 3M11 16a3 3 0 0 1-3-3"/>' : pending ? '<path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2"/>' : '<path d="m4 12 5 5L20 6"/>';
    return `<button class="btn island-v2-optimization-price-status ${pending ? 'is-pending' : problem ? 'has-issues' : 'is-healthy'}" type="button" data-v2-dependency-popover="optimization-prices" title="${label}" aria-label="${label}"${pending || !problem ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>${problem ? `<div class="island-v2-dependency-popover" data-v2-dependency-list="optimization-prices" popover="auto"><header><span>Otomatik doldur</span><strong>Optimizasyon fiyat sorunları (${issues.length})</strong></header>${state.priceError ? `<p>${escapeHtml(state.priceError)}</p>` : ''}<ul>${priceDependencyList(issues)}</ul></div>` : ''}`;
}
function renderSalesVolume() {
    const value = state.draft.minSalesVolume;
    return `<div class="island-v2-volume"><p class="city-field-label island-v2-group-label">Minimum satış hacmi</p><div class="island-v2-volume-inputs"><input type="range" min="${SALES_VOLUME.min}" max="${SALES_VOLUME.max}" step="${SALES_VOLUME.step}" value="${value}" data-v2-volume-range aria-label="Minimum günlük satış hacmi"><input type="number" min="${SALES_VOLUME.min}" max="${SALES_VOLUME.max}" step="1" value="${value}" data-v2-volume-number aria-label="Minimum günlük satış adedi"></div><small>adet/gün · Son ${SALES_VOLUME.days} gün ortalaması · 0: filtre kapalı</small></div>`;
}
function renderControls() { const d = state.draft; const plots = V2_UNLOCKED_SLOTS_BY_LEVEL?.[d.islandLevel]?.length; return `<aside class="island-v2-controls">${renderSegment('PREMIUM', [['1','Premium'],['0','Free']], d.premium ? '1' : '0', 'premium')}${renderSegment('FOCUS', [['1','Focus'],['0','Yok']], d.focus ? '1' : '0', 'focus')}${renderCities('ADA ŞEHRİ',d.islandCity,'island-city')}${renderCities('SATIŞ ŞEHRİ',d.sellCity,'sell-city')}${renderSegment('ADA SEVİYESİ',[[2,'L2'],[3,'L3'],[4,'L4'],[5,'L5'],[6,'L6']],d.islandLevel,'level')}<p class="island-v2-price-time">${plots == null ? 'Plot slot eşlemesi: TODO' : `${plots} plot`}</p>${renderPriceSegment('Tohum', d.seedSide, d.seedFixed, 'seed')}${renderPriceSegment('Hasat', d.harvestSide, d.harvestFixed, 'harvest')}${renderSalesVolume()}<div class="island-v2-actions"><button class="btn btn-outline-secondary" type="button" data-v2-clear-slots>Slotları Boşalt</button><div class="island-v2-auto-fill-row"><button class="btn btn-primary" type="button" data-v2-auto-fill${state.autoFilling || state.priceLoading ? ' disabled' : ''}>${state.autoFilling ? 'Hesaplanıyor…' : 'Otomatik Doldur'}</button>${renderOptimizationPriceStatus()}</div><button class="btn btn-primary" type="button" data-v2-save>Kaydet</button><button class="btn btn-outline-secondary" type="button" data-v2-revert>Kaydedilmiş Haline Dön</button><button class="btn btn-outline-secondary" type="button" data-v2-prices>Fiyatları Yenile</button><p class="island-v2-price-time">${escapeHtml(priceText())}</p></div></aside>`; }
function renderIsland() { const points = geometryForCity(); const d = state.draft; const overlays = points ? `<div class="island-v2-overlay-layer" data-v2-overlay-layer>${d.slots.map((entry) => { const p = points[entry.id]; if (!p) return ''; const item = itemForSlot(entry); const active = entry.id === state.selectedSlotId; const hover = entry.id === state.hoveredSlotId; const debug = OVERLAY_DEBUG && ['R1','R10','R16'].includes(entry.id) ? ' is-debug' : ''; return `<div class="island-v2-slot-anchor${debug}" data-v2-overlay-anchor="${entry.id}" data-v2-x="${p.x}" data-v2-y="${p.y}"><button type="button" draggable="true" class="island-v2-overlay ${item ? 'is-filled' : 'is-empty'} ${active ? 'is-selected' : ''} ${hover ? 'is-hovered' : ''} ${entry.locked ? 'is-protected' : ''}" data-v2-slot="${entry.id}">${item ? itemIconHtml(itemUniqueName(item), { size: 30, className: 'island-v2-overlay-icon' }) : ''}</button><span class="island-v2-overlay-number">${entry.id.slice(1).padStart(2,'0')}</span>${renderSlotLock(entry)}</div>`; }).join('')}</div>` : `<div class="island-v2-unresolved">${cityKey(d.islandCity) === 'brecilien' ? 'Brecilien slot koordinatları yapılandırılmayı bekliyor.' : 'Caerleon slot koordinatları yapılandırılmayı bekliyor.'}</div>`; return `<section class="island-v2-island"><img class="island-v2-island-image" src="${islandImage(d.islandCity)}" alt="${escapeHtml(cityName(d.islandCity))} adası">${renderIslandCityBonuses()}${overlays}${renderToolbar()}${renderIslandPriceAlert()}<div class="island-v2-drop-actions"><div class="island-v2-clear-drop" data-v2-clear-drop>Boşalt</div><div class="island-v2-lock-drop" data-v2-lock-drop>Kilitle / Kilidi Aç</div></div></section>`; }
function displayValue(value) { return Number.isFinite(value) ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value) : '—'; }

function displayRate(value) { return Number.isFinite(value) ? `${(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}%` : '—'; }
function displayDays(hours) { return Number.isFinite(hours) && hours > 0 ? `${(hours / planDayHours()).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün` : '—'; }
function valueTone(value) { return Number.isFinite(value) ? (value > 0 ? 'is-positive' : (value < 0 ? 'is-negative' : 'is-neutral')) : 'is-neutral'; }
// Compact only the two secondary amounts; keep the exact value in the tooltip.
const cardAmountFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
function cardAmount(value) {
    return Number.isFinite(value) ? cardAmountFormatter.format(value) : '—';
}
function cardWarningIcon(label) {
    return `<svg class="island-v2-card-warning-icon" viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h11v14M4 7v14h16M4 7h2m14 14v-1M3 3l18 18"/><path d="M13 8a3 3 0 0 1 3 3M11 16a3 3 0 0 1-3-3"/><path d="M17 6h.01M7 18h.01"/></g></svg>`;
}
function renderSlotLock(entry) {
    return entry.locked ? '<svg class="island-v2-slot-lock" viewBox="0 0 24 24" role="img" aria-label="Slot kilitli"><title>Slot kilitli; Kilitle / Kilidi Aç alanına sürükleyerek açın</title><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5z" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : '';
}
function renderCards() {
    const unlocked = V2_UNLOCKED_SLOTS_BY_LEVEL?.[state.draft.islandLevel];
    return `<section class="island-v2-slot-grid">${state.draft.slots.map((entry) => {
        const item = itemForSlot(entry);
        const selected = entry.id === state.selectedSlotId;
        const hovered = entry.id === state.hoveredSlotId;
        const locked = Array.isArray(unlocked) && !unlocked.includes(entry.id);
        const number = entry.id.slice(1).padStart(2,'0');
        const stateClasses = `${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}${entry.locked ? ' is-protected' : ''}`;
        if (locked) return `<button type="button" class="island-v2-card is-locked${stateClasses}" data-v2-slot="${entry.id}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span>${renderSlotLock(entry)}</span><span class="island-v2-card-empty"><b class="island-v2-lock" aria-hidden="true"></b><span>Kilitli Slot</span><small>Ada seviyesi yetersiz olduğu için kullanılamaz.</small></span></button>`;
        if (!item) return `<button type="button" class="island-v2-card is-empty${stateClasses}" data-v2-slot="${entry.id}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span>${renderSlotLock(entry)}</span><span class="island-v2-card-empty"><b aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3"/></svg></b><span>Plot Seçin</span><small>Atama için seçin</small></span></button>`;
        const values = state.derived.slots.get(entry.id) ?? {};
        if (!Number.isFinite(values.contribution)) {
            const label = !isEconomicItem(item) ? 'Hesap yok' : values.priceState === 'missing' ? 'Fiyat eksik' : 'Veri eksik';
            const hint = `${itemName(item)} · ${label}${!isEconomicItem(item) ? ': Bu ürün için ekonomi hesabı desteklenmiyor.' : `: ${diagnosticsTitle(values.diagnostics ?? []) || 'Üretim veya fiyat verisi bulunamadı.'}`}`;
            return `<button type="button" draggable="true" class="island-v2-card is-filled is-uncalculated${stateClasses}" data-tier="${item.tier}" data-v2-slot="${entry.id}" title="${escapeHtml(hint)}" aria-label="${escapeHtml(hint)}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span>${renderSlotLock(entry)}<span class="island-v2-card-tier-stack"><span class="badge island-v2-tier" data-tier="${item.tier}">T${item.tier}</span></span></span><span class="island-v2-card-item">${itemIconHtml(itemUniqueName(item), { size: 42, className: 'island-v2-card-icon' })}<span>${escapeHtml(itemName(item))}</span></span><span class="island-v2-card-price-unavailable">${cardWarningIcon(label)}<span>${label}</span></span></button>`;
        }
        const profitPercent = values.profitPercent;
        const netTone = valueTone(values.contribution);
        const cardValue = (value, format = cardAmount) => Number.isFinite(value) ? format(value) : '—';
        const warningClass = values.priceState === 'stale' ? ' is-price-stale' : '';
        const icon = itemIconHtml(itemUniqueName(item), { size: 42, className: 'island-v2-card-icon' });
        const bonus = hasCityBonus(item, state.draft.islandCity) ? '<svg class="island-v2-card-city-bonus" viewBox="0 0 24 24" role="img" aria-label="Şehir Bonusu +10%"><title>Şehir Bonusu +10%</title><path fill="currentColor" d="M21 2C10 2 3 7 4 15c4 3 9 2 12-1 4-4 5-8 5-12Z"/><path d="M3 22 15 9M8 17l-1-5m4 2 5-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' : '';
        const priceDiagnostic = diagnosticsTitle(values.diagnostics ?? []);
        const cardDiagnostic = priceDiagnostic;
        const priceTitle = cardDiagnostic ? ` title="${escapeHtml(cardDiagnostic)}" aria-label="Hesap dependency teşhisi: ${escapeHtml(cardDiagnostic)}"` : '';
        const usesFocus = productionModeUsesFocus(item, entry.productionMode);
        const focusSelected = Boolean(entry.focus && usesFocus);
        const focusTitle = !usesFocus ? 'Bu üretim modu Focus kullanmaz.' : focusSelected && !values.effectiveFocus ? 'Bu slotta Focus seçili; hesap için global Focus master kapalı.' : focusSelected ? 'Focus etkin.' : 'Focus kapalı.';
        const financialContent = `<span class="island-v2-finance"><span class="island-v2-income" title="Gelir: ${displayValue(values.income)}"><b aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="2.5"/></svg></b><span>${cardValue(values.income)}</span></span><em class="${valueTone(profitPercent)}">${cardValue(profitPercent, value => `${Math.round(value)}%`)}</em><span class="island-v2-expense" title="Gider: ${displayValue(values.expense)}"><span>${cardValue(values.expense)}</span><b aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.5"/></svg></b></span></span><strong class="island-v2-net">${cardValue(values.contribution, displayValue)}</strong>`;
        return `<button type="button" draggable="true" class="island-v2-card is-filled ${netTone}${stateClasses}${warningClass}" data-tier="${item.tier}" data-v2-slot="${entry.id}"${priceTitle}><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span>${renderSlotLock(entry)}<i class="island-v2-focus-dot ${focusSelected ? 'is-on' : ''}${focusSelected && !values.effectiveFocus ? ' is-awaiting-master' : ''}" title="${escapeHtml(focusTitle)}" aria-label="${escapeHtml(focusTitle)}"></i><span class="island-v2-card-tier-stack"><span class="badge island-v2-tier" data-tier="${item.tier}">T${item.tier}</span>${bonus}</span></span><span class="island-v2-card-item">${icon}<span>${escapeHtml(itemName(item))}</span></span>${financialContent}</button>`;
    }).join('')}</section>`;
}
function referencePriceValue(quote) {
    const value = displayValue(quote?.price);
    return quote?.longTerm ? `${value}<small class="island-v2-reference-meta" title="${escapeHtml(longTermMetadata(quote))}">${escapeHtml(longTermMetadata(quote, { compact: true }))}</small>` : value;
}
function detailRow(label, value = '—', title = '', tone = '') { const hint = title ? ` title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"` : ''; return `<span${hint}${tone ? ` data-tone="${tone}"` : ''}><small>${label}</small><b>${value}</b></span>`; }
function renderDetail() {
    const entry = displayedSlot();
    const item = itemForSlot(entry);
    const editable = isEditableDetail() && Boolean(item);
    const disabled = editable ? '' : ' disabled';
    const values = state.derived.slots.get(entry.id) ?? {};
    const dependencyHint = (key) => dependencyTitle(values.dependencies?.[key] ?? []);
    const bonus = item && hasCityBonus(item, state.draft.islandCity) ? '<i class="island-v2-city-bonus" title="Şehir Bonusu +10%" aria-label="Şehir Bonusu +10%"></i>' : '';
    const modeOptions = item?.babyId ? animalProductionModes(item) : [];
    const modes = modeOptions.map(({ value, label }) => `<button type="button" data-v2-production-mode="${value}" class="${entry.productionMode === value ? 'is-active' : ''}"${disabled}>${escapeHtml(label)}</button>`).join('');
    const availableMounts = entry.productionMode === 'mount' ? mountRecipes(item) : [];
    const mountOptions = availableMounts.length > 1 ? availableMounts.map(recipe => `<button type="button" data-v2-mount-item="${escapeHtml(recipe.uniqueName)}" class="${mountRecipeFor(item, entry.mountItem)?.uniqueName === recipe.uniqueName ? 'is-active' : ''}"${disabled}>${escapeHtml(recipe.label)}</button>`).join('') : '';
    const modeControl = modes ? `<span class="island-v2-control-label">Üretim Modu</span><span class="island-v2-production-mode">${modes}</span>${mountOptions ? `<span class="island-v2-control-label">Binek</span><span class="island-v2-production-mode">${mountOptions}</span>` : ''}` : '';
    const focusControl = item && productionModeUsesFocus(item, entry.productionMode)
        ? `<span class="island-v2-control-label">Focus</span><button type="button" data-v2-slot-focus class="island-v2-focus-toggle ${entry.focus ? 'is-active' : ''}${entry.focus && !state.draft.focus ? ' is-awaiting-master' : ''}" role="switch" aria-checked="${entry.focus ? 'true' : 'false'}" aria-label="${entry.focus && !state.draft.focus ? 'Focus seçili; global Focus kapalı olduğu için uygulanmıyor.' : 'Focus'}" title="${entry.focus && !state.draft.focus ? 'Focus seçili; global Focus kapalı olduğu için uygulanmıyor.' : ''}"${disabled}><i></i></button>`
        : '';
    const identity = item ? `${itemIconHtml(itemUniqueName(item), { size: 40, className: 'island-v2-detail-icon' })}<div class="island-v2-detail-identity"><h2>${escapeHtml(itemName(item))}</h2><span class="island-v2-detail-tier" data-tier="${item.tier}">T${item.tier}</span>${item.kind === 'faction-mount' ? '' : `<span class="island-v2-detail-category">${escapeHtml(itemCategory(item))}</span>`}${bonus}</div>` : '<div class="island-v2-detail-identity"><h2>Plot seçilmedi</h2><span class="island-v2-detail-category">Toolbar ile atama yapın.</span></div>';
    const priceDiagnostic = values.priceState === 'stale'
        ? dependencyTitle(values.staleDiagnostics ?? [])
        : values.priceState === 'fixed'
            ? fixedComparisonTitle(values)
            : diagnosticsTitle(values.diagnostics ?? []);
    return `<section class="island-v2-detail${editable ? '' : ' is-readonly'}"><strong class="island-v2-detail-number">${entry.id.slice(1).padStart(2,'0')}</strong><div class="island-v2-detail-main">${identity}</div><div class="island-v2-detail-controls">${focusControl}${modeControl}</div><div class="island-v2-kpis">${detailRow('Katkı / Gün', displayValue(values.contribution), dependencyHint('contribution'), valueTone(values.contribution))}${detailRow('Gelir / Gün', displayValue(values.income), dependencyHint('income'), 'is-positive')}${detailRow('Gider / Gün', displayValue(values.expense), dependencyHint('expense'), 'is-negative')}${detailRow('Focus / Gün', displayValue(values.focus), dependencyHint('focus'))}</div><div class="island-v2-detail-list"><p><b>ÜRETİM BİLGİLERİ</b>${detailRow('Günlük Çıktı', displayValue(values.output), dependencyHint('output'))}${detailRow('Büyüme Süresi', displayDays(values.productionHours))}${detailRow('RR / Geri Dönüş', displayRate(values.rr), dependencyHint('rr'))}${detailRow('Net Çıktı', displayValue(values.netOutput), dependencyHint('output'))}${detailRow('Veri Kaynağı', `<span class="island-v2-production-source">${productionSourceLabel(values)}</span>`, productionSourceTitle(values))}</p><p class="island-v2-detail-economy"><b>EKONOMİ / TEDARİK</b>${detailRow('Tohum / Yavru Alış', referencePriceValue(values.purchaseQuote), [dependencyHint('expense'), longTermMetadata(values.purchaseQuote)].filter(Boolean).join(' · '), 'is-negative')}${detailRow('Günlük Net Giriş', displayValue(values.net), dependencyHint('net'), valueTone(values.net))}${entry.productionMode === 'mount' ? detailRow('Binek Malzemesi / Gün', displayValue(values.mountCost), dependencyHint('expense'), 'is-negative') + (values.mountMaterials ?? []).map(line => detailRow(`${displayValue(line.netQty)} × ${line.short} / binek`, displayValue(line.quote?.price), `Birim market alış fiyatı; tarif ${line.qty} adet, craft RR ${displayRate(line.returnRate)}. Ada şehri ve seçili alış yöntemi kullanılır.`, 'is-negative')).join('') : ''}${detailRow('Satış Fiyatı', referencePriceValue(values.saleQuote), [dependencyHint('income'), longTermMetadata(values.saleQuote)].filter(Boolean).join(' · '), 'is-positive')}${detailRow('Birim Maliyet', displayValue(values.unitCost), '1 adet ürünün ortalama üretim maliyeti (gümüş): günlük dış giderler + adadan sağlanan yemin net satış fırsat maliyeti, günlük toplam üretim adedine bölünür. Tohum/yavru geri dönüşleri hesaba dahildir. Satış kesintileri dahil değildir.', 'is-negative')}${values.feedId ? detailRow('Yem Türü', `<span class="island-v2-detail-feed">${itemIconHtml(values.feedId, { size: 24 })}<span>${escapeHtml(getItemLocalizedName(values.feedId, values.feedId))}</span></span>`, 'Hesapta seçilen yem türü.') : ''}${detailRow('İçeriden Karşılanan', displayValue(values.internal), dependencyHint('internal'))}${detailRow('Marketten Alınan', displayValue(values.market), dependencyHint('market'))}${detailRow('Fiyat Durumu', values.priceState === 'current' ? 'Güncel' : values.priceState === 'stale' ? 'Eski' : values.priceState === 'fixed' ? 'Sabit' : values.priceState === 'missing' ? 'Eksik' : '—', priceDiagnostic)}</p></div></section>`;
}
const SUMMARY_ICON_PATHS = {
    net: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 4 16 4 16 0V5M4 10v5c0 4 16 4 16 0v-5M4 15v4c0 4 16 4 16 0v-4"/>',
    focus: '<circle cx="12" cy="12" r="10"/><path d="m12 5 2 4 5 .7-3.5 3.4.8 4.9-4.3-2.3L7.7 18l.8-4.9L5 9.7 5-.7Z"/>',
    internal: '<path d="m3 11 9-8 9 8M6 9v12h12V9M10 21v-7h4v7"/>',
    market: '<path d="M2 3h3l3 12h11l3-9H6M9 18v2m9-2v2"/>',
    surplus: '<path d="m12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5M12 12v10M7 4.8l9 5"/>',
    feed: '<path d="M21 2C10 2 3 7 4 15c4 3 9 2 12-1 4-4 5-8 5-12ZM3 22 15 9"/>'
};
const SUMMARY_DESCRIPTIONS = Object.freeze({
    net: 'Adanın günlük toplam net kârı (gümüş): market satışlarından gelen gelir eksi tohum/yavru yenileme ve dışarıdan alınan yem ile binek malzemesi giderleri. İç transferler toplam kârda birbirini götürür.',
    income: 'Günlük market satış geliri (gümüş). Adada yem olarak kullanılan bitkiler satışa dahil edilmez; pazar kesintileri düşülmüştür.',
    expense: 'Günlük dış giderler (gümüş): geri dönüş oranına göre tohum/yavru yenileme maliyeti ve adadan karşılanamayan yem ile binek malzemesi alışları. İlgili pazar masrafları dahildir.',
    focus: 'Mevcut üretimlerin günlük toplam Focus ihtiyacı. 0, Focus kullanılmadığını; —, tüketim verisinin eksik olduğunu belirtir. Günlük Focus bütçesi sınırı uygulanmaz.',
    internal: 'Hayvanların yem ihtiyacının adada üretilen bitkilerden karşılanan günlük miktarı. Uygun bitki yalnız iç kullanım marketten almaktan daha kârlıysa tüketilir; net satış değeri yem alış maliyetinden yüksekse bitki satılır ve yem marketten alınır. Para değeri değildir; farklı yem türlerinin adetleri birlikte toplanır.',
    market: 'İç üretimden karşılanamayıp marketten alınması gereken günlük yem miktarı. Para değeri değildir; farklı yem türlerinin adetleri birlikte toplanır. —, miktarın hesaplanamadığını belirtir.',
    surplus: 'İç yem kullanımı sonrası satışa kalan günlük çıktı adedi. Bitki ve hayvan üretimlerinin farklı ürün adetleri birlikte toplanır; para değeri değildir.',
    feed: 'Günlük kullanılan toplam yem adedi: adadan karşılanan ve marketten alınan yemlerin toplamı. Farklı yem türlerinin adetleri birlikte toplanır; para değeri değildir. —, yem miktarı verisinin eksik olduğunu belirtir.'
});
function metric(label, value = '—', dependencies = [], key = '') {
    const title = [SUMMARY_DESCRIPTIONS[key], dependencyTitle(dependencies)].filter(Boolean).join('\n\n');
    const path = SUMMARY_ICON_PATHS[key];
    const icon = path ? `<svg class="island-v2-summary-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>` : '';
    const content = `${icon}<span>${label}</span><strong>${value}</strong>`;
    const attrs = `data-v2-metric="${key}"${key === 'net' ? ` data-tone="${valueTone(state.derived.summary?.net)}"` : ''}`;
    if (['internal', 'market', 'surplus', 'feed'].includes(key)) {
        return `<div class="island-v2-metric island-v2-metric-breakdown" ${attrs}><button type="button" class="island-v2-metric-trigger" aria-label="${escapeHtml(label)} ürün dökümü">${content}</button><div class="island-v2-summary-breakdown" role="tooltip"><strong>${label} · Günlük ürün dökümü</strong>${renderSummaryBreakdown(key)}</div></div>`;
    }
    if (!dependencies.length) return `<div class="island-v2-metric" ${attrs} title="${escapeHtml(title)}">${content}</div>`;
    return `<div class="island-v2-metric island-v2-metric-has-dependencies" ${attrs} title="${escapeHtml(title)}"><button type="button" class="island-v2-metric-trigger" data-v2-dependency-popover="${escapeHtml(key)}" aria-label="${escapeHtml(label)} için eksik dependency listesini göster">${content}</button><div class="island-v2-dependency-popover" data-v2-dependency-list="${escapeHtml(key)}" popover="auto"><strong>${escapeHtml(label)} · Eksik dependency</strong><ul>${dependencyList(dependencies)}</ul></div></div>`;
}
function renderSummaryBreakdown(key) {
    const rows = new Map();
    const add = (itemId, quantity, category) => {
        if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return;
        const rowKey = `${category}|${itemId}`;
        const row = rows.get(rowKey) ?? { itemId, quantity: 0, category };
        row.quantity += quantity;
        rows.set(rowKey, row);
    };
    for (const values of state.derived.slots.values()) {
        if (key === 'internal' || key === 'feed') {
            for (const line of values.internalFeed ?? []) add(line.itemId, line.quantity, 'Adadan yem');
        }
        if (key === 'market' || key === 'feed') add(values.feedId, values.market, 'Alınacak yem');
        if (key === 'surplus') add(values.saleItemId, values.netOutput, 'Satılacak');
        if (key === 'market') {
            add(values.purchaseItemId, values.purchaseQuantity, 'Tohum / yavru');
            for (const line of values.mountMaterials ?? []) add(line.uniqueName, line.netQty * values.output, 'Binek malzemesi');
        }
    }
    if (!rows.size) return '<p>Bu grupta hesaplanmış ürün miktarı yok.</p>';
    return `<ul>${[...rows.values()].map(row => `<li>${itemIconHtml(row.itemId, { size: 28 })}<span><span>${escapeHtml(getItemLocalizedName(row.itemId, row.itemId))}</span><small>${row.category}</small></span><b>${row.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} <small>adet/gün</small></b></li>`).join('')}</ul>${key === 'market' ? '<p>Özet çubuğundaki toplam yalnız marketten alınan yem adedidir.</p>' : ''}`;
}
function uniqueDependencies(values) {
    const groups = new Map();
    for (const value of values ?? []) {
        const key = JSON.stringify([value.type, value.blocked, value.itemId || value.item, value.city, value.side, value.reason]);
        if (!groups.has(key)) groups.set(key, { ...value, slotIds: [] });
        const group = groups.get(key);
        for (const id of value.slotIds ?? [value.slotId]) {
            if (id && !group.slotIds.includes(id)) group.slotIds.push(id);
        }
    }
    return [...groups.values()];
}
function islandDerivedWarnings() {
    const groups = new Map();
    for (const values of state.derived.slots.values()) {
        for (const dependencies of Object.values(values.dependencies ?? {})) {
            for (const value of dependencies ?? []) {
                if (['missing-price', 'missing-fixed-price', 'stale-price'].includes(value.type)) continue;
                const list = groups.get(value.type) ?? [];
                list.push(value); groups.set(value.type, list);
            }
        }
    }
    return [...groups.entries()].map(([type, values]) => ({ type, values: uniqueDependencies(values) }));
}
function islandAlertLabel(type) {
    return ({
        'missing-feed-rule': 'Yem kuralı',
        'missing-output-data': 'Çıktı verisi',
        'missing-rr-output-data': 'RR verisi',
        'missing-focus-cost': 'Focus maliyeti',
        'missing-production-mode-data': 'Üretim modu verisi',
        'missing-ledger-row': 'Hesap satırı'
    })[type] ?? dependencyTypeLabel(type);
}
function islandAlertTitle(heading, values) {
    const slots = [...new Set((values ?? []).map((entry) => entry.slotId).filter(Boolean))];
    const blocked = [...new Set((values ?? []).map((entry) => entry.blocked).filter(Boolean))];
    const slotText = slots.length > 3 ? `${slots.slice(0, 3).join(', ')} ve ${slots.length - 3} diğer slot` : slots.join(', ');
    const blockedText = blocked.length > 2 ? `${blocked.slice(0, 2).join(', ')} ve diğer hesaplar` : blocked.join(', ');
    return [heading, slotText && `Etkilenen: ${slotText}`, blockedText && `Engellenen: ${blockedText}`].filter(Boolean).join(' · ');
}
function islandAlertItem({ type, label, value, key, heading, values, list }) {
    return `<div class="island-v2-island-alert-item" data-v2-alert-type="${escapeHtml(type)}"><button type="button" class="island-v2-alert-trigger" data-v2-dependency-popover="${key}" title="${escapeHtml(islandAlertTitle(heading, values))}" aria-label="${escapeHtml(`${label} ${value}`)} listesini göster"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></button><div class="island-v2-dependency-popover island-v2-alert-popover" data-v2-dependency-list="${key}" popover="auto"><header><span>Hesap uyarısı</span><strong>${escapeHtml(heading)}</strong></header><ul>${list(values)}</ul></div></div>`;
}
function dependencyAlert({ type, values }) {
    return islandAlertItem({ type, label: islandAlertLabel(type), value: `${values.length} eksik`, key: `island-warning-${type}`, heading: dependencyTypeLabel(type), values, list: dependencyList });
}
function renderIslandPriceAlert() {
    const summary = state.derived.summary ?? {};
    const missingPrices = (summary.diagnostics ?? []).map((value) => ({ ...value, type: value.type ?? 'missing-price' }));
    const stalePrices = summary.staleDiagnostics ?? [];
    const warnings = islandDerivedWarnings();
    if (!missingPrices.length && !stalePrices.length && !warnings.length) return '';
    const price = [
        missingPrices.length ? islandAlertItem({ type: 'price', label: 'Fiyat', value: `${uniquePriceDiagnosticCount(missingPrices)} eksik`, key: 'price-missing', heading: 'Eksik fiyatlar', values: missingPrices, list: priceDependencyList }) : '',
        stalePrices.length ? islandAlertItem({ type: 'stale-price', label: 'Fiyat', value: `${uniquePriceDiagnosticCount(stalePrices)} güncel değil`, key: 'price-stale', heading: 'Güncel olmayan fiyatlar', values: stalePrices, list: priceDependencyList }) : ''
    ].join('');
    return `<aside class="island-v2-price-alert island-v2-alert-stack" aria-label="Hesap uyarıları">${price}${warnings.map(dependencyAlert).join('')}</aside>`;
}
function renderSummary() {
    const summary = state.derived.summary ?? {};
    const dependencies = summary.dependencies ?? {};
    return `<section class="island-v2-summary"><div class="island-v2-summary-title" title="Mevcut ada yerleşiminin günlük ekonomi özeti. Değerler seçili şehir, Premium, Focus ve alış/satış ayarlarına göre hesaplanır; otomatik doldurma adayları bu toplama dahil değildir."><strong>05</strong><span class="island-v2-summary-name">Ada Özeti</span><span>${escapeHtml(cityName(state.draft.islandCity))} · Seviye ${state.draft.islandLevel}</span></div>${metric('Net Kâr / Gün', displayValue(summary.net), dependencies.net ?? [], 'net')}${metric('Gelir', displayValue(summary.income), dependencies.income ?? [], 'income')}${metric('Gider', displayValue(summary.expense), dependencies.expense ?? [], 'expense')}${metric('Focus / Gün', displayValue(summary.focus), dependencies.focus ?? [], 'focus')}${metric('İçeriden', displayValue(summary.internal), [], 'internal')}${metric('Marketten', displayValue(summary.market), [], 'market')}${metric('Satışa Kalan', displayValue(summary.surplus), [], 'surplus')}${metric('Yem', displayValue(summary.feed), [], 'feed')}</section>`;
}
function syncLayoutGeometry(root) {
    const layout = root.querySelector('.island-v2-layout');
    const summary = root.querySelector('.island-v2-summary');
    if (!layout || !summary || window.matchMedia('(max-width: 1199px)').matches) return;
    const styles = getComputedStyle(layout);
    const gap = Number.parseFloat(styles.columnGap) || 0;
    const left = Number.parseFloat(styles.gridTemplateColumns) || 0;
    const minimumRight = 24 * 16;
    const upperHeight = layout.clientHeight - summary.getBoundingClientRect().height - (Number.parseFloat(styles.rowGap) || 0);
    const availableWidth = layout.clientWidth - left - minimumRight - (gap * 2);
    const size = Math.max(0, Math.floor(Math.min(upperHeight, availableWidth)));
    layout.style.setProperty('--island-v2-size', `${size}px`);
}
function renderedImageContentRect(image) {
    const box = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || box.width;
    const naturalHeight = image.naturalHeight || box.height;
    const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}
function syncOverlayGeometry(root) {
    const island = root.querySelector('.island-v2-island');
    const image = root.querySelector('.island-v2-island-image');
    const layer = root.querySelector('[data-v2-overlay-layer]');
    if (!island || !image || !layer || !state.geometry || !image.complete) return;
    const islandRect = island.getBoundingClientRect();
    const imageRect = renderedImageContentRect(image);
    const islandStyle = getComputedStyle(island);
    const originLeft = islandRect.left + (Number.parseFloat(islandStyle.borderLeftWidth) || 0);
    const originTop = islandRect.top + (Number.parseFloat(islandStyle.borderTopWidth) || 0);
    layer.style.left = `${imageRect.left - originLeft}px`;
    layer.style.top = `${imageRect.top - originTop}px`;
    layer.style.width = `${imageRect.width}px`;
    layer.style.height = `${imageRect.height}px`;

    const ratios = state.geometry.overlayRatios;
    if (!ratios) return;
    const slotWidth = imageRect.width * ratios.slotWidthRatio;
    const slotHeight = imageRect.height * ratios.slotHeightRatio;
    layer.style.setProperty('--island-v2-diamond-width', `${slotWidth}px`);
    layer.style.setProperty('--island-v2-diamond-height', `${slotHeight}px`);
    layer.style.setProperty('--island-v2-diamond-aspect', String(slotHeight / slotWidth));
    layer.style.setProperty('--island-v2-inner-width', `${slotWidth * ratios.innerWidthRatio}px`);
    layer.style.setProperty('--island-v2-inner-height', `${slotHeight * ratios.innerHeightRatio}px`);
    layer.style.setProperty('--island-v2-icon-width', `${slotWidth * ratios.iconWidthRatio}px`);
    layer.style.setProperty('--island-v2-icon-height', `${slotHeight * ratios.iconHeightRatio}px`);
    layer.style.setProperty('--island-v2-badge-width', `${slotWidth * ratios.badgeWidthRatio}px`);
    layer.style.setProperty('--island-v2-badge-height', `${slotHeight * ratios.badgeHeightRatio}px`);
    layer.style.setProperty('--island-v2-badge-font', `${slotHeight * ratios.badgeFontHeightRatio}px`);
    layer.style.setProperty('--island-v2-plus-size', `${slotHeight * ratios.plusHeightRatio}px`);
    layer.style.setProperty('--island-v2-selected-outline', `${slotWidth * ratios.selectedOutlineWidthRatio}px`);

    const debugRows = [];
    layer.querySelectorAll('[data-v2-overlay-anchor]').forEach((anchor) => {
        const x = Number(anchor.dataset.v2X);
        const y = Number(anchor.dataset.v2Y);
        const left = x * imageRect.width;
        const top = y * imageRect.height;
        anchor.style.left = `${left}px`;
        anchor.style.top = `${top}px`;
        if (OVERLAY_DEBUG && ['R1','R10','R16'].includes(anchor.dataset.v2OverlayAnchor)) {
            debugRows.push({ slot: anchor.dataset.v2OverlayAnchor, x: Math.round(left * 100) / 100, y: Math.round(top * 100) / 100, viewportX: Math.round((imageRect.left + left) * 100) / 100, viewportY: Math.round((imageRect.top + top) * 100) / 100 });
        }
    });
    if (OVERLAY_DEBUG) {
        const signature = `${imageRect.left}|${imageRect.top}|${imageRect.width}|${imageRect.height}`;
        if (signature !== state.overlayDebugSignature) {
            state.overlayDebugSignature = signature;
            console.info('[Island Planner V2] rendered island rect', imageRect);
            console.table(debugRows);
        }
    }
}
function renderDragUi() { return `<div class="island-v2-drag-preview" data-v2-drag-preview aria-hidden="true"><span class="island-v2-drag-preview-content" data-v2-drag-preview-content></span><span class="island-v2-drag-preview-number" data-v2-drag-preview-number></span></div><dialog class="app-dialog island-v2-confirm" data-v2-confirm><button type="button" class="app-dialog-close" aria-label="Kapat" data-v2-confirm-cancel></button><div class="island-v2-confirm-sheet"><p data-v2-confirm-message></p><div><button type="button" class="btn btn-outline-secondary" data-v2-confirm-cancel>İptal</button><button type="button" class="btn btn-primary" data-v2-confirm-accept>Onayla</button></div></div></dialog>`; }
function openDependencyPopover(root, key) {
    const list = root.querySelector(`[data-v2-dependency-list="${key}"]`);
    if (!list) { state.openDependencyPopover = null; return; }
    if (key === 'optimization-prices' || key === 'price-missing' || key === 'price-stale' || key.startsWith('island-warning-')) {
        const island = root.querySelector('.island-v2-island');
        const rect = island?.getBoundingClientRect();
        if (rect) {
            list.style.top = `${Math.round(rect.top + 10)}px`;
            list.style.right = `${Math.round(window.innerWidth - rect.right + 10)}px`;
        }
    }
    list.showPopover?.();
}
function render() { const root = document.querySelector('[data-island-planner-v2]'); if (!root) return; root.innerHTML = `<div class="island-v2-page"><section class="page-head" data-page-head="island-planner-v2"><h1>Ada Planlayıcı V2</h1><p>Adandaki plotları düzenle; üretim, fiyat ve günlük net kârı tek planda takip et.</p></section><div class="island-v2-layout page-body">${renderControls()}${renderIsland()}<div class="island-v2-right">${renderCards()}${renderDetail()}</div>${renderSummary()}</div>${renderDragUi()}</div>`; syncLayoutGeometry(root); const image = root.querySelector('.island-v2-island-image'); if (image?.complete) syncOverlayGeometry(root); else image?.addEventListener('load', () => syncOverlayGeometry(root), { once: true }); bind(root); if (state.openDependencyPopover) openDependencyPopover(root, state.openDependencyPopover); }
function mutate(mutator, economic = true) { if (economic) { state.autoFillPriceDiagnostics = []; state.optimizationPricesChecked = false; } mutator(); if (economic) scheduleEconomicUpdate(); else render(); }
function isSlotLocked(slotId) { if (slot(slotId)?.locked) return true; const unlocked = V2_UNLOCKED_SLOTS_BY_LEVEL?.[state.draft.islandLevel]; return Array.isArray(unlocked) && !unlocked.includes(slotId); }
const DRAG_PREVIEW_SIZE_VARS = ['--island-v2-diamond-aspect','--island-v2-diamond-width','--island-v2-diamond-height','--island-v2-inner-width','--island-v2-inner-height','--island-v2-icon-width','--island-v2-icon-height','--island-v2-badge-width','--island-v2-badge-height','--island-v2-badge-font','--island-v2-plus-size','--island-v2-selected-outline'];
function prepareDragPreview(root) {
    const preview = root.querySelector('[data-v2-drag-preview]'); const entry = slot(state.drag?.sourceSlotId); if (!preview || !entry) return;
    const item = itemForSlot(entry); const layer = root.querySelector('[data-v2-overlay-layer]'); const layerStyle = layer && getComputedStyle(layer);
    DRAG_PREVIEW_SIZE_VARS.forEach((name) => { const value = layerStyle?.getPropertyValue(name); if (value) preview.style.setProperty(name, value); });
    preview.querySelector('[data-v2-drag-preview-content]').innerHTML = item ? itemIconHtml(itemUniqueName(item), { size: 30, className: 'island-v2-drag-preview-icon' }) : '';
    preview.querySelector('[data-v2-drag-preview-number]').textContent = entry.id.slice(1).padStart(2, '0');
    preview.className = `island-v2-drag-preview is-visible is-${state.drag.mode} ${item ? 'is-filled' : 'is-empty'}`;
}
function paintDragPreview(root) {
    state.dragPreviewFrame = null; const point = state.dragPreviewPoint; const drag = state.drag; const preview = root.querySelector('[data-v2-drag-preview]');
    if (!point || !drag || !preview) return;
    const element = document.elementFromPoint(point.x, point.y); let x = point.x; let y = point.y; let validity = 'is-invalid'; let previewSlotId = drag.sourceSlotId;
    if (drag.mode === 'copy') {
        const target = element?.closest('[data-v2-slot]'); const clear = element?.closest('[data-v2-clear-drop]'); const lock = element?.closest('[data-v2-lock-drop]');
        if (target && target.dataset.v2Slot !== drag.sourceSlotId && !isSlotLocked(target.dataset.v2Slot)) {
            const rect = target.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; previewSlotId = target.dataset.v2Slot; validity = itemForSlot(slot(target.dataset.v2Slot)) ? 'is-overwrite' : 'is-valid';
        } else if (lock) {
            const rect = lock.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; validity = 'is-lock';
        } else if (clear && !slot(drag.sourceSlotId)?.locked) {
            const rect = clear.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; validity = 'is-clear';
        }
    } else if (element?.closest('.island-v2-island')) validity = 'is-valid';
    preview.classList.remove('is-valid', 'is-invalid', 'is-overwrite', 'is-clear', 'is-lock'); preview.classList.add(validity);
    preview.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
}
function queueDragPreview(root, clientX, clientY) {
    state.dragPreviewPoint = { x: clientX, y: clientY };
    if (state.dragPreviewFrame == null) state.dragPreviewFrame = requestAnimationFrame(() => paintDragPreview(root));
}
function hideDragPreview(root) {
    if (state.dragPreviewFrame != null) cancelAnimationFrame(state.dragPreviewFrame);
    state.dragPreviewFrame = null; state.dragPreviewPoint = null;
    root.querySelector('[data-v2-drag-preview]')?.classList.remove('is-visible', 'is-valid', 'is-invalid', 'is-overwrite', 'is-clear', 'is-copy', 'is-geometry', 'is-filled', 'is-empty');
}
function cleanupDrag(root) {
    hideDragPreview(root);
    const pointer = state.pointerDrag;
    if (pointer?.source?.hasPointerCapture?.(pointer.pointerId)) pointer.source.releasePointerCapture(pointer.pointerId);
    state.drag = null; state.pointerDrag = null; state.hoveredSlotId = null;
    root.classList.remove('is-v2-copy-drag', 'is-v2-geometry-drag');
}
function confirmAction(root, message, confirmLabel) {
    const dialog = root.querySelector('[data-v2-confirm]');
    if (!dialog?.showModal) return Promise.resolve(window.confirm(message));
    dialog.querySelector('[data-v2-confirm-message]').textContent = message;
    dialog.querySelector('[data-v2-confirm-accept]').textContent = confirmLabel;
    return new Promise((resolve) => {
        const close = (result) => { dialog.close(); resolve(result); };
        dialog.querySelector('[data-v2-confirm-accept]').onclick = () => close(true);
        dialog.querySelectorAll('[data-v2-confirm-cancel]').forEach((button) => { button.onclick = () => close(false); });
        dialog.oncancel = (event) => { event.preventDefault(); close(false); };
        dialog.showModal();
    });
}
async function completeDrag(root, target, clientX, clientY) {
    const drag = state.drag; if (!drag) return;
    const dropTarget = document.elementFromPoint(clientX, clientY) || target;
    if (drag.mode === 'geometry' && dropTarget.closest('.island-v2-island')) {
        const image = root.querySelector('.island-v2-island-image'); const rect = image && renderedImageContentRect(image);
        if (rect?.width && rect?.height) { persistGeometry(drag.sourceSlotId, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height); cleanupDrag(root); render(); return; }
    }
    if (drag.mode === 'copy' && dropTarget.closest('[data-v2-lock-drop]')) {
        cleanupDrag(root); mutate(() => { const entry = slot(drag.sourceSlotId); entry.locked = !entry.locked; }); return;
    }
    if (drag.mode === 'copy' && dropTarget.closest('[data-v2-clear-drop]') && !slot(drag.sourceSlotId)?.locked) {
        cleanupDrag(root); mutate(() => { state.draft.slots = state.draft.slots.map((entry) => entry.id === drag.sourceSlotId ? blankSlot(entry.id) : entry); }); return;
    }
    const slotTarget = dropTarget.closest('[data-v2-slot]');
    if (drag.mode === 'copy' && itemForSlot(slot(drag.sourceSlotId)) && slotTarget && slotTarget.dataset.v2Slot !== drag.sourceSlotId && !isSlotLocked(slotTarget.dataset.v2Slot)) {
        const targetId = slotTarget.dataset.v2Slot; const destination = slot(targetId);
        if (itemForSlot(destination) && !await confirmAction(root, 'Bu slot dolu. Mevcut ayarlar üzerine yazılsın mı?', 'Üzerine Yaz')) { cleanupDrag(root); return; }
        cleanupDrag(root); mutate(() => { const copied = clone(slot(drag.sourceSlotId)); state.draft.slots = state.draft.slots.map((entry) => entry.id === targetId ? { ...copied, id: targetId, locked: false } : entry); }); return;
    }
    cleanupDrag(root);
}
function bind(root) {
    root.addEventListener('input', event => {
        if (!event.target.matches('[data-v2-volume-range], [data-v2-volume-number]')) return;
        const value = normalizeSalesVolume(event.target.value);
        state.draft.minSalesVolume = value;
        state.autoFillResult = null;
        persistDrafts();
        root.querySelectorAll('[data-v2-volume-range], [data-v2-volume-number]').forEach(input => { if (input !== event.target) input.value = value; });
    });
    bindCityField(root, 'v2-island-city', (value) => {
        switchIslandCity(value);
        scheduleEconomicUpdate();
    });
    bindCityField(root, 'v2-sell-city', (value) => mutate(() => { state.draft.sellCity = value; }));
    if (root.dataset.v2Bound === '1') return;
    root.dataset.v2Bound = '1';
    root.addEventListener('click', (event) => {
        if (state.suppressClick) { state.suppressClick = false; event.preventDefault(); return; }
        const button = event.target.closest('button'); if (!button) return; const d = button.dataset;
        if (d.v2DependencyPopover) {
            const list = root.querySelector(`[data-v2-dependency-list="${d.v2DependencyPopover}"]`);
            if (list?.matches(':popover-open')) { list.hidePopover(); state.openDependencyPopover = null; }
            else { state.openDependencyPopover = d.v2DependencyPopover; openDependencyPopover(root, d.v2DependencyPopover); }
            return;
        }
        if (d.v2Slot) { mutate(() => { state.selectedSlotId = d.v2Slot; }, false); return; }
        if (d.v2Premium) mutate(() => { state.draft.premium = d.v2Premium === '1'; });
        if (d.v2Focus) mutate(() => { state.draft.focus = d.v2Focus === '1'; });
        if (d.v2Level) mutate(() => { state.draft.islandLevel = Number(d.v2Level); });
        if (d.v2Seed) mutate(() => { state.draft.seedSide = d.v2Seed; });
        if (d.v2Harvest) mutate(() => { state.draft.harvestSide = d.v2Harvest; });
        if (d.v2SeedFixed) mutate(() => { state.draft.seedFixed = !state.draft.seedFixed; });
        if (d.v2HarvestFixed) mutate(() => { state.draft.harvestFixed = !state.draft.harvestFixed; });
        if ('v2ToolbarBack' in d) mutate(() => { state.toolbar = { stage: 'type', type: null }; }, false);
        if (d.v2ToolbarType) mutate(() => { state.toolbar = { stage: 'item', type: d.v2ToolbarType }; }, false);
        if (d.v2ToolbarItem) { const item = itemRows().find((entry) => entry.key === d.v2ToolbarItem); if (item) mutate(() => { const target = slot(state.selectedSlotId); if (isSlotLocked(target.id)) return; target.item = item.key; target.type = item.plotType; target.tier = item.tier; target.productionMode = productionModeFor(item, target.productionMode); }); return; }
        if ('v2SlotFocus' in d && isEditableDetail()) mutate(() => { const entry = slot(state.selectedSlotId); entry.focus = !entry.focus; });
        if (d.v2MountItem && isEditableDetail()) mutate(() => { slot(state.selectedSlotId).mountItem = d.v2MountItem; });
        if (d.v2ProductionMode && isEditableDetail()) mutate(() => { const target = slot(state.selectedSlotId); target.productionMode = productionModeFor(itemForSlot(target), d.v2ProductionMode); });
        if ('v2ClearSlots' in d) {
            mutate(() => {
                state.draft.slots = state.draft.slots.map(entry => entry.locked ? entry : blankSlot(entry.id));
                state.autoFillResult = null;
            });
            return;
        }
        if ('v2AutoFill' in d) { void autoFillIsland(); return; }
        if ('v2Save' in d) { persistDrafts(); state.committed = clone(state.draft); persistCommitted(); render(); }
        if ('v2Revert' in d && state.committed) { state.draft = normalizeDraft(state.committed, state.draft.islandCity); persistDrafts(); scheduleEconomicUpdate(); }
        if ('v2Prices' in d) { void loadV2Prices(); return; }
    });
    root.addEventListener('dragstart', (event) => event.preventDefault());
    root.addEventListener('pointerdown', (event) => {
        const source = event.target.closest('[data-v2-slot]'); if (!source || event.button !== 0) return;
        source.setPointerCapture?.(event.pointerId);
        state.pointerDrag = { source, pointerId: event.pointerId, sourceSlotId: source.dataset.v2Slot, sourceIsOverlay: source.classList.contains('island-v2-overlay'), shiftKey: event.shiftKey, startX: event.clientX, startY: event.clientY, active: false };
    });
    root.addEventListener('pointermove', (event) => {
        const pointer = state.pointerDrag;
        if (!pointer) {
            if (state.drag) return;
            const hit = event.target.closest('[data-v2-slot]');
            const nextHoveredSlotId = hit?.dataset.v2Slot ?? null;
            if (nextHoveredSlotId !== state.hoveredSlotId) {
                state.hoveredSlotId = nextHoveredSlotId;
                render();
            }
            return;
        }
        if (!pointer.active) {
            if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6) return;
            const mode = pointer.shiftKey && pointer.sourceIsOverlay ? 'geometry' : ((itemForSlot(slot(pointer.sourceSlotId)) || slot(pointer.sourceSlotId)?.locked) ? 'copy' : null);
            if (!mode) { state.pointerDrag = null; return; }
            pointer.active = true; state.drag = { mode, sourceSlotId: pointer.sourceSlotId };
            root.classList.add(mode === 'copy' ? 'is-v2-copy-drag' : 'is-v2-geometry-drag'); prepareDragPreview(root);
        }
        queueDragPreview(root, event.clientX, event.clientY); event.preventDefault();
    });
    root.addEventListener('pointerleave', () => {
        if (!state.drag && !state.pointerDrag && state.hoveredSlotId) {
            state.hoveredSlotId = null;
            render();
        }
    });
    root.addEventListener('pointerup', async (event) => {
        const pointer = state.pointerDrag; state.pointerDrag = null; if (!pointer?.active) return;
        state.suppressClick = true; event.preventDefault(); hideDragPreview(root); await completeDrag(root, event.target, event.clientX, event.clientY);
    });
    root.addEventListener('pointercancel', () => { state.pointerDrag = null; cleanupDrag(root); });
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && (state.drag || state.pointerDrag)) { event.preventDefault(); state.suppressClick = true; cleanupDrag(root); } });
}
async function init() {
    initNav(); await initStore(); state.cities = await loadActiveCities();
    const storedDrafts = readPlanTable(V2_DRAFT_TABLE, V2_STORAGE_KEY, true);
    const storedCommitted = readPlanTable(V2_COMMITTED_TABLE, V2_COMMITTED_STORAGE_KEY);
    const initialCity = storedDrafts.activeCity || getDefaultCity();
    state.draftsByCity = storedDrafts.plans; state.committedByCity = storedCommitted.plans;
    state.draft = normalizeDraft(state.draftsByCity[cityKey(initialCity)], initialCity);
    state.committed = normalizeDraft(state.committedByCity[cityKey(initialCity)], initialCity);
    state.geometryRows = getAll(V2_GEOMETRY_TABLE);
    state.fixedPrices = getAll(FIXED_PRICE_TABLE);
    persistDrafts(); persistCommitted();
    try { const response = await fetch(V2_GEOMETRY_URL); state.geometry = response.ok ? await response.json() : null; } catch { state.geometry = null; }
    if (v2PriceItemIds().length) await loadV2Prices(); else calculateIslandPlan();
    const root = document.querySelector('[data-island-planner-v2]');
    if (root && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { syncLayoutGeometry(root); syncOverlayGeometry(root); }).observe(root);
    bindLivePrices(() => {
        const entries = v2PriceEntries();
        return { items: v2PriceItemIds(entries), cities: v2PriceCities(entries) };
    }, () => { void loadV2Prices(); });
}
init();
