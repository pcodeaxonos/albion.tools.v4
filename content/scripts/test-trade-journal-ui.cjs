const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
    const { UserDataRepository } = await import('./user-data-repository.mjs');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(),'trade-journal-test-'));
    const screenshots = path.resolve(__dirname,'../../output/trade-journal-verification');
    fs.mkdirSync(screenshots,{recursive:true});
    let repository = new UserDataRepository(path.join(temp,'test.sqlite'));
    const { journalDay } = await import('../js/core/trade-journal.mjs');
    const day = journalDay(Date.now());
    const fill = id => ({sourceId:String(id),characterGuid:'test-character',kind:'instant_sell',itemId:'T4_MAIN_SWORD',itemName:'Sword',clusterIndex:'3005',locationName:'Martlock',quality:2,quantity:2,unitPriceSilver:100,totalPriceSilver:200,occurredAt:day+'T10:00:00Z'});
    let rows = Array.from({length:6},(_,i)=>fill(i)), failedWrite = false, failedSource = false;
    const browser = await chromium.launch({channel:'chrome',headless:true});
    const errors = [];
    try {
        const context = await browser.newContext({viewport:{width:1366,height:768}});
        await context.addInitScript(() => {
            localStorage.setItem('albiontools.v4.dailyBonusRedirectAt',String(Date.now()));
            window.journalCopied = [];
            Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.journalCopied.push(value)}});
            window.journalSources = [];
            window.EventSource = class { constructor(url){this.url=url;this.readyState=0;this.listeners={};window.journalSources.push(this);} addEventListener(name,handler){this.listeners[name]=handler;} close(){} static OPEN=1; };
        });
        await context.route('**/*',async route => {
            const url = new URL(route.request().url());
            if (url.pathname.startsWith('/api/')) {
                if (url.pathname.includes('/user-data')) {
                    const body = route.request().postDataJSON();
                    if (failedWrite && route.request().method()==='PUT' && body.changes?.some(c=>c.key.includes('tradeJournalRead'))) return route.fulfill({status:503,json:{error:'test write failure'}});
                    const result = route.request().method()==='GET' ? repository.snapshot() : url.pathname.endsWith('/import') ? repository.importLegacy(body.data) : url.pathname.endsWith('/backup') ? repository.status() : repository.write(body.changes);
                    return route.fulfill({json:result});
                }
                if (url.pathname==='/api/v1/trades/status') return route.fulfill({json:{ready:!failedSource,error:failedSource?'SAT unavailable':null}});
                if (url.pathname==='/api/v1/trades') return route.fulfill({json:{server:'europe',scope:'personal',path:'test-only-archive',at:new Date().toISOString(),trades:rows}});
                return route.fulfill({json:{ready:true,server:'europe',items:[],rows:[]}});
            }
            if (url.hostname!=='localhost') return route.abort();
            const file = path.resolve(__dirname,'../..','.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
            return fs.existsSync(file) ? route.fulfill({path:file}) : route.fulfill({status:404,body:''});
        });
        const page = await context.newPage();
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto('http://localhost/pages/tools/trade-journal/');
        await page.getByText('1 okunmamış grup',{exact:true}).waitFor();
        await page.evaluate(rows => {
            const source=window.journalSources.find(s=>s.url.includes('/trades/updates'));
            source.listeners.added({data:JSON.stringify({trades:rows,at:new Date().toISOString()})});
        },rows);
        await page.getByText('6 satış ve 0 alış, 1 ürün/şehir/kalite grubunda gerçekleşti.',{exact:true}).waitFor();
        assert.ok(await page.locator('.sidebar-link').filter({hasText:'Ticaret Günlüğü'}).count());
        const item = page.locator('[data-copy-item-name]').first();
        await item.click(); await item.press('Enter'); await item.press('Space');
        assert.equal(await page.evaluate(()=>window.journalCopied.length),3);
        assert.equal(await page.locator('dialog[open]').count(),0,'copy cannot open its parent card');
        assert.equal(await page.locator('[data-unread]').innerText(),'1 okunmamış grup');
        for (const [width,height] of [[1366,768],[1920,1080],[992,600],[768,900],[390,844],[320,720]]) {
            await page.setViewportSize({width,height});
            await page.waitForTimeout(80);
            const geometry = await page.evaluate(()=>({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight,background:getComputedStyle(document.querySelector('main')).getPropertyValue('--page-head-image')}));
            assert.ok(geometry.x<=2,`${width}: horizontal overflow ${geometry.x}`);
            if(width>=992) assert.ok(geometry.y<=2,`${width}: page vertical overflow ${geometry.y}`);
            assert.ok(geometry.background.includes(width<=768?'mobile.webp':'desktop.png'));
            await page.screenshot({path:path.join(screenshots,`journal-${width}.png`),fullPage:true});
        }
        const images = await page.evaluate(async()=>Promise.all(['desktop/trade-journal-head-desktop.png','mobile/trade-journal-head-mobile.webp'].map(async file=>{const image=new Image();image.src='/content/images/page-heads/'+file;await image.decode();return [image.naturalWidth,image.naturalHeight];})));
        assert.deepEqual(images,[[2000,200],[1200,480]]);
        await page.locator('[data-group]').first().click();
        await page.getByText('0 okunmamış grup',{exact:true}).waitFor();
        await page.locator('[data-close]').click();
        const other = await context.newPage();
        await other.goto('http://localhost/pages/tools/trade-journal/');
        await other.getByText('0 okunmamış grup',{exact:true}).waitFor();
        await other.locator('[data-mark]').first().click();
        await page.getByText('1 okunmamış grup',{exact:true}).waitFor();
        await page.locator('[data-read-day]').click();
        await page.getByText('0 okunmamış grup',{exact:true}).waitFor();
        rows.push(fill(7));
        await page.locator('[data-refresh]').click();
        await page.getByText('1 okunmamış grup',{exact:true}).waitFor();
        failedWrite = true;
        await page.locator('[data-mark]').first().click();
        await page.getByText(/Okunma durumu kaydedilemedi/).waitFor();
        assert.equal(await page.locator('[data-unread]').innerText(),'1 okunmamış grup');
        failedWrite = false;
        await page.locator('[data-read-day]').click();
        await page.getByText('0 okunmamış grup',{exact:true}).waitFor();
        repository.close(); repository = new UserDataRepository(path.join(temp,'test.sqlite'));
        await page.reload(); await page.getByText('0 okunmamış grup',{exact:true}).waitFor();
        await page.locator('[data-only-unread]').check();
        assert.equal(await page.locator('[data-group]').count(),0);
        failedSource = true;
        await page.locator('[data-refresh]').click();
        await page.getByText(/Veri alınamadı: SAT unavailable/).waitFor();
        assert.ok(await page.getByText(/Son alınan kayıtlar gösteriliyor/).count());
        failedSource = false; rows=[];
        await page.locator('[data-refresh]').click();
        await page.getByText('Seçili günde gerçekleşmiş alış/satış kaydı yok.',{exact:true}).waitFor();
        if (process.env.JOURNAL_REAL_AUDIT === '1') {
            const { findEuropeTradesFile, readTradesFile } = await import('./sat-trades/find-trades-file.mjs');
            const { normalizeTrades, loadLocationDisplayNames } = await import('./sat-trades/normalize.mjs');
            const { journalGroups, mergeJournalTrades } = await import('../js/core/trade-journal.mjs');
            const archive = findEuropeTradesFile({localAppData:path.join(os.homedir(),'AppData','Local')});
            rows = normalizeTrades((await readTradesFile(archive.path)).records,loadLocationDisplayNames());
            const latest = rows.map(t=>t.occurredAt).filter(t=>Number.isFinite(Date.parse(t))).sort().at(-1);
            const realDay = journalDay(latest);
            const realModel = journalGroups(mergeJournalTrades(new Map(),rows,true),realDay);
            await page.locator('[data-only-unread]').uncheck();
            await page.locator('[data-day]').fill(realDay); await page.locator('[data-day]').dispatchEvent('change');
            await page.locator('[data-refresh]').click();
            await page.waitForFunction(expected=>document.querySelector('[data-content]')?.textContent.includes(expected),`${realModel.groups.length} ürün/şehir/kalite grubunda`);
            for(const [width,height] of [[1366,768],[390,844]]) {
                await page.setViewportSize({width,height});
                await page.waitForTimeout(250);
                if(width<768 && await page.evaluate(()=>document.body.classList.contains('app-sidebar-open'))) await page.locator('.sidebar-toggler').click();
                await page.waitForTimeout(250);
                assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(el=>el.className)),[],`real data: ${width}px overflowing content`);
                await page.screenshot({path:path.join(screenshots,`journal-real-${width}.png`),fullPage:true});
            }
            console.log(`REAL ARCHIVE: ${rows.length} records; ${realDay}: ${realModel.count} fills, ${realModel.groups.length} groups, sales=${realModel.sales}, buys=${realModel.buys}`);
        }
        assert.deepEqual(errors,[]);
        console.log('PASS journal UI: six viewports, exact head pixels, menu, group details, SQLite restart, two windows, new fill, failed write, unread filter, source failure, empty state');
        console.log('Screenshots: '+screenshots);
    } finally { await browser.close(); repository.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
