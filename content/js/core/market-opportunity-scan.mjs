import { mergedQuotePoints } from './long-term-price.mjs';
import { ORDER_HISTORY_POLICY } from './market-history-config.mjs';
import { normalizePriceDate } from './market-primitives.mjs';
import {
    OPPORTUNITY_POLICY, analyzeMarketCell, assessMarketSide, quoteDisplayPoints, rankMarketOpportunities
} from './market-opportunities.mjs';

function cellKey(row) {
    return `${row.server}|${row.itemId}|${row.city}|${row.quality}`;
}

/** A corrected AODP quote may update the fetch hour without becoming a new historical vote. Packets still win that hour. */
export function applyLiveQuote(points, live) {
    if (!(live?.price > 0)) return points || [];
    const seen = Date.parse(normalizePriceDate(live.fetchedAt ?? live.seenAt));
    const sourceAt = Date.parse(normalizePriceDate(live.sourceQuoteAt));
    const at = Number.isFinite(seen) ? seen : sourceAt;
    if (!Number.isFinite(at)) return points || [];
    const bucket = Math.floor(at / ORDER_HISTORY_POLICY.bucketMs) * ORDER_HISTORY_POLICY.bucketMs;
    const next = [...(points || [])];
    const hourOf = (point) => {
        const stampAt = Date.parse(normalizePriceDate(point.bucketAt ?? point.seenAt));
        return Number.isFinite(stampAt) ? Math.floor(stampAt / ORDER_HISTORY_POLICY.bucketMs) * ORDER_HISTORY_POLICY.bucketMs : NaN;
    };
    const index = next.findIndex((point) => hourOf(point) === bucket);
    const source = live.source || 'aodp-current';
    const patch = { price: live.price, source, ...(live.sourceQuoteAt ? { sourceQuoteAt: live.sourceQuoteAt } : {}) };
    if (index === -1) {
        next.push({ ...patch, seenAt: new Date(at).toISOString(), bucketAt: new Date(bucket).toISOString() });
        return next;
    }
    if (next[index].source === 'market-order-packets') return next;
    next[index] = { ...next[index], ...patch };
    return next;
}

/**
 * A REST poll is not a new hourly observation. Archive hours stay on bucketAt/seenAt.
 * quotedAt is only the exchange time used for age, so repeated polls of one quote do not erase the reference.
 */
export function quoteFreshnessPoints(points) {
    return (points || []).map((point) => {
        if (point.source !== 'aodp-current' || !point.sourceQuoteAt) return point;
        const sourceAt = Date.parse(normalizePriceDate(point.sourceQuoteAt));
        const seen = Date.parse(normalizePriceDate(point.seenAt ?? point.bucketAt));
        if (!Number.isFinite(sourceAt)) return point;
        const at = Number.isFinite(seen) ? Math.min(sourceAt, seen) : sourceAt;
        return { ...point, quotedAt: new Date(at).toISOString() };
    });
}

export function readMarketBook(packetHistory, repository, identity, now) {
    const series = [packetHistory?.seriesFor?.(identity, now), repository?.seriesFor?.(identity, now)].filter(Boolean);
    const points = quoteFreshnessPoints(applyLiveQuote(mergedQuotePoints(series), repository?.currentQuote?.(identity) || null));
    return { points };
}

function pricedSides(snapshot) {
    return [snapshot.buy, snapshot.sell].filter((side) => side?.price > 0);
}

/** One primary reason per cell that produced no row. The buckets partition cells − shown − overLimit. */
function exclusionReason(snapshot) {
    const sides = pricedSides(snapshot);
    if (!sides.length) return 'noHistory';
    const referenced = sides.filter((side) => side.reference > 0);
    if (!referenced.length) return 'singleObservation';
    if (!referenced.some((side) => !side.stale)) return 'stale';
    return 'belowDeviation';
}

