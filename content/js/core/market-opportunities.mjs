import { median, normalizePriceDate, quotedBookPrice } from './market-primitives.mjs';
import { purchaseCostFromRates, saleProceedsFromRates } from './market-fees.mjs';
import { DAY_MS, LONG_TERM_STRATEGIES, ORDER_HISTORY_POLICY, PRICE_STALE_MS } from './market-history-config.mjs';

/**
 * Detection and ranking for this tool only. The shared 28-day completed-day estimator is unchanged.
 * A provisional reference is the median of hourly observations before the current price level.
 */
export const OPPORTUNITY_POLICY = Object.freeze({
    strategyId: 'median-28d',
    // Below this, book flicker and the 2.5% setup fee are not treated as a market anomaly.
    minDeviation: 0.12,
    // A side inside this band is "flat". The same band defines the current price level.
    flatBand: 0.05,
    // Stops one-silver rounding from qualifying. It is not the sort key.
    minAbsoluteDelta: 25,
    // Confidence reaches 1 at this many prior hourly observations and this much time span.
    referenceTargetSamples: 12,
    referenceTargetSpanMs: 12 * 60 * 60 * 1000,
    // A second distinct hour at the new level raises confidence. One hour still lists the row.
    minConfirmingBuckets: 2,
    unconfirmedWeight: 0.72,
    // Balanced rank keeps a share of the importance score, then lifts newer formations.
    importanceMix: 0.4,
    // log10(1 + silver) / log10(1 + silverScale). Moves above this add no further rank.
    silverScale: 100_000,
    // A visible inversion has no historical anomaly. Its silver does not set the rank.
    bookStateRank: 0.2,
    // An unfilled order is not realized profit.
    unrealizedWeight: 0.35,
    // Instant city-to-city spread still omits travel cost and travel time.
    crossCityWeight: 0.45,
    // Top of book is visible, but depth is not in the archive.
    topOfBookWeight: 0.7,
    // Paying less than the reference is a saving, not a completed sale.
    savingsWeight: 0.55,
    // Full freshness credit inside the first hour, then a linear fall to PRICE_STALE_MS.
    freshMs: 60 * 60 * 1000,
    // Fill-dependent silver is shown with the strategy. It is not a rank input.
    listLimit: 500,
    displayBucketMs: 3 * 60 * 60 * 1000
});

const PATTERNS = Object.freeze({
    'down|flat': { id: 'buy-down-sell-flat', label: 'Buy düştü, Sell sabit' },
    'up|flat': { id: 'buy-up-sell-flat', label: 'Buy yükseldi, Sell sabit' },
    'flat|down': { id: 'sell-down-buy-flat', label: 'Sell düştü, Buy sabit' },
    'flat|up': { id: 'sell-up-buy-flat', label: 'Sell yükseldi, Buy sabit' },
    'down|up': { id: 'spread-widen', label: 'Makas genişledi' },
    'up|down': { id: 'spread-narrow', label: 'Makas daraldı' },
    'up|up': { id: 'both-up', label: 'Buy ve Sell birlikte yükseldi' },
    'down|down': { id: 'both-down', label: 'Buy ve Sell birlikte düştü' },
    'flat|flat': { id: 'flat', label: 'Tarihsel sapma yok' },
    'down|missing': { id: 'buy-down', label: 'Buy düştü' },
    'up|missing': { id: 'buy-up', label: 'Buy yükseldi' },
    'missing|down': { id: 'sell-down', label: 'Sell düştü' },
    'missing|up': { id: 'sell-up', label: 'Sell yükseldi' },
    'down|unknown': { id: 'buy-down', label: 'Buy düştü' },
    'up|unknown': { id: 'buy-up', label: 'Buy yükseldi' },
    'unknown|down': { id: 'sell-down', label: 'Sell düştü' },
    'unknown|up': { id: 'sell-up', label: 'Sell yükseldi' },
    'unknown|unknown': { id: 'unreferenced', label: 'Emir referansı yok' },
    'unknown|flat': { id: 'buy-unreferenced', label: 'Buy referansı yok' },
    'flat|unknown': { id: 'sell-unreferenced', label: 'Sell referansı yok' },
    'missing|unknown': { id: 'unreferenced', label: 'Emir referansı yok' },
    'unknown|missing': { id: 'unreferenced', label: 'Emir referansı yok' }
});

