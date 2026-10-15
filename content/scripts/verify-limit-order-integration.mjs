import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const tests=[
 ['limit','content/scripts/test-potential-price.mjs'],['personal','content/scripts/test-personal-potential.mjs'],
 ['trade-capacity','content/scripts/test-trade-potential-evidence.mjs'],['views','content/scripts/test-potential-price-view.mjs'],
 ['refresh','--experimental-vm-modules','content/scripts/test-potential-price-refresh.mjs'],
 ['database-view','--experimental-vm-modules','content/scripts/test-potential-price-table.mjs'],
 ['local-history','--experimental-vm-modules','content/scripts/test-local-sales-history.mjs'],
 ['market-packets','content/scripts/test-market-history-packets.mjs'],['order-history','content/scripts/test-market-order-history.mjs'],
 ['history-infrastructure','content/scripts/test-sales-history-infrastructure.mjs'],['user-data','content/scripts/test-user-data.mjs'],
 ['catalogs','content/scripts/test-generated-catalogs.mjs'],['SAT','content/scripts/sat-trades/self-test.mjs'],
 ['island-economy','--experimental-vm-modules','content/scripts/test-island-economy.mjs'],
 ['island-sales','content/scripts/test-island-sales-potential.mjs'],['island-placement','content/scripts/test-island-placement.mjs'],
 ['island-stability','content/scripts/test-island-yield-stability.mjs'],['island-forecast','content/scripts/test-island-yield-forecast.mjs'],
 ['css-tests','content/scripts/test-css-architecture.mjs'],['css-check','content/scripts/check-css-architecture.mjs'],['city-architecture','content/scripts/check-city-picker-architecture.mjs'],
 ['potential-ui','content/scripts/test-potential-prices-ui.cjs'],['refresh-ui','content/scripts/test-potential-price-refresh-ui.cjs'],
 ['planner-ui','content/scripts/test-potential-price-ui.cjs'],['preferences-ui','content/scripts/test-potential-prices-preferences.cjs'],
 ['viewport','content/scripts/test-tool-viewport.cjs'] ];
const filter=process.env.LIMIT_TESTS?.split(',');
if(filter) tests.splice(0,tests.length,...tests.filter(([name])=>filter.includes(name)));
const previous=filter ? JSON.parse(await (await import('node:fs/promises')).readFile('output/limit-order-tests.json','utf8')).results.filter(r=>!filter.includes(r.name)) : [];
const results=[...previous];let next=0;
async function worker(){while(next<tests.length){const [name,...args]=tests[next++],start=Date.now();const result=await new Promise(resolve=>{
 const p=spawn(process.execPath,args,{env:process.env,windowsHide:true});let output='';let timedOut=false;
 p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);
 const timer=setTimeout(()=>{timedOut=true;p.kill();},180000);
 p.on('error',e=>{clearTimeout(timer);resolve({name,passed:false,error:e.message});});
 p.on('exit',code=>{clearTimeout(timer);resolve({name,passed:code===0,code,timedOut,ms:Date.now()-start,output:output.slice(-7000)});});
 });results.push(result);console.log(`${result.passed?'PASS':'FAIL'} ${name} (${result.ms}ms)`);
 await writeFile('output/limit-order-tests.json',JSON.stringify({at:new Date().toISOString(),results},null,2));}}
await Promise.all([worker(),worker(),worker()]);
console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).map(r=>({name:r.name,output:r.output}))},null,2));
process.exitCode=results.some(r=>!r.passed)?1:0;