export function scanQuoteBooks({
    server, packetHistory, repository, now = Date.now(), premium = true, fees,
    policy = OPPORTUNITY_POLICY
} = {}) {
    const started = Date.now();
    const groups = new Map();
    const add = (row) => {
        if (!row || row.server !== server || (row.side !== 'buy' && row.side !== 'sell')) return;
        const key = cellKey(row);
        if (!groups.has(key)) groups.set(key, { server: row.server, itemId: row.itemId, city: row.city, quality: Number(row.quality) || 1, sides: new Set() });
        groups.get(key).sides.add(row.side);
    };
    for (const row of packetHistory?.identities?.(now) || []) add(row);
    for (const row of repository?.identities?.(now) || []) add(row);

    const snapshots = [];
    for (const group of groups.values()) {
        const read = (side) => {
            if (!group.sides.has(side)) return assessMarketSide({ now, policy });
            const book = readMarketBook(packetHistory, repository, { ...group, side }, now);
            return assessMarketSide({ points: book.points, now, policy });
        };
        snapshots.push({ ...group, buy: read('buy'), sell: read('sell') });
    }
    const byItem = new Map();
    for (const snapshot of snapshots) {
        const key = `${snapshot.itemId}|${snapshot.quality}`;
        if (!byItem.has(key)) byItem.set(key, []);
        byItem.get(key).push(snapshot);
    }
    const analyzed = snapshots.map((snapshot) => analyzeMarketCell({
        ...snapshot,
        peers: (byItem.get(`${snapshot.itemId}|${snapshot.quality}`) || []).filter((peer) => peer.city !== snapshot.city),
        premium, fees, now, policy
    }));
    const excluded = { noHistory: 0, singleObservation: 0, stale: 0, belowDeviation: 0, overLimit: 0 };
    const candidates = [];
    snapshots.forEach((snapshot, index) => {
        if (analyzed[index]) candidates.push(analyzed[index]);
        else excluded[exclusionReason(snapshot)] += 1;
    });
    const ranked = rankMarketOpportunities(candidates, { mode: 'balanced', policy });
    const listed = ranked.slice(0, policy.listLimit);
    excluded.overLimit = ranked.length - listed.length;
    const has = (snapshot, test) => test(snapshot.buy) || test(snapshot.sell);
    return {
        server,
        strategyId: policy.strategyId,
        scannedAt: new Date(now).toISOString(),
        elapsedMs: Date.now() - started,
        scanned: snapshots.length,
        referenced: snapshots.filter((snapshot) => has(snapshot, (side) => side?.reference > 0)).length,
        listed: listed.length,
        truncated: ranked.length > listed.length,
        premium: Boolean(premium),
        funnel: {
            cells: snapshots.length,
            withHistory: snapshots.filter((snapshot) => has(snapshot, (side) => side?.price > 0)).length,
            referenceable: snapshots.filter((snapshot) => has(snapshot, (side) => side?.reference > 0)).length,
            fresh: snapshots.filter((snapshot) => has(snapshot, (side) => side?.price > 0 && !side.stale)).length,
            anomalies: snapshots.filter((snapshot) => has(snapshot, (side) => side?.anomalous)).length,
            filtered: snapshots.length - listed.length,
            shown: listed.length
        },
        excluded,
        funnelNotes: {
            cells: 'Taranan ürün-şehir-kalite hücresi.',
            withHistory: 'En az bir Buy veya Sell fiyatı olan hücre. Diğer sayılarla örtüşür.',
            referenceable: 'Hareketten önceki en az bir bağımsız saatlik gözlemle referansı hesaplanan hücre. Örtüşen sayıdır.',
            fresh: 'Son 6 saatte fiyatı olan hücre. Örtüşen sayıdır; tek gözlem de taze olabilir.',
            anomalies: 'Sapma eşiğini geçen hücre. Liste sınırına takılanlar gösterilenden fazla olabilir.',
            filtered: 'Gösterilmeyen hücre. Alt satırdaki sebepler bunu böler ve birbirine eklenince bu sayıya eşittir.',
            shown: 'Listelenen fırsat.',
            noHistory: 'Buy ve Sell fiyatı yok.',
            singleObservation: 'Fiyat var, fakat hareketten önceki bağımsız gözlem yok. Tek fiyat kendi kendisiyle karşılaştırılmaz.',
            stale: 'Referans var, güncel fiyatın tamamı 6 saatten eski.',
            belowDeviation: 'Taze referans var, sapma eşiğini geçmedi ve ücret sonrası çevirme de yok.',
            overLimit: 'Eşiği geçti ama liste sınırından sonra kaldı.'
        },
        opportunities: listed
    };
}

export function seriesForCell(packetHistory, repository, { server, itemId, city, quality, now = Date.now(), policy = OPPORTUNITY_POLICY }) {
    const base = { server, itemId, city, quality: Number(quality) || 1 };
    const read = (side) => {
        const book = readMarketBook(packetHistory, repository, { ...base, side }, now);
        const assessed = assessMarketSide({ points: book.points, now, policy });
        return {
            reference: assessed.reference,
            provisional: assessed.provisional,
            referenceSamples: assessed.referenceSamples,
            points: quoteDisplayPoints(book.points, { now, bucketMs: policy.displayBucketMs })
        };
    };
    return { ...base, buy: read('buy'), sell: read('sell') };
}
