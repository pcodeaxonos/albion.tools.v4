import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { requestAodp } from './aodp-collector.mjs';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
import { DAY_MS, LONG_TERM_STRATEGIES, AODP_COLLECTOR_POLICY } from '../js/core/market-history-config.mjs';
const root = 'docs/opportunity-v5';
const baseline = JSON.parse(readFileSync(`${root}/baseline-scan.json`, 'utf8').replace(/^\uFEFF/, ''));
writeFileSync(`${root}/baseline-scan.json.gz`, gzipSync(JSON.stringify(baseline)));
unlinkSync(`${root}/baseline-scan.json`);
const now = Date.now(), host = JSON.parse(readFileSync('data/price-servers.json')).find(row => row.code === baseline.server).host;
const cities = [...new Set(baseline.eligibleCandidates.flatMap(row => [row.city, ...row.strategies.map(strategy => strategy.toCity).filter(Boolean)]))];
const rows = [], urls = [];
for (const quality of [...new Set(baseline.eligibleCandidates.map(row => row.quality))]) {
    const ids = baseline.eligibleCandidates.filter(row => row.quality === quality).map(row => row.itemId);
    const makeUrl = batch => aodpUrl(host, 'history', batch, cities, quality, {
        date: new Date(now - LONG_TERM_STRATEGIES['median-28d'].windowMs).toISOString().slice(0, 10),
        end_date: new Date(now).toISOString().slice(0, 10), 'time-scale': '24' });
    for (const batch of urlBatches(ids, makeUrl)) {
        const url = makeUrl(batch); urls.push(url);
        rows.push(...await requestAodp(url, AODP_COLLECTOR_POLICY.timeoutMs));
        await new Promise(resolve => setTimeout(resolve, AODP_COLLECTOR_POLICY.requestGapMs));
    }
}
const history = { fetchedAt: new Date(now).toISOString(), evaluationAt: new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString(),
    priceSnapshotAt: baseline.scannedAt, urls, rows };
writeFileSync(`${root}/sales-history.json.gz`, gzipSync(JSON.stringify(history)));
console.log(JSON.stringify({ pricesAt: baseline.scannedAt, fetchedAt: history.fetchedAt, requests: urls.length, rows: rows.length }));
