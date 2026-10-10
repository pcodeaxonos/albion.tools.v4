import { toolPageHtml } from '../components/tool-page.js';
import { itemIconHtml, itemLabel } from '../components/item-icon.js';
import { initFloatingLabels } from '../components/forms.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { recordCurrentToolVisit } from '../core/usage.js';
import { getServer, getSettings, localPriceHost } from '../core/settings.js';
import { feeMetaText } from '../core/market-fees.js';
import { routeHref } from '../core/routes.js';
import { AODP_COLLECTOR_POLICY } from '../core/market-history-config.mjs';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { escapeHtml } from '../utils/utils.js';
import { formatPct, formatQuantity, formatRelativeDateTime, formatSilver } from '../utils/format.js';

const VIEWS = [
    { id: 'all', label: 'Tüm Fırsatlar' },
    { id: 'buy-up', label: 'Buy yükselişi' },
    { id: 'buy-down', label: 'Buy düşüşü' },
    { id: 'sell-up', label: 'Sell yükselişi' },
    { id: 'sell-down', label: 'Sell düşüşü' },
    { id: 'cross-city', label: 'Şehirler arası' }
];
const SORTS = [
    { id: 'balanced', label: 'Dengeli' },
    { id: 'recent', label: 'Güncellik' },
    { id: 'importance', label: 'Önem' }
];
const KIND_LABEL = { savings: 'Tasarruf', unrealized: 'Dolmamış emir', 'top-of-book': 'Görünen fark', info: 'Aday' };
const KIND_BADGE = { savings: 'Tasarruf', unrealized: 'Dolmamış', 'top-of-book': 'Görünen', info: 'Aday' };
const PATTERN_BADGE = {
    'buy-down-sell-flat': 'Buy ↓', 'buy-up-sell-flat': 'Buy ↑',
    'sell-down-buy-flat': 'Sell ↓', 'sell-up-buy-flat': 'Sell ↑',
    'spread-widen': 'Makas +', 'spread-narrow': 'Makas −',
    'both-up': 'Birlikte ↑', 'both-down': 'Birlikte ↓', flat: 'Sabit',
    'buy-down': 'Buy ↓', 'buy-up': 'Buy ↑', 'sell-down': 'Sell ↓', 'sell-up': 'Sell ↑',
    unreferenced: 'Referans yok', 'buy-unreferenced': 'Buy ?', 'sell-unreferenced': 'Sell ?', mixed: 'Karışık'
};
const REVIEW_BADGE = { unconfirmed: 'Yeni', confirmed: 'Doğrulandı', inversion: 'Çevirme' };
const state = {
    scan: null, error: null, selectedId: '', series: null, seriesError: '',
    layout: 'list',
    filters: { view: 'all', sort: 'balanced', city: '', tier: '', enchant: '', query: '', minDeviation: '12', minNet: '', confidence: '' }
};
let root;

