import { getServer, localPriceHost } from './settings.js';
import { marketSeriesKey, BOOK_PRICE_FIELDS } from './market-primitives.mjs';
import { quoteFromRow } from './price-side.js';
import { AODP_COLLECTOR_POLICY } from './market-history-config.mjs';
import { urlBatches } from './market-request.mjs';

export const LONG_TERM_PRICE_MODE = 'long-term';
export const LONG_TERM_PRICE_LABEL = 'UV';

export async function fetchLongTermIndex(items, locations) {
    const server = getServer().id;
    const query = new URLSearchParams({ server, locations: locations.join(','), qualities: String(AODP_COLLECTOR_POLICY.quality) });
    const index = new Map();
    const endpoint = `${localPriceHost()}/api/v1/market/long-term`;
    const makeUrl = ids => { const params = new URLSearchParams(query); params.set('items', ids.join(',')); return `${endpoint}?${params}`; };
    async function load(ids) {
        const response = await fetch(makeUrl(ids), { signal: AbortSignal.timeout(AODP_COLLECTOR_POLICY.timeoutMs) });
        if (!response.ok) throw new Error(response.status === 400 ? 'Uzun Vadeli: seçili server hub yapılandırmasıyla uyuşmuyor.' : 'Uzun Vadeli geçmiş hub’dan alınamadı.');
        const payload = await response.json();
        for (const reference of payload.references || []) {
            if (reference.server !== server) throw new Error('Uzun Vadeli server uyuşmazlığı.');
            index.set(marketSeriesKey(reference), reference);
        }
    }
    for (const batch of urlBatches(items, makeUrl)) await load(batch);
    return index;
}

/** Reference first, then the existing order/tick layer. Fees stay in the economy engine. */
export function longTermQuote(index, { server = getServer().id, itemId, city, quality = 1, intent }) {
    const side = intent === 'buy' ? 'buy' : 'sell';
    const reference = index?.get(marketSeriesKey({ server, itemId, city, quality, side }));
    if (!(reference?.price > 0)) return { quote: null, reason: reference?.fallbackReason ?? 'Uzun Vadeli: bu server/şehir/item için geçerli geçmiş veya fallback yok.' };
    const field = BOOK_PRICE_FIELDS[side];
    const quote = quoteFromRow({ [field]: reference.price, [`${field}_date`]: reference.sourceQuoteAt }, side, intent);
    // Historical references are not live quotes; their coverage/source time is shown separately.
    return { quote: { ...quote, stale: reference.source === 'current-buy-fallback' && quote.stale,
        longTerm: true, reference }, reason: null };
}

export function longTermMetadata(quote, { compact = false } = {}) {
    const ref = quote?.reference;
    if (!ref) return '';
    const labels = { 'quote-history': 'Quote geçmişi', 'sales-history-anchor': 'Satış geçmişi anchor', 'current-buy-fallback': 'Güncel Buy fallback' };
    const days = ref.dayCoverage ?? [];
    const partialCount = days.filter(day => day.status === 'partial-day').length;
    const summary = `${labels[ref.source] ?? ref.source} · ${ref.validDays ?? 0} gün · ${ref.validBuckets ?? 0} bucket`
        + (partialCount ? ` · ${partialCount} partial-day` : '');
    if (compact) return summary;
    const coverageDetails = days.map(day => `${day.day}: ${day.validBucketCount} bucket`
        + `${day.coverageRatio == null ? '' : ` (%${Math.round(day.coverageRatio * 100)})`} · ${day.firstObservationAt} → ${day.lastObservationAt}`
        + ` · ${day.status} · ${day.accepted ? 'kabul' : 'red'} (${day.reasons.join(', ')})`).join('; ');
    return summary + (coverageDetails ? ` · Coverage: ${coverageDetails}` : '') + `${ref.sources?.length ? ` · Kaynaklar: ${ref.sources.join(', ')}` : ref.quoteSource ? ` · Kaynak: ${ref.quoteSource}` : ''}` +
        `${ref.sourceQuoteAt ? ` · Son kaynak: ${new Date(ref.sourceQuoteAt).toLocaleString('tr-TR')}` : ''}` +
        `${ref.fallbackReason ? ` · ${ref.fallbackReason}` : ''}`;
}
