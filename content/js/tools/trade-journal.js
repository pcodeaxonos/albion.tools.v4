import { toolPageHtml } from '../core/app-runtime.js';
import { bindTradeLive, fetchTradeSnapshot, fetchTradeStatus } from '../core/trade-live.js';
import { JOURNAL_ZONE, journalDay, shiftJournalDay, mergeJournalTrades, journalGroups, journalHighlights } from '../core/trade-journal.mjs';
import { journalReadKey, journalIsUnread, saveJournalRead } from '../core/trade-journal-read.mjs';
import { reloadDurableStorage } from '../core/durable-storage.mjs';
import { itemNameHtml } from '../components/item-name.js';
import { itemIconHtml, itemLabel, itemTierBadgeHtml } from '../components/item-icon.js';
import { cityNameHtml } from '../components/city-name.js';
import { routeHref } from '../core/routes.js';
import { escapeHtml as esc } from '../utils/utils.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';

const root = document.querySelector('[data-trade-journal]');
const number = value => Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const time = value => new Date(value).toLocaleTimeString('tr-TR', { timeZone: JOURNAL_ZONE, hour: '2-digit', minute: '2-digit' });
let day = journalDay(Date.now()), records = new Map(), model = null, scope = null, loaded = false, error = '', readError = '', live = false, received = null;
let generation = 0, busy = false, onlyUnread = false, expanded = new Set(), allEvents = false, revision = 0, syncing = false;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('albiontools-trade-journal') : null;

root.innerHTML = toolPageHtml({ key: 'trade-journal', layout: 'stacked',
    head: '<section class="page-head" data-page-head="trade-journal"><h1>Ticaret Günlüğü</h1><p>O günün ticaret özeti</p></section>',
    controls: `<div class="journal-navigation"><button type="button" class="btn btn-outline-secondary" data-shift="-1" aria-label="Önceki gün">←</button><div class="form-floating"><input type="date" class="form-control" data-day value="${day}" aria-label="Seçili gün"><label>Seçili gün</label></div><button type="button" class="btn btn-outline-secondary" data-shift="1" aria-label="Sonraki gün">→</button><button type="button" class="btn btn-outline-secondary" data-today>Bugün</button><span data-unread role="status"></span><label class="form-check"><input class="form-check-input" type="checkbox" data-only-unread><span class="form-check-label">Sadece okunmamış</span></label><button type="button" class="btn btn-outline-primary" data-read-day>Günün tümünü okundu yap</button><button type="button" class="btn btn-outline-secondary" data-refresh>Yenile</button><small>${JOURNAL_ZONE} · Europe</small></div>`,
    result: '<div class="journal-content" data-content></div>' });
