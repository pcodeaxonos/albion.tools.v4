// Browser regression for the shared page-head contract. Requires Playwright through NODE_PATH.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext();
        await context.addInitScript(() => {
            localStorage.setItem('albiontools.v4.dailyBonusRedirectAt', String(Date.now()));
            localStorage.setItem('albiontools.v4.settings', JSON.stringify({ dataSync: false, server: 'europe', defaultCity: 'Martlock', premium: true }));
        });
        const page = await context.newPage();
        // A failed scan is sufficient to inspect the real page chrome without inventing market data.
        await page.route('**/api/v1/market/opportunities?**', route => route.abort('failed'));
        for (const width of [1920, 1280, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
            let shared;
            for (const tool of ['decision-engine', 'opportunities', 'farming']) {
                await page.goto(`${process.env.HEAD_TEST_ORIGIN || 'http://localhost:3000'}/pages/tools/${tool}/`, { waitUntil: 'domcontentloaded' });
                await page.locator('.page-head > .page-head-content').waitFor();
                if (tool === 'opportunities') await page.locator('[data-page-loader]').waitFor({ state: 'hidden' });
                const layout = await page.evaluate(() => {
                    const head = document.querySelector('.page-head');
                    const main = head.closest('main');
                    const image = getComputedStyle(main, '::before');
                    return { height: head.getBoundingClientRect().height, contentCount: head.querySelectorAll(':scope > .page-head-content').length,
                        bodyTop: document.querySelector('.page-body').getBoundingClientRect().top, headBottom: head.getBoundingClientRect().bottom,
                        image: image.backgroundImage, size: image.backgroundSize, position: image.backgroundPosition,
                        headDecoration: getComputedStyle(head, '::before').content };
                });
                assert.equal(layout.contentCount, 1, `${tool}: duplicated head content`);
                assert.ok(layout.bodyTop >= layout.headBottom - 1, `${tool}: controls overlap banner`);
                assert.match(layout.image, /page-heads\//, `${tool}: missing banner URL`);
                assert.ok(await page.evaluate(async background => {
                    const urls = [...background.matchAll(/url\(["']?(.*?)["']?\)/g)];
                    const image = new Image(); image.src = urls.at(-1)[1];
                    await image.decode(); return image.naturalWidth > 0;
                }, layout.image), `${tool}: banner asset failed to load`);
                assert.ok(['none', 'normal'].includes(layout.headDecoration), `${tool}: banner decoration still owned by page head`);
                if (!shared) shared = layout;
                else {
                    assert.ok(Math.abs(layout.height - shared.height) < 1, `${tool}: page-specific height`);
                    assert.equal(layout.size, shared.size, `${tool}: page-specific scaling`);
                    assert.equal(layout.position, shared.position, `${tool}: page-specific positioning`);
                }
                if (process.env.HEAD_SCREENSHOT_DIR && tool === 'opportunities') await page.screenshot({ path: `${process.env.HEAD_SCREENSHOT_DIR}/opportunities-head-${width}.png` });
                console.log(`PASS ${tool} ${width}px: shared head, single content wrapper, no control overlap`);
            }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