function itemTier(itemId) {
    const match = String(itemId || '').match(/^T(\d+)/);
    return match ? Number(match[1]) : null;
}
function itemEnchant(itemId) {
    const match = String(itemId || '').match(/@(\d+)$/);
    return match ? Number(match[1]) : 0;
}
function ageLabel(ms) {
    if (!Number.isFinite(ms)) return '';
    if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60000))} dk`;
    return `${Math.max(1, Math.round(ms / 3600000))} sa`;
}
function signedPct(ratio) {
    if (!Number.isFinite(ratio)) return '—';
    const text = formatPct(Math.abs(ratio), { digits: 1 });
    if (Math.abs(ratio) < 0.005) return text;
    return `${ratio > 0 ? '+' : '−'}${text}`;
}
function deltaClass(ratio) {
    if (!Number.isFinite(ratio) || Math.abs(ratio) < 0.005) return 'is-flat';
    return ratio > 0 ? 'is-up' : 'is-down';
}
function rows() {
    return state.scan?.opportunities || [];
}
function visibleRows() {
    const filters = state.filters;
    const query = filters.query.trim().toLocaleLowerCase('tr');
    const minDeviation = Number(filters.minDeviation) / 100;
    const minNet = Number(filters.minNet);
    const confidence = Number(filters.confidence);
    return rows().filter((row) => {
        if (filters.view === 'cross-city') {
            if (!row.strategies.some((strategy) => strategy.id === 'cross-city-instant')) return false;
        } else if (filters.view !== 'all' && !row.anomalies.includes(filters.view)) return false;
        if (filters.city && row.city !== filters.city) return false;
        if (filters.tier && String(itemTier(row.itemId) ?? '') !== filters.tier) return false;
        if (filters.enchant !== '' && String(itemEnchant(row.itemId)) !== filters.enchant) return false;
        if (query && !`${row.itemId} ${itemLabel(row.itemId)}`.toLocaleLowerCase('tr').includes(query)) return false;
        if (Number.isFinite(minDeviation) && minDeviation > 0 && row.anomalies.length) {
            const deviation = Math.max(...row.anomalies.map((id) => Math.abs((id.startsWith('buy') ? row.buy : row.sell)?.deviation || 0)));
            if (deviation < minDeviation) return false;
        }
        if (Number.isFinite(minNet) && minNet > 0 && !((row.primary?.advantageSilver || 0) >= minNet)) return false;
        if (confidence > 0 && !(row.parts.reliability >= confidence)) return false;
        return true;
    }).sort((a, b) => sortValue(b) - sortValue(a));
}
function sortValue(row) {
    if (state.filters.sort === 'recent') return row.recency || 0;
    if (state.filters.sort === 'importance') return row.score || 0;
    return row.rankScore || row.score || 0;
}

function tip(text) {
    return text ? ` data-app-tooltip="${escapeHtml(text)}"` : '';
}
function badge(label, tooltip, tone = '') {
    return `<span class="badge opp-badge${tone ? ` ${tone}` : ''}"${tip(tooltip)}>${escapeHtml(label)}</span>`;
}
function deltaText(ratio) {
    const abs = Math.abs(ratio);
    if (abs >= 3) {
        const multiple = abs + 1;
        const rounded = multiple >= 10 ? Math.round(multiple) : Math.round(multiple * 10) / 10;
        return `${ratio > 0 ? '×' : '÷'}${String(rounded).replace('.', ',')}`;
    }
    if (ratio < 0) return formatPct(abs, { digits: 1 });
    return signedPct(ratio);
}
function quoteTip(side) {
    const lines = [`Fiyat ${formatSilver(side.price)}`];
    if (side.reference) lines.push(`Referans ${formatSilver(side.reference)}, ${side.referenceSamples} gözlem.`);
    else lines.push('Referans yok. Tek fiyat kendiyle karşılaştırılmaz.');
    if (Number.isFinite(side.deviation)) lines.push(`Sapma ${signedPct(side.deviation)}.`);
    if (Number.isFinite(side.ageMs)) lines.push(`Yaş ${ageLabel(side.ageMs)}.`);
    if (side.anomalous && !side.confirmed) lines.push('Henüz tek saat diliminde görüldü.');
    if (side.confirmed) lines.push(`${side.confirmingBuckets} saatlik onay.`);
    return lines.join('\n');
}
function sideCells(side) {
    if (!side?.price) return '<td class="num">—</td><td class="num">—</td>';
    const hint = tip(quoteTip(side));
    const delta = Number.isFinite(side.deviation)
        ? `<td class="num opp-delta ${deltaClass(side.deviation)}"${hint}>${deltaText(side.deviation)}</td>`
        : `<td class="num opp-delta is-flat"${hint}>—</td>`;
    return `<td class="num"${hint}>${formatSilver(side.price)}</td>${delta}`;
}
function moveTone(pattern) {
    if (pattern === 'both-down') return 'is-drop';
    if (pattern === 'both-up') return 'is-rise';
    if (String(pattern).includes('spread')) return 'is-arb';
    if (String(pattern).includes('down')) return 'is-down';
    if (String(pattern).includes('up')) return 'is-up';
    return '';
}
function anomalyFace(row) {
    const deviation = Math.max(Math.abs(row.buy?.deviation || 0), Math.abs(row.sell?.deviation || 0));
    const buyOnly = row.anomalies.some((id) => id.startsWith('buy')) && !row.anomalies.some((id) => id.startsWith('sell'));
    const fresh = row.review === 'unconfirmed' ? 'Henüz doğrulanmadı' : '';
    let face;
    if (row.primary?.id === 'cross-city-instant') face = { title: 'Arbitraj fırsatı', note: 'Şehirler arası', tone: 'arb', glyph: 'swap' };
    else if (deviation >= 3) face = { title: 'Aşırı fiyat', note: 'Referansa göre büyük sapma', tone: 'extreme', glyph: 'alert' };
    else if (row.pattern === 'spread-widen' || row.pattern === 'spread-narrow') face = { title: 'Fiyat uyumsuzluğu', note: row.patternLabel, tone: 'mismatch', glyph: 'alert' };
    else if (buyOnly) face = { title: 'Alış sapması', note: row.patternLabel, tone: 'rare', glyph: 'spark' };
    else if (row.anomalies.includes('sell-down') || row.pattern === 'both-down') face = { title: 'Fiyat düşüşü', note: row.patternLabel, tone: 'drop', glyph: 'down' };
    else if (row.anomalies.includes('sell-up') || row.pattern === 'both-up') face = { title: 'Fiyat yükselişi', note: row.patternLabel, tone: 'rise', glyph: 'trend' };
    else if (row.review === 'inversion') face = { title: 'Çevirme', note: row.patternLabel, tone: 'flip', glyph: 'swap' };
    else if (fresh) face = { title: 'Yeni hareket', note: fresh, tone: 'fresh', glyph: 'spark' };
    else face = { title: 'Fiyat sapması', note: row.patternLabel, tone: 'mismatch', glyph: 'alert' };
    return face;
}
const ACTIONS = {
    'instant-buy-from-sell': { label: 'Al', tone: 'is-buy' },
    'place-buy-order': { label: 'Al emri', tone: 'is-order' },
    'instant-sell-to-buy': { label: 'Sat', tone: 'is-sell' },
    'place-sell-order': { label: 'Sat emri', tone: 'is-order' },
    'local-flip': { label: 'Çevir', tone: 'is-flip' },
    'local-make': { label: 'Çift emir', tone: 'is-order' },
    'cross-city-instant': { label: 'Taşı', tone: 'is-haul' },
    'update-orders': { label: 'Güncelle', tone: 'is-review' }
};
function actionTags(row) {
    const ranked = (row.strategies || [])
        .filter((strategy) => strategy.advantageSilver > 0 && strategy.weight > 0 && ACTIONS[strategy.id])
        .sort((a, b) => (b.advantageSilver * b.weight) - (a.advantageSilver * a.weight));
    const tags = [];
    const seen = new Set();
    for (const strategy of ranked) {
        if (seen.has(strategy.id)) continue;
        seen.add(strategy.id);
        tags.push(strategy);
        if (tags.length === 3) break;
    }
    if (!tags.length) {
        const review = (row.strategies || []).find((strategy) => strategy.id === 'update-orders');
        if (review) tags.push(review);
    }
    return tags.map((strategy) => {
        const action = ACTIONS[strategy.id];
        const where = strategy.toCity ? `${strategy.fromCity || row.city} → ${strategy.toCity}` : '';
        const hint = [strategy.label, where, strategy.note].filter(Boolean).join('\n');
        return `<span class="opp-act ${action.tone}"${tip(hint)}>${escapeHtml(action.label)}</span>`;
    }).join('');
}
function fitFace(row) {
    const stance = rowStance(row);
    if (stance === 'positive') return { label: 'Uygulanabilir', tone: 'is-ready', hint: 'Doğrulanmış ve teorik farkı pozitif. Emrin dolacağı bilinmiyor.' };
    if (stance === 'risk') return { label: 'Dikkat', tone: 'is-caution', hint: 'Sapma çok büyük ya da teorik fark dolmamış bir emre bağlı.' };
    return { label: 'Sınırlı', tone: 'is-limited', hint: 'Henüz doğrulanmamış, çevirme adayı ya da teorik farkı yok.' };
}
function icon(paths) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}
const ICONS = {
    cube: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5z"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 12.5 20 8M12 12.5V21M12 12.5 4 8"/>'),
    trend: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 16.5 9 11l3.5 3.5L20 7"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M14.5 7H20v5.5"/>'),
    scale: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 3.5v14M7.5 20.5h9M12 6 6.5 11.5M12 6l5.5 5.5"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M6.5 11.5c0 1.8 1.2 3 2.7 3s2.8-1.2 2.8-3M12 11.5c0 1.8 1.2 3 2.7 3s2.8-1.2 2.8-3"/>'),
    coins: icon('<ellipse cx="12" cy="7" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M5 7v4.5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 11.5V16c0 1.7 3.1 3 7 3s7-1.3 7-3v-4.5"/>'),
    clock: icon('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 8v4.5l3 2"/>'),
    bolt: icon('<path fill="currentColor" d="M13 2 4 14h7l-1 8 10-14h-7z"/>'),
    refresh: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M20 12a8 8 0 1 1-2.2-5.5M20 4.5V10h-5.5"/>'),
    alert: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 4 3.5 19h17L12 4z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 10v4M12 16.5h.01"/>'),
    swap: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5"/>'),
    spark: icon('<path fill="currentColor" d="M12 2.5 13.8 9 20.5 12 13.8 15 12 21.5 10.2 15 3.5 12 10.2 9z"/>'),
    down: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 5v12M7 12l5 6 5-6"/>'),
    list: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8 7h12M8 12h12M8 17h12"/><path fill="currentColor" d="M4.5 6.2h1.4v1.4H4.5zM4.5 11.3h1.4v1.4H4.5zM4.5 16.4h1.4v1.4H4.5z"/>'),
    cards: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z"/>')
};
function layoutButtons() {
    const button = (id, label, glyph) => {
        const on = state.layout === id;
        return `<button type="button" class="opp-layout-btn${on ? ' is-active' : ''}" data-layout="${id}" aria-pressed="${on}" aria-label="${label}">${ICONS[glyph]}</button>`;
    };
    return `<div class="opp-layout" role="group" aria-label="Görünüm">${button('list', 'Liste', 'list')}${button('cards', 'Kart', 'cards')}</div>`;
}
function clockTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
function rowStance(row) {
    const deviation = Math.max(Math.abs(row.buy?.deviation || 0), Math.abs(row.sell?.deviation || 0));
    const advantage = row.primary?.advantageSilver || 0;
    if (row.review === 'unconfirmed' || row.review === 'inversion' || !(advantage > 0)) return 'neutral';
    if (row.primary?.kind === 'unrealized' || deviation >= 3) return 'risk';
    return 'positive';
}
function statCard(tone, glyph, label, value, note, tooltip) {
    return `<article class="opp-stat is-${tone}"${tip(tooltip)}><span class="opp-stat-icon">${ICONS[glyph]}</span><span class="opp-stat-copy"><span class="opp-stat-label">${escapeHtml(label)}</span><strong class="opp-stat-value">${value}</strong><span class="opp-stat-note">${escapeHtml(note)}</span></span></article>`;
}
function boardHtml(scan, listCount) {
    if (!scan?.funnel) return '';
    const funnel = scan.funnel;
    const excluded = scan.excluded || {};
    const notes = scan.funnelNotes || {};
    const server = getServer();
    const dropped = [
        notes.filtered,
        `Geçmiş yok ${excluded.noHistory ?? 0}. ${notes.noHistory || ''}`,
        `Tek gözlem ${excluded.singleObservation ?? 0}. ${notes.singleObservation || ''}`,
        `Eski fiyat ${excluded.stale ?? 0}. ${notes.stale || ''}`,
        `Eşik altı ${excluded.belowDeviation ?? 0}. ${notes.belowDeviation || ''}`,
        `Liste sınırı ${excluded.overLimit ?? 0}. ${notes.overLimit || ''}`
    ].filter(Boolean).join('\n');
    const listed = scan.opportunities || [];
    const counts = { positive: 0, risk: 0, neutral: 0 };
    const positives = [];
    for (const row of listed) {
        counts[rowStance(row)] += 1;
        if ((row.primary?.advantageSilver || 0) > 0) positives.push(row);
    }
    const peak = positives.reduce((best, row) => (row.primary.advantageSilver > (best?.primary.advantageSilver || 0) ? row : best), null);
    const average = positives.length
        ? positives.reduce((sum, row) => sum + row.primary.advantageSilver, 0) / positives.length
        : null;
    const confirmed = listed.filter((row) => row.review === 'confirmed').length;
    const rateBase = funnel.referenceable || 0;
    const when = clockTime(scan.scannedAt);
    return `<section class="opp-board">
        <div class="opp-board-top">
            <div class="opp-summary">
                ${badge(`${server?.label || scan.server} · ${listCount}`, `28 gün penceresi. Bu filtrede ${listCount} satır.`)}
                ${badge(`Hücre ${funnel.cells}`, `${notes.cells || ''}\nGeçmiş ${funnel.withHistory}. ${notes.withHistory || ''}`)}
                ${badge(`Referans ${funnel.referenceable}`, notes.referenceable)}
                ${badge(`Taze ${funnel.fresh}`, notes.fresh)}
                ${badge(`Anomali ${funnel.anomalies}`, notes.anomalies, 'is-strong')}
                ${badge(`Elenen ${funnel.filtered}`, dropped)}
                ${badge('Derinlik yok', 'Hacim, emir derinliği ve gerçekleşme ihtimali bu arşivde yoktur. Doluluk tahmini üretilmez.')}
            </div>
            <div class="opp-updated">
                <span class="opp-live" aria-hidden="true"></span>
                <span>Son güncelleme: ${escapeHtml(when || '—')}</span>
                <button type="button" class="opp-rescan" data-opportunities-rescan aria-label="Taramayı yenile">${ICONS.refresh}</button>
            </div>
        </div>
        <div class="opp-stats">
            ${statCard('items', 'cube', 'Toplam ürün', formatQuantity(new Set(listed.map((row) => row.itemId)).size, { digits: 0 }), `Taranan: ${formatQuantity(funnel.cells, { digits: 0 })}`, 'Listelenen satırlardaki farklı ürün. Taranan, ürün-şehir-kalite hücresidir.')}
            ${statCard('gain', 'trend', 'Kârlı fırsat', formatQuantity(counts.positive, { digits: 0 }), listed.length ? `${formatPct(counts.positive / listed.length)} oranında` : '—', 'Doğrulanmış, teorik farkı pozitif ve dolmamış emre dayanmayan satır. Gerçekleşen kâr değildir.')}
            ${statCard('average', 'scale', 'Ortalama teorik fark', average == null ? '—' : formatSilver(average, { signed: true }), 'Pozitif olanlar', 'Pozitif teorik farkların ortalaması. Emrin dolacağı varsayılmaz.')}
            ${statCard('peak', 'coins', 'En yüksek fark', peak ? formatSilver(peak.primary.advantageSilver, { signed: true }) : '—', peak ? itemLabel(peak.itemId) : '—', 'Listede görünen en büyük teorik fark. Sıralamayı tek başına belirlemez.')}
            ${statCard('rate', 'clock', 'Anomali oranı', rateBase ? formatPct(funnel.anomalies / rateBase) : '—', `${formatQuantity(funnel.anomalies, { digits: 0 })} / ${formatQuantity(rateBase, { digits: 0 })} referans`, 'Sapma eşiğini geçen hücrelerin, referansı olan hücrelere oranı.')}
        </div>
        <div class="opp-strip-row">
            <div class="opp-strip">
                <span class="opp-strip-title">${ICONS.bolt}Hızlı özet</span>
                <span${tip('Doğrulanmış ve teorik farkı pozitif satır.')}><span class="opp-dot is-up"></span>${formatQuantity(counts.positive, { digits: 0 })} fırsat</span>
                <span${tip('Sapması çok büyük ya da teorik farkı dolmamış bir emre bağlı satır.')}><span class="opp-dot is-down"></span>${formatQuantity(counts.risk, { digits: 0 })} riskli</span>
                <span${tip('Henüz doğrulanmamış, çevirme adayı ya da teorik farkı olmayan satır.')}><span class="opp-dot"></span>${formatQuantity(counts.neutral, { digits: 0 })} tarafsız</span>
                <span class="opp-strip-gap"${tip('Pozitif teorik farkların ortalaması.')}>${ICONS.trend}Ortalama fark ${average == null ? '—' : formatSilver(average, { signed: true })}</span>
                <span${tip('Listedeki en büyük teorik fark.')}>${ICONS.coins}En yüksek ${peak ? formatSilver(peak.primary.advantageSilver, { signed: true }) : '—'}</span>
                <span${tip('Listedeki doğrulanmış satır payı. Emir doluluk tahmini değildir.')}>${ICONS.clock}Doğrulanan ${listed.length ? formatPct(confirmed / listed.length) : '—'}</span>
            </div>
            ${layoutButtons()}
        </div>
    </section>`;
}

function advantageCell(row) {
    const primary = row.primary;
    if (!primary || !(primary.advantageSilver > 0)) return '<td class="num">—</td>';
    const detail = [primary.label, primary.note, KIND_LABEL[primary.kind]].filter(Boolean).join('\n');
    return `<td class="num opp-gain"${tip(detail)}>${formatSilver(primary.advantageSilver, { signed: true })}</td>`;
}

function decisionSide(label, side) {
    if (!side?.price) return `<div class="opp-card-side"><span class="opp-card-k">${label}</span><span class="opp-card-miss">Fiyat yok</span></div>`;
    const moved = Number.isFinite(side.deviation) && Math.abs(side.deviation) >= 0.005;
    const delta = moved
        ? `<span class="opp-delta ${deltaClass(side.deviation)}">${deltaText(side.deviation)}</span>`
        : '<span class="opp-card-flat">Sabit</span>';
    const facts = [];
    if (side.reference) facts.push(`referans ${formatSilver(side.reference)}`);
    else facts.push('referans yok');
    if (side.anomalous) {
        if (side.referenceSamples) facts.push(`${side.referenceSamples} gözlem`);
        facts.push(side.confirmed ? 'doğrulandı' : 'yeni');
        if (Number.isFinite(side.ageMs)) facts.push(ageLabel(side.ageMs));
    }
    return `<div class="opp-card-side"${tip(quoteTip(side))}><span class="opp-card-k">${label}</span><strong>${formatSilver(side.price)}</strong>${delta}<span class="opp-card-facts">${escapeHtml(facts.join(' · '))}</span></div>`;
}
function cardHtml(row) {
    const confidence = Math.round((row.parts.reliability || 0) * 100);
    const trust = confidence >= 70 ? 'is-high' : confidence >= 35 ? 'is-mid' : 'is-low';
    const tier = itemTier(row.itemId);
    const enchant = itemEnchant(row.itemId);
    const face = anomalyFace(row);
    const fit = fitFace(row);
    const primary = row.primary;
    const faceTip = [row.patternLabel, row.reviewLabel, primary?.note].filter(Boolean).join('\n');
    const kind = primary ? (KIND_LABEL[primary.kind] || primary.label) : '';
    const silver = primary?.advantageSilver > 0 ? formatSilver(primary.advantageSilver, { signed: true }) : '—';
    const read = primary?.label || 'Ücret sonrası işlem adayı yok';
    return `<article class="opp-card${state.selectedId === row.id ? ' is-selected' : ''}" data-opportunity="${escapeHtml(row.id)}" tabindex="0">
        <header class="opp-card-head">${itemIconHtml(row.itemId, { visual: true })}<span class="opp-meta">${tier ? `<span class="badge" data-tier="${tier}">T${tier}</span>` : ''}${enchant ? badge(`@${enchant}`, 'Enchant') : ''}</span><div class="opp-card-id"><strong>${escapeHtml(itemLabel(row.itemId))}</strong><span class="opp-acts">${actionTags(row)}</span><span class="opp-pills">${badge(row.city, row.patternLabel)}${row.quality > 1 ? badge(`Q${row.quality}`, 'Kalite') : ''}${REVIEW_BADGE[row.review] ? badge(REVIEW_BADGE[row.review], row.reviewLabel, row.review === 'unconfirmed' ? 'is-new' : 'is-up') : ''}</span></div><span class="opp-fit"${tip(fit.hint)}><span class="opp-fit-pill ${fit.tone}">${escapeHtml(fit.label)}</span></span></header>
        <section class="opp-card-block"><p class="opp-card-label">Neden</p>${decisionSide('Buy', row.buy)}${decisionSide('Sell', row.sell)}<div class="opp-card-cause"><span class="opp-move ${moveTone(row.pattern)}"${tip(row.patternLabel)}>${escapeHtml(PATTERN_BADGE[row.pattern] || row.patternLabel)}</span><span class="opp-kind is-${face.tone}"${tip(faceTip)}><span class="opp-kind-icon">${ICONS[face.glyph]}</span><span><strong>${escapeHtml(face.title)}</strong><small>${escapeHtml(face.note)}</small></span></span></div></section>
        <section class="opp-card-block"><p class="opp-card-label">Değerlendirme</p><div class="opp-card-eval"><strong class="opp-gain"${tip([primary?.label, primary?.note, kind].filter(Boolean).join('\n'))}>${silver}</strong>${kind ? badge(kind, primary?.note || '') : ''}<span class="opp-trust ${trust}"${tip('Referans örnek sayısı, yayılım ve onay. Hacim içermez.')}><span class="opp-trust-track"><span class="opp-trust-fill" style="width:${confidence}%"></span></span><span class="opp-trust-pct">%${confidence}</span></span></div><p class="opp-card-read"${tip(primary?.note || '')}>${escapeHtml(read)}</p></section>
    </article>`;
}
function renderTable() {
    const host = root.querySelector('[data-opportunities-result]');
    const list = visibleRows();
    const scan = state.scan;
    const body = state.layout === 'cards'
        ? `<div class="opp-cards">${list.map(cardHtml).join('') || `<p class="opp-empty">${state.error ? 'Tarama sonucu yok.' : 'Bu filtrelerde kart yok.'}</p>`}</div>`
        : `<div class="calc-table-wrap table-responsive">
            <table class="table table-striped calc-table opp-table">
                <thead>
                    <tr>
                        <th rowspan="2">Ürün</th><th rowspan="2">Şehir</th>
                        <th class="opp-group" colspan="2">Buy</th><th class="opp-group" colspan="2">Sell</th>
                        <th rowspan="2">Hareket</th><th rowspan="2">Anomali türü</th>
                        <th class="num" rowspan="2"${tip('Dolmamış emir ya da görünen fark. Sırayı belirlemez.')}>Teorik fark</th>
                        <th class="num" rowspan="2"${tip('Referans örnek sayısı, yayılım ve onay. Hacim içermez.')}>Güven</th>
                        <th rowspan="2"${tip('Veri durumuna göre etiket. Doluluk tahmini değildir.')}>Uyg.</th>
                    </tr>
                    <tr class="opp-subhead">
                        <th class="num">Fiyat</th><th class="num">Δ%</th><th class="num">Fiyat</th><th class="num">Δ%</th>
                    </tr>
                </thead>
                <tbody>${list.map((row) => {
                    const confidence = Math.round((row.parts.reliability || 0) * 100);
                    const trust = confidence >= 70 ? 'is-high' : confidence >= 35 ? 'is-mid' : 'is-low';
                    const tier = itemTier(row.itemId);
                    const enchant = itemEnchant(row.itemId);
                    const face = anomalyFace(row);
                    const fit = fitFace(row);
                    const faceTip = [row.patternLabel, row.reviewLabel, row.primary?.note].filter(Boolean).join('\n');
                    return `<tr class="opp-row${state.selectedId === row.id ? ' is-selected' : ''}" data-opportunity="${escapeHtml(row.id)}" tabindex="0">
                        <td><span class="opp-identity">${itemIconHtml(row.itemId, { visual: true })}<span class="opp-meta">${tier ? `<span class="badge" data-tier="${tier}">T${tier}</span>` : ''}${enchant ? badge(`@${enchant}`, 'Enchant') : ''}</span><span class="opp-name"><strong>${escapeHtml(itemLabel(row.itemId))}</strong><span class="opp-acts">${actionTags(row)}</span></span></span></td>
                        <td><span class="opp-city">${escapeHtml(row.city)}${row.quality > 1 ? `<small>Q${row.quality}</small>` : ''}</span></td>
                        ${sideCells(row.buy)}${sideCells(row.sell)}
                        <td><span class="opp-move ${moveTone(row.pattern)}"${tip(row.patternLabel)}>${escapeHtml(PATTERN_BADGE[row.pattern] || row.patternLabel)}</span></td>
                        <td><span class="opp-kind is-${face.tone}"${tip(faceTip)}><span class="opp-kind-icon">${ICONS[face.glyph]}</span><span><strong>${escapeHtml(face.title)}</strong><small>${escapeHtml(face.note)}</small></span></span></td>
                        ${advantageCell(row)}
                        <td><span class="opp-trust ${trust}"${tip('Referans örnek sayısı, yayılım ve onay. Hacim içermez.')}><span class="opp-trust-track"><span class="opp-trust-fill" style="width:${confidence}%"></span></span><span class="opp-trust-pct">%${confidence}</span></span></td>
                        <td><span class="opp-fit"${tip(fit.hint)}><span class="opp-fit-pill ${fit.tone}">${escapeHtml(fit.label)}</span></span></td>
                    </tr>`;
                }).join('') || `<tr><td colspan="11" class="opp-empty">${state.error ? 'Tarama sonucu yok.' : 'Bu filtrelerde satır yok.'}</td></tr>`}</tbody>
            </table>
        </div>`;
    host.innerHTML = `${state.error ? `<p class="opp-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
        ${boardHtml(scan, list.length)}
        ${body}`;
    host.querySelector('[data-opportunities-rescan]')?.addEventListener('click', () => loadScan());
    host.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => {
        state.layout = button.dataset.layout;
        renderTable();
    }));
    host.querySelectorAll('[data-opportunity]').forEach((row) => {
        const open = () => openDetail(row.dataset.opportunity);
        row.addEventListener('click', open);
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        });
    });
    bindCalcSticky(root);
    const headRow = host.querySelector('.opp-table thead tr');
    if (headRow) host.querySelector('.opp-table')?.style.setProperty('--opp-subhead-top', `${Math.ceil(headRow.getBoundingClientRect().height)}px`);
}