const content = root.querySelector('[data-content]');
const readCount = () => model?.groups.filter(journalIsUnread).length || 0;
function identity(group) {
    return `${itemIconHtml(group.itemId, { visual: true })}<span class="journal-identity">${itemNameHtml(itemLabel(group.itemId, group.name))}<small>${cityNameHtml(group.city)} · ${itemTierBadgeHtml(group.itemId, { format: 'text' })} · ${group.quality == null ? 'Kalite bilinmiyor' : `Q${group.quality}`} · ${group.side === 'sell' ? 'Satış' : 'Alış'}</small></span>`;
}
function card(group, reason = '') {
    const index = model.groups.indexOf(group), unread = journalIsUnread(group);
    return `<article class="journal-group${unread ? ' is-unread' : ''}" data-group="${index}" tabindex="0" role="button" aria-label="İşlem ayrıntıları" aria-haspopup="dialog">${identity(group)}<span class="journal-amount">${reason ? `<small>${esc(reason)}</small>` : ''}<strong>${number(group.total)} Silver</strong><small>${number(group.quantity)} adet · Ort. ${number(group.average)} · ${group.trades.length} işlem · ${time(group.last)}</small></span><button type="button" class="btn btn-outline-secondary btn-icon-only" data-mark="${index}" aria-label="${unread ? 'Okundu işaretle' : 'Okunmadı işaretle'}" data-app-tooltip="${unread ? 'Okundu işaretle' : 'Okunmadı işaretle'}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${unread ? '<path d="m5 12 4 4L19 6"/>' : '<circle cx="12" cy="12" r="8"/>'}</svg></button></article>`;
}
function render() {
    const count = readCount();
    root.querySelector('[data-unread]').textContent = `${count} okunmamış grup`;
    root.querySelector('[data-read-day]').disabled = busy || !loaded || !scope || !count;
    const stateLine = `<p class="journal-status" role="status">${esc(error || (loaded ? `${live ? 'Canlı' : 'Canlı bağlantı yok; yeniden bağlanılıyor'} · Son alım ${received ? time(received) : '—'}` : 'Güncelleniyor…'))}</p>${readError ? `<p class="text-danger" role="alert">${esc(readError)}</p>` : ''}`;
    if (!model || !loaded) { content.innerHTML = stateLine; return; }
    const highlights = journalHighlights(model, journalIsUnread).filter(e => !onlyUnread || journalIsUnread(e.group));
    const block = (side, label) => {
        const groups = model.groups.filter(g => g.side === side && (!onlyUnread || journalIsUnread(g)));
        return `<section class="journal-block"><h2>${label} <small>${groups.length} grup</small></h2>${groups.slice(0, expanded.has(side) ? groups.length : 5).map(g => card(g)).join('') || `<p>${onlyUnread ? 'Okunmamış grup yok.' : 'Bu gün gerçekleşmiş işlem yok.'}</p>`}${groups.length > 5 ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-expand="${side}">${expanded.has(side) ? 'Daralt' : 'Tümünü göster'}</button>` : ''}</section>`;
    };
    content.innerHTML = `${stateLine}<div class="journal-metrics">${[['Satış toplamı',model.sales],['Alış toplamı',model.buys],['Net nakit akışı',model.net]].map(([label,value]) => `<div><small>${label}</small><strong>${number(value)} Silver</strong></div>`).join('')}</div><section><h2>Günün özeti</h2><p>${model.count ? `${model.groups.filter(g=>g.side==='sell').reduce((n,g)=>n+g.trades.length,0)} satış ve ${model.groups.filter(g=>g.side==='buy').reduce((n,g)=>n+g.trades.length,0)} alış, ${model.groups.length} ürün/şehir/kalite grubunda gerçekleşti.` : 'Seçili günde gerçekleşmiş alış/satış kaydı yok.'}</p></section><section><h2>Dikkat çekenler</h2>${highlights.slice(0, allEvents ? highlights.length : 3).map(e => card(e.group,e.reason)).join('') || '<p>Bu kapsamda doğrulanmış önemli hareket yok.</p>'}${highlights.length > 3 ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-events>${allEvents ? 'Daralt' : 'Diğer olayları göster'}</button>` : ''}</section><div class="journal-flows">${block('sell','Satılanlar')}${block('buy','Alınanlar')}</div><footer><p>Tutarlar vergi öncesi ciro ve nakit akışıdır; kâr değildir. ${model.skipped} geçersiz/kimliksiz kayıt atlandı; ${model.excluded} alış/satış dışı kayıt özete alınmadı (arşiv geneli).</p><p>Veri durumu: Emir iptalleri mevcut kaynaktan doğrulanamıyor. İşlem zamanına uygun doğrulanmış piyasa referansı bulunmadığından avantajlı fiyat etiketi üretilmiyor.</p><a href="${routeHref('trades')}">Trade Dashboard'da incele</a></footer>`;
}
async function recompute() {
    const token = ++generation;
    const next = journalGroups(records, day);
    await Promise.all(next.groups.map(async group => { group.readKey = await journalReadKey(scope, group); }));
    if (token !== generation) return;
    model = next; render();
}
async function mark(groups, read) {
    if (busy || !scope) return;
    busy = true; readError = ''; render();
    try { await saveJournalRead(groups, read); channel?.postMessage('saved'); }
    catch (failure) { readError = `Okunma durumu kaydedilemedi: ${failure.message}. Yenile ve tekrar dene.`; }
    finally { busy = false; render(); }
}
function openGroup(group) {
    root.querySelector('[data-journal-dialog]')?.remove();
    const host = document.createElement('dialog'); host.className = 'app-dialog'; host.dataset.journalDialog = '';
    host.innerHTML = `<button type="button" class="app-dialog-close" aria-label="Kapat" data-close></button><div class="app-dialog-sheet journal-detail"><h2>${itemNameHtml(itemLabel(group.itemId,group.name))}</h2><p>${cityNameHtml(group.city)} · ${group.side === 'sell' ? 'Satış' : 'Alış'} · ${group.quality == null ? 'Kalite bilinmiyor' : `Q${group.quality}`} · ${group.trades.length} gerçekleşmiş işlem</p><p>Toplam ${number(group.total)} Silver / ${number(group.quantity)} adet = ${number(group.average)} ağırlıklı ortalama. İşlemler envanter kârı için eşleştirilmez.</p><div class="calc-table-wrap"><table class="table table-striped calc-table"><thead><tr><th>Saat (${JOURNAL_ZONE})</th><th>Adet</th><th>Birim Silver</th><th>Toplam Silver</th></tr></thead><tbody>${group.trades.map(t => `<tr><td>${time(t.occurredAt)}</td><td>${number(t.quantity)}</td><td>${number(t.unitPriceSilver)}</td><td>${number(t.totalPriceSilver)}</td></tr>`).join('')}</tbody></table></div><a href="${routeHref('trades')}?item=${encodeURIComponent(group.itemId)}&city=${encodeURIComponent(group.city)}">Trade Dashboard'da incele</a></div>`;
    root.append(host); host.querySelector('[data-close]').onclick = () => host.close(); host.showModal(); bindCalcSticky(host);
    const highlight = journalHighlights(model,journalIsUnread).find(event => event.group.id === group.id);
    if (highlight) {
        const explanation = document.createElement('p');
        explanation.textContent = `${highlight.reason}. Öne çıkarma: aynı ürün/şehir/kalite/karakterde iki yönün bulunması, en az 5 gerçekleşme veya en az 5 işlemli günde toplam cironun %25’ine ulaşılması. Bu grup: ${group.trades.length} işlem, günlük cironun %${number((model.sales + model.buys) > 0 ? group.total / (model.sales + model.buys) * 100 : 0)} kadarı.`;
        host.querySelector('.journal-detail .calc-table-wrap').before(explanation);
    }
    if (journalIsUnread(group)) void mark([group], true);
}
async function accept(snapshot, reset) {
    if (!Array.isArray(snapshot.trades)) throw new Error('İşlem kaynağı geçerli bir liste döndürmedi');
    if (snapshot.server && snapshot.server !== 'europe') throw new Error('Bu günlük Europe kişisel arşivini kullanır');
    if (reset && !snapshot.path) throw new Error('Kişisel arşiv kapsamı doğrulanamadı');
    if (reset) scope = snapshot.path;
    records = mergeJournalTrades(records, snapshot.trades, reset);
    received = snapshot.at || new Date().toISOString(); loaded = true; error = ''; revision++;
    await recompute();
}
async function refresh() {
    const initialRevision = revision;
    try {
        await syncRead();
        const status = await fetchTradeStatus(AbortSignal.timeout(5000));
        if (!status.ready || status.error) throw new Error(status.error || 'SAT kaynağı henüz hazır değil');
        const snapshot = await fetchTradeSnapshot(AbortSignal.timeout(10000));
        if (initialRevision === revision) await accept(snapshot,true);
    } catch (failure) { error = `Veri alınamadı: ${failure.message}${loaded ? ' · Son alınan kayıtlar gösteriliyor.' : ''}`; render(); }
}
async function syncRead() {
    if (syncing || busy) return;
    syncing = true;
    try { await reloadDurableStorage(); readError = ''; render(); }
    catch (failure) { readError = `Okunma durumu yenilenemedi: ${failure.message}`; render(); }
    finally { syncing = false; }
}
root.addEventListener('click', event => {
    if (event.target.closest('[data-copy-item-name]')) return;
    const markButton = event.target.closest('[data-mark]');
    if (markButton) { const group = model.groups[Number(markButton.dataset.mark)]; void mark([group], journalIsUnread(group)); return; }
    const group = event.target.closest('[data-group]');
    if (group) { openGroup(model.groups[Number(group.dataset.group)]); return; }
    const shift = event.target.closest('[data-shift]');
    if (shift || event.target.closest('[data-today]')) { selectDay(shift ? shiftJournalDay(day,Number(shift.dataset.shift)) : journalDay(Date.now())); return; }
    const expand = event.target.closest('[data-expand]');
    if (expand) { expanded.has(expand.dataset.expand) ? expanded.delete(expand.dataset.expand) : expanded.add(expand.dataset.expand); render(); }
    if (event.target.closest('[data-events]')) { allEvents = !allEvents; render(); }
    if (event.target.closest('[data-refresh]')) void refresh();
    if (event.target.closest('[data-read-day]')) void mark(model.groups,true);
});
root.addEventListener('keydown', event => {
    if (event.target.matches('[data-group]') && ['Enter',' '].includes(event.key)) { event.preventDefault(); openGroup(model.groups[Number(event.target.dataset.group)]); }
});
function selectDay(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return; day = value; root.querySelector('[data-day]').value = day; expanded.clear(); allEvents = false; void recompute(); }
root.querySelector('[data-day]').onchange = event => selectDay(event.target.value);
root.querySelector('[data-only-unread]').onchange = event => { onlyUnread = event.target.checked; render(); };
bindTradeLive(detail => {
    if (detail.type === 'connection') { live = detail.connected; render(); }
    if (detail.type === 'error') { error = `Veri alınamadı: ${detail.message}`; render(); }
    if (detail.type === 'initial' || detail.type === 'added') void accept(detail,detail.type === 'initial').catch(failure => { error = failure.message; render(); });
});
channel && (channel.onmessage = () => void syncRead());
window.addEventListener('focus', () => void syncRead());
setInterval(() => { if (!document.hidden) void syncRead(); }, 15000);
render(); void refresh();
