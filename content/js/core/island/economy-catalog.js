import { getPlants, getAnimals } from '../catalog.js';
import { islandPlotsByLevel } from './economy-config.js';

function islandAnimal(row) {
    return {
        ...row,
        feedQty: row.feedQtyIsland
    };
}

export function listCrops() {
    return getPlants({ kind: 'crop' });
}

export function listHerbs() {
    return getPlants({ kind: 'herb' });
}

export function listLivestock() {
    return getAnimals({ kind: 'livestock' }).map(islandAnimal);
}

export function listPastureMounts() {
    return getAnimals({ kind: 'mount', plotType: 'pasture' }).map(islandAnimal);
}

export function listKennelMounts() {
    return getAnimals({ kind: 'mount', plotType: 'kennel' }).map(islandAnimal);
}

export function listFactionMounts() {
    return getAnimals({ kind: 'faction-mount' }).map(islandAnimal);
}

export function listAllAnimals() {
    return getAnimals().map(islandAnimal);
}

export function listAllPlants() {
    return getPlants();
}

export const CROPS = listCrops;
export const HERBS = listHerbs;
export const LIVESTOCK = listLivestock;
export const PASTURE_MOUNTS = listPastureMounts;
export const KENNEL_MOUNTS = listKennelMounts;
export const ALL_ANIMALS = listAllAnimals;
export const ALL_PLANTS = listAllPlants;

export function plotsForLevel(level) {
    const map = islandPlotsByLevel();
    const n = map[level];
    return Number.isFinite(n) ? n : map[6];
}

export function factionMountForCity(city, tier = 5) {
    const t = Number(tier) || 5;
    return listFactionMounts().find((animal) => animal.factionCity === city && animal.tier === t) ?? null;
}

export function allPriceItemIds() {
    const ids = new Set();
    for (const item of listAllPlants()) {
        ids.add(item.seedId);
        ids.add(item.plantId);
    }
    for (const item of listAllAnimals()) {
        ids.add(item.babyId);
        ids.add(item.grownId);
        if (item.meatId) {
            ids.add(item.meatId);
        }
        if (item.productId) {
            ids.add(item.productId);
        }
        if (item.feedSeedId) {
            ids.add(item.feedSeedId);
        }
        if (item.feedPlantId) {
            ids.add(item.feedPlantId);
        }
    }
    for (let t = 3; t <= 8; t += 1) {
        ids.add(`T${t}_MEAT`);
    }
    return [...ids];
}
