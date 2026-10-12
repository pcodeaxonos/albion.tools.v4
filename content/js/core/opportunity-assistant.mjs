import { resolveOpportunityCard, PRIMARY_STATUS } from './opportunity-status.mjs';
import { PRICE_STALE_MS } from './market-history-config.mjs';

export { ASSISTANT_POLICY, normalPriceRange } from './market-normal-range.mjs';
export const FEEDBACK_TYPES = Object.freeze({ correct: 'Fiyat doğru', changed: 'Fiyat değişmiş', missing: 'Emir yok', executed: 'İşlem gerçekleşti' });
export const ACTION_LABELS = Object.freeze({ buy: 'Şimdi al', sell: 'Şimdi sat', order: 'Emir açmayı değerlendir', transport: 'Şehirler arası taşı', watch: 'İzle' });
export function rangePosition(price, range) {
    if (!range || !Number.isFinite(price)) return null;
    const position = price < range.low ? 'below' : price > range.high ? 'above' : 'inside';
    const edge = position === 'below' ? range.low : position === 'above' ? range.high : null;
    return { position, deviation: edge ? (price-edge)/edge : 0 };
}
export function assistantAction(row) {
    const card = resolveOpportunityCard(row), strategy = row.primary;
    let id = 'watch';
    if (row.eligible && row.validationMode === 'validated' && !row.potential && row.validationStatus !== 'quarantined'
        && [PRIMARY_STATUS.ACTIONABLE, PRIMARY_STATUS.STRATEGY].includes(card.status) && strategy?.evidence?.eligible) {
        if (strategy.id === 'instant-buy-from-sell' || strategy.id === 'local-flip') id = 'buy';
        else if (strategy.id === 'instant-sell-to-buy') id = 'sell';
        else if (strategy.id === 'cross-city-instant') id = 'transport';
        else if (strategy.id !== 'local-make') id = 'order';
        else if (row.spreadReview?.classification === 'unusual' && row.spreadReview.samplesRequired > 0
            && row.spreadReview.samples >= row.spreadReview.samplesRequired && row.spreadReview.spanRequired > 0
            && row.spreadReview.spanMs >= row.spreadReview.spanRequired
            && row.spreadRealism?.classification === 'historical-price-supported') id = 'order';
    }
    const label = row.outcome === 'price-supported' && id !== 'watch'
        ? { buy: 'Alış fiyatını ve miktarı kontrol et', sell: 'Buy emrini ve miktarı kontrol et',
            transport: 'Rotayı ve emir miktarını kontrol et', order: 'Emir koşullarını kontrol et' }[id] : ACTION_LABELS[id];
    return { id, label, status: card.status };
}
export function candidatePriority(row) {
    const sides = Object.values(row.primary?.evidence?.inputs || {}).filter(Boolean);
    const evidence = sides.length ? Math.min(...sides.map(s => s.referenceLevel ?? 0)) : 0;
    const age = sides.length ? Math.max(...sides.map(s => s.ageMs ?? Infinity)) : Infinity;
    const deviation = Math.max(...sides.map(s => Math.min(1, Math.abs(s.deviation || 0))), 0);
    const economic = Math.log1p(Math.max(0, row.primary?.advantageSilver || 0));
    return evidence * 100 + Math.max(0, 1-age/PRICE_STALE_MS)*20 + deviation*10 + Math.min(20,economic);
}
export function candidateIdentity(row, server) {
    return JSON.stringify([server, row.itemId, row.city, row.quality || 1, row.primary?.id || '', row.primary?.toCity || '']);
}
export function candidateSnapshot(row, at = Date.now()) {
    const action = assistantAction(row), card = resolveOpportunityCard(row);
    return { at, buy: row.buy?.price ?? null, sell: row.sell?.price ?? null,
        buyAt: row.buy?.at ?? null, sellAt: row.sell?.at ?? null,
        buyEvidence: row.buy?.evidenceId ?? null, sellEvidence: row.sell?.evidenceId ?? null,
        buyReference: row.buy?.reference ?? null, sellReference: row.sell?.reference ?? null,
        buyRange: row.buy?.normalRange ? { ...row.buy.normalRange } : null,
        sellRange: row.sell?.normalRange ? { ...row.sell.normalRange } : null,
        action: action.label, status: action.status, statusLabel: card.label, validation: row.validationStatus || null };
}
export function updateWatch(record, row, at = Date.now()) {
    const last = row ? candidateSnapshot(row, at) : { ...record.last, at, status: 'ABSENT', statusLabel: 'Aday listeden çıktı', action: 'Tarama adayları arasında yok' };
    const changed = ['buy','sell','buyReference','sellReference','action','status','validation'].some(k => last[k] !== record.last[k])
        || ['buyRange','sellRange'].some(key => ['low','high'].some(edge => last[key]?.[edge] !== record.last[key]?.[edge]));
    return { ...record, last, changes: changed ? [...record.changes, last] : record.changes };
}
export function feedbackMetrics(events) {
    const count = type => events.filter(e => e.type === type).length;
    const checked = count('correct')+count('changed')+count('missing');
    const actionable = events.filter(e => e.snapshot?.action && e.snapshot.action !== ACTION_LABELS.watch);
    return { total: events.length, checked, accuracy: checked ? count('correct')/checked : null,
        executed: count('executed'), actionableReports: actionable.length,
        executionReportRate: actionable.length ? actionable.filter(e => e.type === 'executed').length/actionable.length : null };
}
