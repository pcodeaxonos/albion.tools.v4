import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

// Pages are authored at their canonical static-site locations.  Keeping source
// and output together avoids a second generated HTML tree and prevents stale
// root-level route directories from being recreated by builds.
for (const entry of SITE_ROUTES) {
    const output = entry.path ? path.join(entry.path, 'index.html') : 'index.html';
    if (path.normalize(entry.source) !== path.normalize(output)) {
        throw new Error(`Source must be the canonical output: ${entry.id} (${entry.source} !== ${output})`);
    }
    if (!fs.existsSync(entry.source)) {
        throw new Error(`Missing page source: ${entry.source}`);
    }
}

console.log(`OK ${SITE_ROUTES.length} authored routes match their canonical output paths`);