function chartSvg(points, reference, label) {
    if (!points?.length) return `<p class="opp-empty">${escapeHtml(label)} geçmişi yok.</p>`;
    const width = 520, height = 150, left = 72, right = 8, top = 12, bottom = 20;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const prices = points.map((point) => point.price);
    if (reference > 0) prices.push(reference);
    let low = Math.min(...prices), high = Math.max(...prices);
    const pad = (high - low || high * 0.08) * 0.12;
    low = Math.max(0, low - pad); high += pad;
    const x = (index) => left + (points.length === 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
    const y = (price) => top + (high - price) / (high - low || 1) * plotHeight;
    const grid = [0, 1, 2].map((step) => {
        const price = low + (high - low) * step / 2;
        const at = y(price);
        return `<line class="opp-chart-grid" x1="${left}" x2="${width - right}" y1="${at}" y2="${at}"/><text x="${left - 6}" y="${at + 3}" text-anchor="end">${escapeHtml(formatSilver(price))}</text>`;
    }).join('');
    const line = `<polyline class="opp-chart-line" points="${points.map((point, index) => `${x(index)},${y(point.price)}`).join(' ')}"/>`;
    const ref = reference > 0 ? `<line class="opp-chart-ref" x1="${left}" x2="${width - right}" y1="${y(reference)}" y2="${y(reference)}"><title>Önceki gözlem medyanı ${formatSilver(reference)}</title></line>` : '';
    const first = formatRelativeDateTime(points[0].at);
    const last = formatRelativeDateTime(points.at(-1).at);
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)} fiyat geçmişi">${grid}${ref}${line}<text x="${left}" y="${height - 4}">${escapeHtml(first)}</text><text x="${width - right}" y="${height - 4}" text-anchor="end">${escapeHtml(last)}</text></svg>`;
}

