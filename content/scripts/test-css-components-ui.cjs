const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
process.chdir(path.resolve(__dirname, '../..'));
const artifactDir=process.env.CSS_UI_ARTIFACT_DIR;
if(artifactDir)fs.mkdirSync(artifactDir,{recursive:true});
const baselineDir=process.env.CSS_UI_BASELINE_DIR;
const before=baselineDir?JSON.parse(fs.readFileSync(path.join(baselineDir,'before.json'))):{};
const oldCss=baselineDir?fs.readFileSync(path.join(baselineDir,'before.css'),'utf8'):'';
const migrated=new Set(Object.values(Object.assign({},...Object.values(JSON.parse(fs.readFileSync('content/scripts/css-component-migrations.json'))))).filter(Boolean));
const tools=[...JSON.parse(fs.readFileSync('data/site-tools.json')),...JSON.parse(fs.readFileSync('data/site-pages.json'))].filter(record=>{
 const file='content/js/tools/'+record.id+'.js';
 return fs.existsSync(file)&&[...migrated].some(name=>fs.readFileSync(file,'utf8').includes(name));
});
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});const findings=[];
try {
for(const width of [390,1440])for(const tool of tools){
 const results=[];
 for(const baseline of baselineDir?[true,false]:[false]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('albiontools.v4.dailyBonusRedirectAt',String(Date.now()));localStorage.setItem('albiontools.v4.settings',JSON.stringify({dataSync:false,server:'europe',premium:true,priceSource:'api',cityPickerStyle:'standard'}));window.__copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copies.push(text)}});});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('/api/v2/stats/prices/')) {
    const ids=decodeURIComponent(u.pathname.split('/').at(-1)).split(','),cities=(u.searchParams.get('locations')||'Caerleon').split(','),date='2026-10-11T10:00:00Z';
    return route.fulfill({json:ids.flatMap(item_id=>cities.map(city=>({item_id,city,quality:1,sell_price_min:10000,sell_price_min_date:date,buy_price_max:9000,buy_price_max_date:date})))});
   }
   if(u.hostname!=='localhost')return route.fulfill({json:[]});
   const file=decodeURIComponent(u.pathname).slice(1).replaceAll('\\','/');
   if(baseline && file==='output/css/site.css')return route.fulfill({body:oldCss,contentType:'text/css'});
   if(baseline && before[file])return route.fulfill({body:before[file],contentType:file.endsWith('.html')?'text/html':'text/javascript'});
   return route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.CSS_UI_BASE_URL||'http://localhost:3000'}/${tool.path}/`,{waitUntil:'networkidle'});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.loading!=='lazy').map(i=>i.complete?Promise.resolve():new Promise(r=>{setTimeout(r,1000);i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true})})));});
  const snapshot=await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.tagName,text:el.tagName==='INPUT'?el.value:el.children.length?'':el.textContent.trim().slice(0,50),rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100),style:['display','fontSize','fontWeight','color','backgroundColor','padding','margin','gap','gridTemplateColumns','borderWidth','minWidth','maxWidth','overflow'].map(k=>s[k])}}));
  assert(snapshot.length>10, `${tool.id}: page did not render`);
  if(artifactDir)await page.screenshot({path:path.join(artifactDir,`${tool.id}-${width}-${baseline?'before':'after'}.png`),fullPage:true});
  let copy=false;
  if(!baseline){
   const target=page.locator('[data-copy-item-name]:visible').first();if(await target.count()){await target.press('Enter');await target.press(' ');await target.click();copy=await page.evaluate(()=>window.__copies.length===3);assert(copy,`${tool.id}: item copy failed`);}
   const missingBase=await page.evaluate(()=>[...document.querySelectorAll('[class]')].flatMap(el=>[...el.classList].filter(c=>/^(market-|segmented-choice|form-side|material-price|tool-result)/.test(c)&&c.includes('--')&&!el.classList.contains(c.split('--')[0]))));assert.deepEqual(missingBase,[]);
  }
  if(!baseline){
   assert.deepEqual(errors,[],tool.id+' has runtime errors');
   const field=page.locator('[data-market-price-field] input:visible').first();
   if(await field.count()){await field.fill('12000');await field.dispatchEvent('change');assert(await page.locator('[data-market-price-field].is-manual').count(),tool.id+': manual price update failed');}
  }
  results.push({snapshot,errors,copy});await context.close();
 }
 const a=results[0],b=results.at(-1),diff=[];if(a.snapshot.length!==b.snapshot.length)diff.push({nodes:[a.snapshot.length,b.snapshot.length]});
 for(let i=0;i<Math.min(a.snapshot.length,b.snapshot.length);i++)if(JSON.stringify(a.snapshot[i])!==JSON.stringify(b.snapshot[i]))diff.push({index:i,before:a.snapshot[i],after:b.snapshot[i]});
 findings.push({tool:tool.id,width,differences:diff,beforeErrors:a.errors,afterErrors:b.errors,copy:b.copy});console.log(`${tool.id} ${width}: component checks passed${baselineDir ? `; ${diff.length} baseline layout/style differences` : ''}; copy ${b.copy ? 'passed' : 'no visible item'}`);
}
if(artifactDir)fs.writeFileSync(path.join(artifactDir,'visual-report.json'),JSON.stringify(findings,null,2));
assert(findings.every(row=>!row.differences.length),'Baseline layout/style regression detected');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
