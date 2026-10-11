import { itemNameHtml } from '../components/item-name.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { recordCurrentToolVisit } from '../core/usage.js';
import { getSettings, getServer, SETTINGS_STORAGE_KEY } from '../core/settings.js';
import { bindLivePrices } from '../core/price-live.js';
import { decisionCatalog, decisionFees, loadDecisionQuotes, loadDecisionSeries, loadRecipeMechanics, decisionRecipeInfo } from '../core/decision-data.js';
import { decide, STATUS, DECISION_POLICY } from '../core/decision-engine.mjs';
import { toolPageHtml } from '../components/tool-page.js';
import { cityFieldHtml, bindCityField } from '../components/city-picker.js';
import { initTooltips } from '../components/tooltip.js';
import { initDialogBackdropClose } from '../components/dialog.js';
import { initFloatingLabels } from '../components/forms.js';
import { itemIconHtml, itemLabel } from '../components/item-icon.js';
import { loadDecisionIcons, decisionIcon as icon } from '../components/decision-icons.js';
import { escapeHtml as esc } from '../utils/utils.js';
import { formatSilver, formatQuantity } from '../utils/format.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { decisionHistoryHtml } from '../components/decision-history.js';

const SHORT_HELP_MAX_LENGTH = 160;
const RECENT_STORAGE_KEY = 'albiontools.v4.decision-recents';
const RECENT_LIMIT = 6;
let recent = { searches: [], items: [] };
function loadRecent() {
    try {
        const saved = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '{}');
        for (const key of ['searches', 'items']) recent[key] = Array.isArray(saved[key]) ? [...new Set(saved[key].filter(value => typeof value === 'string' && value.trim()).map(value => value.slice(0, 160)))].slice(0, RECENT_LIMIT) : [];
    } catch { /* History remains available in memory when storage is unavailable. */ }
}
function rememberRecent(key, value) {
    value = value.trim().slice(0, 160);
    if (!value) return;
    recent[key] = [value, ...recent[key].filter(entry => entry.toLocaleLowerCase('tr') !== value.toLocaleLowerCase('tr'))].slice(0, RECENT_LIMIT);
    try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent)); } catch { /* Optional local history must not block decisions. */ }
}
const LABELS = { BUY_NOW: 'Şimdi al', BUY_ORDER: 'Buy Order', CRAFT_NOW: 'Şimdi craftla', CRAFT_WITH_ORDERS: 'Malzemelere order verip craftla', SELL_NOW: 'Şimdi sat', SELL_ORDER: 'Sell Order', CRAFT_INTO: 'İleri ürüne craftla', HOLD: 'Beklet', NO_RELIABLE_DECISION: 'Güvenilir karar verilemiyor' };
const STATUS_LABEL = { [STATUS.confirmed]: 'Girdiler tam', [STATUS.order]: 'Koşullu senaryo', [STATUS.missing]: 'Hesaplanamıyor', [STATUS.na]: 'Uygulanamaz', [STATUS.anomaly]: 'Uç fiyat — inceleyin' };
const state = { itemId: '', mode: 'need', quantity: '1', urgency: 'now', city: '', limitPrice: '', outputId: '', batchYield: '', feePerBatch: '', rr: '', focus: false, focusPerBatch: '', focusSilver: '', inventory: {}, materialOrders: {}, data: null, loading: false, error: '', query: '' };
let root, catalog, request, revision = 0, debounce, seriesRequest, historyTask, series = null, seriesState = '';
const ACTIONS = { ...LABELS, BUY_NOW: 'ANINDA AL', SELL_NOW: 'ANINDA SAT', CRAFT_NOW: 'CRAFTLA', CRAFT_INTO: 'ÜST ÜRÜNE CRAFTLA' };
const numeric = value => String(value ?? '').trim() === '' ? null : Number(value);
const money = value => typeof value === 'number' && Number.isFinite(value) ? formatSilver(value) : '—';
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('tr-TR') : 'Bilinmiyor';
function field(key, label, value, { type = 'number', min = '0', step = 'any' } = {}) {
    return `<div class="form-floating"><input class="form-control" data-decision-field="${esc(key)}" type="${type}" ${type === 'number' ? `min="${min}" step="${step}"` : ''} value="${esc(String(value ?? ''))}" placeholder=" " aria-label="${esc(label)}"><label>${esc(label)}</label></div>`;
}
function select(key, label, rows, value) {
    return `<div class="form-floating"><select class="form-select" data-decision-field="${esc(key)}" aria-label="${esc(label)}">${rows.map(([id, text]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select><label>${esc(label)}</label></div>`;
}
function recipe() { return catalog.byOutput.get(state.mode === 'need' ? state.itemId : state.outputId); }
function mechanics() {
    const info = decisionRecipeInfo(recipe(), state.city, state.focus);
    return { batchYield: numeric(state.batchYield) ?? info.metadata?.batchYield, feePerBatch: numeric(state.feePerBatch), baseSilverPerBatch: info.metadata?.baseSilverPerBatch, rr: numeric(state.rr) == null ? info.rr : numeric(state.rr) / 100, focus: state.focus, focusPerBatch: numeric(state.focusPerBatch), focusSilver: numeric(state.focusSilver), source: 'catalog-and-manual' };
}
function selectedItems() { return [...new Set([state.itemId, recipe()?.uniqueName, ...(recipe()?.lines.map(line => line.uniqueName) || [])].filter(Boolean))]; }
function resetCraft() {
    for (const key of ['batchYield', 'feePerBatch', 'rr', 'focusPerBatch', 'focusSilver']) state[key] = '';
    state.inventory = {}; state.materialOrders = {}; state.focus = false;
}
function itemSearch() {
    const query = state.query.trim().toLocaleLowerCase('tr');
    const matches = query ? catalog.items.filter(item => `${item.uniqueName} ${item.localizedName}`.toLocaleLowerCase('tr').includes(query)).slice(0, 40) : [];
    const itemButton = item => `<button type="button" class="decision-item ${state.itemId === item.uniqueName ? 'is-active' : ''}" aria-pressed="${state.itemId === item.uniqueName}" data-decision-item="${esc(item.uniqueName)}">${itemIconHtml(item.uniqueName, { visual: true })}<span>${itemNameHtml(item.localizedName || item.uniqueName)}<small>T${esc(item.tier)}.${esc(item.enchantment || 0)} · ${esc(item.shopSubCategory || item.itemType)}</small></span></button>`;
    const recentItems = recent.items.map(id => catalog.items.find(item => item.uniqueName === id)).filter(Boolean);
    root.querySelector('[data-decision-items]').innerHTML = query ? (matches.length ? matches.map(itemButton).join('') : '<p>Eşleşen item yok.</p>') : `<div class="decision-recents"><section><h3>Son aramalar</h3><div class="decision-recent-searches">${recent.searches.length ? recent.searches.map(search => `<button type="button" class="decision-detail-button" data-decision-recent-search="${esc(search)}">${icon('search')}${esc(search)}</button>`).join('') : '<small>Aramaların burada görünecek.</small>'}</div></section><section><h3>Son incelenen ürünler</h3>${recentItems.length ? recentItems.map(itemButton).join('') : '<small>Seçtiğin ürünler burada görünecek.</small>'}</section></div>`;
}
function craftControls() {
    const conversions = catalog.byInput.get(state.itemId) || [];
    const selected = recipe();
    const info = decisionRecipeInfo(selected, state.city, state.focus);
    return `${state.mode === 'have' ? select('outputId', 'Doğrudan üst ürün', [['', 'Üst ürün seçin'], ...conversions.slice(0, DECISION_POLICY.maxConversions).map(r => [r.uniqueName, r.label])], state.outputId) : ''}
        ${selected ? `<div class="decision-input-details">
        ${summaryRows([['Tarif', selected.label], ['Batch kaynağı', info.metadata ? 'Oyun verisi · ' + time(info.metadata.fetchedAt) : 'Doğrulanmış metadata yok']])}${summaryList(['Gerçek toplam istasyon ücretini gir; boş alan sıfır sayılmaz.'], 'decision-warning')}
        ${field('batchYield', info.metadata?.batchYield ? 'Batch üretim (oyun verisi; değişiklik manuel)' : 'Bir batch üretim adedi (manuel)', state.batchYield || info.metadata?.batchYield, { min: '1', step: '1' })}
        ${field('feePerBatch', 'Toplam istasyon + oyun ücreti / batch (manuel)', state.feePerBatch)}
        ${summaryList(['Sabit oyun ücreti / batch: ' + money(info.metadata?.baseSilverPerBatch) + ' · toplam istasyon ücretine dahil et.'], 'decision-warning')}
        ${field('rr', info.rr == null ? 'Geri dönüş % (manuel)' : 'Geri dönüş % (ortak bonus motoru; değişiklik manuel)', state.rr || (info.rr == null ? '' : info.rr * 100))}
        <label class="decision-check"><input type="checkbox" data-decision-focus ${state.focus ? 'checked' : ''}> Focus kullan</label>
        ${field('focusPerBatch', 'Focus / batch (manuel)', state.focusPerBatch)}${field('focusSilver', 'Gümüş / focus fırsat maliyeti (manuel)', state.focusSilver)}
        ${summaryRows([['İstasyon / bonus şehri', info.family ? info.family.vendor + ' · ' + info.family.cityLabel : 'Metadata eksik'], ['Günlük bonus', info.dailyKnown ? 'Kayıt mevcut' : 'Doğrulanmadı', info.dailyKnown ? 'decision-saving' : 'decision-warning'], ['Base focus / batch', money(info.metadata?.baseFocusPerBatch)]])}
        ${summaryList(['RR otomatik çözülemiyorsa oyundaki gerçek oranı gir.', 'Focus: uzmanlık sonrası gerçek tüketim ve fırsat bedeli.', 'Journal / yan ürün geliri dahil değil.'], 'decision-warning')}
        ${selected.lines.map(line => `<div class="decision-material"><strong>${itemNameHtml(itemLabel(line.uniqueName))}</strong><small>${formatQuantity(line.qty)} / batch · ${line.appliesRr ? 'RR uygulanır' : 'RR yok'}</small>
            ${state.mode === 'need' ? field(`inventory:${line.uniqueName}`, 'Envanter adedi', state.inventory[line.uniqueName] ?? '', { step: '1' }) : ''}
            ${state.mode === 'need' ? field(`order:${line.uniqueName}`, 'Malzeme order limiti (manuel, opsiyonel)', state.materialOrders[line.uniqueName] ?? '') : ''}</div>`).join('')}
        <button type="button" class="btn btn-secondary" data-decision-reset-craft>Manuel craft girdilerini temizle</button></div>` : `<p>${state.itemId ? 'Seçili ürün için doğrudan tarif seçilmedi / bulunamadı.' : 'Tarif için item seçin.'}</p>`}`;
}
function renderShell() {
    root.innerHTML = toolPageHtml({ key: 'decision-engine', head: `<section class="page-head" data-page-head="decision-engine"><h1>Karar Motoru</h1><p>Ne yapmalıyım, neden, hangi varsayımla?</p></section>`,
        controls: `<h2>${icon('search')} Ürün seçimi</h2>${field('query', 'Ürün adı veya kodu ara', state.query, { type: 'search' })}<div data-decision-items class="decision-items"></div>`,
        resultClass: 'decision-result', result: `<div class="decision-strip tool-split-controls"><div data-decision-selected></div><div class="decision-modes" role="group" aria-label="Karar modu">${['need', 'have'].map(mode => `<button type="button" class="btn btn-secondary ${mode === state.mode ? 'is-active' : ''}" data-decision-mode="${mode}" aria-pressed="${mode === state.mode}">${icon(mode)}<span>${mode === 'need' ? 'İhtiyacım var' : 'Elimde var'}<small>${mode === 'need' ? 'Buy / Craft' : 'Sell / Craft Into'}</small></span></button>`).join('')}</div>
        <div class="decision-basic-fields">${field('quantity', 'Miktar', state.quantity, { min: '1', step: '1' })}${select('urgency', 'Hedef zaman', [['now', 'Şimdi'], ['today', 'Bugün'], ['later', 'Acil değil']], state.urgency)}</div>
        <div class="decision-city-actions">${cityFieldHtml({ id: 'decision-city', label: 'Şehir', selected: state.city, style: 'crests', className: 'farming-city-field city-field--inline' })}<button type="button" class="btn btn-secondary" data-decision-refresh><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M19 16a7 7 0 0 1-12 3l-3-3"/></svg>Yenile</button></div></div>
        <button type="button" class="decision-settings btn btn-secondary" data-decision-popup="settings">${icon('info')} Hesaplama Ayarları <small>Order · istasyon · RR · focus</small></button>
        <div data-decision-output aria-live="polite"></div>`, overlays: `<dialog class="app-dialog decision-dialog" data-decision-settings-dialog aria-label="Hesaplama ayarları"><button type="button" class="app-dialog-close" aria-label="Kapat" data-decision-close="settings"></button><div class="decision-dialog-sheet"><h2>Hesaplama Ayarları</h2><div class="decision-settings-body tool-split-controls">${field('limitPrice', state.mode === 'need' ? 'Buy Order limit fiyatı (manuel)' : 'Sell Order limit fiyatı (manuel)', state.limitPrice)}<div data-decision-craft-controls>${craftControls()}</div></div></div></dialog><dialog class="app-dialog decision-dialog" data-decision-dialog aria-label="Karar ayrıntıları"><button type="button" class="app-dialog-close" aria-label="Kapat" data-decision-close="info"></button><div class="decision-dialog-sheet" data-decision-dialog-body></div></dialog>` });
    bindCityField(root, 'decision-city', city => { state.city = city; resetCraft(); refreshCraft(); void reload(); });
    initFloatingLabels(root); itemSearch(); renderResult();
}
function refreshCraft() {
    root.querySelector('[data-decision-craft-controls]').innerHTML = craftControls(); initFloatingLabels(root);
}
function runDecision() {
    const quotes = state.data?.quotes || {};
    return decide({ mode: state.mode, itemId: state.itemId, quantity: numeric(state.quantity), urgency: state.urgency, city: state.city, quotes, fees: decisionFees(), recipe: recipe(), mechanics: mechanics(), limitPrice: numeric(state.limitPrice),
        inventory: Object.fromEntries(Object.entries(state.inventory).map(([key, value]) => [key, numeric(value)])), materialOrders: Object.fromEntries(Object.entries(state.materialOrders).map(([key, value]) => [key, numeric(value)])),
        conversionAvailable: Boolean(catalog.byInput.get(state.itemId)?.length), conversions: state.mode === 'have' && recipe() ? [{ recipe: recipe(), mechanics: mechanics() }] : [] });
}
function waitLabel(option) {
    if (option.status === STATUS.order) return 'Dolum bilinmiyor';
    if (option.status !== STATUS.confirmed) return 'Bilinmiyor';
    return option.id.startsWith('CRAFT') ? 'Üretim süresi bilinmiyor' : 'Anlık teklif';
}
function breakdownHtml(option) {
    return `<button type="button" class="decision-row-detail" aria-label="${esc(LABELS[option.id])}: hesap dökümü" data-app-tooltip="Hesap dökümünü aç" data-decision-popup="option:${esc(option.id)}">${icon('info')}</button>`;
}
function summaryRows(rows) {
    return `<dl class="decision-summary-values">${rows.map(([label, value, tone = '']) => `<dt>${esc(label)}</dt><dd class="${tone}">${esc(value)}</dd>`).join('')}</dl>`;
}
function summaryList(rows, tone = '') {
    return `<ul class="decision-summary-list ${tone}">${rows.filter(Boolean).map(row => `<li>${icon('info')}<span>${esc(row)}</span></li>`).join('')}</ul>`;
}
function optionDetails(option) {
    if (!option) return '<h2>Hesap dökümü</h2><span class="decision-warning">Seçenek henüz hesaplanmadı.</span>';
    return `<h2>${esc(LABELS[option.id])}</h2>${summaryRows([['Durum', STATUS_LABEL[option.status], option.status === STATUS.confirmed ? 'decision-saving' : 'decision-warning'], ['Toplam', money(option.total)], ['Formül', option.formula || '—']])}${summaryList(option.reasons, option.status === STATUS.confirmed ? '' : 'decision-warning')}${option.batches ? summaryRows([['Batch / üretim', formatQuantity(option.batches) + ' / ' + formatQuantity(option.outputQuantity)], ['İstasyon', money(option.fee)], ['Focus', money(option.focusCost)], ['Envanter fırsatı', money(option.opportunity)], ['Koşullu geri dönüş', money(option.returns), 'decision-warning'], ['Koşullu efektif maliyet', money(option.conditionalTotal), 'decision-warning']]) + summaryList(['Fazla üretim geliri maliyetten düşülmez.']) : ''}`;
}
function alternativesHtml(decision) {
    const baseline = decision?.options.find(option => option.id === (state.mode === 'need' ? 'BUY_NOW' : 'SELL_NOW') && option.status === STATUS.confirmed);
    return `<section class="decision-alternatives"><h2>Alternatifler</h2><div class="calc-table-wrap decision-comparison"><table class="table calc-table"><thead><tr><th>Seçenek</th><th>${state.mode === 'need' ? 'Toplam maliyet' : 'Net gelir'}<small>${state.itemId ? `${formatQuantity(numeric(state.quantity))} adet` : '—'}</small></th><th>Anlık işleme<br>göre fark</th><th>Süre / bekleme</th><th>Güven</th><th>Kısa yorum</th></tr></thead><tbody>${decision?.options.length ? decision.options.map(option => {
        const delta = baseline && Number.isFinite(option.total) ? option.total - baseline.total : null;
        const advantageous = delta != null && (state.mode === 'need' ? delta < 0 : delta > 0);
        const percentage = delta != null && baseline.total > 0 ? delta / baseline.total * 100 : null;
        const tone = option.status === STATUS.anomaly ? 'decision-anomalous' : option.status === STATUS.order ? 'decision-conditional' : option.status === STATUS.missing || option.status === STATUS.na ? 'decision-unavailable' : '';
        return `<tr class="${option === decision.best ? 'is-primary' : ''} ${tone}"><td><div class="decision-option">${icon(option.id) || icon(state.mode === 'need' ? 'need' : 'have')}<span>${esc(LABELS[option.id])}${option.outputId ? `<small>${itemNameHtml(itemLabel(option.outputId))}</small>` : ''}</span></div></td><td class="decision-numeric">${money(option.total)}</td><td class="decision-numeric ${advantageous && option.status === STATUS.confirmed ? 'decision-saving' : ''}">${delta == null ? '—' : `${delta > 0 ? '+' : ''}${money(delta)}`}${percentage == null ? '' : `<small>${formatQuantity(percentage)}%${option.status === STATUS.order ? ' · koşullu' : ''}</small>`}</td><td>${esc(waitLabel(option))}</td><td>${esc(STATUS_LABEL[option.status])}</td><td><p>${esc(option.reasons[0] || '')}</p>${breakdownHtml(option)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="decision-table-empty">Ürün seçildiğinde uygulanabilir yollar burada görünür.</td></tr>'}</tbody></table></div></section>`;
}
function materialHtml(decision) {
    const craft = decision?.options.find(option => ['CRAFT_NOW', 'CRAFT_INTO'].includes(option.id));
    const computed = Boolean(craft?.materials?.length);
    const materials = computed ? craft.materials : recipe()?.lines.map(line => ({ itemId: line.uniqueName, qty: line.qty }));
    if (!materials?.length) return `<p class="decision-panel-empty">${state.itemId ? 'Seçili ürün için tarif bulunamadı / seçilmedi.' : 'Malzeme analizi için ürün seç.'}</p>`;
    return `<div class="decision-analysis-scroll"><table class="table calc-table"><thead><tr><th>Malzeme</th><th>${computed ? 'Adet' : 'Adet / batch'}</th><th>Fiyat / adet</th><th>Toplam</th></tr></thead><tbody>${materials.map(material => {
        const quote = state.data?.quotes[material.itemId]?.sell;
        const price = quote?.status === STATUS.confirmed ? quote.price : null;
        const total = Number.isFinite(material.purchase) && Number.isFinite(material.opportunity) ? material.purchase + material.opportunity : null;
        return `<tr><td><div class="decision-material-name">${itemIconHtml(material.itemId, { visual: true })}<span>${itemNameHtml(itemLabel(material.itemId))}</span></div></td><td>${formatQuantity(material.qty)}</td><td>${money(price)}</td><td>${money(total)}</td></tr>`;
    }).join('')}</tbody></table><dl class="decision-market-list"><dt>İstasyon / focus</dt><dd>${money(craft?.fee)} / ${money(craft?.focusCost)}</dd><dt>Toplam craft maliyeti</dt><dd>${money(craft?.total)}</dd></dl></div>`;
}
function marketHtml() {
    const quotes = state.data?.quotes[state.itemId];
    const sell = quotes?.sell, buy = quotes?.buy;
    const valid = quote => quote?.status === STATUS.confirmed ? quote.price : null;
    const ask = valid(sell), bid = valid(buy);
    const spread = ask != null && bid != null ? (ask - bid) / ask * 100 : null;
    return `<dl class="decision-market-list"><dt>Sell teklif</dt><dd>${money(ask)}</dd><dt>Buy teklif</dt><dd>${money(bid)}</dd><dt>Anlık spread</dt><dd>${spread == null ? '—' : formatQuantity(spread) + '%'}</dd><dt>İşlem hacmi</dt><dd>Bilinmiyor</dd><dt>Dolum / derinlik</dt><dd>Bilinmiyor</dd></dl>`;
}
function analysisHtml(decision) {
    return `<div class="decision-analysis"><section class="decision-analysis-panel"><h3>Fiyat Geçmişi</h3><div data-decision-chart>${seriesState || (!state.itemId ? '<p class="decision-panel-empty">Fiyat geçmişi için ürün seç.</p>' : decisionHistoryHtml(series))}</div></section><section class="decision-analysis-panel"><h3>Malzeme Maliyeti <small>${state.itemId ? formatQuantity(numeric(state.quantity)) + ' adet' : '—'}</small></h3>${materialHtml(decision)}</section><section class="decision-analysis-panel"><h3>Piyasa Özeti</h3>${marketHtml()}</section></div>`;
}
function sourcesHtml(decision) {
    const invalid = selectedItems().flatMap(id => ['buy', 'sell'].map(side => state.data?.quotes[id]?.[side])).filter(quote => quote?.status !== STATUS.confirmed).length;
    const craft = decision?.options.find(option => ['CRAFT_NOW', 'CRAFT_INTO'].includes(option.id));
    const status = (label, tip, warning, popup = 'sources') => `<button type="button" class="decision-status-chip ${warning ? 'decision-warning' : 'decision-saving'}" ${tip.length > SHORT_HELP_MAX_LENGTH ? `data-decision-popup="${esc(popup)}"` : `data-app-tooltip="${esc(tip)}"`}>${icon('info')} ${esc(label)}</button>`;
    return `<div class="decision-data-status"><strong>Veri Durumu</strong>${status(state.itemId ? (invalid ? invalid + ' teklif doğrulanamadı' : 'Teklifler doğrulandı') : 'Ürün bekleniyor', 'Eksik, eski ve uç fiyatlar kesin hesapta kullanılmaz. Eksik fiyat sıfır sayılmaz.', invalid || !decision)}${status(decision?.integrity?.startsWith('Sınırlı') ? 'Gözlem: sınırlı' : 'Teklif gözlemleri', 'Gerçekleşmiş işlem / hacim değildir. Boş saatler doldurulmaz; dolum ve derinlik bilinmiyor.', true)}${status(craft?.status === STATUS.confirmed ? 'Craft girdileri tam' : 'Craft hesaplanamıyor', craft?.reasons.join('\n') || 'Tarif ve zorunlu craft girdileri bekleniyor.', craft?.status !== STATUS.confirmed, craft ? 'option:' + craft.id : 'sources')}<button type="button" class="decision-status-more decision-detail-button" data-decision-popup="sources">Kaynaklar ve ücretler</button><button type="button" class="decision-detail-button" data-decision-popup="history">Gözlem dökümü</button></div>`;
}
function sourceDetails() {
    const fees = decisionFees();
    return `<h2>Kaynaklar ve hesaplama</h2><section><h3>Ücretler</h3>${summaryRows([['Vergi', fees.taxRate == null ? 'Eksik' : formatQuantity(fees.taxRate * 100) + '%'], ['İlan ücreti · yalnızca emir', fees.setupFeeRate == null ? 'Eksik' : formatQuantity(fees.setupFeeRate * 100) + '%'], ['Premium', getSettings().premium ? 'Açık' : 'Kapalı']])}</section><section><h3>Hesaplama sınırları</h3>${summaryList(['Craft: manuel istasyon ücreti, RR ve focus girdilerine bağlı.', 'Envanter: fırsat maliyeti dahil; geri dönüş geliri koşullu.', 'Batch girdileri: zorunlu ücret / RR tamamlanmadan toplam hesaplanmaz.', 'Desteklenmeyen: çok seviyeli optimizasyon, journal / yan ürünler, taşıma ve bekletme getirisi.'], 'decision-warning')}</section><section><h3>Veri kaynağı</h3>${summaryRows([['Kaynak', state.data?.source || '—'], ['Alma zamanı', time(state.data?.fetchedAt)], ['Piyasa', state.city + ' · ' + getServer().label], ['Kalite', '1']])}${summaryList([state.data?.historyError, 'Alma zamanı ve teklif gözlem zamanı farklıdır.'], 'decision-warning')}</section>${selectedItems().map(id => `<section><h3>${itemNameHtml(itemLabel(id))}</h3>${['buy', 'sell'].map(side => {
        const quote = state.data?.quotes[id]?.[side], ref = quote?.reference;
        return `<h4>${side === 'buy' ? 'Buy' : 'Sell'}</h4>${summaryRows([['Teklif / durum', money(quote?.price) + ' · ' + (STATUS_LABEL[quote?.status] || 'Eksik'), quote?.status === STATUS.confirmed ? 'decision-saving' : 'decision-warning'], ['Gözlem zamanı', time(quote?.sourceQuoteAt)], ['28 gün medyan', money(ref?.price)], ['Kapsam', (ref?.validBuckets ?? 0) + ' saat / ' + (ref?.validDays ?? 0) + ' tamamlanmış gün'], ['Referans aralığı', time(ref?.startAt) + ' – ' + time(ref?.endAt)]])}`;
    }).join('')}</section>`).join('')}`;
}
function openPopup(key) {
    if (key === 'settings') { root.querySelector('[data-decision-settings-dialog]').showModal(); return; }
    const dialog = root.querySelector('[data-decision-dialog]');
    dialog.dataset.kind = key;
    const body = dialog.querySelector('[data-decision-dialog-body]');
    body.innerHTML = key === 'sources' ? sourceDetails() : key === 'history' ? `<h2>Buy / Sell gözlem dökümü</h2>${summaryList(['Gerçek teklif gözlemleri; gerçekleşen işlem veya hacim değildir.', 'Boş saatler doldurulmaz.'], 'decision-warning')}<div data-decision-series></div>` : optionDetails(runDecision().options.find(option => option.id === key.slice(7)));
    if (!dialog.open) dialog.showModal();
    if (key === 'history' && state.itemId && !state.loading) void showHistory();
}
function renderResult() {
    const item = catalog.items.find(item => item.uniqueName === state.itemId);
    root.querySelector('[data-decision-selected]').innerHTML = `<div class="decision-selected">${item ? itemIconHtml(state.itemId, { visual: true }) : `<span class="decision-product-placeholder">${icon('search')}</span>`}<span><strong>${item ? itemNameHtml(itemLabel(state.itemId)) : 'Ürün seç'}</strong><small>${item ? `T${esc(item.tier)}.${esc(item.enchantment || 0)} · ${esc(item.shopSubCategory || item.itemType)} · kalite 1` : 'Ad veya item koduyla ara'}</small></span></div>`;
    const output = root.querySelector('[data-decision-output]');
    const ready = state.itemId && !state.loading && !state.error;
    const decision = ready ? runDecision() : null;
    const best = decision?.best;
    const action = !state.itemId ? 'Karşılaştırmak için ürün seç' : state.loading ? 'Piyasa verileri yükleniyor' : state.error ? 'Veri alınamadı' : ACTIONS[decision.primary];
    const reasons = decision?.reasons.slice(0, 3) || [!state.itemId ? 'Soldaki aramadan ürün seç; gerçek piyasa verileriyle yolları karşılaştır.' : state.loading ? 'Gerçek fiyatlar ve geçmiş referanslar yükleniyor…' : state.error];
    const tone = best ? decision.advantage > 0 ? 'is-confirmed' : 'is-selected' : state.itemId ? 'is-incomplete' : 'is-empty';
    output.innerHTML = `<div class="decision-lead"><section class="decision-primary ${tone}" ${state.error ? 'role="alert"' : state.loading ? 'role="status"' : ''}><div class="decision-primary-symbol">${icon(best?.id || 'primary') || icon(state.mode === 'need' ? 'need' : 'have')}</div><div class="decision-action"><span>ÖNERİ</span><h2>${esc(action)}</h2><p>${state.mode === 'need' ? 'Efektif maliyet' : 'Net gelir'}</p><strong class="decision-total">${money(best?.total)} <small>gümüş</small></strong><p class="decision-advantage">${decision?.advantage == null ? 'Karşılaştırılabilir ikinci seçenek yok.' : `En yakın uygulanabilir seçeneğe fark: ${money(decision.advantage)}`}</p></div><ul class="decision-highlights"><li>${best ? 'Mevcut girdilerle hesaplanabilir' : 'Eksik veri sıfır sayılmaz'}</li><li>${best ? esc(waitLabel(best)) : 'Örnek fiyat kullanılmaz'}</li><li>${best ? 'Adet için derinlik bilinmiyor' : 'Güvenilir veri bekleniyor'}</li></ul></section><section class="decision-why"><h2>Neden bu karar?</h2>${reasons.map(reason => `<p>${esc(reason)}</p>`).join('')}<small class="decision-quality">${esc(decision?.integrity || (state.itemId ? 'Veri durumu henüz doğrulanmadı.' : 'Ürün seçildiğinde gerekçeler burada gösterilir.'))}</small>${state.error ? '<button type="button" class="btn btn-secondary" data-decision-refresh>Yeniden dene</button>' : ''}</section></div>${alternativesHtml(decision)}${sourcesHtml(decision)}${analysisHtml(decision)}`;
    bindCalcSticky(output);
    const dialog = root.querySelector('[data-decision-dialog]');
    if (dialog?.open) openPopup(dialog.dataset.kind);
}
async function showHistory() {
    const token = revision;
    if (!series) { await loadHistory(); if (!series) return; }
    if (token !== revision) return;
    const target = root.querySelector('[data-decision-series]');
    if (target) {
        if (!target.isConnected) return;
        target.innerHTML = ['buy', 'sell'].map(side => `<h3>${side === 'buy' ? 'Buy' : 'Sell'} gözlemleri</h3>${series[side]?.points?.length ? `<div class="decision-history-scroll"><table class="table calc-table"><thead><tr><th>Gözlem aralığı</th><th>Fiyat</th></tr></thead><tbody>${series[side].points.map(point => `<tr><td>${time(point.at)}</td><td>${money(point.price)}</td></tr>`).join('')}</tbody></table></div>` : '<span class="decision-warning">Geçerli geçmiş gözlemi yok.</span>'}`).join('');
        bindCalcSticky(target);
    }
}
function loadHistory() {
    if (historyTask && !seriesRequest?.signal.aborted) return historyTask;
    seriesRequest?.abort();
    const controller = new AbortController(); seriesRequest = controller;
    const itemId = state.itemId, city = state.city;
    seriesState = '<p class="decision-panel-empty">Saatlik arşiv yükleniyor…</p>';
    const paint = () => {
        const target = root.querySelector('[data-decision-chart]');
        if (target) target.innerHTML = seriesState || decisionHistoryHtml(series);
        const details = root.querySelector('[data-decision-dialog][data-kind="history"]');
        if (details?.open && seriesState) details.querySelector('[data-decision-series]').innerHTML = seriesState;
    };
    paint();
    historyTask = (async () => {
    try {
        const result = await loadDecisionSeries(itemId, city, controller.signal);
        if (controller.signal.aborted || itemId !== state.itemId || city !== state.city) return;
        series = result; seriesState = '';
    } catch (error) {
        if (controller.signal.aborted) return;
        seriesState = `<p class="decision-panel-empty" role="alert">${esc(error.message)}</p><button type="button" class="btn btn-secondary" data-decision-history-refresh>Geçmişi yeniden dene</button>`;
    }
    paint();
    })().finally(() => { if (seriesRequest === controller) historyTask = null; });
    return historyTask;
}
async function reload() {
    const token = ++revision;
    request?.abort(); seriesRequest?.abort(); request = new AbortController(); series = null; seriesState = '';
    if (!state.itemId) return;
    state.loading = true; state.error = ''; state.data = null; renderResult();
    try { const data = await loadDecisionQuotes(selectedItems(), state.city, { signal: request.signal }); if (token === revision) state.data = data; }
    catch (error) { if (token === revision && error.name !== 'AbortError') state.error = error.message || 'Veri alınamadı'; }
    finally { if (token === revision) { state.loading = false; renderResult(); if (!state.error) void loadHistory(); } }
}
function bind() {
    root.addEventListener('input', event => {
        const key = event.target.dataset.decisionField;
        if (!key) return;
        if (key.startsWith('inventory:')) state.inventory[key.slice(10)] = event.target.value;
        else if (key.startsWith('order:')) { const id = key.slice(6); if (event.target.value === '') delete state.materialOrders[id]; else state.materialOrders[id] = event.target.value; }
        else state[key] = event.target.value;
        if (key === 'query') { clearTimeout(debounce); debounce = setTimeout(itemSearch, 120); return; }
        if (key === 'outputId') { resetCraft(); refreshCraft(); void reload(); return; }
        renderResult();
    });
    root.addEventListener('change', event => {
        if (event.target.dataset.decisionField === 'query') rememberRecent('searches', state.query);
        if (event.target.hasAttribute('data-decision-focus')) { state.focus = event.target.checked; refreshCraft(); renderResult(); }
    });
    root.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.dataset.decisionField === 'query') rememberRecent('searches', state.query); });
    root.addEventListener('click', event => {
        const popup = event.target.closest('[data-decision-popup]');
        const close = event.target.closest('[data-decision-close]');
        if (popup) { openPopup(popup.dataset.decisionPopup); return; }
        if (close) { root.querySelector(close.dataset.decisionClose === 'settings' ? '[data-decision-settings-dialog]' : '[data-decision-dialog]').close(); return; }
        const search = event.target.closest('[data-decision-recent-search]');
        if (search) {
            clearTimeout(debounce);
            state.query = search.dataset.decisionRecentSearch;
            root.querySelector('[data-decision-field="query"]').value = state.query;
            rememberRecent('searches', state.query);
            initFloatingLabels(root); itemSearch(); return;
        }
        const item = event.target.closest('[data-decision-item]');
        const mode = event.target.closest('[data-decision-mode]');
        if (item) { state.itemId = item.dataset.decisionItem; rememberRecent('searches', state.query); rememberRecent('items', state.itemId); state.outputId = ''; state.limitPrice = ''; resetCraft(); refreshCraft(); itemSearch(); void reload(); }
        else if (mode) { state.mode = mode.dataset.decisionMode; state.outputId = ''; state.limitPrice = ''; resetCraft(); renderShell(); void reload(); }
        else if (event.target.closest('[data-decision-refresh]')) void reload();
        else if (event.target.closest('[data-decision-history-refresh]')) void loadHistory().then(() => { if (series && root.querySelector('[data-decision-dialog][data-kind="history"]')?.open) void showHistory(); });
        else if (event.target.closest('[data-decision-reset-craft]')) { resetCraft(); refreshCraft(); renderResult(); }
    });
}
async function main() {
    root = document.querySelector('[data-decision-engine]'); if (!root) return;
    await initStore(); initNav(); initTooltips(); initDialogBackdropClose(); recordCurrentToolVisit();
    catalog = decisionCatalog(); state.city = getSettings().defaultCity; loadRecent();
    await Promise.allSettled([loadDecisionIcons(), loadRecipeMechanics()]); renderShell(); bind();
    bindLivePrices(() => ({ items: selectedItems(), cities: [state.city] }), reload, { packetSourceOnly: false });
    window.addEventListener('storage', event => { if (event.key !== SETTINGS_STORAGE_KEY && event.key !== null) return; state.city = getSettings().defaultCity; resetCraft(); renderShell(); void reload(); });
    window.addEventListener('online', reload);
    setInterval(() => { if (state.itemId && !state.loading) void reload(); }, 60_000);
}
main().catch(error => { if (root) root.textContent = `Karar Motoru yüklenemedi: ${error.message}`; });
