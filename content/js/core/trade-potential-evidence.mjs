import { DAY_MS } from './market-history-config.mjs';
import { salesEvidence, SALES_EVIDENCE_POLICY } from './island-sales-potential.mjs';
import { normalizePriceDate, median, weightedPriceQuantile, weightedQuantile, roundHistoricalPrice } from './market-primitives.mjs';

export const tradeEvidenceKey = ({ server, city, itemId, quality = 1, side }) => JSON.stringify([server, city, itemId, quality, side]);
export const tradeCityKey = city => String(city ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/market(?:place)?$/, '');
const cityKey = tradeCityKey;
const sides = Object.freeze({ mail_buy: 'buy', instant_buy: 'buy', mail_sell: 'sell', instant_sell: 'sell' });
// Personal executions do not promise daily market coverage. Price still needs
// five distinct execution days, fresh evidence and the same robust price checks.
export const PERSONAL_PRICE_POLICY = Object.freeze({ ...SALES_EVIDENCE_POLICY, minDayCoverage: 0 });
export const PERSONAL_PERFORMANCE_POLICY = Object.freeze({ ...SALES_EVIDENCE_POLICY });
export const POTENTIAL_PRICE_POLICY = Object.freeze({ defaultDays: 28, periods: Object.freeze([7, 14, 28, 60, 90]), minDays: 5, minTransactions: 10, maxAgeDays: 7,
    maxTransactionShare: .5, maxDayShare: .5 });
export const POTENTIAL_PRICE_MODE = 'potential';

function priceResult(rows, request, days, source, reason = null, extra = {}) {
    const fraction = request.side === 'buy' ? .25 : .75;
    const rawPrice = reason ? null : weightedPriceQuantile(rows, fraction);
    const price = rawPrice == null ? null : roundHistoricalPrice(rawPrice, request.side);
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    return { reliable: price != null, priceReliable: price != null, price, rawPrice, source,
        confidence: price != null ? 'high' : 'none',
        method: request.side === 'buy' ? 'P25' : 'P75', days,
        samples: new Set(rows.map(row => Math.floor(row.at / DAY_MS))).size,
        transactions: source === 'Kişisel' ? rows.length : null,
        quantity: rows.length && Number.isSafeInteger(quantity) ? quantity : null,
        latest: rows.length ? new Date(Math.max(...rows.map(row => row.at))).toISOString() : null,
        setup: true, reason: reason ?? (price == null ? 'Geçerli miktar ağırlıklı fiyat yok' : null), ...extra };
}