function stamp(value) {
    return Date.parse(normalizePriceDate(value));
}

function silverUnit(silver, policy) {
    return Math.log10(1 + Math.max(0, silver)) / Math.log10(1 + policy.silverScale);
}

function freshnessOf(ageMs, policy) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
    if (ageMs <= policy.freshMs) return 1;
    if (ageMs >= PRICE_STALE_MS) return 0;
    return 1 - (ageMs - policy.freshMs) / (PRICE_STALE_MS - policy.freshMs);
}

function taxRate(premium, fees) {
    return premium ? fees.taxPremiumRate : fees.taxFreeRate;
}

function saleNet(price, { premium, fees, setup }) {
    return saleProceedsFromRates(price, { taxRate: taxRate(premium, fees), setup, setupFeeRate: fees.setupFeeRate });
}

function buyCost(price, { fees, setup }) {
    return purchaseCostFromRates(price, { setup, setupFeeRate: fees.setupFeeRate });
}

function emptySide() {
    return {
        price: null, at: null, ageMs: null, stale: false, source: null,
        reference: null, provisional: false, referenceSamples: 0, referenceSpanMs: 0, stability: 0,
        deviation: null, absoluteDelta: null, direction: 'missing', anomalous: false,
        confirmed: false, confirmingBuckets: 0, formedAt: null, reliability: 0, usable: false
    };
}

/** One price per archive hour inside the 28-day window. The shared day-coverage rule is not applied. */
function hourlySamples(points, now, policy) {
    const windowMs = LONG_TERM_STRATEGIES[policy.strategyId].windowMs;
    const bucketMs = ORDER_HISTORY_POLICY.bucketMs;
    const start = now - windowMs;
    const byHour = new Map();
    for (const point of points || []) {
        const at = stamp(point.bucketAt ?? point.seenAt ?? point.at);
        const price = Number(point.price);
        if (!Number.isFinite(at) || at > now || at < start || !(price > 0)) continue;
        const hour = Math.floor(at / bucketMs) * bucketMs;
        const quotedAt = stamp(point.quotedAt);
        const previous = byHour.get(hour);
        if (!previous || at >= previous.at) {
            byHour.set(hour, { at, price, source: point.source || null, quotedAt: Number.isFinite(quotedAt) ? quotedAt : null });
        }
    }
    return [...byHour.values()].sort((a, b) => a.at - b.at);
}

/**
 * Median of hourly observations before the current price level.
 * A single observation has no reference, so it cannot be compared with itself.
 * An external completed-day quote is ignored: this tool owns its own reference.
 */
export function provisionalReference(points, { now = Date.now(), policy = OPPORTUNITY_POLICY } = {}) {
    const samples = hourlySamples(points, now, policy);
    const latest = samples.at(-1) || null;
    if (samples.length < 2 || !latest) {
        return { reference: null, provisional: false, samples: 0, spanMs: 0, stability: 0, confidence: 0, move: latest ? [latest] : [], latest };
    }
    let split = samples.length - 1;
    while (split > 0 && Math.abs(samples[split - 1].price - latest.price) / latest.price <= policy.flatBand) split -= 1;
    const move = samples.slice(split);
    const history = split > 0 ? samples.slice(0, split) : samples.slice(0, -1);
    const prices = history.map((sample) => sample.price);
    const reference = median(prices);
    const spanMs = history.length > 1 ? history.at(-1).at - history[0].at : 0;
    const stability = reference > 0
        ? prices.filter((price) => Math.abs(price - reference) / reference <= policy.flatBand).length / prices.length
        : 0;
    const sampleScore = Math.min(1, history.length / policy.referenceTargetSamples);
    const spanScore = Math.min(1, spanMs / policy.referenceTargetSpanMs);
    const confidence = reference > 0
        ? (0.15 + 0.85 * sampleScore) * (0.15 + 0.85 * spanScore) * (0.35 + 0.65 * stability)
        : 0;
    return {
        reference: reference > 0 ? reference : null,
        provisional: history.length < policy.referenceTargetSamples || spanMs < policy.referenceTargetSpanMs,
        samples: history.length,
        spanMs,
        stability,
        confidence,
        move,
        latest
    };
}

