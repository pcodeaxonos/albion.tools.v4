import { USER_DATA_ENDPOINT, USER_DATA_MAX_BYTES } from '../js/core/persistence-config.mjs';

async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > USER_DATA_MAX_BYTES) { const error = new Error('Veri paketi çok büyük'); error.status = 413; throw error; }
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { const error = new Error('Geçersiz JSON'); error.status = 400; throw error; }
}

export async function routeUserData(req, res, repository, path, send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
}) {
    if (path !== USER_DATA_ENDPOINT && !path.startsWith(USER_DATA_ENDPOINT + '/')) return false;
    try {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'GET' && path === USER_DATA_ENDPOINT) {
            send(res, 200, { ...repository.snapshot(), backup: repository.status() }, { compress: true });
        } else if (req.method === 'PUT' && path === USER_DATA_ENDPOINT) {
            const body = await readJson(req);
            send(res, 200, repository.write(body.changes));
        } else if (req.method === 'POST' && path === USER_DATA_ENDPOINT + '/import') {
            const body = await readJson(req);
            if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
                send(res, 400, { error: 'Geçersiz aktarım' }); return true;
            }
            send(res, 200, repository.importLegacy(body.data, body.source));
        } else if (req.method === 'POST' && path === USER_DATA_ENDPOINT + '/backup') {
            await repository.createBackup(); send(res, 200, repository.status());
        } else send(res, 405, { error: 'Desteklenmeyen yöntem' });
    } catch (error) { send(res, error.status || 500, { error: error.message }); }
    return true;
}