// A sparse history can still describe a directionally useful price, but it is
// not enough evidence to feed the planner.  Keep it separate from `price` so
// users can inspect existing executed trades without mistaking it for a usable
// P25/P75 decision.
function sparseMarketIndicator(points, request, days, now) {
    const end = Math.floor(now / DAY_MS) * DAY_MS, start = end - days * DAY_MS;
    const daily = new Map();
    for (const point of points ?? []) {
        const at = Date.parse(normalizePriceDate(point.timestamp)), price = Number(point.avg_price), quantity = Number(point.item_count);
        if (!(at >= start && at < end) || !(price > 0) || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
        daily.set(Math.floor(at / DAY_MS), { at, price, quantity });
    }
    const rows = [...daily.values()];
    if (rows.length < Math.min(3, days) || Math.max(...rows.map(row => row.at)) < end - SALES_EVIDENCE_POLICY.maxAgeDays * DAY_MS) return null;
    const center = median(rows.map(row => row.price));
    const accepted = rows.filter(row => row.price >= center / SALES_EVIDENCE_POLICY.maxPriceRatio && row.price <= center * SALES_EVIDENCE_POLICY.maxPriceRatio);
    if (accepted.length < Math.min(3, days)) return null;
    const rawPrice = weightedPriceQuantile(accepted, request.side === 'buy' ? .25 : .75);
    const price = rawPrice == null ? null : roundHistoricalPrice(rawPrice, request.side);
    if (!(price > 0)) return null;
    return { indicativePrice: price, indicativeSamples: accepted.length,
        indicativeQuantity: accepted.reduce((sum, row) => sum + row.quantity, 0),
        indicativeLatest: new Date(Math.max(...accepted.map(row => row.at))).toISOString() };
}

export function personalPotentialPrice(index, request, days = POTENTIAL_PRICE_POLICY.defaultDays, now = Date.now()) {
    const rows = (index.get(tradeEvidenceKey({ ...request, city: cityKey(request.city) })) ?? [])
        .filter(trade => trade.sourceId != null && String(trade.sourceId) !== ''
            && !(typeof trade.sourceId === 'number' && !Number.isSafeInteger(trade.sourceId))).map(trade => ({
        at: Date.parse(normalizePriceDate(trade.occurredAt)), price: Number(trade.unitPriceSilver), quantity: Number(trade.quantity)
    })).filter(row => row.at >= now - days * DAY_MS && row.at <= now && Number.isFinite(row.price) && row.price > 0
        && Number.isSafeInteger(row.quantity) && row.quantity > 0);
    const daily = new Map();
    for (const row of rows) {
        const day = Math.floor(row.at / DAY_MS), values = daily.get(day) ?? [];
        values.push(row); daily.set(day, values);
    }
    const center = median([...daily.values()].map(values => weightedPriceQuantile(values, .5)));
    const accepted = rows.filter(row => row.price >= center / SALES_EVIDENCE_POLICY.maxPriceRatio && row.price <= center * SALES_EVIDENCE_POLICY.maxPriceRatio);
    const failure = reason => priceResult(accepted, request, days, 'Kişisel', reason, { evidenceType: 'Gerçekleşmiş kişisel işlem yüzdeliği' });
    if (new Set(accepted.map(row => Math.floor(row.at / DAY_MS))).size < POTENTIAL_PRICE_POLICY.minDays) return failure('En az 5 farklı gerçekleşmiş işlem günü gerekli');
    if (accepted.length < POTENTIAL_PRICE_POLICY.minTransactions) return failure('En az 10 bağımsız gerçekleşmiş işlem gerekli');
    if (Math.max(...accepted.map(row => row.at)) < now - POTENTIAL_PRICE_POLICY.maxAgeDays * DAY_MS) return failure('Son uygun kişisel işlem 7 günden eski');
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0), acceptedQuantity = accepted.reduce((sum, row) => sum + row.quantity, 0);
    if (!Number.isSafeInteger(totalQuantity) || !Number.isSafeInteger(acceptedQuantity) || acceptedQuantity <= 0) return failure('Geçerli toplam işlem miktarı yok');
    if (acceptedQuantity / totalQuantity < SALES_EVIDENCE_POLICY.minInlierRatio) return failure('Aşırı fiyat sapması');
    if (weightedQuantile(accepted.map(row => ({ value: Math.abs(row.price - center), weight: row.quantity })), .5) / center > SALES_EVIDENCE_POLICY.maxDispersion) return failure('İstikrarsız geçmiş fiyat');
    const rawPrice = weightedPriceQuantile(accepted, request.side === 'buy' ? .25 : .75);
    if (rawPrice == null) return failure('Geçerli toplam işlem miktarı yok');
    // Include ties in the supporting tail: identical prices across days must not
    // acquire a spurious ordering-dependent dominance penalty.
    const tail = accepted.filter(row => request.side === 'buy' ? row.price <= rawPrice : row.price >= rawPrice);
    const total = tail.reduce((sum, row) => sum + row.quantity, 0), dayWeights = new Map();
    for (const row of tail) { const day = Math.floor(row.at / DAY_MS); dayWeights.set(day, (dayWeights.get(day) ?? 0) + row.quantity); }
    if (Math.max(...tail.map(row => row.quantity)) / total >= POTENTIAL_PRICE_POLICY.maxTransactionShare
        || Math.max(...dayWeights.values()) / total >= POTENTIAL_PRICE_POLICY.maxDayShare) return failure('Fiyat dilimini tek bir işlem veya gün domine ediyor');
    return priceResult(accepted, request, days, 'Kişisel', null, { evidenceType: 'Gerçekleşmiş kişisel işlem yüzdeliği', assessedAt: new Date(now).toISOString(),
        validUntil: new Date(Math.min(Math.min(...accepted.map(row => row.at)) + days * DAY_MS,
            Math.max(...accepted.map(row => row.at)) + POTENTIAL_PRICE_POLICY.maxAgeDays * DAY_MS) + 1).toISOString(),
        tailQuantity: total, tailDays: dayWeights.size, rejected: rows.length - accepted.length });
}

