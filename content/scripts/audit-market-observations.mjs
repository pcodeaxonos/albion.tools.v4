import { readFileSync, mkdirSync } from 'node:fs';
import { writeAuditJson } from './market-audit-artifacts.mjs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { AODP_HISTORY_POLICY, PRICE_STALE_MS } from '../js/core/market-history-config.mjs';
import { marketSeriesKey, median } from '../js/core/market-primitives.mjs';
const baselineStrategyPolicy = Boolean(process.env.AUDIT_SCAN_MODULE);
const { scanQuoteBooks, readMarketBook } = await import(process.env.AUDIT_SCAN_MODULE || '../js/core/market-opportunity-scan.mjs');
import { OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { normalizeObservation, validateObservationSeries, OBSERVATION_POLICY } from '../js/core/market-observation.mjs';
import { STRATEGY_SPECS } from '../js/core/opportunity-status.mjs';
const input=process.env.AUDIT_INPUT || 'docs/market-observation-audit',out=process.env.AUDIT_OUTPUT||'docs/market-observation-fix/optimized';
mkdirSync(out,{recursive:true});
const frozen=JSON.parse(gunzipSync(readFileSync(`${input}/snapshot.json.gz`)));
const manifest=JSON.parse(readFileSync(`${input}/snapshot-manifest.json`));
const previous=JSON.parse(frozen['docs/market-observation-shadow.json']);
const archive=JSON.parse(frozen['.aodp-quote-history.json']);
const packets=JSON.parse(frozen['.price-order-history.json']);
const transactions=frozen['.aodp-quote-history.json.journal'].split('\n').filter(Boolean).map(line=>JSON.parse(line));
const servers=JSON.parse(readFileSync('data/price-servers.json')).map(row=>row.code);
const catalog=new Map(JSON.parse(readFileSync('data/items.json')).map(row=>[row.uniqueName,row.localizedName]));
const rates=JSON.parse(readFileSync('data/economy-constants.json'));
const rate=key=>Number(rates.find(row=>row.key===key).value);
const fees={setupFeeRate:rate('setup_fee'),taxPremiumRate:rate('tax_premium'),taxFreeRate:rate('tax_free')};
const key=row=>`${row.itemId}|${row.city}|${row.quality}`;
function load(now,{journal=false}={}) {
 const packetHistory=new OrderPriceHistory({servers});
 const historicalPackets={...packets,series:packets.series.map(row=>({...row,buckets:row.buckets.filter(point=>Date.parse(point.seenAt)<=now)}))};
 packetHistory.restore(historicalPackets,now);
 const repository=Object.create(QuoteHistoryRepository.prototype);
 Object.assign(repository,{history:new OrderPriceHistory({servers,source:'aodp-current',policy:AODP_HISTORY_POLICY}),anchors:new Map(archive.anchors),current:new Map(archive.current),audits:[],sequence:archive.sequence,pending:[],policy:{}});
 repository.history.restore(archive.history,now);
 if(process.argv.includes('--without-supplemental-evidence'))repository.history.recordEvidence=()=>false;
 if(journal)for(const tx of transactions){if(tx.sequence<=repository.sequence)continue;if(Date.parse(tx.writtenAt)>now)break;if(tx.sequence!==repository.sequence+1)throw new Error('Journal gap');for(const event of tx.events)repository.apply(event,now);repository.sequence=tx.sequence;}
 repository.prune(now);
 return {packetHistory,repository,now,server:'europe',fees};
}
function scans(inputs) {
 const start=performance.now();
 const old=scanQuoteBooks({...inputs,includeEvaluation:true,policy:{...OPPORTUNITY_POLICY,validationMode:'legacy'}});
 const validatedStart=performance.now();
 const next=scanQuoteBooks({...inputs,includeEvaluation:true});
 const validatedColdMs=performance.now()-validatedStart;
 const warmStart=performance.now();
 const warm=scanQuoteBooks({...inputs,includeEvaluation:true});
 const validatedWarmMs=performance.now()-warmStart;
 if(JSON.stringify(warm.evaluation)!==JSON.stringify(next.evaluation))throw new Error('Cold/warm decision mismatch');
 return {old,next,validatedColdMs,validatedWarmMs,elapsedMs:performance.now()-start};
}
const previousNow=Date.parse(previous.results.find(row=>row.server==='europe').scannedAt);
const oldInputs=load(previousNow), original=scans(oldInputs);
const now=Date.parse(manifest.asOf),liveInputs=load(now,{journal:true}),live=scans(liveInputs);
const newOriginal=new Map(original.next.evaluation.snapshots.map(row=>[key(row),row]));
const newLive=new Map(live.next.evaluation.snapshots.map(row=>[key(row),row]));
const liveRows=new Map(live.next.evaluation.rows.map(row=>[row.id,row]));
function compact(side) {return {price:side?.price??null,source:side?.source??null,at:side?.at??null,ageHours:side?.ageMs==null?null:side.ageMs/3600000,reference:side?.reference??null,samples:side?.referenceSamples??0,spanHours:(side?.referenceSpanMs??0)/3600000,stability:side?.stability??0,referenceLevel:side?.referenceLevel??0,referenceConfidence:side?.referenceConfidence??0,executionConfidence:side?.executionConfidence??0,validationStatus:side?.validationStatus??null,reasons:side?.validationReasons??[],deviation:side?.deviation??null,confirmed:side?.confirmed??false,usable:side?.usable??false,sourceDecisions:side?.sourceDecisions??[],referenceEvidence:side?.referenceEvidence??[],transitions:side?.transitions??[]};}
function gates(row,snap,map,rows=liveRows) {
 const strategy=row.primary;
 const required=(STRATEGY_SPECS[strategy?.id]?.inputs||[]).map(side=>({side,data:side==='destination'?map.get(`${row.itemId}|${strategy.toCity}|${row.quality}`)?.buy:snap?.[side]}));
 const failures={reference:[],execution:[],freshness:[],quarantine:[],other:[]};
 for(const {side,data} of required){
  if((baselineStrategyPolicy || STRATEGY_SPECS[strategy?.id]?.group === 'historical') && (!data || !(data.referenceLevel>=3)))failures.reference.push(side);
  if(!data || data.executionConfidence!==1)failures.execution.push(side);
  if(!data || !Number.isFinite(data.ageMs) || data.ageMs>PRICE_STALE_MS)failures.freshness.push(side);
  if(data?.validationStatus==='quarantined')failures.quarantine.push(side);
  if(STRATEGY_SPECS[strategy?.id]?.group === 'historical' && data && Math.abs(data.deviation||0)>=OBSERVATION_POLICY.extreme)failures.other.push(`${side}:extreme-price`);
 }
 if(required.every(({data})=>!baselineStrategyPolicy && STRATEGY_SPECS[strategy?.id]?.group === 'orders' ? data?.executionConfidence===1 : data?.usable) && !rows.get(row.id)?.strategies?.some(candidate=>candidate.id===strategy?.id && candidate.weight>0))failures.other.push('strategy-no-longer-profitable-or-anomalous');
 const failed=Object.entries(failures).filter(([,values])=>values.length).map(([name])=>name);
 return {strategy:strategy?.id,required:required.map(({side,data})=>({side,...compact(data)})),failures,failed,multiple:failed.length>1};
}
const candidates=original.old.evaluation.rows.map(row=>({id:row.id,itemId:row.itemId,product:catalog.get(row.itemId)||row.itemId,city:row.city,quality:row.quality,strategy:row.primary?.id,strategyLabel:row.primary?.label,
 original:{old:{buy:compact(row.buy),sell:compact(row.sell)},new:{buy:compact(newOriginal.get(row.id)?.buy),sell:compact(newOriginal.get(row.id)?.sell)},gates:gates(row,newOriginal.get(row.id),newOriginal,new Map(original.next.evaluation.rows.map(row=>[row.id,row])))},
 journalSnapshot:{buy:compact(newLive.get(row.id)?.buy),sell:compact(newLive.get(row.id)?.sell),gates:gates(row,newLive.get(row.id),newLive),eligible:liveRows.get(row.id)?.eligible??false}}));
const gateCounts=rows=>{const inclusive={},exclusive={},combinations={};for(const row of rows){const names=row.failed;for(const name of names)inclusive[name]=(inclusive[name]||0)+1;if(names.length===1)exclusive[names[0]]=(exclusive[names[0]]||0)+1;const combination=names.join('+')||'none';combinations[combination]=(combinations[combination]||0)+1;}return {inclusive,exclusive,combinations,multiple:rows.filter(row=>row.multiple).length};};
function allSeries(inputs,scan) {
 const records=new Map();for(const row of [...inputs.packetHistory.identities(inputs.now),...inputs.repository.identities(inputs.now)])records.set(marketSeriesKey(row),row);
 const assessments=new Map(scan.evaluation.snapshots.flatMap(row=>['buy','sell'].map(side=>[marketSeriesKey({...row,side}),row[side]])));
 return [...records].map(([id,identity])=>{
  const rawPacket=packets.series.find(row=>marketSeriesKey(row)===id);
  const book=readMarketBook(inputs.packetHistory,inputs.repository,identity,inputs.now);
  const normalized=book.points.map(point=>normalizeObservation({...identity,...point},{now:inputs.now}));
  const byEvent=new Map();for(const point of normalized){if(!Number.isFinite(point.at)||point.at>inputs.now||point.at<inputs.now-OBSERVATION_POLICY.windowMs)continue;const prior=byEvent.get(point.evidenceId);if(!prior)byEvent.set(point.evidenceId,point);else if(prior.price!==point.price)byEvent.set(point.evidenceId,{...prior,validationStatus:'quarantined',reasons:['conflicting-event']});else if(point.validationStatus==='accepted')byEvent.set(point.evidenceId,point);}
  const events=[...byEvent.values()].sort((a,b)=>a.at-b.at);const latest=events.at(-1);
  const selectedAt=Date.parse(assessments.get(id)?.at);
  const before=events.filter(point=>point.at<(Number.isFinite(selectedAt)?selectedAt:latest?.at??Infinity));
  const structurallyAccepted=before.filter(point=>point.validationStatus==='accepted');
  const span=structurallyAccepted.length>1?structurallyAccepted.at(-1).at-structurallyAccepted[0].at:0;
  const center=median(structurallyAccepted.map(point=>point.price));const stability=center?structurallyAccepted.filter(point=>Math.abs(point.price-center)/center<=OBSERVATION_POLICY.flatBand).length/structurallyAccepted.length:0;
  const countUpper=structurallyAccepted.length>=OBSERVATION_POLICY.levels[2][0] && span>=OBSERVATION_POLICY.levels[2][1];
  const assessed=assessments.get(id);const validation=validateObservationSeries(book.points,{now:inputs.now});
  return {id,...identity,sourceBuckets:{packet:inputs.packetHistory.seriesFor(identity,inputs.now)?.buckets.length||0,aodp:inputs.repository.seriesFor(identity,inputs.now)?.buckets.length||0},rawOriginalPacketBuckets:rawPacket?.buckets.length||0,
   independentEvents:events.length,knownCoveragePriorEvents:structurallyAccepted.length,knownCoverageSpanHours:span/3600000,structuralMedian:center,structuralStability:stability,
   necessaryEvidenceUpperBound:countUpper,globalStableEvidence:countUpper&&stability>=.8,actual:compact(assessed),
   counts:{unknownScope:before.filter(point=>point.reasons.includes('incomplete-book')).length,unknownSourceTime:before.filter(point=>!point.sourceTimeKnown).length,rejected:before.filter(point=>point.validationStatus==='rejected').length,conflicting:events.filter(point=>point.reasons.includes('conflicting-event')).length,quarantined:validation.observations.filter(point=>point.validationStatus==='quarantined').length,provisional:validation.observations.filter(point=>point.validationStatus==='provisional').length},
   timeline:book.points.map(point=>({source:point.source,price:point.price,bucketAt:point.bucketAt??null,sourceQuoteAt:point.sourceQuoteAt??null,observedAt:point.observedAt??null,seenAt:point.seenAt??null,fetchedAt:point.fetchedAt??null,coverage:point.coverage??null,observationId:point.observationId??null,evidenceId:point.evidenceId??null})),
   normalizedTimeline:validation.observations.map(point=>({at:point.at,source:point.source,price:point.price,observedAt:point.observedAt,receivedAt:point.receivedAt,validationStatus:point.validationStatus,reasons:point.reasons})),transitions:validation.transitions};
 });
}
const originalSeries=allSeries(oldInputs,original.next),liveSeries=allSeries(liveInputs,live.next);
const bounds=series=>({total:series.length,actualLevel3:series.filter(row=>row.actual.referenceLevel>=3).length,necessaryEvidenceUpperBound:series.filter(row=>row.necessaryEvidenceUpperBound).length,globalStableEvidence:series.filter(row=>row.globalStableEvidence).length,freshAndAcceptedWithLevel3:series.filter(row=>row.actual.referenceLevel>=3&&row.actual.executionConfidence===1&&row.actual.ageHours<=6).length,byLevel:series.reduce((counts,row)=>{counts[row.actual.referenceLevel]=(counts[row.actual.referenceLevel]||0)+1;return counts;},{}),countBelow12:series.filter(row=>row.knownCoveragePriorEvents<12).length,spanBelow24:series.filter(row=>row.knownCoveragePriorEvents>=12&&row.knownCoverageSpanHours<24).length,upperBoundButLowLevel:series.filter(row=>row.necessaryEvidenceUpperBound&&row.actual.referenceLevel<3).map(({timeline,normalizedTimeline,transitions,...row})=>row)});
const oldSnapshots=new Map(original.old.evaluation.snapshots.map(row=>[key(row),row]));
const changed=originalSeries.map(row=>{const old=oldSnapshots.get(key(row))?.[row.side];return {...row,old:compact(old),referenceDelta:old?.reference>0&&row.actual.reference>0?row.actual.reference-old.reference:null,relativeReferenceDelta:old?.reference>0&&row.actual.reference>0?(row.actual.reference-old.reference)/old.reference:null,referenceRemoved:old?.reference>0&&!(row.actual.reference>0)};}).filter(row=>row.old.reference!==row.actual.reference).sort((a,b)=>Number(b.relativeReferenceDelta!==null)-Number(a.relativeReferenceDelta!==null)||Math.abs(b.relativeReferenceDelta??0)-Math.abs(a.relativeReferenceDelta??0)||Number(b.referenceRemoved)-Number(a.referenceRemoved)||(b.old.reference||0)-(a.old.reference||0)||a.id.localeCompare(b.id));
const result={manifest,policy:OBSERVATION_POLICY,original:{asOf:previousNow,expectedOldCandidates:previous.results[0].oldCandidates,reproducedOldCandidates:original.old.candidateCount,verified:original.next.counts.verified,gateCounts:gateCounts(candidates.map(row=>row.original.gates)),bounds:bounds(originalSeries)},journal:{asOf:now,sequence:liveInputs.repository.sequence,oldCandidates:live.old.candidateCount,newCandidates:live.next.candidateCount,verified:live.next.counts.verified,gateCountsOriginalCandidates:gateCounts(candidates.map(row=>row.journalSnapshot.gates)),bounds:bounds(liveSeries),elapsedMs:live.elapsedMs,validatedColdMs:live.validatedColdMs,validatedWarmMs:live.validatedWarmMs},verifiedRows:live.next.opportunities,evaluationRows:live.next.evaluation.rows,candidates,top20ReferenceChanges:changed.slice(0,20),series:liveSeries.map(({timeline,normalizedTimeline,transitions,...row})=>row)};
writeAuditJson(`${out}/analysis.json`,result,{compressed:out!==input});
writeAuditJson(`${out}/original-series.json`,originalSeries,{compressed:out!==input});
writeAuditJson(`${out}/live-series.json`,liveSeries,{compressed:out!==input});
console.log(JSON.stringify({original:result.original,journal:result.journal,candidates:candidates.map(row=>({id:row.id,strategy:row.strategy,originalGates:row.original.gates.failed,journalGates:row.journalSnapshot.gates.failed}))},null,2));
