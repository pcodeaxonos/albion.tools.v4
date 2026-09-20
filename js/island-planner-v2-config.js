export const V2_STORAGE_KEY = 'albiontools.v4.island-planner-v2.draft';
export const V2_COMMITTED_STORAGE_KEY = 'albiontools.v4.island-planner-v2.committed';
export const V2_GEOMETRY_URL = './data/island-planner-v2-royal-slot-geometry.json';

export const V2_CITIES = ['martlock', 'thetford', 'fort_sterling', 'lymhurst', 'bridgewatch', 'brecilien', 'caerleon'];
export const V2_ROYAL_CITIES = new Set(['martlock', 'thetford', 'fort_sterling', 'lymhurst', 'bridgewatch']);

// Intentionally empty: the handoff explicitly leaves these datasets unresolved.
export const V2_UNLOCKED_SLOTS_BY_LEVEL = null;
export const V2_SPECIAL_CITY_GEOMETRY = Object.freeze({ brecilien: null, caerleon: null });
