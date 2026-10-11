import { assistantAction, candidateIdentity, candidateSnapshot, updateWatch, FEEDBACK_TYPES, feedbackMetrics, rangePosition, ACTION_LABELS, candidatePriority } from '../core/opportunity-assistant.mjs';
import { readOpportunityJournal, saveOpportunityJournal } from '../core/opportunity-journal.js';
import { rankOpportunityPresentation, EXECUTION_MODELS, OPPORTUNITY_QUALITY_POLICY } from '../core/market-opportunity-quality.mjs';
import { OPPORTUNITY_POLICY } from '../core/market-opportunities.mjs';
import { SPREAD_CLASSES, SPREAD_REVIEW_CLASSES, opportunityEvidenceClass } from '../core/market-spread-realism.mjs';
import { toggleAllFilter } from '../components/filter-selection.js';
import { itemNameHtml } from '../components/item-name.js';
import { toolPageHtml } from '../components/tool-page.js';
import { itemIconHtml, itemLabel } from '../components/item-icon.js';
import { initFloatingLabels } from '../components/forms.js';
import { cityFieldHtml, bindCityField, setCityFieldValue } from '../components/city-picker.js';
import { loadActiveCities } from '../core/cities.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { recordCurrentToolVisit } from '../core/usage.js';
import { getServer, getSettings, localPriceHost } from '../core/settings.js';
import { bindLivePrices } from '../core/price-live.js';
import { feeMetaText } from '../core/market-fees.js';
import { routeHref } from '../core/routes.js';
import { readStorage, writeStorage, readJsonStorage, writeJsonStorage } from '../core/storage.js';
import { OBSERVATION_REASON_TEXT } from '../core/market-observation.mjs';
import { AODP_COLLECTOR_POLICY, PRICE_STALE_MS } from '../core/market-history-config.mjs';
import { EXTREME_DEVIATION, PRIMARY_STATUS as STATUS, STRATEGY_SPECS, isOpportunityFilter, opportunityDecision, resolveOpportunityCard } from '../core/opportunity-status.mjs';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { escapeHtml } from '../utils/utils.js';
import { formatPct, formatQuantity, formatRelativeDateTime, formatSilver } from '../utils/format.js';

const SORTS = [
    { id: 'balanced', label: 'Dengeli' },
    { id: 'recent', label: 'Güncellik' },
    { id: 'importance', label: 'Önem' }
];
const OPPORTUNITY_STRATEGY_IDS = Object.keys(STRATEGY_SPECS).filter(id =>
    STRATEGY_SPECS[id].group === 'historical' || id === 'local-flip' || id === 'cross-city-instant');
const SPREAD_STRATEGY_IDS = ['local-make'];
const spreadReviewKey = row => row.spreadReview?.classification || 'insufficient';
const spreadReviewModel = row => SPREAD_REVIEW_CLASSES[spreadReviewKey(row)] || SPREAD_REVIEW_CLASSES.insufficient;
const spreadViewIds = Object.keys(SPREAD_REVIEW_CLASSES).map(key => `spread:${key}`);
const validView = id => isOpportunityFilter(id) || spreadViewIds.includes(id);
const LIST_MODES = Object.freeze({
    opportunities: { label: 'Fırsatlar', strategyIds: OPPORTUNITY_STRATEGY_IDS },
    spreads: { label: 'Makas Stratejileri', strategyIds: SPREAD_STRATEGY_IDS },
    suspicious: { label: 'Şüpheli', strategyIds: OPPORTUNITY_STRATEGY_IDS }
});
const PAGE_STRATEGY_IDS = new Set(Object.values(LIST_MODES).flatMap(mode => mode.strategyIds));
const PAGE_EXECUTIONS = new Set([...PAGE_STRATEGY_IDS].map(id => STRATEGY_SPECS[id].execution));
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
const LAYOUT_KEY = 'opp-layout';
const FILTERS_KEY = 'opp-filters';
function readLayout() {
    const saved = readStorage(LAYOUT_KEY);
    return saved === 'cards' ? 'cards' : 'list';
}
function defaultFilters() {
    return { viewMode: 'opportunities', views: [], excludedViews: [], sort: 'balanced', city: '', tier: '', enchant: '', query: '', minDeviation: '12', minNet: OPPORTUNITY_QUALITY_POLICY.minNet ?? '', minReturn: OPPORTUNITY_QUALITY_POLICY.minReturn ?? '', execution: '', confidence: '', evidence: '', watched: '', action: '' };
}

function readFilters() {
    const filters = defaultFilters();
    const saved = readJsonStorage(FILTERS_KEY);
    if (!saved || typeof saved !== 'object') return filters;
    for (const key of Object.keys(filters)) {
        if (typeof filters[key] === 'string' && typeof saved[key] === 'string') filters[key] = saved[key];
    }
    filters.views = Array.isArray(saved.views)
        ? [...new Set(saved.views.filter(validView))] : [];
    filters.excludedViews = Array.isArray(saved.excludedViews)
        ? [...new Set(saved.excludedViews.filter(validView))] : [];
    filters.views = filters.views.filter(id => !filters.excludedViews.includes(id));
    if (!SORTS.some((sort) => sort.id === filters.sort)) filters.sort = 'balanced';
    if (!Object.hasOwn(LIST_MODES, filters.viewMode)) filters.viewMode = 'opportunities';
    const strategyIds = filters.viewMode === 'spreads' ? spreadViewIds : LIST_MODES[filters.viewMode].strategyIds;
    filters.views = filters.views.filter(id => strategyIds.includes(id));
    filters.excludedViews = filters.excludedViews.filter(id => strategyIds.includes(id));
    if (!['', '1', '2', '3', '4', '5', '6', '7', '8'].includes(filters.tier)) filters.tier = '';
    if (!['', '0', '1', '2', '3', '4'].includes(filters.enchant)) filters.enchant = '';
    if (!['', '0.35', '0.7'].includes(filters.confidence)) filters.confidence = '';
    const deviation = Number(filters.minDeviation);
    filters.minDeviation = Number.isFinite(deviation) ? String(Math.round(Math.min(500, Math.max(12, deviation)))) : '12';
    if (!Number.isFinite(Number(filters.minNet)) || Number(filters.minNet) < 0) filters.minNet = '';
    if (!Number.isFinite(Number(filters.minReturn)) || Number(filters.minReturn) < 0) filters.minReturn = '';
    if (filters.execution && !PAGE_EXECUTIONS.has(filters.execution)) filters.execution = '';
    if (filters.evidence && !SPREAD_CLASSES[filters.evidence] && !Object.hasOwn(SPREAD_REVIEW_CLASSES, filters.evidence) && filters.evidence !== 'unclassified') filters.evidence = '';
    return filters;
}

function saveFilters() {
    writeJsonStorage(FILTERS_KEY, state.filters);
}

const state = {
    scan: null, error: null, selectedId: '', series: null, seriesError: '',
    journal: readOpportunityJournal() || { watches: {}, feedback: [] },
    layout: readLayout(),
    filters: readFilters()
};
let root;