function detailHtml(row, series) {
    const strategies = row.strategies.map((strategy) => `<tr><td${tip(strategy.note)}>${escapeHtml(strategy.label)}</td><td>${badge(KIND_BADGE[strategy.kind] || KIND_LABEL[strategy.kind] || '—', strategy.note)}</td><td class="num">${strategy.advantageSilver > 0 ? formatSilver(strategy.advantageSilver, { signed: true }) : '—'}</td></tr>`).join('');
    const peers = row.peers.length ? `<table class="opp-peers"><thead><tr><th>Şehir</th><th class="num">Buy</th><th class="num">Sell</th></tr></thead><tbody>${row.peers.map((peer) => `<tr><td>${escapeHtml(peer.city)}</td><td class="num">${formatSilver(peer.buy)}</td><td class="num">${formatSilver(peer.sell)}</td></tr>`).join('')}</tbody></table>` : '';
    const charts = series
        ? `<section class="opp-chart opp-chart-buy"><h3>Buy</h3>${chartSvg(series.buy.points, series.buy.reference, 'Buy')}</section><section class="opp-chart opp-chart-sell"><h3>Sell</h3>${chartSvg(series.sell.points, series.sell.reference, 'Sell')}</section>`
        : `<p class="opp-empty">${escapeHtml(state.seriesError || 'Grafik yükleniyor…')}</p>`;
    const trades = `${routeHref('trades')}?${new URLSearchParams({ item: row.itemId, city: row.city })}`;
    const notes = [...row.caveats, ...row.reasons].filter(Boolean).join('\n');
    return `<header class="opp-detail-head">${itemIconHtml(row.itemId, { visual: true })}<div><h2>${escapeHtml(itemLabel(row.itemId))}</h2><span class="opp-pills">${badge(row.city, row.patternLabel)}${row.quality > 1 ? badge(`Q${row.quality}`, 'Kalite') : ''}${badge(PATTERN_BADGE[row.pattern] || row.patternLabel, row.patternLabel, 'is-strong')}${REVIEW_BADGE[row.review] ? badge(REVIEW_BADGE[row.review], row.reviewLabel, row.review === 'unconfirmed' ? 'is-new' : 'is-up') : ''}${notes ? badge('Notlar', notes) : ''}</span></div></header>
        <table class="opp-strategies"><thead><tr><th>Strateji</th><th>Tür</th><th class="num">Avantaj</th></tr></thead><tbody>${strategies}</tbody></table>
        <div class="opp-charts">${charts}</div>
        ${peers}
        <div class="opp-actions"><a class="btn btn-outline-secondary" href="${escapeHtml(trades)}">Trade Dashboard’da aç</a></div>`;
}

