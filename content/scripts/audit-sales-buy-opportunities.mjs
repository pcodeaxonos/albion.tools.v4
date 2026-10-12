import { readFileSync, writeFileSync } from 'node:fs';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';

// Read-only archive adapter: never opens a repository journal or modifies market data.
const archive = JSON.parse(readFileSync('.aodp-quote-history.json', 'utf8'));
const packets = JSON.parse(readFileSync('.price-order-history.json', 'utf8'));
const itemId = process.argv[2] || 'T6_FOXGLOVE';
const now = process.argv[3] ? Date.parse(process.argv[3]) : Date.now();
if (!Number.isFinite(now)) throw new Error('Invalid audit time');
const key = row => [row.server, row.itemId, row.city, row.quality, row.side].join('|');
const filter = rows => rows.filter(row => row.itemId === itemId);
const aodp = new Map(filter(archive.history.series).map(row => [key(row), row]));
const local = new Map(filter(packets.series).map(row => [key(row), row]));
const current = new Map(archive.current), anchors = new Map(archive.anchors);
const repository = { identities: () => [...aodp.values()], seriesFor: identity => aodp.get(key(identity)),
    currentQuote: identity => current.get(key(identity)),
    anchor: (item, city, quality, server) => anchors.get([server, item, city, quality].join('|')) };
const packetHistory = { identities: () => [...local.values()], seriesFor: identity => local.get(key(identity)) };
const constants = JSON.parse(readFileSync('data/economy-constants.json', 'utf8'));
const rate = name => Number(constants.find(row => row.key === name)?.value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const result = scanQuoteBooks({ server: 'europe', repository, packetHistory, now, fees, includeEvaluation: true });
const report = { itemId, auditedAt: new Date(now).toISOString(), scope: 'Persisted checkpoints; pending live journals excluded',
    cells: result.evaluation.snapshots.map(snapshot => {
        const row = result.evaluation.rows.find(row => row.city === snapshot.city && row.quality === snapshot.quality);
        const valuation = row?.strategies?.find(strategy => strategy.id === 'place-buy-order-sales')
            || row?.potentialStrategies?.find(strategy => strategy.id === 'place-buy-order-sales');
        return { city: snapshot.city, quality: snapshot.quality, buy: snapshot.buy.price,
            buyAt: snapshot.buy.at, buyStale: snapshot.buy.stale, buyReference: snapshot.buy.reference,
            salesMedian: snapshot.buy.salesReference.price, salesDays: snapshot.buy.salesReference.validDays,
            salesFresh: snapshot.buy.salesReference.fresh, result: valuation?.outcome || 'no-sales-buy-signal',
            discount: valuation?.deviation ?? null,
            evidence: row?.decisions?.find(decision => decision.id === 'place-buy-order-sales')?.reasons || [] };
    }) };
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
