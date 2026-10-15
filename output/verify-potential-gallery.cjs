const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    let failRead = false;
    page.on('pageerror', error => errors.push(error.message));
    const { UserDataRepository } = await import('../content/scripts/user-data-repository.mjs');
    const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'potential-prices-ui-'));
    const repository = new UserDataRepository(path.join(temp, 'data.sqlite'));
    const entries = { set(key, value) {
        const revision = repository.snapshot().entries.find(row => row.key === key)?.revision || 0;
        repository.write([{ key, value, revision }]);
    } };
    entries.set('albiontools.v4.siteTools', JSON.stringify(JSON.parse(fs.readFileSync('data/site-tools.json', 'utf8')).filter(row => row.id !== 'potential-prices')));
    const { SALE_ESTIMATOR } = await import('../content/js/core/potential-sale-horizon.mjs');
    const snapshots = {};
    for (let i = 0; i < 55; i++) {
        const itemId = i === 1 ? 'T4_MOUNT_HORSE' : 'T1_CARROT';
        const key = JSON.stringify([JSON.stringify(['europe', i === 1 ? 'Brecilien' : i % 2 ? 'Martlock' : 'Brecilien', itemId, 1, 'sell']), i === 3 ? 7 : i + 1]);
        snapshots[key] = { savedSnapshot: true, estimator: SALE_ESTIMATOR, reliable: i % 3 !== 0, price: i % 3 ? 100 + i : null, days: i === 3 ? 7 : i + 1,
            validUntil: new Date(Date.now() + 86400000).toISOString(), savedAt: new Date(Date.now() - i * 1000).toISOString(), samples: 10,
            source: 'UI fixture', reason: 'Yetersiz veri' };
        if (i === 0) snapshots[key].estimator = 'legacy';
        if (i === 3) Object.assign(snapshots[key], { reliable: true, price: 999, validUntil: '2020-01-01T00:00:00Z' });
        if (i === 6) snapshots[key].indicativePrice = 888;
    }
    entries.set('albiontools.v4.potential-price-snapshots.v2', JSON.stringify(snapshots));
    await page.addInitScript(() => {
        localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.copied = value; } } });
    });
    // Isolated APIs: startup seeds and reads cannot touch the user's database.
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname.includes('/user-data')) {
                if (failRead && route.request().method() === 'GET') return route.fulfill({ status: 503, json: { error: 'isolated read failure' } });
                const body = route.request().postDataJSON();
                const result = route.request().method() === 'GET' ? repository.snapshot()
                    : url.pathname.endsWith('/import') ? repository.importLegacy(body.data)
                    : url.pathname.endsWith('/backup') ? repository.status() : repository.write(body.changes);
                return route.fulfill({ json: result });
            }
            return route.fulfill({ json: { ready: true, server: 'europe' } });
        }
        if (url.hostname !== 'localhost') return route.abort();
        const file = path.resolve(__dirname, '..', '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    try {
        await page.goto('http://localhost:3000/pages/tools/potential-prices/');
        await page.locator('[data-view-switch] [data-view="cards"]').click();
        await page.locator('.potential-price-card').first().waitFor();
        for (const width of [1440, 992, 390, 320]) {
            await page.setViewportSize({width, height: width >= 992 ? 720 : 900});
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`);
            const geometry = await page.locator('.potential-price-card').first().evaluate(card => {
                const rect = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
                return {card:rect(card), icon:rect(card.querySelector('.item-visual')), product:rect(card.querySelector('.potential-price-item')), market:rect(card.querySelector('.potential-price-card-market')), value:rect(card.querySelector('.potential-price-value')), detail:rect(card.querySelector('[data-detail]'))};
            });
            assert.equal(geometry.card.height,257);
            assert.equal(geometry.icon.width,49); assert.equal(geometry.icon.height,49);
            assert(geometry.product.bottom <= geometry.market.y + 1);
            assert(geometry.value.right <= geometry.detail.x + 1);
            assert(geometry.detail.right <= geometry.card.right);
            await page.locator('.potential-price-card').first().screenshot({path:`output/potential-gallery-card-${width}.png`});
            await page.screenshot({path:`output/potential-gallery-${width}.png`,fullPage:width < 992});
            console.log(width, JSON.stringify(geometry));
        }
        await page.locator('[data-copy-item-name]').first().click();
        assert(await page.evaluate(()=>!!window.copied)); await page.locator('[data-copy-item-name]').first().focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
        await page.locator('[data-detail]').first().click(); assert(await page.locator('[data-price-dialog]').evaluate(el=>el.open));
        await page.locator('[data-detail-close]').click();
        await page.setViewportSize({width:320,height:900});
        await page.locator('.potential-price-card').first().evaluate(card=>{card.querySelector('[data-copy-item-name]').textContent='Grandmaster’s Armored Horse with an exceptionally long item name'; card.querySelector('.city-name').textContent='Fort Sterling';});
        await page.locator('.potential-price-card').first().screenshot({path:'output/potential-gallery-long.png'});
        assert.deepEqual(errors,[]);
        const reference=await browser.newPage({viewport:{width:1440,height:1000}});
        await reference.goto('file:///F:/downloads/chrome/albion_fiyat_kartlari_10_editorial_tasarim_v3.html');
        await reference.locator('.v2').screenshot({path:'output/potential-gallery-reference.png'});
        console.log('Gallery checks passed; isolated fixture data, no user database writes.');
    } finally { await browser.close(); repository.close(); fs.rmSync(temp,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});