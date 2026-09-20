import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getSettings, getDefaultCity } from './settings.js';
import { loadActiveCities } from './cities.js';
import { getPlants, getAnimals } from './catalog.js';
import { getItemUniqueName } from './db/relations.js';
import { itemIconHtml } from './item-icon.js';
import { V2_CITIES, V2_COMMITTED_STORAGE_KEY, V2_GEOMETRY_URL, V2_ROYAL_CITIES, V2_SPECIAL_CITY_GEOMETRY, V2_STORAGE_KEY, V2_UNLOCKED_SLOTS_BY_LEVEL } from './island-planner-v2-config.js';

const OVERLAY_DEBUG = new URLSearchParams(location.search).has('islandOverlayDebug');
const state = { cities: [], geometry: null, selectedSlotId: 'R1', hoveredSlotId: null, toolbar: { stage: 'type', type: null, tier: null, item: null }, draft: null, committed: null, derived: { slots: new Map(), summary: null }, calculationTimer: null, overlayDebugSignature: null };

function blankSlot(id) { return { id, item: null, focus: false, productionMode: 'balanced' }; }
function defaultDraft() { return { premium: getSettings().premium !== false, focus: false, islandCity: getDefaultCity(), sellCity: getDefaultCity(), islandLevel: 6, seedSide: 'buy', harvestSide: 'sell', slots: Array.from({ length: 16 }, (_, i) => blankSlot(`R${i + 1}`)), pricesUpdatedAt: null }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function read(key) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ } }
function slot(id) { return state.draft.slots.find((entry) => entry.id === id) ?? null; }
function cityKey(value) { return String(value || '').toLowerCase().replace(/[\s-]+/g, '_'); }
function cityName(value) { return state.cities.find((city) => city.marketApiName === value)?.displayName ?? value; }
function cityImage(value) { return `assets/island-planner-v2/city-buttons/${cityKey(value)}.png`; }
function islandImage(value) { return `assets/island-planner-v2/islands/${cityKey(value)}.png`; }
function geometryForCity() { return V2_ROYAL_CITIES.has(cityKey(state.draft.islandCity)) ? state.geometry?.slots ?? null : V2_SPECIAL_CITY_GEOMETRY[cityKey(state.draft.islandCity)] ?? null; }
function displayedSlot() { return state.hoveredSlotId ? slot(state.hoveredSlotId) : slot(state.selectedSlotId); }
function isEditableDetail() { return !state.hoveredSlotId || state.hoveredSlotId === state.selectedSlotId; }
function itemRows() { return [...getPlants(), ...getAnimals()]; }
function itemForSlot(entry) { return entry?.item ? itemRows().find((item) => item.key === entry.item) ?? null : null; }
function itemUniqueName(item) { return getItemUniqueName(item?.plantItemId ?? item?.grownItemId); }
function itemName(item) { return item?.label || item?.key || '—'; }
function itemCategory(item) { return ({ crop: 'Sebze', herb: 'Ot', livestock: 'Hayvan', mount: 'Binek', 'faction-mount': 'Faction Bineği' })[item?.kind] ?? typeLabel(item?.plotType); }
function hasCityBonus(item) { return Array.isArray(item?.bonusCities) && item.bonusCities.includes(state.draft.islandCity); }
function seedPreviewSlots(draft) {
    if (draft.uiPreviewSeeded) return;
    const candidates = ['carrot', 'turnip', 'sheep'].map((key) => itemRows().find((item) => item.key === key)).filter(Boolean);
    candidates.forEach((item, index) => {
        const entry = draft.slots[index];
        if (entry && !entry.item) {
            entry.item = item.key;
            entry.focus = index !== 1;
            entry.productionMode = index === 0 ? 'product' : (index === 1 ? 'seed' : 'balanced');
        }
    });
    draft.uiPreviewSeeded = true;
}
function priceText() { return state.draft.pricesUpdatedAt ? new Date(state.draft.pricesUpdatedAt).toLocaleString('tr-TR') : 'Fiyat verisi henüz yenilenmedi'; }
function typeLabel(type) { return ({ farm: 'Tarla', herb: 'Ot', pasture: 'Mera', kennel: 'Kennel', house: 'Ev' })[type] ?? type; }
function renderToolbar() {
    const current = state.toolbar;
    let choices = '';
    const back = current.stage === 'type' ? '' : '<button type="button" class="island-v2-toolbar-back" data-v2-toolbar-back aria-label="Geri" title="Geri">‹</button>';
    if (current.stage === 'type') choices = ['farm', 'herb', 'pasture', 'kennel', 'house'].map((type) => `<button type="button" class="island-v2-toolbar-type island-planner-type--${type}" data-v2-toolbar-type="${type}" title="${typeLabel(type)}">${typeLabel(type)}</button>`).join('');
    if (current.stage === 'tier') choices = Array.from({ length: 8 }, (_, i) => `<button type="button" class="island-v2-toolbar-tier is-item-tier-${i + 1}" data-v2-toolbar-tier="${i + 1}" title="Tier ${i + 1}">T${i + 1}</button>`).join('');
    if (current.stage === 'item') choices = itemRows().filter((item) => item.plotType === current.type && item.tier === current.tier).map((item) => `<button type="button" class="island-v2-toolbar-item is-item-tier-${item.tier}" data-v2-toolbar-item="${escapeHtml(item.key)}" title="${escapeHtml(itemName(item))}">${itemIconHtml(itemUniqueName(item), { size: 24 })}</button>`).join('') || '<span>Bu seçim için item bulunamadı.</span>';
    if (current.stage === 'assign') {
        const item = itemRows().find((entry) => entry.key === current.item);
        choices = item ? `<span class="island-v2-toolbar-picked is-item-tier-${item.tier}">${itemIconHtml(itemUniqueName(item), { size: 24 })}</span><button type="button" class="island-v2-toolbar-assign is-item-tier-${item.tier}" data-v2-assign title="Seçili slota ata">Atama</button>` : '';
    }
    return `<div class="island-v2-toolbar">${back}<div class="island-v2-toolbar-choices">${choices}</div></div>`;
}

