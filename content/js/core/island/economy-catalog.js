import { getPlants, getAnimals } from '../catalog.js';
import { islandPlotsByLevel } from './economy-config.js';
import { getAll } from '../../db/store.js';
import { islandMarketItemIds } from './market-scope.mjs';

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
    return islandMarketItemIds({ plants: getAll('plants'), animals: getAll('animals'),
        items: getAll('items'), recipeMaterials: getAll('recipeMaterials') });
}