function persistJournal(next) {
    if (!saveOpportunityJournal(next)) { state.error = 'İzleme / geri bildirim kaydedilemedi. Tarayıcı depolamasını kontrol edin.'; return false; }
    state.journal = next; return true;
}
function watchKey(row) { return candidateIdentity(row, getServer().id); }
function isWatched(row) { const record = state.journal.watches[watchKey(row)]; return Boolean(record && record.active !== false); }
function watchButton(row) {
    const active = isWatched(row), label = active ? 'İzleniyor · izlemeyi durdur' : 'İzlemeye al';
    return `<button type="button" class="btn btn-sm btn-outline-secondary opp-watch-button" data-watch="${escapeHtml(row.id)}" aria-label="${escapeHtml(label)}" aria-pressed="${active}"${tip(label)}>${ICONS[active ? 'check' : 'clock']}</button>`;
}
function sideRangeText(side) {
    const range = side?.normalRange, position = rangePosition(side?.price, range);
    return range && position ? `Normal ${formatSilver(range.low)}–${formatSilver(range.high)} · ${{below:'aralık altında',above:'aralık üstünde',inside:'aralık içinde'}[position.position]} ${signedPct(position.deviation)}` : 'Normal aralık için veri yetersiz';
}
function referenceText(row) {
    return (STRATEGY_SPECS[row.primary?.id]?.inputs || ['buy','sell']).filter(key => key !== 'destination').map(key => {
        return key.toUpperCase()+': '+sideRangeText(row[key]);
    }).join(' · ');
}
function syncWatches() {
    state.journal = readOpportunityJournal() || state.journal;
    const next = { ...state.journal, watches: { ...state.journal.watches } };
    const candidates = new Map(rows().flatMap(row => (row.strategies?.length ? row.strategies : [row.primary]).map(primary => {
        const candidate = { ...row, primary }; return [watchKey(candidate), candidate];
    })));
    for (const [key, record] of Object.entries(next.watches)) {
        if (record.server === getServer().id && record.active !== false) next.watches[key] = updateWatch(record, candidates.get(key));
    }
    if (Object.keys(next.watches).length) persistJournal(next);
}
function bindAssistant(host) {
    host.querySelectorAll('[data-watch-remove]').forEach(button => button.addEventListener('click', () => {
        state.journal = readOpportunityJournal() || state.journal;
        const next = { ...state.journal, watches: { ...state.journal.watches } };
        const record = next.watches[button.dataset.watchRemove];
        if (record) next.watches[button.dataset.watchRemove] = { ...record, active: record.active === false };
        persistJournal(next); renderTable();
    }));
    host.querySelectorAll('[data-watch]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        state.journal = readOpportunityJournal() || state.journal;
        const row = rankedVisibleRows().find(r => r.id === button.dataset.watch); if (!row) return;
        const key = watchKey(row), next = { ...state.journal, watches: { ...state.journal.watches } };
        if (next.watches[key]) next.watches[key] = { ...next.watches[key], active: next.watches[key].active === false };
        else { const first = candidateSnapshot(row); next.watches[key] = { active: true, server: getServer().id, itemId: row.itemId, city: row.city, quality: row.quality, strategy: row.primary?.id, toCity: row.primary?.toCity, first, last: first, changes: [] }; }
        persistJournal(next); renderTable();
    }));
    host.querySelectorAll('[data-feedback]').forEach(button => button.addEventListener('click', () => {
        state.journal = readOpportunityJournal() || state.journal;
        const row = rankedVisibleRows().find(r => r.id === state.selectedId); if (!row) return;
        const event = { type: button.dataset.feedback, at: Date.now(), key: watchKey(row), server: getServer().id, itemId: row.itemId, city: row.city, quality: row.quality, strategy: row.primary?.id, snapshot: candidateSnapshot(row) };
        const saved = persistJournal({ ...state.journal, feedback: [...state.journal.feedback, event] });
        const message = host.querySelector('[data-feedback-message]');
        if (message) message.textContent = saved ? FEEDBACK_TYPES[event.type]+' kaydedildi' : state.error;
    }));
}
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
    return [...new Map([...(state.scan?.eligibleCandidates || state.scan?.opportunities || []), ...(state.scan?.diagnostics || []),
        ...(state.scan?.potentialCandidates || []), ...(state.scan?.suspiciousCandidates || [])].map(row => [row.id, row])).values()];
}
function eligibleListRows(mode = state.filters.viewMode) {
    if (mode === 'suspicious') return rows().filter(row => row.validationStatus === 'quarantined');
    const strategyIds = LIST_MODES[mode]?.strategyIds || OPPORTUNITY_STRATEGY_IDS;
    return rows().filter(row => (row.eligible || (mode === 'opportunities' && row.potential)) && row.strategies?.some(strategy => strategyIds.includes(strategy.id)
        && strategy.weight > 0 && strategy.advantageSilver > 0));
}
function listCounts() {
    const candidates = rows();
    const count = (strategyIds, predicate) => candidates.filter(row => predicate(row) && row.strategies?.some(strategy => strategyIds.includes(strategy.id)
        && strategy.weight > 0 && strategy.advantageSilver > 0)).length;
    const verified = count(OPPORTUNITY_STRATEGY_IDS, row => row.eligible);
    const potential = count(OPPORTUNITY_STRATEGY_IDS, row => row.potential);
    return { opportunities: verified + potential, verified, potential, suspicious: state.scan?.counts?.suspicious || 0,
        spreads: count(SPREAD_STRATEGY_IDS, row => row.eligible), suspiciousView: state.scan?.suspiciousCandidates?.length ?? state.scan?.counts?.suspicious ?? 0 };
}
// Only presentation metrics are projected; observations and engine decisions remain immutable.
function selectedStrategyContext(row, strategy) {
    const inputs = Object.values(strategy.evidence?.inputs || {}).filter(Boolean);
    const fresh = age => !Number.isFinite(age) || age < 0 ? 0 : age <= OPPORTUNITY_POLICY.freshMs ? 1
        : Math.max(0, 1 - (age - OPPORTUNITY_POLICY.freshMs) / (PRICE_STALE_MS - OPPORTUNITY_POLICY.freshMs));
    const freshness = inputs.length ? Math.min(...inputs.map(side => fresh(side.ageMs))) : 0;
    const reliability = strategy.reliability ?? 0;
    const movements = STRATEGY_SPECS[strategy.id]?.group === 'historical' ? inputs.filter(side => side.anomalous) : [];
    const anomaly = movements.length ? Math.max(...movements.map(side =>
        Math.log10(1 + Math.min(Math.abs(side.absoluteDelta || 0), OPPORTUNITY_POLICY.silverScale)) / Math.log10(1 + OPPORTUNITY_POLICY.silverScale))) : 0;
    const score = (anomaly || OPPORTUNITY_POLICY.bookStateRank) * reliability * freshness;
    const times = (movements.length ? movements : inputs).map(side => Date.parse(movements.length ? side.formedAt : side.at)).filter(Number.isFinite);
    const formedAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
    const recency = formedAt && state.scan?.scannedAt ? fresh(Date.parse(state.scan.scannedAt) - Date.parse(formedAt)) : freshness;
    return { score, recency, formedAt, parts: { ...row.parts, reliability, freshness, anomaly },
        referenceConfidence: inputs.length ? Math.min(...inputs.map(side => side.referenceConfidence ?? 0)) : 0,
        executionConfidence: inputs.length ? Math.min(...inputs.map(side => side.executionConfidence ?? 0)) : 0 };
}
function rankedVisibleRows({ ignoreTypes = false } = {}) {
    const filters = state.filters;
    const strategyIds = LIST_MODES[filters.viewMode].strategyIds.filter(id => ignoreTypes || filters.viewMode === 'spreads' ||
        ((!filters.views.length || filters.views.includes(id)) && !filters.excludedViews.includes(id)));
    const query = filters.query.trim().toLocaleLowerCase('tr');
    const minDeviation = Number(filters.minDeviation) / 100;
    const matchesStrategy = (row, strategy) => {
        const spec = STRATEGY_SPECS[strategy.id];
        if (filters.action && assistantAction({ ...row, ...selectedStrategyContext(row, strategy), primary: strategy }).id !== filters.action) return false;
        if (!ignoreTypes && filters.viewMode === 'spreads') {
            const key = `spread:${spreadReviewKey(row)}`;
            if (filters.views.length && !filters.views.includes(key)) return false;
            if (filters.excludedViews.includes(key)) return false;
        }
        if (spec.group === 'historical' && minDeviation > 0 && !spec.inputs.every(key => Math.abs(row[key]?.deviation || 0) >= minDeviation)) return false;
        if (Number(filters.confidence) > 0 && !(strategy.reliability >= Number(filters.confidence))) return false;
        return !filters.evidence || (filters.viewMode === 'spreads'
            ? spreadReviewKey(row) === filters.evidence
            : opportunityEvidenceClass({ ...row, primary: strategy }) === filters.evidence);
    };
    const selected = eligibleListRows().filter((row) => {
        if (filters.watched && !(row.strategies || [row.primary]).some(primary => isWatched({ ...row, primary }))) return false;
        if (filters.city && row.city !== filters.city) return false;
        if (filters.tier && String(itemTier(row.itemId) ?? '') !== filters.tier) return false;
        if (filters.enchant !== '' && String(itemEnchant(row.itemId)) !== filters.enchant) return false;
        if (query && !`${row.itemId} ${itemLabel(row.itemId)}`.toLocaleLowerCase('tr').includes(query)) return false;
        return true;
    }).map(row => {
        if (!row.potential) return row;
        const choices = row.strategies.filter(strategy => strategyIds.includes(strategy.id)
            && (!filters.execution || (strategy.execution || STRATEGY_SPECS[strategy.id]?.execution) === filters.execution)
            && strategy.weight > 0 && strategy.advantageSilver > 0
            && (!(Number(filters.minNet) > 0) || strategy.advantageSilver >= Number(filters.minNet))
            && (!(Number(filters.minReturn) > 0) || (Number.isFinite(strategy.economics?.returnRatio) && strategy.economics.returnRatio >= Number(filters.minReturn) / 100))
            && matchesStrategy(row, strategy));
        const primary = choices.sort((a, b) => candidatePriority({...row,primary:b}) - candidatePriority({...row,primary:a}) || (b.advantageSilver * b.weight) - (a.advantageSilver * a.weight))[0];
        return primary ? { ...row, primary, presentationStrategies: choices } : null;
    }).filter(Boolean);
    return rankOpportunityPresentation(selected, { mode: filters.sort, strategyIds, execution: filters.execution,
        strategyFilter: matchesStrategy,
        strategyContext: selectedStrategyContext,
        minNet: filters.minNet === '' ? null : Number(filters.minNet), minReturn: filters.minReturn === '' ? null : Number(filters.minReturn) / 100,
        calibration: state.scan?.qualityCalibration }).filter(row => !filters.action || assistantAction(row).id === filters.action);
}
function visibleRows() {
    return rankedVisibleRows().slice(0, state.scan?.listLimit ?? OPPORTUNITY_QUALITY_POLICY.listLimit);
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
    return `<td class="num"${hint}>${formatSilver(side.price)}<small class="opp-reference">${escapeHtml(sideRangeText(side))}</small></td>${delta}`;
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
    if (row.potential && CARD_REASONS[row.primary?.id]) {
        const face = CARD_REASONS[row.primary.id];
        return { ...face, title: `Potansiyel · ${face.title}`, note: row.primary.note || 'Güven kanıtı eksik; fiyatı kontrol et.', tone: 'muted' };
    }
    if (row.presentationStrategies && CARD_REASONS[row.primary?.id]) {
        return { ...CARD_REASONS[row.primary.id], tone: STRATEGY_SPECS[row.primary.id].tone };
    }
    const deviation = Math.max(Math.abs(row.buy?.deviation || 0), Math.abs(row.sell?.deviation || 0));
    const buyOnly = row.anomalies.some((id) => id.startsWith('buy')) && !row.anomalies.some((id) => id.startsWith('sell'));
    const fresh = row.review === 'unconfirmed' ? 'Henüz doğrulanmadı' : '';
    let face;
    if (row.primary?.id === 'cross-city-instant') face = { title: 'Arbitraj fırsatı', note: 'Şehirler arası', tone: 'arb', glyph: 'swap' };
    else if (deviation >= EXTREME_DEVIATION) face = { title: 'Aşırı fiyat', note: 'Referansa göre büyük sapma', tone: 'extreme', glyph: 'alert' };
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
    'local-make': { label: 'Makası incele', tone: 'is-order' },
    'cross-city-instant': { label: 'Taşı', tone: 'is-haul' },
    'update-orders': { label: 'Güncelle', tone: 'is-review' }
};
function actionTags(row) {
    if (row.potential) return '<span class="opp-act is-review">Fiyatı kontrol et</span>';
    const ranked = (row.presentationStrategies ? [row.primary] : row.strategies || [])
        .filter((strategy) => PAGE_STRATEGY_IDS.has(strategy.id) && strategy.advantageSilver > 0 && strategy.weight > 0 && ACTIONS[strategy.id])
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
function icon(paths) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}
const ICONS = {
    cube: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5z"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 12.5 20 8M12 12.5V21M12 12.5 4 8"/>'),
    trend: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 16.5 9 11l3.5 3.5L20 7"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M14.5 7H20v5.5"/>'),
    trendDown: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7.5 9 13l3.5-3.5L20 17"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M14.5 17H20v-5.5"/>'),
    updown: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14m-3.5-3.5L16 19l3.5-3.5"/>'),
    flat: icon('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h14"/>'),
    tag: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/>'),
    ring: icon('<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2.6"/>'),
    hourglass: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5-4 8.5s4 4 4 8.5"/>'),
    double: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3.5 5.5h11v6h-11zM9.5 12.5h11v6h-11z"/>'),
    arrow: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 12h15m-5-5 5 5-5 5"/>'),
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
    cards: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z"/>'),
    check: icon('<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5 9.2 17 19 7"/>'),
    cart: icon('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M6.2 7h14.2l-1.5 8.2a1 1 0 0 1-1 .8H8.1a1 1 0 0 1-1-.8L5.4 4.8H3"/><circle cx="9.2" cy="19.2" r="1.25" fill="currentColor"/><circle cx="16.8" cy="19.2" r="1.25" fill="currentColor"/>'),
    chevron: icon('<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/>'),
    bars: icon('<path fill="currentColor" d="M4.5 13.5h3.2V20H4.5zm5.9-5h3.2V20h-3.2zm5.9-4.5H19.5V20h-3.2z"/>')
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
function statCard(tone, glyph, label, value, note, tooltip) {
    return `<article class="opp-stat is-${tone}"${tip(tooltip)}><span class="opp-stat-icon">${ICONS[glyph]}</span><span class="opp-stat-copy"><span class="opp-stat-label">${escapeHtml(label)}</span><strong class="opp-stat-value">${value}</strong><span class="opp-stat-note">${escapeHtml(note)}</span></span></article>`;
}
function boardHtml(scan, list, resultCount, totals) {
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
    const listed = list;
    const spreadMode = state.filters.viewMode === 'spreads';
    const counts = { open: 0, risk: 0, waiting: 0 };
    const positives = [];
    for (const row of listed) {
        counts[spreadMode ? ({ unusual: 'open', normal: 'risk', insufficient: 'waiting' }[spreadReviewKey(row)]) : resolveOpportunityCard(row).group] += 1;
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
                ${badge(`${server?.label || scan.server} · ${list.length} / ${resultCount} gösteriliyor`, `Bu görünümdeki filtrelere uyan ${resultCount} kayıt. En fazla ${scan.listLimit || OPPORTUNITY_QUALITY_POLICY.listLimit} kart gösterilir.`)}
                ${badge(`Hücre ${funnel.cells}`, `${notes.cells || ''}\nGeçmiş ${funnel.withHistory}. ${notes.withHistory || ''}`)}
                ${badge(`Referans ${funnel.referenceable}`, notes.referenceable)}
                ${badge(`Taze ${funnel.fresh}`, notes.fresh)}
                ${badge(`Fırsat ${totals.verified} doğrulanmış / ${totals.potential} potansiyel`, 'Potansiyel kayıtlar anlamlı fiyat hareketi veya ücret sonrası anlık fark gösterir; doğrulama eylemi gerektirir, emir önerisi değildir. Makas stratejileri ayrı sayılır.', 'is-strong')}
                ${badge(`Makas ${totals.spreads}`, 'Yerel emir kurma makası listesi. Emirlerin dolması bilinmiyor.')}
                ${scan.counts ? badge(`Şüpheli veri ${scan.counts.suspicious}`, 'Karantinaya alınmış gözlem sayısı; fırsat veya makas sayacına dahil değildir.', 'is-warn') : ''}
                ${scan.counts ? badge(`Yetersiz veri ${scan.counts.insufficient}`, 'Güven/kanıt koşullarını tamamlamayan hücre sayısı; fırsat veya makas sayacına dahil değildir.') : ''}
                ${scan.counts?.monitored ? badge(`İzlenen ${scan.counts.monitored}`, 'L3 referansı bulunan fakat henüz uygunluk kapılarını geçmeyen hücreler.') : ''}
                ${badge(`Tarama dışında ${funnel.filtered}`, `Taranan hücrelerden engine'in sınırlı listelemesine alınmayan toplam. Fırsat ve makas listelerinin toplamı değildir.\n${dropped}`)}
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
            ${statCard('gain', 'trend', spreadMode ? 'Olağandışı makas' : 'Değerlendirilebilir', formatQuantity(counts.open, { digits: 0 }), listed.length ? `${formatPct(counts.open / listed.length)} oranında` : '—', 'Uygulanabilir ya da doğrulanmış strateji durumundaki kartlar. Gerçekleşen kâr değildir.')}
            ${statCard('average', 'scale', 'Ortalama teorik fark', average == null ? '—' : formatSilver(average, { signed: true }), 'Pozitif olanlar', 'Pozitif teorik farkların ortalaması. Emrin dolacağı varsayılmaz.')}
            ${statCard('peak', 'coins', 'En yüksek fark', peak ? formatSilver(peak.primary.advantageSilver, { signed: true }) : '—', peak ? itemLabel(peak.itemId) : '—', 'Listede görünen en büyük teorik fark. Sıralamayı tek başına belirlemez.')}
            ${statCard('rate', 'clock', 'Anomali oranı', rateBase ? formatPct(funnel.anomalies / rateBase) : '—', `${formatQuantity(funnel.anomalies, { digits: 0 })} / ${formatQuantity(rateBase, { digits: 0 })} referans`, 'Sapma eşiğini geçen hücrelerin, referansı olan hücrelere oranı.')}
        </div>
        <div class="opp-strip-row">
            <div class="opp-strip">
                <span class="opp-strip-title">${ICONS.bolt}Hızlı özet</span>
                <span${tip('Uygulanabilir ya da doğrulanmış strateji.')}><span class="opp-dot is-up"></span>${formatQuantity(counts.open, { digits: 0 })} ${spreadMode ? 'olağandışı makas' : 'fırsat'}</span>
                <span${tip('Engelli, anomali ya da ücret sonrası kârsız.')}><span class="opp-dot is-down"></span>${formatQuantity(counts.risk, { digits: 0 })} ${spreadMode ? 'normal makas' : 'riskli'}</span>
                <span${tip('Yetersiz veri, eski veri ya da henüz doğrulanmamış.')}><span class="opp-dot"></span>${formatQuantity(counts.waiting, { digits: 0 })} ${spreadMode ? 'veri yetersiz' : 'beklemede'}</span>
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

function citySlug(city) {
    return String(city || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}
function trustOf(row) {
    const confidence = Math.round((row.parts.reliability || 0) * 100);
    return { confidence, tone: confidence >= 70 ? 'is-high' : confidence >= 35 ? 'is-mid' : 'is-low' };
}
const TRUST_LEVEL = { 'is-high': 3, 'is-mid': 2, 'is-low': 1 };
const SIDE_NAME = { buy: 'Buy', sell: 'Sell' };
const CARD_REASONS = {
    'place-sell-order': { side: 'sell', glyph: 'trend', title: 'Yüksek Sell', note: 'Satış fiyatı referansın üzerinde.', action: { glyph: 'tag', label: 'Satış emri koy' } },
    'instant-buy-from-sell': { side: 'sell', glyph: 'trendDown', title: 'Düşük Sell', note: 'Satış fiyatı referansın altında.', action: { glyph: 'cart', label: 'Hemen al' } },
    'instant-sell-to-buy': { side: 'buy', glyph: 'trend', title: 'Yüksek Buy', note: 'Alış emri referansın üzerinde.', action: { glyph: 'coins', label: 'Buy emrine sat' } },
    'place-buy-order': { side: 'buy', glyph: 'trendDown', title: 'Düşük Buy', note: 'Alış emirleri referansın altında.', action: { glyph: 'tag', label: 'Alış emri koy' } },
    'local-make': { pair: 'make', glyph: 'swap', title: 'Makas incelemesi', note: 'Pozitif makas tek başına işlem gerekçesi değildir.', action: { glyph: 'swap', label: 'Makası incele' } },
    'local-flip': { pair: 'flip', glyph: 'swap', title: 'Ters makas', note: 'Buy emri, Sell fiyatının üzerinde.', action: { glyph: 'swap', label: 'Al ve hemen sat' } },
    'cross-city-instant': { pair: 'haul', glyph: 'swap', title: 'Şehirler arası fark', note: 'Burada al, diğer şehrin Buy emrine sat.', action: { glyph: 'arrow', label: 'Taşı ve sat' } }
};
const STATUS_VIEW = {
    [STATUS.BLOCKED]: { glyph: 'alert', title: 'İşlem engeli', note: 'Kritik fiyat verisi geçersiz.', action: { glyph: 'alert', label: 'Veriyi kontrol et' } },
    [STATUS.ANOMALY]: { glyph: 'alert', title: 'Aşırı fiyat', action: { glyph: 'alert', label: 'Fiyatı doğrula' } },
    [STATUS.INSUFFICIENT]: { glyph: 'ring', title: 'Yetersiz veri', action: { glyph: 'clock', label: 'Veri bekle' } },
    [STATUS.STALE]: { glyph: 'clock', title: 'Eski veri', action: { glyph: 'refresh', label: 'Fiyatı yenile', rescan: true } },
    [STATUS.UNPROFITABLE]: { glyph: 'trendDown', title: 'Kâr yok', note: 'Ücret sonrası sonuç sıfır veya negatif.', action: { glyph: 'alert', label: 'İşlem açma' } },
    [STATUS.NEUTRAL]: { action: { glyph: 'list', label: 'İncele' } }
};
const MISSING_NOTE = {
    prices: 'Zorunlu fiyat veya referans eksik.',
    freshness: 'Fiyatın güncelliği bilinmiyor.',
    confidence: 'Motorun güven koşulu karşılanmadı.',
    net: 'Ücret sonrası sonuç hesaplanamadı.',
    feasibility: 'Uygulanabilirlik doğrulanmadı.'
};

function sidePrices(side) {
    return side?.price ? `${formatSilver(side.price)} / Ref ${side.reference ? formatSilver(side.reference) : 'yok'}` : '';
}
function reasonMetric(row, reason, strategy) {
    if (reason.side) {
        const side = row[reason.side];
        return { label: SIDE_NAME[reason.side], value: signedPct(side?.deviation), sub: sidePrices(side) };
    }
    if (!reason.pair) return { value: '—' };
    if (Number.isFinite(strategy?.economics?.netSilver)) {
        const ratio = strategy.economics.returnRatio;
        return { value: formatSilver(strategy.economics.netSilver, { signed: true }), after: 'teorik fark / adet',
            sub: Number.isFinite(ratio) ? `${formatPct(ratio)} getiri${strategy.execution === 'transport' ? ' · taşıma öncesi' : strategy.execution === 'order' ? ' · emirler dolarsa' : ''}` : '' };
    }
    const [from, to, fromName, toName] = reason.pair === 'flip' ? [row.sell?.price, row.buy?.price, 'Sell', 'Buy']
        : reason.pair === 'haul' ? [strategy?.buyPrice, strategy?.sellPrice, strategy?.fromCity, strategy?.toCity]
            : [row.buy?.price, row.sell?.price, 'Buy', 'Sell'];
    return {
        value: from > 0 && to > 0 ? formatPct((to - from) / from) : '—',
        after: 'brüt fark',
        sub: `${fromName} ${formatSilver(from)} → ${toName} ${formatSilver(to)}`
    };
}
function inputAges(row, card) {
    return (STRATEGY_SPECS[card.decision?.id]?.inputs || [])
        .map((key) => key === 'destination' ? card.decision.strategy?.destAgeMs : row[key]?.ageMs)
        .filter(Number.isFinite);
}
function statusMetric(row, card, reason) {
    switch (card.status) {
    case STATUS.ANOMALY: {
        const extreme = [['buy', row.buy], ['sell', row.sell]]
            .filter(([, candidate]) => candidate?.anomalous && Math.abs(candidate.deviation || 0) >= EXTREME_DEVIATION)
            .sort((a, b) => Math.abs(b[1].deviation) - Math.abs(a[1].deviation))[0];
        if (!extreme) return { value: 'Karantinada', sub: 'Fiyat kanıtını doğrula' };
        const [key, side] = extreme;
        return { label: SIDE_NAME[key], value: deltaText(side.deviation), sub: sidePrices(side) };
    }
    case STATUS.STALE: {
        const ages = inputAges(row, card);
        return { label: 'Son gözlem', value: ages.length ? `${ageLabel(Math.max(...ages))} önce` : '—' };
    }
    case STATUS.UNPROFITABLE:
        return { value: formatSilver(card.facts.net, { signed: true }), after: 'ücret sonrası' };
    case STATUS.BLOCKED:
        return { value: 'Geçersiz' };
    default:
        return reasonMetric(row, reason, card.decision?.strategy);
    }
}
function cardFace(row) {
    const card = resolveOpportunityCard(row);
    const reason = CARD_REASONS[card.decision?.id] || { glyph: 'flat', title: row.patternLabel, note: '', action: STATUS_VIEW[STATUS.NEUTRAL].action };
    if (row.potential) {
        return { card, glyph: reason.glyph, title: `Potansiyel · ${reason.title}`,
            note: row.primary?.note || 'Güven kanıtı eksik; işlem önerisi değildir.',
            metric: statusMetric(row, card, reason), action: { glyph: 'search', label: 'Fiyatı kontrol et' } };
    }
    const view = STATUS_VIEW[card.status] || {};
    const spread = card.decision?.id === 'local-make' ? spreadReviewModel(row) : null;
    const note = spread?.note ?? (card.status === STATUS.INSUFFICIENT
        ? card.causes.map((cause) => MISSING_NOTE[cause]).join(' ')
        : card.status === STATUS.ANOMALY ? 'Şüpheli fiyat kanıtı. İşlemden önce doğrula.'
            : view.note ?? reason.note);
    return {
        card,
        glyph: view.glyph || reason.glyph,
        title: spread?.label || view.title || reason.title,
        note,
        metric: statusMetric(row, card, reason),
        action: spread ? { glyph: 'list', label: spread.action } : view.action || reason.action
    };
}
function mark(glyph, tone, lines) {
    const text = lines.filter(Boolean).join('\n');
    return `<span class="opp-mark ${tone}" role="img" aria-label="${escapeHtml(lines[0])}"${tip(text)}>${ICONS[glyph]}</span>`;
}
function statusMark(row, card) {
    if (row.potential) return mark('search', 'is-limited', ['Potansiyel', row.primary?.note || 'Fiyatı kontrol et; emir önerisi değildir.']);
    if (card.decision?.id === 'local-make') return mark('ring', 'is-limited', ['Makas incelemesi', 'İşlem veya dolum doğrulaması değildir.']);
    if (card.status === STATUS.ACTIONABLE) return mark('bolt', 'is-ready', ['Uygulanabilir', 'Onaylı, ücret sonrası pozitif ve uygulanabilirliği doğrulanmış.']);
    if (card.status === STATUS.STRATEGY) return mark('scale', 'is-strategy', ['Strateji', 'Kullanılan fiyat kanıtı uygun ve ücret sonrası teorik fark pozitif. Dolum ve uygulanabilirlik doğrulanmadı.']);
    return reviewMark(row);
}
function reviewMark(row) {
    if (row.review === 'confirmed') return mark('check', 'is-ready', ['Doğrulandı', row.reviewLabel]);
    if (row.review === 'unconfirmed') return mark('spark', 'is-fresh', ['Yeni', 'Henüz tek saat diliminde görüldü.']);
    return mark('ring', 'is-limited', ['Sınırlı', 'Anomali yok; onay adımı uygulanmaz.']);
}
function orderMark(strategy) {
    if (!strategy) return '';
    if (strategy.id === 'local-make') return mark('double', 'is-order', ['Makas incelemesi', 'Görünen fark emirlerin dolacağı anlamına gelmez.']);
    if (strategy.kind === 'unrealized') return mark('hourglass', 'is-order', ['Dolmamış emir', strategy.note]);
    if (strategy.kind === 'savings') return mark('coins', 'is-limited', ['Tasarruf, kâr değil', strategy.note]);
    return '';
}
function trustMark(row) {
    const trust = trustOf(row);
    const level = TRUST_LEVEL[trust.tone];
    const bars = [[4.5, 14, 6], [10.4, 9.5, 10.5], [16.3, 5, 15]]
        .map(([x, y, h], index) => `<rect x="${x}" y="${y}" width="3.2" height="${h}" fill="currentColor"${index < level ? '' : ' opacity=".25"'}/>`)
        .join('');
    const text = `Referans güveni %${Math.round((row.referenceConfidence ?? row.parts.reliability ?? 0) * 100)}\nİşlem güveni %${Math.round((row.executionConfidence ?? 0) * 100)}\n${[row.buy, row.sell].flatMap(side => side?.validationReasons || []).map(reason => OBSERVATION_REASON_TEXT[reason] || reason).join(', ')}\nHacim içermez.`;
    return `<span class="opp-mark ${trust.tone}" role="img" aria-label="Güven %${trust.confidence}"${tip(text)}>${icon(bars)}</span>`;
}
function cardHtml(row) {
    const face = cardFace(row);
    const { card } = face;
    const strategy = card.decision?.strategy;
    const tier = itemTier(row.itemId);
    const enchant = itemEnchant(row.itemId);
    const tierTip = [`Tier ${tier}`, enchant ? `Enchant ${enchant}` : '', row.quality > 1 ? `Kalite ${row.quality}` : ''].filter(Boolean).join(' · ');
    const tierBadge = tier ? `<span class="badge opp-card-tier" data-tier="${tier}"${tip(tierTip)}>T${tier}${enchant ? `.${enchant}` : ''}</span>` : '';
    const net = Number.isFinite(card.facts.net) ? `Ücret sonrası teorik sonuç ${formatSilver(card.facts.net, { signed: true })}. Gerçekleşmiş kâr değildir.` : '';
    const execution = strategy?.execution || STRATEGY_SPECS[strategy?.id]?.execution;
    const actionTip = [card.label, EXECUTION_MODELS[execution]?.label, strategy?.label, net, strategy?.note].filter(Boolean).join('\n');
    const metric = face.metric;
    const marks = `${statusMark(row, card)}${card.decision?.declined ? '' : orderMark(strategy)}${trustMark(row)}`;
    face.action = { ...face.action, label: assistantAction(row).label };
    return `<article class="opp-card is-status-${card.status.toLowerCase()} is-tone-${card.tone}${state.selectedId === row.id ? ' is-selected' : ''}" data-opportunity="${escapeHtml(row.id)}" data-city="${escapeHtml(citySlug(row.city))}" data-trade="${card.trade}" tabindex="0">
        <header class="opp-card-head">
            <span class="opp-card-art">${itemIconHtml(row.itemId, { visual: true })}${tierBadge}</span>
            <div class="opp-card-id"><strong${tip(itemLabel(row.itemId))}>${itemNameHtml(itemLabel(row.itemId))}</strong><span class="opp-card-meta"><span class="opp-card-city" lang="en">${escapeHtml(strategy?.toCity ? `${row.city} → ${strategy.toCity}` : row.city)}${row.quality > 1 ? ` · Q${row.quality}` : ''}</span><span class="opp-card-marks">${marks}</span></span></div>
        </header>
        <div class="opp-focus"${tip([card.label, face.note, [metric.label, metric.value, metric.after].filter(Boolean).join(' '), metric.sub, row.patternLabel, row.reviewLabel].filter(Boolean).join('\n'))}>
            <div class="opp-focus-why"><span class="opp-focus-icon">${ICONS[face.glyph]}</span><span><strong>${escapeHtml(face.title)}</strong>${face.note ? `<small>${escapeHtml([EXECUTION_MODELS[execution]?.label, face.note].filter(Boolean).join(' · '))}</small>` : ''}</span></div>
            <div class="opp-focus-value"><span class="opp-focus-metric">${metric.label ? `<small>${escapeHtml(metric.label)}</small>` : ''}<strong>${escapeHtml(metric.value)}</strong>${metric.after ? `<small>${escapeHtml(metric.after)}</small>` : ''}</span>${metric.sub ? `<span class="opp-focus-sub">${escapeHtml(metric.sub)}</span>` : ''}</div>
        </div>
        <small class="opp-reference">${escapeHtml(referenceText(row))}</small>
        <div class="opp-card-controls">${watchButton(row)}
        <button type="button" class="opp-card-go"${face.action.rescan ? ' data-opportunities-rescan' : ''}${tip(actionTip)}>${ICONS[face.action.glyph]}<span>${escapeHtml(face.action.label)}</span>${ICONS.chevron}</button></div>
    </article>`;
}
function renderTable() {
    const host = root.querySelector('[data-opportunities-result]');
    const ranked = rankedVisibleRows();
    const list = ranked.slice(0, state.scan?.listLimit ?? OPPORTUNITY_QUALITY_POLICY.listLimit);
    const totals = listCounts();
    renderChips(ranked, totals);
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
                        <th rowspan="2"${tip('Kartla aynı ana durum. Doluluk tahmini değildir.')}>Durum</th>
                    </tr>
                    <tr class="opp-subhead">
                        <th class="num">Fiyat</th><th class="num">Δ%</th><th class="num">Fiyat</th><th class="num">Δ%</th>
                    </tr>
                </thead>
                <tbody>${list.map((row) => {
                    const { confidence, tone: trust } = trustOf(row);
                    const tier = itemTier(row.itemId);
                    const enchant = itemEnchant(row.itemId);
                    const face = anomalyFace(row);
                    const status = resolveOpportunityCard(row);
                    const spread = row.primary?.id === 'local-make' ? spreadReviewModel(row) : null;
                    const faceTip = [row.patternLabel, row.reviewLabel, row.primary?.note, spread?.note].filter(Boolean).join('\n');
                    const label = itemLabel(row.itemId);
                    return `<tr class="opp-row${state.selectedId === row.id ? ' is-selected' : ''}" data-opportunity="${escapeHtml(row.id)}" tabindex="0">
                        <td><span class="opp-identity">${itemIconHtml(row.itemId, { visual: true })}<span class="opp-meta">${tier ? `<span class="badge" data-tier="${tier}">T${tier}</span>` : ''}${enchant ? badge(`@${enchant}`, 'Enchant') : ''}</span><span class="opp-name"><strong>${itemNameHtml(label)}</strong><span class="opp-acts">${actionTags(row)}</span></span></span></td>
                        <td><span class="opp-city">${escapeHtml(row.city)}${row.quality > 1 ? `<small>Q${row.quality}</small>` : ''}</span></td>
                        ${sideCells(row.buy)}${sideCells(row.sell)}
                        <td><span class="opp-move ${moveTone(row.pattern)}"${tip(row.patternLabel)}>${escapeHtml(PATTERN_BADGE[row.pattern] || row.patternLabel)}</span></td>
                        <td><span class="opp-kind is-${face.tone}"${tip(faceTip)}><span class="opp-kind-icon">${ICONS[face.glyph]}</span><span><strong>${escapeHtml(spread?.label || face.title)}</strong><small>${escapeHtml(spread?.note || face.note)}</small></span></span></td>
                        ${advantageCell(row)}
                        <td><span class="opp-trust ${trust}"${tip('Referans örnek sayısı, yayılım ve onay. Hacim içermez.')}><span class="opp-trust-track"><span class="opp-trust-fill" style="width:${confidence}%"></span></span></span></td>
                        <td><span class="opp-fit"${tip(status.causes.map((cause) => MISSING_NOTE[cause]).filter(Boolean).join('\n'))}><span class="opp-fit-pill is-tone-${status.tone}">${escapeHtml(assistantAction(row).label)}</span>${watchButton(row)}</span></td>
                    </tr>`;
                }).join('') || `<tr><td colspan="11" class="opp-empty">${state.error ? 'Tarama sonucu yok.' : 'Bu filtrelerde satır yok.'}</td></tr>`}</tbody>
            </table>
        </div>`;
    host.innerHTML = `${state.error ? `<p class="opp-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
        ${boardHtml(scan, list, ranked.length, totals)}
        ${body}
        ${state.filters.watched ? `<details class="opp-watch-history"><summary>İzleme geçmişi · ${Object.values(state.journal.watches).filter(w => w.server === getServer().id).length}</summary>${Object.values(state.journal.watches).filter(w => w.server === getServer().id).map(w => `<p>${itemNameHtml(itemLabel(w.itemId))} <button type="button" class="btn btn-sm btn-outline-secondary" data-watch-remove="${escapeHtml(candidateIdentity({itemId:w.itemId,city:w.city,quality:w.quality,primary:{id:w.strategy,toCity:w.toCity}},w.server))}">${w.active === false ? 'İzlemeyi sürdür' : 'İzlemeden çıkar'}</button> · ${escapeHtml(w.city)} · ${w.active === false ? 'İzleme durduruldu · ' : ''}${escapeHtml(w.last.action)} · ${escapeHtml(w.last.statusLabel || w.last.status)} · ${formatRelativeDateTime(new Date(w.last.at).toISOString())} · ${w.last.status === 'ABSENT' ? 'Son bilinen ' : ''}Buy ${formatSilver(w.last.buy)} / Sell ${formatSilver(w.last.sell)}<small>İlk: Buy ${formatSilver(w.first.buy)} / Sell ${formatSilver(w.first.sell)} · referans ${formatSilver(w.first.buyReference)} / ${formatSilver(w.first.sellReference)} · ${formatRelativeDateTime(new Date(w.first.at).toISOString())}</small>${w.changes.map(change => `<small>${formatRelativeDateTime(new Date(change.at).toISOString())} · ${escapeHtml(change.action)} · ${escapeHtml(change.statusLabel || change.status)} · Buy ${formatSilver(change.buy)} / Sell ${formatSilver(change.sell)}</small>`).join('')}</p>`).join('')}</details>` : ''}`;
    host.querySelectorAll('[data-opportunities-rescan]').forEach((button) => button.addEventListener('click', (event) => {
        event.stopPropagation();
        loadScan();
    }));
    host.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => {
        const layout = button.dataset.layout === 'cards' ? 'cards' : 'list';
        state.layout = layout;
        writeStorage(LAYOUT_KEY, layout);
        renderTable();
    }));
    host.querySelectorAll('[data-opportunity]').forEach((row) => {
        const open = () => openDetail(row.dataset.opportunity);
        row.addEventListener('click', open);
        row.addEventListener('keydown', (event) => {
            if (event.target !== row) return;
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        });
    });
    bindAssistant(host);
    bindCalcSticky(root);
    const headRow = host.querySelector('.opp-table thead tr');
    if (headRow) host.querySelector('.opp-table')?.style.setProperty('--opp-subhead-top', `${Math.ceil(headRow.getBoundingClientRect().height)}px`);
    bindOpportunityNameFit(host);
}

const NAME_MIN_PX = 72;
let nameFitObserver = null;
let fittingNames = false;

function fitOpportunityNames(wrap) {
    if (fittingNames) return;
    const table = wrap?.querySelector('.opp-table');
    if (!table) return;
    const boxes = [...table.querySelectorAll('.opp-name')];
    if (!boxes.length) return;
    fittingNames = true;
    try {
        const available = wrap.clientWidth;
        const naturalWidest = Math.max(...boxes.map((box) => {
            const strong = box.querySelector('strong');
            const tags = box.querySelector('.opp-acts');
            return Math.max(strong?.scrollWidth || 0, tags?.getBoundingClientRect().width || 0);
        }));
        const currentWidest = Math.max(...boxes.map((box) => box.getBoundingClientRect().width));
        const used = Math.ceil(table.getBoundingClientRect().width);
        const overflow = Math.ceil(used - available + (naturalWidest - currentWidest));
        let cap = overflow > 0 ? Math.max(NAME_MIN_PX, Math.floor(naturalWidest - overflow)) : 0;
        for (const box of boxes) box.style.maxWidth = cap ? `${cap}px` : '';
        const still = Math.ceil(table.getBoundingClientRect().width) - wrap.clientWidth;
        if (still > 0 && cap > NAME_MIN_PX) {
            cap = Math.max(NAME_MIN_PX, Math.floor(cap - still));
            for (const box of boxes) box.style.maxWidth = `${cap}px`;
        }
        for (const box of boxes) {
            const strong = box.querySelector('strong');
            if (!strong) continue;
            if (strong.scrollWidth > strong.clientWidth + 1) strong.dataset.appTooltip = strong.textContent;
            else strong.removeAttribute('data-app-tooltip');
        }
    } finally {
        fittingNames = false;
    }
}

function bindOpportunityNameFit(host) {
    nameFitObserver?.disconnect();
    nameFitObserver = null;
    const wrap = host.querySelector('.calc-table-wrap');
    if (!wrap) return;
    fitOpportunityNames(wrap);
    nameFitObserver = new ResizeObserver(() => fitOpportunityNames(wrap));
    nameFitObserver.observe(wrap);
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
    const strategies = (row.presentationStrategies || row.strategies).filter(strategy => PAGE_STRATEGY_IDS.has(strategy.id) || strategy.id === 'update-orders').map((strategy) => `<tr><td${tip(strategy.note)}>${escapeHtml(strategy.label)}</td><td>${badge(KIND_BADGE[strategy.kind] || KIND_LABEL[strategy.kind] || '—', strategy.note)}</td><td class="num">${strategy.advantageSilver > 0 ? formatSilver(strategy.advantageSilver, { signed: true }) : '—'}</td></tr>`).join('');
    const peers = row.peers.length ? `<table class="opp-peers"><thead><tr><th>Şehir</th><th class="num">Buy</th><th class="num">Sell</th></tr></thead><tbody>${row.peers.map((peer) => `<tr><td>${escapeHtml(peer.city)}</td><td class="num">${formatSilver(peer.buy)}</td><td class="num">${formatSilver(peer.sell)}</td></tr>`).join('')}</tbody></table>` : '';
    const charts = series
        ? `<section class="opp-chart opp-chart-buy"><h3>Buy</h3>${chartSvg(series.buy.points, series.buy.reference, 'Buy')}</section><section class="opp-chart opp-chart-sell"><h3>Sell</h3>${chartSvg(series.sell.points, series.sell.reference, 'Sell')}</section>`
        : `<p class="opp-empty">${escapeHtml(state.seriesError || 'Grafik yükleniyor…')}</p>`;
    const trades = `${routeHref('trades')}?${new URLSearchParams({ item: row.itemId, city: row.city })}`;
    const notes = [...row.caveats, ...row.reasons].filter(Boolean).join('\n');
    return `<header class="opp-detail-head">${itemIconHtml(row.itemId, { visual: true })}<div><h2>${itemNameHtml(itemLabel(row.itemId))}</h2><span class="opp-pills">${badge(row.city, row.patternLabel)}${row.quality > 1 ? badge(`Q${row.quality}`, 'Kalite') : ''}${badge(PATTERN_BADGE[row.pattern] || row.patternLabel, row.patternLabel, 'is-strong')}${REVIEW_BADGE[row.review] ? badge(REVIEW_BADGE[row.review], row.reviewLabel, row.review === 'unconfirmed' ? 'is-new' : 'is-up') : ''}${notes ? badge('Notlar', notes) : ''}</span></div></header>
        <table class="opp-strategies"><thead><tr><th>Strateji</th><th>Tür</th><th class="num">Avantaj</th></tr></thead><tbody>${strategies}</tbody></table>
        <div class="opp-charts">${charts}</div>
        ${peers}
        <p class="opp-reference">${escapeHtml(referenceText(row))}</p>
        ${watchDetailHtml(row)}
        <div class="opp-actions">${Object.entries(FEEDBACK_TYPES).map(([id,label]) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-feedback="${id}">${label}</button>`).join('')}<span role="status" data-feedback-message></span></div>
        <div class="opp-actions"><a class="btn btn-outline-secondary" href="${escapeHtml(trades)}">Trade Dashboard’da aç</a></div>`;
}

function watchDetailHtml(row) {
    const watch = state.journal.watches[watchKey(row)], metrics = feedbackMetrics(state.journal.feedback);
    const snapshotText = p => new Date(p.at).toLocaleString('tr-TR')+' · Buy '+formatSilver(p.buy)+' / Sell '+formatSilver(p.sell)+' · '+p.action+' · '+(p.statusLabel || p.status);
    return (watch ? '<details><summary>İzleme · '+escapeHtml(watch.last.action)+' · '+watch.changes.length+' değişim</summary><p>İlk: '+escapeHtml(snapshotText(watch.first))+' · Referans Buy '+formatSilver(watch.first.buyReference)+' / Sell '+formatSilver(watch.first.sellReference)+'</p><p>Son: '+escapeHtml(snapshotText(watch.last))+'</p>'+watch.changes.map(p => '<p>'+escapeHtml(snapshotText(p))+'</p>').join('')+'</details>' : '') + '<small>Kişisel bildirimler: '+metrics.checked+' fiyat kontrolü · doğruluk '+(metrics.accuracy === null ? '—' : formatPct(metrics.accuracy))+' · '+metrics.executed+' gerçekleşen işlem · eylem bildirimlerinde gerçekleşme '+(metrics.executionReportRate === null ? '—' : formatPct(metrics.executionReportRate))+'. Kullanıcı beyanıdır; piyasa doğrulaması veya tahmini başarı olasılığı değildir.</small>';
}
async function openDetail(id) {
    const row = rankedVisibleRows().find((candidate) => candidate.id === id);
    if (!row) return;
    state.selectedId = id;
    state.series = null;
    state.seriesError = '';
    renderTable();
    const sheet = root.querySelector('[data-opportunities-sheet]');
    const dialog = root.querySelector('[data-opportunities-dialog]');
    sheet.innerHTML = detailHtml(row, null);
    bindAssistant(sheet);
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
        bindAssistant(sheet);
    } catch (error) {
        if (state.selectedId !== id) return;
        state.seriesError = error.message || 'Grafik alınamadı';
        sheet.innerHTML = detailHtml(row, null);
        bindAssistant(sheet);
    }
}

function renderFilters() {
    const filters = state.filters;
    const field = (name, label, control) => `<div class="form-floating">${control}<label for="opp-${name}">${label}</label></div>`;
    const badgeChoices = (name, label, values, format) => `<fieldset class="opp-confidence"><legend>${label}</legend><div class="opp-views">${['', ...values.map(String)].map((value) => `<button type="button" class="badge opp-filter-badge${filters[name] === value ? ' is-active' : ''}" data-filter-choice="${name}" data-value="${value}"${name === 'tier' && value ? ` data-tier="${value}"` : ''} aria-pressed="${filters[name] === value}">${value === '' ? 'Tümü' : format(value)}</button>`).join('')}</div></fieldset>`;
    root.querySelector('[data-opportunities-filters]').innerHTML = `<div class="opp-filters">
        <div class="opp-city-filter">${cityFieldHtml({ id: 'opp-city', label: 'Şehir', selected: filters.city, cities: loadActiveCities(), className: '', allowAll: true })}<button type="button" class="opp-view${filters.city === '' ? ' is-active' : ''}" data-all-cities aria-pressed="${filters.city === ''}">Tüm şehirler</button></div>
        <div class="opp-filter-pair">
        ${badgeChoices('tier', 'Tier', [1, 2, 3, 4, 5, 6, 7, 8], (value) => `T${value}`)}
        ${badgeChoices('enchant', 'Enchant', [0, 1, 2, 3, 4], (value) => `.${value}`)}
        </div>
        ${field('query', 'Ürün', `<input class="form-control" id="opp-query" data-filter="query" value="${escapeHtml(filters.query)}" placeholder=" ">`) }
        <div class="form-range-field"><label for="opp-minDeviation">Minimum sapma <output data-deviation-value>%${escapeHtml(filters.minDeviation)}</output></label><input class="form-range" id="opp-minDeviation" data-filter="minDeviation" type="range" min="12" max="500" step="1" value="${escapeHtml(filters.minDeviation)}"></div>
        <div${tip('Ürün başına teorik tasarruf veya satış farkı. Kesin kâr değildir; boş bırakınca filtre kapalı.')}>${field('minNet', 'Minimum fark (gümüş / adet)', `<input class="form-control" id="opp-minNet" data-filter="minNet" type="number" min="0" step="1" value="${escapeHtml(filters.minNet)}" placeholder=" ">`)}</div>
        ${field('minReturn', 'Minimum teorik getiri (%)', `<input class="form-control" id="opp-minReturn" data-filter="minReturn" type="number" min="0" step="0.1" value="${escapeHtml(filters.minReturn)}" placeholder=" ">`)}
        ${field('execution', 'İşlem türü', `<select class="form-control" id="opp-execution" data-filter="execution"><option value="">Tümü</option>${Object.entries(EXECUTION_MODELS).filter(([value]) => PAGE_EXECUTIONS.has(value)).map(([value, model]) => `<option value="${value}"${filters.execution === value ? ' selected' : ''}>${model.label}</option>`).join('')}</select>`)}
        ${field('evidence', state.filters.viewMode === 'spreads' ? 'Makas değerlendirmesi' : 'Kanıt düzeyi', `<select class="form-control" id="opp-evidence" data-filter="evidence"><option value="">Tümü</option>${Object.entries(state.filters.viewMode === 'spreads' ? SPREAD_REVIEW_CLASSES : SPREAD_CLASSES).map(([value, model]) => `<option value="${value}"${filters.evidence === value ? ' selected' : ''}>${model.label}</option>`).join('')}<option value="unclassified"${filters.evidence === 'unclassified' ? ' selected' : ''}>${state.filters.viewMode === 'spreads' ? 'Veri yetersiz' : 'Kanıt yetersiz / sınıflanmamış'}</option></select>`)}
        <fieldset class="opp-confidence"><legend>Veri güveni</legend><div class="opp-views">${[['', 'Tümü'], ['0.35', 'Orta ve üzeri'], ['0.7', 'Yüksek']].map(([value, label]) => `<button type="button" class="opp-view${filters.confidence === value ? ' is-active' : ''}" data-confidence="${value}" aria-pressed="${filters.confidence === value}">${label}</button>`).join('')}</div></fieldset>
        ${field('watched', 'İzleme', `<select class="form-control" id="opp-watched" data-filter="watched"><option value="">Tüm adaylar</option><option value="yes"${filters.watched ? ' selected' : ''}>İzlenen adaylar</option></select>`)}
        ${field('action', 'Karar', `<select class="form-control" id="opp-action" data-filter="action"><option value="">Tümü</option>${['buy','sell','order','transport','watch'].map(id => `<option value="${id}"${filters.action === id ? ' selected' : ''}>${ACTION_LABELS[id]}</option>`).join('')}</select>`)}
        <button class="btn btn-primary" type="button" data-opportunities-refresh>Taramayı yenile</button>
        <button class="btn btn-outline-secondary" type="button" data-opportunities-clear>Temizle</button>
    </div>`;
    initFloatingLabels(root.querySelector('[data-opportunities-filters]'));
    root.querySelectorAll('[data-filter-choice]').forEach((button) => button.addEventListener('click', () => {
        const name = button.dataset.filterChoice;
        state.filters[name] = toggleAllFilter(state.filters[name], button.dataset.value, '');
        saveFilters();
        root.querySelectorAll(`[data-filter-choice="${name}"]`).forEach((option) => {
            const active = option.dataset.value === state.filters[name];
            option.classList.toggle('is-active', active);
            option.setAttribute('aria-pressed', String(active));
        });
        renderTable();
    }));
    const allCities = root.querySelector('[data-all-cities]');
    const chooseCity = (value) => {
        state.filters.city = value;
        saveFilters();
        allCities.classList.toggle('is-active', value === '');
        allCities.setAttribute('aria-pressed', String(value === ''));
        renderTable();
    };
    bindCityField(root, 'opp-city', chooseCity);
    allCities.addEventListener('click', () => {
        setCityFieldValue(root, 'opp-city', '');
        chooseCity('');
    });
    root.querySelectorAll('[data-confidence]').forEach((button) => button.addEventListener('click', () => {
        state.filters.confidence = toggleAllFilter(state.filters.confidence, button.dataset.confidence, '');
        saveFilters();
        root.querySelectorAll('[data-confidence]').forEach((option) => {
            const active = option.dataset.confidence === state.filters.confidence;
            option.classList.toggle('is-active', active);
            option.setAttribute('aria-pressed', String(active));
        });
        renderTable();
    }));
    root.querySelectorAll('[data-filter]').forEach((input) => {
        const event = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(event, () => {
            state.filters[input.dataset.filter] = input.value;
            saveFilters();
            if (input.dataset.filter === 'minDeviation') root.querySelector('[data-deviation-value]').textContent = `%${input.value}`;
            renderTable();
        });
    });
    root.querySelector('[data-opportunities-refresh]').addEventListener('click', () => loadScan());
    root.querySelector('[data-opportunities-clear]').addEventListener('click', () => {
        state.filters = defaultFilters();
        saveFilters();
        renderFilters();
        renderShellFiltersForMode();
        renderChips();
        renderTable();
    });
}

function viewCounts(list) {
    const counts = { all: list.length };
    for (const row of list) {
        for (const id of new Set((row.presentationStrategies || [row.primary]).filter(Boolean).map(strategy => strategy.id))) {
            counts[id] = (counts[id] || 0) + 1;
        }
        if (row.primary?.id === 'local-make') {
            const key = `spread:${spreadReviewKey(row)}`; counts[key] = (counts[key] || 0) + 1;
        }
        const statusId = `status:${resolveOpportunityCard(row).status}`;
        counts[statusId] = (counts[statusId] || 0) + 1;
    }
    return counts;
}

function isViewSelected(id) {
    return id === 'all' ? state.filters.views.length === 0 && state.filters.excludedViews.length === 0 : state.filters.views.includes(id);
}

function viewChip(id, glyph, label, tone, hint) {
    const active = isViewSelected(id);
    return `<button type="button" class="opp-view is-tone-${tone}${active ? ' is-active' : ''}" data-view="${id}" aria-pressed="${active}"${tip(hint)}>${ICONS[glyph]}<span>${escapeHtml(label)}</span><b data-view-count></b></button>`;
}

function viewChips() {
    if (state.filters.viewMode === 'spreads') return viewChip('all', 'cards', 'Tüm makaslar', 'muted', 'Ham makas adayları; işlem önerisi değildir') + Object.entries(SPREAD_REVIEW_CLASSES).map(([key, model]) => viewChip(`spread:${key}`, 'swap', model.label, 'muted', model.note)).join('');
    if (state.filters.viewMode === 'suspicious') return viewChip('all', 'alert', 'Tüm şüpheli veriler', 'muted', 'Karantina kayıtları; fırsat veya işlem önerisi değildir.');
    const ids = LIST_MODES[state.filters.viewMode].strategyIds;
    const types = ids.map(id => {
        const reason = CARD_REASONS[id];
        return viewChip(id, reason.glyph, reason.title, STRATEGY_SPECS[id].tone, `${reason.note}\n${reason.action.label}`);
    });
    return viewChip('all', 'cards', 'Tüm türler', 'muted', 'Bu listedeki tüm strateji türleri') + types.join('');
}

function bindViewFilters() {
    root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', (event) => {
        const id = button.dataset.view;
        if (id === 'all') {
            state.filters.views = [];
            state.filters.excludedViews = [];
        } else if (event.shiftKey) {
            state.filters.views = state.filters.views.filter(selected => selected !== id);
            state.filters.excludedViews = state.filters.excludedViews.includes(id)
                ? state.filters.excludedViews.filter(selected => selected !== id)
                : [...state.filters.excludedViews, id];
        } else if (event.ctrlKey || event.metaKey) {
            state.filters.excludedViews = state.filters.excludedViews.filter(selected => selected !== id);
            state.filters.views = state.filters.views.includes(id)
                ? state.filters.views.filter(selected => selected !== id)
                : [...state.filters.views, id];
        } else {
            state.filters.excludedViews = state.filters.excludedViews.filter(selected => selected !== id);
            state.filters.views = state.filters.views.includes(id) ? [] : [id];
        }
        saveFilters();
        renderChips(rankedVisibleRows());
        renderTable();
    }));
}

function renderShellFiltersForMode() {
    const viewGroup = root.querySelector('.opp-types');
    viewGroup.innerHTML = viewChips();
    bindViewFilters();
}

function listModeChips(counts = listCounts()) {
    return Object.entries(LIST_MODES).map(([id, mode]) => `<button type="button" class="opp-view${state.filters.viewMode === id ? ' is-active' : ''}" data-list-mode="${id}" aria-pressed="${state.filters.viewMode === id}"><span>${mode.label}</span><b>${formatQuantity(id === 'suspicious' ? counts.suspiciousView : counts[id], { digits: 0 })}</b></button>`).join('');
}

function renderChips(list = rankedVisibleRows(), totals = listCounts()) {
    const counts = viewCounts(rankedVisibleRows({ ignoreTypes: true }));
    const modeHost = root.querySelector('[data-list-modes]');
    if (modeHost) modeHost.innerHTML = listModeChips(totals);
    root.querySelectorAll('[data-view]').forEach((button) => {
        const active = isViewSelected(button.dataset.view);
        const excluded = state.filters.excludedViews.includes(button.dataset.view);
        const count = button.dataset.view === 'all' ? list.length : counts[button.dataset.view] || 0;
        button.classList.toggle('is-active', active);
        button.classList.toggle('is-excluded', excluded);
        button.classList.toggle('is-empty', !count);
        button.setAttribute('aria-pressed', active || excluded ? 'true' : 'false');
        button.setAttribute('aria-label', `${button.querySelector('span').textContent}${excluded ? ' — hariç tutuluyor' : ''}`);
        button.querySelector('[data-view-count]').textContent = state.scan ? formatQuantity(count, { digits: 0 }) : '';
    });
    root.querySelectorAll('[data-sort]').forEach((button) => {
        const active = button.dataset.sort === state.filters.sort;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function renderShell() {
    const chips = viewChips();
    const sorts = SORTS.map((sort) => `<button type="button" class="opp-view${state.filters.sort === sort.id ? ' is-active' : ''}" data-sort="${sort.id}" aria-pressed="${state.filters.sort === sort.id}">${sort.label}</button>`).join('');
    root.innerHTML = toolPageHtml({
        key: 'opportunities',
        head: `<section class="page-head" data-page-head="opportunities"><h1>Günün Fırsatları <span class="badge" data-app-tooltip="${escapeHtml(`Buy ve Sell, hareketten önceki saatlik gözlemlere göre ayrı izlenir. Görünen fark dolu bir emir değildir.\n${feeMetaText(getSettings().premium !== false)}\nDengeli sıra teorik farkı, yüzdesel getiriyi, güncelliği ve kaynak kanıtını birlikte kullanır. Yakın puanlarda işlem türlerini dengeler. Dolma ve taşıma olasılığı hesaplanmaz.`)}">Bilgi</span></h1></section>`,
        controls: `<div class="opp-bar"><div class="opp-views opp-mode-switch" data-list-modes role="group" aria-label="Fırsat listesi">${listModeChips()}</div><div class="opp-views opp-types" role="group" aria-label="Strateji türü">${chips}</div><div class="opp-views" role="group" aria-label="Sıralama">${sorts}</div><div data-opportunities-filters></div></div>`,
        result: '<div data-opportunities-result></div>',
        overlays: '<dialog class="app-dialog opp-dialog" data-opportunities-dialog><button type="button" class="app-dialog-close" aria-label="Kapat" data-opportunities-close></button><div class="opp-sheet" data-opportunities-sheet></div></dialog>'
    });
    const viewGroup = root.querySelector('.opp-types');
    viewGroup.dataset.appTooltip = 'Ctrl + tıklama ile birden fazla tür seçebilirsiniz. Shift + tıklama türü hariç tutar.';
    root.querySelector('[data-list-modes]').addEventListener('click', event => {
        const button = event.target.closest('[data-list-mode]');
        if (!button || !Object.hasOwn(LIST_MODES, button.dataset.listMode)) return;
        state.filters.viewMode = button.dataset.listMode;
        state.filters.views = [];
        state.filters.excludedViews = [];
        state.filters.evidence = '';
        saveFilters();
        renderShellFiltersForMode();
        renderFilters();
        renderTable();
    });
    bindViewFilters();
    root.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
        state.filters.sort = button.dataset.sort;
        saveFilters();
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

let scanLoading = false;
let scanPending = false;

async function loadScan({ background = false } = {}) {
    if (scanLoading) {
        scanPending = true;
        return;
    }
    scanLoading = true;
    if (!background) showPageLoader();
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
        syncWatches();
    } catch (error) {
        if (!background) {
            state.scan = null;
            state.error = scanFailure(error);
        }
    } finally {
        scanLoading = false;
        if (!background) hidePageLoader();
        renderChips();
        if (!background) renderFilters();
        renderTable();
        if (scanPending) {
            scanPending = false;
            void loadScan({ background: true });
        }
    }
}

async function main() {
    root = document.querySelector('[data-opportunities]');
    if (!root) return;
    initNav();
    await initStore();
    recordCurrentToolVisit();
    renderShell();
    bindLivePrices({}, () => loadScan({ background: true }), { packetSourceOnly: false, delayMs: 300 });
    await loadScan();
}

main();