export function calculateIslandPlan() {
    // V2 owns this entry point. Values remain non-definitive until its price/resource adapter is supplied.
    const slots = new Map();
    for (const entry of state.draft.slots) slots.set(entry.id, { income: null, expense: null, net: null, focus: null, priceState: entry.item ? 'missing' : 'empty' });
    state.derived = { slots, summary: { net: null, income: null, expense: null, focus: null, internal: null, market: null, surplus: null, feed: null, missing: 0, stale: 0 } };
    render();
}
function scheduleCalculation() { clearTimeout(state.calculationTimer); state.calculationTimer = setTimeout(calculateIslandPlan, 125); save(V2_STORAGE_KEY, state.draft); }

function renderSegment(label, values, current, attr) { return `<div><p class="island-v2-group-label">${label}</p><div class="island-v2-segment">${values.map(([value, text]) => `<button type="button" data-v2-${attr}="${value}" class="${String(value) === String(current) ? 'is-active' : ''}">${text}</button>`).join('')}</div></div>`; }
function renderCities(label, current, attr) { const cities = state.cities.filter((city) => V2_CITIES.includes(cityKey(city.marketApiName))); return `<div><p class="island-v2-group-label">${label}</p><div class="island-v2-city-list">${cities.map((city) => `<button type="button" class="island-v2-city ${city.marketApiName === current ? 'is-active' : ''}" data-v2-${attr}="${escapeHtml(city.marketApiName)}" title="${escapeHtml(city.displayName)}"><img src="${cityImage(city.marketApiName)}" alt="${escapeHtml(city.displayName)}"></button>`).join('')}</div></div>`; }
function renderControls() { const d = state.draft; const plots = V2_UNLOCKED_SLOTS_BY_LEVEL?.[d.islandLevel]?.length; return `<aside class="island-v2-controls">${renderSegment('PREMIUM', [['1','Premium'],['0','Free']], d.premium ? '1' : '0', 'premium')}${renderSegment('FOCUS', [['1','Focus'],['0','Yok']], d.focus ? '1' : '0', 'focus')}${renderCities('ADA ŞEHRİ',d.islandCity,'island-city')}${renderCities('SATIŞ ŞEHRİ',d.sellCity,'sell-city')}${renderSegment('ADA SEVİYESİ',[[2,'L2'],[3,'L3'],[4,'L4'],[5,'L5'],[6,'L6']],d.islandLevel,'level')}<p class="island-v2-price-time">${plots == null ? 'Plot slot eşlemesi: TODO' : `${plots} plot`}</p>${renderSegment('Tohum',[['buy','Buy'],['sell','Sell']],d.seedSide,'seed')}${renderSegment('Hasat',[['buy','Buy'],['sell','Sell']],d.harvestSide,'harvest')}<div class="island-v2-actions"><button class="btn btn-primary" type="button" data-v2-save>Kaydet</button><button class="btn btn-outline-secondary" type="button" data-v2-revert>Kaydedilmiş Haline Dön</button><button class="btn btn-outline-secondary" type="button" data-v2-prices>Fiyatları Yenile</button><p class="island-v2-price-time">${escapeHtml(priceText())}</p></div></aside>`; }
function renderIsland() { const points = geometryForCity(); const d = state.draft; const overlays = points ? `<div class="island-v2-overlay-layer" data-v2-overlay-layer>${d.slots.map((entry) => { const p = points[entry.id]; if (!p) return ''; const item = itemForSlot(entry); const active = entry.id === state.selectedSlotId; const hover = entry.id === state.hoveredSlotId; const debug = OVERLAY_DEBUG && ['R1','R10','R16'].includes(entry.id) ? ' is-debug' : ''; return `<div class="island-v2-slot-anchor${debug}" data-v2-overlay-anchor="${entry.id}" data-v2-x="${p.x}" data-v2-y="${p.y}"><button type="button" draggable="${item ? 'true' : 'false'}" class="island-v2-overlay ${item ? 'is-filled' : 'is-empty'} ${active ? 'is-selected' : ''} ${hover ? 'is-hovered' : ''}" data-v2-slot="${entry.id}">${item ? itemIconHtml(itemUniqueName(item), { size: 30, className: 'island-v2-overlay-icon' }) : ''}</button><span class="island-v2-overlay-number">${entry.id.slice(1).padStart(2,'0')}</span></div>`; }).join('')}</div>` : `<div class="island-v2-unresolved">${cityKey(d.islandCity) === 'brecilien' ? 'Brecilien slot koordinatları yapılandırılmayı bekliyor.' : 'Caerleon slot koordinatları yapılandırılmayı bekliyor.'}</div>`; return `<section class="island-v2-island"><img class="island-v2-island-image" src="${islandImage(d.islandCity)}" alt="${escapeHtml(cityName(d.islandCity))} adası">${overlays}${renderToolbar()}</section>`; }
function renderCards() { return `<section class="island-v2-slot-grid">${state.draft.slots.map((entry) => { const item = itemForSlot(entry); const selected = entry.id === state.selectedSlotId; const hovered = entry.id === state.hoveredSlotId; const number = entry.id.slice(1).padStart(2,'0'); if (!item) return `<button type="button" class="island-v2-card is-empty ${selected ? 'is-selected' : ''} ${hovered ? 'is-hovered' : ''}" data-v2-slot="${entry.id}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span></span><span class="island-v2-card-empty"><b>+</b><span>Plot Seçin</span><small>Atama için seçin</small></span></button>`; const icon = itemIconHtml(itemUniqueName(item), { size: 42, className: 'island-v2-card-icon' }); const bonus = hasCityBonus(item) ? '<i class="island-v2-card-city-bonus" title="Şehir Bonusu +10%"></i>' : ''; return `<button type="button" class="island-v2-card ${selected ? 'is-selected' : ''} ${hovered ? 'is-hovered' : ''}" data-v2-slot="${entry.id}"><span class="island-v2-card-head"><span class="island-v2-slot-number">${number}</span><i class="island-v2-focus-dot ${entry.focus ? 'is-on' : ''}"></i><span class="island-v2-card-tier-stack"><span class="island-v2-tier">T${item.tier}</span>${bonus}</span></span><span class="island-v2-card-item">${icon}<span>${escapeHtml(itemName(item))}</span></span><span class="island-v2-finance"><span><b>+</b>—</span><em>—</em><span>—<b>−</b></span></span><span class="island-v2-net">—</span></button>`; }).join('')}</section>`; }
function detailRow(label, value = '—') { return `<span><small>${label}</small><b>${value}</b></span>`; }
function renderDetail() { const entry = displayedSlot(); const item = itemForSlot(entry); const editable = isEditableDetail(); const disabled = editable && item ? '' : ' disabled'; const name = item ? escapeHtml(itemName(item)) : 'Plot seçilmedi'; const meta = item ? `T${item.tier} · ${escapeHtml(itemCategory(item))}` : 'Toolbar ile atama yapın.'; const bonus = item && hasCityBonus(item) ? '<i class="island-v2-city-bonus" title="Şehir Bonusu +10%"></i>' : ''; const modes = [['product','Tam Ürün'],['seed','Tohum'],['balanced','Denge']].map(([value,label]) => `<button type="button" data-v2-production-mode="${value}" class="${entry.productionMode === value ? 'is-active' : ''}"${disabled}>${label}</button>`).join(''); return `<section class="island-v2-detail"><strong class="island-v2-detail-number">${entry.id.slice(1).padStart(2,'0')}</strong><div class="island-v2-detail-main">${item ? itemIconHtml(itemUniqueName(item), { size: 40, className: 'island-v2-detail-icon' }) : ''}<div><h2>${name}</h2><p>${meta} ${bonus}</p></div></div><div class="island-v2-detail-controls"><button type="button" data-v2-slot-focus class="island-v2-focus-toggle ${entry.focus ? 'is-active' : ''}" aria-pressed="${entry.focus ? 'true' : 'false'}"${disabled}>Focus</button><span class="island-v2-production-mode">${modes}</span></div><div class="island-v2-kpis">${detailRow('Kâr / Gün')}${detailRow('Gelir / Gün')}${detailRow('Gider / Gün')}${detailRow('Focus / Gün')}</div><div class="island-v2-detail-list"><p><b>ÜRETİM BİLGİLERİ</b>${detailRow('Günlük Çıktı')}${detailRow('Büyüme Süresi')}${detailRow('RR / Geri Dönüş')}${detailRow('Net Çıktı')}${detailRow('Veri Kaynağı')}</p><p><b>EKONOMİ / TEDARİK</b>${detailRow('Tohum / Yavru Alış')}${detailRow('Günlük Net Giriş')}${detailRow('Satış Fiyatı')}${detailRow('İçeriden Karşılanan')}${detailRow('Marketten Alınan')}${detailRow('Fiyat Durumu','Eksik')}</p></div></section>`; }
function metric(label, value = '—') { return `<div class="island-v2-metric"><span>${label}</span><strong>${value}</strong></div>`; }
function renderSummary() { return `<section class="island-v2-summary"><div class="island-v2-summary-title"><strong>05</strong><span>Ada Özeti</span><span>${escapeHtml(cityName(state.draft.islandCity))} · Seviye ${state.draft.islandLevel}</span></div>${metric('Net Kâr / Gün')}${metric('Gelir')}${metric('Gider')}${metric('Focus / Gün')}${metric('İçeriden')}${metric('Marketten')}${metric('Satışa Kalan')}${metric('Yem')}${metric('Fiyat','Veri bekliyor')}</section>`; }
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
function render() { const root = document.querySelector('[data-island-planner-v2]'); if (!root) return; root.innerHTML = `<div class="island-v2-page"><div class="island-v2-layout">${renderControls()}${renderIsland()}<div class="island-v2-right">${renderCards()}${renderDetail()}</div>${renderSummary()}</div></div>`; syncLayoutGeometry(root); const image = root.querySelector('.island-v2-island-image'); if (image?.complete) syncOverlayGeometry(root); else image?.addEventListener('load', () => syncOverlayGeometry(root), { once: true }); bind(root); }
function mutate(mutator, calculate = true) { mutator(); if (calculate) scheduleCalculation(); else render(); }
function bind(root) { if (root.dataset.v2Bound === '1') return; root.dataset.v2Bound = '1'; root.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; const d = button.dataset; if (d.v2Slot) { mutate(() => { state.selectedSlotId = d.v2Slot; state.toolbar.stage = 'type'; }, false); return; } if (d.v2Premium) mutate(() => { state.draft.premium = d.v2Premium === '1'; }); if (d.v2Focus) mutate(() => { state.draft.focus = d.v2Focus === '1'; }); if (d.v2IslandCity) mutate(() => { state.draft.islandCity = d.v2IslandCity; }); if (d.v2SellCity) mutate(() => { state.draft.sellCity = d.v2SellCity; }); if (d.v2Level) mutate(() => { state.draft.islandLevel = Number(d.v2Level); }); if (d.v2Seed) mutate(() => { state.draft.seedSide = d.v2Seed; }); if (d.v2Harvest) mutate(() => { state.draft.harvestSide = d.v2Harvest; }); if ('v2ToolbarBack' in d) mutate(() => { state.toolbar.stage = ({ tier: 'type', item: 'tier', assign: 'item' })[state.toolbar.stage] ?? 'type'; }, false); if (d.v2ToolbarType) mutate(() => { state.toolbar.type = d.v2ToolbarType; state.toolbar.tier = null; state.toolbar.item = null; state.toolbar.stage = 'tier'; }, false); if (d.v2ToolbarTier) mutate(() => { state.toolbar.tier = Number(d.v2ToolbarTier); state.toolbar.item = null; state.toolbar.stage = 'item'; }, false); if (d.v2ToolbarItem) mutate(() => { state.toolbar.item = d.v2ToolbarItem; state.toolbar.stage = 'assign'; }, false); if ('v2Assign' in d && state.toolbar.item) mutate(() => { slot(state.selectedSlotId).item = state.toolbar.item; state.toolbar.stage = 'type'; }); if ('v2SlotFocus' in d && isEditableDetail()) mutate(() => { const entry = slot(state.selectedSlotId); entry.focus = !entry.focus; }); if (d.v2ProductionMode && isEditableDetail()) mutate(() => { slot(state.selectedSlotId).productionMode = d.v2ProductionMode; }); if ('v2Save' in d) { state.committed = clone(state.draft); save(V2_COMMITTED_STORAGE_KEY,state.committed); render(); } if ('v2Revert' in d && state.committed) { state.draft = clone(state.committed); scheduleCalculation(); } if ('v2Prices' in d) mutate(() => { state.draft.pricesUpdatedAt = new Date().toISOString(); }); }); root.addEventListener('pointerover',(event) => { const hit=event.target.closest('[data-v2-slot]'); if (hit && state.hoveredSlotId !== hit.dataset.v2Slot) { state.hoveredSlotId=hit.dataset.v2Slot; render(); } }); root.addEventListener('pointerout',(event) => { if (event.target.closest('[data-v2-slot]') && state.hoveredSlotId) { state.hoveredSlotId=null; render(); } }); }
async function init() { initNav(); await initStore(); state.cities = await loadActiveCities(); state.draft = read(V2_STORAGE_KEY) ?? defaultDraft(); seedPreviewSlots(state.draft); save(V2_STORAGE_KEY, state.draft); state.committed = read(V2_COMMITTED_STORAGE_KEY) ?? clone(state.draft); try { const response = await fetch(V2_GEOMETRY_URL); state.geometry = response.ok ? await response.json() : null; } catch { state.geometry = null; } calculateIslandPlan(); const root = document.querySelector('[data-island-planner-v2]'); if (root && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { syncLayoutGeometry(root); syncOverlayGeometry(root); }).observe(root); }
init();
