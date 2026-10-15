import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { saleHorizonTarget, SALE_HORIZONS } from '../js/core/potential-sale-horizon.mjs';
import { saleHorizonTarget as previous } from './fixtures/potential-sale-horizon-v2.1.mjs';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import { findEuropeTradesFile, readTradesFile, normalizeTrades, loadLocationDisplayNames } from './sat-trades/index.mjs';
import { potentialTradeSnapshot } from './sat-trades/potential-snapshot.mjs';
import { indexTradeEvidence, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';
import { savePotentialSnapshots, readPotentialSnapshots } from '../js/core/potential-price-snapshot.mjs';
const now = Date.parse('2026-10-15T12:00:00Z');
const request = {server:'europe', city:'Martlock', itemId:'T4_MOUNT_HORSE', quality:1, side:'sell'};
const fills = Array.from({length:3}, (_,i)=>({sourceId:String(i), orderId:String(i), kind:'mail_sell', source:'Kişisel',
    timestamp:new Date(now-(i+1)*DAY_MS).toISOString(), price:140, quantity:100}));
const market = Array.from({length:90}, (_,i)=>({timestamp:new Date(now-(i+1)*DAY_MS).toISOString(), price:100, quantity:1000}));
for (const {days} of SALE_HORIZONS) {
    const result=saleHorizonTarget({forecastPoints:market,personalForecastPoints:fills},request,null,days,now);
    assert.equal(result.price,140); assert.equal(result.personalImpact.delta,40);
    assert.equal(result.marketEvidence.price,100); assert.equal(result.personalSummary.quantity,300);
    assert.equal(previous({forecastPoints:market,personalForecastPoints:fills},request,null,days,now).price,100);
    const storageValues=new Map(), storage={getItem:k=>storageValues.get(k),setItem:(k,v)=>storageValues.set(k,v)};
    savePotentialSnapshots(storage,[request],days,new Map([[tradeEvidenceKey(request),result]]),now);
    assert.equal(readPotentialSnapshots(storage,[request],days,now).get(tradeEvidenceKey(request)).price,140);
}
const calc=points=>saleHorizonTarget({forecastPoints:market,personalForecastPoints:points},request,null,7,now);
assert.equal(calc([...fills,...fills]).personalSummary.fills,3);
assert.equal(calc(fills.map(p=>({...p,orderId:'same'}))).price,100,'partial fills of one order are not independent');
assert.equal(calc(fills.slice(0,1)).price,100);
const sparsePersonal=saleHorizonTarget({personalForecastPoints:fills.slice(0,1)},request,null,7,now);
assert.equal(sparsePersonal.price,null); assert.equal(sparsePersonal.indicativePrice,140,'sparse verified personal price remains a visible reference');
assert.equal(calc(fills.map((p,i)=>({...p,quantity:i===0?100000:1}))).price,100,'one large fill cannot set target');
assert.equal(calc(fills.map(p=>({...p,timestamp:new Date(now-20*DAY_MS).toISOString()}))).price,100,'old prices cannot win');
assert.equal(calc(fills.map(p=>({...p,price:1000}))).price,100,'extreme regime conflict requires review');
assert.equal(calc(fills.map(p=>({...p,orderId:null}))).personalSummary.independentOrders,0);
assert.equal(calc(fills.flatMap(p=>Array.from({length:10},(_,i)=>({...p,orderId:null,sourceId:p.sourceId+'-'+i})))).personalSummary.independentUnits,3);
const timed=fills.map(p=>({...p,orderCreatedAt:new Date(Date.parse(p.timestamp)-3*DAY_MS).toISOString(),orderCompletedAt:p.timestamp}));
assert.equal(saleHorizonTarget({personalForecastPoints:timed},request,null,2,now).price,null);
assert.equal(saleHorizonTarget({personalForecastPoints:timed},request,null,7,now).personalSummary.durationSamples,3);
assert.equal(calc(fills).personalSummary.durationSamples,0);
assert.equal(saleHorizonTarget({personalForecastPoints:fills},request,{item_id:request.itemId,city:request.city,quality:1,
    sell_price_min:10,sell_price_min_date:new Date(now).toISOString()},7,now).price,null,'live book conflict is checked even without public history');
assert.equal(saleHorizonTarget({forecastPoints:market.slice(20),personalForecastPoints:fills},request,null,7,now).price,140,'stale public averages cannot veto current repeated personal evidence');

const located=findEuropeTradesFile({localAppData:process.env.LOCALAPPDATA_REAL ?? 'C:/Users/Pcodea/AppData/Local'});
const {records}=readTradesFile(located.path), trades=normalizeTrades(records,loadLocationDisplayNames());
const snapshot={server:'europe',scope:'personal',trades};
const index=indexTradeEvidence(snapshot), comparisons=[];
for(const [key,rows] of index) {
    const [server,city,itemId,quality,side]=JSON.parse(key), req={server,city,itemId,quality,side};
    const forecastPoints=rows.map(t=>({sourceId:t.sourceId,orderId:t.orderId,kind:t.kind,characterGuid:t.characterGuid,
        timestamp:t.occurredAt,price:Number(t.unitPriceSilver),quantity:Number(t.quantity),source:'Kişisel'}));
    for(const {days} of SALE_HORIZONS) {
        const evidence={kind:'executions',forecastPoints}, before=previous(evidence,req,null,days,now), after=saleHorizonTarget(evidence,req,null,days,now);
        const connectedBefore=previous({kind:'executions',forecastPoints:forecastPoints.filter(p=>!p.kind.startsWith('mail_'))},req,null,days,now);
        if(after.personalSummary.fills) comparisons.push({itemId,city,side,days,before:before.price,connectedBefore:connectedBefore.price,after:after.price,
            plannerUsable:after.plannerUsable,reason:after.reason,summary:after.personalSummary,
            previousSourceEligible:rows.some(t=>!t.kind.startsWith('mail_')), publicMarketCompared:false});
    }
}
const mail=trades.filter(t=>t.kind==='mail_buy'||t.kind==='mail_sell');
const recoveredMail=mail.find(t=>t.quality===1&&t.locationName&&Date.parse(t.occurredAt)<=now&&Date.parse(t.occurredAt)>now-90*DAY_MS);
assert(recoveredMail);
const recoveredScope=potentialTradeSnapshot(snapshot,{server:'europe',items:[recoveredMail.itemId],locations:[recoveredMail.locationName],qualities:[1],days:90,now});
assert([...indexTradeEvidence(recoveredScope).values()].flat().some(t=>t.sourceId===recoveredMail.sourceId),'recovered mail passes the actual filtered hub adapter and index');
const sample=trades.find(t=>t.orderId&&t.quality);
if(sample) {
    const scope={server:'europe',items:[sample.itemId],locations:[sample.locationName],qualities:[sample.quality],days:1000,now};
    assert(potentialTradeSnapshot(snapshot,scope).trades.some(t=>t.orderId===sample.orderId));
}
assert(mail.some(t=>t.quality===1));
const catalog=JSON.parse(await readFile('data/items.json','utf8'));
for(const trade of mail.filter(t=>t.quality!=null)) assert.equal(catalog.find(i=>i.uniqueName===trade.itemId)?.maxQualityLevel,1);
const report={now:new Date(now).toISOString(),source:located.path,totalRecords:records.length,
    mailRecords:mail.length,recoveredSingleQualityMail:mail.filter(t=>t.quality===1).length,
    unresolvedQualityMail:mail.filter(t=>t.quality==null).length,
    usable:comparisons.filter(r=>r.plannerUsable).length,
    note:'Read-only real SAT archive; personal-only comparison isolates contribution, no invented public prices or durations.',comparisons};
await writeFile('output/personal-potential-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,comparisons:comparisons.filter(r=>r.plannerUsable).slice(0,9)},null,2));
console.log('Personal evidence tests passed: order grouping, sparse/repeated/dominant/stale/conflicting evidence, timings, snapshot/planner and real archive.');
