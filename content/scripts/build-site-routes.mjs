import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

// Source files live under pages/, while public paths remain the canonical
// /tools/* and /admin/* URLs declared in the registry.
for (const entry of SITE_ROUTES) {
    if (!fs.existsSync(entry.source)) {
        throw new Error(`Missing page source: ${entry.source}`);
    }
}

console.log(`OK ${SITE_ROUTES.length} authored pages map to canonical public routes`);
