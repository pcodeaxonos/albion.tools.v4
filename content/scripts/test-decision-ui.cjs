// Run with Playwright available through NODE_PATH; test fixtures never ship to the page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');


async function layoutMetrics(page) {
    return page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
        return { left:rect('.tool-split > .left'), right:rect('.tool-split > .right'), strip:rect('.decision-strip'), lead:rect('.decision-lead'), primary:rect('.decision-primary'), why:rect('.decision-why'), alternatives:rect('.decision-alternatives'), analysis:rect('.decision-analysis'), panels:[...document.querySelectorAll('.decision-analysis-panel')].map(el => ({ width:el.getBoundingClientRect().width, y:el.getBoundingClientRect().y })), selected:rect('[data-decision-selected]'), modes:rect('.decision-modes'), basic:rect('.decision-basic-fields'), city:rect('.decision-city-actions') };
    });
}
function checkLayout(m) {
    const fraction = m.left.width / (m.left.width + m.right.width);
    assert.ok(Math.abs(fraction - .2) < .02, '20/80 columns');
    assert.ok(Math.abs(m.left.y - m.right.y) < 2, 'aligned columns');
    assert.ok(Math.abs(m.primary.width / (m.primary.width + m.why.width) - .65) < .02, '65/35 lead');
    assert.ok(Math.abs(m.primary.height - m.why.height) < 2, 'equal lead heights');
    assert.ok(Math.max(m.selected.y,m.modes.y,m.basic.y,m.city.y) - Math.min(m.selected.y,m.modes.y,m.basic.y,m.city.y) < 35, 'single horizontal controls');
    assert.ok(m.alternatives.y >= m.lead.bottom - 1 && m.analysis.y >= m.alternatives.bottom - 1, 'comparison then analysis');
    const total = m.panels.reduce((n,p) => n+p.width,0);
    [.42,.33,.25].forEach((ratio,i) => assert.ok(Math.abs(m.panels[i].width/total-ratio)<.02, 'analysis panel ratio'));
    assert.ok(m.panels.every(p => Math.abs(p.y-m.panels[0].y)<2), 'horizontal analysis');
    assert.ok(m.analysis.bottom <= 1080, 'all three analysis panels fit 1080px');
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        await context.addInitScript(() => {
            localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
            localStorage.setItem('albiontools.v4.settings', JSON.stringify({ dataSync: false, server: 'europe', defaultCity: 'Martlock', premium: true }));
        });
        const page = await context.newPage();
        const errors = [];
        let rejectPrices = false, rejectHistory = false;
        page.on('pageerror', error => errors.push(error.message));
        if (process.env.DECISION_LIVE === '1') {
            await page.goto(`${process.env.DECISION_TEST_ORIGIN || 'http://localhost:3000'}/pages/tools/decision-engine/`);
            await page.locator('.decision-primary').waitFor();
            if (process.env.DECISION_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.DECISION_SCREENSHOT_DIR, 'decision-live-empty-1920.png') });
            const emptyMetrics = await layoutMetrics(page);
            await page.locator('[data-decision-field="query"]').fill('Beef Sandwich');
            await page.locator('[data-decision-field="quantity"]').fill('100');
            const started = Date.now();
            await page.locator('[data-decision-item]').first().locator('.item-visual').click();
            await page.waitForFunction(() => !document.querySelector('[data-decision-output]').textContent.includes('yükleniyor'), { timeout: 25000 });
            await page.waitForFunction(() => !document.querySelector('[data-decision-chart]').textContent.includes('yükleniyor'), { timeout: 25000 });
            const metrics = await layoutMetrics(page);
            checkLayout(metrics);
            assert.ok(Math.abs(emptyMetrics.lead.y - metrics.lead.y) < 2, 'empty to selected shifts decision layout');
            assert.ok(Math.abs(emptyMetrics.analysis.y - metrics.analysis.y) < 2, 'empty to selected shifts analysis layout');
            if (process.env.DECISION_SCREENSHOT_DIR) { await page.screenshot({ path: path.join(process.env.DECISION_SCREENSHOT_DIR, 'decision-live-result-1920.png') }); fs.writeFileSync(path.join(process.env.DECISION_SCREENSHOT_DIR, 'decision-live-layout.json'), JSON.stringify({ empty: emptyMetrics, result: metrics, observedAt: new Date().toISOString(), text: await page.locator('[data-decision-output]').innerText() }, null, 2)); }
            console.log('LIVE decision elapsed ms', Date.now() - started);
            console.log('LIVE', await page.locator('[data-decision-output]').innerText());
            assert.deepEqual(errors, []); return;
        }
        await page.route('**/api/v1/market/long-term?**', route => route.fulfill({ json: { references: [] } }));
        await page.route('**/api/v2/stats/prices/**', route => {
            if (rejectPrices) return route.abort('failed');
            const url = new URL(route.request().url());
            const ids = decodeURIComponent(url.pathname.split('/').pop()).split(',');
            const rows = ids.map(item_id => ({ item_id, city: 'Martlock', quality: 1, sell_price_min: 100, buy_price_max: 80, sell_price_min_date: new Date().toISOString(), buy_price_max_date: new Date().toISOString() }));
            return route.fulfill({ json: rows });
        });
        await page.route('**/api/v1/market/opportunity-series?**', route => {
            if (rejectHistory) return route.fulfill({ status: 503, body: 'archive unavailable' });
            const params = new URL(route.request().url()).searchParams;
            return route.fulfill({ json: { server: params.get('server'), itemId: params.get('item'), city: params.get('location'), quality: 1, buy: { points: [] }, sell: { points: [] } } });
        });
        await page.goto(`${process.env.DECISION_TEST_ORIGIN || 'http://localhost:3000'}/pages/tools/decision-engine/`);
        if (process.env.DECISION_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.DECISION_SCREENSHOT_DIR, 'decision-empty-desktop.png'), fullPage: true });
        await page.locator('[data-decision-field="query"]').fill('Beef Sandwich');
        const item = page.locator('[data-decision-item]').first();
        await item.waitFor();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const copyName = item.locator('[data-copy-item-name]');
        const fullName = await copyName.getAttribute('data-copy-item-name');
        for (const key of [null, 'Enter', 'Space']) {
            if (key) await copyName.press(key); else await copyName.click();
            await page.waitForFunction(name => navigator.clipboard.readText().then(text => text === name), fullName);
            assert.equal(await page.locator('[data-decision-item].is-active').count(), 0, 'copying must not select the item');
        }
        await item.locator('.item-visual').click();
        await page.locator('.decision-primary h2').filter({ hasText: 'ANINDA AL' }).waitFor();
        const selectedItem = await page.locator('[data-decision-item].is-active').getAttribute('data-decision-item');
        await page.locator('[data-decision-field="query"]').fill('');
        await page.locator('[data-decision-recent-search]').filter({ hasText: 'Beef Sandwich' }).waitFor();
        assert.equal(await page.locator('.decision-recents [data-decision-item]').count(), 1, 'selected item recorded once');
        await page.reload();
        await page.locator('.decision-recents [data-decision-item]').waitFor();
        assert.equal(await page.locator('.decision-recents [data-decision-item]').getAttribute('data-decision-item'), selectedItem, 'recent item persists across reload');
        await page.locator('[data-decision-recent-search]').filter({ hasText: 'Beef Sandwich' }).click();
        assert.equal(await page.locator('[data-decision-field="query"]').inputValue(), 'Beef Sandwich', 'recent query can be reused');
        await page.locator('[data-decision-item]').first().locator('.item-visual').click();
        await page.locator('.decision-primary h2').filter({ hasText: 'ANINDA AL' }).waitFor();
        checkLayout(await layoutMetrics(page));
        const normalScroll = await page.evaluate(() => [...document.querySelectorAll('html, body, .app-shell, .app-content, .decision-result, .decision-comparison, .decision-analysis-panel')].map(el => ({ name: el.className || el.tagName, overflow: el.scrollHeight - el.clientHeight })));
        assert.ok(normalScroll.every(el => el.overflow <= 1), JSON.stringify(normalScroll));
        assert.equal(await page.locator('.decision-analysis-panel > small, .decision-analysis-scroll > small').count(), 0, 'notes moved out of analysis cards');
        assert.equal(await page.locator('.decision-data-status').count(), 1, 'single data status/details area');
        assert.equal(await page.locator('.decision-page details').count(), 0, 'accordions replaced by tooltip/dialog');
        await page.locator('.decision-status-chip[data-app-tooltip]').first().focus();
        await page.locator('[role="tooltip"]:visible').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('[data-decision-popup="sources"]').click();
        assert.equal(await page.locator('[data-decision-dialog][open]').count(), 1);
        assert.equal(await page.locator('[data-decision-dialog] p').count(), 0, 'popup uses compact summaries');
        await page.keyboard.press('Escape');
        await page.locator('[data-decision-popup^="option:"]').first().click();
        await page.locator('[data-decision-dialog][open]').waitFor();
        await page.locator('[data-decision-close="info"]').click();
        for (const height of [1000, 953, 900]) {
            await page.setViewportSize({ width: 1920, height });
            const overflow = await page.evaluate(() => [...document.querySelectorAll('html, body, .app-content, .decision-result')].map(el => el.scrollHeight - el.clientHeight));
            assert.ok(overflow.every(value => value <= 1), `normal result overflows viewport height ${height}: ${overflow}`);
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        const stickyHeader = await page.locator('.decision-comparison').evaluate(port => {
            port.style.flex = '0 0 160px';
            port.style.height = '160px';
            port.scrollTop = 60;
            const header = port.querySelector('thead th');
            const css = getComputedStyle(header);
            return { background: css.backgroundColor, position: css.position, top: header.getBoundingClientRect().top, portTop: port.getBoundingClientRect().top, scrollTop: port.scrollTop };
        });
        assert.ok(stickyHeader.scrollTop > 0, 'comparison actually scrolled');
        assert.equal(stickyHeader.position, 'sticky');
        assert.ok(!['transparent', 'rgba(0, 0, 0, 0)'].includes(stickyHeader.background), 'sticky header must occlude scrolling rows');
        assert.ok(Math.abs(stickyHeader.top - stickyHeader.portTop) < 3, 'header pinned to table scrollport');
        await page.locator('.decision-comparison').evaluate(port => { port.style.removeProperty('flex'); port.style.removeProperty('height'); port.scrollTop = 0; });
        assert.match(await page.locator('[data-decision-output]').innerText(), /Hesaplanamıyor/);
        await page.locator('[data-decision-field="quantity"]').fill('100');
        await page.locator('[data-decision-popup="settings"]').click();
        await page.locator('[data-decision-field="limitPrice"]').fill('1');
        await page.locator('[data-decision-field="feePerBatch"]').fill('10');
        await page.locator('[data-decision-field="rr"]').fill('0');
        const craftTotal = page.locator('.decision-comparison tbody tr').filter({ hasText: 'Şimdi craftla' }).locator('td').nth(1);
        assert.equal(await craftTotal.innerText(), '126.100', 'manual station fee reaches unchanged engine');
        await page.locator('[data-decision-focus]').check();
        await page.locator('[data-decision-field="focusPerBatch"]').fill('2');
        await page.locator('[data-decision-field="focusSilver"]').fill('3');
        assert.equal(await craftTotal.innerText(), '126.160', 'focus opportunity expense reaches engine');
        await page.locator('[data-decision-reset-craft]').click();
        assert.equal(await craftTotal.innerText(), '—', 'reset restores missing data, not zero cost');
        await page.locator('[data-decision-close="settings"]').click();
        await page.locator('[data-decision-field="quantity"]').fill('1');
        assert.equal(await page.locator('.decision-primary h2').innerText(), 'ANINDA AL');
        await page.locator('[data-decision-popup="history"]').click();
        await page.getByText('Geçerli geçmiş gözlemi yok.').first().waitFor();
        await page.locator('[data-decision-close="info"]').click();
        rejectHistory = true;
        await page.locator('[data-decision-refresh]').first().click();
        await page.locator('[data-decision-chart] [role="alert"]').waitFor();
        await page.locator('[data-decision-popup="history"]').click();
        await page.locator('[data-decision-series] [role="alert"]').waitFor();
        rejectHistory = false;
        await page.locator('[data-decision-dialog] [data-decision-history-refresh]').click();
        await page.locator('[data-decision-series]').getByText('Geçerli geçmiş gözlemi yok.').first().waitFor();
        assert.equal(await page.locator('[data-decision-output] [data-decision-history-refresh]').count(), 0, 'successful archive retry clears both error states');
        await page.locator('[data-decision-close="info"]').click();
        await page.locator('[data-decision-field="quantity"]').fill('100000000');
        await page.locator('.decision-primary').waitFor();
        const screenshotDir = process.env.DECISION_SCREENSHOT_DIR;
        if (screenshotDir) { fs.mkdirSync(screenshotDir, { recursive: true }); await page.screenshot({ path: path.join(screenshotDir, 'decision-desktop.png'), fullPage: true }); }
        await page.setViewportSize({ width: 390, height: 844 });
        const toggle = page.locator('.sidebar-toggler');
        if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
        await page.waitForFunction(() => document.querySelector('.app-sidebar').getBoundingClientRect().right <= 1);
        await page.screenshot(screenshotDir ? { path: path.join(screenshotDir, 'decision-mobile.png'), fullPage: true } : {});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile horizontal page overflow');
        await page.locator('[data-decision-popup="sources"]').click();
        assert.ok(await page.locator('[data-decision-dialog]').evaluate(el => el.getBoundingClientRect().right <= innerWidth), 'mobile dialog fits viewport');
        await page.locator('[data-decision-close="info"]').click();
        await page.locator('[data-decision-mode="have"]').click();
        await page.locator('.decision-primary h2').filter({ hasText: 'ANINDA SAT' }).waitFor();
        await page.locator('[data-decision-field="quantity"]').fill('0');
        await page.locator('.decision-primary h2').filter({ hasText: 'Güvenilir karar verilemiyor' }).waitFor();
        assert.equal(await page.locator('.decision-primary h2').innerText(), 'Güvenilir karar verilemiyor');
        await page.locator('[data-decision-field="query"]').fill('no_such_item_zzzz');
        await page.getByText('Eşleşen item yok.').waitFor();
        const longest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/items.json'), 'utf8')).filter(item => item.tradeable !== false && item.localizedName).sort((a, b) => b.localizedName.length - a.localizedName.length)[0];
        await page.locator('[data-decision-field="quantity"]').fill('1');
        await page.locator('[data-decision-field="query"]').fill(longest.localizedName);
        await page.locator('[data-decision-item]').first().locator('.item-visual').click();
        await page.locator('.decision-primary h2').filter({ hasText: 'ANINDA SAT' }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'long item name causes page overflow');
        rejectPrices = true;
        await page.locator('[data-decision-refresh]').first().click();
        await page.locator('[data-decision-output] [role="alert"]').waitFor();
        rejectPrices = false;
        await page.locator('[data-decision-refresh]').first().click();
        await page.locator('.decision-primary h2').filter({ hasText: 'ANINDA SAT' }).waitFor();
        assert.deepEqual(errors, []);
        console.log('PASS desktop/mobile, longest real item name, large quantity, empty search/history, mode, missing craft, unknown order, invalid quantity, offline/retry; no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
