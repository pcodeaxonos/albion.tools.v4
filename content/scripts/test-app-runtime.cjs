const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// Exercise every real tool entry with the shared runtime and local seed files.
const root = path.resolve(__dirname, '../..');
const entries = fs.readdirSync(path.join(root, 'pages/tools'))
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
            await page.route('**/api/**', route => route.abort());
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
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
