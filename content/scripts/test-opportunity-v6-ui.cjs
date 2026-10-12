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
    const dir = 'docs/opportunity-v6';
    const read = name => JSON.parse(gunzipSync(fs.readFileSync(`${dir}/${name}.json.gz`)));
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
            return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
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
        const typedRow=groups.find(row=>row.city&&row.primary?.id);
        assert.ok(typedRow,'frozen real scan has a city and strategy type');
        await page.locator('[data-open-filters]').click();
        const filters=page.locator('[data-opportunities-filter-dialog]');
        await filters.locator(`[data-view="${typedRow.primary.id}"]`).click();
        await filters.locator('[data-city-field="opp-city"] [data-city-input]').selectOption(typedRow.city);
        await page.locator('[data-apply-filters]').click();
        assert.ok(await page.locator(`.opp-card[data-opportunity="${typedRow.id}"]`).count(), 'city and strategy filters retain the matching real snapshot opportunity');
        await page.locator('[data-clear-filters]').click();
        assert.equal(await page.locator('.opp-card').count(),groups.length,'clearing city and strategy restores the snapshot list');
        const card=page.locator('.opp-card').filter({hasText:'kaynak rota'}).first();
        await card.locator('.opp-card-go').click();
        const sheet=page.locator('[data-opportunities-sheet]'), evidence=sheet.locator('[data-evidence-detail]'), transaction=sheet.locator('[data-evidence-transaction]');
        await sheet.locator('[data-tab="control"]').click();
        const buy=evidence.locator('[data-evidence-check-form="buy"]'), sell=evidence.locator('[data-evidence-check-form="sell"]');
        assert.equal(await evidence.locator('[data-evidence-field="side"]').count(),0,'side dropdown removed');
        await page.waitForFunction(()=>!document.querySelector('[data-evidence-check-form="buy"] button.btn-primary').disabled);
        await buy.locator('button.btn-primary').click();
        await page.waitForFunction(()=>document.querySelector('[data-evidence-progress]').textContent.includes('1/2 taraf'));
        assert.equal(repo.state.checks.length,1);
        const signature=JSON.stringify(repo.state.signals), id=repo.state.checks[0].signalId;
        assert.equal(Object.keys(repo.state.signals[id].legs).length,2);
        // Same commands, independent legs. A lost ACK survives a page reload without a duplicate.
        await sell.locator('[data-evidence-result="changed"]').click();
        await sell.locator('[data-evidence-field="observedPrice-sell"]').fill('110');
        failResponse=true;await sell.locator('button.btn-primary').click();
        await evidence.locator('[data-evidence-retry]').waitFor();assert.equal(repo.state.checks.length,2);
        await page.reload();await page.locator('.opp-card').first().waitFor();
        await page.locator('.opp-card').filter({hasText:'kaynak rota'}).first().locator('.opp-card-go').click();
        await sheet.locator('[data-tab="control"]').click();await evidence.locator('[data-evidence-retry]').click();
        await page.waitForFunction(()=>!localStorage.getItem('opp-evidence-outbox-v1'));assert.equal(repo.state.checks.length,2);
        assert.equal(repo.state.checks[1].observedPrice,110);
        await sell.locator('[data-evidence-result="correct"]').click();await sell.locator('button.btn-primary').click();
        await page.waitForFunction(()=>document.querySelector('[data-evidence-progress]').textContent.includes('2/2 taraf'));
        await sheet.locator('[data-tab="trade"]').click();
        const start=transaction.locator('[data-evidence-start-form]');
        await start.locator('[data-evidence-field="initialPrice"]').fill('100');
        await start.locator('[data-evidence-field="initialQuantity"]').fill('10');
        await start.locator('details summary').click();await start.locator('[data-evidence-field="initialFee"]').fill('10');
        await start.locator('button.btn-primary').click();await transaction.locator('[data-evidence-event-form]').waitFor();
        assert.equal(Object.values(repo.state.trades).length,1);
        const tid=Object.keys(repo.state.trades)[0],form=transaction.locator('[data-evidence-event-form]');
        const {TRADE_EVENTS}=await import('../js/core/opportunity-evidence.mjs');
        const event=async(type,values={})=>{
            const before=repo.state.trades[tid].events.length;
            if(!await form.locator('details').evaluate(e=>e.open))await form.locator('details summary').click();
            const widget=form.locator('.autocomplete').filter({has:page.locator('[data-evidence-field="eventType"]')});
            await widget.locator('.autocomplete-input').click();
            await page.locator('.autocomplete-menu:not([hidden])').getByRole('option',{name:TRADE_EVENTS[type],exact:true}).click();
            for(const [key,value]of Object.entries(values)){
                const field=form.locator(`[data-evidence-field="${key}"]`);
                if(key==='orderId'||key==='eventSide')await field.selectOption(value);else await field.fill(String(value));
            }
            await form.locator('button.btn-primary').click();
            await page.waitForFunction(count=>document.querySelector('[data-evidence-transaction]').textContent.includes(`${count} gerçekleşme / emir kaydı`),before+1);
        };
        await event('order',{eventSide:'sell',eventPrice:140,eventQuantity:10,eventFee:14});
        const order=repo.state.trades[tid].events.at(-1).id;assert.equal(tradeAccounting(repo.state.trades[tid]).realizedNet,-14);
        await event('sell',{orderId:order,eventPrice:140,eventQuantity:4,eventFee:0,eventTax:22});
        let a=tradeAccounting(repo.state.trades[tid]);assert.equal(a.remaining,6);assert.equal(a.inventoryCost,606);assert.equal(a.realizedNet,120);
        for(const [width,height]of VIEWPORTS){
            await settleViewport(page, {width,height});await page.screenshot({animations:'disabled',path:`docs/opportunity-v6-ui/after/partial-trade-${width}.png`});
            const widths=await sheet.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(widths.scroll<=widths.width+1,JSON.stringify(widths));
        }
        await settleViewport(page, {width:1440,height:900});
        await event('cancel',{orderId:order,eventTax:0,eventFee:0});
        await event('sell',{orderId:'',eventPrice:90,eventQuantity:6,eventTax:30,eventFee:0});
        await event('expense',{eventTax:0,eventFee:0,eventExtra:30});await event('complete');
        a=tradeAccounting(repo.state.trades[tid]);assert.equal(a.realizedNet,-6);assert.equal(a.cashFlow,-6);assert.equal(a.remaining,0);assert.equal(repo.state.trades[tid].status,'completed');
        assert.equal(JSON.stringify(repo.state.signals),signature,'market redraws never alter historical signal');
        const name=sheet.locator('[data-copy-item-name]').first(),copyName=await name.getAttribute('data-copy-item-name');
        await name.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),copyName);
        await page.screenshot({animations:'disabled',path:'docs/opportunity-v6-ui/after/completed-trade.png'});
        await page.locator('[data-opportunities-close]').click();
        await page.locator('[data-evidence-open-report]').click();
        const report=page.locator('[data-opportunities-evidence-report]');await report.locator('details summary').first().click();
        assert.ok((await report.textContent()).includes('Tamamlanan işlem'));assert.equal(evidenceReport(repo.state).completed,1);
        assert.equal(await page.locator('.opp-card').count(),groups.length);
        const ids=await page.locator('.opp-card').evaluateAll(cards=>cards.map(e=>e.dataset.opportunity));assert.deepEqual(ids,groups.map(row=>row.id),'V5 DOM ranking unchanged');
        await report.locator('[data-evidence-open-trade]').click();
        const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});assert.deepEqual(duplicates,[]);
        await report.locator('[data-evidence-field="filter-city"]').selectOption(repo.state.signals[id].toCity);
        assert.ok((await report.textContent()).includes('Tamamlandı'));
        for(const [width,height]of VIEWPORTS){
            await settleViewport(page, {width,height});await report.scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:`docs/opportunity-v6-ui/after/performance-${width}.png`});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'report page must not overflow');
        }
        const exported=page.waitForEvent('download');await report.locator('[data-evidence-export]').click();await(await exported).saveAs(path.join(temp,'export.json'));
        assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'export.json'))).trades[tid].events.length,7);
        repo.close();repo=new OpportunityEvidenceRepository(path.join(temp,'evidence.jsonl'));
        await page.reload();await page.locator('.opp-card').first().waitFor();await page.locator('[data-evidence-open-report]').click();await page.locator('[data-evidence-open-trade]').waitFor();
        assert.equal(tradeAccounting(repo.state.trades[tid]).realizedNet,-6);assert.deepEqual(errors,[]);
        console.log('Chrome V6 redesigned flow: two side cards, lost ACK/reload/dedupe, real fills and identical FIFO, native-dialog dropdown selection, keyboard copy, report filters/export/restart and five viewport sizes passed.');
    }finally{await browser.close();repo.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
