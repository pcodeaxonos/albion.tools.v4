const { VIEWPORTS, settleViewport } = require('./opportunity-ui-browser-support.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { chromium } = require('playwright');
(async () => {
    const { attachOpportunitySales, rankCommercialOpportunities } = await import('../js/core/market-opportunity-commerce.mjs');
    const { rankOpportunityPresentation } = await import('../js/core/market-opportunity-quality.mjs');
    const { opportunityTradePrices, calculateTradeScenario } = await import('../js/core/market-trade-scenario.mjs');
    const stage=process.argv.includes('--before')?'before':'after';
    const dir='docs/opportunity-v6-ui/'+stage;
    const read = name => JSON.parse(gunzipSync(fs.readFileSync(`docs/opportunity-v6/${name}.json.gz`)));
    const scan = read('baseline-scan');
    const history = JSON.parse(gunzipSync(fs.readFileSync('docs/opportunity-v5/sales-history.json.gz')));
    const { OpportunityEvidenceRepository } = await import('./opportunity-evidence-repository.mjs');
    const { tradeAccounting, evidenceReport } = await import('../js/core/opportunity-evidence.mjs');
    const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'albion-v6-ui-'));
    let repo=new OpportunityEvidenceRepository(path.join(temp,'evidence.jsonl'));
    const anchors = new Map(history.rows.map(row => [`${row.item_id}|${row.location}|${row.quality}`, { ...row, fetchedAt: history.fetchedAt }]));
    scan.opportunities = scan.eligibleCandidates;
    const groups = rankCommercialOpportunities(rankOpportunityPresentation(scan.eligibleCandidates, { calibration: scan.qualityCalibration }), { calibration: scan.qualityCalibration });
    const rates = JSON.parse(fs.readFileSync('data/economy-constants.json'));
    const rate = key => Number(rates.find(row => row.key === key).value);
    const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
        await context.addInitScript(() => {
            localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
            localStorage.setItem('albiontools.v4.settings', JSON.stringify({ dataSync: false, server: 'europe', premium: true }));
            localStorage.setItem('opp-layout', 'cards');
        });
        const page = await context.newPage(), errors = [], origin = 'http://localhost:3013';
        page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER',error.message); });
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) return route.abort();
            let relative = decodeURIComponent(url.pathname).replace(/^\//, '');
            if (!path.extname(relative)) relative = relative.replace(/\/$/, '') + '/index.html';
            const file = path.resolve(relative);
            if (!file.startsWith(process.cwd() + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
            const previous=path.join('docs/opportunity-v6-ui/before',relative.replaceAll('/','--')+'.txt');
            return route.fulfill({ body: fs.readFileSync(stage==='before'&&fs.existsSync(previous)?previous:file), contentType: types[path.extname(file)] || 'application/octet-stream' });
        });
        await page.route('**/api/v1/market/opportunities?**', route => route.fulfill({ json: scan }));
        await page.route('**/api/v1/market/opportunity-series?**', route => route.fulfill({ json: { buy: { points: [] }, sell: { points: [] } } }));
        let failResponse = false;
        await page.route('**/api/v1/opportunity-evidence', async route => {
            if (route.request().method() === 'GET') return route.fulfill({ json: repo.snapshot() });
            try {
                const result=repo.submit(route.request().postDataJSON());
                if(failResponse){failResponse=false;return route.abort();}
                return route.fulfill({ json: result });
            } catch(error) { return route.fulfill({status:400,json:{error:error.message}}); }
        });
        await page.goto(origin + '/pages/tools/opportunities/');
        await page.locator('.opp-card').first().waitFor();
        assert.equal(await page.locator('.opp-card').count(), groups.length);


        const sizes=VIEWPORTS;
        for(const [width,height]of sizes){
            await settleViewport(page, {width,height});await page.screenshot({animations:'disabled',path:dir+'/main-'+width+'.png'});
            if(stage==='after'){
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+width);
                assert.equal(await page.locator('[data-evidence-report]').count(),0,'technical performance report stays out of the main opportunity list');
                const scrollport=await page.locator('.opp-cards').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(scrollport.scroll<=scrollport.client+1,'card horizontal overflow '+width);
                const cards=await page.locator('.opp-card').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(Math.max(...cards)-Math.min(...cards)<1,'consistent card heights');
                await page.locator('[data-evidence-open-report]').click();
                const performanceDialog=page.locator('[data-opportunities-evidence-dialog]');
                assert.equal(await performanceDialog.evaluate(e=>e.open),true,'performance opens on demand in its popup');
                const emptyReport=page.locator('.opp-performance-sheet');
                await settleViewport(page,{width,height});
                const reportBox=await emptyReport.evaluate(e=>({height:e.getBoundingClientRect().height,client:e.clientWidth,scroll:e.scrollWidth}));
                assert.ok(reportBox.scroll<=reportBox.client+1,'report overflow '+width);
                await emptyReport.screenshot({animations:'disabled',path:dir+'/empty-performance-'+width+'.png'});
                await page.locator('[data-evidence-report-close]').click();
                await page.locator('[data-open-filters]').click();await page.screenshot({animations:'disabled',path:dir+'/filters-'+width+'.png'});
                const panel=await page.locator('.opp-filter-sheet').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(panel.scroll<=panel.width+1,'filter overflow '+width);
                await page.keyboard.press('Escape');
            }
        }
        if(stage==='after'){
            fs.writeFileSync(dir+'/layout-debug.json', JSON.stringify(await page.evaluate(()=>{const card=document.querySelector('.opp-card');return [document.querySelector('.opp-cards'),card,...card.children].map(e=>({class:e.className,width:e.getBoundingClientRect().width,client:e.clientWidth,scroll:e.scrollWidth,display:getComputedStyle(e).display,grid:getComputedStyle(e).gridTemplateColumns}));}),null,2));
            assert.deepEqual(await page.locator('.opp-card').evaluateAll(es=>es.map(e=>e.dataset.opportunity)),groups.map(g=>g.id));
            const performanceDialog=page.locator('[data-opportunities-evidence-dialog]');
            assert.equal(await performanceDialog.evaluate(e=>e.open),false);
            await page.locator('[data-evidence-open-report]').click();
            const report=page.locator('[data-opportunities-evidence-report]');
            assert.equal(await performanceDialog.evaluate(e=>e.open),true);
            assert.equal(await report.locator('table').count(),0,'empty performance popup stays compact');
            await page.locator('[data-evidence-report-close]').click();
            await page.locator('[data-open-filters]').click();
            const dialog=page.locator('[data-opportunities-filter-dialog]');
            const filter=key=>dialog.locator('[data-filter="'+key+'"]');
            await filter('query').fill('does-not-exist');
            await page.locator('[data-apply-filters]').click();assert.equal(await page.locator('.opp-card').count(),0);
            await page.screenshot({animations:'disabled',path:dir+'/empty.png'});
            await page.locator('[data-remove-filter="query"]').click();assert.equal(await page.locator('.opp-card').count(),groups.length);
            await page.locator('[data-open-filters]').click();
            await dialog.locator('[data-filter-choice="tier"][data-value="4"]').click();
            await dialog.locator('[data-filter-choice="enchant"][data-value="1"]').click();
            await filter('minDeviation').fill('20');await filter('minNet').fill('1');await filter('minReturn').fill('1');
            await dialog.locator('[data-confidence="0.35"]').click();await filter('execution').selectOption('transport');await filter('watched').selectOption('yes');await filter('action').selectOption('transport');
            await page.locator('[data-apply-filters]').click();assert.ok(await page.locator('[data-remove-filter]').count()>=8);
            await page.screenshot({animations:'disabled',path:dir+'/many-filters.png'});
            await page.locator('[data-remove-filter="tier"]').click();assert.equal(await page.locator('[data-remove-filter="tier"]').count(),0);
            await page.locator('[data-clear-filters]').click();assert.equal(await page.locator('.opp-card').count(),groups.length);
            await page.locator('[data-open-filters]').click();
            const widget=dialog.locator('.autocomplete').filter({has:page.locator('[data-filter="action"]')});
            await widget.locator('.autocomplete-input').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
            assert.notEqual(await filter('action').inputValue(),'','keyboard selects dropdown');
            await page.keyboard.press('Escape');await page.locator('[data-clear-filters]').click();
        }
        await settleViewport(page, {width:1440,height:900});
        await page.locator('.opp-card').filter({hasText:'kaynak rota'}).first().locator('.opp-card-go').click();
        const sheet=page.locator('[data-opportunities-sheet]');
        if(stage === 'after') await sheet.locator('[data-scenario-options] summary').click();
        await sheet.locator('[data-scenario-field="buySetup"]').waitFor();
        const wrap=sheet.locator('.form-floating').filter({has:page.locator('[data-scenario-field="buySetup"]')});
        await wrap.locator('.autocomplete-input').click();
        const diagnostic=await page.locator('.autocomplete-menu:not([hidden])').evaluate(menu=>{const r=menu.getBoundingClientRect();const hit=document.elementFromPoint(r.x+10,r.y+10);return {parent:menu.parentElement.tagName,inDialog:!!menu.closest('dialog'),visibleHit:!!hit&&menu.contains(hit),color:getComputedStyle(menu).color,background:getComputedStyle(menu).backgroundColor,zIndex:getComputedStyle(menu).zIndex};});
        if(stage==='after'){assert.equal(diagnostic.inDialog,true);assert.equal(diagnostic.visibleHit,true);}
        fs.writeFileSync(dir+'/dropdown.json',JSON.stringify(diagnostic,null,2));
        await page.screenshot({animations:'disabled',path:dir+'/detail-dropdown.png'});
        if(stage==='after'){
            await page.keyboard.press('Escape');
            await sheet.locator('[data-tab="opportunity"]').focus();await page.keyboard.press('ArrowRight');
            assert.equal(await sheet.locator('[data-tab="control"]').getAttribute('aria-selected'),'true');
            for(const [width,height]of sizes){await settleViewport(page, {width,height});await page.screenshot({animations:'disabled',path:dir+'/control-'+width+'.png'});const v=await sheet.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(v.scroll<=v.width+1);}
            await sheet.locator('[data-tab="control"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await sheet.locator('[data-tab="trade"]').getAttribute('aria-selected'),'true');
            await sheet.locator('[data-tab="opportunity"]').click();await settleViewport(page, {width:1440,height:900});
            const base=Object.fromEntries([...await page.locator('.opp-card').evaluateAll(es=>es.map(e=>[e.dataset.opportunity,e.getBoundingClientRect().height]))]);
            await page.locator('[data-opportunities-close]').click();
            await page.evaluate(()=>{document.querySelectorAll('.opp-card [data-copy-item-name]').forEach(e=>{e.textContent='A very long legendary enchanted item name with many words for responsive layout verification';e.setAttribute('data-copy-item-name',e.textContent);});});
            for(const [width,height]of sizes){await settleViewport(page, {width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const heights=await page.locator('.opp-card').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(Math.max(...heights)-Math.min(...heights)<1);await page.screenshot({animations:'disabled',path:dir+'/long-names-'+width+'.png'});}
        }
        console.log(stage,diagnostic);
        assert.deepEqual(errors,[]);
    }finally{await browser.close();repo.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
