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
    for (const [itemId, city] of [['T4_MOUNT_HORSE', 'Brecilien'], ['T1_CARROT', 'Martlock']]) {
        const key = JSON.stringify([JSON.stringify(['europe', city, itemId, 1, 'sell']), 7]);
        snapshots[key] = { savedSnapshot: true, estimator: SALE_ESTIMATOR, reliable: true, price: 123, days: 7,
            validUntil: '2020-01-01T00:00:00Z', savedAt: '2020-01-01T00:00:00Z', samples: 90 };
    }
    const snapshotKey = 'albiontools.v4.potential-price-snapshots.v2';
    entries.set(snapshotKey, JSON.stringify(snapshots));
    let failSave = false, historyCalls = 0;
    const end = Math.floor(Date.now() / 86400000) * 86400000;
    const data = Array.from({ length: 90 }, (_, day) => ({ timestamp: new Date(end - (day + 1) * 86400000).toISOString(), avg_price: 30000, item_count: 20 }));
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
                if (failSave && body?.changes?.some(change => change.key === snapshotKey)) return route.fulfill({ status: 503, json: { error: 'isolated write failure' } });
                const result = route.request().method() === 'GET' ? repository.snapshot()
                    : url.pathname.endsWith('/import') ? repository.importLegacy(body.data)
                    : url.pathname.endsWith('/backup') ? repository.status() : repository.write(body.changes);
                return route.fulfill({ json: result });
            }
            if (url.pathname.includes('/stats/history/')) { historyCalls++; return route.fulfill({ json: [{ item_id: 'T4_MOUNT_HORSE', location: 'Brecilien', quality: 1, data }] }); }
            if (url.pathname.includes('/market/')) return route.fulfill({ json: { server: 'europe', rows: [] } });
            if (url.pathname.includes('/stats/prices/')) return route.fulfill({ json: [] });
            if (url.pathname === '/api/v1/trades') return route.fulfill({ json: { server: 'europe', trades: [] } });
            return route.fulfill({ json: { ready: true, server: 'europe' } });
        }
        if (url.hostname !== 'localhost') return route.abort();
        const file = path.resolve(__dirname, '../..', '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    try {
        await page.goto('http://localhost:3000/pages/tools/potential-prices/');
        await page.locator('tbody tr').first().waitFor();
        await page.locator('input[data-filter="search"]').fill('MOUNT_HORSE');
        assert.equal(await page.locator('tbody tr').count(), 1);
        assert((await page.locator('tbody').innerText()).includes('Kanıt yok'));
        await page.locator('[data-filter="priceState"][data-value="usable"]').click();
        await page.locator('[data-refresh-prices]').click();
        await page.getByRole('alert').filter({ hasText: 'Güncellenecek kayıt yok' }).waitFor();
        assert.equal(historyCalls, 0, 'empty price-state selection does not refresh excluded records');
        await page.locator('[data-filter="priceState"][data-value="no-evidence"]').click();
        failSave = true;
        await page.locator('[data-refresh-prices]').click();
        await page.getByRole('alert').filter({ hasText: 'isolated write failure' }).waitFor();
        assert((await page.locator('tbody').innerText()).includes('Kanıt yok'), 'unconfirmed estimates are not displayed');
        failSave = false;
        await page.locator('[data-refresh-prices]').click();
        await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0 && !document.querySelector('[data-refresh-prices]').disabled);
        await page.locator('[data-filter="priceState"][data-value=""]').click();
        assert.equal(await page.locator('tbody tr').count(), 3, 'refreshed records leave the previous price state');
        assert.equal(await page.locator('tbody').getByText('Kullanılabilir', { exact: true }).count(), 3);
        assert(historyCalls > 0, 'refresh fetches actual market history');
        const summary = page.locator('.summary [data-refresh-progress]');
        assert.equal(await summary.getAttribute('data-monitor-phase'), 'complete');
        assert.equal(await summary.locator('progress').evaluate(el => el.value / el.max), 1);
        assert.deepEqual(await summary.locator('dt').allTextContents(), ['Başarılı', 'Hata', 'Kalan', 'Tekrar denenecek']);
        for (const width of [1440, 992, 390, 320]) {
            await page.setViewportSize({ width, height: 800 });
            assert(await summary.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'summary fits ' + width);
        }
        await page.setViewportSize({ width: 1440, height: 800 });
        if (process.env.POTENTIAL_PRICE_SCREENSHOT) await page.screenshot({ path: process.env.POTENTIAL_PRICE_SCREENSHOT });
        const saved = JSON.parse(repository.snapshot().entries.find(row => row.key === snapshotKey).value);
        assert.equal(Object.values(saved).filter(row => row.reliable && row.price === 30000).length, 3);
        assert.equal(Object.values(saved).filter(row => row.price === 123).length, 1, 'unrelated item is preserved');
        await page.locator('[data-view-switch] [data-view="cards"]').click();
        assert.equal(await page.locator('.potential-price-card .potential-price-value strong').first().innerText(), '30.000');
        await page.evaluate(async () => (await import('/content/js/core/durable-storage.mjs')).flushDurableWrites());
        await page.reload();
        await page.locator('.potential-price-card').first().waitFor();
        assert.equal(await page.locator('.potential-price-card').count(), 3, 'confirmed forecasts survive reload');
        assert.deepEqual(errors, []);
        console.log('Potential refresh UI: filtered live history, atomic save failure, all horizons, cards and SQLite reload passed.');
    } catch (error) { console.error('Page errors:', errors); throw error; }
    finally { await browser.close(); repository.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
