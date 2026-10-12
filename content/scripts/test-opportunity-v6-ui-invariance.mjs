import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='docs/opportunity-v6-ui',baseline=JSON.parse(readFileSync(dir+'/baseline.json'));
// UI-owned invariants stay strict. Operator-managed ingestion infrastructure
// is observed separately so concurrent non-UI work is neither reverted nor
// silently presented as byte-identical. --strict-infrastructure audits all files.
const concurrent=[],unchanged=[];
for(const [file,expected]of Object.entries(baseline.hashes)){
    const actual=createHash('sha256').update(readFileSync(file)).digest('hex');
    if(actual===expected){unchanged.push(file);continue;}
    const protectedSource=file.startsWith('content/js/core/')||file.endsWith('/opportunity-evidence-repository.mjs')||file.endsWith('/quote-service.mjs');
    assert.ok(!protectedSource,file+' protected price/API/accounting source changed');
    if(process.argv.includes('--strict-infrastructure'))assert.equal(actual,expected,file+' infrastructure differs from pre-UI baseline');
    concurrent.push({file,baseline:expected,observed:actual,observedAt:new Date().toISOString(),note:'Concurrent infrastructure difference outside the UI change scope; not claimed unchanged.'});
}
writeFileSync(dir+'/external-changes.json',JSON.stringify(concurrent,null,2));
assert.match(readFileSync('content/scripts/price-hub.mjs','utf8'),/if \(await routeOpportunityEvidence\(req, res, opportunityEvidence, path\)\) return;/,'V6 API route integration is preserved');
const source=file=>readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
function body(text,name,indent=''){
    const start=text.indexOf(indent+'function '+name+'(');assert.ok(start>=0,name);
    const rest=text.slice(start),match=rest.slice(1).match(new RegExp('\\n'+indent+'(?:async )?function |\\n'+indent+'(?:let|const) '));
    return (match?rest.slice(0,match.index+1):rest).trim();
}
const before=source(dir+'/before/content--js--tools--opportunities.js.txt'),after=source('content/js/tools/opportunities.js');
const functions=['defaultFilters','readFilters','rows','eligibleListRows','listCounts','visibleRows','rankedVisibleRows','scenarioFor','bindScenario','scenarioResultHtml'];
for(const name of functions)assert.equal(body(after,name),body(before,name),name+' data/calculation flow unchanged');
const evidenceBefore=source(dir+'/before/content--js--components--opportunity-evidence.js.txt'),evidenceAfter=source('content/js/components/opportunity-evidence.js');
assert.equal(body(evidenceAfter,'bindTrades','    '),body(evidenceBefore,'bindTrades','    '),'real fill/order command construction unchanged');
const head=text=>text.match(/head: `<section class="page-head"[\s\S]*?<\/section>`/)[0];
assert.equal(head(after),head(before),'head composition unchanged');
const proof={verifiedAt:new Date().toISOString(),protectedFiles:unchanged,concurrentChanges:concurrent,unchangedUiDataFunctions:functions,unchangedTradeCommands:true,unchangedHead:true};
writeFileSync(dir+'/invariance.json',JSON.stringify(proof,null,2));console.log('V6 UI: '+unchanged.length+' engine/API/accounting sources and '+functions.length+' UI data/calculation functions unchanged; head and trade commands unchanged. '+concurrent.length+' concurrent infrastructure differences observed separately.');
