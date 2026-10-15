import { paginationHtml } from '../components/pagination.js';
import { cityNameHtml, cityDataKey } from '../components/city-name.js';
import { viewSwitchToolbarHtml, bindViewSwitch, sortChoicesHtml } from '../components/view-switch.js';
import { toolPageHtml } from '../core/app-runtime.js';
import { durableStorage, reloadDurableStorage, saveDurableChanges } from '../core/durable-storage.mjs';
import { refreshPotentialPrices } from '../core/potential-price-refresh.js';
import { getServer } from '../core/settings.js';
import { potentialDecisionRows, POTENTIAL_SNAPSHOT_KEY } from '../core/potential-price-snapshot.mjs';
import { SALE_HORIZONS } from '../core/potential-sale-horizon.mjs';
import { POTENTIAL_FILTERS, POTENTIAL_SORTS, potentialDefaults, potentialPreferences, filterPotentialRows, potentialTone, potentialFilterValue } from '../core/potential-price-view.mjs';
import { itemNameHtml } from '../components/item-name.js';
import { itemIconHtml, itemLabel, itemTierBadgeHtml } from '../components/item-icon.js';
import { cityBadgeHtml } from '../components/city-badge.js';
import { cityFilterFieldHtml, bindCityField } from '../components/city-picker.js';
import { fieldHeadingHtml, filterChoiceFieldHtml } from '../components/form-field.js';
import { initFloatingLabels } from '../components/forms.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { escapeHtml as esc } from '../utils/utils.js';
import { routeHref } from '../core/routes.js';

