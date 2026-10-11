import { migrateObservationArchive } from './migrate-market-observations.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeObservation, validateObservationSeries, OBSERVATION_POLICY } from '../js/core/market-observation.mjs';
import { assessMarketSide, analyzeMarketCell, OPPORTUNITY_POLICY, rankMarketOpportunities } from '../js/core/market-opportunities.mjs';
import { resolveOpportunityCard } from '../js/core/opportunity-status.mjs';
import { mergePartialBook } from '../js/core/market-book.mjs';
import { preserveArchive } from './archive-backup.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { scanQuoteBooks, applyLiveQuote } from '../js/core/market-opportunity-scan.mjs';
const now = Date.parse('2026-10-10T12:00:00Z'), hour = 3600000;
const identity = { server: 'europe', itemId: 'T7_MEAL_ROAST', city: 'Brecilien', quality: 1, side: 'sell' };
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const point = (price, ago, extra={}) => ({ ...identity, price, source: 'aodp-current', sourceQuoteAt: new Date(now-ago*hour).toISOString(), fetchedAt: new Date(now).toISOString(), ...extra });
const stable = Array.from({length:25},(_,i)=>point(4372, 80-i*2));
let checks=0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
test('duplicate events, equal-price independent times, shared provenance, old source time',()=> {
 const a=point(4372,2), b={...a,fetchedAt:new Date(now+hour).toISOString()};
 assert.equal(validateObservationSeries([a,b],{now:now+hour}).observations.length,1);
 assert.equal(validateObservationSeries([a,point(4372,1)],{now}).observations.length,2);
 assert.equal(validateObservationSeries([a,{...a,source:'market-order-packets',coverage:'complete',sourceTimeKnown:true,observedAt:a.sourceQuoteAt}],{now}).observations.length,1);
 assert.equal(normalizeObservation(a,{now}).at,now-2*hour);
});
test('invalid price/time rejection and unknown packet coverage',()=> {
 for(const price of [0,-1,NaN,Infinity]) assert.equal(normalizeObservation(point(price,0),{now}).validationStatus,'rejected');
 for(const sourceQuoteAt of ['bad', new Date(now+hour).toISOString()]) assert.equal(normalizeObservation({...point(10,0),sourceQuoteAt},{now}).validationStatus,'rejected');
 assert.equal(normalizeObservation({price:10,source:'market-order-packets',seenAt:new Date(now).toISOString()},{now}).validationStatus,'provisional');
});
test('partial book preserves absent identities without claiming complete extrema',()=> {
 const book=mergePartialBook({orders:new Map([[1,{price:4372}]])},{orders:new Map([[2,{price:2999383}]])});
 assert.equal(book.orders.size,2);assert.equal(book.coverage,'partial');
});
test('Roast Pork extreme is quarantined and never contaminates median or strategies',()=> {
 const raw=JSON.parse(readFileSync(new URL('./fixtures/roast-pork-anomaly.json', import.meta.url),'utf8'));
 const sell=assessMarketSide({points:[...stable,point(raw.sell_price_min,0,{rawEvidence:raw})],now});
 assert.equal(sell.reference,4372);assert.equal(sell.validationStatus,'quarantined');assert.equal(sell.usable,false);
 const row=analyzeMarketCell({...identity, sell, buy:assessMarketSide({now}), fees,now});
 assert.equal(row.eligible,false);assert.equal(row.primary,null);assert.equal(resolveOpportunityCard(row).status,'ANOMALY');
 assert.equal(validateObservationSeries([point(4377,2),point(4367,1),point(2999383,0)],{now}).reference,4372);
});
test('weak and sparse histories never become execution references; current is excluded',()=> {
 const weak=assessMarketSide({points:[point(100,1),point(140,0)],now});assert.equal(weak.reference,100);assert.equal(weak.usable,false);
 const sparse=assessMarketSide({points:[point(100,500),point(100,200),point(140,0)],now});assert.ok(sparse.referenceLevel<3);
 const single=assessMarketSide({points:[point(100,0)],now});assert.equal(single.reference,null);
});
test('confirmed 36.4% Sell rise remains an order candidate; stale unrelated Buy is ignored',()=> {
 const sell=assessMarketSide({points:[...stable,point(5963,1),point(5963,0)],now});assert.equal(sell.usable,true);
 const buy=assessMarketSide({points:stable.map(p=>({...p,price:4100,side:'buy'})),now});
 const row=analyzeMarketCell({...identity,buy,sell,fees,now});assert.equal(row.eligible,true);assert.equal(row.primary.id,'place-sell-order');
 assert.equal(row.primary.kind,'unrealized');assert.match(row.primary.note,/gerçekleşmiş kâr değildir/);
 assert.ok(!row.strategies.some(p=>p.id==='local-flip'||p.id==='local-make'));
 assert.equal(resolveOpportunityCard(row).status,'STRATEGY');
});
test('persistent rise and fall transition symmetrically; isolated extreme cannot transition',()=> {
 for(const price of [8000,2000]) {
 const movement=Array.from({length:26},(_,i)=>point(price,75-i*3));
 const history=Array.from({length:25},(_,i)=>point(4372,150-i*2));
 const quote=validateObservationSeries([...history,...movement],{now});
 assert.equal(quote.transitions.filter(t=>t.type==='regime').length,1);assert.equal(quote.reference,price);
 }
 assert.equal(validateObservationSeries([...stable,point(2999383,0)],{now}).transitions.filter(t=>t.type==='regime').length,0);
});
test('28-day window and corrected live event conflict',()=> {
 const quote=validateObservationSeries([point(1,28*24+1),...stable,point(4372,0)],{now});assert.equal(quote.reference,4372);
 const a=point(4372,1);const corrected=applyLiveQuote([a],{...a,price:99999});
 assert.equal(validateObservationSeries(corrected,{now}).latest.validationStatus,'quarantined');
});
const dir=mkdtempSync(join(process.cwd(),'.test-observation-'));
try {
test('backup, restart, idempotent metadata migration, rollback and corruption fail closed',()=> {
 const path=join(dir,'quotes.json');const repo=new QuoteHistoryRepository({path,servers:['europe'],now});repo.record(point(4372,1),now);repo.flush(now);repo.checkpoint(now);
 const original=readFileSync(path,'utf8');
 const migrated=migrateObservationArchive(JSON.parse(original),{servers:['europe'],now});
 assert.deepEqual(migrateObservationArchive(migrated,{servers:['europe'],now}),migrated);
 assert.throws(()=>migrateObservationArchive({kind:'broken'},{servers:['europe'],now}));
 preserveArchive(path);preserveArchive(path);assert.equal(readFileSync(`${path}.pre-observation-v2.bak`,'utf8'),original);
 const restored=new QuoteHistoryRepository({path,servers:['europe'],now});restored.checkpoint(now);const twice=new QuoteHistoryRepository({path,servers:['europe'],now});assert.equal(twice.snapshot(now).series[0].buckets.length,1);
 writeFileSync(path,'bad');assert.throws(()=>new QuoteHistoryRepository({path,servers:['europe'],now}));assert.equal(readFileSync(path,'utf8'),'bad');
 writeFileSync(path,readFileSync(`${path}.pre-observation-v2.bak`));assert.equal(new QuoteHistoryRepository({path,servers:['europe'],now}).snapshot(now).series.length,1);
});
test('90-day retention, side isolation and cross-hour replay deduplication',()=> {
 const repo=new QuoteHistoryRepository({path:join(dir,'retention.json'),servers:['europe'],now});
 assert.equal(repo.record(point(100,90*24+1),now),false);
 assert.equal(repo.record(point(100,1),now),true);assert.equal(repo.record({...point(100,1),fetchedAt:new Date(now+hour).toISOString()},now+hour),false);
 assert.equal(repo.record({...point(100,0),side:'buy'},now),true);assert.equal(repo.identities(now).length,2);
 repo.recordRejected(point(-1,0),now);repo.flush(now);repo.checkpoint(now);
 const restored=new QuoteHistoryRepository({path:join(dir,'retention.json'),servers:['europe'],now});assert.equal(restored.audits.at(-1).validationStatus,'rejected');
});
} finally {rmSync(dir,{recursive:true,force:true});}
test('eligible rows precede low-confidence rows in every deterministic ordering',()=> {
 for(const mode of ['balanced','recent','importance']) assert.equal(rankMarketOpportunities([{id:'bad',eligible:false,score:999,rankScore:999,recency:1},{id:'good',eligible:true,score:1,rankScore:1,recency:.1}],{mode})[0].id,'good');
});
test('ineligible records cannot consume first 500 verified slots; counters partition evaluated cells',()=> {
 const identities=Array.from({length:601},(_,i)=>({...identity,itemId:'T4_TEST_'+i}));
 const repository={identities:()=>identities,seriesFor:id=>({source:'aodp-current',buckets: id.itemId==='T4_TEST_600' ? [...stable,point(5963,1),point(5963,0)] : [point(4372,1),point(5963,0)]}),currentQuote:()=>null};
 const scan=scanQuoteBooks({server:'europe',repository,now,fees});
 assert.equal(scan.opportunities.length,1);assert.equal(scan.opportunities[0].itemId,'T4_TEST_600');
 assert.equal(scan.counts.evaluated,scan.counts.verified+scan.counts.monitored+scan.counts.suspicious+scan.counts.insufficient);
 assert.equal(Object.values(scan.excluded).reduce((a,b)=>a+b,0),scan.funnel.filtered);
});
console.log(`${checks} observation reliability groups passed`);
