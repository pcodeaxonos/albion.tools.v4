const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
    const { emptyEvidence } = await import('../js/core/opportunity-evidence.mjs');
    const { UserDataRepository } = await import('./user-data-repository.mjs');
    const { SITE_ROUTES } = await import('./site-routes.mjs');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [1440, 992, 390]) {
            for (const id of ['opportunities', 'flipper', 'potential-prices']) {
                const context = await browser.newContext({ viewport: { width, height: 900 } });
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'result-controls-'));
                const repository = new UserDataRepository(path.join(temp, 'data.sqlite'));
                await context.addInitScript(() => localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now())));
                await page.route('**/*', async route => {
                    const url = new URL(route.request().url());
                    if (url.pathname.startsWith('/api/')) {
                        if (url.pathname.includes('/user-data')) {
                            const body = route.request().postDataJSON();
                            const result = route.request().method() === 'GET' ? repository.snapshot()
                                : url.pathname.endsWith('/import') ? repository.importLegacy(body.data)
                                : url.pathname.endsWith('/backup') ? repository.status() : repository.write(body.changes);
                            return route.fulfill({ json: result });
                        }
                        if (url.pathname.includes('/opportunity-evidence')) return route.fulfill({ json: emptyEvidence() });
                        if (url.pathname.includes('/market/opportunities')) return route.fulfill({ status: 503, json: { error: 'Isolated empty state' } });
                        return route.fulfill({ json: { checks: [], outcomes: [], trades: [], ready: true, server: 'europe', items: [], rows: [] } });
                    }
                    if (url.hostname !== 'localhost') return route.abort();
                    const file = path.resolve(__dirname, '../..', '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
                    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
                });
                const tool = SITE_ROUTES.find(route => route.id === id);
                await page.goto('http://localhost/' + tool.source);
                const sorting = page.locator('.sort-switch');
                await sorting.first().waitFor();
                assert(await sorting.locator('button').evaluateAll(buttons => buttons.every(button =>
                    button.querySelector('svg') && button.dataset.appTooltip.trim().split(/\s+/).length <= 2
                    && button.dataset.appTooltip.trim().length > 0)), `${id}: short tooltips and inline icons`);
                const choice = sorting.first().locator('button').nth(1);
                await choice.click();
                assert.equal(await choice.getAttribute('aria-pressed'), 'true', `${id}: sort changes`);
                if (id !== 'flipper') {
                    for (const view of ['cards', 'list']) {
                        await page.locator(`[data-view-switch] [data-view="${view}"]`).click();
                        assert.equal(await choice.getAttribute('aria-pressed'), 'true', `${id}: sort survives ${view}`);
                        assert(await page.locator('.result-view-actions').evaluate(actions => {
                            const view = actions.querySelector('[data-view-switch]');
                            return view.previousElementSibling.matches('.sort-switch')
                                && view.previousElementSibling.getBoundingClientRect().right <= view.getBoundingClientRect().left;
                        }), `${id}: sorting sits immediately left of views at ${width}`);
                    }
                }
                assert.deepEqual(errors, [], `${id}: no browser errors`);
                await context.close();
                repository.close();
            }
        }
        console.log('PASS result controls: short tooltips, SVG icons, sorting, view changes and placement at 1440/992/390 (isolated fixtures).');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
