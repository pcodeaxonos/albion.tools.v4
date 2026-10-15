import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { summarizePersonalExecutions } from '../js/core/personal-price-evidence.mjs';
import { DatabaseSync } from 'node:sqlite';
import { SALE_ESTIMATOR, SALE_HORIZONS, LIMIT_ORDER_POLICY, saleHorizonTarget } from '../js/core/potential-sale-horizon.mjs';
import { saleHorizonTarget as baseline } from './fixtures/potential-price-before-rebuild.mjs';
import { findEuropeTradesFile, readTradesFile, normalizeTrades, loadLocationDisplayNames } from './sat-trades/index.mjs';
import { indexTradeEvidence, tradeEvidenceKey, tradeCityKey } from '../js/core/trade-potential-evidence.mjs';
import { normalizePriceDate, median } from '../js/core/market-primitives.mjs';
import { DAY_MS } from '../js/core/market-history-config.mjs';
const now=Date.now(), at=p=>Date.parse(normalizePriceDate(p.timestamp));
const archive=JSON.parse(await readFile('.aodp-quote-history.json','utf8'));
const db=new DatabaseSync('.albion-tools.sqlite',{readOnly:true});
const sqlite={integrity:db.prepare('PRAGMA integrity_check').get(),entries:db.prepare('SELECT count(*) AS count FROM user_data').get().count}; db.close();
const located=findEuropeTradesFile(); const {records}=readTradesFile(located.path);
const trades=normalizeTrades(records,loadLocationDisplayNames()); const personal=indexTradeEvidence({server:'europe',scope:'personal',trades});
const fillPoints=req=>(personal.get(tradeEvidenceKey({...req,city:tradeCityKey(req.city)})) ?? []).map(t=>({sourceId:t.sourceId,
    orderId:t.orderId,characterGuid:t.characterGuid,kind:t.kind,orderCreatedAt:t.orderCreatedAt,orderCompletedAt:t.orderCompletedAt,
    timestamp:t.occurredAt,price:Number(t.unitPriceSilver),quantity:Number(t.quantity)}));
const stats={totalSeries:archive.anchors.length,nonemptySeries:0,decisions:0,plannerUsable:0,reachCandidates:0,personalSeries:0};
const cells=Object.fromEntries(['buy','sell'].flatMap(side=>SALE_HORIZONS.map(({days})=>[`${side}-${days}`,{evaluated:0,candidates:0,usable:0}])));
const brief=r=>({price:r.price,candidate:r.candidatePrice,reference:r.indicativePrice,plannerUsable:r.plannerUsable,
    reach:r.reachEvidence,fill:r.fillEvidence,personal:r.personalSummary,reason:r.reason});
