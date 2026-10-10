import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locationNamesByIndex } from '../js/core/market-catalog.mjs';
import { islandMarketCities } from '../js/core/island/market-scope.mjs';
import { createNatsMarketAdapter } from './aodp-nats-adapter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const servers = JSON.parse(readFileSync(join(root, 'data', 'price-servers.json'), 'utf8'));
const europe = servers.find((row) => row.code === 'europe');
const cityRows = JSON.parse(readFileSync(join(root, 'data', 'cities.json'), 'utf8'));
const cities = islandMarketCities(cityRows);
const locationNames = locationNamesByIndex(JSON.parse(readFileSync(join(root, 'data', 'locations.json'), 'utf8')), cityRows);
const output = join(root, 'docs', 'nats-market-sample.json');
const durationMs = 10 * 60 * 1000;
const started = Date.now();

const adapter = createNatsMarketAdapter({
    mode: 'telemetry',
    endpoint: europe.nats,
    locationNames,
    cities,
    onDiscovery() {}
});
adapter.start();

const timer = setInterval(() => {
    const snapshot = adapter.snapshot();
    const report = {
        kind: 'albion.tools.nats-market-sample',
        server: 'europe',
        subject: 'marketorders.deduped',
        startedAt: new Date(started).toISOString(),
        elapsedMs: Date.now() - started,
        complete: false,
        cities,
        ...snapshot
    };
    writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`[NATS sample] ${report.elapsedMs}ms messages=${snapshot.messages} valid=${snapshot.validOrders} status=${snapshot.status}`);
}, 30_000);

setTimeout(() => {
    clearInterval(timer);
    const snapshot = adapter.snapshot();
    adapter.stop();
    const report = {
        kind: 'albion.tools.nats-market-sample',
        server: 'europe',
        subject: 'marketorders.deduped',
        startedAt: new Date(started).toISOString(),
        elapsedMs: Date.now() - started,
        complete: true,
        cities,
        bookLimit: snapshot.bookLimit,
        ...snapshot
    };
    writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`[NATS sample] complete ${JSON.stringify({ messages: snapshot.messages, valid: snapshot.validOrders, cells: snapshot.cells, reliable: snapshot.reliableBooks })}`);
    process.exit(0);
}, durationMs);
