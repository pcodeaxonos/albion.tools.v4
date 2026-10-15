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
    const { UserDataRepository } = await import('./user-data-repository.mjs');
    const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'potential-prices-ui-'));
    const repository = new UserDataRepository(path.join(temp, 'data.sqlite'));
    const entries = { set(key, value) {
        const revision = repository.snapshot().entries.find(row => row.key === key)?.revision || 0;
        repository.write([{ key, value, revision }]);
    } };
    entries.set('albiontools.v4.siteTools', JSON.stringify(JSON.parse(fs.readFileSync('data/site-tools.json', 'utf8')).filter(row => row.id !== 'potential-prices')));
    const { SALE_ESTIMATOR } = await import('../js/core/potential-sale-horizon.mjs');
    const snapshots = {};
    for (let i = 0; i < 55; i++) {
        const itemId = i === 1 ? 'T4_MOUNT_HORSE' : 'T1_CARROT';
        const key = JSON.stringify([JSON.stringify(['europe', i === 1 ? 'Brecilien' : i % 2 ? 'Martlock' : 'Brecilien', itemId, 1, 'sell']), i + 1]);
        snapshots[key] = { savedSnapshot: true, estimator: SALE_ESTIMATOR, reliable: i % 3 !== 0, price: i % 3 ? 100 + i : null, days: i + 1,
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
        const file = path.resolve(__dirname, '../..', '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    try {
        await page.goto('http://localhost:3000/pages/tools/potential-prices/');
        await page.locator('tbody tr').first().waitFor();
        const search = page.locator('input[data-filter="search"]');
        assert.equal(await page.locator('.tool-split-controls input').first().getAttribute('data-filter'), 'search');
        await search.fill('MOUNT_HORSE');
        assert.equal(await page.locator('tbody tr').count(), 1, 'text search matches item ID');
        await search.fill('no matching item');
        assert.equal(await page.locator('tbody tr').count(), 0);
        assert.equal(await search.evaluate(el => el === document.activeElement), true, 'typing retains focus');
        await search.fill('horse');
        assert.equal(await page.locator('tbody tr').count(), 1, 'text search matches item name');
        await page.locator('[data-filter="itemId"]').selectOption('T4_MOUNT_HORSE');
        await page.locator('[data-city-field="potential-price-city"] select').selectOption('Brecilien');
        await page.locator('[data-filter="sort"][data-value="price"]').click();
        await page.locator('[data-filter="direction"][data-value="asc"]').click();
        await page.locator('[data-view-switch] [data-view="cards"]').click();
        await page.waitForFunction(async () => {
            const m = await import('/content/js/core/durable-storage.mjs');
            await m.flushDurableWrites();
            return true;
        });
        await page.reload();
        await page.locator('.potential-price-card').waitFor();
        assert.equal(await search.inputValue(), 'horse', 'text search survives reload');
        assert.equal(await page.locator('[data-filter="itemId"]').inputValue(), 'T4_MOUNT_HORSE');
        assert.equal(await page.locator('[data-city-field="potential-price-city"] select').inputValue(), 'Brecilien');
        for (const [key, value] of [['sort', 'price'], ['direction', 'asc']]) {
            assert.equal(await page.locator(key === 'direction' ? '[data-filter="direction"][aria-label="Artan"]' : `[data-filter="${key}"][data-value="${value}"]`).getAttribute('aria-pressed'), 'true');
        }
        assert.equal(await page.locator('.potential-price-card').count(), 1);
        const card = page.locator('.potential-price-card');
        const geometry = await card.evaluate(el => {
            const image = el.querySelector('.item-visual').getBoundingClientRect();
            const city = el.querySelector('.potential-price-card-market [data-city]').getBoundingClientRect();
            return { imageWidth: image.width, imageHeight: image.height, cityTop: city.top, imageBottom: image.bottom, fontSize: getComputedStyle(el.querySelector('h2')).fontSize };
        });
        assert(geometry.imageWidth >= 28 && Math.abs(geometry.imageWidth - geometry.imageHeight) < 1);
        assert(geometry.cityTop >= geometry.imageBottom, 'approved card city row follows product image');
        assert(parseFloat(geometry.fontSize) >= 10);
        await card.evaluate(el => { el.parentElement.style.gridTemplateColumns = '320px'; });
        const compact = await card.evaluate(el => {
            const city = el.querySelector('.potential-price-card-market [data-city]').getBoundingClientRect();
            const badge = el.querySelector('.potential-price-card-heading').getBoundingClientRect();
            return { city, badge, width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth };
        });
        assert.equal(compact.width, 320);
        assert(compact.city.right <= compact.badge.left + 1, 'city and market identity remain separate at 320px');
        assert.equal(compact.overflow, false);
        await card.locator('img').evaluate(img => img.decode());
        if (process.env.POTENTIAL_CARD_PREVIEW) await card.screenshot({ path: process.env.POTENTIAL_CARD_PREVIEW });
        await page.locator('[data-reset]').click();
        assert.equal(await search.inputValue(), '', 'reset clears text search');
        await page.locator('[data-view-switch] [data-view="list"]').click();

        await page.waitForFunction(async () => { await (await import('/content/js/core/durable-storage.mjs')).flushDurableWrites(); return true; });
        await page.reload();
        await page.locator('tbody tr').first().waitFor();
        assert(await page.locator('tbody tr').count() > 0, 'reset and list view survive reload');
        assert.deepEqual(errors, []);
        console.log('Potential price preferences: item, city, sorting, direction, cards/list, reset survive SQLite-backed reload.');
    } catch (error) {
        console.error('Page errors:', errors, 'URL:', page.url(), 'Content:', (await page.locator('body').innerText()).slice(0, 1600));
        throw error;
    } finally { await browser.close(); repository.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
