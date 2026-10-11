import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {validateObservationSeries,OBSERVATION_POLICY} from '../js/core/market-observation.mjs';
import {assessMarketSide} from '../js/core/market-opportunities.mjs';
import {scanQuoteBooks} from '../js/core/market-opportunity-scan.mjs';
import {OrderPriceHistory} from '../js/core/order-price-history.mjs';
import {AODP_HISTORY_POLICY} from '../js/core/market-history-config.mjs';
import {migrateObservationArchive} from './migrate-market-observations.mjs';
import {QuoteHistoryRepository} from './quote-history-repository.mjs';
const realFixture=JSON.parse(readFileSync(new URL('./fixtures/market-evidence-bootstrap.json',import.meta.url)));
const now=Date.parse(realFixture.asOf),hour=3600000;
const rates=new Map(JSON.parse(readFileSync('data/economy-constants.json')).map(r=>[r.key,Number(r.value)]));
const fees={setupFeeRate:rates.get('setup_fee'),taxPremiumRate:rates.get('tax_premium'),taxFreeRate:rates.get('tax_free')};
const id={server:'europe',itemId:'T4_REGRESSION',city:'Martlock',quality:1,side:'sell'};
// Synthetic points below are unit-test fixtures only; never written to production data.
const point=(price,ago,extra={})=>({...id,price,source:'aodp-current',sourceQuoteAt:new Date(now-ago*hour).toISOString(),fetchedAt:new Date(now).toISOString(),...extra});
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
test('all confidence and mature-regime policy thresholds unchanged',()=>{const old=realFixture.policy;for(const [key,value] of Object.entries(old))assert.deepEqual(OBSERVATION_POLICY[key],value,key)});
test('unknown and partial local evidence cannot shadow credible current; no fixed source ranking',()=>{
 const stable=Array.from({length:13},(_,i)=>point(1000,30-i*2));
 const partial=point(2000,0,{source:'market-order-packets',coverage:'partial',sourceTimeKnown:true});
 const unknown={...partial,coverage:'unknown',sourceTimeKnown:false,seenAt:new Date(now).toISOString()};
 for(const p of [partial,unknown]) {const q=validateObservationSeries([...stable,p],{now});assert.equal(q.latest.price,1000);assert.ok(q.sourceDecisions.some(d=>d.reasons.includes('source-ineligible')));}
 const guessed={...partial,sourceQuoteAt:undefined,observedAt:undefined,seenAt:new Date(now).toISOString(),coverage:'complete'};
 assert.equal(validateObservationSeries([...stable,guessed],{now}).latest.source,'aodp-current');
 const coincident = {...stable.at(-1),source:'market-order-packets',price:99999,coverage:'partial',sourceTimeKnown:true};
 assert.equal(validateObservationSeries([...stable,coincident],{now}).latest.validationStatus,'accepted');
 const full=point(1001,0,{source:'market-order-packets',coverage:'complete',sourceTimeKnown:true});
 assert.equal(validateObservationSeries([...stable,full],{now}).latest.source,'market-order-packets');
 const quarantined=validateObservationSeries([...stable,point(99999,0)],{now});assert.equal(quarantined.latest.price,99999);assert.equal(quarantined.executionConfidence,0);
 const stale=assessMarketSide({points:[point(1000,10),unknown],now});assert.equal(stale.stale,true);assert.equal(stale.executionConfidence,0);
});
test('conflicts are monotonic across retries and source aliases',()=>{
 for(const points of [[point(1000,2),point(2000,2),point(1000,2)],[point(1000,2,{evidenceId:'A'}),point(2000,2,{source:'market-order-packets',coverage:'complete',sourceTimeKnown:true,evidenceId:'B'}),point(1000,2,{evidenceId:'C'})]]) {
 const q=validateObservationSeries(points,{now});assert.equal(q.observations.length,1);assert.equal(q.latest.validationStatus,'quarantined');assert.deepEqual(q.latest.reasons,['conflicting-event']);}
});
test('confirmed movement joins later references; latest never validates its own baseline',()=>{
 const points=[point(499,65),point(362,60),point(362,58)];const q=validateObservationSeries(points,{now});assert.equal(q.reference,499);assert.equal(q.samples,1);
 const next=validateObservationSeries([...points,point(362,56)],{now});assert.equal(next.samples,3);assert.equal(next.reference,362);
 const only=validateObservationSeries([point(1000,2),point(2000,1)],{now});assert.equal(only.samples,1);assert.equal(only.reference,1000);assert.equal(only.latest.validationStatus,'quarantined');
});
test('bootstrap does not anchor to first outlier; mature transitions retain 24/72 thresholds',()=>{
 for(const price of [700,1400]) {
 const q=validateObservationSeries([point(1000,65),...Array.from({length:14},(_,i)=>point(price,60-i*4))],{now});assert.equal(q.level,3);assert.equal(q.reference,price);assert.ok(q.transitions.some(t=>t.type==='bootstrap'));assert.equal(q.transitions.filter(t=>t.type==='regime').length,0);
 }
 const stable=Array.from({length:25},(_,i)=>point(1000,180-i*3));
 const short=Array.from({length:23},(_,i)=>point(1400,75-i*3));
 assert.equal(validateObservationSeries([...stable,...short],{now}).transitions.filter(t=>t.type==='regime').length,0);
 for(const price of [1400,600]) {const move=Array.from({length:26},(_,i)=>point(price,75-i*3));const q=validateObservationSeries([...stable,...move],{now});const t=q.transitions.find(t=>t.type==='regime');assert.equal(t.from,1000);assert.equal(t.to,price);assert.ok(t.evidence.length>=24);assert.equal(q.reference,price);}
});
test('cache invalidates on explicit evidence revision and advancing length',()=>{
 const points=[point(1000,2),point(1000,1)];const first=validateObservationSeries(points,{now,revision:1});points[1]=point(99999,1);const second=validateObservationSeries(points,{now,revision:2});assert.notEqual(second,first);assert.equal(second.latest.validationStatus,'quarantined');points.push(point(1000,0));assert.equal(validateObservationSeries(points,{now,revision:2}).latest.price,1000);
});
const dir=mkdtempSync(join(process.cwd(),'.test-evidence-lifecycle-'));
try {
 test('same fetch hour source events recover, dedupe, invalidate scan and survive checkpoint/restart',()=>{
 const repo=new QuoteHistoryRepository({path:join(dir,'quotes.json'),servers:['europe'],now});
 const a=point(1000,1.75,{fetchedAt:new Date(now-1.25*hour).toISOString()});
 const b=point(1000,1.4,{fetchedAt:new Date(now-1.1*hour).toISOString()});
 assert.equal(repo.record(a,now),true);const rev=repo.seriesRevision(id);assert.equal(repo.record(b,now),false);assert.ok(repo.seriesRevision(id)>rev);
 const bucket=repo.seriesFor(id,now).buckets[0];assert.equal(bucket.evidenceObservations.length,1);assert.equal(bucket.price,1000);
 repo.record(b,now);assert.equal(repo.seriesFor(id,now).buckets[0].evidenceObservations.length,1);
 repo.flush(now);repo.checkpoint(now);const restored=new QuoteHistoryRepository({path:join(dir,'quotes.json'),servers:['europe'],now});assert.deepEqual(restored.snapshot(now),repo.snapshot(now));
 const migration=migrateObservationArchive(restored.history.snapshot(now),{servers:['europe'],now});
 assert.deepEqual(migrateObservationArchive(migration,{servers:['europe'],now}),migration);assert.equal(migration.series[0].buckets[0].evidenceObservations.length,1);
 const corrupt=JSON.parse(JSON.stringify(restored.history.snapshot(now)));corrupt.series[0].buckets[0].evidenceObservations[0].city='wrong-city';
 assert.throws(()=>new OrderPriceHistory({servers:['europe'],source:'aodp-current',policy:AODP_HISTORY_POLICY}).restore(corrupt,now),/Invalid supplemental/);
 const scan=scanQuoteBooks({server:'europe',repository:restored,now,fees,includeEvaluation:true});assert.equal(scan.evaluation.snapshots[0].sell.referenceSamples,1);
 restored.record({...b,price:2000},now);restored.record(b,now);restored.flush(now);restored.checkpoint(now);
 const restarted=new QuoteHistoryRepository({path:join(dir,'quotes.json'),servers:['europe'],now});
 const crossHour=new QuoteHistoryRepository({path:join(dir,'cross-hour.json'),servers:['europe'],now});crossHour.record(a,now);crossHour.record(b,now);
 crossHour.record({...b,price:2000,fetchedAt:new Date(now+hour).toISOString()},now+hour);crossHour.record({...b,fetchedAt:new Date(now+hour).toISOString()},now+hour);crossHour.flush(now+hour);crossHour.checkpoint(now+hour);
 const crossHourRestart=new QuoteHistoryRepository({path:join(dir,'cross-hour.json'),servers:['europe'],now:now+hour});
 assert.equal(scanQuoteBooks({server:'europe',repository:crossHourRestart,now:now+hour,fees,includeEvaluation:true}).evaluation.snapshots[0].sell.executionConfidence,0);
 const conflicting=scanQuoteBooks({server:'europe',repository:restarted,now,fees,includeEvaluation:true});assert.equal(conflicting.evaluation.snapshots[0].sell.executionConfidence,0);assert.ok(conflicting.evaluation.snapshots[0].sell.validationReasons.includes('conflicting-event'));
 restored.record(point(99999,0),now);const after=scanQuoteBooks({server:'europe',repository:restored,now,fees,includeEvaluation:true});assert.equal(after.evaluation.snapshots[0].sell.validationStatus,'quarantined');
 });
} finally {assert.ok(resolve(dir).startsWith(process.cwd()+String.fromCharCode(92)));rmSync(dir,{recursive:true,force:true});}
test('audited real bootstrap series now has mature reference using original timestamps',()=>{
 for(const row of realFixture.series) {
 const {timeline,before,id,...identity}=row;
 const q=validateObservationSeries(timeline.map(point=>({...identity,...point})),{now});
 assert.ok(q.level>=3);assert.notEqual(q.reference,row.before.reference);assert.ok(q.referenceEvidence.length>=12);
 }
});
console.log(checks+' evidence lifecycle groups passed');
