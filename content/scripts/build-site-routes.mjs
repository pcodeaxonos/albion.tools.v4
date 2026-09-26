import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

// Pages are authored and published from their canonical pages/* locations.
for (const entry of SITE_ROUTES) {
    if (!fs.existsSync(entry.source)) {
        throw new Error(`Missing page source: ${entry.source}`);
    }
}

console.log(`OK ${SITE_ROUTES.length} authored pages map to canonical public routes`);
