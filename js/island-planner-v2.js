import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { getAll, initStore, replaceAllRows } from './db/store.js';
import { getSettings, getDefaultCity } from './settings.js';
import { loadActiveCities } from './cities.js';
import { getPlants, getAnimals, getBuildings } from './catalog.js';
import { getItemLocalizedName, getItemUniqueName } from './db/relations.js';
import { itemIconHtml } from './item-icon.js';
import { cityRow, fetchPrices, indexPrices } from './market.js';
import { quoteFromRow } from './price-side.js';
import { purchaseCost, saleProceeds } from './market-fees.js';
import { butcherQty, cropHours, planCycleHours, planDayHours, plantSlots } from './island-economy.js';
import { effectiveAnimalProductYield, effectiveAnimalReturn, effectivePlantYield, effectiveSeedReturn, yieldAverage } from './island-yield-stats.js';
import { bindLivePrices } from './price-live.js';
import { V2_CITIES, V2_COMMITTED_STORAGE_KEY, V2_COMMITTED_TABLE, V2_DRAFT_TABLE, V2_FIXED_PRICE_TABLE, V2_GEOMETRY_TABLE, V2_GEOMETRY_URL, V2_ROYAL_CITIES, V2_SPECIAL_CITY_GEOMETRY, V2_STORAGE_KEY, V2_UNLOCKED_SLOTS_BY_LEVEL } from './island-planner-v2-config.js';

const OVERLAY_DEBUG = new URLSearchParams(location.search).has('islandOverlayDebug');
const TOOLBAR_TYPE_ICONS = Object.freeze({
    farm: './icons/T3_WHEAT.png',
    herb: './icons/T4_BURDOCK.png',
    pasture: './icons/T3_FARM_CHICKEN_GROWN.png',
    kennel: './icons/T5_FARM_COUGAR_GROWN.png',
    house: './icons/PLAYERISLAND_FURNITUREITEM_WOOD_GATE_BIG_B.png'
});
const state = { cities: [], geometry: null, geometryRows: [], fixedPrices: [], selectedSlotId: 'R1', hoveredSlotId: null, toolbar: { stage: 'type', type: null }, draftsByCity: {}, committedByCity: {}, draft: null, committed: null, priceIndex: null, priceLoading: false, priceError: null, priceRequestId: 0, priceDiagnosticSignature: null, derivedDiagnosticSignature: null, openDependencyPopover: null, drag: null, pointerDrag: null, dragPreviewFrame: null, dragPreviewPoint: null, suppressClick: false, derived: { slots: new Map(), summary: null }, calculationTimer: null, overlayDebugSignature: null };

