import { toolPageHtml } from '../core/app-runtime.js';
import { bindTradeLive, fetchTradeSnapshot, fetchTradeStatus } from '../core/trade-live.js';
import { JOURNAL_ZONE, journalDay, shiftJournalDay, mergeJournalTrades, journalGroups, journalHighlights, journalEventText } from '../core/trade-journal.mjs';
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
let generation = 0, busy = false, onlyUnread = false, revision = 0, syncing = false;
const PREVIEW_GROUPS = 5;
const expanded = new Set();
const metricIcon = kind => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="${kind === 'sell' ? 'M5 16 16 5M6 5h10v10' : kind === 'buy' ? 'M18 6 7 17M7 7v10h10' : kind === 'count' ? 'M5 6h14M5 12h14M5 18h14' : 'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4'}"/></svg>`;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('albiontools-trade-journal') : null;

root.innerHTML = toolPageHtml({ key: 'trade-journal', layout: 'stacked',
    head: '<section class="page-head" data-page-head="trade-journal"><h1>Ticaret Günlüğü</h1><p>O günün ticaret özeti</p></section>',
    controls: `<div class="journal-navigation"><div class="journal-date-controls"><button type="button" class="btn btn-outline-secondary" data-shift="-1" aria-label="Önceki gün">←</button><div class="form-floating"><input type="date" class="form-control" data-day value="${day}" aria-label="Seçili gün"><label>Seçili gün</label></div><button type="button" class="btn btn-outline-secondary" data-shift="1" aria-label="Sonraki gün">→</button><button type="button" class="btn btn-outline-secondary" data-today>Bugün</button></div><div class="journal-read-controls"><span data-unread role="status"></span><label class="form-check"><input class="form-check-input" type="checkbox" data-only-unread><span class="form-check-label">Sadece okunmamış</span></label></div><div class="journal-actions"><button type="button" class="btn btn-outline-primary" data-read-day>Tümünü oku</button><button type="button" class="btn btn-outline-secondary" data-refresh>Yenile</button></div><small class="journal-zone">${JOURNAL_ZONE} · Europe</small></div>`,
    result: '<div class="journal-content" data-content></div>' });
const content = root.querySelector('[data-content]');
const readCount = () => model?.groups.filter(journalIsUnread).length || 0;
function identity(group) {
    return `${itemIconHtml(group.itemId, { visual: true })}<span class="journal-identity">${itemNameHtml(itemLabel(group.itemId, group.name))}<small>${cityNameHtml(group.city)} · ${itemTierBadgeHtml(group.itemId, { format: 'text' })}${group.quality == null ? '' : ` · Q${group.quality}`}</small></span>`;
}
function card(group) {
    const index = model.groups.indexOf(group), unread = journalIsUnread(group);
    return `<article class="journal-group${unread ? ' is-unread' : ''}" data-group="${index}">${identity(group)}<span class="journal-amount"><strong>${number(group.total)}</strong></span><span class="journal-group-foot"><small>${number(group.quantity)} adet · Ort. ${number(group.average)} · ${group.trades.length} işlem</small><button type="button" class="journal-read" data-mark="${index}" ${busy ? 'disabled' : ''} aria-label="${unread ? 'Okundu işaretle' : 'Okunmadı işaretle'}" aria-pressed="${!unread}"><span class="journal-read-dot" aria-hidden="true"></span>${unread ? 'Okundu yap' : 'Okunmadı yap'}</button></span><button type="button" class="journal-open" data-open-group="${index}" aria-label="${esc(itemLabel(group.itemId, group.name))} işlem ayrıntıları" aria-haspopup="dialog"></button></article>`;
}
function eventCard(event) {
    const text = journalEventText(event), index = journalHighlights(model).findIndex(e => e.id === event.id);
    return `<article class="journal-event${event.groups.some(journalIsUnread) ? ' is-unread' : ''}"><span class="journal-event-type">${esc(text.title)}</span><strong class="journal-event-total">${number(event.total)} <small>Silver</small></strong>${itemNameHtml(itemLabel(event.group.itemId, event.group.name))}<p>${esc(text.reason)}</p><button type="button" data-story="${index}" aria-haspopup="dialog">Olayı incele →</button></article>`;
}
function render() {
    const scroll = [...content.querySelectorAll('.journal-lane-body, .journal-story')].map(el => el.scrollTop);
    const focusHook = ['data-open-group','data-mark','data-story','data-story-panel','data-expand'].find(key => document.activeElement?.hasAttribute(key));
    const focusValue = focusHook && document.activeElement.getAttribute(focusHook);
    const healthOpen = content.querySelector('.journal-footer details')?.open;
    const count = readCount();
    root.querySelector('[data-unread]').textContent = `${count} okunmamış grup`;
    root.querySelector('[data-read-day]').disabled = busy || !loaded || !scope || !count;
    const stateLine = `<div class="journal-health"><span class="journal-status${error ? ' text-danger' : ''}" role="status">${esc(error || (loaded ? `${live ? 'Canlı' : 'Canlı bağlantı yok; yeniden bağlanılıyor'} · Son alım ${received ? time(received) : '—'}` : 'Güncelleniyor…'))}</span>${readError ? `<span class="text-danger" role="alert">${esc(readError)}</span>` : ''}</div>`;
    if (!model || !loaded) { content.innerHTML = stateLine; return; }
    const highlights = journalHighlights(model).filter(e => !onlyUnread || e.groups.some(journalIsUnread));
    const sideCount = side => model.groups.filter(g => g.side === side).reduce((sum,g) => sum + g.trades.length, 0);
    const block = (side, label) => {
        const all = model.groups.filter(g => g.side === side), groups = all.filter(g => !onlyUnread || journalIsUnread(g));
        const open = expanded.has(side), visible = open ? groups : groups.slice(0, PREVIEW_GROUPS);
        return `<section class="journal-block journal-block--${side}" aria-label="${label}"><header class="journal-lane-head"><h2>${metricIcon(side)}${label}</h2><span>${sideCount(side)} işlem · ${all.length} grup</span></header><div class="journal-lane-body">${visible.map(card).join('') || `<p class="journal-empty">${onlyUnread ? 'Okunmamış grup yok.' : 'Bu gün gerçekleşmiş işlem yok.'}</p>`}</div>${groups.length > PREVIEW_GROUPS ? `<button type="button" class="journal-expand" data-expand="${side}" aria-expanded="${open}">${open ? 'Daha az göster' : `${groups.length - visible.length} grup daha göster`}</button>` : ''}</section>`;
    };
    const kpis = [
        ['Satış toplamı', model.sales, 'Silver', `${sideCount('sell')} satış`, 'sell'],
        ['Alış toplamı', model.buys, 'Silver', `${sideCount('buy')} alış`, 'buy'],
        ['Net nakit akışı', model.net, 'Silver', 'Kâr değildir', model.net >= 0 ? 'sell' : 'buy'],
        ['İşlem sayısı', model.count, 'işlem', `${model.groups.length} işlem grubu`, 'count']
    ];
    content.innerHTML = `<div class="journal-metrics">${kpis.map(([label,value,unit,note,tone],index) => `<div class="journal-kpi journal-kpi--${tone}"><span class="journal-kpi-label">${metricIcon(index === 2 ? 'net' : tone)}${label}</span><div><strong>${number(value)}</strong> <small>${unit}</small></div><small>${note}</small></div>`).join('')}</div>${!highlights.length ? `<p class="journal-summary-strip">${model.count ? (onlyUnread ? 'Okunmamış önemli olay yok.' : 'Öne çıkan önemli olay yok.') : 'Bugün gerçekleşmiş alış veya satış bulunmuyor.'}</p>` : ''}<div class="journal-board${highlights.length ? ' has-story' : ''}">${block('sell','Satılanlar')}${block('buy','Alınanlar')}${highlights.length ? `<aside class="journal-story" data-story-panel aria-label="Günün Hikâyesi" tabindex="-1"><h2>✧ Günün Hikâyesi</h2><div class="journal-events">${highlights.map(eventCard).join('')}</div></aside>` : ''}</div>${stateLine}<footer class="journal-footer"><span>Tutarlar vergi öncesidir; net nakit akışı kâr değildir.</span><details><summary>Veri sağlığı${model.skipped ? ` · ${model.skipped} geçersiz kayıt` : ''}</summary><p>${model.skipped} geçersiz/kimliksiz kayıt atlandı; ${model.excluded} alış/satış dışı kayıt özete alınmadı (arşiv geneli). Emir iptalleri ve avantajlı fiyat mevcut kaynaktan doğrulanamıyor.</p><p>${JOURNAL_ZONE} · Europe kişisel SAT arşivi</p><a href="${routeHref('trades')}">Trade Dashboard'da incele</a></details></footer>`;
    content.querySelectorAll('.journal-lane-body, .journal-story').forEach((el,index) => { el.scrollTop = scroll[index] || 0; });
    if (healthOpen) content.querySelector('.journal-footer details').open = true;
    if (focusHook) content.querySelector(`[${focusHook}="${focusValue}"]`)?.focus({ preventScroll: true });
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
    const origin = document.activeElement;
    busy = true; readError = ''; render();
    try { await saveJournalRead(groups, read); channel?.postMessage('saved'); }
    catch (failure) { readError = `Okunma durumu kaydedilemedi: ${failure.message}. Yenile ve tekrar dene.`; }
    finally {
        busy = false; render();
        if (origin?.hasAttribute('data-mark')) (content.querySelector(`[data-mark="${origin.dataset.mark}"]`) || root.querySelector('[data-only-unread]')).focus({ preventScroll: true });
    }
}
function openGroup(group, story = null) {
    const groups = story?.groups || [group];
    const detailTrades = groups.flatMap(g => g.trades).sort((a,b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    root.querySelector('[data-journal-dialog]')?.remove();
    const returnFocus = document.activeElement?.dataset.openGroup ?? String(model.groups.indexOf(group));
    const host = document.createElement('dialog'); host.className = 'app-dialog'; host.dataset.journalDialog = '';
    host.innerHTML = `<button type="button" class="app-dialog-close" aria-label="Kapat" data-close></button><div class="app-dialog-sheet journal-detail"><h2>${itemNameHtml(itemLabel(group.itemId,group.name))}</h2><p>${cityNameHtml(group.city)} · ${groups.length > 1 ? 'Alış ve satış' : group.side === 'sell' ? 'Satış' : 'Alış'} · ${group.quality == null ? 'Kalite bilinmiyor' : `Q${group.quality}`} · ${detailTrades.length} gerçekleşmiş işlem</p><p>${groups.map(g => `${g.side === 'buy' ? 'Alış' : 'Satış'}: ${number(g.total)} Silver / ${number(g.quantity)} adet = ${number(g.average)} ağırlıklı ortalama`).join(' · ')}. İşlemler envanter kârı için eşleştirilmez.</p><div class="calc-table-wrap"><table class="table table-striped calc-table"><thead><tr><th>Yön</th><th>Saat (${JOURNAL_ZONE})</th><th>Adet</th><th>Birim Silver</th><th>Toplam Silver</th></tr></thead><tbody>${detailTrades.map(t => `<tr><td>${t.kind.endsWith('buy') ? 'Alış' : 'Satış'}</td><td>${time(t.occurredAt)}</td><td>${number(t.quantity)}</td><td>${number(t.unitPriceSilver)}</td><td>${number(t.totalPriceSilver)}</td></tr>`).join('')}</tbody></table></div><a href="${routeHref('trades')}?item=${encodeURIComponent(group.itemId)}&city=${encodeURIComponent(group.city)}">Trade Dashboard'da incele</a></div>`;
    root.append(host); host.querySelector('[data-close]').onclick = () => host.close(); host.addEventListener('close', () => (root.querySelector(`[data-open-group="${returnFocus}"]`) || root.querySelector('.journal-story') || root.querySelector('[data-only-unread]'))?.focus({ preventScroll: true }));
    host.showModal(); bindCalcSticky(host);
    const highlight = story || journalHighlights(model).find(e => e.groups.includes(group));
    if (highlight) {
        const text = journalEventText(highlight), explanation = document.createElement('p');
        explanation.textContent = `${text.title}. ${text.detail}. ${text.reason}.`;
        host.querySelector('.journal-detail .calc-table-wrap').before(explanation);
    }
    if (groups.some(journalIsUnread)) void mark(groups.filter(journalIsUnread), true);
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
    const expand = event.target.closest('[data-expand]');
    if (expand) { const side = expand.dataset.expand; expanded.has(side) ? expanded.delete(side) : expanded.add(side); render(); return; }
    const markButton = event.target.closest('[data-mark]');
    if (markButton) { const group = model.groups[Number(markButton.dataset.mark)]; void mark([group], journalIsUnread(group)); return; }
    const story = event.target.closest('[data-story]');
    if (story) { const e = journalHighlights(model)[Number(story.dataset.story)]; openGroup(e.group, e); return; }
    const group = event.target.closest('[data-group]');
    if (group) { openGroup(model.groups[Number(group.dataset.group)]); return; }
    const shift = event.target.closest('[data-shift]');
    if (shift || event.target.closest('[data-today]')) { selectDay(shift ? shiftJournalDay(day,Number(shift.dataset.shift)) : journalDay(Date.now())); return; }
    if (event.target.closest('[data-refresh]')) void refresh();
    if (event.target.closest('[data-read-day]')) void mark(model.groups,true);
});
function selectDay(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return; day = value; expanded.clear(); root.querySelector('[data-day]').value = day; void recompute(); }
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
