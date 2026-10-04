import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

// Bound filesystem concurrency even when a page requests hundreds of icons.
const queue = [];
let active = 0;
function drain() {
    while (active < 16 && queue.length) {
        const work = queue.shift();
        active++;
        work().finally(() => { active--; drain(); });
    }
}
function insideRoot(file) {
    const relative = path.relative(root, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
    }
    queue.push(async () => {
        if (res.destroyed) return;
        try {
            const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            let file = path.resolve(root, `.${pathname}`);
            if (!insideRoot(file) || path.relative(root, file).split(path.sep).some(part => part.startsWith('.'))) {
                res.writeHead(403).end();
                return;
            }
            if ((await stat(file)).isDirectory()) {
                if (!pathname.endsWith('/')) {
                    res.writeHead(301, { Location: `${pathname}/${new URL(req.url, 'http://localhost').search}` }).end();
                    return;
                }
                file = path.join(file, 'index.html');
            }
            file = await realpath(file);
            if (!insideRoot(file)) { res.writeHead(403).end(); return; }
            const data = await readFile(file);
            res.writeHead(200, {
                'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
                'Content-Length': data.length,
                'Cache-Control': 'no-cache'
            });
            res.end(req.method === 'HEAD' ? undefined : data);
        } catch (error) {
            const status = ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : error instanceof URIError ? 400 : 500;
            if (status === 500) console.error(error);
            res.writeHead(status).end();
        }
    });
    drain();
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '::', () => console.log(`Albion Tools: http://localhost:${port}`));
