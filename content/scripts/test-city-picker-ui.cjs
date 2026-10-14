const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const tools = require('../../data/site-tools.json');
const fs = require('node:fs');
const path = require('node:path');

async function assertCityControls(page, style) {
    const invalid = await page.evaluate(cityNames => {
        const cities = new Set(cityNames);
        return [...document.querySelectorAll('.choice-field button, .form-floating select, [data-chart-city]')].filter(control => {
            if (control.closest('[data-city-field]')) return false;
            if (control.tagName === 'SELECT') return [...control.options].some(option => cities.has(option.value));
            return control.hasAttribute('data-chart-city') || cities.has(control.dataset.value);
        }).map(control => control.outerHTML.slice(0, 220));
    }, require('../../data/cities.json').map(city => city.marketApiName));
    assert.deepEqual(invalid, [], page.url() + ': city choices cannot bypass the shared field');
    const className = style === 'buttons' ? 'horizontal' : style;
    const classes = await page.locator('[data-city-field]').evaluateAll(fields => fields.map(field => field.className));
    assert.ok(classes.length && classes.every(value => value.includes(`city-field--${className}`)), page.url() + ': ' + style);
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const context = await browser.newContext();
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ready: true, references: [], prices: [], trades: [], series: [], server: 'europe' } });
            if (url.hostname !== '127.0.0.1') return route.abort();
            const file = path.resolve(__dirname, '../..', '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
            return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
        });
        // Isolated service fixture: never write settings or seeds into the user's database.
        const saved = new Map([['albiontools.v4.settings', { key: 'albiontools.v4.settings', value: JSON.stringify({ dataSync: false, cityPickerStyle: 'standard' }), revision: 1 }]]);
        const snapshots = Object.fromEntries(['Martlock', 'Lymhurst'].map(city => [JSON.stringify([JSON.stringify(['europe', city, 'T1_CARROT', 1, 'sell']), 7]), { savedSnapshot: true, price: 100, reliable: true, days: 7, savedAt: new Date().toISOString(), validUntil: new Date(Date.now()+86400000).toISOString() }]));
        saved.set('albiontools.v4.potential-price-snapshots.v2', { key: 'albiontools.v4.potential-price-snapshots.v2', value: JSON.stringify(snapshots), revision: 1 });
        await context.route('**/api/v1/user-data**', async route => {
            const request = route.request();
            const body = request.postDataJSON();
            if (request.method() === 'PUT') {
                for (const change of body.changes) {
                    let value = change.value;
                    if (change.patch) {
                        const rows = new Map(JSON.parse(saved.get(change.key)?.value || '[]').map((row, position) => [String(row.id), { row, position }]));
                        change.patch.remove.forEach(id => rows.delete(id));
                        change.patch.upsert.forEach(entry => rows.set(entry.id, entry));
                        value = JSON.stringify([...rows.values()].sort((a,b) => a.position-b.position).map(entry => entry.row));
                    }
                    saved.set(change.key, { key: change.key, value, revision: (saved.get(change.key)?.revision || 0) + 1 });
                }
            }
            const entries = request.method() === 'PUT' ? body.changes.map(change => saved.get(change.key)) : [...saved.values()];
            await route.fulfill({ json: { entries } });
        });
        await context.route('**/api/v1/trades', route => route.fulfill({ json: { trades: ['Martlock', 'Lymhurst'].map((locationName, sourceId) => ({ sourceId, locationName, kind: 'instant_buy', itemId: 'T4_MAIN_SWORD', quantity: 1, unitPriceSilver: 100, totalPriceSilver: 100, occurredAt: new Date().toISOString() })) } }));
        await context.route('**/api/v1/trades?**', route => route.fulfill({ json: { server: 'europe', scope: 'personal', trades: ['Martlock', 'Lymhurst'].map((locationName, sourceId) => ({ sourceId, locationName, kind: 'instant_buy', itemId: 'T4_MAIN_SWORD', quality: 1, quantity: 1, unitPriceSilver: 100, totalPriceSilver: 100, occurredAt: new Date().toISOString() })) } }));
        await context.route('**/api/v1/opportunity-evidence', route => route.fulfill({ json: {
            version: 1, signals: { sample: { city: 'Martlock', toCity: 'Lymhurst', server: 'europe', strategy: 'instant-flip', productGroup: 'Weapon', itemId: 'T4_MAIN_SWORD', quality: 1, legs: {}, observedAt: new Date().toISOString() } },
            checks: [{ id: 'sample-check', signalId: 'sample', result: 'correct', side: 'buy', at: new Date().toISOString() }], trades: {}
        } }));
        await context.route('**/api/v2/stats/prices/**', route => route.fulfill({ json: ['Martlock', 'Lymhurst'].map(city => ({ item_id: 'T4_MAIN_SWORD', city, quality: 1, buy_price_max: 100, sell_price_min: 110, buy_price_max_date: new Date().toISOString(), sell_price_min_date: new Date().toISOString() })) }));
        await context.route('**/api/v2/stats/history/**', route => route.fulfill({ json: ['Martlock', 'Lymhurst'].map(location => ({ item_id: 'T4_MAIN_SWORD', location, quality: 1, data: [{ timestamp: new Date().toISOString(), avg_price: 110, item_count: 2 }] })) }));
        await context.addInitScript(() => {
            localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:3000/pages/admin/settings/');
        const picker = page.locator('[data-city-field="setting-default-city"]');
        await picker.waitFor().catch(async error => {
            console.error('Startup errors:', errors, (await page.locator('body').innerText()).slice(0, 800));
            throw error;
        });
        const cityTools = tools.filter(tool => {
            const html = fs.readFileSync(path.resolve(__dirname, '../..', tool.path, 'index.html'), 'utf8');
            const script = html.match(/src="[^"]*content\/js\/tools\/([^"/]+\.js)"/);
            return script && /city(?:Filter)?FieldHtml\s*\(/.test(fs.readFileSync(path.resolve(__dirname, '../js/tools', script[1]), 'utf8'));
        });
        for (const style of ['crests', 'buttons', 'diagonal', 'standard']) {
            await page.locator('#settingCityPickerStyle').selectOption(style);
            const className = style === 'buttons' ? 'horizontal' : style;
            await page.waitForFunction(name => document.querySelector('[data-city-field="setting-default-city"]').classList.contains(`city-field--${name}`), className);
            if (style === 'standard') await picker.locator('select').selectOption('Lymhurst');
            else await picker.locator('[data-city-value="Lymhurst"]').click();
            await page.waitForFunction(async () => {
                const { persistenceStatus } = await import('/content/js/core/durable-storage.mjs');
                return persistenceStatus().pending === 0;
            });
            await page.waitForFunction(async () => {
                const { getSettings } = await import('/content/js/core/settings.js');
                return getSettings().defaultCity === 'Lymhurst';
            });
            await page.evaluate(async () => {
                document.querySelector('[data-test-evidence]')?.remove();
                const host = document.createElement('section');
                host.dataset.testEvidence = '';
                document.body.append(host);
                const { createOpportunityEvidenceUI } = await import('/content/js/components/opportunity-evidence.js');
                await createOpportunityEvidenceUI({ hub: () => 'http://127.0.0.1:3001', reportHost: () => host }).load();
            });
            assert.ok((await page.locator('[data-city-field="evidence-city"]').getAttribute('class')).includes(`city-field--${className}`));
            const evidencePicker = page.locator('[data-city-field="evidence-city"]');
            if (style === 'standard') await evidencePicker.locator('select').selectOption('Lymhurst');
            else await evidencePicker.locator('[data-city-value="Lymhurst"]').click();
            assert.equal(await evidencePicker.locator('[data-city-input]').inputValue(), 'Lymhurst');
            await evidencePicker.locator('[data-city-all]').click();
            assert.equal(await evidencePicker.locator('[data-city-input]').inputValue(), '');
            await assertCityControls(page, style);
            for (const entry of cityTools) {
                const route = entry.id;
                const tool = await context.newPage();
                tool.on('pageerror', error => errors.push(error.message));
                await tool.goto(`http://127.0.0.1:3000/${entry.path}/${route === 'item-market' ? '?item=T4_MAIN_SWORD' : ''}`);
                // Collapsible filters still participate in the component contract.
                await tool.locator('[data-city-field]').first().waitFor({ state: 'attached' });
                const classes = await tool.locator('[data-city-field]').evaluateAll(fields => fields.map(field => field.className));
                assert.ok(classes.every(value => value.includes(`city-field--${className}`)), `${route}: ${style}`);
                await assertCityControls(tool, style);
                if (route === 'item-market') {
                    const api = tool.locator('[data-city-field="market-chart-api-cities"]');
                    await api.waitFor();
                    const series = kind => tool.locator(`[data-${kind}-chart] [data-chart-series]`);
                    assert.equal(await series('api').count(), 2);
                    assert.equal(await series('personal').count(), 2);
                    if (style === 'standard') await api.locator('select').selectOption('Martlock');
                    else await api.locator('[data-city-value="Martlock"]').click();
                    assert.equal(await series('api').count(), 1);
                    assert.equal(await series('personal').count(), 2, 'API city filtering cannot affect personal history');
                    if (style !== 'standard') {
                        await api.locator('[data-city-value="Lymhurst"]').click({ modifiers: ['Control'] });
                        assert.equal(await series('api').count(), 2, 'multi-city selection survives chart rendering');
                        await api.locator('[data-city-value="Martlock"]').click({ modifiers: ['Shift'] });
                        assert.equal(await series('api').count(), 1, 'exclusion survives chart rendering');
                    }
                    await api.locator('[data-city-all]').click();
                    assert.equal(await series('api').count(), 2);
                    if (style === 'standard') await api.locator('select').selectOption('Martlock');
                    else await api.locator('[data-city-value="Martlock"]').click();
                    await tool.locator('[data-history-source]').selectOption('snapshot');
                    await tool.locator('[data-history-source]').selectOption('api');
                    assert.equal(await series('api').count(), 2, 'changing history source resets its city filter');
                    assert.equal(await api.locator('[data-city-all]').getAttribute('aria-pressed'), 'true');
                    for (const width of [1440, 390]) {
                        await tool.setViewportSize({ width, height: 900 });
                        assert(await tool.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${style}: no page overflow at ${width}`);
                        assert(await tool.locator('[data-api-chart] .market-chart').evaluate(plot => plot.clientHeight >= 52), `${style}: chart keeps a usable height`);
                    }
                }
                // This contract covers city controls; contextual result notes have separate states.
                const cities = await tool.locator('[data-city-field] .city-name[data-city], [data-city-field] option[data-city], [data-city-field] select[data-city]').evaluateAll(nodes => nodes.map(node => {
                    const styles = getComputedStyle(node);
                    const probe = document.createElement('span');
                    probe.style.color = 'var(--color-city-accent-' + node.dataset.city + ', var(--color-primary))';
                    document.body.append(probe);
                    const expectedColor = getComputedStyle(probe).color;
                    probe.remove();
                    return { key: node.dataset.city, lang: node.lang, transform: styles.textTransform, color: styles.color, expectedColor, badge: node.classList.contains('city-badge'), disabled: Boolean(node.closest('select:disabled')), markup: node.outerHTML, parent: node.parentElement.className };
                }));
                assert.ok(cities.length, route + ': shared city names present');
                for (const city of cities) {
                    assert.equal(city.lang, 'en', route + ': English casing');
                    assert.equal(city.transform, 'uppercase', route + ': CSS owns uppercase');
                    if (!city.badge && !city.disabled) assert.equal(city.color, city.expectedColor, route + ': shared city token ' + JSON.stringify(city));
                }
                await tool.close();
            }
            console.log(`${style}: ${cityTools.length} tools and dialog city controls passed.`);
        }
        assert.deepEqual(errors, []);
        console.log(`City preference persistence, ${cityTools.length} discovered tools, and evidence dialog filters passed in all four styles.`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
