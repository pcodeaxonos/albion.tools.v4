import fs from 'node:fs';
import path from 'node:path';

const routes = {
    'daily-bonus': 'pages/logs/daily-bonus.html',
    'island-yields': 'pages/logs/island-yields.html',
    trades: 'pages/logs/trades.html',
    farming: 'pages/tools/farming.html',
    pasture: 'pages/tools/pasture.html',
    'island-planner': 'pages/tools/island-planner.html',
    'island-planner-v2': 'pages/tools/island-planner-v2.html',
    malzemeler: 'pages/tools/malzemeler.html',
    faction: 'pages/tools/faction.html',
    refining: 'pages/tools/refining.html',
    furniture: 'pages/tools/furniture.html',
    house: 'pages/tools/house.html',
    'ava-craft': 'pages/tools/ava-craft.html',
    'carleon-craft': 'pages/tools/carleon-craft.html',
    'royal-craft': 'pages/tools/royal-craft.html',
    enchanting: 'pages/tools/enchanting.html',
    db: 'pages/admin/db.html',
    settings: 'pages/admin/settings.html'
};

for (const [route, target] of Object.entries(routes)) {
    const dir = path.join(route);
    fs.mkdirSync(dir, { recursive: true });
    const href = `../${target}`;
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${href}"><link rel="canonical" href="${href}"><script>location.replace(${JSON.stringify(href)});</script></head><body><a href="${href}">Yönlendiriliyor…</a></body></html>
`);
}
