import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { islandMarketItemIds, islandMarketCities } from '../js/core/island/market-scope.mjs';
import { marketCatalogItemIds } from '../js/core/market-catalog.mjs';
import { createCollectionPlan } from '../js/core/market-collection-plan.mjs';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
import { BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';
import { AODP_COLLECTOR_POLICY, MARKET_COLLECTION_POLICY } from '../js/core/market-history-config.mjs';
import { selectLongTermReference } from '../js/core/long-term-price.mjs';
import { scanQuoteBooks, seriesForCell } from '../js/core/market-opportunity-scan.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { createAodpCollector } from './aodp-collector.mjs';

function economyRates(root) {
    const rows = JSON.parse(readFileSync(join(root, 'data', 'economy-constants.json'), 'utf8'));
    const read = (key) => {
        const value = Number(rows.find((row) => row.key === key)?.value);
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error(`Missing economy rate: ${key}`);
        return value;
    };
    return { setupFeeRate: read('setup_fee'), taxPremiumRate: read('tax_premium'), taxFreeRate: read('tax_free') };
}

export function startQuoteService({ root, server, packetHistory, collectorOptions = {} }) {
    const read = name => JSON.parse(readFileSync(join(root, 'data', `${name}.json`), 'utf8'));
    const servers = read('price-servers');
    const host = servers.find(row => row.code === server)?.host;
    if (!host) throw new Error('AODP server host missing in shared configuration');
    const catalog = { plants: read('plants'), animals: read('animals'), items: read('items'), recipeMaterials: read('recipe-materials') };
    const islandIds = islandMarketItemIds(catalog);
    const ids = [...new Set([...marketCatalogItemIds(catalog.items), ...islandIds])].sort();
    const cities = islandMarketCities(read('cities'));
    const batchCount = host ? urlBatches(ids, (batch) => aodpUrl(host, 'prices', batch, cities, AODP_COLLECTOR_POLICY.quality)).length : 0;
    const collectionPlan = createCollectionPlan({
        ids, preferredIds: islandIds, batchCount, policy: MARKET_COLLECTION_POLICY
    });
    let repository;
    try { repository = new QuoteHistoryRepository({ path: join(root, AODP_COLLECTOR_POLICY.fileName), servers: servers.map(row => row.code) }); }
    catch (error) {
        console.warn(`AODP collector disabled; repository preserved: ${error.message}`);
        return { repository: null, error: error.message,
            collector: { state: { status: 'repository-error', server, itemCount: ids.length, cityCount: cities.length,
                error: error.message, lastSuccessAt: null } } };
    }
    const collector = createAodpCollector({
        ...collectorOptions, host, server, ids, cities, repository, collectionPlan,
        policy: {
            ...AODP_COLLECTOR_POLICY, requestGapMs: collectionPlan.cadence.requestGapMs,
            ...collectorOptions.policy
        }
    });
    collector.start();
    let opportunityCache = null;
    let fees = null;
    return { repository, collector,
        opportunityScan({ requestedServer, premium = true, now = Date.now() }) {
            if (requestedServer !== server) return { server, opportunities: [], error: 'server-mismatch' };
            const enabled = premium !== false && premium !== '0';
            const slot = `${requestedServer}|${enabled ? 1 : 0}|${Math.floor(now / 30000)}`;
            if (opportunityCache?.slot === slot) return opportunityCache.payload;
            fees ??= economyRates(root);
            const payload = scanQuoteBooks({ server, packetHistory, repository, now, premium: enabled, fees });
            collector.noteOpportunities((payload.opportunities || []).map((row) => row.itemId), now);
            opportunityCache = { slot, payload };
            return payload;
        },
        opportunitySeries({ requestedServer, itemId, city, quality, now = Date.now() }) {
            if (requestedServer !== server || !itemId || !city) return null;
            return seriesForCell(packetHistory, repository, { server, itemId, city, quality, now });
        },
        references({ requestedServer, items, locations, qualities = [1], sides = ['buy', 'sell'], now = Date.now() }) {
            if (requestedServer !== server) return [];
            collector.noteWatched(items, now);
            return items.flatMap(itemId => locations.flatMap(city => qualities.flatMap(quality => sides.map(side => {
                const identity = { server, itemId, city, quality: Number(quality), side, priceField: BOOK_PRICE_FIELDS[side] };
                const series = [packetHistory.seriesFor(identity, now), repository.seriesFor(identity, now)].filter(Boolean);
                const buyPoints = packetHistory.seriesFor({ ...identity, side: 'buy' }, now)?.buckets
                    .map(p => ({ ...p, source: 'market-order-packets' }))
                    .sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt)) || [];
                const current = repository.currentQuote({ ...identity, side: 'buy' }) ?? buyPoints[0];
                return selectLongTermReference({ series, identity, now, salesRow: repository.anchor(itemId, city, Number(quality), server),
                    currentRow: current && { buy_price_max: current.price, buy_price_max_date: current.sourceQuoteAt ?? current.seenAt,
                        source: current.source, fetchedAt: current.fetchedAt } });
            }))));
        }
    };
}
