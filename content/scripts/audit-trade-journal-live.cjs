const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const dir = path.resolve(__dirname, '../../output/trade-journal-polish'); fs.mkdirSync(dir,{recursive:true});
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const context = await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('albiontools.v4.dailyBonusRedirectAt',String(Date.now())));
 const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message)); const results=[];
 try {
  await page.goto('http://localhost:3000/pages/tools/trade-journal/');
  await page.locator('.journal-kpi').first().waitFor();
  const snapshot=await (await page.request.get('http://localhost:3003/api/v1/trades')).json();
  const {journalDay,journalGroups,mergeJournalTrades,journalHighlights}=await import('../js/core/trade-journal.mjs');
  const records=mergeJournalTrades(new Map(),snapshot.trades,true);
  const days=[...new Set(snapshot.trades.map(t=>journalDay(t.occurredAt)))].sort().reverse();
  const models=days.map(day=>({day,model:journalGroups(records,day)}));
  const scenarios=[0,1,2,3].map(count=>models.find(x=>x.model.count && journalHighlights(x.model).length===count)).filter(Boolean);
  console.log('Real scenarios: '+JSON.stringify(scenarios.map(x=>({day:x.day,events:journalHighlights(x.model).length}))));
  for(const {day,model} of scenarios) {
   const story=journalHighlights(model).length>0, tag=story?'story-'+journalHighlights(model).length:'quiet';
   await page.locator('[data-day]').fill(day); await page.locator('[data-day]').dispatchEvent('change');
   const expected=[model.sales,model.buys,model.net,model.count].map(n=>n.toLocaleString('tr-TR',{maximumFractionDigits:2}));
   await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('.journal-kpi strong')].map(e=>e.textContent))===JSON.stringify(expected),expected);
   assert.equal(await page.locator('.journal-story').count(),Number(story));
   assert.equal(await page.locator('.journal-summary-strip').count(),Number(!story));
   for(const [width,height] of [[1920,1080],[1366,768],[992,768],[768,900],[390,844],[320,720]]) {
    await page.setViewportSize({width,height});
    if(width<992 && await page.evaluate(()=>document.body.classList.contains('app-sidebar-open'))) await page.locator('.sidebar-toggler').click();
    await page.locator('.app-content').evaluate(e=>e.scrollTop=0); await page.waitForTimeout(180);
    const geometry=await page.evaluate(()=>({width:innerWidth, overflow:document.documentElement.scrollWidth-innerWidth,
     panels:[...document.querySelectorAll('.journal-block')].map(e=>({width:e.getBoundingClientRect().width,rows:e.querySelectorAll('.journal-group').length})),
     rows:[...document.querySelectorAll('.journal-group')].map(e=>e.getBoundingClientRect().height),
     scrollports:[...document.querySelectorAll('.journal-lane-body')].map(e=>({client:e.clientHeight,scroll:e.scrollHeight})),
     bad:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>e.className).slice(0,10),
     missing:[...document.querySelectorAll('.journal-group img')].filter(e=>e.hidden || (e.complete&&!e.naturalWidth)).map(e=>e.src)}));
    assert.ok(geometry.overflow<=2); assert.deepEqual(geometry.bad,[]); assert.deepEqual(geometry.missing,[]);
    assert.ok(geometry.panels.every(p=>p.rows<=5)); assert.ok(geometry.scrollports.every(p=>p.scroll<=p.client+1));
    await page.screenshot({path:path.join(dir,`${tag}-${width}.png`)});
    await page.locator('.journal-board').screenshot({path:path.join(dir,`${tag}-board-${width}.png`)});
    for(const side of ['sell','buy']) {
     await page.locator(`.journal-block--${side}`).evaluate(e=>e.scrollIntoView({block:'start'}));
     await page.screenshot({path:path.join(dir,`${tag}-${side}-${width}.png`)});
    }
    await page.locator('.app-content').evaluate(e=>e.scrollTop=0);
    results.push({day,story,events:journalHighlights(model).length,width,height,...geometry});
   }
   for(const side of ['sell','buy']) {
    const count=model.groups.filter(g=>g.side===side).length;
    if(count<=5) continue;
    assert.equal(await page.locator(`[data-expand="${side}"]`).innerText(),`${count-5} grup daha göster`);
    await page.locator(`[data-expand="${side}"]`).click();
    assert.equal(await page.locator(`.journal-block--${side} .journal-group`).count(),count);
    await page.locator('[data-refresh]').click(); await page.waitForTimeout(400);
    assert.equal(await page.locator(`.journal-block--${side} .journal-group`).count(),count);
    await page.locator(`[data-expand="${side}"]`).click();
    assert.equal(await page.locator(`.journal-block--${side} .journal-group`).count(),5);
   }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify({at:new Date().toISOString(),archiveRecords:snapshot.trades.length,results,errors},null,2));
  console.log(`PASS real SAT: ${scenarios.length} days, ${results.length} viewport checks, KPI parity, hidden-group labels, expand/collapse + refresh, no overflow, no missing icons or page errors.`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