function blankSlot(id) { return { id, item: null, type: null, tier: null, focus: false, productionMode: null }; }
function defaultDraft(islandCity = getDefaultCity()) { const settings = getSettings(); return { premium: settings.premium !== false, focus: false, islandCity, sellCity: getDefaultCity(), islandLevel: 6, seedSide: settings.buyPriceSide, harvestSide: settings.sellPriceSide, slots: Array.from({ length: 16 }, (_, i) => blankSlot(`R${i + 1}`)), pricesUpdatedAt: null }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function read(key) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function clamp01(value) { return Math.min(1, Math.max(0, Number(value) || 0)); }
function slot(id) { return state.draft.slots.find((entry) => entry.id === id) ?? null; }
function cityKey(value) { return String(value || '').toLowerCase().replace(/[\s-]+/g, '_'); }
function cityName(value) { return state.cities.find((city) => city.marketApiName === value)?.displayName ?? value; }
function cityImage(value) { return `assets/island-planner-v2/city-buttons/${cityKey(value)}.png`; }
function islandImage(value) { return `assets/island-planner-v2/islands/${cityKey(value)}.png`; }
function geometryGroupForCity(value = state.draft.islandCity) { const key = cityKey(value); return V2_ROYAL_CITIES.has(key) ? 'royal' : key; }
function geometryForCity() {
    const group = geometryGroupForCity();
    const runtime = group === 'royal' ? state.geometry?.slots : V2_SPECIAL_CITY_GEOMETRY[group];
    const points = runtime ? clone(runtime) : {};
    state.geometryRows.filter((row) => row.geometryGroup === group && /^R(?:[1-9]|1[0-6])$/.test(row.slot)).forEach((row) => {
        const x = Number(row.x); const y = Number(row.y);
        if (Number.isFinite(x) && Number.isFinite(y)) points[row.slot] = { x: clamp01(x), y: clamp01(y) };
    });
    return Object.keys(points).length ? points : null;
}
function displayedSlot() { return state.hoveredSlotId ? slot(state.hoveredSlotId) : slot(state.selectedSlotId); }
function isEditableDetail() { return !state.hoveredSlotId || state.hoveredSlotId === state.selectedSlotId; }
function buildingRows() {
    return getBuildings().flatMap((building) => {
        const tiers = [...new Set([...Object.keys(building.wood), ...Object.keys(building.stone)].map(Number).filter(Number.isFinite))];
        return tiers.map((tier) => ({
            key: `building:${building.id}:T${tier}`,
            kind: 'building', plotType: 'house', tier,
            label: `${building.label} · T${tier}`,
            iconUniqueName: 'PLAYERISLAND_FURNITUREITEM_WOOD_GATE_BIG_B',
            buildingId: building.id
        }));
    });
}
function itemRows() { return [...getPlants(), ...getAnimals(), ...buildingRows()]; }
function itemForSlot(entry) { return entry?.item ? itemRows().find((item) => item.key === entry.item) ?? null : null; }
function itemUniqueName(item) { return item?.iconUniqueName ?? getItemUniqueName(item?.plantItemId ?? item?.grownItemId); }
function isEconomicItem(item) { return Boolean(item?.seedId || item?.plantId || item?.babyId || item?.grownId); }
function itemName(item) { return item?.label || item?.key || '—'; }
function itemCategory(item) { return ({ crop: 'Sebze', herb: 'Ot', livestock: 'Hayvan', mount: 'Binek', 'faction-mount': 'Faction Bineği' })[item?.kind] ?? typeLabel(item?.plotType); }
function hasCityBonus(item) { return Array.isArray(item?.bonusCities) && item.bonusCities.includes(state.draft.islandCity); }
function animalProductionModes(item) {
    if (!item?.babyId) return [];
    const modes = [{ value: 'live', label: 'Canlı Sat' }];
    if (item.meatId) modes.push({ value: 'butcher', label: 'Kes' });
    if (item.productId) modes.push({ value: 'product', label: getItemLocalizedName(item.productItemId, 'Ürün') || 'Ürün' });
    return modes;
}
function productionModeFor(item, value) {
    if (!item?.babyId) return null;
    return animalProductionModes(item).some((mode) => mode.value === value) ? value : 'live';
}
function productionModeUsesFocus(item, value) {
    return !item?.babyId || productionModeFor(item, value) !== 'product';
}
function effectiveSlotFocus(entry, item) {
    return Boolean(state.draft.focus && entry?.focus && productionModeUsesFocus(item, entry.productionMode));
}
function normalizeSlot(entry, id) {
    const normalized = { ...blankSlot(id), ...(entry && typeof entry === 'object' ? entry : {}), id };
    const item = itemForSlot(normalized);
    if (item) {
        normalized.type = item.plotType;
        normalized.tier = item.tier;
        normalized.productionMode = productionModeFor(item, normalized.productionMode);
    } else {
        normalized.item = null;
        normalized.type = null;
        normalized.tier = null;
    }
    return normalized;
}
function normalizeDraft(value, islandCity) {
    const base = defaultDraft(islandCity);
    const source = value && typeof value === 'object' ? value : {};
    return { ...base, ...source, islandCity, slots: Array.from({ length: 16 }, (_, index) => normalizeSlot(source.slots?.[index], `R${index + 1}`)) };
}
function parsePlan(value) { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } }
function legacyCityPlans(key) {
    const stored = read(key);
    if (!stored) return { activeCity: null, plans: {} };
    if (stored.plans && typeof stored.plans === 'object') return { activeCity: stored.activeCity ?? null, plans: stored.plans };
    const legacyCity = stored.islandCity || getDefaultCity();
    return { activeCity: legacyCity, plans: { [cityKey(legacyCity)]: stored } };
}
function writePlanTable(tableName, plans, activeCity = null, hasActive = false) {
    const existing = getAll(tableName);
    const ids = new Map(existing.map((row) => [cityKey(row.city), row.id]));
    let nextId = existing.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    const now = new Date().toISOString();
    replaceAllRows(tableName, Object.entries(plans).map(([key, plan]) => ({
        id: ids.get(key) ?? nextId++, city: plan.islandCity || key, plan: JSON.stringify(plan),
        ...(hasActive ? { active: cityKey(activeCity) === key } : {}), updatedAt: now
    })));
}
function readPlanTable(tableName, legacyKey, hasActive = false) {
    let rows = getAll(tableName);
    if (!rows.length) {
        const legacy = legacyCityPlans(legacyKey);
        if (Object.keys(legacy.plans).length) {
            writePlanTable(tableName, legacy.plans, legacy.activeCity, hasActive);
            localStorage.removeItem(legacyKey);
            rows = getAll(tableName);
        }
    }
    const plans = {};
    let activeCity = null;
    rows.forEach((row) => {
        const plan = parsePlan(row.plan);
        if (!plan || typeof plan !== 'object') return;
        plans[cityKey(row.city)] = plan;
        if (hasActive && row.active) activeCity = row.city;
    });
    return { activeCity, plans };
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
function typeLabel(type) { return ({ farm: 'Tarla', herb: 'Ot', pasture: 'Mera', kennel: 'Kennel', house: 'Ev' })[type] ?? type; }
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
    const back = current.stage === 'type' ? '' : '<button type="button" class="island-v2-toolbar-back" data-v2-toolbar-back aria-label="Geri" title="Geri"><span aria-hidden="true">‹</span></button>';
    if (current.stage === 'type') {
        choices = ['farm', 'herb', 'pasture', 'kennel', 'house'].map((type) => {
            const active = current.type === type ? ' is-active' : '';
            return `<button type="button" class="island-v2-toolbar-type island-planner-type--${type}${active}" data-v2-toolbar-type="${type}" title="${typeLabel(type)}" aria-pressed="${active ? 'true' : 'false'}"><img class="island-v2-toolbar-type-icon" src="${TOOLBAR_TYPE_ICONS[type]}" alt="" aria-hidden="true"><span>${typeLabel(type)}</span></button>`;
        }).join('');
    }
    if (current.stage === 'item') {
        const groups = new Map();
        itemRows().filter((item) => item.plotType === current.type).sort((a, b) => a.tier - b.tier || toolbarOptionRank(a) - toolbarOptionRank(b) || itemName(a).localeCompare(itemName(b), 'tr')).forEach((item) => {
            if (!groups.has(item.tier)) groups.set(item.tier, []);
            groups.get(item.tier).push(item);
        });
        choices = groups.size ? `<span class="island-v2-toolbar-option-groups">${[...groups.entries()].map(([tier, items]) => `<span class="island-v2-toolbar-option-group" data-v2-toolbar-tier-group="${tier}"><span class="island-v2-toolbar-option-stack">${items.map((item) => `<button type="button" class="island-v2-toolbar-item is-item-tier-${item.tier}" data-v2-toolbar-item="${escapeHtml(item.key)}" title="T${item.tier} · ${escapeHtml(itemName(item))}" aria-label="T${item.tier} ${escapeHtml(itemName(item))}">${itemIconHtml(itemUniqueName(item), { size: 40 })}<span class="island-v2-toolbar-item-tier">T${item.tier}</span></button>`).join('')}</span></span>`).join('')}</span>` : '<span class="island-v2-toolbar-empty">Bu tür için seçenek bulunamadı.</span>';
    }
    return `<div class="island-v2-toolbar">${back}<div class="island-v2-toolbar-choices">${choices}</div></div>`;
}

