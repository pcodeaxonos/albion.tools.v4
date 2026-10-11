/**
 * Imports Albion's static crafting recipes into the recipe-materials seed.
 * Keeps curated recipe materials and appends game recipes with item-id relationships.
 * Run: node scripts/build-game-recipe-catalog.mjs
 */
import fs from 'node:fs';
import https from 'node:https';
import { collectRecipeMechanics } from '../js/core/recipe-mechanics.mjs';

const DATA = new URL('../../data/', import.meta.url);
const GAME_ITEMS_SOURCE = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json';
const read = (name) => JSON.parse(fs.readFileSync(new URL(name, DATA), 'utf8'));
const write = (name, value) => fs.writeFileSync(new URL(name, DATA), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'albion.tools.v4-recipe-import' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                fetchJson(response.headers.location).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`HTTP ${response.statusCode} — ${url}`));
                return;
            }
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
            });
        }).on('error', reject);
    });
}

function asList(value) {
    return value == null ? [] : Array.isArray(value) ? value : [value];
}

function collectRecipes(node, output) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((value) => collectRecipes(value, output));
        return;
    }
    const itemUnique = (row) => `${row['@uniquename']}${Number(row['@enchantmentlevel']) > 0 ? `@${Number(row['@enchantmentlevel'])}` : ''}`;
    const uniqueName = node['@uniquename'] ? itemUnique(node) : null;
    const requirements = asList(node.craftingrequirements)[0];
    const materials = asList(requirements?.craftresource)
        .map((row) => ({ uniqueName: row['@uniquename'] ? itemUnique(row) : null, qty: Number(row['@count']) || 0, appliesRr: row['@maxreturnamount'] !== '0' }))
        .filter((row) => row.uniqueName && row.qty > 0);
    if (uniqueName && materials.length && !output.has(uniqueName)) output.set(uniqueName, materials);
    Object.entries(node).forEach(([key, value]) => {
        if (!key.startsWith('@') && key !== 'craftingrequirements') collectRecipes(value, output);
    });
}

const [itemsXml, items, recipeMaterials] = await Promise.all([
    fetchJson(GAME_ITEMS_SOURCE),
    read('items.json'), read('recipe-materials.json')
]);
const itemId = new Map(items.map((item) => [item.uniqueName, Number(item.id)]));
const gameRecipes = new Map();
collectRecipes(itemsXml.items, gameRecipes);

const existingOutputIds = new Set(recipeMaterials.map((material) => Number(material.outputItemId)));
let nextLineId = Math.max(0, ...recipeMaterials.map((material) => Number(material.id))) + 1;
let imported = 0;
let skipped = 0;

for (const [uniqueName, inputMaterials] of gameRecipes) {
    const outputItemId = itemId.get(uniqueName);
    const materialRows = inputMaterials.map((material) => ({ ...material, inputItemId: itemId.get(material.uniqueName) }));
    if (!outputItemId || existingOutputIds.has(outputItemId) || materialRows.some((material) => !material.inputItemId)) {
        skipped += 1;
        continue;
    }
    materialRows.forEach((material, index) => recipeMaterials.push({
        id: nextLineId++, outputItemId, inputItemId: material.inputItemId,
        qty: material.qty, appliesRr: material.appliesRr, sortValue: index + 1
    }));
    existingOutputIds.add(outputItemId);
    imported += 1;
}

if (!process.argv.includes('--mechanics-only')) write('recipe-materials.json', recipeMaterials);
const mechanics = collectRecipeMechanics(itemsXml.items);
write('recipe-mechanics.json', {
    source: GAME_ITEMS_SOURCE,
    fetchedAt: new Date().toISOString(),
    recipes: [...mechanics.values()].filter(recipe => itemId.has(recipe.uniqueName))
});
console.log(process.argv.includes('--mechanics-only') ? 'Generated recipe mechanics; existing recipe materials preserved.' : `Imported ${imported} game recipes; skipped ${skipped}.`);