export function assessMarketSide({ points = [], now = Date.now(), policy = OPPORTUNITY_POLICY } = {}) {
    const quote = provisionalReference(points, { now, policy });
    const latest = quote.latest;
    if (!latest) return emptySide();

    const ageMs = now - (latest.quotedAt ?? latest.at);
    const stale = ageMs > PRICE_STALE_MS;
    const refPrice = quote.reference;
    const hasRef = refPrice > 0;
    const deviation = hasRef ? (latest.price - refPrice) / refPrice : null;
    const absoluteDelta = hasRef ? latest.price - refPrice : null;
    let direction = 'unknown';
    if (Number.isFinite(deviation)) {
        if (deviation >= policy.flatBand) direction = 'up';
        else if (deviation <= -policy.flatBand) direction = 'down';
        else direction = 'flat';
    }
    const crosses = Number.isFinite(deviation)
        && Math.abs(deviation) >= policy.minDeviation
        && Math.abs(absoluteDelta) >= policy.minAbsoluteDelta;
    const threshold = hasRef
        ? refPrice * (1 + (direction === 'down' ? -policy.minDeviation : policy.minDeviation))
        : null;
    const confirmingBuckets = crosses
        ? quote.move.filter((sample) => direction === 'up' ? sample.price >= threshold : sample.price <= threshold).length
        : 0;
    const confirmed = crosses && confirmingBuckets >= policy.minConfirmingBuckets;
    const usable = !stale && hasRef;
    const reliability = usable ? quote.confidence * (confirmed ? 1 : policy.unconfirmedWeight) : 0;

    return {
        price: latest.price,
        at: new Date(latest.at).toISOString(),
        ageMs,
        stale,
        source: latest.source,
        reference: hasRef ? refPrice : null,
        provisional: hasRef ? quote.provisional : false,
        referenceSamples: hasRef ? quote.samples : 0,
        referenceSpanMs: hasRef ? quote.spanMs : 0,
        stability: hasRef ? quote.stability : 0,
        deviation,
        absoluteDelta,
        direction,
        anomalous: usable && crosses,
        confirmed,
        confirmingBuckets,
        formedAt: quote.move[0]
            ? new Date(quote.move[0].quotedAt ?? quote.move[0].at).toISOString()
            : new Date(latest.quotedAt ?? latest.at).toISOString(),
        reliability,
        usable
    };
}

function patternOf(buy, sell) {
    const key = `${buy?.direction || 'missing'}|${sell?.direction || 'missing'}`;
    return PATTERNS[key] || { id: 'mixed', label: 'Karışık hareket' };
}

function anomaliesOf(buy, sell) {
    const anomalies = [];
    if (buy?.anomalous && buy.direction === 'up') anomalies.push('buy-up');
    if (buy?.anomalous && buy.direction === 'down') anomalies.push('buy-down');
    if (sell?.anomalous && sell.direction === 'up') anomalies.push('sell-up');
    if (sell?.anomalous && sell.direction === 'down') anomalies.push('sell-down');
    return anomalies;
}

function strategy(row) {
    return row.advantageSilver > 0 ? row : null;
}

