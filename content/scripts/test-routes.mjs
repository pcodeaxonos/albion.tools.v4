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
    if (entry.path) assert.ok(fs.existsSync(path.join(entry.path, 'index.html')), `missing route output: ${entry.path}`);
    if (entry.path) {
        const html = fs.readFileSync(path.join(entry.path, 'index.html'), 'utf8');
        const baseHref = '../'.repeat(entry.path.split('/').filter(Boolean).length);
        assert.ok(html.indexOf(`<base href="${baseHref}">`) < html.indexOf('output/css/site.css'), `base must precede assets: ${entry.path}`);
        assert.equal(path.normalize(entry.source), path.join(entry.path, 'index.html'), `source/output mismatch: ${entry.id}`);
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
