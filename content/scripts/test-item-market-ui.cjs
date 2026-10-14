const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const origin=process.env.ITEM_MARKET_ORIGIN||'http://localhost:3000';
 const out=process.env.ITEM_MARKET_ARTIFACT_DIR||'docs/item-market/screenshots';
async function init(context){await context.addInitScript(()=>{localStorage.setItem('albiontools.v4.dailyBonusRedirectAt',String(Date.now()));localStorage.setItem('albiontools.v4.settings',JSON.stringify({dataSync:false,server:'europe',defaultCity:'Martlock',premium:true,priceSource:'api'}));window.__copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copied.push(text)}});});}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const context=await browser.newContext();await init(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let fail=false, calls=0, withPersonal=false,withReferences=false,priceGate=null;
 await page.route('**/api/v2/stats/prices/**',async route=>{
  if(priceGate)await priceGate;
  calls++;if(fail)return route.abort();const url=new URL(route.request().url()),id=decodeURIComponent(url.pathname.split('/').at(-1)),time=new Date(Date.now()-60000).toISOString();
  const rows=['Martlock','Caerleon','Black Market'].flatMap((city,i)=>[1,2,3,4,5].map(q=>({item_id:id,city,quality:q,buy_price_min:80+i*10,buy_price_min_date:time,buy_price_max:100+i*20+q,buy_price_max_date:time,sell_price_min:130+i*10+q,sell_price_min_date:time,sell_price_max:200+i*10,sell_price_max_date:i===0?'0001-01-01T00:00:00':time})));
  return route.fulfill({json:rows});
 });
 await page.route('**/api/v2/stats/history/**',route=>{if(fail)return route.abort();const url=new URL(route.request().url()),id=decodeURIComponent(url.pathname.split('/').at(-1).replace('.json','')),quality=Number(url.searchParams.get('qualities'));
  return route.fulfill({json:['Martlock','Caerleon'].map(location=>({item_id:id,location,quality,data:[{timestamp:new Date(Date.now()-3600000).toISOString(),avg_price:100,item_count:1},{timestamp:new Date(Date.now()-7200000).toISOString(),avg_price:200,item_count:3}]}))});
 });
 await page.route('**/api/v1/market/order-history?**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({json:{kind:'albion.tools.order-price-history',source:'market-order-packets',series:withPersonal?[{server:'europe',itemId:q.get('items'),city:'Martlock',quality:Number(q.get('qualities')),side:'buy',priceField:'buy_price_max',buckets:[{seenAt:new Date(Date.now()-3600000).toISOString(),price:80},{seenAt:new Date(Date.now()-7200000).toISOString(),price:90}]}]:[]}});});
 await page.route('**/api/v1/trades?**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({json:{server:'europe',scope:'personal',trades:withPersonal?[{sourceId:'fixture',kind:'instant_buy',itemId:q.get('items'),quality:Number(q.get('qualities')),locationName:'Martlock',occurredAt:new Date(Date.now()-3600000).toISOString(),unitPriceSilver:100,quantity:2}]:[]}});});
 await page.route('**/api/v1/opportunity-evidence',route=>route.fulfill({json:withPersonal?{signals:{s:{server:'europe',itemId:'T4_MAIN_SWORD',quality:2,legs:{sell:{city:'Caerleon'}}}},trades:{t:{signalId:'s',events:[{type:'sell',at:new Date(Date.now()-3600000).toISOString(),price:200,quantity:1},{type:'order',at:new Date(Date.now()-3600000).toISOString(),price:999,quantity:999}]}}}:{signals:{},trades:{}}}));
 await page.route('**/api/v1/market/long-term?**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({json:{references:withReferences?['Martlock','Caerleon','Black Market'].flatMap((city,i)=>['buy','sell'].map(side=>({server:'europe',itemId:q.get('items'),city,quality:1,side,source:'quote-history',price:side==='buy'?101+i*20:131+i*10}))):[]}});});
 await page.route('**/api/v2/stats/price-updates',route=>route.abort());
 await page.goto(origin+'/tools/item-market/?item=T4_MAIN_SWORD');
 await page.waitForFunction(()=>!document.querySelector('[data-market-status]')?.textContent.includes('alınıyor'));
 await page.locator('[data-variant="tier"]').waitFor();
 await page.locator('[data-city-table] tbody tr').first().waitFor();
 const legacySort=await page.evaluate(async()=>{
  const api=await import(new URL('content/js/utils/table-sort.js',document.baseURI).href);
  const host=document.createElement('section');host.hidden=true;
  host.innerHTML=`<table><thead><tr>${api.sortHeaderHtml('Name',{key:'name'})}${api.sortHeaderHtml('Value',{key:'value',type:'number'})}</tr></thead><tbody>${[['A','3'],['B','20'],['C',''],['D','0']].map(([name,value])=>`<tr><td>${name}</td><td data-sort-value="${value}">${value||'—'}</td></tr>`).join('')}</tbody></table>`;
  document.body.append(host);const table=host.querySelector('table');api.initTableSort(table);
  const rows=()=>[...table.tBodies[0].rows].map(row=>row.cells[0].textContent);
  api.applyTableSort(table,'value','desc');const desc=rows();table.querySelector('th[data-sort-key="value"] button').click();const asc=rows();api.applyTableSort(table,'name','asc');const text=rows();host.remove();return{desc,asc,text};
 });
 assert.deepEqual(legacySort,{desc:['B','A','D','C'],asc:['D','A','B','C'],text:['A','B','C','D']},'existing single-measure headers preserve numeric, zero, missing-last and text sorting');
 assert.equal(await page.locator('[data-variant="quality"] option').count(),5);
 assert.equal(await page.locator('[data-quality-table] th').count(),6,'one logical column per quality');
 assert.equal(await page.locator('[data-quality-table] .table-sort-btn').count(),11,'city plus two independent measures per quality');
 assert.match(await page.locator('[data-personal-chart]').innerText(),/Kayıtlı şahsi trade verisi yok/);
 assert.equal(await page.locator('[data-personal-chart] rect').count(),0);
 assert.equal(await page.locator('[data-api-chart] rect').count(),4);
 assert.match(await page.locator('[data-item-summary]').innerText(),/175/);
 assert.equal(await page.locator('[data-city-row="Black Market"] td').nth(2).innerText(),'—');
 for(const selector of ['[data-city-table]','[data-quality-table]']){
  const buttons=page.locator(selector+' .table-sort-btn');const count=await buttons.count();
  for(let i=0;i<count;i++){const b=buttons.nth(i);await b.press('Enter');const first=await b.evaluate(el=>el.dataset.sortDirection||el.closest('th').getAttribute('aria-sort'));assert.notEqual(first,'none');await b.press(' ');assert.notEqual(await b.evaluate(el=>el.dataset.sortDirection||el.closest('th').getAttribute('aria-sort')),first);}
 }
 const qualityOrder=()=>page.locator('[data-quality-table] tbody tr').first().locator('td').first().innerText();
 await page.locator('[data-sort-key="q1buy"]').press('Enter');assert.equal(await qualityOrder(),'BLACK MARKET');await page.locator('[data-sort-key="q1buy"]').press(' ');assert.equal(await qualityOrder(),'MARTLOCK');
 await page.locator('[data-sort-key="q1sell"]').press('Enter');assert.equal(await qualityOrder(),'CAERLEON');await page.locator('[data-sort-key="q1sell"]').press(' ');assert.equal(await qualityOrder(),'MARTLOCK');assert.equal(await page.locator('[data-sort-key="q1buy"]').getAttribute('data-sort-direction'),'none');
 await page.locator('[data-tree-group="weapon"] > summary').click();await page.locator('[data-tree-group="weapon"] > .market-tree-branches > details').first().locator('summary').click();await page.locator('[data-category="weapons"][data-subcategory="sword"]').press('Enter');assert.equal(await page.locator('[data-category="weapons"][data-subcategory="sword"]').getAttribute('class'),'is-active');
 await page.locator('.market-tree-all').click();
 const before=calls;await page.locator('[data-search]').fill('T4_MAIN_SWORD');assert.equal(calls,before);assert.ok(await page.locator('[data-select-item="T4_MAIN_SWORD"]').count());
 await page.locator('[data-search]').fill('t8_main_sword@3');await page.locator('[data-select-item="T8_MAIN_SWORD@3"]').click();await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));assert.equal(await page.locator('[data-variant="tier"]').inputValue(),'8');assert.equal(await page.locator('[data-variant="enchant"]').inputValue(),'3');
 await page.locator('[data-search]').fill('T4_MAIN_SWORD');await page.locator('[data-select-item="T4_MAIN_SWORD"]').click();await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));
 await page.locator('[data-clear]').press('Enter');assert.equal(await page.locator('[data-search]').inputValue(),'');assert.equal(await page.locator('[data-search].is-filled').count(),0);assert.equal(await page.locator('.form-floating--clearable [data-clear]').count(),1);
 await page.locator('[data-item-summary] [data-copy-item-name]').click();await page.locator('[data-item-summary] [data-copy-item-name]').press('Enter');assert.deepEqual(await page.evaluate(()=>window.__copied),["Adept's Broadsword","Adept's Broadsword"]);
 await page.locator('[data-watch]').click();
 await page.evaluate(()=>{window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='albiontools.v4.item-market')throw Error('quota');return window.__setItem.call(this,key,value);};});
 await page.locator('[data-watch]').click();assert.equal(await page.locator('[data-watch]').getAttribute('aria-label'),'İzlemeden çıkar','failed persistence does not lose an existing watch');assert.match(await page.locator('[data-market-status]').innerText(),/saklanamadı/);
 await page.evaluate(()=>{Storage.prototype.setItem=window.__setItem;});await page.reload();await page.locator('[data-watch]').waitFor();assert.equal(await page.locator('[data-watch]').getAttribute('aria-label'),'İzlemeden çıkar');
 await page.goto(origin+'/tools/item-market/?view=watch');await page.locator('[data-watch-view] tbody tr').waitFor();assert.equal(await page.locator('[data-unwatch]').count(),1);assert.equal(await page.locator('[data-item-summary]').count(),0);
 await page.screenshot({path:out+'/watch-list.png'});await page.locator('[data-unwatch]').click();assert.equal(await page.locator('[data-unwatch]').count(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('albiontools.v4.item-market')).last),'T4_MAIN_SWORD','watch view edits preserve last viewed item');
 await page.goto(origin+'/tools/item-market/?item=T4_MAIN_SWORD');await page.locator('[data-variant="tier"]').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));
 await page.locator('[data-variant="quality"]').selectOption('2');await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));assert.equal(await page.locator('[data-variant="quality"]').inputValue(),'2');
 await page.locator('[data-mode="net"]').click();assert.match(await page.locator('[data-city-table]').innerText(),/kontrolü geçen fiyat çifti yok/);await page.locator('[data-mode="buy"]').click();
 withReferences=true;await page.locator('[data-variant="quality"]').selectOption('1');await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));await page.locator('[data-mode="arbitrage"]').click();assert.ok(await page.locator('[data-city-table] tbody tr td[data-sort-value]').count(),'verified reference pairs enter the shared Flipper calculation');assert.match(await page.locator('[data-price-note]').innerText(),/Taşıma gideri 0/);withReferences=false;await page.locator('[data-mode="buy"]').click();await page.locator('[data-variant="quality"]').selectOption('2');await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));
 withPersonal=true;await page.locator('[data-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));
 assert.equal(await page.locator('[data-personal-chart] rect').count(),2,'only personal executed fills have volume');assert.equal(await page.locator('[data-api-chart] rect').count(),4,'personal volume never enters API history');
 await page.locator('[data-city-field="market-chart-api-cities"] select').selectOption('Caerleon');assert.equal(await page.locator('[data-api-chart] rect').count(),2);assert.equal(await page.locator('[data-personal-chart] rect').count(),2,'city filters are independent between sources');
 await page.locator('[data-city-field="market-chart-personal-cities"] select').selectOption('Caerleon');assert.equal(await page.locator('[data-personal-chart] rect').count(),1);assert.equal(await page.locator('[data-api-chart] rect').count(),2);
 await page.locator('[data-city-field="market-chart-api-cities"] [data-city-all]').click();await page.locator('[data-city-field="market-chart-personal-cities"] [data-city-all]').click();
 await page.locator('[data-history-source]').selectOption('snapshot');assert.equal(await page.locator('[data-api-chart] rect').count(),0,'snapshot archive never invents volume');assert.equal(await page.locator('[data-api-chart] circle').count(),2);await page.locator('[data-history-source]').selectOption('api');
 await page.locator('[data-api-chart] [data-days="7"]').click();assert.equal(await page.locator('[data-personal-chart] [data-days="30"]').getAttribute('aria-pressed'),'true','period controls are independent between sources');await page.locator('[data-personal-chart] [data-days="90"]').click();assert.equal(await page.locator('[data-api-chart] [data-days="7"]').getAttribute('aria-pressed'),'true');await page.locator('[data-api-chart] [data-days="30"]').click();await page.locator('[data-personal-chart] [data-days="30"]').click();
 for(const [width,height] of [[1920,1080],[1688,896],[1440,900],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  const metrics=await page.evaluate(()=>{const a=document.querySelector('.app-content');return {client:a.clientHeight,scroll:a.scrollHeight,width:a.clientWidth,scrollWidth:a.scrollWidth,bodyWidth:document.documentElement.scrollWidth};});
  assert.ok(metrics.bodyWidth<=width+1,JSON.stringify({width,metrics}));assert.ok(metrics.scrollWidth<=metrics.width+1,JSON.stringify({width,metrics}));
  if(width>=1440)assert.ok(metrics.scroll<=metrics.client+2,JSON.stringify({width,metrics}));
  if(width>=1688){for(const selector of ['[data-city-table]','[data-quality-table]']){const bounds=await page.locator(selector).evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(bounds.scroll<=bounds.height+2,`${width} ${selector} all cities visible: ${JSON.stringify(bounds)}`);}}
  if(width>=1688){const graph=await page.locator('[data-api-chart] .market-chart').evaluate(el=>({height:el.clientHeight,svgHeight:el.querySelector('svg').viewBox.baseVal.height}));assert.ok(Math.abs(graph.height-graph.svgHeight)<=1,'graph labels stay at native pixel size');}
  if(width===390){const positions=await page.evaluate(()=>({controls:document.querySelector('.controls').getBoundingClientRect().bottom,summary:document.querySelector('[data-item-summary]').getBoundingClientRect().top}));assert.ok(positions.summary>=positions.controls,'mobile controls and result never overlap');}
  if(width===390){const head=await page.evaluate(()=>({actionBottom:document.querySelector('.page-head a').getBoundingClientRect().bottom,controlsTop:document.querySelector('.controls').getBoundingClientRect().top}));assert.ok(head.actionBottom<=head.controlsTop+1,'mobile head action does not overlap search');}
  await page.screenshot({path:`${out}/fixture-${width}x${height}.png`,fullPage:width===390});console.log('PASS viewport',width,height,metrics);
 }
 const dimensions=await page.evaluate(async()=>{const paths=['content/images/page-heads/desktop/esya-piyasasi-head-2000x200.png','content/images/page-heads/mobile/esya-piyasasi-head-mobile-1200x480.webp'];return Promise.all(paths.map(async path=>{const i=new Image();i.src=path;await i.decode();return [i.naturalWidth,i.naturalHeight];}));});assert.deepEqual(dimensions,[[2000,200],[1200,480]]);
 assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('main')).getPropertyValue('--page-head-image')),/mobile.*1200x480/);
 await page.setViewportSize({width:1920,height:1080});assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('main')).getPropertyValue('--page-head-image')),/desktop.*2000x200/);
 fail=true;await page.locator('[data-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));assert.match(await page.locator('[data-market-status]').innerText(),/Canlı fiyat/);assert.equal(await page.locator('[data-city-table] td.market-buy[data-sort-value=""]').count(),16);
 fail=false;let releasePrices;priceGate=new Promise(resolve=>{releasePrices=resolve;});await page.locator('[data-refresh]').click();await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('albiontools.v4.settings'));settings.server='west';localStorage.setItem('albiontools.v4.settings',JSON.stringify(settings));});releasePrices();priceGate=null;await page.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'));assert.match(await page.locator('[data-market-status]').innerText(),/Sunucu değişti/);assert.equal(await page.locator('[data-city-table] td.market-buy[data-sort-value=""]').count(),16,'old server results cannot enter the new scope');
 assert.deepEqual(errors,[]);await context.close();
 // Deliver screenshots of the real configured sources, never fixture prices.
 const live=await browser.newContext();await init(live);const p=await live.newPage();await p.goto(origin+'/tools/item-market/?item=T4_MAIN_SWORD');await p.locator('[data-variant="tier"]').waitFor();await p.waitForFunction(()=>!document.querySelector('[data-market-status]').textContent.includes('alınıyor'),null,{timeout:60000});
 for(const [width,height] of [[1920,1080],[1688,896],[1440,900],[1280,720],[390,844]]){await p.setViewportSize({width,height});await p.waitForTimeout(200);await p.screenshot({path:`${out}/live-${width}x${height}.png`,fullPage:width===390});}
 await p.evaluate(()=>{const scroller=document.querySelector('.app-content'),top=scroller.getBoundingClientRect().top;const chrome=document.querySelector('.app-topbar').getBoundingClientRect().bottom-top+parseFloat(getComputedStyle(document.querySelector('main')).getPropertyValue('--app-status-offset'));scroller.scrollTop+=document.querySelector('[data-item-summary]').getBoundingClientRect().top-top-chrome;});await p.screenshot({path:out+'/live-mobile-detail.png'});
 const liveEvidence={personalPoints:await p.locator('[data-personal-chart] circle').count(),apiPoints:await p.locator('[data-api-chart] circle').count(),apiVolumeBars:await p.locator('[data-api-chart] rect').count(),status:await p.locator('[data-market-status]').innerText()};
 await p.locator('[data-history-source]').selectOption('snapshot');liveEvidence.snapshotPoints=await p.locator('[data-api-chart] circle').count();liveEvidence.snapshotVolumeBars=await p.locator('[data-api-chart] rect').count();
 fs.writeFileSync('docs/item-market/verification.json',JSON.stringify({item:'T4_MAIN_SWORD',server:'europe',quality:1,functional:'passed',viewports:[[1920,1080],[1688,896],[1440,900],[1280,720],[390,844]],heads:{desktop:[2000,200,'PNG'],mobile:[1200,480,'WebP']},liveEvidence},null,2)+'\n');
 console.log('PASS legacy/shared sorting, paired quality measures, exact lowercase-ID variation, category tree, clear/floating labels, numeric orders, copy, watch persistence/quota rollback/last-view preservation, verified Flipper integration, independent sources, failure/server-switch recovery, native-size graph labels, head dimensions/responsive, five viewports/all cities visible at 1920/1688, real-source screenshots');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
