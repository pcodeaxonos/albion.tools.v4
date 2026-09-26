import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

const runtimeCatalog = [
    ...JSON.parse(fs.readFileSync('data/site-tools.json', 'utf8')),
    ...JSON.parse(fs.readFileSync('data/site-pages.json', 'utf8'))
];

const ids = new Set();
const paths = new Set();

for (const entry of SITE_ROUTES) {
    assert.ok(entry.id && !ids.has(entry.id), `duplicate or missing stable id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(!paths.has(entry.path), `duplicate public path: ${entry.path}`);
    paths.add(entry.path);
    assert.ok(entry.source, `missing source: ${entry.id}`);
    assert.ok(entry.nav && typeof entry.nav.visible === 'boolean', `missing navigation metadata: ${entry.id}`);
    const href = entry.path ? `${entry.path}/` : '';
    const pathname = `/${href}`;
    const route = pathname.replace(/^\/+|\/+$/g, '');
    assert.equal(route, entry.path, `route round trip failed: ${entry.id}`);
    assert.ok(fs.existsSync(entry.source), `missing page source: ${entry.id}`);
    if (entry.path) {
        const html = fs.readFileSync(entry.source, 'utf8');
        const sourceDepth = path.dirname(entry.source).split(/[\\/]/).filter((part) => part && part !== '.').length;
        const baseHref = '../'.repeat(sourceDepth);
        const baseIndex = html.indexOf(`<base href="${baseHref}">`);
        assert.ok(baseIndex >= 0, `missing canonical base href: ${entry.path}`);
        assert.ok(baseIndex < html.indexOf('output/css/site.css'), `base must precede assets: ${entry.path}`);
    }
}

for (const entry of SITE_ROUTES.filter((entry) => entry.nav.visible)) {
    const row = runtimeCatalog.find((candidate) => candidate.id === entry.id);
    assert.ok(row, `runtime catalog is missing: ${entry.id}`);
    const href = `/${row.path ? `${row.path}/` : ''}`;
    assert.equal(row.id, entry.id, `runtime catalog id mismatch: ${entry.id}`);
    assert.equal(href, `/${entry.path ? `${entry.path}/` : ''}`, `runtime catalog href mismatch: ${entry.id}`);
}
console.log(`OK ${SITE_ROUTES.length} routes round-trip and have static output`);
