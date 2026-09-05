/**
 * Downloads and normalizes Albion Online static reference data.
 *
 * Sources:
 * - https://github.com/ao-data/ao-bin-dumps (Albion Online Data Project)
 *
 * Item display names use EN-US only. Shop classification comes from the
 * dump's @shopcategory / @shopsubcategory1 / @shopsubcategory2, aligned
 * with item-categories.json slugs (join by slug + parent, not id).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const SOURCES = {
    items: 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json',
    world: 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/world.json',
    itemsXml: 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json'
};

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'albion.tools.v4-data-fetch' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                fetchJson(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                response.resume();
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (error) {
                    reject(error);
                }
            });
            response.on('error', reject);
        }).on('error', reject);
    });
}

function writeJson(filename, data) {
    const path = join(DATA_DIR, filename);
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    const sizeKb = (Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1);
    console.log(`  ✓ ${filename} — ${Array.isArray(data) ? data.length : 'object'} records (${sizeKb} KB)`);
}

function parseTier(uniqueName) {
    const match = uniqueName.match(/^T(\d)/);
    return match ? Number(match[1]) : 0;
}

function parseEnchantment(uniqueName) {
    const match = uniqueName.match(/@(\d)$/);
    return match ? Number(match[1]) : 0;
}

function parseItemType(uniqueName) {
    const core = uniqueName
        .replace(/^T\d+_/, '')
        .replace(/@\d+$/, '')
        .replace(/^QUESTITEM_/, '')
        .replace(/^UNIQUE_/, 'UNIQUE_');

    const token = core.split('_')[0];
    return token || 'OTHER';
}

function isEquipable(uniqueName) {
    return /^(T\d_)?(2H|MAIN|OFF|SHOES|HEAD|ARMOR|CAPE|BAG|SLOT)/.test(uniqueName);
}

function englishName(item) {
    return item.LocalizedNames?.['EN-US']
        ?? item.LocalizedNames?.['EN-GB']
        ?? item.UniqueName;
}

function emptyShop() {
    return { shopCategory: '', shopSubCategory: '', shopSubCategory2: '' };
}

function collectShopFields(itemsRoot) {
    const map = new Map();

    function visit(node) {
        if (!node || typeof node !== 'object') {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        const uniqueName = node['@uniquename'];
        if (typeof uniqueName === 'string' && uniqueName) {
            const shop = {
                shopCategory: node['@shopcategory'] ?? '',
                shopSubCategory: node['@shopsubcategory1'] ?? '',
                shopSubCategory2: node['@shopsubcategory2'] ?? ''
            };

            if ((shop.shopCategory || shop.shopSubCategory || shop.shopSubCategory2) && !map.has(uniqueName)) {
                map.set(uniqueName, shop);
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (key.startsWith('@') || key === 'shopcategories') {
                continue;
            }

            if (value && typeof value === 'object') {
                visit(value);
            }
        }
    }

    visit(itemsRoot);
    return map;
}

function lookupShop(uniqueName, shopMap) {
    if (shopMap.has(uniqueName)) {
        return shopMap.get(uniqueName);
    }

    const baseName = uniqueName.replace(/@\d+$/, '');
    return shopMap.get(baseName) ?? emptyShop();
}

function normalizeItems(rawItems, shopMap) {
    return rawItems.map((item) => {
        const uniqueName = item.UniqueName;
        const shop = lookupShop(uniqueName, shopMap);

        return {
            id: Number(item.Index),
            uniqueName,
            localizedName: englishName(item),
            tier: parseTier(uniqueName),
            enchantment: parseEnchantment(uniqueName),
            itemType: parseItemType(uniqueName),
            isEquipable: isEquipable(uniqueName),
            shopCategory: shop.shopCategory,
            shopSubCategory: shop.shopSubCategory,
            shopSubCategory2: shop.shopSubCategory2
        };
    });
}

function classifyLocation(uniqueName) {
    const name = uniqueName.toUpperCase();

    if (/^T\d/.test(name) || name.includes('ISLAND')) {
        return 'Island';
    }

    if (name.includes('HELLGATE') || name.includes('MIST') || name.includes('DUNGEON')) {
        return 'Dungeon';
    }

    if (name.includes(' MARKET') || name.endsWith('MARKET')) {
        return 'Market';
    }

    if (name.includes(' BANK') || name.startsWith('BANK OF')) {
        return 'Bank';
    }

    const royalCities = new Set([
        'BRIDGEWATCH', 'FORT STERLING', 'LYMHURST', 'MARTLOCK',
        'THETFORD', 'CAERLEON', 'BRECILIEN', 'BLACK MARKET'
    ]);

    if (royalCities.has(name)) {
        return 'City';
    }

    if (/^[A-Z0-9-]+$/.test(uniqueName) && uniqueName.includes('-')) {
        return 'Zone';
    }

    return 'Other';
}

function normalizeLocations(rawWorld) {
    return rawWorld.map((entry, index) => ({
        id: index + 1,
        index: String(entry.Index),
        uniqueName: entry.UniqueName,
        displayName: entry.UniqueName,
        locationType: classifyLocation(entry.UniqueName)
    }));
}

function asArray(value) {
    if (!value) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function flattenShopCategories(shopCategoriesRoot) {
    const rows = [];
    let id = 1;

    for (const category of asArray(shopCategoriesRoot?.shopcategory)) {
        rows.push({
            id: id++,
            slug: category['@id'],
            level: 'category',
            parentSlug: '',
            sortValue: Number(category['@value']) || 0
        });

        for (const sub of asArray(category.shopsubcategory)) {
            rows.push({
                id: id++,
                slug: sub['@id'],
                level: 'subcategory',
                parentSlug: category['@id'],
                sortValue: Number(sub['@value']) || 0
            });

            for (const sub2 of asArray(sub.shopsubcategory2)) {
                rows.push({
                    id: id++,
                    slug: sub2['@id'],
                    level: 'subcategory2',
                    parentSlug: sub['@id'],
                    sortValue: Number(sub2['@value']) || 0
                });
            }
        }
    }

    return rows;
}

async function main() {
    mkdirSync(DATA_DIR, { recursive: true });

    console.log('Fetching Albion Online reference data...\n');

    console.log('Item dump (items.json → shopcategories + shop fields)...');
    const itemsXml = await fetchJson(SOURCES.itemsXml);
    const categories = flattenShopCategories(itemsXml?.items?.shopcategories);
    writeJson('item-categories.json', categories);

    const shopMap = collectShopFields(itemsXml?.items);
    console.log(`  shop map: ${shopMap.size} unique names with category fields`);

    console.log('Items (formatted/items.json, EN-US names + shop classification)...');
    const rawItems = await fetchJson(SOURCES.items);
    const items = normalizeItems(rawItems, shopMap);
    writeJson('items.json', items);

    const classified = items.filter((item) => item.shopCategory).length;
    const withSub = items.filter((item) => item.shopCategory && item.shopSubCategory).length;
    const withSub2 = items.filter((item) => item.shopSubCategory2).length;
    console.log(`  classified ${classified}/${items.length} (category)`);
    console.log(`  subcategory ${withSub}/${items.length}; subcategory2 ${withSub2}/${items.length}`);

    console.log('Locations (formatted/world.json)...');
    const rawWorld = await fetchJson(SOURCES.world);
    const locations = normalizeLocations(rawWorld);
    writeJson('locations.json', locations);

    console.log('\nSkipping cities.json — maintained manually in data/cities.json');
    console.log('Done.');
}

main().catch((error) => {
    console.error('Fetch failed:', error.message);
    process.exit(1);
});
