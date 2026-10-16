const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const { SITE_ROUTES } = await import('./site-routes.mjs');
 const { emptyEvidence, OPPORTUNITY_EVIDENCE_API } = await import('../js/core/opportunity-evidence.mjs');
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const failures=[];
 try {
 await Promise.all([{width:1440,height:900},{width:1280,height:720},{width:992,height:600},{width:992,height:480},{width:390,height:844},{width:320,height:740}].map(async viewport => {
 for (const tool of SITE_ROUTES.filter(r=>r.kind==='tool' && (!process.env.TOOL_VIEWPORT_FILTER || r.id===process.env.TOOL_VIEWPORT_FILTER))) {
 console.log(viewport.width,tool.id);
 const context=await browser.newContext({viewport});
 const { UserDataRepository }=await import('./user-data-repository.mjs');
 const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'tool-viewport-'));
 const repository=new UserDataRepository(path.join(temp,'data.sqlite'));
 try {
 await context.addInitScript(()=>localStorage.setItem('albiontools.v4.dailyBonusRedirectAt',String(Date.now())));
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname.startsWith('/api/')) {
 if(url.pathname.includes('/user-data')) {
 const body=route.request().postDataJSON();
 const result=route.request().method()==='GET'?repository.snapshot():url.pathname.endsWith('/import')?repository.importLegacy(body.data):url.pathname.endsWith('/backup')?repository.status():repository.write(body.changes);
 return route.fulfill({json:result});
 }
 if(url.pathname===OPPORTUNITY_EVIDENCE_API) return route.fulfill({json:emptyEvidence()});
 if(url.pathname.includes('/market/opportunities')) return route.fulfill({status:503,json:{error:'Isolated empty state'}});
 return route.fulfill({json:{checks:[],outcomes:[],trades:[],ready:true,server:'europe',items:[],rows:[]}});
 }
 if(url.hostname!=='localhost') return route.abort();
 const file=path.resolve(__dirname,'../..','.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
 return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
 });
 await page.goto('http://localhost/'+tool.source,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('main')?.textContent.trim().length>100,{},{timeout:10000}).catch(async e=>{throw new Error(tool.id+': '+await page.locator('body').innerText());});
 await page.waitForTimeout(250);
 const clippedLabels=await page.evaluate(()=>[...document.querySelectorAll('main.tool-page .form-floating > label')].filter(label=>{
 const field=label.parentElement.getBoundingClientRect(),rect=label.getBoundingClientRect();
 return rect.height>0 && (rect.top<field.top-1 || rect.bottom>field.bottom+1);
 }).map(label=>label.textContent.trim()));
 assert.deepEqual(clippedLabels,[],`${tool.id}: floating labels must fit inside their fields`);
 assert.deepEqual(errors,[],`${tool.id}: browser runtime errors`);
 const overflow=await page.evaluate(()=>[document.documentElement,document.body,document.querySelector('.app-content'),document.querySelector('main')].filter(Boolean).map(el=>({tag:el.className||el.tagName,x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight})).filter(el=>el.x>2||(innerWidth>=992&&el.y>2)));
 if(overflow.length) { failures.push({tool:tool.id,viewport,overflow}); console.log(await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().bottom>innerHeight).slice(0,20).map(el=>({c:el.className,h:el.clientHeight,s:el.scrollHeight,b:el.getBoundingClientRect().bottom})))); }
 } finally {
 await context.close();
 repository.close();
 assert.ok(path.resolve(temp).startsWith(path.resolve(require('node:os').tmpdir())+path.sep));
 fs.rmSync(temp,{recursive:true,force:true});
 }
 }
 }));
 console.log(JSON.stringify(failures,null,2));
 assert.equal(failures.length,0,'Tool frames must fit desktop viewports and never overflow horizontally on mobile');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