function buildStrategies({ buy, sell, peers, city, premium, fees, policy }) {
    const strategies = [];
    const remember = (row) => {
        const next = strategy(row);
        if (next) strategies.push(next);
    };

    if (buy?.anomalous && buy.direction === 'up' && buy.reference > 0) {
        const advantage = saleNet(buy.price, { premium, fees, setup: false }) - saleNet(buy.reference, { premium, fees, setup: false });
        remember({
            id: 'instant-sell-to-buy', label: 'Anında Buy Order’a satış', kind: 'top-of-book',
            weight: policy.topOfBookWeight, advantageSilver: advantage, netSilver: advantage, reliability: buy.reliability,
            note: 'Görünen en yüksek alış emrine anında satış. Vergi düşülür. Emir derinliği olmadığı için bu fiyattan ne kadar satılabileceği bilinmiyor.'
        });
    }
    if (sell?.anomalous && sell.direction === 'up' && sell.reference > 0) {
        const posted = quotedBookPrice(sell.price, 'sell', 'sell');
        const postedRef = quotedBookPrice(sell.reference, 'sell', 'sell');
        const advantage = saleNet(posted, { premium, fees, setup: true }) - saleNet(postedRef, { premium, fees, setup: true });
        remember({
            id: 'place-sell-order', label: 'Satış emri açma', kind: 'unrealized',
            weight: policy.unrealizedWeight, advantageSilver: advantage, netSilver: advantage, reliability: sell.reliability,
            note: 'Satış emri, görünen satışın 1 gümüş altı. Setup ve vergi düşülür. Emrin dolacağı bilinmiyor; bu tutar gerçekleşmiş kâr değildir.'
        });
    }
    if (sell?.anomalous && sell.direction === 'down' && sell.reference > 0) {
        remember({
            id: 'instant-buy-from-sell', label: 'Düşük Sell fiyatından alış', kind: 'savings',
            weight: policy.savingsWeight, advantageSilver: sell.reference - sell.price, netSilver: null, reliability: sell.reliability,
            note: 'Görünen satış emrinden anında alış, referansa göre daha ucuz. Bu tasarruftur; satış yapılmadan kâr değildir. Derinlik bilinmiyor.'
        });
    }
    if (buy?.anomalous && buy.direction === 'down' && buy.reference > 0) {
        const cost = buyCost(quotedBookPrice(buy.price, 'buy', 'buy'), { fees, setup: true });
        const costRef = buyCost(quotedBookPrice(buy.reference, 'buy', 'buy'), { fees, setup: true });
        remember({
            id: 'place-buy-order', label: 'Düşük Buy fiyatından alış emri', kind: 'savings',
            weight: policy.savingsWeight, advantageSilver: costRef - cost, netSilver: null, reliability: buy.reliability,
            note: 'Alış emri, görünen alışın 1 gümüş üstü. Setup eklenir. Emrin dolacağı bilinmiyor; düşük teklif ucuz toplama adayıdır, kâr değildir.'
        });
    }
    if (buy?.usable && sell?.usable) {
        const flip = saleNet(buy.price, { premium, fees, setup: false }) - buyCost(sell.price, { fees, setup: false });
        remember({
            id: 'local-flip', label: 'Aynı şehirde anında çevirme', kind: 'top-of-book',
            weight: policy.topOfBookWeight, advantageSilver: flip, netSilver: flip,
            reliability: Math.min(buy.reliability, sell.reliability),
            note: 'Aynı şehirde görünen satıştan alıp görünen alışa satmanın vergi sonrası farkı. Derinlik bilinmiyor; kâr garantisi değildir.'
        });
        if (buy.anomalous || sell.anomalous) {
            const posted = saleNet(quotedBookPrice(sell.price, 'sell', 'sell'), { premium, fees, setup: true })
                - buyCost(quotedBookPrice(buy.price, 'buy', 'buy'), { fees, setup: true });
            remember({
                id: 'local-make', label: 'Alış ve satış emrini birlikte kurma', kind: 'unrealized',
                weight: policy.unrealizedWeight, advantageSilver: posted, netSilver: posted,
                reliability: Math.min(buy.reliability, sell.reliability),
                note: 'İki emrin de dolacağı bilinmiyor. Ücret sonrası fark, gerçekleşmiş kâr olarak gösterilmez.'
            });
        }
    }
    if (sell?.usable) {
        let best = null;
        for (const peer of peers || []) {
            if (!peer.buy?.usable || !(peer.buy.price > 0) || !(sell.anomalous || peer.buy.anomalous)) continue;
            const net = saleNet(peer.buy.price, { premium, fees, setup: false }) - buyCost(sell.price, { fees, setup: false });
            const reliability = Math.min(sell.reliability, peer.buy.reliability);
            if (!(net > 0) || !(reliability > 0)) continue;
            if (!best || net > best.advantageSilver) {
                best = {
                    id: 'cross-city-instant', label: 'Şehirler arası taşıma', kind: 'top-of-book',
                    weight: policy.crossCityWeight, advantageSilver: net, netSilver: net, reliability,
                    fromCity: city, toCity: peer.city, buyPrice: sell.price, sellPrice: peer.buy.price,
                    destAgeMs: peer.buy.ageMs,
                    note: `${city} satışından alınıp ${peer.city} alış emrine satılırsa vergi sonrası fark oluşur. Taşıma maliyeti, süre ve emir derinliği veride yok; bu fark kâr garantisi değildir.`
                };
            }
        }
        if (best) strategies.push(best);
    }
    return strategies;
}

