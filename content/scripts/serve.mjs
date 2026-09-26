import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const routeSources = new Map(SITE_ROUTES.map((entry) => [entry.path, entry.source]));
const mimeTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp'],
    ['.ico', 'image/x-icon']
]);

function sendNotFound(response) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function fileForPathname(pathname) {
    const decoded = decodeURIComponent(pathname);
    const route = decoded.replace(/^\/+|\/+$/g, '');
    if (routeSources.has(route)) return path.join(root, routeSources.get(route));

    const relative = route || 'index.html';
    const candidate = path.resolve(root, relative);
    if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) return null;
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return path.join(candidate, 'index.html');
    return candidate;
}

createServer((request, response) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    let file;
    try {
        file = fileForPathname(pathname);
    } catch {
        sendNotFound(response);
        return;
    }

    if (!file || !existsSync(file) || statSync(file).isDirectory()) {
        sendNotFound(response);
        return;
    }

    response.writeHead(200, {
        'content-type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
        'cache-control': 'no-cache'
    });
    createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
    console.log(`Albion Tools: http://127.0.0.1:${port}`);
});
