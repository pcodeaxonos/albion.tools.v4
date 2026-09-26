import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROUTES } from './site-routes.mjs';

for (const entry of SITE_ROUTES) {
    if (!entry.route) continue;
    const source = fs.readFileSync(entry.source, 'utf8').replace(/\s*<base\s+href=[^>]+>\s*/i, '\n');
    const output = path.join(entry.route, 'index.html');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    // A base element must be parsed before any relative asset URL. Browsers resolve
    // earlier link/script attributes immediately, so appending it before </head>
    // leaves CSS and modules incorrectly scoped under /{route}/.
    fs.writeFileSync(output, source.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    <base href="../">`));
}
