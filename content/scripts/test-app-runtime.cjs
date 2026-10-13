const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');

// Exercise every real tool entry with the shared runtime and local seed files.
const root = path.resolve(__dirname, '../..');
const entries = process.argv.includes('--records-only') ? [] : fs.readdirSync(path.join(root, 'pages/tools'))
    .map(name => `pages/tools/${name}/index.html`)
    .concat('tools/flipper/index.html');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { UserDataRepository } = await import('./user-data-repository.mjs');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'albion-startup-'));
    const repository = new UserDataRepository(path.join(temp, 'data.sqlite'));
    if (!entries.length) {
        const { tables } = await import('../js/db/schema.js');
        repository.importOnce('test-seeds', Object.fromEntries(Object.entries(tables).map(([name, table]) => ['albiontools.v4.' + name, JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, table.seedUrl), 'utf8')))])));
    }
    let rejectWrites = false;
    const routeData = async route => {
                const request = route.request();
                const endpoint = new URL(request.url()).pathname;
                if (!endpoint.startsWith('/api/v1/user-data')) { await route.abort(); return; }
                if (rejectWrites && request.method() === 'PUT') { await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Test yazım hatası' }) }); return; }
                const body = request.postDataJSON();
                let result;
                if (request.method() === 'GET') result = { ...repository.snapshot(), backup: repository.status() };
                else if (endpoint.endsWith('/import')) result = repository.importLegacy(body.data);
                else if (endpoint.endsWith('/backup')) { await repository.createBackup(); result = repository.status(); }
                else result = repository.write(body.changes);
                await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) });
    };
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const entry of entries) {
            const context = await browser.newContext();
            await context.addInitScript(() => {
                localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
                localStorage.setItem('albiontools.v4.settings', JSON.stringify({ dataSync: false, server: 'europe', defaultCity: 'Martlock', premium: true }));
                window.startupRenders = [];
                new MutationObserver(records => {
                    for (const record of records) {
                        if (record.target.matches?.('[data-app-sidebar]') && record.addedNodes.length) window.startupRenders.push('menu');
                        for (const node of record.addedNodes) {
                            if (node.nodeType !== 1) continue;
                            if (node.matches('#appStatus')) window.startupRenders.push('status');
                            if (node.matches('.page-body') || node.querySelector('.page-body')) window.startupRenders.push('content');
                        }
                    }
                }).observe(document, { childList: true, subtree: true });
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/api/**', routeData);
            await page.goto(`http://127.0.0.1:${server.address().port}/${entry.replace(/index\.html$/, '')}`, { waitUntil: 'load' });
            await page.waitForFunction(() => document.querySelector('main')?.textContent.trim().length > 100);
            const renders = await page.evaluate(() => window.startupRenders);
            assert.ok(renders.indexOf('menu') >= 0, `${entry}: menu missing`);
            assert.ok(renders.indexOf('status') > renders.indexOf('menu'), `${entry}: status must follow menu`);
            assert.ok(renders.indexOf('content') > renders.indexOf('status'), `${entry}: structure must follow status`);
            assert.deepEqual(errors, [], `${entry}: browser errors`);
            assert.equal(await page.locator('#appStatus').count(), 1, `${entry}: duplicated status`);
            console.log(`PASS ${entry}: menu → status → structure → populated content`);
            await context.close();
        }
        // Real form writes with completely disabled browser storage, followed by a new browser profile.
        const localTime = new Date(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }));
        if (localTime.getHours() < 13) localTime.setDate(localTime.getDate() - 1);
        const today = `${localTime.getFullYear()}-${String(localTime.getMonth()+1).padStart(2,'0')}-${String(localTime.getDate()).padStart(2,'0')}`;
        const bonusKey = 'albiontools.v4.dailyBonuses';
        const old = repository.snapshot().entries.find(row => row.key === bonusKey);
        const bonuses = JSON.parse(old.value);
        if (!bonuses.some(row => row.date === today)) bonuses.push({ id: Math.max(0, ...bonuses.map(row => row.id)) + 1, date: today, slot1FamilyKey: 'weapons/mace', slot1Rate: '10', slot2FamilyKey: 'weapons/hammer', slot2Rate: '10' });
        repository.write([{ key: bonusKey, value: JSON.stringify(bonuses), revision: old.revision }]);
        const clean = await browser.newContext({ timezoneId: 'Europe/Istanbul' });
        await clean.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } }));
        const page = await clean.newPage();
        const errors = [], dialogs = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route('**/api/**', routeData);
        const base = `http://127.0.0.1:${server.address().port}`;
        await page.goto(`${base}/pages/admin/db/#dailyBonuses/create`);
        const form = page.locator('[data-db-record-form]');
        await form.locator('[name="date"]').fill('2099-01-01');
        await form.locator('[name="slot1FamilyKey"]').fill('weapons/mace');
        await form.locator('[name="slot2FamilyKey"]').fill('weapons/hammer');
        await form.locator('[name="slot1Rate"]').selectOption('10');
        await form.locator('[name="slot2Rate"]').selectOption('20');
        await form.locator('button[type="submit"]').first().click();
        await page.waitForFunction(async () => (await import('/content/js/db/store.js')).getAll('dailyBonuses').some(row => row.date === '2099-01-01'));
        const saved = JSON.parse(repository.snapshot().entries.find(row => row.key === bonusKey).value).find(row => row.date === '2099-01-01');
        assert.ok(saved);
        await page.goto(`${base}/pages/admin/db/?edit-test=1#dailyBonuses/edit/${saved.id}`);
        await page.locator('[data-db-record-form] [name="date"]').fill('2099-01-02');
        rejectWrites = true;
        await page.locator('[data-db-record-form] button[type="submit"]').first().click();
        await page.waitForFunction(() => document.querySelector('[data-db-record-form] [name="date"]')?.value === '2099-01-02' && !document.querySelector('.area-loader:not([hidden])'));
        await page.waitForTimeout(200);
        assert.equal(JSON.parse(repository.snapshot().entries.find(row => row.key === bonusKey).value).find(row => row.id === saved.id).date, '2099-01-01', 'failed save keeps committed row');
        rejectWrites = false;
        await page.locator('[data-db-record-form] button[type="submit"]').first().click();
        await page.waitForFunction(async () => (await import('/content/js/db/store.js')).getAll('dailyBonuses').some(row => row.date === '2099-01-02'));
        await page.goto(`${base}/pages/tools/island-planner-v2/`);
        await page.locator('[data-v2-level="5"]').click();
        await page.locator('[data-v2-save]').click();
        await page.waitForFunction(async () => (await import('/content/js/db/store.js')).getAll('islandPlannerV2CommittedPlans').some(row => JSON.parse(row.plan).islandLevel === 5));
        await page.locator('[data-v2-level="4"]').click();
        await page.evaluate(async () => (await import('/content/js/core/durable-storage.mjs')).flushDurableWrites());
        rejectWrites = true;
        const rejectedPlan = page.waitForResponse(response => response.request().method() === 'PUT' && response.status() === 503);
        await page.locator('[data-v2-save]').click();
        await rejectedPlan;
        await page.waitForFunction(() => !document.querySelector('[data-v2-save]').disabled);
        assert.ok(JSON.parse(repository.snapshot().entries.find(row => row.key === 'albiontools.v4.islandPlannerV2CommittedPlans').value).every(row => JSON.parse(row.plan).islandLevel === 5), 'failed plan save keeps database checkpoint');
        rejectWrites = false;
        await page.locator('[data-v2-revert]').click();
        await page.waitForFunction(() => document.querySelector('[data-v2-level="5"]')?.getAttribute('aria-pressed') === 'true');
        await page.locator('[data-v2-level="4"]').click();
        await page.locator('[data-v2-save]').click();
        await page.waitForFunction(async () => (await import('/content/js/db/store.js')).getAll('islandPlannerV2CommittedPlans').some(row => JSON.parse(row.plan).islandLevel === 4));
        await page.reload();
        await page.waitForFunction(() => document.querySelector('[data-v2-level="4"]')?.getAttribute('aria-pressed') === 'true');
        console.log('PASS island plan rejected save preserves revert checkpoint; successful retry survives reload');
        assert.deepEqual(errors, []);
        await clean.close();
        const fresh = await browser.newContext();
        const freshPage = await fresh.newPage();
        await freshPage.route('**/api/**', routeData);
        await freshPage.goto(`${base}/pages/admin/db/#dailyBonuses`);
        await freshPage.waitForFunction(async () => (await import('/content/js/db/store.js')).getAll('dailyBonuses').some(row => row.date === '2099-01-02'));
        await fresh.close();
        console.log('PASS admin create/edit, rejected-write preservation, disabled browser storage, clean profile reload');
    } finally {
        await browser.close();
        repository.close();
        assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(temp, { recursive: true, force: true });
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