// Keep hourly buckets distinct: daily aggregation hides traded intraday extremes.
export function marketOpportunityPrice(points, request, days, now, source = 'API saatlik', preserveExecutions = false) {
    const buckets = new Map();
    for (const [position, point] of (points ?? []).entries()) {
        const at = Date.parse(normalizePriceDate(point.timestamp));
        const price = Number(point.avg_price), quantity = Number(point.item_count);
        if (at >= now - days * DAY_MS && at <= now && price > 0 && Number.isFinite(price)
            && point.item_count != null && Number.isSafeInteger(quantity) && quantity > 0)
            buckets.set(preserveExecutions ? position : at, { at, price, quantity, intervalHours: point.intervalHours ?? null });
    }
    const rows = [...buckets.values()];
    const center = weightedPriceQuantile(rows, .5);
    const historical = rows.filter(row => row.price >= center / SALES_EVIDENCE_POLICY.maxPriceRatio && row.price <= center * SALES_EVIDENCE_POLICY.maxPriceRatio);
    const accepted = historical.filter(row => row.at >= now - POTENTIAL_PRICE_POLICY.maxAgeDays * DAY_MS);
    const selected = accepted.sort((a,b) => (request.side === 'buy' ? a.price - b.price : b.price - a.price) || b.at - a.at)[0];
    return priceResult(selected ? [selected] : [], request, days, source,
        selected ? null : 'Seçili dönemde güncel, miktarı bilinen saatlik işlem kanıtı yok.', {
        method: request.side === 'buy' ? 'İşlemli minimum' : 'İşlemli maksimum',
        evidenceType: source === 'Oyun Market History' ? 'Oyun Market History işlem ortalaması (' + (selected?.intervalHours ?? '?') + ' saat)' : 'Saatlik gerçekleşmiş işlem ortalaması', transactions: null,
        intervalHours: selected?.intervalHours ?? null,
        forecastPoints: historical.map(row => ({timestamp:new Date(row.at).toISOString(),price:row.price,quantity:row.quantity})),
        samples: new Set(accepted.map(row => Math.floor(row.at / DAY_MS))).size,
        selectedAt: selected ? new Date(selected.at).toISOString() : null,
        selectedQuantity: selected?.quantity ?? null,
        marketMeaning: 'Saatlik piyasa işlem ortalaması; emir yönü ve tekil işlem fiyatı API tarafından ayrılmıyor.',
        validUntil: new Date(now + 5 * 60000).toISOString()
    });
}

export function personalOpportunityPrice(index, request, days, now) {
    const trades = index.get(tradeEvidenceKey({ ...request, city: cityKey(request.city) })) ?? [];
    const points = trades.filter(trade => trade.sourceId != null && String(trade.sourceId) !== '').map(trade => ({
        timestamp: trade.occurredAt, avg_price: trade.unitPriceSilver, item_count: trade.quantity
    }));
    // Executions sharing a timestamp are independent; retain each execution price.
    const result = marketOpportunityPrice(points, request, days, now, 'Kişisel', true);
    return { ...result, evidenceType: 'Şahsi gerçekleşmiş alış/satış',
        marketMeaning: 'Yalnız aynı şehir, eşya, kalite ve yöndeki gerçekleşmiş şahsi işlemler.',
        transactions: trades.length };
}

export function marketPotentialPrice(points, request, days, now, source) {
    const stats = salesEvidence(points, days, now, null, { side: request.side, includeAcceptedPoints: true });
    const rows = (stats.acceptedPoints ?? []).map(row => ({ ...row, at: Date.parse(row.timestamp) }));
    let reason = stats.reliable ? null : stats.reason;
    // A rejected fresh anomaly cannot refresh the age of the usable price tail.
    if (!reason && (rows.length < SALES_EVIDENCE_POLICY.minActiveDays
        || Math.max(...rows.map(row => row.at)) < Math.floor(now / DAY_MS) * DAY_MS - SALES_EVIDENCE_POLICY.maxAgeDays * DAY_MS))
        reason = 'Ayıklama sonrası işlemli gün veya 2 gün tazelik koşulu yetersiz';
    const result = priceResult(rows, request, days, source, reason, {
        evidenceType: 'Günlük ortalama fiyat dağılımının dilimi', transactions: null,
        marketMeaning: request.side === 'buy' ? 'Piyasa Sell işlem fiyatı; kişisel alış veya Buy emir gerçekleşmesi kanıtı değildir' : 'Piyasa Sell işlem fiyatı',
        assessedAt: new Date(now).toISOString(), validUntil: new Date((Math.floor(now / DAY_MS) + 1) * DAY_MS).toISOString(),
        coverage: stats.coverage, dispersion: stats.dispersion, rejected: stats.rejected });
    if (result.reliable) return result;
    const indicative = sparseMarketIndicator(points, request, days, now);
    return indicative ? { ...result, ...indicative, confidence: 'low',
        reason: `${result.reason ?? 'Yetersiz işlem geçmişi'}; yalnız gösterge fiyat üretildi, ada hesabında kullanılmaz.` } : result;
}