const long=[], examples=[];
for (const [key,row] of archive.anchors) {
    if (!row.data.length) continue;
    stats.nonemptySeries++;
    const [server,itemId,city,quality]=key.split('|');
    const req={server,itemId,city,quality:Number(quality)};
    const forecastPoints=row.data.map(p=>({...p,price:p.avg_price,quantity:p.item_count}));
    const personalForecastPoints=fillPoints({...req,side:'sell'});
    if (personalForecastPoints.length) stats.personalSeries++;
    if (forecastPoints.length>=35) long.push({req,forecastPoints});
    const evidence={forecastPoints};
    for (const side of ['buy','sell']) for (const {days} of SALE_HORIZONS) {
        const request={...req,side}, result=saleHorizonTarget({...evidence,personalForecastPoints:side==='sell'?personalForecastPoints:fillPoints(request)},request,null,days,now);
        stats.decisions++; stats.plannerUsable+=Number(result.plannerUsable); stats.reachCandidates+=Number(result.candidatePrice!=null);
        const cell=cells[`${side}-${days}`];cell.evaluated++;cell.candidates+=Number(result.candidatePrice!=null);cell.usable+=Number(result.plannerUsable);
        if (itemId==='T4_MOUNT_HORSE' && city==='Brecilien' && Number(quality)===1 && server==='europe') examples.push({request,days,...brief(result)});
    }
}
console.log('Current archive scan:',stats);
const walk=[], metrics=Object.fromEntries(Object.keys(cells).map(k=>[k,{trials:0,candidates:0,coveredCandidates:0,hits:0,uncovered:0,oldTargets:0,oldCoveredTargets:0,oldHits:0,fillTrials:0,strictCandidates:0}]));
for (const {req,forecastPoints} of long) {
    const sorted=[...forecastPoints].sort((a,b)=>at(a)-at(b));
    for (let i=28;i<sorted.length-2;i+=7) {
        const cutoff=at(sorted[i]);
        const past=sorted.filter(p=>at(p)+DAY_MS<=cutoff);
        for (const side of ['buy','sell']) for (const {days} of SALE_HORIZONS) {
            const request={...req,side}, future=sorted.filter(p=>at(p)>=cutoff && at(p)<cutoff+days*DAY_MS);
            if (cutoff+days*DAY_MS>now) continue;
            const evidence={forecastPoints:past,personalForecastPoints:fillPoints(request).filter(p=>at(p)<cutoff)};
            const strict=saleHorizonTarget(evidence,request,null,days,cutoff);
            assert.deepEqual(strict,saleHorizonTarget({forecastPoints:sorted,personalForecastPoints:fillPoints(request)},request,null,days,cutoff));
            // Explicitly separate retrospective revised-history exploration from
            // the strict availability test. This is not a point-in-time replay.
            const revised={...evidence,forecastPoints:past.map(({fetchedAt,observedAt,availableAt,...p})=>p)};
            const result=saleHorizonTarget(revised,request,null,days,cutoff), old=baseline(revised,request,null,days,cutoff);
            const covered=new Set(future.map(p=>Math.floor(at(p)/DAY_MS))).size===days;
            const hit=price=>price!=null && future.some(p=>side==='sell'?p.price>=price:p.price<=price);
            const m=metrics[`${side}-${days}`];m.trials++;m.candidates+=Number(result.candidatePrice!=null);
            m.strictCandidates+=Number(strict.candidatePrice!=null);m.oldTargets+=Number(old.price!=null);
            m.oldCoveredTargets+=Number(covered && old.price!=null);m.uncovered+=Number(!covered);m.coveredCandidates+=Number(covered && result.candidatePrice!=null);
            m.hits+=Number(covered && hit(result.candidatePrice));m.oldHits+=Number(covered && hit(old.price));
            walk.push({request,at:new Date(cutoff).toISOString(),days,coveredDays:future.length,covered,
                old:old.price,candidate:result.candidatePrice,price:result.price,strictCandidate:strict.candidatePrice,
                averageLevelReached:covered && result.candidatePrice!=null ? hit(result.candidatePrice) : null,
                deviation:result.candidatePrice==null || !future.length ? null : (side==='sell'?Math.max(...future.map(p=>p.price)):Math.min(...future.map(p=>p.price)))/result.candidatePrice-1,
                filled:null});
        }
    }
}
const eligible=[...long].map(r=>({...r,volume:r.forecastPoints.reduce((s,p)=>s+p.quantity,0),
    trend:r.forecastPoints.at(-1).price/r.forecastPoints[0].price-1,
    volatility:median(r.forecastPoints.slice(1).map((p,i)=>Math.abs(Math.log(p.price/r.forecastPoints[i].price))))}));
const strata={highVolume:[...eligible].sort((a,b)=>b.volume-a.volume)[0],lowVolume:[...eligible].sort((a,b)=>a.volume-b.volume)[0],
    rising:[...eligible].sort((a,b)=>b.trend-a.trend)[0],falling:[...eligible].sort((a,b)=>a.trend-b.trend)[0],
    volatile:[...eligible].sort((a,b)=>b.volatility-a.volatility)[0],withoutPersonal:eligible.find(r=>!fillPoints({...r.req,side:'sell'}).length)};
