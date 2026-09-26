import fs from 'node:fs';
import path from 'node:path';

function readCatalog(name) {
    return JSON.parse(fs.readFileSync(path.join('data', `${name}.json`), 'utf8'));
}

const routes = [...readCatalog('site-tools'), ...readCatalog('site-pages')]
    .map(({ href }) => String(href || '').replace(/^\/+/, ''))
    .filter((href) => href.startsWith('pages/') && href.endsWith('.html'))
    .map((href) => [path.basename(href, '.html'), href]);

for (const [route, target] of routes) {
    const dir = path.join(route);
    fs.mkdirSync(dir, { recursive: true });
    const href = `../${target}`;
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${href}"><link rel="canonical" href="${href}"><script>location.replace(${JSON.stringify(href)});</script></head><body><a href="${href}">Yönlendiriliyor…</a></body></html>
`);
}
