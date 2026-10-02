import { getPlants } from '../catalog.js';

/** Intentional favourite-feed policy; non-fixed animals retain crop-only choices. */
export function feedPlants(animal) {
    if (animal.feedDiet !== 'plants') return [];
    const crops = getPlants({ kind: 'crop' });
    return animal.feedFixed
        ? crops.filter((crop) => crop.plantId === animal.feedPlantId)
        : crops;
}

/** Catalog quantities encode normal and favourite nutrition requirements. */
export function animalForFeed(animal, plant) {
    const favourite = animal.kind === 'livestock' && plant?.plantId === animal.feedPlantId;
    return { ...animal, feedQty: favourite ? animal.feedQtyPasture : animal.feedQtyIsland };
}