const representatives=Object.entries(strata).map(([kind,r])=>({kind,request:r.req,volume:r.volume,trend:r.trend,volatility:r.volatility,
    results:['buy','sell'].flatMap(side=>SALE_HORIZONS.map(({days})=>({side,days,...brief(saleHorizonTarget({forecastPoints:r.forecastPoints,
        personalForecastPoints:fillPoints({...r.req,side})},{...r.req,side},null,days,now))})))}));
const horseUnknown=trades.filter(t=>t.itemId==='T4_MOUNT_HORSE' && tradeCityKey(t.locationName)==='brecilien' && ['mail_sell','instant_sell'].includes(t.kind) && t.quality==null && Date.parse(t.occurredAt)<=now && Date.parse(t.occurredAt)>=now-90*DAY_MS);
const horseUnknownSummary=summarizePersonalExecutions(horseUnknown.map(t=>({sourceId:t.sourceId,timestamp:t.occurredAt,price:Number(t.unitPriceSilver),quantity:Number(t.quantity)})),now);
const horse=examples.find(r=>r.request.side==='sell');
let priorHorse = null;
try {
    const previous = JSON.parse(await readFile('output/sell-horizons-comparison.json','utf8'));
    const value = previous.rows.find(r=>r.city==='Brecilien')?.results.find(r=>r.days===28)?.after;
    if (value) priorHorse = { source:'output/sell-horizons-comparison.json', price:value.price,
        initialCandidate:value.initialCandidatePrice, selected:value.candidateAssessments?.find(a=>a.accepted),
        meaning:'Eski motor %5 destek bandıyla 37001 ve 37472 ortalamalarını 38484 için yeterli sayıyordu; bunlar 38484 dolumları değildir.' };
} catch { /* Historical diagnostic is optional; live raw sources remain authoritative. */ }
const report={estimator:SALE_ESTIMATOR,baseline:'Frozen tracked HEAD supported-window-price-v2.1-personal; audit only',asOf:new Date(now).toISOString(),policy:LIMIT_ORDER_POLICY,sqlite,
    sources:['.aodp-quote-history.json (read-only anchors)',located.path,'.albion-tools.sqlite (read-only integrity)'],stats,cells,
    longHistorySeries:long.length,metrics,representatives,horse:examples,
    horseInvestigation:{personal:horse?.personal,qualityUnknown:horseUnknownSummary,qualityUnknownBand:horseUnknown.filter(t=>t.unitPriceSilver>=50000 && t.unitPriceSilver<=57000).map(t=>({at:t.occurredAt,price:t.unitPriceSilver,quantity:t.quantity})),qualityReason:'Canonical catalog maxQualityLevel=5; missing SAT mail quality cannot be resolved to quality 1.',prior38484:priorHorse,
        conclusion:'50-57 bin bandı ve tekil tepe kişisel fiyat kanıtıdır. Süre ve başarısız emirler olmadan 28 günlük gerçekleşme hedefi yapılamaz.'},
    limitations:['Strict replay honors fetchedAt/observedAt/availableAt; archive revisions before their retrieval are unavailable.',
        'Retrospective candidates strip retrieval dates only in a separately labelled exploratory analysis, never a production decision.',
        'Average-level reaches are not individual maximum/minimum prices or fills. item_count is quantity, not independent trades.',
        'No complete fixed-price order cohort: no measured fill probability, calibration, queue/depth model or Planner price.',
        'Risk thresholds are declared policy requirements; they have not been calibrated to real order outcomes.',
        'Daily paths overlap; independent 28-day blocks and censor counts are reported. No missing day is zero-filled.'],walk};
await writeFile('output/limit-order-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({stats,long:long.length,metrics,horse:horse?.personal},null,2));