async function openDetail(id) {
    const row = rows().find((candidate) => candidate.id === id);
    if (!row) return;
    state.selectedId = id;
    state.series = null;
    state.seriesError = '';
    renderTable();
    const sheet = root.querySelector('[data-opportunities-sheet]');
    const dialog = root.querySelector('[data-opportunities-dialog]');
    sheet.innerHTML = detailHtml(row, null);
    if (!dialog.open) dialog.showModal();
    try {
        const params = new URLSearchParams({
            server: getServer().id, item: row.itemId, location: row.city, quality: String(row.quality)
        });
        const response = await fetch(`${localPriceHost()}/api/v1/market/opportunity-series?${params}`, {
            signal: AbortSignal.timeout(AODP_COLLECTOR_POLICY.timeoutMs)
        });
        if (!response.ok) throw new Error('Grafik alınamadı');
        const payload = await response.json();
        if (state.selectedId !== id) return;
        state.series = payload;
        sheet.innerHTML = detailHtml(row, payload);
    } catch (error) {
        if (state.selectedId !== id) return;
        state.seriesError = error.message || 'Grafik alınamadı';
        sheet.innerHTML = detailHtml(row, null);
    }
}

function renderFilters() {
    const cities = [...new Set(rows().map((row) => row.city))].sort((a, b) => a.localeCompare(b, 'tr'));
    const filters = state.filters;
    const field = (name, label, control) => `<div class="form-floating">${control}<label for="opp-${name}">${label}</label></div>`;
    const select = (name, label, options) => field(name, label, `<select class="form-select" id="opp-${name}" data-filter="${name}">${options}</select>`);
    root.querySelector('[data-opportunities-filters]').innerHTML = `<div class="opp-filters">
        ${select('city', 'Şehir', `<option value="">Tümü</option>${cities.map((city) => `<option value="${escapeHtml(city)}"${filters.city === city ? ' selected' : ''}>${escapeHtml(city)}</option>`).join('')}`)}
        ${select('tier', 'Tier', `<option value="">Tümü</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((tier) => `<option value="${tier}"${filters.tier === String(tier) ? ' selected' : ''}>T${tier}</option>`).join('')}`)}
        ${select('enchant', 'Enchant', `<option value="">Tümü</option>${[0, 1, 2, 3, 4].map((enchant) => `<option value="${enchant}"${filters.enchant === String(enchant) ? ' selected' : ''}>${enchant === 0 ? '0' : `@${enchant}`}</option>`).join('')}`)}
        ${field('query', 'Ürün', `<input class="form-control" id="opp-query" data-filter="query" value="${escapeHtml(filters.query)}" placeholder=" ">`) }
        ${field('minDeviation', 'Minimum sapma %', `<input class="form-control" id="opp-minDeviation" data-filter="minDeviation" type="number" min="12" max="500" step="1" value="${escapeHtml(filters.minDeviation)}" placeholder=" ">`)}
        ${field('minNet', 'Minimum avantaj', `<input class="form-control" id="opp-minNet" data-filter="minNet" type="number" min="0" step="1" value="${escapeHtml(filters.minNet)}" placeholder=" ">`)}
        ${select('confidence', 'Veri güveni', `<option value=""${filters.confidence === '' ? ' selected' : ''}>Tümü</option><option value="0.35"${filters.confidence === '0.35' ? ' selected' : ''}>Orta</option><option value="0.7"${filters.confidence === '0.7' ? ' selected' : ''}>Yüksek</option>`)}
        <button class="btn btn-primary" type="button" data-opportunities-refresh>Taramayı yenile</button>
    </div>`;
    initFloatingLabels(root.querySelector('[data-opportunities-filters]'));
    root.querySelectorAll('[data-filter]').forEach((input) => {
        const event = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(event, () => {
            state.filters[input.dataset.filter] = input.value;
            renderTable();
        });
    });
    root.querySelector('[data-opportunities-refresh]').addEventListener('click', () => loadScan());
}

