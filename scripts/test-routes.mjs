import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

for (const entry of SITE_ROUTES) {
    const href = entry.route ? `${entry.route}/` : '';
    const pathname = `/${href}`;
    const route = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).at(-1) || '';
    assert.equal(route, entry.route, `route round trip failed: ${entry.code}`);
    if (entry.route) assert.ok(fs.existsSync(path.join(entry.route, 'index.html')), `missing route output: ${entry.route}`);
    if (entry.route) {
        const html = fs.readFileSync(path.join(entry.route, 'index.html'), 'utf8');
        assert.ok(html.indexOf('<base href="../">') < html.indexOf('css/site.css'), `base must precede assets: ${entry.route}`);
    }
}
console.log(`OK ${SITE_ROUTES.length} routes round-trip and have static output`);
