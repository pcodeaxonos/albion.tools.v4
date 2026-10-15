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
    const { SALE_ESTIMATOR, SALE_HORIZONS } = await import('../js/core/potential-sale-horizon.mjs');
    const fixtureItems = JSON.parse(fs.readFileSync('data/items.json', 'utf8'))
        .filter(row => /^T[1-8]_/.test(row.uniqueName) && !row.uniqueName.includes('@') && row.uniqueName !== 'T1_CARROT'
            && fs.existsSync(path.join('content/icons', `${row.uniqueName}.png`))).slice(0, 53).map(row => row.uniqueName);
    const itemIds = ['T1_CARROT', 'T4_BAG@1', ...fixtureItems];
    assert.equal(itemIds.length, 55);
    const snapshots = {};
    for (let i = 0; i < 55; i++) {
        const itemId = itemIds[i], days = SALE_HORIZONS[i % SALE_HORIZONS.length].days;
        const key = JSON.stringify([JSON.stringify(['europe', i % 2 ? 'Martlock' : 'Brecilien', itemId, 1, 'sell']), days]);
        snapshots[key] = { savedSnapshot: true, estimator: SALE_ESTIMATOR, reliable: i % 3 !== 0, price: i % 3 ? 100 + i : null, days,
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
        const file = path.resolve(__dirname, '../..', '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    try {
        await page.goto('http://localhost:3000/pages/tools/potential-prices/');
        const cityField = page.locator('[data-city-field="potential-price-city"]');
        await cityField.waitFor();
        assert.equal(await cityField.locator('select').count(), 1, 'city uses the configured standard picker');
        assert.equal(await page.locator('[data-filter="city"]').count(), 0, 'no generic city choice bypass');
        for (const key of ['server', 'side', 'quality']) {
            assert.equal(await page.locator(`button[data-filter="${key}"]`).count(), 0, `${key}: single-value filters are hidden`);
        }
        assert.equal(await page.locator('.sidebar-link[href="/pages/tools/potential-prices/"]').count(), 1, 'older saved catalog includes new routes');
        assert.equal(await page.locator('tbody tr').count(), 50);
        await page.locator('button[data-filter="tier"][data-value="4"]').click();
        await page.locator('button[data-filter="enchant"][data-value="1"]').click();
        assert.equal(await page.locator('tbody tr').count(), 1, 'tier and enchant filters combine');
        await page.locator('[data-view-switch] [data-view="cards"]').click();
        assert.equal(await page.locator('.potential-price-card').count(), 1, 'cards share the same filters');
        await page.locator('[data-reset]').click();
        assert.equal(await page.locator('.potential-price-card').count(), 50, 'reset clears variation filters');
        await page.locator('[data-view-switch] [data-view="list"]').click();
        assert.equal(await page.locator('.tool-split-controls').count(), 1);
        assert.equal(await page.locator('.tool-split-controls [data-view-switch]').count(), 0);
        assert.equal(await page.locator('.tool-split-result .view-switch-toolbar [data-view-switch]').count(), 1);
        const placement = await page.locator('.view-switch-toolbar').evaluate(el => {
            const toolbar = el.getBoundingClientRect();
            const control = el.querySelector('[data-view-switch]').getBoundingClientRect();
            const table = el.nextElementSibling.getBoundingClientRect();
            return { right: Math.abs(toolbar.right - control.right), above: control.bottom <= table.top + 1 };
        });
        assert(placement.right < 2 && placement.above, 'view switch sits above the table at the right edge');
        for (const status of ['Eski yöntem', 'Süresi doldu', 'Düşük güven']) {
            const row = page.locator('tbody tr').filter({ hasText: status });
            assert.equal(await row.locator('td.num').textContent(), '—', `${status} has no usable price`);
        }
        const visual = page.locator('tbody .item-visual').first();
        await visual.locator('img').evaluate(img => img.decode());
        const dimensions = await visual.boundingBox();
        assert(Math.abs(dimensions.width - dimensions.height) < 1, 'item visual stays square');
        if (process.env.POTENTIAL_PRICE_SCREENSHOT) await page.screenshot({ path: process.env.POTENTIAL_PRICE_SCREENSHOT.replace('.png', '-list.png') });
        await page.locator('[data-pagination-page="2"]').first().click();
        assert.equal(await page.locator('tbody tr').count(), 5);
        await cityField.locator('select').selectOption('Martlock');
        assert.equal(await cityField.locator('[data-city-input]').inputValue(), 'Martlock');
        assert.equal(await page.locator('tbody tr').count(), 27);
        await page.locator('button[data-filter="decision"][data-value="Kullanılabilir"]').click();
        assert(await page.locator('tbody tr').count() < 27);
        await page.locator('[data-view-switch] [data-view="cards"]').click();
        assert(await page.locator('.potential-price-card').count() > 0);
        assert.equal(await page.locator('[data-view-switch] [data-view="cards"]').evaluate(el => el === document.activeElement), true, 'view switch retains keyboard focus');
        await page.locator('[data-view-switch] [data-view="list"]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-view-switch] [data-view="list"]').getAttribute('aria-pressed'), 'true');
        assert(await page.locator('tbody tr').count() > 0);
        await page.locator('[data-view-switch] [data-view="cards"]').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('[data-view-switch] [data-view="cards"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-view-switch] [data-view="cards"]').evaluate(el => el === document.activeElement), true);
        await page.locator('[data-copy-item-name]').first().click();
        assert.equal(await page.evaluate(() => window.copied), "Adept's Bag");
        await page.locator('[data-copy-item-name]').first().focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(() => window.copied), "Adept's Bag");
        await page.locator('[data-detail]').first().click();
        assert(await page.locator('[data-price-dialog]').evaluate(el => el.open));
        await page.locator('[data-detail-close]').click();
        await page.locator('[data-reset]').click();
        await page.locator('[data-view-switch] [data-view="list"]').click();
        await page.locator('button[data-filter="sort"][data-value="price"]').click();
        await page.locator('button[data-filter="direction"][data-value="asc"]').click();
        const prices = await page.locator('tbody td.num').allTextContents();
        assert(Number(prices[0]) <= Number(prices[1]));
        await page.locator('[data-filter="search"]').fill('no-such-item');
        assert.equal(await page.locator('tbody tr').count(), 0);
        assert.equal(await page.locator('[data-filter="search"]').evaluate(el => el.labels[0]?.textContent), 'Eşya adı / item ID');
        await page.locator('[data-reset]').click();
        for (const width of [1440, 992, 768, 390]) {
            await page.setViewportSize({ width, height: 900 });
            for (const view of ['list', 'cards']) {
                await page.locator(`[data-view-switch] [data-view="${view}"]`).click();
                assert(await page.locator('.result-view-actions').evaluate(actions => {
                    const view = actions.querySelector('[data-view-switch]');
                    const sorts = [...actions.querySelectorAll('.sort-switch')];
                    return sorts.length === 2 && view.previousElementSibling === sorts.at(-1)
                        && sorts.every(group => [...group.querySelectorAll('button')].every(button => button.querySelector('svg') && button.dataset.appTooltip.trim().split(/\s+/).length <= 2 && button.dataset.appTooltip.trim().length > 0));
                }), 'sorting icons and explanations immediately precede view buttons');
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}/${view}`);
                if (view === 'list') {
                    const overlaps = await page.locator('tbody tr').first().evaluate(row => {
                        const name = row.querySelector('[data-copy-item-name]').getBoundingClientRect();
                        const next = row.cells[1].getBoundingClientRect();
                        return name.right > next.left;
                    });
                    assert.equal(overlaps, false, `item name does not overlap market badges at ${width}`);
                }
            }
            await page.locator('[data-detail]').first().click();
            const close = await page.locator('[data-detail-close]').boundingBox();
            assert(close.x >= 0 && close.x + close.width <= width, `dialog close fits viewport at ${width}`);
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('[data-price-dialog]').evaluate(el => el.open), false);
        }
        if (process.env.POTENTIAL_PRICE_SCREENSHOT) {
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.app-content').scrollTop = 0; });
            await page.screenshot({ path: process.env.POTENTIAL_PRICE_SCREENSHOT, fullPage: true });
        }
        assert.deepEqual(errors, []);
        for (const style of ['standard', 'buttons', 'crests', 'diagonal']) {
            entries.set('albiontools.v4.settings', JSON.stringify({ cityPickerStyle: style, cityPickerOrder: 'alphabetical', dataSync: false }));
            await page.reload();
            await cityField.waitFor();
            await page.locator('[data-view-switch] [data-view="list"]').click();
            await page.locator('tbody tr').first().waitFor();
            const className = style === 'buttons' ? 'horizontal' : style;
            assert((await cityField.getAttribute('class')).includes(`city-field--${className}`), style);
            if (style === 'standard') await cityField.locator('select').selectOption('Martlock');
            else await cityField.locator('[data-city-value="Martlock"]').click();
            await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 27);
            assert.equal(await page.locator('tbody tr').count(), 27, style + ': filters real rows');
            await cityField.locator('[data-city-all]').click();
            assert.equal(await page.locator('tbody tr').count(), 50, style + ': all cities resets filtering');
        }
        entries.set('albiontools.v4.settings', JSON.stringify({ cityPickerStyle: 'standard', dataSync: false }));
        await page.reload();
        await cityField.waitFor();
        await page.locator('[data-view-switch] [data-view="cards"]').click();
        failRead = true;
        await page.locator('[data-reload]').click();
        await page.getByRole('alert').filter({ hasText: 'Kayıtlar okunamadı' }).waitFor();
        assert(await page.locator('.potential-price-card').count() > 0, 'read failure preserves last successful records');
        failRead = false;
        await page.locator('[data-reload]').click();
        await page.locator('.potential-price-card').first().waitFor();
        await cityField.locator('select').selectOption('Martlock');
        entries.set('albiontools.v4.potential-price-snapshots.v2', JSON.stringify(Object.fromEntries(Object.entries(snapshots).filter(([key]) => !key.includes('Martlock')))));
        await page.locator('[data-reload]').click();
        await page.getByText('Filtrelere uyan kayıt yok.', { exact: true }).waitFor();
        assert.equal(await cityField.locator('[data-city-input]').inputValue(), 'Martlock', 'active filter remains visible after its last record disappears');
        await page.locator('[data-reset]').click();
        assert(await page.locator('.potential-price-card').count() > 0);
        entries.set('albiontools.v4.potential-price-snapshots.v2', '{}');
        await page.locator('[data-reload]').click();
        await page.getByText('Henüz potansiyel fiyat kaydı yok.', { exact: false }).waitFor();
        const dialogPage = await browser.newPage();
        await dialogPage.setContent(`<style>${fs.readFileSync('output/css/site.css', 'utf8')}</style>
            ${['app-dialog', 'app-dialog page-info-dialog', 'app-dialog app-warning-dialog'].map(className => `<dialog class="${className}"><button class="app-dialog-close" aria-label="Kapat"></button><div class="app-dialog-sheet">Ortak pencere</div></dialog>`).join('')}`);
        for (const width of [390, 768, 992, 1440]) {
            await dialogPage.setViewportSize({ width, height: 900 });
            for (const dialog of await dialogPage.locator('dialog').all()) {
                await dialog.evaluate(el => el.showModal());
                const close = await dialog.locator('.app-dialog-close').boundingBox();
                assert(close.x >= 0 && close.x + close.width <= width, `shared dialog close fits at ${width}`);
                await dialog.evaluate(el => el.close());
            }
        }
        await dialogPage.close();
        assert.deepEqual(errors, []);
        console.log('Potential prices UI: pagination, filters, sorting, list/cards, copy, dialog, empty and responsive states passed (isolated fixtures).');
    } catch (error) {
        console.error('Page errors:', errors, 'URL:', page.url(), 'Content:', (await page.locator('body').innerText()).slice(0, 1600));
        throw error;
    } finally { await browser.close(); repository.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
