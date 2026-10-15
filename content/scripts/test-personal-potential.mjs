import assert from 'node:assert/strict';
import { summarizePersonalExecutions } from '../js/core/personal-price-evidence.mjs';
import { saleHorizonTarget } from '../js/core/potential-sale-horizon.mjs';
import { indexTradeEvidence, tradeEvidenceKey, localTradeEvidence } from '../js/core/trade-potential-evidence.mjs';
import { potentialTradeSnapshot } from './sat-trades/potential-snapshot.mjs';
const now=Date.parse('2026-10-15T12:00:00Z'), day=86400000;
const request={server:'europe',city:'Brecilien',itemId:'T4_MOUNT_HORSE',quality:1,side:'sell'};
const fills=Array.from({length:6},(_,i)=>({sourceId:`fill-${i}`,orderId:i<3?'same-order':String(i),characterGuid:'a',
    timestamp:new Date(now-(i+1)*day).toISOString(),price:i===5?74978:50000+i*1000,quantity:50}));
const summary=summarizePersonalExecutions([...fills,...fills],now);
assert.equal(summary.fills,6);assert.equal(summary.independentOrders,4);assert.equal(summary.quantity,300);
assert.equal(summary.maxPrice,74978);assert.equal(summary.durationSamples,0);
assert.equal(summarizePersonalExecutions(fills.map(p=>({...p,characterGuid:p.sourceId})),now).independentOrders,6);
assert.equal(summarizePersonalExecutions(fills.map(p=>({...p,quantity:null})),now).fills,0);
for(const side of ['buy','sell']) for(const days of [2,7,28]) {
    const r=saleHorizonTarget({personalForecastPoints:fills},{...request,side},null,days,now);
    assert.equal(r.price,null);assert.equal(r.fillEvidence.observedShare,null);
    assert.equal(r.personalSummary.maxPrice,74978);
}
const trades=fills.map(p=>({sourceId:p.sourceId,orderId:p.orderId,characterGuid:p.characterGuid,scope:'personal',
    kind:'mail_sell',server:'europe',itemId:request.itemId,locationName:request.city,quality:1,
    occurredAt:p.timestamp,quantity:p.quantity,unitPriceSilver:p.price}));
const snapshot={server:'europe',scope:'personal',trades};
const scoped=potentialTradeSnapshot(snapshot,{server:'europe',items:[request.itemId],locations:[request.city],qualities:[1],days:90,now});
assert.equal(indexTradeEvidence(scoped).get(tradeEvidenceKey({...request,city:'brecilien'})).length,6);
for(const patch of [{quality:null},{scope:'market'},{kind:'mail_sell_expired'},{server:'west'}]) {
    const index=indexTradeEvidence({...snapshot,trades:trades.map(t=>({...t,...patch}))});
    assert.equal(index.get(tradeEvidenceKey({...request,city:'brecilien'}))?.length ?? 0,0);
}
const capacity=localTradeEvidence(indexTradeEvidence(snapshot),request,7,now);
assert.equal(capacity.volume,300,'existing personal capacity remains quantity, not trade count');
console.log('Personal evidence: deduplication, partial-order grouping, character scope, missing quality, identity, duration unknown, all BUY/SELL horizons, Hub adapter and preserved capacity passed.');
