import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { islandMarketItemIds, islandMarketCities } from '../js/core/island/market-scope.mjs';
import { BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';
import { AODP_COLLECTOR_POLICY } from '../js/core/market-history-config.mjs';
import { selectLongTermReference } from '../js/core/long-term-price.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { createAodpCollector } from './aodp-collector.mjs';

export function startQuoteService({ root, server, packetHistory, collectorOptions = {} }) {
    const read = name => JSON.parse(readFileSync(join(root, 'data', `${name}.json`), 'utf8'));
    const servers = read('price-servers');
    const host = servers.find(row => row.code === server)?.host;
    if (!host) throw new Error('AODP server host missing in shared configuration');
    const catalog = { plants: read('plants'), animals: read('animals'), items: read('items'), recipeMaterials: read('recipe-materials') };
    const ids = islandMarketItemIds(catalog), cities = islandMarketCities(read('cities'));
    let repository;
    try { repository = new QuoteHistoryRepository({ path: join(root, AODP_COLLECTOR_POLICY.fileName), servers: servers.map(row => row.code) }); }
    catch (error) {
        console.warn(`AODP collector disabled; repository preserved: ${error.message}`);
        return { repository: null, error: error.message,
            collector: { state: { status: 'repository-error', server, itemCount: ids.length, cityCount: cities.length,
                error: error.message, lastSuccessAt: null } } };
    }
    const collector = createAodpCollector({ ...collectorOptions, host,
        server, ids, cities, repository });
    collector.start();
    return { repository, collector,
        references({ requestedServer, items, locations, qualities = [1], sides = ['buy', 'sell'], now = Date.now() }) {
            if (requestedServer !== server) return [];
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