export function potentialPriceAt(index, request, days, now = Date.now()) {
    const stats = index?.get(tradeEvidenceKey(request));
    if (stats?.days === days && ((stats.savedSnapshot && !stats.expires) || !stats.validUntil || Date.parse(stats.validUntil) > now))
        return stats.plannerUsable === false ? { ...stats, reliable: false, priceReliable: false, price: null } : stats;
    return { reliable: false, price: null, days, method: request.side === 'buy' ? 'P25' : 'P75',
        reason: stats?.days === days ? 'Potansiyel fiyat kanıtı eskidi; fiyatları yenileyin.' : 'Seçili dönem için güvenilir Potansiyel fiyat kanıtı yok.' };
}

// SAT records are personal executions. Orders, crafting and player transfers
// are not market executions, and missing server/quality is never inferred.
export function indexTradeEvidence(snapshot) {
    const index = new Map(), seen = new Set();
    for (const trade of snapshot?.trades ?? []) {
        const server = trade.server ?? snapshot.server;
        const scope = trade.scope ?? snapshot.scope;
        const side = sides[trade.kind], quality = Number(trade.quality);
        if (!server || scope !== 'personal' || !side || trade.quality == null || !Number.isInteger(quality) || quality < 1 || quality > 5 || !trade.itemId) continue;
        const city = cityKey(trade.locationName), key = tradeEvidenceKey({ server, city, itemId: trade.itemId, quality, side });
        const identity = JSON.stringify([server, trade.sourceId != null ? String(trade.sourceId) : [trade.kind, trade.clusterIndex, trade.occurredAt, trade.itemId, trade.quantity, trade.totalPriceSilver]]);
        if (!city || seen.has(identity)) continue;
        seen.add(identity);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(trade);
    }
    return index;
}

export function localTradeEvidence(index, request, days, now) {
    const trades = index.get(tradeEvidenceKey({ ...request, city: cityKey(request.city) })) ?? [];
    const end = Math.floor(now / DAY_MS) * DAY_MS, start = end - days * DAY_MS;
    const buckets = new Map();
    let usesOrder = false;
    for (const trade of trades) {
        const at = Date.parse(normalizePriceDate(trade.occurredAt)), price = Number(trade.unitPriceSilver);
        if (!(at >= start && at < end) || !(price > 0)) continue;
        usesOrder ||= trade.kind === 'mail_buy' || trade.kind === 'mail_sell';
        const quantity = trade.quantity == null ? null : Number(trade.quantity);
        const known = Number.isSafeInteger(quantity) && quantity > 0;
        const key = Math.floor(at / DAY_MS), bucket = buckets.get(key) ?? { at: key * DAY_MS, value: 0, weight: 0, count: 0, countKnown: true };
        bucket.value += price * (known ? quantity : 1);
        bucket.weight += known ? quantity : 1;
        bucket.count += known ? quantity : 0;
        bucket.countKnown &&= known;
        buckets.set(key, bucket);
    }
    const points = [...buckets.values()].map(bucket => ({ timestamp: new Date(bucket.at).toISOString(), avg_price: bucket.value / bucket.weight, item_count: bucket.weight }));
    const stats = salesEvidence(points, days, now, null, { side: request.side, policy: PERSONAL_PERFORMANCE_POLICY });
    const priceStats = salesEvidence(points, days, now, null, { side: request.side, policy: PERSONAL_PRICE_POLICY, priceOnly: true });
    const countKnown = [...buckets.values()].every(bucket => bucket.countKnown);
    return { ...stats, price: priceStats.price, historicalPrice: priceStats.historicalPrice,
        priceReliable: priceStats.reliable, capacityReliable: stats.reliable && countKnown,
        reliable: stats.reliable && countKnown, volume: countKnown ? stats.volume : null,
        source: 'Yerel', priceSource: 'Yerel', capacitySource: 'Yerel', volumeKind: 'personal',
        setup: usesOrder, priceOrigin: 'Kişisel SAT', capacityOrigin: 'Kişisel SAT performansı',
        reason: stats.reason ?? (!countKnown ? 'Kişisel işlem miktarı eksik' : null) };
}

