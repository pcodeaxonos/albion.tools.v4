/**
 * Downloads item icons from Albion render CDN into ./icons/
 * so the app can serve them locally (no runtime CDN requests).
 *
 * Usage: node scripts/fetch-item-icons.mjs [--force] [--concurrency=24] [--size=128]
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'icons');
const ITEMS_PATH = join(ROOT, 'data', 'items.json');
const ICON_BASE = 'https://render.albiononline.com/v1/item';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || 24;
const size = Number(args.find((a) => a.startsWith('--size='))?.split('=')[1]) || 128;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchBinary(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: { 'User-Agent': 'albion.tools.v4-icon-fetch' },
            timeout: 30000
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                if (redirects >= 5) {
                    reject(new Error(`Too many redirects for ${url}`));
                    return;
                }
                fetchBinary(response.headers.location, redirects + 1).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                const err = new Error(`HTTP ${response.statusCode}`);
                err.statusCode = response.statusCode;
                response.resume();
                reject(err);
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
    });
}

async function downloadOne(uniqueName) {
    const fileName = `${uniqueName}.png`;
    const dest = join(ICONS_DIR, fileName);
    const tmp = `${dest}.part`;

    if (!FORCE && existsSync(dest)) {
        try {
            if (statSync(dest).size > 0) {
                return 'skip';
            }
        } catch {
            /* retry download */
        }
    }

    const url = `${ICON_BASE}/${encodeURIComponent(uniqueName)}.png?size=${size}`;
    let lastError;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            const buf = await fetchBinary(url);
            if (!buf.length) {
                throw new Error('empty body');
            }
            writeFileSync(tmp, buf);
            renameSync(tmp, dest);
            return 'ok';
        } catch (error) {
            lastError = error;
            if (existsSync(tmp)) {
                try { unlinkSync(tmp); } catch { /* ignore */ }
            }
            if (error.statusCode === 404) {
                return 'missing';
            }
            await sleep(400 * attempt * attempt);
        }
    }

    throw lastError;
}

async function runPool(items, worker) {
    let index = 0;
    let ok = 0;
    let skip = 0;
    let missing = 0;
    let fail = 0;
    const failures = [];

    async function workerLoop() {
        while (true) {
            const i = index;
            index += 1;
            if (i >= items.length) {
                return;
            }
            const uniqueName = items[i];
            try {
                const result = await worker(uniqueName);
                if (result === 'ok') ok += 1;
                else if (result === 'skip') skip += 1;
                else if (result === 'missing') missing += 1;
            } catch (error) {
                fail += 1;
                if (failures.length < 20) {
                    failures.push(`${uniqueName}: ${error.message}`);
                }
            }

            const done = ok + skip + missing + fail;
            if (done % 200 === 0 || done === items.length) {
                console.log(`  ${done}/${items.length} (ok ${ok}, skip ${skip}, missing ${missing}, fail ${fail})`);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => workerLoop()));
    return { ok, skip, missing, fail, failures };
}

async function main() {
    if (!existsSync(ITEMS_PATH)) {
        throw new Error(`Missing ${ITEMS_PATH}. Run npm run data:fetch first.`);
    }

    mkdirSync(ICONS_DIR, { recursive: true });

    const items = JSON.parse(readFileSync(ITEMS_PATH, 'utf8'));
    const names = [...new Set(items.map((row) => row.uniqueName).filter(Boolean))];

    console.log(`Downloading ${names.length} icons → icons/ (size=${size}, concurrency=${concurrency}${FORCE ? ', force' : ''})`);

    const started = Date.now();
    const stats = await runPool(names, downloadOne);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`Done in ${seconds}s — ok ${stats.ok}, skip ${stats.skip}, missing ${stats.missing}, fail ${stats.fail}`);
    if (stats.failures.length) {
        console.log('Sample failures:');
        for (const line of stats.failures) {
            console.log(`  - ${line}`);
        }
    }

    if (stats.fail > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