function feedItemId(item) {
    if (!item?.babyId) return null;
    return item.feedDiet === 'meat' ? `T${item.tier}_MEAT` : (item.feedPlantId || null);
}
function purchaseItemId(item) { return item?.seedId || item?.babyId || null; }
function saleItemId(item) { return item?.plantId || item?.grownId || null; }
function v2PriceItemIds() {
    const ids = [];
    for (const entry of state.draft.slots) {
        const item = itemForSlot(entry);
        if (!isEconomicItem(item)) continue;
        const production = productionDerived(item, entry);
        if (production.requiresInput && state.draft.seedSide !== 'fixed') ids.push(purchaseItemId(item));
        if (production.requiresFeed && state.draft.seedSide !== 'fixed') ids.push(feedItemId(item));
        if (state.draft.harvestSide !== 'fixed') ids.push(production.saleItemId);
    }
    return [...new Set(ids.filter(Boolean))];
}
function v2PriceCities() {
    const cities = new Set();
    for (const entry of state.draft.slots) {
        const item = itemForSlot(entry);
        if (!isEconomicItem(item)) continue;
        const production = productionDerived(item, entry);
        if ((production.requiresInput || production.requiresFeed) && state.draft.seedSide !== 'fixed') cities.add(state.draft.islandCity);
        if (state.draft.harvestSide !== 'fixed') cities.add(state.draft.sellCity);
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
function priceLookup(itemId, city, side, intent, role = intent === 'buy' ? 'input' : 'output') {
    if (side === 'fixed') return fixedPriceLookup(itemId, role, intent);
    const lookup = { itemId: itemId ?? null, city: city ?? null, side, intent, row: null, quote: null, reason: null };
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
    const settings = getSettings();
    const intent = role === 'input' ? 'buy' : 'sell';
    const side = role === 'input' ? settings.buyPriceSide : settings.sellPriceSide;
    const marketQuote = priceLookup(itemId, city, side, intent, role).quote;
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
function dependencyList(values) {
    const unique = [...new Map((values ?? []).map((value) => [`${value.slotId}|${value.type}|${value.blocked}|${value.itemId || ''}|${value.reason}`, value])).values()];
    return unique.map((value) => {
        const lookup = [value.itemId, value.city, value.side].filter(Boolean).join(' · ');
        const meta = [lookup, value.updatedAt ? `${new Date(value.updatedAt).toLocaleString('tr-TR')} (${value.age})` : null, value.blocked].filter(Boolean).join(' · ');
        return `<li><b>${escapeHtml(value.slotId)}</b><span>${escapeHtml(value.item)}</span><em>${escapeHtml(dependencyTypeLabel(value.type))}</em><small>${escapeHtml(meta)}</small></li>`;
    }).join('');
}
function priceDependencyList(values) {
    const unique = [...new Map((values ?? []).map((value) => [
        `${value.type}|${value.itemId || ''}|${value.city || ''}|${value.side || ''}`,
        value
    ])).values()];
    return unique.map((value) => {
        const source = [value.city, value.side].filter(Boolean).join(' · ');
        const detail = [value.itemId, value.updatedAt ? `${new Date(value.updatedAt).toLocaleString('tr-TR')} (${value.age})` : null].filter(Boolean).join(' · ');
        return `<li><b>${escapeHtml(source || 'Fiyat')}</b><span>${escapeHtml(value.item)}</span><em>${escapeHtml(dependencyTypeLabel(value.type))}</em><small>${escapeHtml(detail || value.reason || '')}</small></li>`;
    }).join('');
}
function ledgerDependencies(entry, item, ledger) {
    if (!ledger) {
        return [dependency({ type: 'missing-ledger-row', entry, item, blocked: 'Kâr / Gün', reason: 'V1 island ledger bu item için hesap satırı üretmedi.' })];
    }
    return (ledger.missing ?? []).map((missing) => {
        const feed = /yem/i.test(missing);
        const itemId = feed ? (item.feedPlantId || item.feedSeedId || item.meatId || null) : null;
        const missingFeedRule = feed && (/ekin/i.test(missing) || !itemId);
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
function sumFinite(values) { return values.length && values.every(Number.isFinite) ? values.reduce((total, value) => total + value, 0) : null; }
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
    const baseHours = Number(item.baseHours);
    const hours = Number.isFinite(baseHours) && baseHours > 0
        ? planCycleHours(premium ? baseHours / 2 : baseHours)
        : null;
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
    return { output, netOutput: output, rr, hours, source, samples: Math.max(observed?.n ?? 0, returnInfo.n ?? 0), saleItemId: item.grownId, requiresInput: true, requiresFeed: true, usesFocus, effectiveFocus: focused };
}
function productionSourceLabel(values) {
    if (values.productionSource === 'user') {
        return `Gözlem kaydı${values.productionSamples ? ` (n=${values.productionSamples})` : ''}`;
    }
    return values.productionSource === 'standard' ? 'Referans varsayılan' : '—';
}
function productionSourceTitle(values) {
    if (values.productionSource === 'user') {
        return `Ada Çıktı gözlemleri kullanıldı${values.productionSamples ? ` (${values.productionSamples} kayıt)` : ''}.`;
    }
    return values.productionSource === 'standard'
        ? 'Ada Çıktı gözlemi yok; mevcut katalog/ekonomi varsayılanı kullanıldı.'
        : dependencyTitle([...(values.dependencies?.output ?? []), ...(values.dependencies?.rr ?? [])]);
}
export function calculateIslandPlan() {
    const slots = new Map(); const candidates = []; const supplies = new Map();
    const diagnostics = []; const staleDiagnostics = []; const derivedDependencies = [];
    for (const entry of state.draft.slots) {
        const item = itemForSlot(entry);
        if (!item) { slots.set(entry.id, { income: null, expense: null, net: null, focus: null, output: null, rr: null, internal: null, market: null, priceState: 'empty', diagnostics: [], dependencies: {} }); continue; }
        if (!isEconomicItem(item)) { slots.set(entry.id, { income: null, expense: null, net: null, focus: null, output: null, rr: null, internal: null, market: null, economic: false, priceState: 'not-applicable', diagnostics: [], staleDiagnostics: [], dependencies: {} }); continue; }
        const production = productionDerived(item, entry);
        const capacity = item.seedId ? plantSlots() : Number(item.pens);
        const dailyFactor = Number.isFinite(production.hours) && production.hours > 0 ? planDayHours() / production.hours : null;
        const inputQuantity = production.requiresInput && Number.isFinite(capacity) && Number.isFinite(dailyFactor) && Number.isFinite(production.rr)
            ? capacity * dailyFactor * (1 - production.rr) : null;
        const feedId = production.requiresFeed ? feedItemId(item) : null;
        const feedQuantity = production.requiresFeed && Number.isFinite(capacity) && Number.isFinite(dailyFactor) && Number.isFinite(Number(item.feedQty))
            ? capacity * dailyFactor * Number(item.feedQty) : null;
        const feedLookup = feedId ? priceLookup(feedId, state.draft.islandCity, state.draft.seedSide, 'buy', 'input') : null;
        const feedEffective = feedLookup?.quote ? purchaseCost(feedLookup.quote.price, { setup: feedLookup.quote.setup }) : null;
        const candidate = { entry, item, production, capacity, inputQuantity, feedId, feedQuantity, feedLookup, feedEffective, internal: 0, market: feedQuantity, consumed: 0, internalTransferIn: 0, internalTransferOut: 0, transferValueComplete: true, transferValueMissing: null };
        candidates.push(candidate);
        if (item.plantId && Number.isFinite(production.output)) {
            const list = supplies.get(item.plantId) ?? [];
            list.push(candidate); supplies.set(item.plantId, list);
        }
    }
    // Resource-flow: plant output serves matching animal feed first; only the shortfall is bought.
    for (const candidate of candidates.filter((value) => value.feedId && Number.isFinite(value.feedQuantity))) {
        let need = candidate.feedQuantity;
        for (const supply of supplies.get(candidate.feedId) ?? []) {
            const available = Math.max(0, (supply.production.output ?? 0) - supply.consumed);
            const used = Math.min(need, available);
            supply.consumed += used; candidate.internal += used; need -= used;
            if (Number.isFinite(candidate.feedEffective)) {
                const transferValue = used * candidate.feedEffective;
                supply.internalTransferOut += transferValue;
                candidate.internalTransferIn += transferValue;
            } else if (used > 0) {
                supply.transferValueComplete = false;
                candidate.transferValueComplete = false;
                const missing = { itemId: candidate.feedId, city: state.draft.islandCity, side: state.draft.seedSide };
                supply.transferValueMissing = missing;
                candidate.transferValueMissing = missing;
            }
            if (need <= 0) break;
        }
        candidate.market = need;
    }
    for (const candidate of candidates) {
        const { entry, item, production } = candidate;
        const purchaseLookup = production.requiresInput ? priceLookup(purchaseItemId(item), state.draft.islandCity, state.draft.seedSide, 'buy', 'input') : null;
        const saleLookup = priceLookup(production.saleItemId, state.draft.sellCity, state.draft.harvestSide, 'sell', 'output');
        const feedLookup = candidate.feedId && (candidate.market > 0 || candidate.internal > 0) ? candidate.feedLookup : null;
        const purchaseQuote = purchaseLookup?.quote ?? null; const saleQuote = saleLookup.quote; const feedQuote = feedLookup?.quote ?? null;
        const slotDiagnostics = [];
        if (production.requiresInput && !purchaseQuote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: purchaseLookup, role: 'alış', blocked: 'Tohum / yavru maliyeti' }));
        if (!saleQuote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: saleLookup, role: 'satış', blocked: 'Hasat satış geliri' }));
        if (candidate.feedId && candidate.market > 0 && !feedQuote) slotDiagnostics.push(missingPriceDiagnostic({ entry, item, lookup: feedLookup, role: 'yem', blocked: 'Yem gideri' }));
        const priceDependencies = slotDiagnostics.map((diagnostic) => dependency({ type: diagnostic.type, entry, item, itemId: diagnostic.itemId, city: diagnostic.city, side: diagnostic.side, blocked: diagnostic.blocked, reason: diagnostic.reason }));
        const baseDependencies = [];
        if (!Number.isFinite(production.output)) baseDependencies.push(dependency({ type: 'missing-output-data', entry, item, blocked: 'Günlük Çıktı', reason: 'Ada Çıktı gözlemi veya mevcut referans çıktı değeri bulunamadı.' }));
        if (production.requiresInput && !Number.isFinite(production.rr)) baseDependencies.push(dependency({ type: 'missing-rr-output-data', entry, item, blocked: 'RR / Geri Dönüş', reason: 'Ada Çıktı gözlemi veya mevcut referans geri dönüş oranı bulunamadı.' }));
        if (production.requiresFeed && (!candidate.feedId || !Number.isFinite(candidate.feedQuantity))) baseDependencies.push(dependency({ type: 'missing-feed-rule', entry, item, blocked: 'Yem gideri', reason: 'Mevcut katalogda bu hayvan için günlük yem kuralı eksik.' }));
        const effectiveBuy = purchaseQuote ? purchaseCost(purchaseQuote.price, { setup: purchaseQuote.setup }) : null;
        const effectiveSell = saleQuote ? saleProceeds(saleQuote.price, { premium: state.draft.premium, setup: saleQuote.setup }) : null;
        const effectiveFeed = feedQuote ? purchaseCost(feedQuote.price, { setup: feedQuote.setup }) : null;
        const seedOrBabyCost = !production.requiresInput ? 0 : (Number.isFinite(effectiveBuy) && Number.isFinite(candidate.inputQuantity) ? effectiveBuy * candidate.inputQuantity : null);
        const feedCost = candidate.market > 0 ? (Number.isFinite(effectiveFeed) ? effectiveFeed * candidate.market : null) : 0;
        const feedRuleReady = !production.requiresFeed || (Boolean(candidate.feedId) && Number.isFinite(candidate.feedQuantity));
        const expense = Number.isFinite(seedOrBabyCost) && Number.isFinite(feedCost) && feedRuleReady ? seedOrBabyCost + feedCost : null;
        const saleQuantity = Math.max(0, (production.output ?? 0) - candidate.consumed);
        const income = Number.isFinite(effectiveSell) && Number.isFinite(production.output)
            ? effectiveSell * (item.plantId ? saleQuantity : production.output) : null;
        const externalIncome = income;
        const externalExpense = expense;
        const externalNet = Number.isFinite(externalIncome) && Number.isFinite(externalExpense) ? externalIncome - externalExpense : null;
        const contribution = Number.isFinite(externalIncome) && Number.isFinite(externalExpense) && candidate.transferValueComplete
            ? externalIncome + candidate.internalTransferOut - externalExpense - candidate.internalTransferIn
            : null;
        const requiredQuotes = [...(production.requiresInput ? [purchaseQuote] : []), saleQuote, ...(candidate.feedId && candidate.market > 0 ? [feedQuote] : [])];
        const priceState = priceStateFor(requiredQuotes);
        if (priceState === 'missing') diagnostics.push(...slotDiagnostics);
        const slotStaleDiagnostics = [];
        const staleRows = [[purchaseQuote, purchaseItemId(item), state.draft.islandCity, state.draft.seedSide, 'alış', 'Tohum / yavru maliyeti'], [saleQuote, production.saleItemId, state.draft.sellCity, state.draft.harvestSide, 'satış', 'Hasat satış geliri'], [feedQuote, candidate.feedId, state.draft.islandCity, state.draft.seedSide, 'yem', 'Yem gideri']];
        staleRows.forEach(([quote, itemId, city, side, role, usedIn]) => { if (quote?.stale) slotStaleDiagnostics.push(stalePriceDiagnostic({ entry, item, itemId, city, side, quote, role, usedIn })); });
        if (slotStaleDiagnostics.length) staleDiagnostics.push(...slotStaleDiagnostics);
        const dependencies = {
            income: Number.isFinite(income) ? [] : [...priceDependencies.filter((value) => value.blocked === 'Hasat satış geliri'), ...baseDependencies],
            expense: Number.isFinite(expense) ? [] : [...priceDependencies.filter((value) => value.blocked !== 'Hasat satış geliri'), ...baseDependencies],
            net: Number.isFinite(externalNet) ? [] : [...priceDependencies, ...baseDependencies],
            contribution: Number.isFinite(contribution) ? [] : [...priceDependencies, ...baseDependencies, ...(candidate.transferValueComplete ? [] : [dependency({ type: candidate.transferValueMissing?.side === 'fixed' ? 'missing-fixed-price' : 'missing-price', entry, item, itemId: candidate.transferValueMissing?.itemId ?? null, city: candidate.transferValueMissing?.city ?? null, side: candidate.transferValueMissing?.side ?? null, blocked: 'Katkı / Gün', reason: candidate.transferValueMissing?.side === 'fixed' ? 'İç transfer değeri için sabit yem fiyatı tanımlı değil.' : 'İç transfer değeri için yem acquisition fiyatı eksik.' })])],
            profitPercent: Number.isFinite(contribution) && Number.isFinite(externalExpense + candidate.internalTransferIn) && externalExpense + candidate.internalTransferIn > 0 ? [] : [...priceDependencies, ...baseDependencies],
            focus: production.effectiveFocus ? [dependency({ type: 'missing-focus-cost', entry, item, blocked: 'Focus / Gün', reason: 'Mevcut karakter Focus maliyeti verisi yok.' })] : [],
            output: Number.isFinite(production.output) ? [] : baseDependencies.filter((value) => value.type === 'missing-output-data'),
            rr: Number.isFinite(production.rr) ? [] : baseDependencies.filter((value) => value.type === 'missing-rr-output-data'),
            internal: [], market: []
        };
        Object.values(dependencies).forEach((values) => derivedDependencies.push(...values));
        slots.set(entry.id, { income: externalIncome, expense: externalExpense, net: externalNet, externalIncome, externalExpense, externalNet, contribution, profitPercent: Number.isFinite(contribution) && Number.isFinite(externalExpense + candidate.internalTransferIn) && externalExpense + candidate.internalTransferIn > 0 ? (contribution / (externalExpense + candidate.internalTransferIn)) * 100 : null, focus: production.effectiveFocus ? null : 0, usesFocus: production.usesFocus, effectiveFocus: production.effectiveFocus, output: production.output, netOutput: item.plantId ? saleQuantity : production.output, rr: production.rr, productionSource: production.source, productionSamples: production.samples, productionHours: production.hours, internal: candidate.internal, market: candidate.market, internalTransferIn: candidate.internalTransferIn, internalTransferOut: candidate.internalTransferOut, economic: true, priceState, purchaseQuote, saleQuote, feedQuote, purchaseEffective: effectiveBuy, saleEffective: effectiveSell, feedEffective: effectiveFeed, purchaseComparison: fixedMarketComparison(purchaseItemId(item), state.draft.islandCity, 'input', purchaseQuote), saleComparison: fixedMarketComparison(production.saleItemId, state.draft.sellCity, 'output', saleQuote), feedComparison: fixedMarketComparison(candidate.feedId, state.draft.islandCity, 'input', feedQuote), diagnostics: slotDiagnostics, staleDiagnostics: slotStaleDiagnostics, dependencies });
    }
    const filled = [...slots.values()].filter((value) => value.economic === true);
    const contributionTotal = sumFinite(filled.map((value) => value.contribution));
    const externalNet = sumFinite(filled.map((value) => value.externalNet));
    if (Number.isFinite(contributionTotal) && Number.isFinite(externalNet) && Math.abs(contributionTotal - externalNet) > 1e-7) {
        console.warn('[Island Planner V2] Katkı toplamı external net ile uyuşmuyor.', { contributionTotal, externalNet });
    }
    logMissingPriceDiagnostics(diagnostics);
    logDerivedDependencies(derivedDependencies);
    const missing = uniquePriceDiagnosticCount(diagnostics);
    const stale = uniquePriceDiagnosticCount(staleDiagnostics);
    const summaryDependencies = (key) => filled.filter((value) => !Number.isFinite(value[key])).flatMap((value) => value.dependencies?.[key] ?? []);
    state.derived = { slots, summary: { net: externalNet, contribution: contributionTotal, income: sumFinite(filled.map((value) => value.externalIncome)), expense: sumFinite(filled.map((value) => value.externalExpense)), focus: null, internal: sumFinite(filled.map((value) => value.internal)), market: sumFinite(filled.map((value) => value.market)), surplus: sumFinite(filled.map((value) => value.netOutput)), feed: null, missing, stale, priceLabel: priceSummaryLabel({ missing, stale }), diagnostics, staleDiagnostics, dependencies: { net: summaryDependencies('net'), income: summaryDependencies('income'), expense: summaryDependencies('expense'), focus: filled.flatMap((value) => value.dependencies?.focus ?? []) } } };
    render();
}
async function loadV2Prices() {
    const requestId = ++state.priceRequestId;
    const ids = v2PriceItemIds();
    if (!ids.length) {
        state.priceLoading = false;
        state.priceError = null;
        calculateIslandPlan();
        return;
    }
    state.priceLoading = true; state.priceError = null;
    render();
    try {
        const cities = v2PriceCities();
        const rows = await fetchPrices(ids, cities, { source: getSettings().priceSource });
        if (requestId !== state.priceRequestId) return;
        state.priceIndex = indexPrices(rows);
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
            calculateIslandPlan();
        }
    }
}
function scheduleEconomicUpdate() {
    clearTimeout(state.calculationTimer);
    persistDrafts();
    state.calculationTimer = setTimeout(() => { void loadV2Prices(); }, 125);
}

