import https from 'node:https';
import http from 'node:http';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
import { islandMarketCities } from '../js/core/island/market-scope.mjs';

const root = 'docs/opportunity-v4';
const get = url => new Promise((resolve, reject) => {
    const req = (url.startsWith('https:') ? https : http).get(url, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            try {
                if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
                const body = Buffer.concat(chunks);
                resolve(JSON.parse(res.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body));
            } catch (error) { reject(error); }
        });
    });
    req.setTimeout(60000, () => req.destroy(new Error('Read-only capture timeout')));
    req.on('error', reject);
});
const analysis = JSON.parse(gunzipSync(readFileSync(`${root}/live/comparison.json.gz`)));
const items = [...new Set(analysis.trades.slice(0, 20).map(row => row.itemId))];
const cities = islandMarketCities(JSON.parse(readFileSync('data/cities.json')));
const host = JSON.parse(readFileSync('data/price-servers.json')).find(row => row.code === 'europe').host;
const batches = urlBatches(items, ids => aodpUrl(host, 'prices', ids, cities, 1));
const rows = [], urls = [];
for (const batch of batches) {
    const url = aodpUrl(host, 'prices', batch, cities, 1);
    urls.push(url); rows.push(...await get(url));
}
const capture = { capturedAt: new Date().toISOString(), server: 'europe', source: 'aodp-current',
    scope: 'First 20 ranked archive candidates, unique items, all active cities, quality 1',
    requests: urls.length, urls, rows, collector: await get('http://127.0.0.1:3001/api/v2/stats/status') };
writeFileSync(`${root}/new-observations.json.gz`, gzipSync(JSON.stringify(capture)));
const old = `${root}/live-before.json`;
try { writeFileSync(`${old}.gz`, gzipSync(readFileSync(old))); unlinkSync(old); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log(JSON.stringify({ capturedAt: capture.capturedAt, requests: urls.length, items: items.length,
    rows: rows.length, collectorStatus: capture.collector.collector.status }));
