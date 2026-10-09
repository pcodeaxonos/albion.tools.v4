/** Market scope from relational catalogs, independent of the currently open plan. */
export function islandMarketItemIds({ plants = [], animals = [], items = [], recipeMaterials = [] }) {
    const byId = new Map(items.map(item => [Number(item.id), item]));
    const ids = new Set();
    const add = id => { const name = byId.get(Number(id))?.uniqueName; if (name) ids.add(name); };
    for (const plant of plants.filter(row => row.isActive !== false)) {
        add(plant.seedItemId); add(plant.plantItemId);
    }
    const grown = new Set();
    for (const animal of animals.filter(row => row.isActive !== false)) {
        for (const field of ['babyItemId', 'grownItemId', 'meatItemId', 'productItemId']) add(animal[field]);
        grown.add(Number(animal.grownItemId));
    }
    const mounts = new Set(recipeMaterials.filter(line => grown.has(Number(line.inputItemId)))
        .map(line => Number(line.outputItemId)).filter(id => {
            const item = byId.get(id);
            return item?.itemType === 'MOUNT' && !/TEST|_SKIN/.test(item.uniqueName);
        }));
    for (const id of mounts) add(id);
    for (const line of recipeMaterials) if (mounts.has(Number(line.outputItemId))) add(line.inputItemId);
    return [...ids].sort();
}

export function islandMarketCities(cities) {
    return cities.filter(row => row.isActive && row.marketApiName).map(row => row.marketApiName);
}