const root = document.querySelector('[data-tool="potential-prices"]');
const PREFERENCES_KEY = 'albiontools.v4.potential-prices.preferences';
function readPreferences() {
    try { return potentialPreferences(JSON.parse(durableStorage.getItem(PREFERENCES_KEY))); }
    catch { return potentialDefaults(); }
}
const state = readPreferences();
function savePreferences() {
    durableStorage.setItem(PREFERENCES_KEY, JSON.stringify(state));
}
const PAGE_SIZE = 50;
let rows = [], busy = false, loadError = '';
const money = value => Number.isFinite(value) ? value.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—';
const time = value => Number.isFinite(Date.parse(value)) ? `<time datetime="${esc(value)}">${esc(new Date(value).toLocaleString('tr-TR'))}</time>` : '—';
const badge = (text, tone = 'secondary', title = '') => `<span class="badge bg-${tone}"${title ? ` data-app-tooltip="${esc(title)}" tabindex="0"` : ''}>${esc(text)}</span>`;
const label = (key, value) => key === 'tier' ? `T${value}` : key === 'enchant' ? `.${value}` : key === 'days' ? `${value} gün` : key === 'quality' ? `Kalite ${value}` : value;
function choices(key, caption, options) {
    if (options.some(([value]) => value === '')) return filterChoiceFieldHtml({ label: caption, selected: state[key], allValue: '', options: options.map(([value, label]) => ({ value, label })), attributes: value => `data-filter="${key}" data-value="${esc(value)}"` });
    return `<div class="choice-field form-field">${fieldHeadingHtml(caption)}<div class="segmented-choice segmented-choice--dense segmented-choice--content-width" role="group" aria-label="${esc(caption)}">${options.map(([value, text]) => `<button type="button" class="segmented-choice-button segmented-choice-button--compact${state[key] === String(value) ? ' is-active' : ''}" data-filter="${key}" data-value="${esc(value)}" aria-pressed="${state[key] === String(value)}">${esc(text)}</button>`).join('')}</div></div>`;
}
function controls() {
    const items = new Map(rows.map(row => [row.itemId, row.itemName]));
    if (state.itemId && !items.has(state.itemId)) items.set(state.itemId, itemLabel(state.itemId));
    return `<div class="form-floating"><input id="potential-price-search" type="search" class="form-control" data-filter="search" placeholder="Eşya adı / item ID" value="${esc(state.search)}"><label for="potential-price-search">Eşya adı / item ID</label></div>
        <div class="form-floating"><select id="potential-price-item" class="form-select" data-filter="itemId"><option value="">Tümü</option>${[...items].sort((a, b) => a[1].localeCompare(b[1], 'tr', { numeric: true })).map(([id, name]) => `<option value="${esc(id)}" data-icon="${esc(id)}"${state.itemId === id ? ' selected' : ''}>${esc(name)} (${esc(id)})</option>`).join('')}</select><label for="potential-price-item">Eşya</label></div>
        ${POTENTIAL_FILTERS.map(([key, caption]) => {
            if (key === 'days') return choices(key, caption, [['', 'Tümü'], ...SALE_HORIZONS.map(({ days, label }) => [String(days), label])]);
            const values = new Set(rows.map(row => potentialFilterValue(row, key)).filter(Boolean));
            // Keep an active filter visible when its last record disappears on reload.
            if (state[key]) values.add(state[key]);
            if (values.size <= 1 && !state[key]) return '';
            if (key === 'city') return cityFilterFieldHtml({ id: 'potential-price-city', label: caption, selected: state.city, values: [...values], className: '' });
            return choices(key, caption, [['', 'Tümü'], ...[...values].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })).map(value => [value, label(key, value)])]);
        }).join('')}
        <button type="button" class="btn btn-outline-secondary" data-reset>Filtreleri temizle</button>
        <button type="button" class="btn btn-outline-primary" data-refresh-prices${busy ? ' disabled' : ''}>${busy ? 'Güncelleniyor…' : 'Tahminleri güncelle'}</button>
        <button type="button" class="btn btn-outline-secondary" data-reload${busy ? ' disabled' : ''}>${busy ? 'Yükleniyor…' : 'Kayıtları yeniden oku'}</button>`;
}
const variation = row => `<div class="potential-price-badges">${cityBadgeHtml(row.city)}${badge(row.server)}${badge(row.side, row.side === 'BUY' ? 'primary' : 'info')}${badge(`Kalite ${row.quality}`)}${row.days == null ? '' : badge(`${row.days} gün`)}</div>`;
const identity = row => `<div class="potential-price-item">${itemIconHtml(row.itemId, { visual: true })}<div>${itemNameHtml(row.itemName)}<div>${itemTierBadgeHtml(row.itemId)}</div></div></div>`;
const decision = row => `<div class="potential-price-badges">${badge(row.decision, potentialTone(row), row.reason)}${badge(row.status, row.status === 'Geçerli' ? 'success' : row.status === 'Düşük güven' ? 'warning' : 'secondary')}</div>`;
const details = (row, arrow = false) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-detail="${esc(row.id)}" aria-label="${esc(row.itemName)} fiyat detayları">Detay${arrow ? ' <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>' : ''}</button>`;
function cardHtml(row) {
    const tone = potentialTone(row);
    const tier = itemTierBadgeHtml(row.itemId, { format: 'text' });
    return `<article class="potential-price-card" data-city="${esc(cityDataKey(row.city))}" data-price-tone="${tone}">
        <div class="potential-price-item">${itemIconHtml(row.itemId, { visual: true })}<div><h2>${itemNameHtml(row.itemName)}</h2><p>${tier ? `T${esc(tier)} · ` : ''}KALİTE ${esc(row.quality)}</p></div></div>
        ${row.days == null ? '' : `<span class="potential-price-period" aria-label="${esc(row.days)} günlük dönem">${esc(row.days)} GÜN</span>`}
        <div class="potential-price-card-market">${cityNameHtml(row.city)}<span class="potential-price-card-heading"><span>${esc(row.server)}</span><span aria-hidden="true">/</span><span>${esc(row.side)}</span></span></div>
        <div class="potential-price-value"><span>TAHMİN EDİLEN FİYAT</span><strong>${money(row.price)}</strong><span class="potential-price-status" data-status="${esc(row.status)}" aria-description="${esc(`${row.decision}: ${row.reason}`)}" data-app-tooltip="Karar durumu" tabindex="0">${esc(row.status || '—')}</span></div>
        ${details(row, true)}
    </article>`;
}
function sortingHtml() {
    const attrs = key => value => `data-filter="${key}" data-value="${esc(value)}"`;
    const icons = { savedAt: 'time', itemName: 'name', price: 'value', days: 'time' };
    return sortChoicesHtml(POTENTIAL_SORTS.map(([id, label]) => ({ id, label, icon: icons[id], tooltip: id === 'price' ? 'Tahmin fiyatı' : label })), state.sort, attrs('sort'))
        + sortChoicesHtml([{ id: 'desc', label: 'Azalan', icon: 'desc' }, { id: 'asc', label: 'Artan', icon: 'asc' }], state.direction, attrs('direction'));
}
function result() {
    const filtered = filterPotentialRows(rows, state);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const visible = filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    const content = !visible.length ? `<p class="tool-result-note">${rows.length ? 'Filtrelere uyan kayıt yok.' : 'Henüz potansiyel fiyat kaydı yok. Ada Planlayıcı V2’de potansiyel fiyatları güncellediğinizde kayıtlar burada görünür.'}</p>` : state.view === 'list'
        ? `<div class="calc-table-wrap"><table class="table table-striped calc-table market-table"><thead><tr><th>Eşya</th><th>Piyasa</th><th>Tahmin</th><th>Karar / durum</th><th>Fiyatı belirleyen</th><th>Karar zamanı</th><th>Detay</th></tr></thead><tbody>${visible.map(row => `<tr><td>${identity(row)}</td><td>${variation(row)}</td><td class="num" data-price-tone="${potentialTone(row)}">${money(row.price)}</td><td>${decision(row)}</td><td>${esc(row.basis)}</td><td>${time(row.savedAt)}</td><td>${details(row)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="potential-price-cards">${visible.map(cardHtml).join('')}</div>`;
    return `${loadError ? `<p role="alert" class="tool-result-note">${esc(loadError)} Son kaydedilen kayıtlar gösteriliyor.</p>` : ''}${viewSwitchToolbarHtml(state.view, `<p class="tool-result-note" aria-live="polite">${filtered.length} / ${rows.length} kayıt</p>`, sortingHtml(), paginationHtml(state.page, pages))}${content}<p class="tool-result-note" data-page-info>Yalnız kullanılabilir fiyatlar ada hesabına girer. Gösterge fiyatlar hesapta kullanılmaz. Zamanlar yerel saatle gösterilir. <a href="${routeHref('island-planner-v2')}">Ada Planlayıcı V2</a></p>`;
}
function preserveFocus(update) {
    const active = document.activeElement;
    const hook = root.contains(active) && [...active.attributes].find(attr => /^data-(filter|view|pagination-page|reset|reload)$/.test(attr.name));
    const value = active?.getAttribute('data-value');
    const selection = active?.tagName === 'INPUT' ? [active.selectionStart, active.selectionEnd] : null;
    update();
    if (!hook) return;
    const replacement = root.querySelector(`[${hook.name}="${CSS.escape(hook.value)}"]${value == null ? '' : `[data-value="${CSS.escape(value)}"]`}`);
    replacement?.focus({ preventScroll: true });
    if (selection && replacement?.tagName === 'INPUT') replacement.setSelectionRange(...selection);
}
function renderResult() { preserveFocus(() => { root.querySelector('.tool-split-result').innerHTML = result(); bindCalcSticky(root); bindViewSwitch(root, view => { state.view = view; renderResult(); }); }); savePreferences(); }
function render() {
    preserveFocus(() => {
    root.innerHTML = toolPageHtml({ key: 'potential-prices', head: '<header class="page-head" data-page-head="potential-prices"><h1>Potansiyel Fiyatlar</h1><p>Kaydedilmiş piyasa tahminleri ve ada planlayıcısının fiyat kararları.</p></header>', controls: controls(), result: result(),
        overlays: '<dialog class="app-dialog" data-price-dialog aria-label="Potansiyel fiyat detayı"><button class="app-dialog-close" aria-label="Kapat" data-detail-close></button><div class="app-dialog-sheet" data-detail-body></div></dialog>' });
    bindCalcSticky(root);
    initFloatingLabels(root); bindViewSwitch(root, view => { state.view = view; renderResult(); });
    bindCityField(root, 'potential-price-city', value => { state.city = value; state.page = 1; renderResult(); }, { syncPeers: false });
    });
    savePreferences();
}
function readRows() { rows = filterPotentialRows(potentialDecisionRows(durableStorage, id => itemLabel(id)), potentialDefaults()); }
root.addEventListener('input', event => {
    if (!event.target.matches('input[data-filter="search"]')) return;
    state.search = event.target.value; state.page = 1; renderResult();
});
root.addEventListener('change', event => {
    if (!event.target.matches('select[data-filter="itemId"]')) return;
    state.itemId = event.target.value; state.page = 1; renderResult();
});
root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-filter')) {
        const key = button.dataset.filter;
        state[key] = button.dataset.value;
        if (key !== 'view') state.page = 1;
        render();
    }
    if (button.hasAttribute('data-pagination-page') && !button.disabled) { state.page = Number(button.dataset.paginationPage); renderResult(); }
    if (button.hasAttribute('data-reset')) { Object.assign(state, potentialDefaults(), { view: state.view }); render(); }
    if (button.hasAttribute('data-detail-close')) root.querySelector('[data-price-dialog]').close();
    if (button.hasAttribute('data-detail')) {
        const row = rows.find(row => row.id === button.dataset.detail);
        if (!row) return;
        const fields = [['Fiyatı belirleyen', row.basis], ['Karar nedeni', row.reason], ['Kaynak', row.source], ['Yöntem', row.method], ['Güven', row.confidence], ['İşlemli gün', row.samples], ['Geçmiş dönem', row.historicalWindows], ['Dönem fiyatı', money(row.periodPrice)], ['Yakın dönem fiyatı', money(row.recentPrice)], ['Sell emir adayı', money(row.currentOrder)], ['Gösterge fiyatı (hesapta kullanılmaz)', money(row.indicativePrice)]];
        root.querySelector('[data-detail-body]').innerHTML = `${identity(row)}${variation(row)}${decision(row)}<dl class="potential-price-details">${fields.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value ?? '—')}</dd>`).join('')}${[['Karar zamanı', row.savedAt], ['Son işlem günü', row.latest], ['Geçerlilik sonu', row.validUntil]].map(([name, value]) => `<dt>${name}</dt><dd>${time(value)}</dd>`).join('')}</dl>`;
        root.querySelector('[data-price-dialog]').showModal();
    }
    if (button.hasAttribute('data-refresh-prices') && !busy) {
        busy = true; loadError = ''; render();
        try {
            await reloadDurableStorage(); readRows();
            const candidates = filterPotentialRows(rows, state);
            if (!candidates.length) throw new Error('Güncellenecek kayıt yok. Filtreleri kontrol edin.');
            if (candidates.some(row => row.server !== getServer().id)) throw new Error('Seçili sunucuya ait kayıtları filtreleyin; diğer sunucuların tahminleri ayrı güncellenir.');
            const requests = candidates.map(row => ({ server: row.server, city: row.city, itemId: row.itemId, quality: row.quality, side: row.side.toLowerCase() }));
            // Publish the new projection only after SQLite confirms the write.
            const changes = new Map();
            const storage = { getItem: key => changes.get(key) ?? durableStorage.getItem(key), setItem: (key, value) => changes.set(key, value) };
            await refreshPotentialPrices(requests, { storage, days: Number(state.days) || SALE_HORIZONS[0].days });
            await saveDurableChanges(new Map([[POTENTIAL_SNAPSHOT_KEY, changes.get(POTENTIAL_SNAPSHOT_KEY)]]));
            readRows();
        } catch (error) { loadError = `Tahminler güncellenemedi: ${error.message}`; }
        finally { busy = false; render(); }
    }
    if (button.hasAttribute('data-reload') && !busy) {
        busy = true; button.disabled = true; button.textContent = 'Yükleniyor…';
        try { await reloadDurableStorage(); readRows(); loadError = ''; render(); }
        catch (error) { loadError = `Kayıtlar okunamadı: ${error.message}`; renderResult(); }
        finally {
            busy = false;
            const reload = root.querySelector('[data-reload]');
            reload.disabled = false; reload.textContent = 'Kayıtları yeniden oku';
        }
    }
});
readRows(); render();
function refreshVisibleRows() {
    if (document.hidden || busy || root.querySelector('[data-price-dialog]').open) return;
    readRows();
    preserveFocus(() => { root.querySelector('.tool-split-controls').innerHTML = controls(); initFloatingLabels(root); renderResult(); });
}
document.addEventListener('visibilitychange', refreshVisibleRows);
setInterval(refreshVisibleRows, 60000);
