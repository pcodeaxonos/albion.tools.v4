import { readFileSync, openSync, closeSync, writeSync, fsyncSync, existsSync, unlinkSync, truncateSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { emptyEvidence, applyEvidenceCommand, validateSnapshot, evidenceCanonical, OPPORTUNITY_EVIDENCE_API } from '../js/core/opportunity-evidence.mjs';

export const EVIDENCE_PATH = OPPORTUNITY_EVIDENCE_API;
export const canonical = evidenceCanonical;
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value; }
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export class OpportunityEvidenceRepository {
    constructor(path) {
        this.path = path; this.lockPath = `${path}.lock`; this.state = emptyEvidence(); this.receipts = new Map(); this.chain = ''; this.fd = null; this.failed = false;
        if (existsSync(this.lockPath)) {
            const pid = Number(readFileSync(this.lockPath, 'utf8'));
            if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('V6 kayıt kilidi bozuk; dosyayı inceleyin.');
            let alive = true;
            try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
            if (alive) throw Error('V6 kayıtları başka bir servis tarafından kullanılıyor.');
            unlinkSync(this.lockPath);
        }
        const lock = openSync(this.lockPath, 'wx');
        try { writeSync(lock, String(process.pid)); fsyncSync(lock); } finally { closeSync(lock); }
        try {
            if (existsSync(path)) {
                const bytes = readFileSync(path), lastNewline = bytes.lastIndexOf(10);
                const complete = bytes.subarray(0, lastNewline + 1).toString('utf8');
                for (const line of complete.split('\n').filter(Boolean)) this.replay(JSON.parse(line));
                // Only an incomplete final append can be recovered. Complete corrupt entries fail closed.
                if (lastNewline + 1 < bytes.length) {
                    const backup = `${path}.incomplete-${Date.now()}.bak`; copyFileSync(path, backup); truncateSync(path, lastNewline + 1);
                    this.recovery = { backup, discardedBytes: bytes.length - lastNewline - 1 };
                }
            }
            this.fd = openSync(path, 'a');
        } catch (error) { unlinkSync(this.lockPath); throw new Error(`V6 kayıtları açılamadı: ${error.message}`); }
    }
    replay(record) {
        const { checksum, ...payload } = record;
        if (payload.version !== 1 || payload.previous !== this.chain || checksum !== hash(payload) || this.receipts.has(payload.requestId)) throw Error('V6 günlüğü bütünlük kontrolü başarısız.');
        this.state = applyEvidenceCommand(this.state, payload.command, payload);
        this.receipts.set(payload.requestId, { digest: hash(payload.command), result: { requestId: payload.requestId, signalId: payload.signalId, recordedAt: payload.recordedAt } });
        this.chain = checksum;
    }
    snapshot() { return JSON.parse(JSON.stringify(this.state)); }
    submit(input) {
        if (this.failed || this.fd == null) throw Error('V6 kayıt servisi yazıma kapalı.');
        const requestId = input.requestId;
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) throw Error('Geçerli istek kimliği gerekli.');
        const command = sort(JSON.parse(JSON.stringify(input.command)));
        if (['check', 'start'].includes(command.type)) command.snapshot = sort(validateSnapshot(command.snapshot));
        const digest = hash(command), existing = this.receipts.get(requestId);
        if (existing) {
            if (existing.digest !== digest) throw Error('Aynı istek kimliği farklı içerikle kullanılamaz.');
            return { ...existing.result, duplicate: true };
        }
        const signalId = command.snapshot ? hash(command.snapshot) : this.state.trades[command.tradeId]?.signalId;
        const payload = { version: 1, requestId, signalId, recordedAt: new Date().toISOString(), command, previous: this.chain };
        const next = applyEvidenceCommand(this.state, command, payload);
        const checksum = hash(payload), bytes = Buffer.from(JSON.stringify({ ...payload, checksum }) + '\n');
        try {
            let offset = 0; while (offset < bytes.length) { const written = writeSync(this.fd, bytes, offset, bytes.length - offset); if (!written) throw Error('Eksik günlük yazımı'); offset += written; }
            fsyncSync(this.fd);
        } catch (error) { this.failed = true; throw Error(`V6 disk kaydı onaylanamadı; aynı isteği yeniden deneyin: ${error.message}`); }
        this.state = next; this.chain = checksum;
        const result = { requestId, signalId, recordedAt: payload.recordedAt };
        this.receipts.set(requestId, { digest, result }); return result;
    }
    close() { if (this.fd != null) { closeSync(this.fd); this.fd = null; unlinkSync(this.lockPath); } }
}
export async function routeOpportunityEvidence(req, res, repository, path) {
    if (path !== EVIDENCE_PATH) return false;
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (req.method === 'GET') { send(200, repository.snapshot()); return true; }
    if (req.method !== 'POST') { send(405, { error: 'GET/POST kullanın.' }); return true; }
    try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 256 * 1024) throw Error('V6 istek boyutu çok büyük.'); chunks.push(chunk); }
        const result = repository.submit(JSON.parse(Buffer.concat(chunks).toString('utf8'))); send(200, result);
    } catch (error) { send(repository.failed ? 503 : 400, { error: error.message }); }
    return true;
}
