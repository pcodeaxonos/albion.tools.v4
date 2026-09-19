/**
 * Imports Albion's static crafting recipes into the relational seed tables.
 * Keeps curated recipes and appends game recipes with item-id relationships.
 * Run: node scripts/build-game-recipe-catalog.mjs
 */
import fs from 'node:fs';
import https from 'node:https';

const DATA = new URL('../data/', import.meta.url);
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
    const uniqueName = node['@uniquename'];
    const requirements = asList(node.craftingrequirements)[0];
    const materials = asList(requirements?.craftresource)
        .map((row) => ({ uniqueName: row['@uniquename'], qty: Number(row['@count']) || 0 }))
        .filter((row) => row.uniqueName && row.qty > 0);
    if (uniqueName && materials.length && !output.has(uniqueName)) output.set(uniqueName, materials);
    Object.entries(node).forEach(([key, value]) => {
        if (!key.startsWith('@') && key !== 'craftingrequirements') collectRecipes(value, output);
    });
}

const [itemsXml, items, recipes, lines, families] = await Promise.all([
    fetchJson('https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json'),
    read('items.json'), read('craft-recipes.json'), read('craft-recipe-lines.json'), read('bonus-families.json')
]);
const itemId = new Map(items.map((item) => [item.uniqueName, Number(item.id)]));
const familyId = new Map(families.map((family) => [family.familyKey, Number(family.id)]));
const gameRecipes = new Map();
collectRecipes(itemsXml.items, gameRecipes);

const existingOutputIds = new Set(recipes.map((recipe) => Number(recipe.outputItemId)));
let nextRecipeId = Math.max(0, ...recipes.map((recipe) => Number(recipe.id))) + 1;
let nextLineId = Math.max(0, ...lines.map((line) => Number(line.id))) + 1;
let imported = 0;
let skipped = 0;

function bonusFamilyId(item) {
    const sub = String(item.shopSubCategory || '');
    const category = String(item.shopCategory || '');
    const candidates = [
        `${category}/${sub}`,
        `weapons/${sub}`,
        `head/${sub}`,
        `armors/${sub}`,
        `shoes/${sub}`,
        `category/${sub}`
    ];
    return candidates.map((key) => familyId.get(key)).find(Boolean) ?? null;
}

for (const [uniqueName, materials] of gameRecipes) {
    const outputItemId = itemId.get(uniqueName);
    const materialRows = materials.map((material) => ({ ...material, inputItemId: itemId.get(material.uniqueName) }));
    if (!outputItemId || existingOutputIds.has(outputItemId) || materialRows.some((material) => !material.inputItemId)) {
        skipped += 1;
        continue;
    }
    const output = items.find((item) => Number(item.id) === outputItemId);
    const recipeId = nextRecipeId++;
    recipes.push({
        id: recipeId,
        code: `game-${uniqueName.toLowerCase()}`,
        tool: 'gameinfo',
        kind: output?.shopSubCategory || output?.itemType || 'game',
        tier: Number(output?.tier) || null,
        outputItemId,
        bonusFamilyId: bonusFamilyId(output || {}),
        sortValue: recipeId * 10,
        isActive: true
    });
    materialRows.forEach((material, index) => lines.push({
        id: nextLineId++, recipeId, materialKeyId: null, inputItemId: material.inputItemId,
        qty: material.qty, appliesRr: true, sortValue: index + 1
    }));
    existingOutputIds.add(outputItemId);
    imported += 1;
}

write('craft-recipes.json', recipes);
write('craft-recipe-lines.json', lines);
console.log(`Imported ${imported} game recipes; skipped ${skipped}.`);
