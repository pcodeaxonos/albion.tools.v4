const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    let releaseGeometry;
    const geometryGate = new Promise(resolve => { releaseGeometry = resolve; });
    let personalRequests = 0, marketRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('albiontools.v4.settings', JSON.stringify({ dataSync: false, server: 'europe', premium: true }));
        localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async name => { window.copiedItemName = name; } } });
    });
    // Every API is intercepted, including local-data writes: this isolated UI
    // fixture cannot change the user's plans, hub archive or request budget.
    await page.route('http://localhost:*/**', async route => {
        const path = require('node:path');
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/data/island-planner-v2-royal-slot-geometry.json')) await geometryGate;
        const file = path.resolve(__dirname, '../../', '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
        const root = path.resolve(__dirname, '../../');
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ path: file });
    });
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/v1/trades') {
            personalRequests++;
            const ids = url.searchParams.get('items').split(','), cities = url.searchParams.get('locations').split(',');
            const trades = ids.flatMap(itemId => cities.flatMap(locationName => ['buy', 'sell'].flatMap(side => Array.from({ length: 5 }, (_, day) =>
                Array.from({ length: 2 }, (_, n) => ({ sourceId: `${itemId}|${locationName}|${side}|${day}|${n}`, kind: `instant_${side}`, itemId,
                    locationName, quality: 1, quantity: 1, unitPriceSilver: side === 'buy' ? 100 : 200,
                    occurredAt: new Date(Date.now() - (day + 1) * 86400000).toISOString() }))).flat())));
            return route.fulfill({ json: { server: url.searchParams.get('server'), scope: 'personal', filtered: true, trades } });
        }
        if (url.pathname.includes('sales-history')) { marketRequests++; return route.fulfill({ json: { server: 'europe', rows: [] } }); }
        if (url.pathname.includes('/stats/prices/')) {
            const ids = decodeURIComponent(url.pathname.split('/').at(-1).replace('.json', '')).split(',');
            const cities = url.searchParams.get('locations').split(',');
            return route.fulfill({ json: ids.flatMap(item_id => cities.map(city => ({ item_id, city, quality: 1,
                sell_price_min: 200, buy_price_max: 100, sell_price_min_date: new Date().toISOString(), buy_price_max_date: new Date().toISOString() }))) });
        }
        if (url.pathname.includes('/local-data')) return route.fulfill({ status: 503, json: { error: 'isolated test' } });
        return route.fulfill({ json: { server: 'europe', ready: true, adcRunning: true } });
    });
    try {
        await page.goto(`${process.env.ISLAND_UI_BASE_URL || 'http://localhost:3000'}/pages/tools/island-planner-v2/`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-v2-seed="potential"]').waitFor();
        assert(await page.locator('.island-v2-controls').isVisible(), 'controls render before geometry response');
        releaseGeometry();
        assert.equal(personalRequests, 0); assert.equal(marketRequests, 0);
        const getSlots = () => page.evaluate(async () => {
            const { V2_DRAFT_TABLE } = await import('/content/js/tools/island-planner-v2-config.js');
            const { getAll } = await import('/content/js/db/store.js');
            return JSON.stringify(getAll(V2_DRAFT_TABLE).map(row => ({ ...row, pricesUpdatedAt: undefined })));
        });
        const before = await getSlots();
        const initialHarvest = await page.locator('[data-v2-harvest][aria-pressed="true"]').getAttribute('data-v2-harvest');
        await page.locator('[data-v2-seed="potential"]').click();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-v2-potential-dialog] p')].some(row => row.textContent.includes('TOHUM') && row.textContent.includes('kaynak Kişisel')));
        assert.equal(await page.locator('[data-v2-harvest][aria-pressed="true"]').getAttribute('data-v2-harvest'), initialHarvest);
        await page.locator('[data-v2-harvest="potential"]').click();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-v2-potential-dialog] p')].some(row => row.textContent.includes('HASAT') && row.textContent.includes('Kişisel')));
        assert.ok(personalRequests >= 1);
        assert.deepEqual(await page.locator('[data-v2-potential-days]').allTextContents(), ['1G', '1H', '2H', '3H', '4H']);
        assert.equal(await page.locator('[data-v2-volume-number]').count(), 0);
        assert.equal(await page.locator('[data-v2-sales-share]').count(), 0);
        assert.equal(await page.locator('[data-v2-refill]').isDisabled(), true);
        // The selected prices may refresh persisted metadata, but never place an item.
        const current = await page.evaluate(async () => {
            const { readPlanTable } = await import('/content/js/tools/island-planner-v2/persistence.js');
            const { V2_DRAFT_TABLE, V2_STORAGE_KEY } = await import('/content/js/tools/island-planner-v2-config.js');
            return Object.values(readPlanTable(V2_DRAFT_TABLE, V2_STORAGE_KEY, true).plans).flatMap(plan => plan.slots).filter(slot => slot.item).length;
        });
        assert.equal(current, 0);
        await page.locator('[data-v2-potential-open]').click();
        assert.equal(await page.locator('[data-v2-potential-dialog]').evaluate(el => el.open), true);
        const copy = page.locator('[data-v2-potential-dialog] [data-copy-item-name]').first();
        const expectedName = await copy.getAttribute('data-copy-item-name');
        await copy.click(); await page.waitForFunction(name => window.copiedItemName === name, expectedName);
        await copy.press('Enter'); assert.equal(await page.evaluate(() => window.copiedItemName), expectedName);
        await page.locator('[data-v2-potential-close]').click();
        assert.equal(await page.locator('[data-v2-potential-dialog]').evaluate(el => el.open), false);
        await page.locator('[data-v2-potential-open]').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-v2-potential-dialog]').evaluate(el => el.open), false);
        fs.mkdirSync('docs/island-potential-price', { recursive: true });
        await page.screenshot({ path: 'docs/island-potential-price/desktop.png', fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-app-sidebar]').getBoundingClientRect().right <= 1);
        await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content')?.scrollTo(0, 0); });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const clipped = await page.locator('[data-v2-seed], [data-v2-harvest]').evaluateAll(buttons => buttons.filter(button => {
            const bounds = button.getBoundingClientRect(), parent = button.closest('.segmented-choice').getBoundingClientRect();
            return bounds.left < parent.left - 1 || bounds.right > parent.right + 1;
        }).length);
        assert.equal(clipped, 0, 'shared price choices wrap within their control');
        const clippedLabels = await page.locator('[data-v2-seed], [data-v2-harvest]').evaluateAll(buttons => buttons.filter(button => button.scrollWidth > button.clientWidth + 1).length);
        assert.equal(clippedLabels, 0, 'method names are readable in full');
        await page.screenshot({ path: 'docs/island-potential-price/mobile.png', fullPage: true });
        for (const [width, height] of [[1920,1080], [1440,900], [1280,720], [1024,768], [390,844]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(200);
            const geometry = await page.evaluate(() => {
                const island = document.querySelector('.island-v2-island').getBoundingClientRect();
                const image = document.querySelector('.island-v2-island-image').getBoundingClientRect();
                const summary = document.querySelector('.island-v2-summary').getBoundingClientRect();
                const layout = getComputedStyle(document.querySelector('.island-v2-layout'));
                return { width: island.width, height: island.height, imageWidth: image.width, imageHeight: image.height,
                    summaryGap: summary.top - island.bottom, gap: parseFloat(layout.rowGap),
                    overflow: [document.documentElement, document.querySelector('.app-content')].some(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) };
            });
            assert(Math.abs(geometry.width - geometry.height) < 1, 'island grid must remain square');
            assert(Math.abs(geometry.imageWidth - geometry.imageHeight) < 1, 'image fills square grid');
            assert(geometry.width - geometry.imageWidth <= 2, 'image fills cell width');
            if (width >= 1200) assert(Math.abs(geometry.summaryGap - geometry.gap) < 1, 'summary follows square grid without empty space');
            assert(!geometry.overflow, 'page stays within viewport');
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ personalRequests, marketRequests, priceMethodsIndependent: true, selectionChangedSlots: false,
            itemNameMouseAndKeyboardCopy: true, desktopAndMobileVerified: true, isolatedApiFixture: true, initialDraftCaptured: Boolean(before) }));
    } catch (error) {
        console.error(error);
        console.error(JSON.stringify({ errors, personalRequests, marketRequests, url: page.url(),
            report: (await page.locator('[data-v2-potential-dialog]').allTextContents()).join(' ').slice(0, 1800),
            controls: (await page.locator('.island-v2-controls').allTextContents()).join(' ').slice(0, 600) }));
        throw error;
    } finally { releaseGeometry(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
