import assert from 'node:assert/strict';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import { saleHorizonTarget, SALE_ESTIMATOR, SALE_HORIZONS, mergePotentialHistory, binomialLowerBound } from '../js/core/potential-sale-horizon.mjs';
import { savePotentialSnapshots, readPotentialSnapshots, potentialPriceDecision, POTENTIAL_SNAPSHOT_KEY } from '../js/core/potential-price-snapshot.mjs';
import { tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';
const now=Date.parse('2026-10-15T12:00:00Z'), end=Math.floor(now/DAY_MS)*DAY_MS;
const request={server:'europe',city:'Brecilien',itemId:'T4_MOUNT_HORSE',quality:1,side:'sell'};
const series=fn=>({forecastPoints:Array.from({length:90},(_,i)=>({timestamp:new Date(end-(90-i)*DAY_MS).toISOString(),price:fn(i),quantity:100,intervalHours:24}))});
const flat=series(()=>100), calc=(e=flat,r=request,d=7)=>saleHorizonTarget(e,r,null,d,now);
for (const side of ['buy','sell']) for (const fn of [()=>100,i=>100+i,i=>200-i,i=>100+20*Math.sin(i),i=>i===60?10000:100]) {
    const results=SALE_HORIZONS.map(({days})=>calc(series(fn),{...request,side},days));
    assert(results.every(r=>r.price===null && !r.plannerUsable && r.fillEvidence.observedShare===null));
    const candidates=results.map(r=>r.candidatePrice).filter(p=>p!=null);
    assert(candidates.every((p,i)=>!i || (side==='sell' ? p>=candidates[i-1] : p<=candidates[i-1])));
}
assert.equal(calc().candidatePrice,100);
assert.equal(calc({forecastPoints:flat.forecastPoints.slice(-3)}).candidatePrice,null);
assert.equal(calc({...flat,forecastPoints:flat.forecastPoints.map(p=>({...p,intervalHours:1}))}).candidatePrice,null);
for (const days of [0,1,14,30,90,NaN]) assert.equal(calc(flat,request,days).price,null);
const at=end-20*DAY_MS;
assert.deepEqual(saleHorizonTarget(flat,request,null,7,at),saleHorizonTarget({forecastPoints:flat.forecastPoints.filter(p=>Date.parse(p.timestamp)+DAY_MS<=at)},request,null,7,at),'future buckets cannot change past proof');
const unavailable={forecastPoints:flat.forecastPoints.map(p=>({...p,observedAt:new Date(now+DAY_MS).toISOString()}))};
assert.equal(calc(unavailable).samples,0);
const merged=mergePotentialHistory([{source:'a',points:flat.forecastPoints},{source:'b',points:flat.forecastPoints}]);
assert.equal(merged.length,90);
assert.equal(calc({forecastPoints:[{timestamp:new Date(end-3600000).toISOString(),price:100,quantity:20,intervalHours:6}]}).samples,0);
const order={item_id:request.itemId,city:request.city,quality:1,sell_price_min:999,sell_price_min_date:new Date(now).toISOString()};
assert.equal(saleHorizonTarget({},request,order,7,now).price,null,'quotes never establish fills');
assert(binomialLowerBound(20,20)<1);
// A cohort, not a list of successful SAT mails. Outcome coverage includes losses.
const outcomes=Array.from({length:30},(_,i)=>({...request,orderId:String(i),characterGuid:'c',verified:true,fixedPrice:true,
    createdAt:new Date(end-(i+30)*DAY_MS).toISOString(),observationEnd:new Date(end-(i+1)*DAY_MS).toISOString(),
    completedAt:new Date(end-(i+29)*DAY_MS).toISOString(),quantity:10,filledQuantity:10,anchorPrice:100,limitPrice:110,status:'filled'}));
for (const side of ['buy','sell']) {
    const req={...request,side}; const calibration={...req,estimator:SALE_ESTIMATOR,heldOut:true,independent:true,days:2,quantity:1,trials:30,successes:30,evaluatedAt:new Date(now).toISOString()}; const rows=outcomes.map(o=>({...o,side,limitPrice:side==='buy'?90:110}));
    const results=SALE_HORIZONS.map(({days})=>calc({...flat,executionCalibration:calibration,orderOutcomes:rows},req,days));
    assert(results.every(r=>r.plannerUsable && r.price===(side==='buy'?90:110)));
    assert.equal(calc({...flat,executionCalibration:calibration,orderOutcomes:rows},{...req,quantity:11}).price,null,'quantity is part of execution proof');
    assert.equal(calc({...flat,executionCalibration:calibration,orderOutcomes:rows.map(o=>({...o,filledQuantity:1}))},req).price,null,'partial fills are not complete');
    assert.equal(calc({...flat,executionCalibration:calibration,orderOutcomes:rows.map(o=>({...o,status:'expired',completedAt:null}))},req).price,null);
    assert.equal(calc({...flat,executionCalibration:calibration,orderOutcomes:rows.map(o=>({...o,quality:2}))},req).price,null);
    assert.equal(calc({...flat,executionCalibration:calibration,orderOutcomes:rows.map(o=>({...o,observedAt:new Date(now+DAY_MS).toISOString()}))},req).price,null);
}
const data=new Map(), storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
for (const side of ['buy','sell']) for (const {days} of SALE_HORIZONS) {
    const req={...request,side}, target=calc(flat,req,days);
    savePotentialSnapshots(storage,[req],days,new Map([[tradeEvidenceKey(req),target]]),now);
    assert.equal(readPotentialSnapshots(storage,[req],days,now).get(tradeEvidenceKey(req)).days,days);
    assert.equal(potentialPriceDecision({...target,savedSnapshot:true},req,days,now).price,null);
}
assert.equal(Object.keys(JSON.parse(data.get(POTENTIAL_SNAPSHOT_KEY))).length,6,'BUY and SELL have independent horizons');
assert.equal(calc({...flat,orderOutcomes:outcomes}).price,null,'training fills cannot calibrate themselves');
const activeKey=JSON.stringify([tradeEvidenceKey(request),7]);
const legacyRows=JSON.parse(data.get(POTENTIAL_SNAPSHOT_KEY));
legacyRows[activeKey]={savedSnapshot:true,estimator:'old',days:7,price:999,reliable:true};
storage.setItem(POTENTIAL_SNAPSHOT_KEY,JSON.stringify(legacyRows));
savePotentialSnapshots(storage,[request],7,new Map([[tradeEvidenceKey(request),calc()]]),now);
assert(Object.entries(JSON.parse(data.get(POTENTIAL_SNAPSHOT_KEY))).some(([key,v])=>JSON.parse(key)[2]==='legacy' && v.price===999),'migration preserves original evidence');
const usable=calc({...flat,executionCalibration:{...request,estimator:SALE_ESTIMATOR,heldOut:true,independent:true,days:2,quantity:1,trials:30,successes:30,evaluatedAt:new Date(now).toISOString()},orderOutcomes:outcomes});
assert.equal(potentialPriceDecision({...usable,savedSnapshot:true},request,7,now).price,110);
assert.equal(potentialPriceDecision({...usable,savedSnapshot:true,estimator:'old'},request,7,now).price,null);
assert.equal(potentialPriceDecision({...usable,savedSnapshot:true},request,28,now).price,null);
assert.equal(SALE_ESTIMATOR,'limit-first-passage-v3');
console.log('Limit model: direction, horizons, censoring, no future leakage, availability, sparse coverage, book isolation, quantity, partial fills, failed orders, migration and Planner admission passed.');

const corrupt={getItem:()=>'{',setItem:()=>assert.fail('corrupt data must never be replaced')};
assert.throws(()=>savePotentialSnapshots(corrupt,[request],7,new Map(),now),/üzerine yazılmadı/);