// Default: quantity-weighted price only. The explicit false option preserves
// the old archive-evidence audit contract, never the planner's optimization.
export async function resolveTradePotential(requests, { snapshot, days = POTENTIAL_PRICE_POLICY.defaultDays, now = Date.now(), fetchLocalHistory, fetchHistory, fetchHourlyHistory, fetchPacketHistory, opportunity = false, priceOnly = true }) {
    const index = indexTradeEvidence(snapshot), result = new Map();
    const unique = [...new Map(requests.map(request => [tradeEvidenceKey(request), request])).values()];
    for (const request of unique) result.set(tradeEvidenceKey(request), priceOnly
        ? (opportunity ? personalOpportunityPrice(index, request, days, now) : personalPotentialPrice(index, request, days, now)) : localTradeEvidence(index, request, days, now));
    for (const stage of [
        ...(opportunity ? [{ fetch: fetchPacketHistory, source: 'Oyun Market History', origin: 'Oyun paketi', opportunity: true }] : []),
        ...(opportunity ? [{ fetch: fetchLocalHistory, source: 'Yerel arşiv', origin: 'Yerel AODP', opportunity: true }] : []),
        ...(priceOnly && fetchHourlyHistory ? [{ fetch: fetchHourlyHistory, source: 'API saatlik', origin: 'Saatlik AODP', hourly: true }] : []),
        ...(!opportunity ? [{ fetch: fetchLocalHistory, source: 'Yerel', origin: 'Yerel AODP' }] : []),
        { fetch: fetchHistory, source: 'API', origin: 'Dış AODP' }
    ]) {
        if (!stage.fetch) continue;
        const groups = new Map();
        for (const request of unique) {
            const value = result.get(tradeEvidenceKey(request));
            if ((opportunity || !stage.hourly) && (priceOnly ? value.reliable : value.priceReliable && value.capacityReliable)) continue;
            const groupKey = JSON.stringify([request.server, request.city, request.quality]);
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(request);
        }
        for (const group of groups.values()) {
            let rows;
            try { rows = await stage.fetch([...new Set(group.map(request => request.itemId))], group[0]); }
            catch (error) {
                for (const request of group) {
                    const previous = result.get(tradeEvidenceKey(request));
                    previous.reason = `${previous.reason ?? ''}; ${stage.origin}: ${error.message}`;
                }
                continue;
            }
            for (const request of group) {
                const key = tradeEvidenceKey(request), previous = result.get(key);
                const points = rows.get(request.itemId)?.points;
                if (priceOnly) {
                    const value = stage.hourly || stage.opportunity || opportunity ? marketOpportunityPrice(points, request, days, now, stage.source) : marketPotentialPrice(points, request, days, now, stage.source === 'API' ? 'API' : 'Yerel AODP');
                    if (stage.hourly && previous.reliable && (!value.reliable || (request.side === 'buy' ? previous.price <= value.price : previous.price >= value.price))) continue;
                    const diagnostic = value.samples > (previous.samples ?? 0) ? value : previous;
                    result.set(key, value.reliable ? value : { ...diagnostic, reason: `${previous.reason ?? 'yetersiz'}; ${value.source}: ${value.reason}` });
                    continue;
                }
                const capacity = salesEvidence(points, days, now, null, { side: request.side });
                const price = salesEvidence(points, days, now, null, { side: request.side, priceOnly: true });
                const value = { ...previous };
                if (!previous.priceReliable && price.reliable) Object.assign(value, {
                    price: price.price, historicalPrice: price.historicalPrice, priceReliable: true,
                    priceSource: stage.source, priceOrigin: stage.origin, priceEvidence: price, setup: request.setup ?? true
                });
                if (!previous.capacityReliable && capacity.reliable) Object.assign(value, {
                    volume: capacity.volume, capacityReliable: true, capacitySource: stage.source,
                    capacityOrigin: stage.origin, volumeKind: 'market', capacityEvidence: capacity,
                    samples: capacity.samples, coverage: capacity.coverage, latest: capacity.latest,
                    capacityMeaning: request.side === 'buy' ? 'Gerçekleşmiş piyasa satışlarına dayalı temin senaryosu' : 'Piyasa satış hacmi'
                });
                value.reliable = Boolean(value.priceReliable && value.capacityReliable);
                value.source = value.priceSource === value.capacitySource ? value.priceSource : 'Karma';
                value.reason = value.reliable ? null : `${previous.reason ?? 'yetersiz'}; ${stage.origin}: ${capacity.reason ?? price.reason ?? 'yetersiz'}`;
                result.set(key, value);
            }
        }
    }
    return result;
}
