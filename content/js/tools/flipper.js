import { sortChoicesHtml } from '../components/view-switch.js';
import { durableStorage as localStorage } from '../core/durable-storage.mjs';
import { fieldLabel, fieldHeadingHtml, filterChoiceFieldHtml } from '../components/form-field.js';
import { getAll } from '../db/store.js';
import { cityFieldHtml, bindCityField, setCityFieldValue, getCityFieldSelection, setCityFieldSelection, resolveCityFieldSelection } from '../components/city-picker.js';
import { loadActiveCities } from '../core/cities.js';
import { decisionFees } from '../core/decision-data.js';
import { isMarketCatalogItem } from '../core/market-catalog.mjs';
import { BLACK_MARKET, optimizeLoad, FLIPPER_SORTS, sortFlips } from '../core/flipper.mjs';
import { scanFlips } from '../core/flipper-data.js';
import { itemNameHtml } from '../components/item-name.js';
import { cityRouteHtml } from '../components/city-badge.js';
import { itemIconHtml, itemLabel, itemTierBadgeHtml } from '../components/item-icon.js';
import { toolPageHtml } from '../core/app-runtime.js';
import { pageInfoCardsHtml } from '../components/page-info.js';
import { groupedIntegerFieldHtml, bindGroupedIntegerFields, numericInputValue } from '../components/numeric-field.js';
import { initFloatingLabels } from '../components/forms.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { escapeHtml as esc } from '../utils/utils.js';
import { formatAge } from '../utils/format.js';
import { PRICE_STALE_MS } from '../core/market-history-config.mjs';
import { bindLivePrices } from '../core/price-live.js';
const root = document.querySelector('[data-flipper]');
const money = n => Number.isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—';
const pct = n => Number.isFinite(n) ? `%${(n*100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—';
const spikeBadgeHtml = row => row.spikes?.length ? `<span class="badge flipper-spike-badge" data-app-tooltip="${esc(row.spikes.map(spike => `${spike.city} ${spike.side}: ${money(spike.reference)} referansa karşı ${money(spike.price)} (+%${Math.round((spike.ratio - 1)*100)}). Aynı teklif yönünün tarihsel referansından en az %35 yüksek; gerçekleşmiş satış ortalaması değildir.`).join('\n'))}">Fiyat sıçraması</span>` : '';
const roiBadgeHtml = row => {
    const level = row.roi < 0 ? 'loss' : row.roi < .1 ? 'low' : row.roi < .3 ? 'medium' : 'high';
    return `<span class="badge flipper-roi-badge is-${level}${row.safe ? '' : ' is-uncertain'}" data-app-tooltip="${esc(`Net kâr / toplam alış maliyeti. ${row.safe ? 'Görünen fiyatlara göre hesaplanır; gerçekleşen kazanç değildir.' : 'Riskli fiyat: bu oran doğrulanmış kazanç değildir.'}`)}">%${Math.round(row.roi * 100).toLocaleString('tr-TR')}</span>`;
};
const opportunityPricesHtml = row => {
    const ageLimit = num('age') ? num('age') * 60000 : PRICE_STALE_MS;
    const currentAge = age => Number.isFinite(age) && age >= 0 && age <= ageLimit;
    const volumeHtml = kind => {
        const volume = kind === 'buy' ? row.buyVolume : row.sellVolume;
        const range = volume ? `%${Math.round(volume.nearRatio * 100)}` : '';
        return `<span class="badge bg-secondary flipper-price-volume" tabindex="0" data-app-tooltip="${esc(volume ? `Gözlenen emir adedi: aynı fiyatta ${money(volume.exact)}, ${kind === 'buy' ? 'daha pahalıya' : 'daha ucuza'} ${range} aralıkta toplam ${money(volume.near)}. Son paket kısmi piyasa görüntüsüdür; emirlerin hâlâ açık olduğu ve bu miktarın gerçekleşeceği doğrulanamaz.` : 'Emir miktarı verisi yok. Piyasa API fiyatları adet ve emir derinliği sağlamaz.')}" aria-label="${kind === 'buy' ? 'Alış' : 'Satış'} gözlenen emir adedi">${money(volume?.near)}</span>`;
    };
    const metrics = [['buy', 'Alış', money(row.buy)], ['sell', 'Satış', money(row.sell)], ['net', 'Net / adet', (row.net > 0 ? '+' : '') + money(row.net)], ['roi', 'ROI', roiBadgeHtml(row)]];
    const symbols = ["<svg class=\"flipper-metric-icon\" viewBox=\"0 0 36 36\" aria-hidden=\"true\"><g stroke=\"#945b22\" stroke-width=\".9\" stroke-linejoin=\"round\"><path d=\"M5 10v6c0 5 18 5 18 0v-6\" fill=\"#e6a93f\"/><path d=\"M5 16v5c0 5 18 5 18 0v-5\" fill=\"#e6a93f\"/><ellipse cx=\"14\" cy=\"10\" rx=\"9\" ry=\"4.6\" fill=\"#ffd06e\"/><path d=\"M14 24v5c0 5 18 5 18 0v-5\" fill=\"#e6a93f\"/><ellipse cx=\"23\" cy=\"24\" rx=\"9\" ry=\"4.6\" fill=\"#ffd06e\"/></g><path d=\"M8 9.8c3.6-1.9 8.1-1.9 11.6 0M17 23.8c3.3-1.6 7.3-1.6 10.7 0\" fill=\"none\" stroke=\"#ffe4a0\" stroke-width=\"1.2\" stroke-linecap=\"round\" opacity=\".92\"/><path d=\"M7 17c3.8 2.2 10.6 2.4 14 0M16 30c4.5 2 9.7 2 14 0\" fill=\"none\" stroke=\"#945b22\" stroke-width=\".9\" opacity=\".7\"/></svg>","<svg class=\"flipper-metric-icon\" viewBox=\"0 0 36 36\" aria-hidden=\"true\"><g stroke=\"#586775\" stroke-width=\".9\" stroke-linejoin=\"round\"><path d=\"M5 10v6c0 5 18 5 18 0v-6\" fill=\"#a8b4bf\"/><path d=\"M5 16v5c0 5 18 5 18 0v-5\" fill=\"#a8b4bf\"/><ellipse cx=\"14\" cy=\"10\" rx=\"9\" ry=\"4.6\" fill=\"#f0f3f5\"/><path d=\"M14 24v5c0 5 18 5 18 0v-5\" fill=\"#a8b4bf\"/><ellipse cx=\"23\" cy=\"24\" rx=\"9\" ry=\"4.6\" fill=\"#f0f3f5\"/></g><path d=\"M8 9.8c3.6-1.9 8.1-1.9 11.6 0M17 23.8c3.3-1.6 7.3-1.6 10.7 0\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"1.2\" stroke-linecap=\"round\" opacity=\".92\"/><path d=\"M7 17c3.8 2.2 10.6 2.4 14 0M16 30c4.5 2 9.7 2 14 0\" fill=\"none\" stroke=\"#586775\" stroke-width=\".9\" opacity=\".7\"/></svg>","<svg class=\"flipper-metric-icon\" viewBox=\"0 0 32 32\" aria-hidden=\"true\"><path fill=\"#e6a43d\" d=\"M3 18h6v11H3zM12 11h6v18h-6zM21 4h6v25h-6z\"/><path fill=\"#ffd278\" d=\"M3 18h6v3H3zM12 11h6v3h-6zM21 4h6v3h-6z\"/></svg>","<svg class=\"flipper-metric-icon\" viewBox=\"0 0 32 32\" aria-hidden=\"true\"><circle cx=\"16\" cy=\"16\" r=\"15\" fill=\"#393632\"/><text x=\"16\" y=\"23\" font-size=\"24\" fill=\"#edba5d\" font-weight=\"800\" text-anchor=\"middle\">%</text></svg>"];
    return '<div class="flipper-row-prices" aria-label="Alış, satış, net kâr ve ROI">' + metrics.map(([kind, label, value], index) => `<div class="flipper-price-cell flipper-price-cell--${kind}${kind === 'net' && !row.safe ? ' is-uncertain' : ''}"><div class="flipper-metric-inner" aria-label="${label}">${kind === 'buy' || kind === 'sell' ? '' : `<small>${symbols[index]}<span>${label}</span></small>`}${kind === 'roi' ? value : `<strong>${value}</strong>`}${kind === 'buy' || kind === 'sell' ? `<small class="flipper-price-age${currentAge(kind === 'buy' ? row.buyAgeMs : row.sellAgeMs) ? ' is-current' : ''}" data-app-tooltip="${label} fiyatının gözlem yaşı">${esc(formatAge(kind === 'buy' ? row.buyAgeMs : row.sellAgeMs))}</small>${volumeHtml(kind)}` : ''}</div></div>`).join('') + '</div>';
};
const state = { rows: [], limits: {}, selected: '', sort: 'balanced', phase: 'idle', busy: false, scan: null, controller: null, basket: null };
let items, cities, icons = {};
let liveController = null, liveQueue = new Set();
const icon = name => `<span class="flipper-icon" aria-hidden="true">${icons[name] || ''}</span>`;
const SORT_ICONS = { balanced: 'compare', net: 'profit', roi: 'flip', recent: 'clock', cost: 'coins', confidence: 'confidence' };
const input = (key,label,value,extra='') => `<div class="form-floating"><input class="form-control" data-filter="${key}" type="number" min="0" value="${value}" placeholder="${label}" aria-label="${label}" ${extra}><label>${fieldLabel(label)}</label></div>`;
const DATA_AGES = [[60, '1 saat', '1S'], [360, '6 saat', '6S'], [720, '12 saat', '12S'], [1440, '1 gün', '1G'], [0, 'Tümü']];
const RISK_VISIBILITY = [[1, 'Göster'], [2, 'Gösterme']];
const QUALITIES = [[1, 'Normal', 'No'], [2, 'Good', 'Go'], [3, 'Outstanding', 'Ou'], [4, 'Excellent', 'Ex'], [5, 'Masterpiece', 'Mp'], [0, 'Tümü']];
const FILTER_CHOICES = { age: DATA_AGES, quality: QUALITIES, risk: RISK_VISIBILITY };
const choiceFieldHtml = (key, label, options) => {
    if (options.some(([value]) => value === 0)) return filterChoiceFieldHtml({ label, selected: options[0][0], allValue: 0, options: options.map(([value, label, shortLabel]) => ({ value, label, shortLabel })), attributes: value => `data-choice-filter="${key}" data-choice-value="${value}"`, after: `<input type="hidden" data-filter="${key}" value="${options[0][0]}">` });
    return `<div class="choice-field form-field">${fieldHeadingHtml(label)}<div class="segmented-choice" role="group" aria-label="${esc(label)}">${options.filter(([value]) => value !== 0).map(([value, text, shortText = text]) => `<button type="button" class="segmented-choice-button segmented-choice-button--short${value === options[0][0] ? ' is-active' : ''}" data-choice-filter="${key}" data-choice-value="${value}" aria-pressed="${value === options[0][0]}" title="${esc(text)}" aria-label="${esc(text)}">${esc(shortText)}</button>`).join('')}</div><input type="hidden" data-filter="${key}" value="${options[0][0]}"></div>`;
};

const CITY_FIELDS = { source: 'flipper-source', target: 'flipper-target' };
const field = key => root.querySelector(`[data-filter="${key}"]`);
const num = key => numericInputValue(field(key));
const PREFERENCES_KEY = 'albiontools.v4.flipper.preferences';
function savePreferences() {
    const filters = Object.fromEntries([...root.querySelectorAll('[data-filter]')].map(input => [input.dataset.filter, numericInputValue(input)]));
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ filters, source: getCityFieldSelection(root, CITY_FIELDS.source), target: getCityFieldSelection(root, CITY_FIELDS.target), sort: state.sort })); } catch { /* Storage may be unavailable; controls remain usable. */ }
}
function restorePreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
        if (!saved || typeof saved !== 'object') return;
        for (const [key, value] of Object.entries(saved.filters || {})) {
            const input = field(key);
            if (!input || !Number.isFinite(value) || value < 0) continue;
            const choices = FILTER_CHOICES[key];
            if (choices && !choices.some(([id]) => id === value)) continue;
            if (key === 'budget' && !Number.isSafeInteger(value)) continue;
            input.value = value;
            root.querySelectorAll(`[data-choice-filter="${key}"]`).forEach(button => {
                const active = Number(button.dataset.choiceValue) === value;
                button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
            });
        }
        for (const key of Object.keys(CITY_FIELDS)) {
            const allowed = ['', ...cities.map(city => city.marketApiName), ...(key === 'target' ? [BLACK_MARKET] : [])];
            if (allowed.includes(saved[key])) setCityFieldValue(root, CITY_FIELDS[key], saved[key]);
            else if (saved[key] && Array.isArray(saved[key].included) && Array.isArray(saved[key].excluded)) setCityFieldSelection(root, CITY_FIELDS[key], { included: saved[key].included.filter(value => value && allowed.includes(value)), excluded: saved[key].excluded.filter(value => value && allowed.includes(value)) });
        }
        if (FLIPPER_SORTS.some(option => option.id === saved.sort)) state.sort = saved.sort;
    } catch { /* Ignore damaged or inaccessible preferences. */ }
}
function monitorHtml() {
    return `<section class="flipper-monitor" data-status data-monitor-phase="idle" aria-label="Tarama izleme">
        <div class="flipper-monitor-state" tabindex="0" data-monitor-state data-app-tooltip="Güncel teklifleri almak için Tara düğmesini kullanın. Örnek ve tarihsel fiyatlar anlık teklif yerine kullanılmaz."><span class="flipper-monitor-dot" aria-hidden="true"></span><strong data-monitor-label role="status">Hazır</strong><span data-monitor-progress>—</span></div>
        <progress data-monitor-bar max="1" value="0" aria-label="Tarama ilerlemesi"></progress>
        <dl><div tabindex="0" data-app-tooltip="Seçilen şehirler arasında aynı eşya kimliği, enchant ve kalitede eşleşen fiyat çiftleri. Pozitif veya güvenilir fırsat sayısı değildir."><dt>Eşleşme</dt><dd data-monitor-count>—</dd></div><div tabindex="0" data-app-tooltip="Son tamamlanan taramanın zamanı. Her teklifin kendi gözlem yaşı ayrıca değerlendirilir."><dt>Son tarama</dt><dd data-monitor-time>—</dd></div><div tabindex="0" data-app-tooltip="API gerçek emir derinliğini sağlamaz. Uygulanabilir adedi oyunda doğrulayın; kesin toplam kâr hesaplanmaz."><dt>Emir adedi</dt><dd>—</dd></div></dl>
    </section>`;
}
function updateMonitor(phase, { done = 0, total = 0, message = '' } = {}) {
    state.phase = phase;
    const monitor = root.querySelector('[data-status]');
    monitor.dataset.monitorPhase = phase;
    const labels = { idle: 'Hazır', scanning: 'Taranıyor', checking: 'Kontrol ediliyor', complete: 'Tamamlandı', partial: 'Eksik tarama', changed: 'Yeniden tara', error: 'Tarama hatası' };
    const tips = { idle: 'Güncel teklifleri almak için Tara düğmesini kullanın. Örnek ve tarihsel fiyatlar anlık teklif yerine kullanılmaz.', scanning: 'Anlık alış ve satış teklifleri alınıyor.', checking: 'Fiyatlar alındı; tarihsel referans ve uç fiyat kontrolü sürüyor.', complete: 'Tarama tamamlandı. Fiyatlar emir miktarını veya satışın gerçekleşeceğini garanti etmez.', partial: 'Bazı fiyatlar veya tarihsel kontrol eksik. Liste tam piyasa kapsamı sağlamayabilir.', changed: 'Seçim veya canlı fiyat değişti. Yeniden tarayın ve emir limitlerini doğrulayın.', error: 'Fiyatlar alınamadı. Yeniden taramayı deneyin.' };
    root.querySelector('[data-monitor-label]').textContent = labels[phase];
    root.querySelector('[data-monitor-state]').dataset.appTooltip = message || tips[phase];
    root.querySelector('[data-monitor-progress]').textContent = total ? `${done}/${total}` : ['complete','partial'].includes(phase) ? '100%' : '—';
    root.querySelector('[data-monitor-bar]').value = ['complete','partial','checking'].includes(phase) ? 1 : total ? done / total : 0;
    root.querySelector('[data-monitor-count]').textContent = state.scan ? money(state.rows.length) : '—';
    const time = root.querySelector('[data-monitor-time]');
    time.textContent = state.scan ? new Date(state.scan.fetchedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
    time.parentElement.dataset.appTooltip = state.scan ? `Son tamamlanan tarama: ${new Date(state.scan.fetchedAt).toLocaleString('tr-TR')}. Tekliflerin gözlem yaşı ayrıca değerlendirilir.` : 'Henüz tamamlanan tarama yok.';
}
function layout() {
    const targets = [...cities, { name: BLACK_MARKET, displayName: BLACK_MARKET, marketApiName: BLACK_MARKET, mapPosition: { x: 46, y: 68 }, iconHtml: icons['black-market'] }];
    root.innerHTML = toolPageHtml({ key: 'flipper', head: `<section class="page-head" data-page-head="flipper"><h1>${icon('flipper')} Flipper</h1><p>Şehirler Arası Arbitraj</p></section>`, controls: `<section class="form-section"><div class="flipper-controls">
    ${cityFieldHtml({ id: CITY_FIELDS.source, label: 'Nereden', selected: '', cities, allowAll: true, showAllButton: true, className: '' })}${cityFieldHtml({ id: CITY_FIELDS.target, label: 'Nereye', selected: BLACK_MARKET, cities: targets, allowAll: true, showAllButton: true, className: '' })}
    ${groupedIntegerFieldHtml({ key: 'budget', label: 'BÜTÇE (GÜMÜŞ)', value: 20000000 })}${input('capacity','Taşıma (kg)',950,'step="0.1"')}${input('roi','Min ROI (%)',10)}${choiceFieldHtml('age', 'Veri yaşı', DATA_AGES)}${choiceFieldHtml('risk', 'Riskli fiyatlar', RISK_VISIBILITY)}${choiceFieldHtml('quality', 'Kalite', QUALITIES)}
    ${input('transport','Ek gider / adet',0,'step="0.01"')}<div class="form-actions form-actions--inline form-actions--compact"><button class="btn btn-primary" data-scan>${icon('scan')}<span>Tara</span></button><button class="btn btn-outline-primary" data-fill>${icon('cart')}<span>Yükümü Doldur</span></button></div>
    </div></section>`, summary: monitorHtml(), resultClass: 'flipper-results result--sections', result: `<div class="flipper-metrics" data-metrics></div><div class="flipper-columns"><section class="flipper-list-panel"><div class="flipper-list-head"><h2>Fırsatlar <small data-count></small></h2>${sortChoicesHtml(FLIPPER_SORTS.map(option => ({ ...option, icon: ({ balanced: "balanced", recent: "time", roi: "ratio", cost: "cost", confidence: "confidence" })[option.id] || "value", tooltip: `${option.shortLabel} ${option.direction === 1 ? "↑" : "↓"}` })), state.sort, value => `data-flipper-sort="${value}"`)}</div><div class="flipper-list" data-list></div></section><section class="flipper-detail" data-detail></section></div>
    <section class="flipper-basket"><h2>${icon('cart')} Yükümü Doldur</h2><div data-basket>Detay panelinde oyunda gördüğünüz adet sınırı ve birim ağırlığı doğrulayın. Bilinmeyen ağırlık veya emir derinliği ile sepet oluşturulmaz.</div></section>
    <section data-info data-flipper-info></section>` });
    restorePreferences();
    initFloatingLabels(root); bindGroupedIntegerFields(root);
    for (const key of Object.keys(CITY_FIELDS)) bindCityField(root, CITY_FIELDS[key], () => filtersChanged(key), { syncPeers: false, multiSelection: true });
    render();
}
function filtersChanged(key) {
    liveController?.abort(); liveQueue.clear();
    savePreferences();
    if (['source','target','quality','age','transport'].includes(key)) { state.controller?.abort(); state.rows=[]; state.scan=null; state.limits={}; updateMonitor('changed'); }
    state.basket=null; root.querySelector('[data-basket]').textContent='Filtreler değişti; sepeti yeniden hesaplayın.'; render();
}
let metricFilter = 'all';
function filteredRows() { return state.rows.filter(row => (num('risk') === 1 || row.safe) && row.net > 0 && row.roi * 100 >= num('roi') && row.cost <= num('budget') && (!row.weight || row.weight <= num('capacity'))); }
function visibleRows() {
    const rows = filteredRows();
    const safe = rows.filter(row => row.safe);
    const best = safe.length ? Math.max(...safe.map(row => row.net)) : null;
    return sortFlips(rows.filter(row => metricFilter === 'all' || (metricFilter === 'safe' && row.safe) || (metricFilter === 'risk' && !row.safe) || (metricFilter === 'best' && row.safe && row.net === best)), state.sort);
}
const isLoading = () => ['scanning','checking'].includes(state.phase);
function emptyMessage() {
    if (state.phase === 'scanning') return 'Fiyatlar taranıyor… Sonuçlar henüz hazır değil.';
    if (state.phase === 'checking') return 'Fiyatlar alındı. Tarihsel referanslar kontrol ediliyor…';
    if (state.phase === 'error') return 'Tarama tamamlanamadı. Yeniden deneyin; hata ayrıntısı tarama durumunda.';
    if (state.phase === 'changed' || !state.scan && state.phase !== 'idle') return 'Seçim değişti. Güncel sonuçlar için yeniden tarayın.';
    if (!state.scan) return 'Henüz tarama yapılmadı. Fırsatları görmek için Tara düğmesini kullanın.';
    if (state.scan.failed) return 'Tarama eksik. Alınabilen verilerde filtrelere uygun fırsat bulunamadı; yeniden deneyin.';
    return 'Tarama tamamlandı. Filtrelere uygun pozitif fırsat bulunamadı.';
}
const emptyHtml = () => `<div class="flipper-empty" role="status">${isLoading() ? '<span class="flipper-loading-spinner" aria-hidden="true"></span>' : ''}<p>${emptyMessage()}</p></div>`;
function render(changed = null) {
    root.querySelectorAll('[data-flipper-sort]').forEach(button => {
        const active = button.dataset.flipperSort === state.sort;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    const filtered = filteredRows(), safe = filtered.filter(row => row.safe), rows = visibleRows();
    const selected = rows.find(row => row.id === state.selected) || rows[0];
    state.selected = selected?.id || '';
    const known = Boolean(state.scan) && !isLoading();
    root.querySelector('[data-count]').textContent = known ? `(${rows.length})` : '(—)';
    root.querySelector('[data-metrics]').setAttribute('aria-busy', String(isLoading()));
    root.querySelector('[data-metrics]').innerHTML = [
        ['profit','En iyi net / adet',safe.length ? money(Math.max(...safe.map(row => row.net))) : '—','best'],
        ['order-book','Pozitif aday',known ? String(filtered.length) : '—','all'],['confidence','Güncel fiyat çifti',known ? String(safe.length) : '—','safe'],['risk','Riskli / eski kayıt',known ? String(filtered.length - safe.length) : '—','risk']
    ].map(([symbol,label,value,metric]) => `<button type="button" data-flipper-metric="${metric}" aria-pressed="${metricFilter === metric}" ${known ? '' : 'disabled'}>${icon(symbol)}<span>${label}<strong>${isLoading() ? '<span class="flipper-loading-spinner" role="img" aria-label="Yükleniyor"></span>' : value}</strong></span></button>`).join('');
    const listHtml = rows.length ? rows.map(row => `<article class="flipper-opportunity ${row.id === selected?.id ? 'is-selected' : ''} ${row.safe ? '' : 'is-risk'}" data-select="${esc(row.id)}" tabindex="0" role="button" aria-label="${esc(itemLabel(row.itemId))} detayını aç" aria-pressed="${row.id === selected?.id}">
    ${itemIconHtml(row.itemId,{ visual:true })}<div class="flipper-item"><h3>${itemNameHtml(itemLabel(row.itemId), itemLabel(row.itemId), { copyPrefix: itemTierBadgeHtml(row.itemId, { format: 'text' }) })}</h3><p>${cityRouteHtml(row.source, row.target)}</p><div class="flipper-item-meta">${itemTierBadgeHtml(row.itemId)}<span class="badge bg-secondary" data-app-tooltip="Kalite ${row.quality}: kaynak ve hedef aynı kalitede eşleşir.">${QUALITIES.find(([value]) => value === row.quality)?.[1] || `Kalite ${row.quality}`}</span>${row.safe || row.spikes?.length ? '' : `<span class="flipper-risk-icon" tabindex="0" aria-label="Riskli fiyat" data-app-tooltip="${esc(row.reasons.join(' · ') || 'Eski veya aykırı fiyat; sepet hesabına alınmaz.')}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2L16.3 4.1L14.4 15.2L12 17L9.6 15.2L7.7 4.1Z"></path><path d="M12 17.5L15.4 20.2L12 22.8L8.6 20.2Z"></path></svg></span>`}${spikeBadgeHtml(row)}</div></div>
    ${opportunityPricesHtml(row)}</article>`).join('') : emptyHtml();
    const list = root.querySelector('[data-list]');
    if (!changed) list.innerHTML = listHtml;
    else {
        const scroll = list.scrollTop;
        const template = document.createElement('template'); template.innerHTML = listHtml;
        const old = new Map([...list.querySelectorAll('[data-select]')].map(node => [node.dataset.select, node]));
        const nodes = [...template.content.children].map(node => {
            const existing = old.get(node.dataset.select);
            const row = rows.find(row => row.id === node.dataset.select);
            return existing && !changed.has(row?.itemId) ? existing : node;
        });
        list.replaceChildren(...nodes); list.scrollTop = scroll;
    }
    list.style.setProperty('--flipper-scrollbar-width', `${list.offsetWidth - list.clientWidth}px`);
    if (!changed || changed.has(selected?.itemId)) {
        const detail = root.querySelector('[data-detail]');
        const drafts = changed ? [...detail.querySelectorAll('[data-limit]')].map(input => [input.dataset.limit, input.value]) : [];
        const focusedLimit = changed && detail.contains(document.activeElement) ? document.activeElement.dataset.limit : null;
        const scroll = detail.scrollTop;
        renderDetail(selected);
        drafts.forEach(([key, value]) => { const input = detail.querySelector(`[data-limit="${key}"]`); if (input) input.value = value; });
        if (focusedLimit) detail.querySelector(`[data-limit="${focusedLimit}"]`)?.focus({preventScroll:true});
        if (changed) detail.scrollTop = scroll;
    }
    const fees = decisionFees();
    root.querySelector('[data-flipper-info]').innerHTML = pageInfoCardsHtml([
        { title: '1 · Anında alış', value: 'Kaynak şehir → Sell Min', tone: 'buy', lines: ['Kaynak pazardaki en düşük satış teklifinden alırsınız.'] },
        { title: '2 · Anında satış', value: 'Hedef şehir → Buy Max', tone: 'sale', lines: ['Hedef pazardaki en yüksek alış teklifine satarsınız.'] },
        { title: 'Masraflar', value: `Satış vergisi ${pct(fees.taxRate)}`, lines: ['Yeni emir açılmadığı için kurulum ücreti yok.', 'Ek gider, alış bütçesine dahil edilir ve net kârdan düşülür.'] },
        { title: 'Riskleri kontrol edin', tone: 'warning', lines: ['Nakliye sırasında ürün kaybı yaşanabilir.', 'Fiyatlar taşıma sırasında değişebilir; görünen kâr garanti değildir.', 'Alış ve satış emirlerinin adetlerini oyunda doğrulayın.'] },
        { title: 'Tarama durumu', value: state.scan ? new Date(state.scan.fetchedAt).toLocaleString('tr-TR') : 'Henüz tarama yapılmadı', tone: state.scan?.failed || state.scan?.historyError ? 'warning' : 'neutral', lines: [state.scan ? 'Son tarama zamanı' : 'Güncel fiyatları almak için Tara düğmesini kullanın.', state.scan?.historyError, state.scan?.failed ? `${state.scan.failed} istek grubu başarısız; tarama eksik.` : ''].filter(Boolean) }
    ]);
}
function renderDetail(row) {
    const target = root.querySelector('[data-detail]');
    if (!row) { target.setAttribute('aria-busy', String(isLoading())); target.innerHTML = '<h2>Ürün detayı</h2>' + (state.scan && !isLoading() ? '<p>Bir fırsat seçin; alış, satış ve giderler burada gösterilir.</p>' : emptyHtml()); return; }
    target.setAttribute('aria-busy', 'false');
    const limit = state.limits[row.id] || {};
    const breakdown = [
        { label: 'Alış', badge: 'Sell Min', value: row.buy, tone: 'buy', tip: 'Kaynak pazardaki en düşük satış teklifinden anında alış.' },
        { label: 'Satış', badge: 'Buy Max', value: row.sell, tone: 'sale', tip: 'Hedef pazardaki en yüksek alış teklifine anında satış.' },
        { label: 'Satış vergisi', badge: pct(row.tax / row.sell), value: -row.tax, tone: row.tax ? 'expense' : 'neutral', tip: 'Satış tutarından kesilen vergi. Yeni emir açılmadığı için kurulum ücreti yok.' },
        { label: 'Ek gider / adet', value: -row.transport, tone: row.transport ? 'expense' : 'neutral' }
    ];
    target.innerHTML = `<div class="flipper-detail-title">${itemIconHtml(row.itemId,{visual:true})}<div><h2>${itemNameHtml(itemLabel(row.itemId))}</h2><p>${cityRouteHtml(row.source, row.target)}</p><small>${esc(row.itemId)} · kalite ${row.quality} (aynı kimlik ve enchant)</small></div></div>
    <strong class="flipper-lead ${row.safe ? 'flipper-profit' : 'flipper-warning'}">+${money(row.net)} <small>/ adet</small> ${roiBadgeHtml(row)}</strong>
    <dl class="flipper-breakdown">${breakdown.map(({label,badge,value,tone,tip})=>`<div class="flipper-breakdown-${tone}"><dt>${label}${badge ? `<span class="badge" data-app-tooltip="${esc(tip)}">${badge}</span>` : ''}</dt><dd${tip && !badge ? ` data-app-tooltip="${esc(tip)}"` : ''}>${value > 0 && label === 'Net kâr / adet' ? '+' : ''}${money(value === 0 ? 0 : value)}</dd></div>`).join('')}</dl>
    <section class="flipper-detail-notice">
        <strong>${row.safe ? 'Emir miktarı doğrulanmalı' : 'Sepete uygun değil'}</strong>${spikeBadgeHtml(row)}
        ${row.reasons.length ? `<ul>${row.reasons.map(reason=>`<li>${esc(reason.replace(/^sell:/, 'Kaynak:').replace(/^buy:/, 'Hedef:'))}</li>`).join('')}</ul>` : '<p>Güncel fiyatlar, satışın gerçekleşeceğini garanti etmez.</p>'}
        ${row.target === BLACK_MARKET ? '<small tabindex="0" data-app-tooltip="Black Market kabulünü oyunda doğrulayın. Kaynak ve hedef aynı kaliteyle eşleşir; farklı kaliteye otomatik eşleştirme yapılmaz.">Black Market kabulünü oyunda kontrol edin.</small>' : ''}
    </section>
    <section class="flipper-verification">
        <h3>Sepet için doğrula <span class="badge bg-secondary" tabindex="0" data-app-tooltip="Aynı fiyattaki kaynak ve hedef emirlerinin küçük adet sınırını girin. Aynı ürün farklı kaynaklardan seçildiğinde hedef emir limiti paylaşılır; sepet için yalnızca bir kaynak doğrulayın. Gerçek birim ağırlığı kullanın; bu değerlerle hesaplanan sepet bir senaryodur, kesin kazanç değildir." aria-label="Sepet doğrulama açıklaması">?</span></h3>
        <p class="flipper-verification-help">Oyundaki adet sınırını ve birim ağırlığı girin.</p>
        <div class="flipper-limit-fields"><div class="form-floating"><input class="form-control" type="number" min="1" step="1" data-limit="quantity" value="${limit.quantity || ''}" aria-label="Doğrulanan adet"><label>DOĞRULANAN ADET</label></div><div class="form-floating"><input class="form-control" type="number" min="0.001" step="0.001" data-limit="weight" value="${limit.weight || row.weight || ''}" aria-label="Ağırlık kg/adet"><label>AĞIRLIK KG/ADET</label></div></div><button class="btn btn-secondary" data-confirm ${row.safe ? '' : 'disabled'}>${icon('quality')} Adet ve ağırlığı doğrula</button><p data-limit-status role="status">${limit.quantity ? 'Sepet adayı doğrulandı.' : row.safe ? 'Doğrulamadan sepete eklenmez.' : 'Güncel ve güvenilir fiyat için yeniden tarayın.'}</p>
    </section>`;
    initFloatingLabels(target);
}
async function scan() {
    liveController?.abort(); liveQueue.clear();
    state.controller?.abort(); const controller = new AbortController(); state.controller = controller;
    state.busy = true; state.rows = []; state.scan = null; state.limits = {}; state.basket = null;
    const basketPanel = root.querySelector('[data-basket]');
    basketPanel.setAttribute('aria-busy', 'true');
    basketPanel.innerHTML = '<div class="flipper-empty" role="status"><span class="flipper-loading-spinner" aria-hidden="true"></span><p>Tarama sürüyor. Sepet adayları hazırlanıyor…</p></div>';
    updateMonitor('scanning'); render(); root.querySelector('[data-scan]').disabled = true;
    try {
        const destinations = resolveCityFieldSelection(root, CITY_FIELDS.target, [...cities.map(city => city.marketApiName), BLACK_MARKET]);
        const sources = resolveCityFieldSelection(root, CITY_FIELDS.source, cities.map(city => city.marketApiName)).filter(city => destinations.some(destination => destination !== city));
        if (!sources.length) throw new Error('Kaynak ve hedef farklı şehirler olmalı');
        const catalog = destinations.length === 1 && destinations[0] === BLACK_MARKET ? items.filter(item=>item.isEquipable) : items;
        state.scan = await scanFlips({items:catalog,sources,targets:destinations,quality:num('quality') === 0 ? QUALITIES.filter(([value]) => value).map(([value]) => value).join(',') : field('quality').value,fees:decisionFees(),transport:num('transport'),maxAgeMs:num('age') === 0 ? undefined : num('age')*60000,signal:controller.signal,onProgress:(done,total)=>{ updateMonitor(done === total ? 'checking' : 'scanning', {done,total}); if (done === total) render(); }});
        state.rows = state.scan.rows;
        updateMonitor(state.scan.failed || state.scan.historyError ? 'partial' : 'complete', { message: [state.scan.reused ? 'Son 10 dakika içinde taranan veri seti kullanıldı.' : '', state.scan.failed ? `${state.scan.failed} istek grubu başarısız; tarama eksik.` : '', state.scan.historyError].filter(Boolean).join(' ') }); render();
    } catch(error) { if (!controller.signal.aborted) updateMonitor('error', {message:error.message}); }
    finally {
        if (state.controller === controller) {
            state.busy=false; root.querySelector('[data-scan]').disabled=false;
            root.querySelector('[data-basket]').setAttribute('aria-busy', 'false');
            root.querySelector('[data-basket]').textContent = state.scan ? 'Tarama tamamlandı. Sepet için ürün detayında adet ve ağırlığı doğrulayın.' : state.phase === 'error' ? 'Tarama tamamlanamadığı için yeni sepet hesaplanamaz.' : 'Yeni tarama için adet ve ağırlıkları yeniden doğrulayın.';
            render();
        }
    }
}
function fill() {
    const target = root.querySelector('[data-basket]');
    try {
        if (state.busy) throw new Error('Taramanın tamamlanmasını bekleyin');
        const basket=optimizeLoad(visibleRows(),{budget:num('budget'),capacity:num('capacity'),limits:state.limits}); state.basket=basket;
        if (!basket.lines.length) throw new Error('Uygun doğrulanmış sepet adayı yok. Detayda adet ve ağırlık girin.');
        renderBasket(basket);
    } catch(error) { target.textContent=error.message; }
}
function renderBasket(basket) {
    const target = root.querySelector('[data-basket]');
        const sale=basket.lines.reduce((sum,{row,qty})=>sum+row.sell*qty,0);
        const expenses=basket.lines.reduce((sum,{row,qty})=>sum+(row.tax+row.transport)*qty,0);
        target.innerHTML=`<p class="flipper-warning">Senaryo • Doğrulanan limitler ve görünen fiyatlar sabit kalırsa. Kesin kazanç değildir. ${basket.excluded} doğrulanmamış / riskli aday hariç.</p><div class="calc-table-wrap table-responsive"><table class="table calc-table"><thead><tr><th>Ürün / rota</th><th>Adet</th><th>Alış</th><th>Brüt satış</th><th>Gider</th><th>kg</th><th>Net</th></tr></thead><tbody>${basket.lines.map(({row,qty,weight})=>`<tr><td>${itemNameHtml(itemLabel(row.itemId))}<small>${cityRouteHtml(row.source, row.target)}</small></td><td>${qty}</td><td>${money(row.buy*qty)}</td><td>${money(row.sell*qty)}</td><td>${money((row.tax+row.transport)*qty)}</td><td>${money(weight*qty)}</td><td class="flipper-profit">${money(row.net*qty)}</td></tr>`).join('')}</tbody></table></div><p>Alış ${money(basket.cost-basket.lines.reduce((s,{row,qty})=>s+row.transport*qty,0))} · Brüt satış ${money(sale)} · Gider ${money(expenses)} · Ağırlık ${money(basket.weight)} kg · <strong class="flipper-profit">Net ${money(basket.net)} · ${pct(basket.roi)} ROI</strong></p>`;
        bindCalcSticky(target);
}
async function refreshLivePrices(detail) {
    const touched = detail?.items?.length ? detail.items : state.rows.map(row => row.itemId);
    touched.forEach(id => liveQueue.add(id));
    if (liveController || !state.scan || state.busy) return;
    const controller = new AbortController(); liveController = controller;
    try {
        while (liveQueue.size && !controller.signal.aborted) {
            const changed = new Set(liveQueue); liveQueue.clear();
            const existing = state.rows.filter(row => changed.has(row.itemId));
            if (!existing.length) continue;
            const result = await scanFlips({ reuseRecent:false, items:items.filter(item => changed.has(item.uniqueName)), sources:[...new Set(existing.map(row => row.source))], targets:[...new Set(existing.map(row => row.target))], quality:[...new Set(existing.map(row => row.quality))].join(','), fees:decisionFees(), transport:num('transport'), maxAgeMs:num('age') ? num('age')*60000 : undefined, signal:controller.signal });
            controller.signal.throwIfAborted();
            if (result.failed) throw new Error('Canlı fiyat güncellemesi eksik; önceki fiyatlar korundu.');
            const updates = new Map(result.rows.map(row => [row.id, row]));
            const missing = existing.filter(row => !updates.has(row.id));
            missing.forEach(row => updates.set(row.id, {...row, safe:false, score:0, confidence:.1, expiresAt:0, reasons:[...row.reasons, 'Canlı güncellemede eşleşen teklif bulunamadı; önceki fiyat gösteriliyor.']}));
            state.rows = state.rows.map(row => updates.get(row.id) || row);
            render(changed);
            if (state.basket?.lines.some(line => changed.has(line.row.itemId))) {
                const basket = state.basket;
                basket.lines = basket.lines.map(line => ({...line, row: updates.get(line.row.id) || line.row}));
                basket.cost = basket.lines.reduce((sum,{row,qty}) => sum + row.cost*qty, 0);
                basket.net = basket.lines.reduce((sum,{row,qty}) => sum + row.net*qty, 0);
                basket.roi = basket.net / basket.cost;
                renderBasket(basket);
                const note = root.querySelector('[data-basket] > p');
                note.textContent = `Senaryo • Fiyatlar güncellendi; ürünler ve adetler korundu. Emir limitlerini oyunda yeniden doğrulayın.${basket.cost > num('budget') ? ' Güncel maliyet bütçeyi aşıyor.' : ''}${basket.lines.some(({row})=>!row.safe) ? ' Sepette riskli fiyat var.' : ''}`;
            }
            updateMonitor(result.historyError || missing.length ? 'partial' : 'complete', {message:result.historyError || (missing.length ? 'Bazı tekliflerin güncel eşleşmesi yok; önceki fiyatlar riskli olarak korundu.' : 'Canlı fiyatlar güncellendi. Liste ve sepet korundu; emir limitlerini oyunda doğrulayın.')});
        }
    } catch (error) {
        if (!controller.signal.aborted) updateMonitor('partial', {message:error.message});
    } finally { liveController = null; if (liveQueue.size && state.scan && !state.busy) void refreshLivePrices({items:[...liveQueue]}); }
}
async function main() {
    cities=loadActiveCities().filter(city=>city.marketApiName !== BLACK_MARKET);
    items=getAll('items').filter(isMarketCatalogItem);
    await Promise.all([...new Set(['black-market','flipper','scan','cart','profit','order-book','confidence','risk','quality', ...Object.values(SORT_ICONS)])].map(async name=>{
        const response=await fetch(`content/icons/flipper/${name}.svg`); if(response.ok) icons[name]=await response.text();
    }));
    layout(); root.addEventListener('keydown', event => {
        if (event.target.matches('[data-select]') && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            const id = event.target.dataset.select;
            state.selected = id; render();
            root.querySelectorAll('[data-select]').forEach(row => { if (row.dataset.select === id) row.focus(); });
        }
    });
    root.addEventListener('click',event=>{
        const metric = event.target.closest('[data-flipper-metric]');
        if (metric) {
            metricFilter = metricFilter === metric.dataset.flipperMetric ? 'all' : metric.dataset.flipperMetric;
            render();
            root.querySelector(`[data-flipper-metric="${metric.dataset.flipperMetric}"]`).focus();
            return;
        }
        const sort = event.target.closest('[data-flipper-sort]');
        if (sort) { state.sort = sort.dataset.flipperSort; savePreferences(); render(); return; }
        const choice = event.target.closest('[data-choice-filter]');
        if (choice && field(choice.dataset.choiceFilter).value !== choice.dataset.choiceValue) {
            const key = choice.dataset.choiceFilter;
            field(key).value = choice.dataset.choiceValue;
            root.querySelectorAll(`[data-choice-filter="${key}"]`).forEach(button => {
                const active = button === choice;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            filtersChanged(key);
        }
        if(event.target.closest('[data-scan]')) scan();
        if(event.target.closest('[data-fill]')) fill();
        const chosen=event.target.closest('[data-select]'); if(chosen) {state.selected=chosen.dataset.select;render();}
        if(event.target.closest('[data-confirm]')) {
            const row=state.rows.find(row=>row.id===state.selected);
            const quantity=Number(root.querySelector('[data-limit="quantity"]').value),weight=Number(root.querySelector('[data-limit="weight"]').value);
            if(!Number.isSafeInteger(quantity)||quantity<=0||!Number.isFinite(weight)||weight<=0) {root.querySelector('[data-limit-status]').textContent='Pozitif tam adet ve gerçek ağırlık girin.';return;}
            for(const other of state.rows) if(other.itemId===row.itemId && (other.target===row.target || other.source===row.source) && other.quality===row.quality) delete state.limits[other.id];
            state.limits[row.id]={quantity,weight};state.basket=null;root.querySelector('[data-basket]').textContent='Adaylar değişti; Yükümü Doldur ile yeniden hesaplayın.';renderDetail(row);
        }
    });
    root.addEventListener('input', event => { if (event.target.matches('[data-filter]')) savePreferences(); });
    root.addEventListener('change',event=>{
        const key=event.target.dataset.filter; if(!key)return;
        filtersChanged(key);
    });
    bindLivePrices(()=>({items:state.rows.map(row=>row.itemId),cities:[...new Set(state.rows.flatMap(row=>[row.source,row.target]))],pause:state.busy || !state.scan}),refreshLivePrices);
}
main().catch(error=>{root.textContent=`Flipper açılamadı: ${error.message}`;});
