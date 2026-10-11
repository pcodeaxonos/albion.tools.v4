import { readFileSync, writeFileSync } from 'node:fs';
import { readAuditFile } from './market-audit-artifacts.mjs';
import { requestAodp } from './aodp-collector.mjs';
import { aodpUrl } from '../js/core/market-request.mjs';
const audit = JSON.parse(readAuditFile('docs/market-final/current/analysis.json', 'utf8'));
const selected = audit.verifiedRows.slice(0, 20);
const server = JSON.parse(readFileSync('data/price-servers.json')).find(server => server.code === 'europe');
const groups = new Map();
for (const row of selected) { if (!groups.has(row.quality)) groups.set(row.quality, []); groups.get(row.quality).push(row); }
const checks = [], failures = [];
for (const [quality, rows] of groups) {
    const url = aodpUrl(server.host, 'prices', [...new Set(rows.map(row => row.itemId))], [...new Set(rows.map(row => row.city))], quality);
    try {
        const prices = await requestAodp(url, 20000);
        for (const row of rows) {
            const current = prices.find(price => price.item_id === row.itemId && price.city === row.city && Number(price.quality) === quality);
            checks.push({ id: row.id, quality, server: row.server, source: 'AODP REST', fetchedAt: new Date().toISOString(),
                archivedBuy: row.buy?.price, archivedSell: row.sell?.price, archivedBuyAt: row.buy?.at, archivedSellAt: row.sell?.at,
                current: current || null, sameBuy: current ? current.buy_price_max === row.buy?.price : null, sameSell: current ? current.sell_price_min === row.sell?.price : null });
        }
    } catch (error) { failures.push({ quality, error: error.message }); }
}
const proof = { checkedAt: new Date().toISOString(), snapshotAsOf: audit.manifest.asOf, requested: selected.length, returned: checks.filter(row => row.current).length,
    independentSourceVerified: false, limitation: 'AODP REST is the existing source, queried again; this is not independent market truth. Local hub/NATS cannot prove a complete current order book or fills.',
    sameBoth: checks.filter(row => row.sameBuy && row.sameSell).length, checks, failures };
writeFileSync('docs/market-final/price-crosscheck.json', JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ ...proof, checks: undefined }, null, 2));