function renderChips() {
    root.querySelectorAll('[data-view]').forEach((button) => {
        const active = button.dataset.view === state.filters.view;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    root.querySelectorAll('[data-sort]').forEach((button) => {
        const active = button.dataset.sort === state.filters.sort;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function renderShell() {
    const chips = VIEWS.map((view) => `<button type="button" class="opp-view${state.filters.view === view.id ? ' is-active' : ''}" data-view="${view.id}" aria-pressed="${state.filters.view === view.id}">${view.label}</button>`).join('');
    const sorts = SORTS.map((sort) => `<button type="button" class="opp-view${state.filters.sort === sort.id ? ' is-active' : ''}" data-sort="${sort.id}" aria-pressed="${state.filters.sort === sort.id}">${sort.label}</button>`).join('');
    root.innerHTML = toolPageHtml({
        key: 'opportunities',
        head: `<section class="page-head" data-page-head="opportunities"><div class="page-head-content"><h1>Günün Fırsatları <span class="badge opp-badge" data-app-tooltip="${escapeHtml(`Buy ve Sell, hareketten önceki saatlik gözlemlere göre ayrı izlenir. Görünen fark dolu bir emir değildir.\n${feeMetaText(getSettings().premium !== false)}\nSıra fiyat anomalisini, veri güvenini ve oluşma zamanını kullanır. Teorik fark sırayı belirlemez.`)}">Bilgi</span></h1></div></section>`,
        controls: `<div class="opp-bar"><div class="opp-views" role="radiogroup" aria-label="Fırsat türü">${chips}</div><div class="opp-views" role="radiogroup" aria-label="Sıralama">${sorts}</div><div data-opportunities-filters></div></div>`,
        result: '<div data-opportunities-result></div>',
        overlays: '<dialog class="app-dialog opp-dialog" data-opportunities-dialog><button type="button" class="app-dialog-close" aria-label="Kapat" data-opportunities-close></button><div class="opp-sheet" data-opportunities-sheet></div></dialog>'
    });
    root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
        state.filters.view = button.dataset.view;
        renderChips();
        renderTable();
    }));
    root.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
        state.filters.sort = button.dataset.sort;
        renderChips();
        renderTable();
    }));
    root.querySelector('[data-opportunities-close]').addEventListener('click', () => {
        root.querySelector('[data-opportunities-dialog]').close();
    });
}

function scanFailure(error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Tarama zaman aşımına uğradı.';
    if (/failed|network|fetch/i.test(String(error?.message || error))) return 'Fiyat hub kapalı. start.bat ile açın.';
    return error?.message || 'Fırsat taraması alınamadı.';
}

async function loadScan() {
    showPageLoader();
    try {
        const premium = getSettings().premium !== false;
        const params = new URLSearchParams({ server: getServer().id, premium: premium ? '1' : '0' });
        const response = await fetch(`${localPriceHost()}/api/v1/market/opportunities?${params}`, { signal: AbortSignal.timeout(60000) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(response.status === 400 ? 'Seçili sunucu, fiyat hub sunucusuyla uyuşmuyor.' : (payload.error || 'Fırsat taraması alınamadı.'));
        }
        state.scan = payload;
        state.error = null;
    } catch (error) {
        state.scan = null;
        state.error = scanFailure(error);
    } finally {
        hidePageLoader();
        renderFilters();
        renderTable();
    }
}

async function main() {
    root = document.querySelector('[data-opportunities]');
    if (!root) return;
    initNav();
    await initStore();
    recordCurrentToolVisit();
    renderShell();
    await loadScan();
}

main();
