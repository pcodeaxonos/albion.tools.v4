// Enrich the existing catalog in place; preserve IDs, names and user metadata.
import fs from 'node:fs';
import { GAME_DATA_SOURCES, GAME_DATA_DIRECTORY, gameItemNodes, gameItemMaxQuality } from './game-data-source.mjs';
const response = await fetch(GAME_DATA_SOURCES.itemsXml);
if (!response.ok) throw Error(`Game metadata HTTP ${response.status}`);
const limits = new Map([...gameItemNodes(await response.json())].map(node => [node['@uniquename'],gameItemMaxQuality(node)]));
const file = new URL('items.json',GAME_DATA_DIRECTORY);
const items = JSON.parse(fs.readFileSync(file,'utf8'));
let known=0;
for (const item of items) {
    item.maxQualityLevel = limits.get(item.uniqueName) ?? limits.get(item.uniqueName.replace(/@\d+$/,'')) ?? null;
    if(item.maxQualityLevel != null) known++;
}
fs.writeFileSync(file,JSON.stringify(items,null,2)+'\n');
console.log(`PASS enriched existing catalog: ${known}/${items.length} source-backed quality limits; unknowns remain null`);
