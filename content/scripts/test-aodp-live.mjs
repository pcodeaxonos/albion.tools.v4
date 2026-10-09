/** Opt-in real-network smoke: starts its own hub, opens no browser or market, then stops only that child. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createServer } from 'node:net';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const get = path => new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, res => {
        let body = ''; res.on('data', bytes => body += bytes); res.on('end', () => {
            try { if (res.statusCode !== 200) throw new Error(body); resolve(JSON.parse(body)); } catch (error) { reject(error); }
        });
    });
    req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('Hub status timeout')));
});
const proofPath = 'docs/aodp-live-proof.json';
const previous = existsSync(proofPath) ? JSON.parse(readFileSync(proofPath, 'utf8')) : null;
const proof = { kind: 'albion.tools.aodp-live-proof', testedAt: new Date().toISOString(),
    initialTestedAt: previous?.initialTestedAt ?? previous?.testedAt ?? new Date().toISOString(), runs: previous?.runs ?? [] };
for (let restart = 0; restart < 2; restart++) {
    const child = spawn(process.execPath, ['content/scripts/price-hub.mjs'], {
        windowsHide: true, env: { ...process.env, PRICE_HUB_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '', errors = '';
    try {
        const summary = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Live collector timed out: ${errors}`)), 180000);
            child.stderr.on('data', bytes => errors += bytes);
            child.once('error', error => { clearTimeout(timeout); reject(error); });
            child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Hub exited ${code}: ${errors}`)); });
            child.stdout.on('data', bytes => {
                output += bytes;
                const match = output.match(/\[AODP collector\] (\{[^\n]+\})/);
                if (match) { clearTimeout(timeout); resolve(JSON.parse(match[1])); }
            });
        });
        console.log(`LIVE restart=${restart} ${JSON.stringify(summary)}`);
        assert.ok(summary.buy > 0 && summary.sell > 0, 'real AODP returns valid Buy and Sell');
        assert.ok(summary.observations + summary.duplicates > 0, 'real snapshots recorded or deduped');
        const status = await get('/api/v2/stats/status');
        assert.equal(status.sessionMarketAt, null, 'no market packet was received in this hub session');
        assert.ok(status.collector.lastRun && status.collector.itemCount > 0);
        const refs = await get(`/api/v1/market/long-term?server=${status.collector.server}&items=T3_WHEAT&locations=Martlock&qualities=1`);
        assert.ok(refs.references.some(ref => ref.price > 0), 'real long-term references are served');
        proof.runs.push({ restart, summary, collector: status.collector, sessionMarketAt: status.sessionMarketAt, references: refs.references });
    } finally {
        if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    }
}
writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
console.log('PASS real hub startup + restart automatically collected AODP quotes without market packets. Proof: docs/aodp-live-proof.json');
