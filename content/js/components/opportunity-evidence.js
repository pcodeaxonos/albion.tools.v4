import { cityNameHtml } from './city-name.js';
import { STRATEGY_SPECS } from '../core/opportunity-status.mjs';
import { CHECK_RESULTS, TRADE_EVENTS, emptyEvidence, signalSnapshot, verification, tradeAccounting, evidenceReport, freshnessBand, opportunityKey, evidenceCanonical, OPPORTUNITY_EVIDENCE_API } from '../core/opportunity-evidence.mjs';
import { itemNameHtml } from './item-name.js';
import { itemLabel } from './item-icon.js';
import { getItemByUniqueName } from '../db/relations.js';
import { initFloatingLabels } from './forms.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { escapeHtml } from '../utils/utils.js';
import { formatSilver } from '../utils/format.js';
import { readJsonStorage, writeJsonStorage, removeStorage } from '../core/storage.js';
import { flushDurableWrites } from '../core/durable-storage.mjs';
import { cityFilterFieldHtml, bindCityField } from './city-picker.js';

const API_PATH = OPPORTUNITY_EVIDENCE_API, OUTBOX_KEY = 'opp-evidence-outbox-v1';
const sideLabel = { buy: 'Alış tarafı', sell: 'Satış tarafı' };
const statusLabel = { open: 'Açık', completed: 'Tamamlandı', cancelled: 'İptal · stok korunur' };
const number = value => value === '' ? null : Number(value);
const localDate = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const field = (key, label, control) => `<div class="form-floating">${control}<label for="evidence-${key}">${escapeHtml(label)}</label></div>`;
const input = (key, label, value = '', type = 'number') => field(key, label, `<input id="evidence-${key}" class="form-control" data-evidence-field="${key}" type="${type}" value="${escapeHtml(value)}"${type === 'number' ? ' min="0" step="any"' : ''}>`);
const select = (key, label, values, chosen = '') => field(key, label, `<select id="evidence-${key}" class="form-select" data-evidence-field="${key}">${Object.entries(values).map(([value, title]) => `<option value="${escapeHtml(value)}"${chosen === value ? ' selected' : ''}>${escapeHtml(title)}</option>`).join('')}</select>`);
const table = (head, rows) => `<div class="calc-table-wrap table-responsive"><table class="table table-striped calc-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const dateText = value => escapeHtml(new Date(value).toLocaleString('tr-TR'));

export function createOpportunityEvidenceUI({ hub, reportHost }) {
    let state = emptyEvidence(), loaded = false, error = '', pending = readJsonStorage(OUTBOX_KEY), busy = false;
    let detail = null, filters = {}, selectedTrade = '', message = '', loadRequest = 0;
    const drafts = new Map();
    const request = async (options = {}) => {
        const response = await fetch(hub() + API_PATH, { ...options, signal: AbortSignal.timeout(10000) });
        const body = await response.json(); if (!response.ok) { const e = Error(body.error || 'V6 kayıt servisi yanıt vermedi.'); e.status = response.status; throw e; } return body;
    };
    async function load() {
        const revision = ++loadRequest;
        try { const next = await request(); if (revision !== loadRequest) return; state = next; loaded = true; error = ''; }
        catch (e) { if (revision !== loadRequest) return; error = e.message || 'V6 kayıt servisine bağlanılamadı.'; }
        render();
    }
    async function submit(command) {
        if (busy) return;
        busy = true;
        try {
            if (!pending) {
                pending = { requestId: crypto.randomUUID(), command };
                if (!writeJsonStorage(OUTBOX_KEY, pending)) { pending = null; throw Error('İstek kimliği kaydedilemedi; kayıt gönderilmedi.'); }
            } else if (command) throw Error('Önce bekleyen isteği aynı kimlikle yeniden gönderin.');
            await flushDurableWrites();
            const submittedCommand = pending.command;
            const response = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending) });
            if (pending.command.type === 'start') selectedTrade = response.requestId;
            if (!removeStorage(OUTBOX_KEY)) throw Error('Kayıt alındı; bekleyen istek temizlenemedi. Aynı kimlikle yeniden deneyebilirsiniz.');
            await flushDurableWrites();
            if (submittedCommand.type === 'event') drafts.delete('trade-' + submittedCommand.tradeId);
            if (submittedCommand.type === 'start') { const key = 'check-' + JSON.stringify(detail?.snapshot); const draft = drafts.get(key) || {}; for (const name of ['initialPrice', 'initialQuantity', 'initialTax', 'initialFee', 'initialExtra', 'initialAt']) delete draft[name]; drafts.set(key, draft); }
            pending = null; message = 'Servise kalıcı olarak kaydedildi.'; await load();
        } catch (e) { message = e.message; if (e.status === 400 && removeStorage(OUTBOX_KEY)) pending = null; }
        finally { busy = false; render(); }
    }
    function statusHtml() {
        return `<p role="status" data-evidence-message>${escapeHtml([message, error].filter(Boolean).join(' '))}</p>${pending ? '<p>Yanıtı kesinleşmemiş kayıt var. Yeniden gönderme aynı kimliği kullanır; ikinci kontrol/gerçekleşme oluşturmaz.</p><button class="btn btn-sm btn-outline-secondary" type="button" data-evidence-retry>Bekleyen kaydı yeniden gönder</button>' : ''}`;
    }
    function snapshotId(s) { return Object.entries(state.signals).find(([, candidate]) => evidenceCanonical(candidate) === evidenceCanonical(s) || (opportunityKey(candidate) === opportunityKey(s) && candidate.observedAt === s.observedAt && evidenceCanonical(candidate.legs) === evidenceCanonical(s.legs)))?.[0]; }
    function summary(t) {
        const a = tradeAccounting(t);
        return `<div class="opp-trade-summary"><span>Gerçekleşmiş net<strong>${formatSilver(a.realizedNet)}</strong></span><span>Kalan stok<strong>${a.remaining} adet</strong></span><span>Bağlı sermaye<strong>${formatSilver(a.tiedCapital)}</strong></span></div><p>${escapeHtml(statusLabel[t.status])} · Alınan ${a.bought} / satılan ${a.sold}</p><details><summary>Muhasebe ayrıntısı</summary>` + table(['Gerçek muhasebe', 'Silver'], [
            ['Alış bedeli', a.purchaseGross], ['Gerçekleşen brüt satış', a.salesGross], ['Satış sonrası tahsilat', a.saleNet],
            ['Vergi / emir ücreti / ek gider', `${formatSilver(a.tax)} / ${formatSilver(a.fee)} / ${formatSilver(a.extra)}`],
            ['Satılan stoğun FIFO maliyeti', a.costOfSales], ['Gerçekleşmiş net kâr/zarar', a.realizedNet],
            ['Kalan stok · alış maliyeti', a.inventoryCost], ['Açık alış emirleri için ayrılan', a.reservedPurchase], ['Bağlı sermaye', a.tiedCapital], ['Net nakit hareketi', a.cashFlow]
        ].map(([label, value]) => `<tr><th>${label}</th><td>${typeof value === 'number' ? formatSilver(value) : value}</td></tr>`)) +
        '<small>FIFO: alış gerçekleşmesinin vergi, ücret ve ek gideri stok maliyetine dahil. Emir açma/iptal ücretleri ve ayrı giderler ödendiği anda sonuca dahil. Kalan stoğun değeri satış tahmini değildir. İptal edilmiş işlemde kalan stok hâlâ bağlı sermayedir.</small></details>';
    }
    function uniqueFields(html, prefix) { return html.replaceAll('id="evidence-', `id="evidence-${prefix}-`).replaceAll('for="evidence-', `for="evidence-${prefix}-`); }
    function tradeHtml(t, scope = 'detail') {
        const a = tradeAccounting(t), key = 'trade-' + t.id, draft = drafts.get(key) || {}, signal = state.signals[t.signalId];
        return uniqueFields(`<section data-evidence-trade="${escapeHtml(t.id)}"><h4>${itemNameHtml(state.signals[t.signalId].name)} · ${escapeHtml(statusLabel[t.status])}</h4>${summary(t)}
            <p>Başlangıç sinyali: ${dateText(signal.observedAt)} · ${cityNameHtml(signal.city)} → ${cityNameHtml(signal.toCity)} · Q${signal.quality} · ${escapeHtml(signal.server)}. Başlangıçta ${t.verificationAtStart.verified}/${t.verificationAtStart.required} taraf olumlu kontrol edildi; sonraki kontroller bu tarihsel durumu değiştirmez.</p>
            ${t.status === 'open' ? `<form data-evidence-event-form><div class="tool-split"><div class="tool-split-controls">
            ${select('eventType', 'Kayıt türü', TRADE_EVENTS, draft.eventType || 'sell')}
            ${select('eventSide', 'Açık emir yönü', sideLabel, draft.eventSide || 'sell')}
            ${select('orderId', 'İlgili açık emir (dolum / iptal)', { '': 'Emirsiz gerçekleşme', ...Object.fromEntries(a.openOrders.map(o => [o.id, `${sideLabel[o.side]} · ${o.remaining} adet · ${o.price}`])) }, draft.orderId || '')}
            ${input('eventPrice', 'Gerçek birim fiyat / emir fiyatı', draft.eventPrice ?? '')}
            ${input('eventQuantity', 'Gerçek miktar / emir miktarı', draft.eventQuantity ?? '')}
            <details><summary>Ödenen vergi, ücret, gider ve tarih</summary>${input('eventTax', 'Ödenen vergi · toplam silver', draft.eventTax ?? 0)}
            ${input('eventFee', 'Ödenen emir ücreti · toplam silver', draft.eventFee ?? 0)}
            ${input('eventExtra', 'Ödenen ek gider · toplam silver', draft.eventExtra ?? 0)}
            ${input('eventAt', 'Gerçekleşme / emir tarihi', draft.eventAt || localDate(), 'datetime-local')}</details>
            <button class="btn btn-sm btn-primary"${pending || busy || !loaded ? ' disabled' : ''}>Gerçekleşmeyi / emri kaydet</button></div><div class="tool-split-result"><p>Yalnız gerçekten gerçekleşen alış/satış miktarını girin. Açık emir dolumu için ilgili emri seçin. Her kısmi dolum ayrı kayıttır; kalan emir ve stok korunur. Vergi, ücret veya gider alanında 0, bu tutarı ödemediğinizi belirttiğiniz anlamına gelir. Ödenmiş tutarları ayrıca girin.</p><p>İptal, gerçekleşmiş satışları silmez. Tamamlama için elde stok ve açık emir kalmamalı. Ücretleri aynı olayda yalnız bir kez girin.</p></div></div></form>` : ''}
            <details><summary>${t.events.length} gerçekleşme / emir kaydı</summary>${table(['Tarih', 'Kayıt', 'Adet', 'Fiyat', 'Vergi / ücret / gider'], t.events.map(e => `<tr><td>${dateText(e.at)}</td><td>${escapeHtml(TRADE_EVENTS[e.type])}${e.side ? ` · ${sideLabel[e.side]}` : ''}</td><td>${e.quantity ?? '—'}</td><td>${e.price == null ? '—' : formatSilver(e.price)}</td><td>${formatSilver(e.tax)} / ${formatSilver(e.fee)} / ${formatSilver(e.extra)}</td></tr>`))}</details></section>`, scope + '-' + t.id);
    }
    function renderDetail() {
        if (!detail?.host.isConnected) return;
        const { host, tradeHost, snapshot: s } = detail, id = snapshotId(s), v = verification(state, id), key = 'check-' + JSON.stringify(s), draft = drafts.get(key) || {};
        if (!Object.keys(s.legs).length) { host.innerHTML = '<p>Bu stratejide kontrol edilecek fiyat kanıtı yok.</p>'; if(tradeHost) tradeHost.innerHTML = '<p>Önce fiyat kanıtı olan bir fırsat seçin.</p>'; return; }
        const checks = state.checks.filter(c => c.signalId === id), trades = Object.values(state.trades).filter(t => opportunityKey(state.signals[t.signalId]) === opportunityKey(s));
        const positive = Object.values(v.sides).filter(c => ['correct', 'executable'].includes(c?.result));
        host.innerHTML = `<p data-evidence-progress>${v.verified}/${Object.keys(s.legs).length} taraf olumlu kontrol edildi. ${v.complete ? 'Gerekli taraflar kontrol edildi.' : 'Diğer taraf ayrıca kontrol edilmeli.'}</p>${statusHtml()}<div class="opp-check-grid">${Object.entries(s.legs).map(([side, leg]) => {
            const chosen = draft['result-'+side] || 'correct';
            return `<form class="opp-check-side tool-split-controls" data-evidence-check-form="${side}"><header><span>${sideLabel[side]}</span><h3>${cityNameHtml(leg.city)}</h3><span>Beklenen ${escapeHtml(leg.marketSide)} fiyatı</span><strong>${formatSilver(leg.price)}</strong><small>${escapeHtml(CHECK_RESULTS[v.sides[side]?.result] || 'Henüz kontrol edilmedi')}</small></header>
            <div class="filter-choice-grid" style="--filter-choice-columns:2" role="radiogroup" aria-label="${sideLabel[side]} kontrol sonucu">${Object.entries(CHECK_RESULTS).map(([result,label]) => `<button type="button" class="segmented-choice-button segmented-choice-button--compact${result === chosen ? ' is-active' : ''}" role="radio" aria-checked="${result === chosen}" tabindex="${result === chosen ? 0 : -1}" data-evidence-result="${result}">${escapeHtml(label)}</button>`).join('')}</div>
            <details data-check-observations${['changed','quantity'].includes(chosen) ? ' open' : ''}><summary>Gözlenen fiyat, miktar ve tarih</summary><small>Oyun paketinde görülen miktar tek emir ve paket alınma anına aittir; güncel toplam kapasite değildir. Buraya oyunda kontrol ettiğiniz miktarı girin.</small>
            ${input('observedPrice-'+side,'Gözlenen fiyat',draft['observedPrice-'+side] ?? '')}
            ${input('availableQuantity-'+side,'Gözlenen emir miktarı',draft['availableQuantity-'+side] ?? '')}
            ${input('checkAt-'+side,'Kontrol tarihi',draft['checkAt-'+side] || localDate(),'datetime-local')}</details>
            <button class="btn btn-sm btn-primary"${pending || busy || !loaded ? ' disabled' : ''}>${sideLabel[side]} kontrolünü kaydet</button></form>`;
        }).join('')}</div>
        <p class="tool-result-note">Taraflar ayrı kaydedilir. Kontrol kaydı bir alış/satış gerçekleşmesi değildir.</p>
        ${checks.length ? `<details><summary>${checks.length} kontrol kaydı</summary>${table(['Tarih','Taraf','Sonuç','Fiyat / miktar'], checks.map(c=>`<tr><td>${dateText(c.at)}</td><td>${sideLabel[c.side]}</td><td>${escapeHtml(CHECK_RESULTS[c.result])}</td><td>${c.observedPrice ?? '—'} / ${c.availableQuantity ?? '—'}</td></tr>`))}</details>` : ''}`;
        bindCommon(host);
        bindDraft(host,key);
        host.querySelectorAll('[data-evidence-check-form]').forEach(form => {
            const side = form.dataset.evidenceCheckForm, buttons = [...form.querySelectorAll('[data-evidence-result]')];
            const choose = button => {
                buttons.forEach(other => { const on = other === button; other.classList.toggle('is-active',on); other.setAttribute('aria-checked',String(on)); other.tabIndex=on?0:-1; });
                drafts.set(key,{...(drafts.get(key)||{}),['result-'+side]:button.dataset.evidenceResult});
                if(['changed','quantity'].includes(button.dataset.evidenceResult)) form.querySelector('[data-check-observations]').open=true;
            };
            buttons.forEach(button=>button.addEventListener('click',()=>choose(button)));
            form.querySelector('[role="radiogroup"]').addEventListener('keydown',e=>{
                if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
                const index=buttons.indexOf(document.activeElement), next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+buttons.length)%buttons.length;
                e.preventDefault();choose(buttons[next]);buttons[next].focus();
            });
            form.addEventListener('submit',e=>{e.preventDefault();const values=fields(form);submit({type:'check',snapshot:s,side,result:form.querySelector('[aria-checked="true"]').dataset.evidenceResult,at:iso(values['checkAt-'+side]),observedPrice:number(values['observedPrice-'+side]),availableQuantity:number(values['availableQuantity-'+side])});});
        });
        if(!tradeHost)return;
        tradeHost.innerHTML = `${statusHtml()}<p>${v.complete ? 'Gerekli taraf kontrolleri olumlu.' : 'Rota kısmen doğrulandı; diğer tarafın koşulları hâlâ belirsiz.'}</p>
            <h3>Gerçek işlem başlat</h3><form data-evidence-start-form><div class="tool-split"><div class="tool-split-controls">
                ${select('initialType', 'İşlem başlangıcı', { buy: 'Gerçek alış gerçekleşti', order: 'Alış emri açık · henüz dolmadı' }, draft.initialType || 'buy')}
                ${input('initialPrice', 'Gerçek alış / emir birim fiyatı', draft.initialPrice ?? '')}
                ${input('initialQuantity', 'Gerçek alış / emir miktarı', draft.initialQuantity ?? '')}
                <details><summary>Ödenen vergi, ücret, gider ve tarih</summary>${input('initialTax', 'Ödenen vergi · toplam silver', draft.initialTax ?? 0)}
                ${input('initialFee', 'Ödenen emir ücreti · toplam silver', draft.initialFee ?? 0)}
                ${input('initialExtra', 'Ödenen ek gider · toplam silver', draft.initialExtra ?? 0)}
                ${input('initialAt', 'Alış / emir tarihi', draft.initialAt || localDate(), 'datetime-local')}</details>
                <button class="btn btn-sm btn-primary"${!positive.length || pending || busy || !loaded ? ' disabled' : ''}>Gerçek işlemi başlat</button>
            </div><div class="tool-split-result"><p>Fiyatlar ve miktar otomatik olarak teorik senaryodan alınmaz. Başlangıç kontrolü, doğrulanmış taraflar ve sinyal birlikte saklanır.</p></div></div></form>
            ${trades.map(t=>`<details data-trade-disclosure="${t.id}"${selectedTrade === t.id ? ' open' : ''}><summary>${itemNameHtml(state.signals[t.signalId].name)} · ${escapeHtml(statusLabel[t.status])}</summary>${tradeHtml(t)}</details>`).join('')}`;
        tradeHost.querySelectorAll('[data-trade-disclosure]').forEach(el=>el.addEventListener('toggle',()=>{if(el.open)selectedTrade=el.dataset.tradeDisclosure;else if(selectedTrade===el.dataset.tradeDisclosure)selectedTrade='';}));
        bindCommon(tradeHost); bindDraft(tradeHost,key);
        tradeHost.querySelector('[data-evidence-start-form]').addEventListener('submit',e=>{
            e.preventDefault();const values=fields(e.currentTarget);
            submit({type:'start',snapshot:s,checkId:positive.at(-1)?.id,at:iso(values.initialAt),initial:{type:values.initialType,side:'buy',price:number(values.initialPrice),quantity:number(values.initialQuantity),tax:number(values.initialTax),fee:number(values.initialFee),extra:number(values.initialExtra)}});
        });
        bindTrades(tradeHost);
    }
    function fields(form) { return Object.fromEntries([...form.querySelectorAll('[data-evidence-field]')].map(el => [el.dataset.evidenceField, el.value])); }
    function iso(value) { try { return new Date(value).toISOString(); } catch { return value; } }
    function bindDraft(host, key) {
        const save = () => drafts.set(key, { ...(drafts.get(key) || {}), ...fields(host) });
        host.querySelectorAll('[data-evidence-field]').forEach(el => { el.addEventListener('input', save); el.addEventListener('change', save); });
    }
    function bindCommon(host) {
        host.querySelectorAll('[data-evidence-retry]').forEach(el => el.addEventListener('click', () => submit()));
        initFloatingLabels(host); bindCalcSticky(host);
    }
    function bindTrades(host) {
        host.querySelectorAll('[data-evidence-trade]').forEach(el => {
            const id = el.dataset.evidenceTrade, form = el.querySelector('[data-evidence-event-form]'); if (!form) return;
            bindDraft(form, 'trade-' + id);
            const eventChoice = form.querySelector('[data-evidence-field="eventType"]');
            const visibility = () => {
                const type = eventChoice.value;
                for (const [key, visible] of Object.entries({ eventSide: type === 'order', orderId: ['buy', 'sell', 'cancel'].includes(type), eventPrice: ['buy', 'sell', 'order'].includes(type), eventQuantity: ['buy', 'sell', 'order'].includes(type) })) form.querySelector('[data-evidence-field="' + key + '"]').closest('.form-floating').hidden = !visible;
                form.querySelectorAll('[data-evidence-field="eventTax"], [data-evidence-field="eventFee"], [data-evidence-field="eventExtra"]').forEach(el => el.closest('.form-floating').hidden = ['complete', 'abandon'].includes(type));
            };
            eventChoice.addEventListener('change', visibility); visibility();
            form.addEventListener('submit', e => {
                e.preventDefault(); const v = fields(form);
                const closing = ['complete', 'abandon'].includes(v.eventType);
                submit({ type: 'event', tradeId: id, at: iso(v.eventAt), event: { type: v.eventType, side: v.eventSide,
                    orderId: ['sell', 'buy', 'cancel'].includes(v.eventType) ? v.orderId || undefined : undefined,
                    price: number(v.eventPrice), quantity: number(v.eventQuantity), tax: closing ? 0 : number(v.eventTax), fee: closing ? 0 : number(v.eventFee), extra: closing ? 0 : number(v.eventExtra) } });
            });
        });
    }
    function renderReport() {
        const host = reportHost(); if (!host) return;
        const report = evidenceReport(state, filters), signals = Object.values(state.signals);
        const isEmpty = state.checks.length === 0 && Object.keys(state.trades).length === 0;
        const options = key => ({ '': 'Tümü', ...Object.fromEntries([...new Set(signals.flatMap(s => key === 'city' ? [s.city, s.toCity] : [key === 'freshness' ? freshnessBand(s) : s[key]]))].sort().map(v => [v, key === 'strategy' ? STRATEGY_SPECS[v]?.label || v : v])) });
        const cityOptions = Object.keys(options('city')).filter(Boolean);
        const chosen = report.trades.find(t => t.id === selectedTrade);
        const opener = host.ownerDocument.querySelector('[data-evidence-open-report]');
        if (opener) opener.textContent = `Performans · ${report.attempts}/${report.trades.length}`;
        host.innerHTML = `<div class="opp-performance-body">${statusHtml()}
            <div class="opp-control-row">${loaded && isEmpty ? '<p>Henüz kontrol veya işlem kaydı yok. Fırsat detayındaki Kontrol sekmesinden başlayın.</p>' : ''}<div class="opp-actions"><button class="btn btn-sm btn-outline-secondary" data-evidence-refresh type="button">Kayıtları yenile</button><button class="btn btn-sm btn-outline-secondary" data-evidence-export type="button"${!loaded ? ' disabled' : ''}>Kanıtları JSON olarak indir</button></div></div>
            ${loaded && isEmpty ? '' : loaded ? `<div class="tool-split tool-split--stacked"><div class="tool-split-controls tool-controls-grid">${[['server', 'Sunucu'], ['strategy', 'Fırsat türü'], ['city', 'Şehir / rota'], ['productGroup', 'Ürün grubu'], ['freshness', 'Sinyal anında fiyat güncelliği']].map(([key, label]) => key === 'city' ? cityFilterFieldHtml({ id: 'evidence-city', label, selected: filters.city || '', values: cityOptions, className: '' }) : select('filter-' + key, label, options(key), filters[key] || '')).join('')}</div><div class="tool-split-result">
            ${table(['Ölçüm', 'Sonuç'], [['Kontrol edilen farklı fırsat', report.checked], ['Kontrol kayıtları (tüm tarihler)', report.attempts], ['Fiyat doğruluğu · doğru / (doğru + değişmiş)', report.accuracy == null ? 'Henüz fiyat kontrolü yok' : `${(report.accuracy * 100).toFixed(1)}% · ${report.correct}/${report.priceChecks} taraf`], ['Fiyat değişmiş taraf', report.changed], ['Miktarı yetersiz taraf', report.insufficient], ['Emir bulunamayan taraf', report.missing], ['İşleme dönüşen farklı fırsat', report.converted], ['Tamamlanan işlem', report.completed], ['Gerçekleşmiş net kâr/zarar', formatSilver(report.realizedNet)], ['Stok / açık alış emrinde bağlı sermaye', formatSilver(report.tiedCapital)]].map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`))}
            <details><summary>Ölçüm kuralları</summary><p>Fiyat oranı, her fırsat ve tarafın son açık fiyat değerlendirmesini kullanır; miktar kontrolü bu fiyat sonucunu silmez. yalnız “Fiyat doğru” ve “Fiyat değişmiş” paydada bulunur. Kontrol edilmedi / kontrol edilemedi başarısız sayılmaz. Tüm tarihsel kontroller indirilen kanıtlarda korunur. Gruplanmış rotaların ortak hedef miktarı kâr gibi toplanmaz.</p>
            <p>İlk 20–30 gerçek kullanıcı kontrolünün ardından sinyal, güncellik ve miktar sorunları incelenebilir. Otomatik öğrenme veya V5 filtre/sıralama değişikliği uygulanmaz.</p></details></div></div>
            ${report.trades.length ? table(['Ürün', 'Rota / sunucu', 'Durum', 'Stok', 'Gerçek net', 'Kayıtlar'], report.trades.map(t => { const s = state.signals[t.signalId], a = tradeAccounting(t); return `<tr><td>${itemNameHtml(s.name)}</td><td>${cityNameHtml(s.city)} → ${cityNameHtml(s.toCity)} · ${escapeHtml(s.server)} · Q${s.quality}</td><td>${escapeHtml(statusLabel[t.status])}</td><td>${a.remaining}</td><td>${formatSilver(a.realizedNet)}</td><td><button type="button" class="btn btn-sm btn-outline-secondary" data-evidence-open-trade="${escapeHtml(t.id)}">İşlemi yönet</button></td></tr>`; })) : '<p>Henüz gerçek işlem kaydı yok.</p>'}
            ${chosen ? tradeHtml(chosen, 'report') : ''}` : '<p>Kalıcı kayıt servisi yüklenmeden sonuç veya başarı oranı gösterilmez.</p>'}</div>`;
        host.querySelector('[data-evidence-refresh]').addEventListener('click', load);
        host.querySelector('[data-evidence-export]').addEventListener('click', () => {
            const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), accountingPolicy: 'FIFO landed acquisition costs; order fees and expenses recognized at payment; no unrealized receipts', ...state }, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = 'albion-opportunity-evidence.json'; a.hidden = true; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        host.querySelectorAll('[data-evidence-field^="filter-"]').forEach(el => el.addEventListener('change', () => { filters[el.dataset.evidenceField.slice(7)] = el.value; renderReport(); }));
        bindCityField(host, 'evidence-city', value => { filters.city = value; renderReport(); }, { syncPeers: false });
        host.querySelectorAll('[data-evidence-open-trade]').forEach(el => el.addEventListener('click', () => { selectedTrade = el.dataset.evidenceOpenTrade; renderReport(); }));
        bindCommon(host); bindTrades(host);
    }
    function render() { renderReport(); renderDetail(); }
    return { load, renderReport, mount(host, row, context) {
        const item = getItemByUniqueName(row.itemId);
        const panelOpen = detail?.host.querySelector('[data-evidence-panel]')?.open ?? detail?.panelOpen ?? false;
        const { tradeHost, ...snapshotContext } = context;
        detail = { host, tradeHost, panelOpen, snapshot: signalSnapshot(row, { ...snapshotContext, name: itemLabel(row.itemId), productGroup: item?.shopSubCategory || item?.shopCategory || item?.itemType || 'Bilinmiyor' }) };
        renderDetail();
    } };
}
