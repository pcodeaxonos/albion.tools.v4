export const GAME_DATA_SOURCES = Object.freeze({
    items: 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json',
    world: 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/world.json',
    itemsXml: 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json'
});
export const GAME_DATA_DIRECTORY = new URL('../../data/',import.meta.url);
export function gameItemMaxQuality(node) {
    const value = Number(node['@maxqualitylevel'] ?? 1);
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}
export function* gameItemNodes(root) {
    if (!root || typeof root !== 'object') return;
    if (Array.isArray(root)) { for (const child of root) yield* gameItemNodes(child); return; }
    if (root['@uniquename']) yield root;
    for (const [key,value] of Object.entries(root)) if (!key.startsWith('@') && key !== 'shopcategories' && value && typeof value === 'object') yield* gameItemNodes(value);
}