function renderSegment(label, values, current, attr) { return `<div><p class="island-v2-group-label">${label}</p><div class="island-v2-segment">${values.map(([value, text]) => `<button type="button" data-v2-${attr}="${value}" class="${String(value) === String(current) ? 'is-active' : ''}">${text}</button>`).join('')}</div></div>`; }
function renderCities(label, current, attr, disabled = false) { const cities = state.cities.filter((city) => V2_CITIES.includes(cityKey(city.marketApiName))); const disabledAttr = disabled ? ' disabled aria-disabled="true"' : ''; return `<div><p class="island-v2-group-label">${label}</p><div class="island-v2-city-list">${cities.map((city) => `<button type="button" class="island-v2-city ${city.marketApiName === current ? 'is-active' : ''}" data-v2-${attr}="${escapeHtml(city.marketApiName)}" title="${escapeHtml(city.displayName)}"${disabledAttr}><img src="${cityImage(city.marketApiName)}" alt="${escapeHtml(city.displayName)}"></button>`).join('')}</div></div>`; }
function renderControls() { const d = state.draft; const plots = V2_UNLOCKED_SLOTS_BY_LEVEL?.[d.islandLevel]?.length; return `<aside class="island-v2-controls">${renderSegment('PREMIUM', [['1','Premium'],['0','Free']], d.premium ? '1' : '0', 'premium')}${renderSegment('FOCUS', [['1','Focus'],['0','Yok']], d.focus ? '1' : '0', 'focus')}${renderCities('ADA ŞEHRİ',d.islandCity,'island-city', d.seedSide === 'fixed')}${renderCities('SATIŞ ŞEHRİ',d.sellCity,'sell-city', d.harvestSide === 'fixed')}${renderSegment('ADA SEVİYESİ',[[2,'L2'],[3,'L3'],[4,'L4'],[5,'L5'],[6,'L6']],d.islandLevel,'level')}<p class="island-v2-price-time">${plots == null ? 'Plot slot eşlemesi: TODO' : `${plots} plot`}</p>${renderSegment('Tohum',[['buy','Buy'],['sell','Sell'],['fixed','Sabit']],d.seedSide,'seed')}${renderSegment('Hasat',[['buy','Buy'],['sell','Sell'],['fixed','Sabit']],d.harvestSide,'harvest')}<div class="island-v2-actions"><button class="btn btn-primary" type="button" data-v2-save>Kaydet</button><button class="btn btn-outline-secondary" type="button" data-v2-revert>Kaydedilmiş Haline Dön</button><button class="btn btn-outline-secondary" type="button" data-v2-prices>Fiyatları Yenile</button><p class="island-v2-price-time">${escapeHtml(priceText())}</p></div></aside>`; }
function renderIsland() { const points = geometryForCity(); const d = state.draft; const overlays = points ? `<div class="island-v2-overlay-layer" data-v2-overlay-layer>${d.slots.map((entry) => { const p = points[entry.id]; if (!p) return ''; const item = itemForSlot(entry); const active = entry.id === state.selectedSlotId; const hover = entry.id === state.hoveredSlotId; const debug = OVERLAY_DEBUG && ['R1','R10','R16'].includes(entry.id) ? ' is-debug' : ''; return `<div class="island-v2-slot-anchor${debug}" data-v2-overlay-anchor="${entry.id}" data-v2-x="${p.x}" data-v2-y="${p.y}"><button type="button" draggable="true" class="island-v2-overlay ${item ? 'is-filled' : 'is-empty'} ${active ? 'is-selected' : ''} ${hover ? 'is-hovered' : ''}" data-v2-slot="${entry.id}">${item ? itemIconHtml(itemUniqueName(item), { size: 30, className: 'island-v2-overlay-icon' }) : ''}</button><span class="island-v2-overlay-number">${entry.id.slice(1).padStart(2,'0')}</span></div>`; }).join('')}</div>` : `<div class="island-v2-unresolved">${cityKey(d.islandCity) === 'brecilien' ? 'Brecilien slot koordinatları yapılandırılmayı bekliyor.' : 'Caerleon slot koordinatları yapılandırılmayı bekliyor.'}</div>`; return `<section class="island-v2-island"><img class="island-v2-island-image" src="${islandImage(d.islandCity)}" alt="${escapeHtml(cityName(d.islandCity))} adası">${overlays}${renderToolbar()}${renderIslandPriceAlert()}</section>`; }
function displayValue(value) { return Number.isFinite(value) ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value) : '—'; }
function displayRate(value) { return Number.isFinite(value) ? `${(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}%` : '—'; }
function displayDays(hours) { return Number.isFinite(hours) && hours > 0 ? `${(hours / planDayHours()).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün` : '—'; }
function valueTone(value) { return Number.isFinite(value) ? (value > 0 ? 'is-positive' : (value < 0 ? 'is-negative' : 'is-neutral')) : 'is-neutral'; }
function renderCards() {
    const unlocked = V2_UNLOCKED_SLOTS_BY_LEVEL?.[state.draft.islandLevel];
    return `<section class="island-v2-slot-grid">${state.draft.slots.map((entry) => {
        const item = itemForSlot(entry);
        const selected = entry.id === state.selectedSlotId;
        const hovered = entry.id === state.hoveredSlotId;
        const locked = Array.isArray(unlocked) && !unlocked.includes(entry.id);
        const number = entry.id.slice(1).padStart(2,'0');
        const stateClasses = `${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`;
        if (locked) return `<button type="button" class="island-v2-card is-locked${stateClasses}" data-v2-slot="${entry.id}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span></span><span class="island-v2-card-empty"><b class="island-v2-lock" aria-hidden="true"></b><span>Kilitli Slot</span><small>Ada seviyesi yetersiz olduğu için kullanılamaz.</small></span></button>`;
        if (!item) return `<button type="button" class="island-v2-card is-empty${stateClasses}" data-v2-slot="${entry.id}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span></span><span class="island-v2-card-empty"><b>+</b><span>Plot Seçin</span><small>Atama için seçin</small></span></button>`;
        const values = state.derived.slots.get(entry.id) ?? {};
        const profitPercent = values.profitPercent;
        const netTone = valueTone(values.contribution);
        const icon = itemIconHtml(itemUniqueName(item), { size: 42, className: 'island-v2-card-icon' });
        const bonus = hasCityBonus(item) ? '<i class="island-v2-card-city-bonus" title="Şehir Bonusu +10%"></i>' : '';
        const priceDiagnostic = diagnosticsTitle(values.diagnostics ?? []);
        const cardDiagnostic = priceDiagnostic;
        const priceTitle = cardDiagnostic ? ` title="${escapeHtml(cardDiagnostic)}" aria-label="Hesap dependency teşhisi: ${escapeHtml(cardDiagnostic)}"` : '';
        const usesFocus = productionModeUsesFocus(item, entry.productionMode);
        const focusSelected = Boolean(entry.focus && usesFocus);
        const focusTitle = !usesFocus ? 'Bu üretim modu Focus kullanmaz.' : focusSelected && !values.effectiveFocus ? 'Bu slotta Focus seçili; hesap için global Focus master kapalı.' : focusSelected ? 'Focus etkin.' : 'Focus kapalı.';
        return `<button type="button" draggable="true" class="island-v2-card is-filled is-item-tier-${item.tier} ${netTone}${stateClasses}" data-v2-slot="${entry.id}"${priceTitle}><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span><i class="island-v2-focus-dot ${focusSelected ? 'is-on' : ''}${focusSelected && !values.effectiveFocus ? ' is-awaiting-master' : ''}" title="${escapeHtml(focusTitle)}" aria-label="${escapeHtml(focusTitle)}"></i><span class="island-v2-card-tier-stack"><span class="island-v2-tier">T${item.tier}</span>${bonus}</span></span><span class="island-v2-card-item">${icon}<span>${escapeHtml(itemName(item))}</span></span><span class="island-v2-finance"><span class="island-v2-income"><b aria-hidden="true">+</b><span>${displayValue(values.income)}</span></span><em class="${valueTone(profitPercent)}">${Number.isFinite(profitPercent) ? `${Math.round(profitPercent)}%` : '—'}</em><span class="island-v2-expense"><span>${displayValue(values.expense)}</span><b aria-hidden="true">−</b></span></span><strong class="island-v2-net">${displayValue(values.contribution)}</strong></button>`;
    }).join('')}</section>`;
}
function detailRow(label, value = '—', title = '') { const hint = title ? ` title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"` : ''; return `<span${hint}><small>${label}</small><b>${value}</b></span>`; }
function renderDetail() {
    const entry = displayedSlot();
    const item = itemForSlot(entry);
    const editable = isEditableDetail() && Boolean(item);
    const disabled = editable ? '' : ' disabled';
    const values = state.derived.slots.get(entry.id) ?? {};
    const dependencyHint = (key) => dependencyTitle(values.dependencies?.[key] ?? []);
    const bonus = item && hasCityBonus(item) ? '<i class="island-v2-city-bonus" title="Şehir Bonusu +10%" aria-label="Şehir Bonusu +10%"></i>' : '';
    const modeOptions = item?.babyId ? animalProductionModes(item) : [];
    const modes = modeOptions.map(({ value, label }) => `<button type="button" data-v2-production-mode="${value}" class="${entry.productionMode === value ? 'is-active' : ''}"${disabled}>${escapeHtml(label)}</button>`).join('');
    const modeControl = modes ? `<span class="island-v2-control-label">Üretim Modu</span><span class="island-v2-production-mode">${modes}</span>` : '';
    const focusControl = item && productionModeUsesFocus(item, entry.productionMode)
        ? `<span class="island-v2-control-label">Focus</span><button type="button" data-v2-slot-focus class="island-v2-focus-toggle ${entry.focus ? 'is-active' : ''}" role="switch" aria-checked="${entry.focus ? 'true' : 'false'}" aria-label="Focus"${disabled}><i></i></button>`
        : '';
    const identity = item ? `${itemIconHtml(itemUniqueName(item), { size: 40, className: 'island-v2-detail-icon' })}<div class="island-v2-detail-identity"><h2>${escapeHtml(itemName(item))}</h2><span class="island-v2-detail-tier is-item-tier-${item.tier}">T${item.tier}</span><span class="island-v2-detail-category">${escapeHtml(itemCategory(item))}</span>${bonus}</div>` : '<div class="island-v2-detail-identity"><h2>Plot seçilmedi</h2><span class="island-v2-detail-category">Toolbar ile atama yapın.</span></div>';
    const priceDiagnostic = values.priceState === 'stale'
        ? dependencyTitle(values.staleDiagnostics ?? [])
        : values.priceState === 'fixed'
            ? fixedComparisonTitle(values)
            : diagnosticsTitle(values.diagnostics ?? []);
    return `<section class="island-v2-detail${editable ? '' : ' is-readonly'}"><strong class="island-v2-detail-number">${entry.id.slice(1).padStart(2,'0')}</strong><div class="island-v2-detail-main">${identity}</div><div class="island-v2-detail-controls">${focusControl}${modeControl}</div><div class="island-v2-kpis">${detailRow('Katkı / Gün', displayValue(values.contribution), dependencyHint('contribution'))}${detailRow('Gelir / Gün', displayValue(values.income), dependencyHint('income'))}${detailRow('Gider / Gün', displayValue(values.expense), dependencyHint('expense'))}${detailRow('Focus / Gün', displayValue(values.focus), dependencyHint('focus'))}</div><div class="island-v2-detail-list"><p><b>ÜRETİM BİLGİLERİ</b>${detailRow('Günlük Çıktı', displayValue(values.output), dependencyHint('output'))}${detailRow('Büyüme Süresi', displayDays(values.productionHours))}${detailRow('RR / Geri Dönüş', displayRate(values.rr), dependencyHint('rr'))}${detailRow('Net Çıktı', displayValue(values.netOutput), dependencyHint('output'))}${detailRow('Veri Kaynağı', productionSourceLabel(values), productionSourceTitle(values))}</p><p><b>EKONOMİ / TEDARİK</b>${detailRow('Tohum / Yavru Alış', displayValue(values.purchaseQuote?.price), dependencyHint('expense'))}${detailRow('Günlük Net Giriş', displayValue(values.net), dependencyHint('net'))}${detailRow('Satış Fiyatı', displayValue(values.saleQuote?.price), dependencyHint('income'))}${detailRow('İçeriden Karşılanan', displayValue(values.internal), dependencyHint('internal'))}${detailRow('Marketten Alınan', displayValue(values.market), dependencyHint('market'))}${detailRow('Fiyat Durumu', values.priceState === 'current' ? 'Güncel' : values.priceState === 'stale' ? 'Eski' : values.priceState === 'fixed' ? 'Sabit' : values.priceState === 'missing' ? 'Eksik' : '—', priceDiagnostic)}</p></div></section>`;
}
function metric(label, value = '—', dependencies = [], key = '') {
    const title = dependencyTitle(dependencies);
    if (!dependencies.length) return `<div class="island-v2-metric"><span>${label}</span><strong>${value}</strong></div>`;
    return `<div class="island-v2-metric island-v2-metric-has-dependencies" title="${escapeHtml(title)}"><button type="button" class="island-v2-metric-trigger" data-v2-dependency-popover="${escapeHtml(key)}" aria-label="${escapeHtml(label)} için eksik dependency listesini göster"><span>${label}</span><strong>${value}</strong></button><div class="island-v2-dependency-popover" data-v2-dependency-list="${escapeHtml(key)}" popover="auto"><strong>${escapeHtml(label)} · Eksik dependency</strong><ul>${dependencyList(dependencies)}</ul></div></div>`;
}
function uniqueDependencies(values) {
    return [...new Map((values ?? []).map((value) => [`${value.slotId}|${value.type}|${value.blocked}|${value.itemId || ''}|${value.reason}`, value])).values()];
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
        missingPrices.length ? islandAlertItem({ type: 'price', label: 'Fiyat', value: `${summary.missing} eksik`, key: 'price-missing', heading: 'Eksik fiyatlar', values: missingPrices, list: priceDependencyList }) : '',
        stalePrices.length ? islandAlertItem({ type: 'stale-price', label: 'Fiyat', value: `${summary.stale} güncel değil`, key: 'price-stale', heading: 'Güncel olmayan fiyatlar', values: stalePrices, list: priceDependencyList }) : ''
    ].join('');
    return `<aside class="island-v2-price-alert island-v2-alert-stack" aria-label="Hesap uyarıları">${price}${warnings.map(dependencyAlert).join('')}</aside>`;
}
function renderSummary() {
    const summary = state.derived.summary ?? {};
    const dependencies = summary.dependencies ?? {};
    return `<section class="island-v2-summary"><div class="island-v2-summary-title"><strong>05</strong><span>Ada Özeti</span><span>${escapeHtml(cityName(state.draft.islandCity))} · Seviye ${state.draft.islandLevel}</span></div>${metric('Net Kâr / Gün', displayValue(summary.net), dependencies.net ?? [], 'net')}${metric('Gelir', displayValue(summary.income), dependencies.income ?? [], 'income')}${metric('Gider', displayValue(summary.expense), dependencies.expense ?? [], 'expense')}${metric('Focus / Gün', displayValue(summary.focus), dependencies.focus ?? [], 'focus')}${metric('İçeriden', displayValue(summary.internal))}${metric('Marketten', displayValue(summary.market))}${metric('Satışa Kalan', displayValue(summary.surplus))}${metric('Yem')}</section>`;
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
function renderDragUi() { return `<div class="island-v2-drag-preview" data-v2-drag-preview aria-hidden="true"><span class="island-v2-drag-preview-content" data-v2-drag-preview-content></span><span class="island-v2-drag-preview-number" data-v2-drag-preview-number></span></div><div class="island-v2-clear-drop" data-v2-clear-drop>Boşalt</div><dialog class="app-dialog island-v2-confirm" data-v2-confirm><button type="button" class="app-dialog-close" aria-label="Kapat" data-v2-confirm-cancel></button><div class="island-v2-confirm-sheet"><p data-v2-confirm-message></p><div><button type="button" class="btn btn-outline-secondary" data-v2-confirm-cancel>İptal</button><button type="button" class="btn btn-primary" data-v2-confirm-accept>Onayla</button></div></div></dialog>`; }
function openDependencyPopover(root, key) {
    const list = root.querySelector(`[data-v2-dependency-list="${key}"]`);
    if (!list) { state.openDependencyPopover = null; return; }
    if (key === 'price-missing' || key === 'price-stale' || key.startsWith('island-warning-')) {
        const island = root.querySelector('.island-v2-island');
        const rect = island?.getBoundingClientRect();
        if (rect) {
            list.style.top = `${Math.round(rect.top + 10)}px`;
            list.style.right = `${Math.round(window.innerWidth - rect.right + 10)}px`;
        }
    }
    list.showPopover?.();
}
function render() { const root = document.querySelector('[data-island-planner-v2]'); if (!root) return; root.innerHTML = `<div class="island-v2-page"><div class="island-v2-layout">${renderControls()}${renderIsland()}<div class="island-v2-right">${renderCards()}${renderDetail()}</div>${renderSummary()}</div>${renderDragUi()}</div>`; syncLayoutGeometry(root); const image = root.querySelector('.island-v2-island-image'); if (image?.complete) syncOverlayGeometry(root); else image?.addEventListener('load', () => syncOverlayGeometry(root), { once: true }); bind(root); if (state.openDependencyPopover) openDependencyPopover(root, state.openDependencyPopover); }
function mutate(mutator, economic = true) { mutator(); if (economic) scheduleEconomicUpdate(); else render(); }
function isSlotLocked(slotId) { const unlocked = V2_UNLOCKED_SLOTS_BY_LEVEL?.[state.draft.islandLevel]; return Array.isArray(unlocked) && !unlocked.includes(slotId); }
const DRAG_PREVIEW_SIZE_VARS = ['--island-v2-diamond-width','--island-v2-diamond-height','--island-v2-inner-width','--island-v2-inner-height','--island-v2-icon-width','--island-v2-icon-height','--island-v2-badge-width','--island-v2-badge-height','--island-v2-badge-font','--island-v2-plus-size','--island-v2-selected-outline'];
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
        const target = element?.closest('[data-v2-slot]'); const clear = element?.closest('[data-v2-clear-drop]');
        if (target && target.dataset.v2Slot !== drag.sourceSlotId && !isSlotLocked(target.dataset.v2Slot)) {
            const rect = target.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; previewSlotId = target.dataset.v2Slot; validity = itemForSlot(slot(target.dataset.v2Slot)) ? 'is-overwrite' : 'is-valid';
        } else if (clear) {
            const rect = clear.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; validity = 'is-clear';
        }
    } else if (element?.closest('.island-v2-island')) validity = 'is-valid';
    preview.classList.remove('is-valid', 'is-invalid', 'is-overwrite', 'is-clear'); preview.classList.add(validity);
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
    if (drag.mode === 'copy' && dropTarget.closest('[data-v2-clear-drop]')) {
        const accepted = await confirmAction(root, 'Bu slot boşaltılsın mı?', 'Boşalt');
        cleanupDrag(root); if (accepted) mutate(() => { state.draft.slots = state.draft.slots.map((entry) => entry.id === drag.sourceSlotId ? blankSlot(entry.id) : entry); }); return;
    }
    const slotTarget = dropTarget.closest('[data-v2-slot]');
    if (drag.mode === 'copy' && slotTarget && slotTarget.dataset.v2Slot !== drag.sourceSlotId && !isSlotLocked(slotTarget.dataset.v2Slot)) {
        const targetId = slotTarget.dataset.v2Slot; const destination = slot(targetId);
        if (itemForSlot(destination) && !await confirmAction(root, 'Bu slot dolu. Mevcut ayarlar üzerine yazılsın mı?', 'Üzerine Yaz')) { cleanupDrag(root); return; }
        cleanupDrag(root); mutate(() => { const copied = clone(slot(drag.sourceSlotId)); state.draft.slots = state.draft.slots.map((entry) => entry.id === targetId ? { ...copied, id: targetId } : entry); }); return;
    }
    cleanupDrag(root);
}
function bind(root) {
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
        if (d.v2IslandCity) { switchIslandCity(d.v2IslandCity); scheduleEconomicUpdate(); return; }
        if (d.v2SellCity) mutate(() => { state.draft.sellCity = d.v2SellCity; });
        if (d.v2Level) mutate(() => { state.draft.islandLevel = Number(d.v2Level); });
        if (d.v2Seed) mutate(() => { state.draft.seedSide = d.v2Seed; });
        if (d.v2Harvest) mutate(() => { state.draft.harvestSide = d.v2Harvest; });
        if ('v2ToolbarBack' in d) mutate(() => { state.toolbar = { stage: 'type', type: null }; }, false);
        if (d.v2ToolbarType) mutate(() => { state.toolbar = { stage: 'item', type: d.v2ToolbarType }; }, false);
        if (d.v2ToolbarItem) { const item = itemRows().find((entry) => entry.key === d.v2ToolbarItem); if (item) mutate(() => { const target = slot(state.selectedSlotId); target.item = item.key; target.type = item.plotType; target.tier = item.tier; target.productionMode = productionModeFor(item, target.productionMode); }); return; }
        if ('v2SlotFocus' in d && isEditableDetail()) mutate(() => { const entry = slot(state.selectedSlotId); entry.focus = !entry.focus; });
        if (d.v2ProductionMode && isEditableDetail()) mutate(() => { const target = slot(state.selectedSlotId); target.productionMode = productionModeFor(itemForSlot(target), d.v2ProductionMode); });
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
            const mode = pointer.shiftKey && pointer.sourceIsOverlay ? 'geometry' : (itemForSlot(slot(pointer.sourceSlotId)) ? 'copy' : null);
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
    state.fixedPrices = getAll(V2_FIXED_PRICE_TABLE);
    persistDrafts(); persistCommitted();
    try { const response = await fetch(V2_GEOMETRY_URL); state.geometry = response.ok ? await response.json() : null; } catch { state.geometry = null; }
    if (v2PriceItemIds().length) await loadV2Prices(); else calculateIslandPlan();
    const root = document.querySelector('[data-island-planner-v2]');
    if (root && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { syncLayoutGeometry(root); syncOverlayGeometry(root); }).observe(root);
    bindLivePrices(() => ({
        items: v2PriceItemIds(),
        cities: v2PriceCities(),
        pause: state.priceLoading
    }), () => { void loadV2Prices(); });
}
init();
