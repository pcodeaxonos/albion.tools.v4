// Explicitly invoked live migration verification. Uses the same page action and
// SQLite API as the user; stores only aggregate evidence in output.
const normal = process.argv.includes('--refresh');
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/albion-online-data/.test(request.url())) external.push(request.url()); });
    await page.addInitScript(() => localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now())));
    try {
        await page.goto('http://127.0.0.1:3000/pages/tools/potential-prices/');
        await page.locator('[data-reset]').waitFor();
        await page.locator('[data-reset]').click();
        const report = () => page.evaluate(async () => {
            const { durableStorage } = await import('/content/js/core/durable-storage.mjs');
            const { potentialDecisionRows, POTENTIAL_SNAPSHOT_KEY } = await import('/content/js/core/potential-price-snapshot.mjs');
            const { filterPotentialRows, potentialDefaults } = await import('/content/js/core/potential-price-view.mjs');
            const { SALE_ESTIMATOR } = await import('/content/js/core/potential-sale-horizon.mjs');
            const values = Object.values(JSON.parse(durableStorage.getItem(POTENTIAL_SNAPSHOT_KEY)));
            const rows = filterPotentialRows(potentialDecisionRows(durableStorage), potentialDefaults());
            return { total: rows.length, stored: values.length, legacy: rows.filter(row => row.status === 'Eski yöntem').length,
                current: rows.filter(row => row.status !== 'Eski yöntem').length, usable: rows.filter(row => row.plannerUsable).length,
                reference: rows.filter(row => !row.plannerUsable && row.indicativePrice > 0).length,
                noEvidence: rows.filter(row => !row.plannerUsable && !(row.indicativePrice > 0)).length,
                estimators: values.reduce((counts, value) => { const key = value.estimator ?? 'missing'; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {}),
                reasons: rows.filter(row => !row.plannerUsable).reduce((counts, row) => { counts[row.reason] = (counts[row.reason] ?? 0) + 1; return counts; }, {}) };
        });
        const before = await report();
        external.length = 0;
        await page.locator(normal ? '[data-refresh-prices]' : '[data-refresh-legacy]').click();
        await page.waitForFunction(() => !document.querySelector('[data-refresh-legacy]').disabled, {}, { timeout: 180000 });
        const progress = await page.locator('[data-refresh-progress]').innerText();
        const alert = await page.locator('.tool-split-result [role="alert"]').allTextContents();
        const after = await report();
        await page.screenshot({ path: 'output/potential-migration-desktop.png' });
        await page.evaluate(async () => (await import('/content/js/core/durable-storage.mjs')).flushDurableWrites());
        await page.reload();
        await page.locator('[data-refresh-legacy]').waitFor();
        const reopened = await report();
        assert.deepEqual(after, reopened, 'SQLite decisions survive a new page instance');
        assert.equal(after.stored, before.stored, 'historical records are retained');
        assert.equal(after.legacy, 0);
        if (!normal) assert.equal(external.length, 0, 'archive migration must not request external prices/history');
        assert.deepEqual(errors, []);
        const result = { before, after, reopened, migrated: before.legacy - after.legacy, progress, alert, errors, externalRequests: external.length };
        fs.writeFileSync(normal ? 'output/potential-refresh-live-verification.json' : 'output/potential-migration-verification.json', JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