function publicSide(side) {
    if (!side || side.direction === 'missing') return null;
    return {
        price: side.price, at: side.at, ageMs: side.ageMs, stale: side.stale, source: side.source,
        reference: side.reference, provisional: side.provisional, referenceSamples: side.referenceSamples,
        referenceSpanMs: side.referenceSpanMs, stability: side.stability,
        deviation: side.deviation, absoluteDelta: side.absoluteDelta,
        direction: side.direction, anomalous: side.anomalous, confirmed: side.confirmed,
        confirmingBuckets: side.confirmingBuckets, formedAt: side.formedAt,
        reliability: side.reliability, usable: side.usable
    };
}

export function analyzeMarketCell({
    server, itemId, city, quality = 1, buy, sell, peers = [], premium = true, fees, now = Date.now(),
    policy = OPPORTUNITY_POLICY
} = {}) {
    if (!fees) throw new Error('Opportunity scan requires explicit fee rates');
    const pattern = patternOf(buy, sell);
    const anomalies = anomaliesOf(buy, sell);
    const strategies = buildStrategies({ buy, sell, peers, city, premium, fees, policy });
    if (anomalies.length) {
        strategies.push({
            id: 'update-orders', label: 'Açık emirleri gözden geçirme', kind: 'info',
            weight: 0, advantageSilver: null, netSilver: null, reliability: 0,
            note: 'Emir defteri referanstan saptı. Açık emirleriniz bu arşivde yok; güncelleme yalnızca bir adaydır.'
        });
    }
    const primary = strategies
        .filter((row) => row.advantageSilver > 0 && row.weight > 0)
        .sort((a, b) => (b.advantageSilver * b.weight) - (a.advantageSilver * a.weight))[0] || null;
    if (!anomalies.length && !primary) return null;

    const anomalySides = [buy, sell].filter((side) => side?.anomalous);
    const reliability = primary?.reliability || (anomalySides.length ? Math.min(...anomalySides.map((side) => side.reliability)) : 0);
    if (!(reliability > 0)) return null;
    const ages = (primary?.id === 'cross-city-instant'
        ? [sell?.ageMs, primary.destAgeMs]
        : primary?.id === 'instant-sell-to-buy' || primary?.id === 'place-buy-order' ? [buy?.ageMs]
            : primary?.id === 'place-sell-order' || primary?.id === 'instant-buy-from-sell' ? [sell?.ageMs]
                : (anomalySides.length ? anomalySides : [buy, sell].filter((side) => side?.price)).map((side) => side.ageMs)
    ).filter((age) => Number.isFinite(age));
    const fresh = ages.length ? Math.min(...ages.map((age) => freshnessOf(age, policy))) : 0;
    if (!(fresh > 0)) return null;

    const anomalyPart = anomalySides.length
        ? Math.max(...anomalySides.map((side) => silverUnit(Math.min(Math.abs(side.absoluteDelta), policy.silverScale), policy)))
        : 0;
    const economicPart = primary ? silverUnit(primary.advantageSilver, policy) : 0;
    const score = (anomalyPart > 0 ? anomalyPart : policy.bookStateRank) * reliability * fresh;
    if (!(score > 0)) return null;
    const formedAts = (anomalySides.length ? anomalySides.map((side) => side.formedAt) : [buy, sell].map((side) => side?.at))
        .map((value) => Date.parse(value)).filter(Number.isFinite);
    const formedAtMs = formedAts.length ? Math.max(...formedAts) : null;
    const recency = formedAtMs == null ? fresh : freshnessOf(now - formedAtMs, policy);
    const rankScore = score * (policy.importanceMix + (1 - policy.importanceMix) * recency);
    const review = anomalySides.length
        ? (anomalySides.some((side) => !side.confirmed) ? 'unconfirmed' : 'confirmed')
        : 'inversion';

    const caveats = ['Emir derinliği, işlem hacmi ve gerçekleşme süresi bu arşivde yoktur.'];
    if (anomalySides.some((side) => !side.confirmed)) {
        caveats.push('Bu sapma henüz tek saat diliminde görüldü. Yeni / doğrulanmamış.');
    }
    if (anomalySides.some((side) => side.provisional)) {
        caveats.push('Referans, hareketten önceki saatlik gözlemlerin medyanıdır. Tamamlanmış takvim günü beklenmez.');
    }
    if (pattern.id === 'both-up' || pattern.id === 'both-down') {
        caveats.push('İki taraf birlikte hareket etti. Bu, tek başına uygulanabilir bir arbitraj değildir.');
    }
    if (pattern.id === 'spread-widen' || pattern.id === 'spread-narrow') {
        caveats.push('Makas değişimi piyasa hareketidir. İki emrin birden dolacağı varsayılmaz.');
    }
    const reasons = [];
    for (const [name, side] of [['Buy', buy], ['Sell', sell]]) {
        if (!side?.anomalous) continue;
        const pct = Math.round(side.deviation * 1000) / 10;
        const spanHours = Math.round((side.referenceSpanMs || 0) / 3600000);
        const trust = side.confirmed ? `${side.confirmingBuckets} saatlik onay` : 'yeni / doğrulanmamış';
        reasons.push(`${name} önceki ${side.referenceSamples} gözlemin medyanından ${pct > 0 ? '+' : ''}${pct}% sapıyor · yayılım ${spanHours} sa · ${trust}.`);
    }
    if (primary) reasons.push(primary.note);

    return {
        id: `${itemId}|${city}|${quality}`,
        server, itemId, city, quality: Number(quality) || 1,
        pattern: pattern.id, patternLabel: pattern.label, anomalies,
        buy: publicSide(buy), sell: publicSide(sell),
        spread: {
            current: buy?.price > 0 && sell?.price > 0 ? sell.price - buy.price : null,
            reference: buy?.reference > 0 && sell?.reference > 0 ? sell.reference - buy.reference : null
        },
        strategies: strategies.map(({ destAgeMs, ...row }) => row),
        primary: primary ? (({ destAgeMs, ...row }) => row)(primary) : null,
        peers: (peers || []).filter((peer) => peer.buy?.price > 0 || peer.sell?.price > 0).map((peer) => ({
            city: peer.city,
            buy: peer.buy?.price ?? null,
            sell: peer.sell?.price ?? null,
            buyAt: peer.buy?.at ?? null,
            sellAt: peer.sell?.at ?? null
        })),
        score,
        rankScore,
        recency,
        formedAt: formedAtMs == null ? null : new Date(formedAtMs).toISOString(),
        review,
        reviewLabel: review === 'unconfirmed' ? 'Yeni / Doğrulanmamış' : review === 'confirmed' ? 'Doğrulandı' : 'Çevirme',
        parts: {
            anomaly: anomalyPart,
            reliability,
            freshness: fresh,
            recency,
            economic: economicPart,
            feasibility: null
        },
        caveats,
        reasons
    };
}

export function rankMarketOpportunities(rows, options = {}) {
    const mode = options.mode || 'balanced';
    const value = (row) => mode === 'recent' ? (row.recency || 0) : mode === 'importance' ? (row.score || 0) : (row.rankScore || 0);
    return [...(rows || [])].filter(Boolean).sort((a, b) => value(b) - value(a)
        || ((b.parts?.reliability || 0) - (a.parts?.reliability || 0))
        || ((b.recency || 0) - (a.recency || 0))
        || Math.abs(b.buy?.deviation || b.sell?.deviation || 0) - Math.abs(a.buy?.deviation || a.sell?.deviation || 0));
}

/** Last observation inside each display bucket, limited to the reference window plus the current day. */
export function quoteDisplayPoints(points, {
    now = Date.now(),
    windowMs = LONG_TERM_STRATEGIES[OPPORTUNITY_POLICY.strategyId].windowMs + DAY_MS,
    bucketMs = OPPORTUNITY_POLICY.displayBucketMs
} = {}) {
    const start = now - windowMs;
    const buckets = new Map();
    for (const point of points || []) {
        const at = stamp(point.seenAt ?? point.at);
        const price = Number(point.price);
        if (!Number.isFinite(at) || at < start || at > now || !(price > 0)) continue;
        const bucket = Math.floor(at / bucketMs) * bucketMs;
        const previous = buckets.get(bucket);
        if (!previous || at >= previous.at) buckets.set(bucket, { at, price });
    }
    return [...buckets.values()].sort((a, b) => a.at - b.at)
        .map((point) => ({ at: new Date(point.at).toISOString(), price: point.price }));
}
